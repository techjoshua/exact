package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A binding DATA request observes the original Identifier. Its initializer is
// a separate source producer, not a replacement operation or creating context.
func stagedBindingResultRequest(read, caller *ast.Node) sourceStagedOperationRequest {
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: caller, operation: read, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: read, field: "binding-data"}}, consumer: caller, use: read, cut: sourceRelativeCut{operation: read, use: read, reading: read}, edge: fmt.Sprintf("binding-data:%d", read.Pos())}
}

func stagedDataSourceExpression(node *ast.Node) bool {
	return stagedResultExpression(node) || node != nil && ast.IsIdentifier(node)
}

// stagedBindingDataDeclaration authenticates a lexical relationship only.
// Same-activation variable writes retain the existing binding/completion owner.
// Written formals and another activation still need their own source producer.
func stagedBindingDataDeclaration(read, caller *ast.Node, owner *executableBodyOwner) *ast.Node {
	if owner == nil || owner.values == nil || owner.checker == nil || read == nil || !ast.IsIdentifier(read) || !sourceStagedOccurrenceOwned(read, caller) {
		return nil
	}
	file := ast.GetSourceFileOfNode(read)
	if file == nil || file.IsDeclarationFile || owner.values.program.GetSourceFile(file.FileName()) != file {
		return nil
	}
	index := owner.values.index(file)
	symbol := owner.checker.GetSymbolAtLocation(read)
	if index.incomplete || index.normalDynamicScope || symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil {
		return nil
	}
	binding := symbol.ValueDeclaration
	if ast.IsFunctionDeclaration(binding) && binding.Body() != nil && ast.GetSourceFileOfNode(binding) == file && !owner.values.bindingWritten(symbol) {
		return binding
	}
	if !sourceStagedOccurrenceOwned(binding, caller) {
		if stagedBindingModuleOwner(binding, caller) != nil && !owner.values.bindingWritten(symbol) {
			return binding
		}
		return nil
	}
	if ast.IsVariableDeclaration(binding) && binding.Name() != nil && ast.IsIdentifier(binding.Name()) && binding.Initializer() != nil {
		return binding
	}
	if ast.IsParameterDeclaration(binding) && !owner.values.bindingWritten(symbol) && binding.Initializer() == nil && binding.AsParameterDeclaration().DotDotDotToken == nil && binding.Name() != nil && ast.IsIdentifier(binding.Name()) && binding.Name().Text() != "this" {
		return binding
	}
	return nil
}

// An immutable module binding retains its independent initializer owner. This
// describes lexical stability, never its current value or an acquired capture.
func stagedBindingModuleOwner(binding, consumer *ast.Node) *ast.Node {
	if binding == nil || consumer == nil || !ast.IsVariableDeclaration(binding) || binding.Initializer() == nil || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || ast.GetSourceFileOfNode(binding) != ast.GetSourceFileOfNode(consumer) {
		return nil
	}
	module := sourceStagedModuleOwner(binding)
	if module == consumer {
		return nil
	}
	return module
}

