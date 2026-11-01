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
	if fact.normalInputs == nil {
		candidates = sourceMemberDependencies(node, typeChecker, owner, fact.node, nil)
		appendOwnedGetFact(fact, node, candidates, targets, source, typeChecker)
		return
	}
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
	seen := make(map[sourceCallableEffect]int)
	for _, contribution := range candidates.effects {
		declaration := contribution.declaration
		if declaration == nil || !ast.IsFunctionLike(declaration) {
			continue
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if owner == nil || owner.IsDeclarationFile {
			continue
		}
		key := contribution
		key.receivers = nil
		bindings := contribution.receiverBindings(fact.node)
		if index, exists := seen[key]; exists {
			fact.summary.Calls[index].ReceiverBindings = joinSourceReceiverBindings(fact.summary.Calls[index].ReceiverBindings, bindings)
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
		edge.ReceiverBindings = joinSourceReceiverBindings(nil, bindings)
		prior := -1
		for index, existing := range fact.summary.Calls {
			if existing.ID == edge.ID {
				prior = index
				break
			}
		}
		if prior >= 0 {
			// An earlier phase already published this operation. Join its
			// receiver alternatives and retain the actual existing edge index.
			seen[key] = prior
			fact.summary.Calls[prior].ReceiverBindings = joinSourceReceiverBindings(fact.summary.Calls[prior].ReceiverBindings, bindings)
			continue
		}
		seen[key] = len(fact.summary.Calls)
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
	fact.callOutcomes = append(fact.callOutcomes, candidates.callOutcomes...)
	fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, candidates.environmentEffects...)
	fact.directContext = append(fact.directContext, candidates.contextEffects...)
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
		description := "unresolved callee selection"
		if fallback.phase == sourceReturnRelationship {
			description = "exact return output unavailable"
		}
		if fallback.phase == sourceArgumentRelationship {
			description = "exact argument output unavailable"
		}
		effect := environmentSource("unknown", description, fact.summary.Name)
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
	if candidates.opaque {
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

// reflectiveMemberValuesAtGet keeps each source writer Call's target, key and
// descriptor contributions in the same symbolic scope. Normal descriptor reads
// retain their original owner. Projecting inputs does not replay the writer.
func (query *sourceValueQuery) reflectiveMemberValuesAtGet(origin *ast.Node, projection []string, name string, node *ast.Node, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, actualGet *sourceGetInputs, cut *sourceMemberWriterReadCut) ([]sourceValue, bool) {
	if !query.dependenciesOnly || query.operation != nil || query.returnObservation != nil || query.installedReceiverCall != nil || query.callerInputs != nil || query.inputs != nil && query.inputs.operationLifetime != nil {
		value, possible := query.reflectiveMemberValueInScope(origin, projection, name, node, mode, bindings, result, actualGet, nil, nil)
		if value != nil {
			return []sourceValue{{node: value}}, possible
		}
		return nil, possible
	}
	// Allocation association is the reader's already-acquired receiver scope,
	// distinct from the original consumer cut used only for ordering.
	receiverScope := query.acquireCallableScope(bindings, result)
	if actualGet != nil && actualGet.receiver.capture != nil {
		receiverScope = query.copyCallableScope(*actualGet.receiver.capture, result)
	}
	var values []sourceValue
	possible := false
	for _, row := range query.memberWriterInputs(node, bindings, result, cut) {
		query.memberWriterScope(row, func() {
			part := accessorCandidates{}
			value, may := query.reflectiveMemberValueInScope(origin, projection, name, node, mode, row.scope.bindings, &part, actualGet, &row, &receiverScope)
			possible = possible || may
			if may && row.incomplete {
				part.opaque = true
				part.valueIncomplete = true
			}
			projected := part.values
			part.values = nil
			for i := range projected {
				if scope, ok := part.callableScopes[i]; ok {
					projected[i].capture = &scope
				}
			}
			part.callableScopes = nil
			if value != nil {
				projected = append(projected, query.originsAt(value, node, row.scope.bindings, &part)...)
			}
			mergeAccessorCandidates(result, part)
			for _, term := range projected {
				if len(projection) > 1 {
					term.path = append(term.path, projection[1:]...)
				}
				if term.capture == nil {
					scope := row.scope
					term.capture = &scope
				}
				values = append(values, term)
			}
		})
	}
	return values, possible
}

// reflectiveTargetValues demands only a source return relationship. The target
// Call's input/default/callee effects remain owned by that earlier operation.
// Partial or unsupported outputs keep the raw target beside returned captures.
func (query *sourceValueQuery) reflectiveTargetValues(values []sourceValue, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	var projected []sourceValue
	for _, target := range values {
		if target.node == nil || !ast.IsCallExpression(target.node) || len(target.path) != 0 {
			projected = append(projected, target)
			continue
		}
		func() {
			reading, initializing, returning, creators := query.reading, query.initializing, query.returning, query.creators
			defer func() {
				query.reading, query.initializing, query.returning, query.creators = reading, initializing, returning, creators
			}()
			query.reading, query.initializing, query.returning = target.node, target.node, nil
			targetBindings := bindings
			if target.capture != nil {
				targetBindings = target.capture.bindings
				query.creators = target.capture.creators
			}
			start := len(projected)
			part := query.projectSourceCallReturns(target.node, targetBindings, func(term sourceValue, bound sourceValueBindings) {
				if term.capture == nil {
					scope := query.acquireCallableScope(bound, result)
					term.capture = &scope
				}
				projected = append(projected, term)
			}, func() { result.valueIncomplete = true })
			unresolved := part.opaque || part.valueIncomplete || part.receiverIncomplete || part.fieldReceiverIncomplete || part.thenIncomplete || len(projected) == start
			result.opaque = result.opaque || part.opaque
			result.valueIncomplete = result.valueIncomplete || unresolved
			result.receiverIncomplete = result.receiverIncomplete || part.receiverIncomplete
			result.fieldReceiverIncomplete = result.fieldReceiverIncomplete || part.fieldReceiverIncomplete
			result.thenIncomplete = result.thenIncomplete || part.thenIncomplete
			if unresolved {
				projected = append(projected, target)
			}
		}()
	}
	return projected
}

func (query *sourceValueQuery) reflectiveMemberValueInScope(origin *ast.Node, projection []string, name string, node *ast.Node, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, actualGet *sourceGetInputs, input *sourceMemberWriterInput, receiverScope *acquiredCallableScope) (*ast.Node, bool) {
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
	if input != nil && len(projection) > 0 {
		key = projection[0]
	} else if len(projection) == 1 && name == "" {
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
	if input != nil && selectedKey == "" {
		keyPart := accessorCandidates{}
		keys := query.originsAt(args[1], node, bindings, &keyPart)
		mergeAccessorCandidates(result, keyPart)
		for i, keyValue := range keys {
			key := sourceLiteralMemberName(unwrapSourceCallableReference(keyValue.node))
			if key == "" || len(keyValue.path) != 0 || i > 0 && key != selectedKey {
				selectedKey = ""
				break
			}
			selectedKey = key
		}
	}
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
	possible := true
	// A projected row is only a MAY alternative. This descriptor fallback never
	// publishes strong replacement. Other paths retain their existing producer law.
	if input == nil || input.call == nil {
		_, possible = query.moduleWriteProducer(node, bindings)
	}
	if !possible {
		return nil, false
	}
	matching := false
	temporary := accessorCandidates{}
	prototype := false
	values := query.occurrenceOrigins(args[0], node, origin, bindings, &temporary)
	if input != nil {
		values = query.reflectiveTargetValues(values, bindings, &temporary)
		result.opaque = result.opaque || temporary.opaque
		result.valueIncomplete = result.valueIncomplete || temporary.valueIncomplete
		result.receiverIncomplete = result.receiverIncomplete || temporary.receiverIncomplete
		result.fieldReceiverIncomplete = result.fieldReceiverIncomplete || temporary.fieldReceiverIncomplete
		result.thenIncomplete = result.thenIncomplete || temporary.thenIncomplete
	}

	disjoint := len(values) > 0 && !temporary.opaque && !temporary.valueIncomplete && !temporary.receiverIncomplete
	prototypeOnly := disjoint
	for _, value := range values {
		same := value.node == origin && len(value.path) == 0
		qualifiedDifferent := false
		if input != nil && receiverScope != nil && !native {
			allocation := origin
			if actualGet != nil && actualGet.receiver.node != nil && ast.IsNewExpression(actualGet.receiver.node) {
				allocation = actualGet.receiver.node
			}
			factory := enclosingCallableNode(allocation)
			readerCall := receiverScope.creators[factory].invocation
			if factory != nil && readerCall != nil {
				owned := ast.IsObjectLiteralExpression(allocation) || ast.IsArrayLiteralExpression(allocation) || query.sourceConstructedDataSlot(allocation, key, receiverScope.bindings)
				if owned {
					same = same || query.sourceCreatorValue(value, factory, readerCall)
					if value.node == allocation && len(value.path) == 0 && value.capture != nil && value.capture.creators[factory].invocation != nil {
						same = query.sourceCreatorValue(value, factory, readerCall)
						qualifiedDifferent = !same
					}
				}
			}
		}
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
		different = different || qualifiedDifferent
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
				if input != nil && query.dependenciesOnly && get {
					// Uncorrelated source Get projects free captures, never an actual receiver
					// or an output receipt. Arrow this remains lexical in bindGetInputs.
					var sourceOperation *ast.Node
					sourceReceiver := sourceValue{}
					if actualGet != nil && actualGet.operation != nil && (ast.IsPropertyAccessExpression(actualGet.operation) || ast.IsElementAccessExpression(actualGet.operation)) {
						_, observedKey := accessorReceiver(actualGet.operation)
						if observedKey != "" && observedKey == key {
							sourceOperation = actualGet.operation
							sourceReceiver = actualGet.receiver
						}
					}
					inputs := query.bindGetInputs(body, sourceOperation, sourceReceiver, bindings, result)
					result.opaque = true
					result.retainCallableEffect(sourceOperation, body)
					query.consumeSourceBodyEffects(sourceOperation, body, inputs.bindings, inputs, nil, result)
					query.projectSelectedSourceReturns(body, sourceOperation, inputs.bindings, inputs, result, func(term sourceValue, bound sourceValueBindings) {
						scope := query.acquireCallableScope(bound, result)
						term.capture = &scope
						result.values = append(result.values, term)
					}, func() { result.valueIncomplete = true })
					continue
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
							if input != nil && query.dependenciesOnly {
								scope := returned.scope
								value.capture = &scope
							} else {
								value.acquired = &returned
							}
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
		if input != nil && query.dependenciesOnly && field == "value" && ast.IsShorthandPropertyAssignment(member) {
			value = member.Name()
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
