package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// appendAccessorEffects connects property evaluation to the accessor that executes. Accessors
// retain separate callable identities so creating their owner does not execute their bodies.
func appendAccessorEffects(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, typeChecker *checker.Checker, owner *executableBodyOwner) {
	appendBoundAccessorEffects(fact, node, targets, source, typeChecker, nil, owner)
}

// appendBoundAccessorEffects preserves accessor execution through source-owned argument substitution.
func appendBoundAccessorEffects(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner) {
	// The normal binding producer acquires value and effects together once.
	if normalGetBinding(node, fact.node, fact.normalInputs, typeChecker) {
		return
	}
	var candidates accessorCandidates
	read, write := false, false
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		read, write = accessorEvaluationMode(node)
	}
	if (read || write) && fact.normalInputs != nil {
		query := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool), inputs: fact.normalInputs, reading: node, operation: &sourceOperationContext{node: node, owner: fact.node, inputs: fact.normalInputs}}
		query.returnObservation = &sourceReturnObservation{owner: fact.node, reader: node, frame: fact.normalInputs, receipts: fact.nativeCalls, normalCalls: fact.normalCalls}
		if read && !write {
			candidates = query.consumeNormalGet(node, fact.normalInputs.bindings)
			if c := fact.normalInputs.initializerCursor; c != nil {
				slot := query.normalOperation(node, false)
				observed := sourceResultObservation{}
				kind := initializerObservationAbsent
				if slot != nil && (slot.state == sourceOperationConsumed || slot.state == sourceOperationRefused) {
					observed = normalGetOutput(slot)
					kind = initializerObservationFinalized
				}
				c.observe(node, observed, kind)
			}
		} else {
			finish := query.normalWork(&candidates, node)
			candidates = query.evaluatedSourceAccessors(node, fact.normalInputs.bindings)
			finish()
		}
	} else {
		candidates = evaluatedSourceAccessors(node, typeChecker, bindings, owner, fact.node, nil)
	}
	if read || write {
		var inputs sourceValueBindings
		if fact.normalInputs != nil {
			inputs = fact.normalInputs.bindings
		}
		candidates = refineSourceDependencies(candidates, func() accessorCandidates {
			return sourceMemberDependencies(node, typeChecker, owner, fact.node, inputs)
		})
	}
	appendOwnedGetFact(fact, node, candidates, targets, source, typeChecker)
}

// retainCallableEffect keeps selector identity available to acquisition consumers
// while publishing execution provenance only at the operation's effect producer.
func (candidates *accessorCandidates) retainCallableEffect(operation, declaration *ast.Node) {
	candidates.declarations = append(candidates.declarations, declaration)
	candidates.effects = append(candidates.effects, sourceCallableEffect{operation: operation, declaration: declaration})
}