// describeStagedBindingData reuses bindingValues under the original source-only
// operand loan. It never acquires the initializer, installs a scope or invokes B.
func describeStagedBindingData(read, caller *ast.Node, owner *executableBodyOwner) sourceStagedReturnBindingPlan {
	out := sourceStagedReturnBindingPlan{}
	binding := stagedBindingDataDeclaration(read, caller, owner)
	if binding == nil {
		return out
	}
	if ast.IsParameterDeclaration(binding) {
		endpoint := sourceStagedArgumentEndpoint(read, read, caller, owner.values)
		if endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal && endpoint.role.declaration == caller {
			out.branches = []sourceStagedCallReturnBranch{{endpoint: endpoint}}
			out.locallyRepresented = true
		}
		return out
	}
	if ast.IsFunctionDeclaration(binding) {
		out.branches = []sourceStagedCallReturnBranch{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: binding, producer: binding, get: read, cut: sourceRelativeCut{operation: read, use: read, reading: read}}}}
		out.locallyRepresented = true
		return out
	}
	q := newSourceDependencyQuery(read, owner.checker, owner, caller)
	q.reading = read
	borrow := &sourceStagedReturnBindingBorrow{issuer: q, declaration: caller, generation: owner.values.generation, sources: make(map[*ast.Node]sourceRelativeEndpoint)}
	q.stagedReturnBinding = borrow
	defer func() { borrow.issuer, borrow.sources, q.stagedReturnBinding = nil, nil, nil }()
	obligations := accessorCandidates{}
	symbol := owner.checker.GetSymbolAtLocation(read)
	values := q.bindingValues(symbol, nil, func() []sourceValue {
		values, _ := q.stagedReturnBindingOperand(binding.Initializer(), binding)
		return values
	}, read, nil, &obligations)
	for _, value := range values {
		endpoint, known := borrow.sources[value.node]
		if !known {
			borrow.incomplete = true
			continue
		}
		out.branches = append(out.branches, sourceStagedCallReturnBranch{endpoint: cloneSourceRelativeEndpoint(endpoint)})
	}
	out.locallyRepresented = len(values) != 0 && !borrow.incomplete && !obligations.opaque && !obligations.valueIncomplete
	return out
}

func validStagedBindingResultRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.binding == nil || !ast.IsIdentifier(recipe.key.operation) || source.declaration != recipe.key.declaration || source.operand != nil || source.getResult != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || !sameOperationRequest(source.request, stagedBindingResultRequest(recipe.key.operation, recipe.key.declaration)) {
		return false
	}
	if source.moduleConstruction != nil {
		return validModuleConstructionBindingRecipe(recipe)
	}
	for _, required := range recipe.delta.required {
		if source.moduleConstruction == nil && localConstructionBindingSyntax(source.binding, recipe.key.declaration) && sameOperationRequest(required, constructionResultRequest(source.binding, recipe.key.declaration)) {
			continue
		}
		declaration := recipe.key.declaration
		if module := stagedBindingModuleOwner(source.binding, declaration); module != nil {
			if required.producer.operation != source.binding.Initializer() {
				return false
			}
			declaration = module
		}
		if !stagedDataSourceExpression(required.producer.operation) || required.producer.declaration != declaration || !sameOperationRequest(required, stagedResultSourceRequest(required.producer.operation, declaration, nil)) {
			return false
		}
	}
	return true
}

// stagedBindingModuleInitializerAccounted separates local DATA closure from
// module-fact settlement. This exact original initializer child retains its
// own full Effects work. The canonical module membership still prevents final
// publication while any independent initializer contribution remains pending.
func (work *callableEffectWork) stagedBindingModuleInitializerAccounted(state *sourceStagedOperationState, recipe sourceStagedOperationRecipe, input sourceStagedModuleRequirement) bool {
	source := recipe.callResult
	if source == nil || source.generation != work.operationGeneration || !validStagedBindingResultRecipe(recipe) || state.resultProjection == nil || !state.resultProjection.locallyRepresented || len(state.resultProjection.branches) != 1 || len(recipe.delta.required) != 1 {
		return false
	}
	module := stagedBindingModuleOwner(source.binding, recipe.key.declaration)
	producer, known := work.memberNodes[module]
	if module == nil || !known || input.producer != producer || input.declaration != module || input.edge != fmt.Sprintf("%s:module-initializer:%d", source.request.edge, module.Pos()) || !sameOperationRequest(recipe.delta.required[0], stagedResultSourceRequest(source.binding.Initializer(), module, nil)) {
		return false
	}
	endpoint := state.resultProjection.branches[0].endpoint
	return endpoint.kind == relativeEndpointExpression && endpoint.expression == source.binding.Initializer() && endpoint.producer == source.binding && endpoint.get == state.key.operation && endpoint.cut == source.request.cut
}

