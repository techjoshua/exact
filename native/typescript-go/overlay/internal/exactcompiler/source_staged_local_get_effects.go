package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedLocalGetEffectsRoot admits a same-activation const literal relationship
// to the original Get Effects owner. It proves neither the property's current
// value nor absence of writers. The original member traversal still owns every
// selected alternative, and unmapped getter inputs retain pending work.
func stagedLocalGetEffectsRoot(operation, caller *ast.Node, owner *executableBodyOwner) *ast.Node {
	if owner == nil || owner.values == nil || owner.checker != owner.values.checker || owner.values.program == nil || operation == nil || !stagedResultExpression(operation) || ast.IsCallExpression(operation) || ast.IsOptionalChain(operation) || !sourceStagedOccurrenceOwned(operation, caller) {
		return nil
	}
	file := ast.GetSourceFileOfNode(operation)
	if file == nil || file.IsDeclarationFile || !ast.IsExternalModule(file) || owner.values.program.GetSourceFile(file.FileName()) != file {
		return nil
	}
	index := owner.values.index(file)
	if index.incomplete || index.normalDynamicScope {
		return nil
	}
	receiver := unwrapSourceCallableReference(operation.Expression())
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return nil
	}
	binding := stagedBindingDataDeclaration(receiver, caller, owner)
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(binding) != caller || binding.Pos() >= operation.Pos() {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || owner.values.bindingWritten(symbol) {
		return nil
	}
	root := unwrapSourceCallableReference(binding.Initializer())
	if root == nil || !ast.IsObjectLiteralExpression(root) || !sourceInertValueCreation(root) {
		return nil
	}
	return root
}

// observeStagedLocalGetEffects lends one original dependency-only Get. This
// extends Effects source admission, not ordinary Get DATA alias eligibility.
// Captured reads and conditional getter return SOURCE remain distinct children;
// no query, normal output or delivered input receipt survives this interval.
func (work *callableEffectWork) observeStagedLocalGetEffects(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) bool {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.project == nil || owner.values.generation == nil || !owner.values.generation.active || owner.project.activeGeneration != owner.values.generation || work.operationGeneration != owner.values.generation {
		return false
	}
	root := stagedLocalGetEffectsRoot(operation, facts[caller].node, owner)
	var captured sourceStagedOperationRequest
	if root == nil {
		root, captured = work.capturedGetEffectsRoot(facts, caller, operation, owner)
	}
	if root == nil {
		return false
	}
	request := stagedGetResultRequest(operation, facts[caller].node, "effects", nil)
	if work.memberCoverageObserved[request.producer] == work.operationGeneration {
		return true
	}
	if _, registered := work.registerStagedGetResult(facts, caller, operation, owner); !registered {
		return false
	}
	key, known := stagedGetKey(operation)
	if !known {
		return true
	} // Dynamic/coercing keys retain their original debt.
	query := newSourceDependencyQuery(operation, owner.checker, owner, facts[caller].node)
	defer query.publishDependencyStatistics()
	query.protectedMember = operation
	if stagedEmptyArrayDataConstruction(root) {
		parent, owned := stagedMemberGetSourceRequest(&facts[caller], operation)
		if !owned {
			return true
		}
		revoke, installed := work.beginStagedMemberWork(query, facts, parent)
		if !installed {
			return true
		}
		defer revoke()
	}
	receiver := operation.Expression()
	get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}, propertyKey: key}
	b := &sourceStagedGetResultBorrow{issuer: query, sourceOwner: query.owner, work: work, facts: facts, owner: owner, get: get, request: request, cut: query.relativeInputCut(operation), active: true, complete: true, effectsRoot: root}
	get.resultSource = b
	defer func() { b.active = false; b.issuer = nil; b.get = nil; b.facts = nil; get.resultSource = nil }()
	result := query.accessorsAtGet(receiver, []string{key}, "", accessorAcquire, nil, nil, get)
	complete := (b.own || b.standardRead) && b.complete && !result.opaque && nativeMemberGetChannelsRepresented(&result)
	for _, role := range []string{"receiver", "key", "effects"} {
		current := stagedGetResultRequest(operation, facts[caller].node, role, nil)
		recipe := work.operationRecipes[current.producer]
		delta := sourceStagedOperationDelta{}
		switch role {
		case "receiver":
			delta.extracted = true // Original SOURCE read; no initializer replay.
			if captured.use != nil {
				delta.required = append(delta.required, captured)
			}
		case "key":
			delta.extracted = true
		case "effects":
			delta.extracted = complete
			delta.required = []sourceStagedOperationRequest{stagedGetResultRequest(operation, facts[caller].node, "receiver", nil), stagedGetResultRequest(operation, facts[caller].node, "key", nil)}
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
		// A current source renewal may be a prefix of the retained semantic recipe.
		// The original loan supplies a new observation; cached flags cannot do so.
		if !work.attachOperationSource(facts, recipe) && !work.registerOperationSourcePrefix(facts, recipe) {
			return true
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[recipe.key] = work.operationGeneration
	}
	if stagedEmptyArrayDataConstruction(root) && complete {
		work.registerOperationUse(facts, sourceStagedOperationUse{request: request})
	}
	return true
}

// retainOriginalGetBodySource is issued only by the original selected member
// loan. Summary membership preserves possible getter work/throw. Return SOURCE
// belongs to the independent value role, without binding B, invoking a stored
// callback, supplying creating inputs or selecting a normal getter result.
func (work *callableEffectWork) retainOriginalGetBodySource(facts []callableFacts, b *sourceStagedGetResultBorrow, body *ast.Node) bool {
	if b == nil || b.effectsRoot == nil || !b.active || b.issuer == nil || b.issuer.liveStagedGetResult(b.get) != b || b.work != work || b.owner == nil || b.owner.values.generation != work.operationGeneration || !ast.IsGetAccessorDeclaration(body) || body.Parent != b.effectsRoot {
		return false
	}
	caller, known := work.memberNodes[b.request.consumer]
	target, found := work.memberNodes[body]
	if !known || !found {
		return false
	}
	edge := fmt.Sprintf("%s:source-body:%d", b.request.edge, body.Pos())
	work.requireStagedSummary(facts, caller, target, edge, b.get.operation, b.cut)
	if source := work.operationRecipes[b.request.producer].callResult; source != nil && source.getResult.sourceInput.parent.use != nil {
		return true
	} // Scoped Effects never enroll canonical getter DATA.
	request := stagedGetResultRequest(b.get.operation, b.request.consumer, "body", body)
	source := &sourceStagedCallResultSource{request: request, declaration: body, generation: work.operationGeneration, getResult: &sourceStagedGetResultSource{role: "body", body: body}}
	if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: request.producer, callResult: source}) {
		return false
	}
	value := stagedGetResultRequest(b.get.operation, b.request.consumer, "value", nil)
	recipe := work.operationRecipes[value.producer]
	if recipe.callResult == nil || recipe.callResult.generation != work.operationGeneration || recipe.callResult.getResult == nil {
		return false
	}
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, stagedGetResultRequest(b.get.operation, b.request.consumer, "effects", nil))
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, request)
	return work.attachOperationSource(facts, recipe) || work.registerOperationSourcePrefix(facts, recipe)
}