// appendAccessorTargets consumes producer-owned contributions. In particular, a
// return observer's selected declaration cannot become a body execution edge.
// Nested calls keep their own operation, not the enclosing consumer's location.
func appendAccessorTargets(fact *callableFacts, node *ast.Node, candidates accessorCandidates, targets map[*ast.Node]int, source *ast.SourceFile) {
	for _, producer := range candidates.producers {
		if index, exists := targets[producer]; exists {
			fact.targets = append(fact.targets, index)
			source := ast.GetSourceFileOfNode(producer)
			fact.summary.Calls = append(fact.summary.Calls, CallEdge{ID: fmt.Sprintf("%s:dependency:%d", fact.summary.ID, producer.Pos()), TargetID: fmt.Sprintf("callable:%s:%d", source.FileName(), producer.Pos()), Resolved: true})
		}
	}
	seen := make(map[sourceCallableEffect]bool)
	for _, contribution := range candidates.effects {
		if seen[contribution] {
			continue
		}
		seen[contribution] = true
		declaration := contribution.declaration
		if declaration == nil || !ast.IsFunctionLike(declaration) {
			continue
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if owner == nil || owner.IsDeclarationFile {
			continue
		}
		operation := contribution.operation
		if operation == nil {
			operation = node
		}
		operationSource := ast.GetSourceFileOfNode(operation)
		if operationSource == nil {
			operationSource = source
		}
		targetID := fmt.Sprintf("callable:%s:%d", owner.FileName(), declaration.Pos())
		edge := CallEdge{ID: fmt.Sprintf("%s:accessor:%s:%d:%s", fact.summary.ID, operationSource.FileName(), operation.Pos(), targetID), Name: strings.TrimSpace(sourceText(operationSource, operation)), Resolved: true, TargetID: targetID}
		duplicate := false
		for _, existing := range fact.summary.Calls {
			duplicate = duplicate || existing.ID == edge.ID
		}
		if duplicate {
			continue
		}
		fact.summary.Calls = append(fact.summary.Calls, edge)
		if contribution.operation != nil {
			if fact.fieldEdgeOperations == nil {
				fact.fieldEdgeOperations = make(map[string]*ast.Node)
			}
			fact.fieldEdgeOperations[edge.ID] = contribution.operation
		}
		if index, exists := targets[declaration]; exists {
			fact.targets = append(fact.targets, index)
		}
	}
}

// accessorEvaluationMode preserves JavaScript's read/write distinctions. Deletion evaluates
// neither accessor, assignment invokes only a setter, and updates or compound assignments use both.
func accessorEvaluationMode(node *ast.Node) (bool, bool) {
	current := node
	for current.Parent != nil && unwrapSourceCallableReference(current.Parent) == node {
		current = current.Parent
	}
	// The native classifier distinguishes the actual destination from its
	// receiver, computed key and default expressions, which remain reads.
	if nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
		return false, true
	}
	parent := current.Parent
	if parent == nil {
		return true, false
	}
	if ast.IsDeleteExpression(parent) {
		return false, false
	}
	if ast.IsAssignmentExpression(parent, false) && parent.AsBinaryExpression().Left == current {
		return parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken, true
	}
	if ast.IsPrefixUnaryExpression(parent) {
		operator := parent.AsPrefixUnaryExpression().Operator
		if operator == ast.KindPlusPlusToken || operator == ast.KindMinusMinusToken {
			return true, true
		}
	}
	if ast.IsPostfixUnaryExpression(parent) {
		return true, true
	}
	return true, false
}

// appendOpaqueAccessorEffect prevents a bounded search from proving unavailable execution portable.
func appendOpaqueAccessorEffect(fact *callableFacts, candidates accessorCandidates) {
	appendCoverageOpacity := true
	if candidates.prefixCoverage != nil {
		settled, fresh := settlePrefixRefusalCoverage(fact, candidates)
		if settled {
			appendCoverageOpacity = fresh
		} else {
			candidates.opaque, candidates.valueIncomplete = true, true
			candidates.closedPrefixReason = "source prefix coverage unavailable"
		}
	}
	mergeOwnedGets(&fact.ownedGetResults, candidates.ownedGets)
	for _, call := range candidates.fieldCalls {
		fact.fieldCalls = append(fact.fieldCalls, cloneSourceFieldCall(call))
	}
	for _, origin := range candidates.descriptorFallbacks {
		origin := origin
		description := "reflective descriptor conversion requires actual caller prefix"
		if origin.operation != nil {
			if source := ast.GetSourceFileOfNode(origin.operation); source != nil {
				description = fmt.Sprintf("%s at %s:%d", description, source.FileName(), origin.operation.Pos())
			}
		}
		effect := environmentSource("unknown", description, fact.summary.Name)
		effect.Opaque, effect.provenanceIncomplete, effect.descriptorOrigin = true, true, &origin
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
	}
	for _, fallback := range candidates.callFallbacks {
		fallback := fallback
		effect := environmentSource("unknown", "unresolved callee selection", fact.summary.Name)
		effect.Opaque, effect.provenanceIncomplete, effect.callOrigin = true, true, &fallback
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
	}
	for _, demand := range candidates.fieldFallbacks {
		demand := demand
		effect := environmentSource("unknown", "accessor provenance incomplete", fact.summary.Name)
		effect.Opaque, effect.provenanceIncomplete, effect.fieldOrigin = true, true, &demand
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
	}
	fact.ownedObligations = append(fact.ownedObligations, candidates.owned...)
	fact.thenReferences = append(fact.thenReferences, candidates.thenReferences...)
	fact.thenIncomplete = fact.thenIncomplete || candidates.thenIncomplete
	if candidates.opaque && appendCoverageOpacity {
		description := "accessor provenance incomplete"
		if candidates.closedPrefixReason != "" {
			description = candidates.closedPrefixReason
		}
		if candidates.cause != nil {
			if source := ast.GetSourceFileOfNode(candidates.cause); source != nil {
				description = fmt.Sprintf("%s at %s:%d", description, source.FileName(), candidates.cause.Pos())
			}
		}
		effect := environmentSource("unknown", description, fact.summary.Name)
		effect.Opaque = true
		effect.provenanceIncomplete = true
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
	}
}