// prepareStagedBindingResult retains the read and each original child result on
// the existing DATA queue. Child creating B and partial alternatives pass intact.
func (work *callableEffectWork) prepareStagedBindingResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	source := recipe.callResult
	if !validStagedCallResultRecipe(recipe) || source.generation != owner.values.generation || stagedBindingDataDeclaration(state.key.operation, state.key.declaration, owner) != source.binding {
		return
	}
	caller, owned := work.memberNodes[state.key.declaration]
	if !owned {
		return
	}
	module := stagedBindingModuleOwner(source.binding, state.key.declaration)
	if module != nil {
		producer, known := work.memberNodes[module]
		if !known {
			producer = -1
		}
		edge := fmt.Sprintf("%s:module-initializer:%d", source.request.edge, module.Pos())
		input := sourceStagedModuleRequirement{producer: producer, edge: edge, declaration: module}
		if len(state.moduleInputs) == 0 {
			state.moduleInputs = []sourceStagedModuleRequirement{input}
		} else if len(state.moduleInputs) != 1 || state.moduleInputs[0] != input {
			return
		}
		if !known {
			return // Missing original initializer facts cannot be rebuilt in this read's scope.
		}
		work.requireSourceModuleAvailability(facts, caller, producer, edge, source.request.use, source.request.cut)
		caller = producer
		if state.resultProjection == nil {
			initializer := source.binding.Initializer()
			state.resultProjection = &sourceStagedReturnBindingPlan{
				branches:           []sourceStagedCallReturnBranch{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: initializer, producer: source.binding, get: state.key.operation, cut: source.request.cut}}},
				locallyRepresented: stagedDataSourceExpression(initializer) || stagedSourceDataValue(initializer),
			}
		}
	}
	if source.moduleConstruction != nil {
		work.prepareModuleConstructionBinding(facts, id, owner)
		return
	}
	if state.resultProjection == nil {
		plan := describeStagedBindingData(state.key.operation, state.key.declaration, owner)
		state.resultProjection = &plan
	}
	plan := *state.resultProjection
	delta := sourceStagedOperationDelta{extracted: plan.locallyRepresented}
	for _, branch := range plan.branches {
		endpoint := branch.endpoint
		// The existing source-DATA value domain is valid under the original
		// initializer's independent module requirement as well. Module status
		// does not turn this source relationship into an ordinary allocation.
		if module != nil && !stagedDataSourceExpression(endpoint.expression) && !stagedSourceDataValue(endpoint.expression) {
			delta.extracted = false
			continue // Module reads forward an existing initializer DATA producer only.
		}
		if module == nil && ast.IsVariableDeclaration(source.binding) && endpoint.kind == relativeEndpointExpression && endpoint.expression == source.binding.Initializer() && localConstructionBinding(source.binding, state.key.declaration, owner.values) && sourceConstructionEventNode(endpoint.expression) && (ast.IsObjectLiteralExpression(endpoint.expression) || stagedCallReturnLiteralHasCapture(endpoint.expression, owner.values)) {
			child, supported := work.describeLocalConstructionData(facts, source.binding, state.key.declaration, owner)
			if !supported {
				delta.extracted = false
				continue
			}
			if _, known := work.operationRecipes[child.request.producer]; !known && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
				delta.extracted = false
				continue
			}
			if _, adopted := work.requireOperation(facts, child.request); !adopted {
				delta.extracted = false
				continue
			}
			delta.required = appendEntryLawRequirement(delta.required, child.request)
			if data, applied := work.stagedCallResultData(child.request); applied {
				copy := cloneOperationDelta(data.delta)
				delta.exposures = append(delta.exposures, copy.exposures...)
				delta.extracted = delta.extracted && data.delta.extracted
			} else {
				delta.extracted = false
			}
			continue
		}
		if endpoint.kind == relativeEndpointRole || endpoint.kind == relativeEndpointUndefined || endpoint.kind == relativeEndpointExpression && stagedSourceDataValue(endpoint.expression) {
			delta.exposures = append(delta.exposures, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(endpoint)})
			if endpoint.kind == relativeEndpointExpression && stagedCallReturnLiteralHasCapture(endpoint.expression, owner.values) {
				delta.extracted = false
			}
			continue
		}
		if !stagedDataSourceExpression(endpoint.expression) {
			delta.extracted = false
			continue
		}
		child, supported := work.describeStagedCallResultSource(facts, caller, endpoint.expression, owner)
		if !supported {
			delta.extracted = false
			continue
		}
		if child.getResult != nil {
			if _, registered := work.registerStagedGetResult(facts, caller, endpoint.expression, owner); !registered {
				delta.extracted = false
				continue
			}
		}
		if _, known := work.operationRecipes[child.request.producer]; !known && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
			delta.extracted = false
			continue
		}
		if _, required := work.requireOperation(facts, child.request); !required {
			delta.extracted = false
			continue
		}
		delta.required = appendEntryLawRequirement(delta.required, child.request)
		if delivery, available := work.stagedCallResultData(child.request); available {
			delta.exposures = append(delta.exposures, delivery.delta.exposures...)
			delta.extracted = delta.extracted && delivery.delta.extracted
		} else {
			delta.extracted = false
		}
	}
	recipe.delta = delta
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, delta)
	}
}

