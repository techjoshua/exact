package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The initial collector must already have delivered the original descriptor
// reader/current Get before these live API lifetime/correspondence refusers run.
// No test installs an input, Get, read cut, observation or current stamp.
func TestMemberReceiverOriginalFunctionCutDomains(t *testing.T) {
	const source = `export{};const tag=Symbol.for('descriptor-source-use');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,tag)?.value===true}`
	descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
		assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
		work := &collection.work
		var record sourceStagedOperationRecipe
		for _, candidate := range work.operationRecipes {
			if candidate.memberSource != nil && candidate.memberSource.getEffects != nil && candidate.memberSource.getEffects.descriptor != nil && candidate.memberSource.getEffects.descriptor.use.kind == descriptorStrictComparisonEffects {
				record = candidate
				break
			}
		}
		if record.memberSource == nil {
			t.Fatal("original current record Get UNREACHED")
		}
		parent := record.memberSource.parent
		if !ast.IsFunctionLike(parent.consumer) {
			t.Fatal("original function source owner UNREACHED")
		}
		q := newSourceDependencyQuery(parent.producer.operation, collection.owner.checker, collection.owner, parent.consumer)
		defer q.publishDependencyStatistics()
		revoke, installed := work.beginStagedMemberWork(q, collection.facts, parent)
		if !installed {
			t.Fatal("actual source publisher UNREACHED")
		}
		defer revoke()
		borrow := q.stagedMember
		original := borrow.returnResult
		seen := 0
		borrow.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
			preparation := q.memberReceiverPreparation
			if preparation == nil || !q.liveStagedMemberReceiverPreparation(call) || preparation.read == nil {
				t.Fatal("actual function receiver preparation UNREACHED")
			}
			seen++
			if preparation.queryCut != q.relativeInputCut(parent.producer.operation) || preparation.queryCut.use != nil || preparation.cut != parent.cut || preparation.cut.use != parent.producer.operation || preparation.read.use != q.reading || preparation.read.use != parent.producer.operation {
				t.Fatal("relative query and physical Get domains were conflated")
			}
			if !memberReceiverCutsCorrespond(parent, preparation.queryCut, preparation.cut) {
				t.Fatal("authentic cut correspondence UNREACHED")
			}
			wrongQuery := preparation.queryCut
			wrongQuery.use = parent.producer.operation
			if memberReceiverCutsCorrespond(parent, wrongQuery, preparation.cut) {
				t.Fatal("physical use impersonated a function-relative query")
			}
			wrongPhysical := preparation.cut
			wrongPhysical.use = parent.consumer
			if memberReceiverCutsCorrespond(parent, preparation.queryCut, wrongPhysical) {
				t.Fatal("foreign physical use borrowed original parent")
			}
			wrongQuery = preparation.queryCut
			wrongQuery.reading = nil
			if memberReceiverCutsCorrespond(parent, wrongQuery, preparation.cut) {
				t.Fatal("foreign reading borrowed original parent")
			}
			copiedQuery := *q
			if copiedQuery.liveStagedMemberReceiverPreparation(call) {
				t.Fatal("copied query borrowed preparation")
			}
			copiedReference := *preparation.reference
			if q.memberReceiverPreparationReadMatches(&copiedReference, preparation.read, nil, "value", accessorRead) {
				t.Fatal("copied reference borrowed original read")
			}
			copiedRead := *preparation.read
			if q.memberReceiverPreparationReadMatches(preparation.reference, &copiedRead, nil, "value", accessorRead) {
				t.Fatal("copied read borrowed original visitor")
			}
			transfer := original(call, interest)
			if !transfer.accepted || transfer.noncallable || transfer.sourcePending || len(transfer.descriptorViews) == 0 {
				t.Fatal("closed/applied physical DATA reader UNREACHED")
			}
			data := work.operationRecipes[transfer.required.producer]
			wrong := data
			wrong.callResult = cloneStagedCallResultSource(data.callResult)
			wrong.callResult.generation = nil
			if views, _ := work.currentDeliveredDescriptorViewsAtReading(wrong, transfer.required, parent, preparation.cut); len(views) != 0 {
				t.Fatal("expired description borrowed actual reader")
			}
			return transfer
		}
		saved := original
		q.withDescriptorGetEffectsUse(parent.producer.operation, func() { q.evaluatedSourceAccessors(parent.producer.operation, nil) })
		if seen == 0 || q.memberReceiverPreparation != nil {
			t.Fatal("original receiver traversal or revocation UNREACHED")
		}
		revoke()
		if transfer := saved(parent.producer.operation.Expression(), sourceCallResultInterest{purpose: resultSourceProjection}); transfer.accepted {
			t.Fatal("revoked callback borrowed receiver DATA")
		}
	})
}