// accessorReceiver resolves source spelling while keeping dynamic keys conservative.
func accessorReceiver(node *ast.Node) (*ast.Node, string) {
	if ast.IsPropertyAccessExpression(node) {
		return node.AsPropertyAccessExpression().Expression, node.AsPropertyAccessExpression().Name().Text()
	}
	member := node.AsElementAccessExpression()
	return member.Expression, sourceLiteralMemberName(member.ArgumentExpression)
}

// sourceLiteralMemberName keeps an evaluated comma prefix separate from its finite key.
// Callers still visit the complete expression for receiver, key and RHS execution effects.
func sourceLiteralMemberName(node *ast.Node) string { return sourceMemberKey(node).name }

// sourceKeySelection classifies an already evaluated key's finite spelling. It
// grants no activation or absence. Original inputs/scope remain on the actual
// acquisition owner, and prefix effects stay on the existing normal walk.
type sourceKeySelection struct {
	name     string
	resolved bool
}

func sourceMemberKey(node *ast.Node) sourceKeySelection {
	node = unwrapSourceCallableReference(node)
	for node != nil && ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindCommaToken {
		node = unwrapSourceCallableReference(node.AsBinaryExpression().Right)
	}
	if node != nil && (ast.IsStringLiteral(node) || ast.IsNumericLiteral(node)) {
		return sourceKeySelection{name: node.Text(), resolved: true}
	}
	return sourceKeySelection{}
}

// reflectiveMemberValue retains a literal descriptor's actual callable value as
// a possible source method. Reflective execution still remains opaque. This is
// not an Object.defineProperty identity or mutation-completion certificate.
func (query *sourceValueQuery) reflectiveMemberValue(origin *ast.Node, projection []string, name string, node *ast.Node, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) (*ast.Node, bool) {
	return query.reflectiveMemberValueAtGet(origin, projection, name, node, mode, bindings, result, nil)
}

