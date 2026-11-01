package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceReturnObservation is scoped to one completing return and its normal
// operation receipts. Pointers select result storage, never dynamic activation.
// The substitution path is input to a separate complete reference inventory.
type sourceReturnKind uint8

const (
	sourceCompletingSettlement sourceReturnKind = iota
	sourceRawNormalResult
)

type sourceReturnObservation struct {
	kind          sourceReturnKind
	owner, reader *ast.Node
	receipts      []*sourceNativeInvocation
	normalCalls   []*sourceInvocationResult
	frame         *sourceValueInputs
	path          []*ast.Node
}

// observeNativeAwait consumes only this frame's actual Await output. Selecting
// a successful value cannot enroll another constructor/Get or execute a body.
func (query *sourceValueQuery) observeNativeAwait(awaited *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	context := query.returnObservation
	if context == nil || context.frame == nil || context.frame != query.inputs || context.owner != enclosingCallableNode(awaited) {
		result.opaque = true
		return
	}
	for _, receipt := range context.frame.awaits {
		if !query.charge(result, awaited) {
			return
		}
		if receipt.operation != awaited || receipt.owner != context.owner {
			continue
		}
		result.opaque = result.opaque || receipt.observed.incomplete
		for _, observed := range receipt.observed.values {
			if !query.charge(result, awaited) {
				return
			}
			observed.value.forwarded = query.forwardingTrace(result, observed.value.forwarded, context.path)
			if result.callableScopes == nil {
				result.callableScopes = make(map[int]acquiredCallableScope)
			}
			result.callableScopes[len(result.values)] = query.copyCallableScope(observed.scope, result)
			result.values = append(result.values, observed.value)
		}
		return
	}
	result.opaque = true
	result.cause = awaited
}

// privateAwaitForwarding closes only a native operation's fresh data input and
// observed local forwarding chain. Every source reference is inventoried. A
// field value can be read without transferring the envelope. Other references,
// unaccounted captures, writes, eval and exhaustion refuse rather than pruning.
func (query *sourceValueQuery) privateAwaitForwarding(value sourceValue, result *accessorCandidates) bool {
	receipt := value.awaited
	context := query.returnObservation
	if receipt == nil || context == nil || !receipt.privateInput || receipt.observed.incomplete || receipt.owner != context.owner || len(value.path) != 0 || !ast.IsObjectLiteralExpression(value.node) {
		return false
	}
	return query.privateNativeForwarding(value, context.owner, context.reader, result)
}

// privateNativeForwarding inventories the actual acquired envelope between explicit
// producing and consuming owners. It grants no return or activation category.
func (query *sourceValueQuery) privateNativeForwarding(value sourceValue, owner, reader *ast.Node, result *accessorCandidates) bool {
	return query.privateNativeForwardingAt(value, owner, reader, nil, result)
}

