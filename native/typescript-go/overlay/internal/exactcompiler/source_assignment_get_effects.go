package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// qualifiedGetRequest is an Effects-only use of an original BODY Get. Receiver
// substitution belongs to the original Set use, never the generic BODY Get or
// its DATA producer. Lexical captures retain their definition-relative owner.
func qualifiedGetRequest(operation, caller *ast.Node, role string, input sourceAssignmentEffectsInput) sourceStagedOperationRequest {
	request := stagedGetResultRequest(operation, caller, role, nil)
	if input.access.receiver != nil {
		request.producer.selector.association = input.parent.use
		request.edge += ":source:" + input.parent.edge
	}
	return request
}

func (work *callableEffectWork) registerQualifiedGetEffects(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner, input sourceAssignmentEffectsInput) (sourceStagedOperationRequest, bool) {
	request := qualifiedGetRequest(operation, facts[caller].node, "effects", input)
	if input.access.receiver == nil {
		_, registered := work.registerStagedGetResult(facts, caller, operation, owner)
		return request, registered
	}
	for _, role := range []string{"receiver", "key", "effects"} {
		current := qualifiedGetRequest(operation, facts[caller].node, role, input)
		if prior, exists := work.operationRecipes[current.producer]; exists {
			if prior.callResult == nil || prior.callResult.generation != work.operationGeneration || prior.callResult.getResult == nil || !sameAssignmentEffectsInput(prior.callResult.getResult.sourceInput, input) {
				return request, false
			}
			continue
		}
		source := work.describeStagedGetResultSource(facts, caller, operation, owner)
		source.request = current
		source.getResult.role = role
		source.getResult.sourceInput = input
		recipe := sourceStagedOperationRecipe{key: current.producer, callResult: source}
		if !work.registerOperationRecipe(facts, recipe) {
			return request, false
		}
	}
	return request, true
}

func validQualifiedGetSource(source *sourceStagedCallResultSource) bool {
	input := source.getResult.sourceInput
	a := input.access
	return input.parent.use != nil && plainStagedAssignment(input.parent.use) && validStagedMemberParent(input.parent) && a.read && a.receiver != nil && a.reference == source.request.use && a.declaration == source.declaration && a.owner == input.parent.consumer && a.generation == source.generation && a.cut == (sourceRelativeCut{operation: input.parent.use, reading: a.reference}) && (source.getResult.role == "receiver" || source.getResult.role == "key" || source.getResult.role == "effects")
}

// observeQualifiedGetEffects reuses the original Get owner and its normal
// literal SOURCE visitor. It produces only conditional Effects and mandatory
// children; its request cannot name a normal value role or delivered input.
func (work *callableEffectWork) observeQualifiedGetEffects(facts []callableFacts, source *sourceStagedCallResultSource, owner *executableBodyOwner) {
	input := source.getResult.sourceInput
	if !validQualifiedGetSource(source) {
		return
	}
	early := !work.assignmentEffectsInputCurrent(input)
	root := work.assignmentEffectsInputRoot(input, owner)
	if early {
		root = nil
		if work.qualifiedGetSourceInputsCurrent(input, owner) && owner != nil && owner.values != nil && owner.values.generation == work.operationGeneration && ast.IsVariableDeclaration(input.access.binding) {
			binding := input.access.binding
			file := ast.GetSourceFileOfNode(binding)
			if file != nil && owner.values.program.GetSourceFile(file.FileName()) == file && ast.IsObjectLiteralExpression(binding.Initializer()) && sourceInertValueCreation(binding.Initializer()) {
				root = binding.Initializer()
			}
		}
	}
	if root == nil {
		return
	}
	operation := source.request.use
	request := qualifiedGetRequest(operation, source.declaration, "effects", input)
	// Stronger binding-capable observation has its own stamp; early currency
	// cannot suppress its later genuine complete-local renewal.
	observed := request.producer
	if !early {
		observed = qualifiedGetRequest(operation, source.declaration, "binding-effects-observation", input).producer
	}
	if work.memberCoverageObserved[observed] == work.operationGeneration {
		return
	}
	key, known := stagedGetKey(operation)
	if !known {
		return
	}
	query := newSourceDependencyQuery(operation, owner.checker, owner, source.declaration)
	defer query.publishDependencyStatistics()
	query.protectedMember = operation
	receiver := operation.Expression()
	get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}, propertyKey: key}
	b := &sourceStagedGetResultBorrow{issuer: query, sourceOwner: query.owner, work: work, facts: facts, owner: owner, get: get, request: request, cut: query.relativeInputCut(operation), active: true, complete: true, effectsRoot: root, sourceInputsOnly: early}
	get.resultSource = b
	defer func() { b.active = false; b.issuer = nil; b.get = nil; b.facts = nil; get.resultSource = nil }()
	result := query.accessorsAtGet(receiver, []string{key}, "", accessorAcquire, nil, nil, get)
	complete := b.own && b.complete && !result.opaque && nativeMemberGetChannelsRepresented(&result)
	for _, role := range []string{"receiver", "key", "effects"} {
		current := qualifiedGetRequest(operation, source.declaration, role, input)
		recipe := work.operationRecipes[current.producer]
		delta := sourceStagedOperationDelta{}
		switch role {
		case "receiver":
			delta.extracted = true
			delta.required = append(delta.required, input.access.required...)
		case "key":
			delta.extracted = true
		case "effects":
			delta.extracted = complete
			delta.required = []sourceStagedOperationRequest{qualifiedGetRequest(operation, source.declaration, "receiver", input), qualifiedGetRequest(operation, source.declaration, "key", input)}
			for _, required := range b.required {
				child := work.operationRecipes[required.producer].callResult
				if child == nil || !stagedGetResultBody(child) {
					delta.required = appendEntryLawRequirement(delta.required, required)
				}
			}
			for _, effect := range result.environmentEffects {
				if !validOperationEnvironmentEffect(effect) {
					delta.extracted = false
					continue
				}
				delta.effects = append(delta.effects, effect)
			}
		}
		recipe.delta = delta
		if !work.attachOperationSource(facts, recipe) && !work.registerOperationSourcePrefix(facts, recipe) {
			return
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[current.producer] = work.operationGeneration
	}

	if !early {
		work.memberCoverageObserved[observed] = work.operationGeneration
	}
}