func (query *sourceValueQuery) reflectiveMemberValueAtGet(origin *ast.Node, projection []string, name string, node *ast.Node, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, actualGet *sourceGetInputs) (*ast.Node, bool) {
	native := actualGet != nil && actualGet.receiver.native != nil
	if !query.charge(result, node) || query.active[node] || !native && query.afterRead(node) {
		return nil, false
	}
	call := node.AsCallExpression()
	receiver, method := restrictedInvocationMember(call.Expression, query.owner.checker)
	descriptorCall := method == "defineProperty" && ast.IsIdentifier(receiver) && (receiver.Text() == "Object" || receiver.Text() == "Reflect") && standardLibraryCallRoot(call.Expression, query.owner.checker) && call.Arguments != nil && len(call.Arguments.Nodes) == 3
	if !descriptorCall && (!native || !resolvedReflectiveMutation(call.Expression, query.owner.checker, map[ast.SymbolId]bool{})) {
		return nil, false
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return nil, false
	}
	args := restrictedInvocationArguments(call)
	if !descriptorCall {
		_, args, _ = restrictedCallArguments(call.Expression, args, query.owner.checker, map[ast.SymbolId]bool{})
	}
	if len(args) < 2 {
		result.opaque = true
		return nil, true
	}
	selected := unwrapSourceCallableReference(args[1])
	selectedKey := sourceLiteralMemberName(selected)
	if actualGet != nil && actualGet.symbol != nil && selectedKey != "" {
		return nil, false
	}
	if selectedKey != "" && selectedKey != key {
		return nil, false
	}
	if selectedKey == "" {
		result.opaque = true
	}
	if query.deferredCandidateExcluded(node, result) {
		return nil, false
	}
	_, possible := query.moduleWriteProducer(node, bindings)
	if !possible {
		return nil, false
	}
	matching := false
	temporary := accessorCandidates{}
	prototype := false
	values := query.occurrenceOrigins(args[0], node, origin, bindings, &temporary)
	disjoint := len(values) > 0 && !temporary.opaque && !temporary.valueIncomplete && !temporary.receiverIncomplete
	prototypeOnly := disjoint
	for _, value := range values {
		same := value.node == origin && len(value.path) == 0
		if native {
			same = query.nativeReceiverMatches(value, actualGet.descriptorReceiver())
		}
		matching = matching || same
		prototype = prototype || sourceFunctionPrototype(value, query.owner.checker) && query.sourceCallableImplementation(origin, result)
		prototypeOnly = prototypeOnly && sourceFunctionPrototype(value, query.owner.checker)
		// Fresh source allocations and distinct acquired native entries cannot
		// be this selected standard object. An unresolved origin is not disjoint.
		different := value.node != nil && len(value.path) == 0 && (ast.IsObjectLiteralExpression(value.node) || ast.IsArrayLiteralExpression(value.node) || ast.IsFunctionExpression(value.node) || ast.IsArrowFunction(value.node))
		if native && value.native != nil {
			different = value.native.kind != actualGet.receiver.native.kind
		}
		disjoint = disjoint && different
	}
	if actualGet != nil && actualGet.ownConditional && prototypeOnly {
		// Bind tests the target's own length before performing Get. There
		// is no user operation between those steps for an ordinary source
		// function. Unknown targets remain possible above.
		return nil, false
	}
	matching = matching || prototype
	if !matching {
		if disjoint {
			return nil, false
		}
		// This relevant receiver/key route has not been excluded. Its actual
		// getter bodies remain may-effects, while identity stays incomplete.
		result.opaque = true
	}
	// The existing reflective mutation owner also recognizes delete/set and
	// multi-descriptor forms. Without a descriptor value they invalidate this
	// member alternative after target/key relevance, without inventing a result.
	if !descriptorCall {
		return nil, true
	}
	descriptor := unwrapSourceCallableReference(args[2])
	if !ast.IsObjectLiteralExpression(descriptor) {
		return nil, true
	}
	var value *ast.Node
	for _, member := range descriptor.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
			return nil, true
		}
		field := callableNameText(member.Name())
		if field == "get" || field == "set" {
			// A possible descriptor never supplies replacement certainty. Its known
			// accessor body still belongs to every actual Get or Set that can reach it.
			body := member
			if ast.IsPropertyAssignment(member) {
				body = unwrapSourceCallableReference(member.Initializer())
			}
			get := field == "get" && mode&accessorNoGet == 0
			set := field == "set" && mode&accessorSet != 0 && mode != accessorSetAcquire
			if (get || set) && ast.IsFunctionLike(body) && body.Body() != nil {
				operation := node
				if actualGet != nil {
					operation = actualGet.operation
				}
				result.retainCallableEffect(operation, body)
				// A selected setter keeps its generic effect owner. The actual Get
				// carrier supplies no assigned RHS or zero-argument Set authority.
				if get && actualGet != nil {
					scope := query.acquireCallableScope(bindings, result)
					if get && mode == accessorAcquire {
						observed := query.acquireGetResult(body, actualGet, scope, result)
						result.opaque = result.opaque || observed.incomplete
						for _, returned := range observed.values {
							if result.callableScopes == nil {
								result.callableScopes = make(map[int]acquiredCallableScope)
							}
							result.callableScopes[len(result.values)] = returned.scope
							value := returned.value
							value.acquired = &returned
							result.values = append(result.values, value)
						}
					} else {
						query.executeGetEffects(body, actualGet, scope, result)
					}
				} else if get && query.nativePromiseDeclaration(origin) {
					actual := sourceValue{node: origin, native: &sourceNativeValue{kind: sourceNativePromiseConstructor, acquired: query.reading}}
					query.executeGetEffects(body, &sourceGetInputs{operation: node, receiver: actual}, query.acquireCallableScope(bindings, result), result)
				} else {
					query.execute(body, bindings, result, nil)
				}
			}
			continue
		}
		// A descriptor method is its data-slot callable, not a getter to execute here.
		if field == "value" && ast.IsMethodDeclaration(member) {
			value = member
			continue
		}
		if !ast.IsPropertyAssignment(member) {
			return nil, true
		}
		if field == "value" {
			value = member.Initializer()
		}
	}
	return value, true
}

// sourceFunctionPrototype recognizes only binder-owned standard prototype origins.
// It supplies a possible interference edge, never descriptor contents or identity.
func sourceFunctionPrototype(value sourceValue, c *checker.Checker) bool {
	if value.native != nil && value.native.kind == sourceNativeFunctionPrototype && len(value.path) == 0 {
		return true
	}
	if value.node == nil || !ast.IsIdentifier(value.node) || len(value.path) != 1 || value.path[0] != "prototype" {
		return false
	}
	if value.node.Text() != "Function" && value.node.Text() != "Object" {
		return false
	}
	symbol := c.GetSymbolAtLocation(value.node)
	return symbol != nil && symbol.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration))
}
