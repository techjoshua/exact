package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// beginPlainGetPreparationIssuer lends only the actual standalone Get's source
// registration interval. It creates no operation until a real scope demand.
// Dynamic/normal/implicit entries retain their own owners and fail closed here.
func (work *callableEffectWork) beginPlainGetPreparationIssuer(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest) func() {
	noop := func() {}
	if q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.stagedNativeGet != nil || q.inputs != nil || q.operation != nil || !q.dependenciesOnly || q.stagedMember == nil || q.stagedMember.issuer != q || q.stagedMember.getPreparation != nil || !sameOperationRequest(q.stagedMember.request, parent) || !validStagedMemberParent(parent) || parent.producer.selector != (sourceStagedOperationSelector{}) || !ast.IsPropertyAccessExpression(parent.producer.operation) || !ast.IsIdentifier(parent.producer.operation.Expression()) || q.effectOwner != parent.consumer || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.owner.checker != q.executable.values.checker {
		return noop
	}
	read, write := accessorEvaluationMode(parent.producer.operation)
	if !read || write {
		return noop
	}
	// Eligibility describes the existing direct-library source executor. It is
	// not the receiver/callee selection made by that executor's original Get.
	symbol := q.owner.checker.GetSymbolAtLocation(parent.producer.operation.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return noop
	}
	caller, known := work.memberNodes[parent.consumer]
	publisher := q.executable.pendingMemberPublishers[parent.consumer]
	if !known || caller < 0 || caller >= len(facts) || caller >= len(work.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || publisher.fact != &work.operationFacts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return noop
	}
	b := &sourceStagedGetPreparationBorrow{query: q, work: work, owner: q.executable, fact: publisher.fact, member: q.stagedMember, request: parent, plain: true}
	b.self = b
	b.member.getPreparation = b
	return func() {
		if b.member != nil && b.member.getPreparation == b {
			b.member.getPreparation = nil
		}
		b.acquisition = nil
		b.self, b.query, b.owner, b.fact, b.member, b.execution = nil, nil, nil, nil, nil, nil
	}
}

// adoptPlainGetPreparation reserves only the debt role on its actual first
// demand. A task can reissue it only through its one original execution loan.
func (work *callableEffectWork) adoptPlainGetPreparation(facts []callableFacts, q *sourceValueQuery, b *sourceStagedGetPreparationBorrow) bool {
	if !b.live(q) || b.work != work {
		return false
	}
	if b.id.index != 0 {
		return b.id.epoch == work.operationEpoch && int(b.id.index) < len(work.operations) && work.getPreparationTaskSource(b.id) != nil
	}
	if !b.plain {
		return false
	}
	request := stagedGetPreparationRequest(b.request)
	// A previously published Get cannot gain a missing preparation child.
	if prior, exists := work.operationRecipes[b.request.producer]; exists && prior.delta.extracted && (prior.memberSource == nil || prior.memberSource.protocolSource == nil || prior.memberSource.protocolSource.get == nil || !sameOperationRequest(prior.memberSource.protocolSource.get.preparation, request)) {
		return false
	}
	recipe, exists := work.operationRecipes[request.producer]
	if exists {
		if !validStagedGetPreparationRecipe(recipe) || !recipe.memberSource.getPreparation.plain || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.parent, b.request) {
			return false
		}
	} else {
		recipe = sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{request: request, parent: b.request, generation: work.operationGeneration, getPreparation: &sourceStagedGetPreparation{plain: true}}}
		if !work.registerOperationRecipe(facts, recipe) {
			return false
		}
	}
	id, adopted := work.requireOperation(facts, request)
	if !adopted || work.operations[id.index].invalid || work.operations[id.index].writerSourceRunning && !b.execution.claim(work, id, q.executable, b.fact) {
		return false
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		return false
	}
	b.id = id
	work.attachSourceObservationDependencies(facts, id)
	return true
}

// preparePlainGetPreparation performs the same original Get source service as
// direct-library refresh. Its own return, C publication and SOURCE subscribers
// establish the observation; a pending description or acknowledgement cannot.
func (work *callableEffectWork) preparePlainGetPreparation(facts []callableFacts, source *sourceStagedMemberSource, owner *executableBodyOwner, execution *sourceStagedGetPreparationExecution) {
	parent := source.parent
	q := newSourceDependencyQuery(parent.producer.operation, owner.checker, owner, parent.consumer)
	defer q.publishDependencyStatistics()
	q.protectedMember = parent.producer.operation
	revoke, installed := work.beginStagedMemberWork(q, facts, parent)
	if !installed {
		return
	}
	defer revoke()
	b := q.stagedMember.getPreparation
	if b == nil || !b.plain {
		return
	}
	b.execution = execution
	if !work.adoptPlainGetPreparation(facts, q, b) {
		return
	}
	q.evaluatedSourceAccessors(parent.producer.operation, nil)
	recipe := work.operationRecipes[parent.producer]
	if !validStagedMemberExternalGetRecipe(recipe) || !sameOperationRequest(recipe.memberSource.protocolSource.get.preparation, source.request) || work.memberCoverageObserved[parent.producer] != work.operationGeneration {
		return
	}
	work.finishStagedGetPreparation(facts, q, b, !b.dataPending)
}

// sameExternalGetPreparation keeps the named sibling separate from the source
// C identity. An extracted external Get cannot silently gain another debt.
func sameExternalGetPreparation(a, b *sourceStagedMemberSource) bool {
	var x, y sourceStagedOperationRequest
	if a != nil && a.protocolSource != nil && a.protocolSource.get != nil {
		x = a.protocolSource.get.preparation
	}
	if b != nil && b.protocolSource != nil && b.protocolSource.get != nil {
		y = b.protocolSource.get.preparation
	}
	return sameOperationRequest(x, y)
}