// stagedBindingInputConsumerCovered follows immutable alias uses to existing
// consumers. The private-use inventory supplies lexical closure, never execution
// or initializer DATA. Actual argument readers still require each binding root.
func (work *callableEffectWork) stagedBindingInputConsumerCovered(fact *callableFacts, node *ast.Node, owner *executableBodyOwner, seen map[*ast.Node]bool) bool {
	outer := node
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == node {
		outer = outer.Parent
	}
	binding := outer.Parent
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Initializer() != outer || binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || !sourceStagedOccurrenceOwned(binding, fact.node) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(binding.Name())
	index := owner.values.index(fact.sourceFile)
	if stagedBindingDataDeclaration(binding.Name(), fact.node, owner) != binding || index.privateUses == nil || !index.privateUses.complete || seen[binding] {
		return false
	}
	seen[binding] = true
	defer delete(seen, binding)
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if enclosingCallableNode(use.node) != fact.node {
			if !work.stagedGetCaptureConsumer(fact, use.node, owner) {
				return false
			}
		} else if !work.sourceInputConsumerCovered(fact, use.node) && !work.stagedBindingInputConsumerCovered(fact, use.node, owner, seen) {
			return false
		}
	}
	return true
}

// stagedBindingInvocation identifies an ordinary original callee-read use. A
// required-only binding child is not an invocation marker. This lends no B or
// callable category, and its DATA producer retains every child requirement.
func (work *callableEffectWork) stagedBindingInvocation(use sourceStagedOperationUse) (*ast.Node, bool) {
	read := use.request.producer.operation
	source := work.operationRecipes[use.request.producer].callResult
	if read == nil || !ast.IsIdentifier(read) || use.call != nil || use.installed != nil || source == nil || source.binding == nil || !ast.IsVariableDeclaration(source.binding) || source.generation != work.operationGeneration || !sameOperationRequest(use.request, stagedBindingResultRequest(read, use.request.producer.declaration)) {
		return nil, false
	}
	outer := read
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == read {
		outer = outer.Parent
	}
	call := outer.Parent
	if call == nil || !ast.IsCallExpression(call) || call.Expression() != outer || call.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(call.AsCallExpression())) != 0 {
		return nil, false
	}
	return call, true
}

// stageStagedBindingInvocation registers the actual callee's existing binding
// DATA use. Registration is not readiness or invocation. Its ordinary collector
// calls this only with the matching relative activation consumer installed.
func (work *callableEffectWork) stageStagedBindingInvocation(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || caller < 0 || caller >= len(facts) || facts[caller].normalInputs != nil || facts[caller].initializerPlan != nil || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(call.AsCallExpression())) != 0 {
		return false
	}
	read := unwrapSourceCallableReference(call.Expression())
	binding := stagedBindingDataDeclaration(read, facts[caller].node, owner)
	if binding == nil || !ast.IsVariableDeclaration(binding) {
		return false
	}
	work.indexOperationSources(facts)
	if work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return false
	}
	work.operationGeneration = owner.values.generation
	source, valid := work.describeStagedCallResultSource(facts, caller, read, owner)
	if !valid {
		return false
	}
	if prior, known := work.operationRecipes[source.request.producer]; known {
		if !sameStagedCallResultSource(prior.callResult, source) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request})
}