// stagedLocalGetEffectsSelection carries the existing original loan through the
// member owner's selected source alternative. It does not substitute a literal
// for an acquired receiver or create a Get/B/C. Only this Effects loan permits
// the alias-to-selected-source attachment; the ordinary DATA route is unchanged.
func (q *sourceValueQuery) stagedLocalGetEffectsSelection(get *sourceGetInputs, origin *ast.Node, projection []string, name string, mode accessorTraversal) bool {
	b := q.liveStagedGetResult(get)
	return b != nil && b.effectsRoot != nil && b.effectsRoot == origin && q.protectedMember == get.operation && mode == accessorAcquire && len(projection) == 1 && name == "" && projection[0] == get.propertyKey && b.work.getEffectsBorrowRequest(b)
}

// stagedArrayGetEffectsLookup admits the established standard data-member branch
// only inside this original captured-array Get Effects loan. It does not choose
// a callable, exclude any own writer, or grant normal Get/Call output authority.
func (q *sourceValueQuery) stagedArrayGetEffectsLookup(origin *ast.Node, get *sourceGetInputs, mode accessorTraversal, standard *sourceValue) bool {
	b := q.liveStagedGetResult(get)
	member := q.stagedMember
	return b != nil && b.effectsRoot == origin && stagedEmptyArrayDataConstruction(origin) && mode == accessorAcquire && q.protectedMember == get.operation && get.propertyKey == "push" && standard != nil && standard.native != nil && standard.native.kind == sourceNativeArrayPush && standard.native.acquired == get.operation && member != nil && q.liveStagedMemberSource(member, get, member.read) && member.coverage != nil && member.coverage.origin == origin && member.coverage.cut == b.cut && member.coverage.generation == b.work.operationGeneration && b.work.getEffectsBorrowRequest(b)
}

// observeArrayGetEffects retains the original member factory's actual source
// contribution after its writer/descriptor traversal. Every alternative remains
// a required child; standard identity alone cannot close the Get or its caller.
func (q *sourceValueQuery) observeArrayGetEffects(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue) {
	if !q.stagedArrayGetEffectsLookup(origin, get, mode, standard) || !q.publishStagedMemberDisposition(get, cut, true) {
		return
	}
	b := q.liveStagedGetResult(get)
	member := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(member, get, cut) || member.coverage == nil || member.coverage.origin != origin || !member.coverage.extracted || b.work.memberCoverageObserved[member.coverage.request.producer] != b.work.operationGeneration {
		return
	}
	b.standardRead = true
	b.required = appendEntryLawRequirement(b.required, member.coverage.request)
}