// privateNativeForwardingAt accepts only the selected normal operand's installed
// endpoint in place of its absent saved creator. Every other capture still needs
// its own actual creating relation. The endpoint grants no authority to siblings.
func (query *sourceValueQuery) privateNativeForwardingAt(value sourceValue, owner, reader *ast.Node, endpoint *sourceNormalValue, result *accessorCandidates) bool {
	admittedOwner := func(lexical *ast.Node) bool {
		if lexical == owner {
			return true
		}
		if lexical == nil || ast.HasSyntacticModifier(lexical, ast.ModifierFlagsAsync) {
			return false
		}
		if creator := query.creators[lexical]; creator.invocation != nil && ast.IsCallExpression(creator.invocation) {
			return true
		}
		return endpoint != nil && endpoint.owner == owner && endpoint.observed.inputs != nil &&
			endpoint.observed.inputs.declaration == owner && endpoint.installed != nil &&
			endpoint.installed == query.inputs && endpoint.installed.declaration == lexical &&
			endpoint.installed.invocation != nil && ast.IsCallExpression(endpoint.installed.invocation) &&
			enclosingCallableNode(endpoint.installed.invocation) == owner
	}
	receipt := value.awaited
	if receipt == nil || !receipt.privateInput || receipt.observed.incomplete || receipt.owner != owner || reader == nil || len(value.path) != 0 || !ast.IsObjectLiteralExpression(value.node) {
		return false
	}
	allowed := make(map[*ast.Node]bool)
	binders := make(map[ast.SymbolId]bool)
	fields := make(map[string]bool)
	for _, field := range value.node.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, field) || !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || !sourcePrimitiveValue(field.Initializer()) {
			return false
		}
		if callableNameText(field.Name()) == "__proto__" {
			return false
		}
		fields[callableNameText(field.Name())] = true
	}
	for _, node := range value.forwarded {
		if !query.charge(result, node) {
			return false
		}
		mutation := planMutationOperation(node)
		switch mutation.kind {
		case mutationCompound, mutationPrefix, mutationPostfix, mutationDelete:
			return false
		}
		if mutation.kind == mutationAssign && ast.IsBinaryExpression(node) {
			target := mutation.target
			if target != nil && ast.IsObjectLiteralExpression(target) && nativeAssignmentTargetRole(target) == nativeAssignmentPattern {
				lexical := enclosingCallableNode(node)
				if !admittedOwner(lexical) {
					return false
				}
				if !query.privateAssignmentPatternReads(target, value, fields, result) {
					return false
				}
				// The assignment returns the envelope, but each destination receives
				// only a primitive own field. Ordinary PutValue still owns its effects.
				continue
			}
			if target == nil || !ast.IsIdentifier(target) {
				return false
			}
			symbol := query.owner.checker.GetSymbolAtLocation(target)
			if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
				return false
			}
			lexical := enclosingCallableNode(symbol.ValueDeclaration)
			if lexical == nil || lexical != enclosingCallableNode(node) {
				return false
			}
			if !admittedOwner(lexical) {
				return false
			}
			// Complete inventory includes the destination binder and its later
			// uses. The RHS's traced occurrence alone cannot close publication.
			binders[ast.GetSymbolId(symbol)] = true
			allowed[target] = true
		}
		if node == nil || !ast.IsIdentifier(node) {
			continue
		}
		symbol := query.owner.checker.GetSymbolAtLocation(node)
		if symbol != nil && symbol.ValueDeclaration != nil && ast.IsParameterDeclaration(symbol.ValueDeclaration) {
			return false
		}
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			continue
		}
		declaration := symbol.ValueDeclaration
		lexical := enclosingCallableNode(declaration)
		if !admittedOwner(lexical) {
			return false
		}
		binders[ast.GetSymbolId(symbol)] = true
		allowed[node] = true
	}
	if endpoint != nil && !query.inventoryNormalResultEndpoints(value, endpoint, fields, result, binders, allowed) {
		return false
	}
	if len(binders) == 0 { // Direct return await has no local envelope binder.
		return true
	}
	index := query.owner.index(ast.GetSourceFileOfNode(reader))
	if index.incomplete {
		return false
	}
	for lexical, region := range index.operationRegions {
		if lexical == nil || !owner.Contains(lexical) {
			continue
		}
		for _, member := range region.members {
			if !query.charge(result, member) {
				return false
			}
			if ast.IsCallExpression(member) {
				target := unwrapSourceCallableReference(member.AsCallExpression().Expression)
				if ast.IsIdentifier(target) && target.Text() == "eval" {
					return false
				}
			}
		}
		for _, reference := range region.references {
			if !query.charge(result, reference) {
				return false
			}
			symbol := query.owner.checker.GetSymbolAtLocation(reference)
			if symbol == nil || !binders[ast.GetSymbolId(symbol)] {
				continue
			}
			if !admittedOwner(lexical) {
				return false
			}
			// Transparent wrappers keep the same reference use. The charged
			// normal form cannot unwrap semantic operators or publication paths.
			use := query.envelopeOuterExpression(reference, result)
			if use == nil {
				return false
			}
			// The RHS transfers only primitive field values through the existing
			// finite pattern projection. Its expression result remains inventoried.
			if assignment := use.Parent; assignment != nil && ast.IsBinaryExpression(assignment) && assignment.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && assignment.AsBinaryExpression().Right == use {
				target := assignment.AsBinaryExpression().Left
				if ast.IsObjectLiteralExpression(target) && nativeAssignmentTargetRole(target) == nativeAssignmentPattern && query.privateAssignmentPatternReads(target, value, fields, result) {
					continue
				}
			}
			if allowed[reference] {
				continue
			}
			if parent := use.Parent; parent != nil && ast.IsVariableDeclaration(parent) && parent.Initializer() == use && ast.IsObjectBindingPattern(parent.Name()) {
				if !query.privatePatternReads(parent.Name(), value, fields, result) {
					return false
				}
				continue
			}
			member := use.Parent
			if member == nil || !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) || member.Expression() != use {
				return false
			}
			_, key := accessorReceiver(member)
			read, write := accessorEvaluationMode(member)
			if !fields[key] || !read || write {
				return false
			}
			outer := query.envelopeOuterExpression(member, result)
			if outer == nil {
				return false
			}
			if parent := outer.Parent; parent != nil && (ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == outer || ast.IsNewExpression(parent) && parent.Expression() == outer || ast.IsTaggedTemplateExpression(parent) && parent.AsTaggedTemplateExpression().Tag == outer) {
				return false
			}
		}
	}
	return true
}

