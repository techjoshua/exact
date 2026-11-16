package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original collector remains the separate whole/Get/C lifecycle gate. This
// control uses a fresh genuine SOURCE API traversal on the live collector's
// real publisher; its existing callback exposes the stack interval for refusal
// assertions only. It installs no Get, cut, frame, event or current stamp.
func TestMemberReceiverPreparationScopeRefusers(t *testing.T) {
	withModuleCreationDataWork(t, liveCDataContinuationFixture, func(collection *projectCallableCollection, result callableAnalysis, binding *ast.Node) {
		file := ast.GetSourceFileOfNode(binding)
		assertLiveCDataContinuationCurrent(t, collection, file, result)
		_, recipe, found := liveCDataContinuationRecipe(collection, file)
		if !found {
			t.Fatal("genuine original receiver reading UNREACHED")
		}
		parent := recipe.callResult.getResult.frameworkResume.parent
		q := newSourceDependencyQuery(parent.producer.operation, collection.owner.checker, collection.owner, parent.consumer)
		defer q.publishDependencyStatistics()
		revoke, installed := collection.work.beginStagedMemberWork(q, collection.facts, parent)
		if !installed {
			t.Fatal("original SOURCE member publisher UNREACHED")
		}
		defer revoke()
		b := q.stagedMember
		original := b.returnResult
		seen := 0
		b.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
			p := q.memberReceiverPreparation
			if p == nil || !q.liveStagedMemberReceiverPreparation(call) || p.reference == nil || p.read == nil {
				t.Fatal("actual visitor/read preparation UNREACHED")
			}
			seen++
			copiedQuery := *q
			if copiedQuery.liveStagedMemberReceiverPreparation(call) {
				t.Fatal("copied query borrowed actual preparation")
			}
			copiedReference := *p.reference
			field := parent.producer.operation.Name().Text()
			if !q.memberReceiverPreparationReadMatches(p.reference, p.read, nil, field, accessorRead) {
				t.Fatal("actual visitor/read correspondence UNREACHED")
			}
			if q.memberReceiverPreparationReadMatches(&copiedReference, p.read, nil, field, accessorRead) {
				t.Fatal("copied reference borrowed original preparation")
			}
			copiedRead := *p.read
			if q.memberReceiverPreparationReadMatches(p.reference, &copiedRead, nil, field, accessorRead) {
				t.Fatal("copied read borrowed original preparation")
			}
			transfer := original(call, interest)
			if !transfer.accepted || transfer.noncallable || transfer.sourcePending || len(transfer.descriptorViews) == 0 {
				t.Fatal("actual applied typed receiver DATA UNREACHED or promoted to output")
			}
			for _, view := range transfer.descriptorViews {
				if !sameOperationRequest(view.delivery, transfer.required) {
					t.Fatal("typed receiver lost exact original reading")
				}
			}
			return transfer
		}
		candidates := q.evaluatedSourceAccessors(parent.producer.operation, nil)
		if seen == 0 {
			t.Fatal("real original accessor preparation callback UNREACHED")
		}
		if q.memberReceiverPreparation != nil || q.liveStagedMemberReceiverPreparation(parent.producer.operation.Expression()) {
			t.Fatal("expired preparation retained registration authority")
		}
		if !candidates.valueIncomplete {
			t.Fatal("typed receiver DATA became a normal result")
		}
	})
}

func TestMemberReceiverPreparationExactDataReading(t *testing.T) {
	withModuleCreationDataWork(t, liveCDataContinuationFixture, func(collection *projectCallableCollection, result callableAnalysis, binding *ast.Node) {
		file := ast.GetSourceFileOfNode(binding)
		assertLiveCDataContinuationCurrent(t, collection, file, result)
		_, recipe, found := liveCDataContinuationRecipe(collection, file)
		if !found {
			t.Fatal("original Get continuation UNREACHED")
		}
		resume := recipe.callResult.getResult.frameworkResume
		reading := resume.readings[0]
		dataRecipe := collection.work.operationRecipes[reading.producer]
		views, represented := collection.work.currentDeliveredDescriptorViewsAtReading(dataRecipe, reading, resume.parent, resume.cut)
		if !represented || len(views) == 0 {
			t.Fatal("actual closed/APPLIED typed receiver reading UNREACHED")
		}
		for _, row := range []struct {
			name   string
			change func(*sourceStagedOperationRequest, *sourceRelativeCut)
		}{
			{"wrong-consumer", func(r *sourceStagedOperationRequest, _ *sourceRelativeCut) { r.consumer = binding }},
			{"wrong-reader", func(r *sourceStagedOperationRequest, _ *sourceRelativeCut) { r.reading = sourceStagedOperationKey{} }},
			{"wrong-cut", func(_ *sourceStagedOperationRequest, c *sourceRelativeCut) { c.reading = nil }},
		} {
			t.Run(row.name, func(t *testing.T) {
				wrong, cut := reading, resume.cut
				row.change(&wrong, &cut)
				if values, _ := collection.work.currentDeliveredDescriptorViewsAtReading(dataRecipe, wrong, resume.parent, cut); len(values) != 0 {
					t.Fatal("foreign reader/cut borrowed typed DATA")
				}
			})
		}
	})
}