// capturedGetEffectsRoot consumes an actual original captured-binding SOURCE
// producer. This is definition-relative lexical knowledge, independent of the
// setter's callers or receiver. Written/cross-activation/nonliteral inputs keep
// their existing debt, and ordinary Get DATA eligibility is unchanged.
func (work *callableEffectWork) capturedGetEffectsRoot(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) (*ast.Node, sourceStagedOperationRequest) {
	if operation == nil || !ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation) {
		return nil, sourceStagedOperationRequest{}
	}
	receiver := unwrapSourceCallableReference(operation.Expression())
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return nil, sourceStagedOperationRequest{}
	}
	source, eligible := work.describeStagedCallResultSource(facts, caller, receiver, owner)
	if !eligible || source == nil || source.capturedBinding == nil || source.capturedBinding.write != nil || source.capturedBinding.symbol == nil || owner.values.bindingWritten(source.capturedBinding.symbol) || capturedBindingMutated(source.capturedBinding.symbol, owner) {
		return nil, sourceStagedOperationRequest{}
	}
	binding := source.binding
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Initializer() == nil || !(ast.IsObjectLiteralExpression(binding.Initializer()) && sourceInertValueCreation(binding.Initializer()) || stagedEmptyArrayDataConstruction(binding.Initializer())) {
		return nil, sourceStagedOperationRequest{}
	}
	recipe := sourceStagedOperationRecipe{key: source.request.producer, callResult: source}
	if _, exists := work.operationRecipes[recipe.key]; !exists && !work.registerOperationRecipe(facts, recipe) {
		return nil, sourceStagedOperationRequest{}
	}
	return binding.Initializer(), source.request
}

// getEffectsBorrowRequest preserves the owning Get's purpose through literal
// SOURCE traversal. Only the active Effects loan can substitute these sources;
// normal value requests and stale per-use descriptions are excluded.
func (work *callableEffectWork) getEffectsBorrowRequest(b *sourceStagedGetResultBorrow) bool {
	if b == nil || b.get == nil {
		return false
	}
	source := work.operationRecipes[b.request.producer].callResult
	if source == nil || source.getResult == nil || source.getResult.role != "effects" {
		return false
	}
	input := source.getResult.sourceInput
	current := work.assignmentEffectsInputCurrent(input)
	if b.sourceInputsOnly {
		current = work.qualifiedGetSourceInputsCurrent(input, b.owner)
	}
	if input.parent.use != nil && (!validQualifiedGetSource(source) || !current) {
		return false
	}
	return sameOperationRequest(b.request, qualifiedGetRequest(b.get.operation, b.request.consumer, "effects", input))
}

// projectGetEffectsSource visits an already authenticated literal SOURCE for
// this original read, retaining its member projection unchanged. It installs
// no sourceValue, creating scope or bindings,
// and the owning Effects-only publisher cannot publish the visited value.
func (q *sourceValueQuery) projectGetEffectsSource(node *ast.Node, projection []string, mode accessorTraversal, get *sourceGetInputs, visit func(*ast.Node, []string, bool)) bool {
	b := q.liveStagedGetResult(get)
	if b == nil || b.effectsRoot == nil || mode != accessorAcquire || node == b.effectsRoot || node != unwrapSourceCallableReference(get.operation.Expression()) || !b.work.getEffectsBorrowRequest(b) {
		return false
	}
	visit(b.effectsRoot, projection, false)
	return true
}