// forwardingTrace retains each source reference once, in first-seen order.
// Consumers check reference membership, not visit multiplicity. Repeated joins
// therefore stay bounded by source identities rather than duplicating paths.
// Every input is charged, and refusal never publishes a partial lifetime proof.
func (query *sourceValueQuery) forwardingTrace(result *accessorCandidates, groups ...[]*ast.Node) []*ast.Node {
	var nodes []*ast.Node
	seen := make(map[*ast.Node]bool)
	for _, group := range groups {
		for _, node := range group {
			if !query.charge(result, node) {
				return nil
			}
			if !seen[node] {
				seen[node] = true
				nodes = append(nodes, node)
			}
		}
	}
	return nodes
}

// observeInvocationResults selects and installs through the ordinary operation
// owner. It consumes synchronous normal completion without executing the body or
// publishing effect escapes merely because a caller observes its returned value.
func (query *sourceValueQuery) observeInvocationResults(call *ast.Node, bindings sourceValueBindings, obligations *accessorCandidates) (observed sourceResultObservation) {
	selected := false
	acquired := query.consumeInvocation(call, bindings, sourceInvocationConsumer{
		selection: func(complete bool) { selected = complete },
		body: func(body *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) {
			if inputs == nil {
				inputs = query.bindInputs(body, call, captures, result)
			}
			query.observeInstalledGetResults(body, inputs, &observed, result)
		},
		resolver: func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates) {
			observed.incomplete = true
		},
	})
	mergeAccessorCandidates(obligations, acquired)
	observed.incomplete = observed.incomplete || !selected || acquired.opaque || acquired.valueIncomplete || acquired.receiverIncomplete
	return
}

// copyCallableScope keeps the original binding and creator pair together. The
// existing charged scope copier owns allocations, and every exit restores state.
func (query *sourceValueQuery) copyCallableScope(scope acquiredCallableScope, result *accessorCandidates) acquiredCallableScope {
	previous := query.creators
	query.creators = scope.creators
	defer func() { query.creators = previous }()
	return query.acquireCallableScope(scope.bindings, result)
}

// privatePatternReads consumes the existing pattern projection algorithm. Only
// own static data slots of this already inventoried literal can be selected. The
// consumer records field-value transfer, not publication of the outer envelope.
func (query *sourceValueQuery) privatePatternReads(pattern *ast.Node, value sourceValue, fields map[string]bool, result *accessorCandidates) bool {
	projected := accessorCandidates{}
	bound := make(sourceValueBindings)
	query.bindInputPatternUsing(pattern, []sourceValue{value}, bound, &projected, accessorAcquire, nil,
		func(values []sourceValue, key string, bindings sourceValueBindings, effects *accessorCandidates, mode accessorTraversal) []sourceValue {
			if !fields[key] || len(values) != 1 || values[0].node != value.node || len(values[0].path) != 0 {
				effects.opaque = true
				return nil
			}
			return query.boundProjection(values, []string{key}, effects)
		})
	mergeAccessorCandidates(result, projected)
	return !projected.opaque && len(projected.producers) == 0 && len(projected.declarations) == 0
}

// privateAssignmentPatternReads adapts native object assignment syntax to the
// same own-data projection used by binding patterns. It neither binds fictitious
// formals nor executes destinations. Defaults, rest and nested patterns refuse.
func (query *sourceValueQuery) privateAssignmentPatternReads(pattern *ast.Node, value sourceValue, fields map[string]bool, result *accessorCandidates) bool {
	for _, property := range pattern.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, property) || !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) {
			return false
		}
		destination := property.Initializer()
		if destination == nil || !ast.IsIdentifier(destination) && !ast.IsPropertyAccessExpression(destination) && !ast.IsElementAccessExpression(destination) {
			return false
		}
		if ast.IsPropertyAccessExpression(destination) || ast.IsElementAccessExpression(destination) {
			_, key := accessorReceiver(destination)
			if key == "" {
				return false
			}
			// Only the projected primitive is delivered. Receiver/key evaluation
			// and PutValue, including setters, remain ordinary effect obligations.
			// A target receiver origin is not an envelope-confinement fact.
		}
		key := callableNameText(property.Name())
		if !fields[key] {
			return false
		}
		projected := query.boundProjection([]sourceValue{value}, []string{key}, result)
		if result.opaque || len(projected) != 1 || projected[0].node != value.node || len(projected[0].path) != 1 {
			return false
		}
	}
	return true
}
