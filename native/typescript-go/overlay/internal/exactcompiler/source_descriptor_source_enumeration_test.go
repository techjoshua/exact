package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The unchanged original collector is the bootstrap gate. These checks start
// only after its real descriptor Get, prototype C and full closure have passed;
// they do not install DATA, inputs, an observation, an ACK or a running flag.
func TestDescriptorSourceEnumerationBootstrap(t *testing.T) {
	const source = "export{};const tag=Symbol.for('descriptor-source-use');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,tag)?.value===true}"
	descriptorContractCollection(t, source, func(collection *projectCallableCollection, result callableAnalysis) {
		assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
		work := &collection.work
		reached := false
		for _, recipe := range work.operationRecipes {
			if recipe.callResult == nil || recipe.callResult.getResult == nil || recipe.callResult.getResult.frameworkResume == nil {
				continue
			}
			resume := recipe.callResult.getResult.frameworkResume
			if !ast.IsPropertyAccessExpression(resume.parent.producer.operation) || len(resume.readings) != 1 {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || work.operations[id.index].frameworkGetObservation == nil || !work.operations[id.index].delta.extracted || !work.frameworkGetObservationCurrent(work.operations[id.index].frameworkGetObservation) {
				t.Fatal("genuine original completed Get observation UNREACHED")
			}
			indexed, issued := work.memberProtocolSources[resume.parent.producer.operation]
			if !issued || work.operationRecipes[indexed.producer].memberSource == nil || work.operationRecipes[indexed.producer].memberSource.getEffects == nil {
				t.Fatal("original P source publication/index connection UNREACHED")
			}
			reading := resume.readings[0]
			data := work.operationRecipes[reading.producer]
			views, represented := work.descriptorEnumerationPayload(data, reading, resume.parent, resume.cut)
			if !represented || len(views) == 0 {
				t.Fatal("actual locally delivered nominal source DATA UNREACHED")
			}
			if ordinary, ok := work.currentDeliveredDescriptorViewsAtReading(data, reading, resume.parent, resume.cut); !ok || len(ordinary) == 0 {
				t.Fatal("ordinary CLOSED delivery was replaced by local enumeration")
			}
			for _, row := range []struct {
				name   string
				change func(*sourceStagedOperationRequest, *sourceRelativeCut)
			}{
				{"consumer", func(r *sourceStagedOperationRequest, _ *sourceRelativeCut) { r.consumer = reading.producer.operation }},
				{"reader", func(r *sourceStagedOperationRequest, _ *sourceRelativeCut) { r.reading = sourceStagedOperationKey{} }},
				{"use", func(r *sourceStagedOperationRequest, _ *sourceRelativeCut) { r.use = resume.parent.consumer }},
				{"cut", func(_ *sourceStagedOperationRequest, c *sourceRelativeCut) { c.reading = nil }},
			} {
				t.Run(row.name, func(t *testing.T) {
					wrong, cut := reading, resume.cut
					row.change(&wrong, &cut)
					if values, ok := work.descriptorEnumerationPayload(data, wrong, resume.parent, cut); ok || len(values) != 0 {
						t.Fatal("foreign exact DATA association acquired enumeration payload")
					}
				})
			}
			copy := data
			copy.callResult = cloneStagedCallResultSource(data.callResult)
			copy.callResult.generation = nil
			if values, ok := work.descriptorEnumerationPayload(copy, reading, resume.parent, resume.cut); ok || len(values) != 0 {
				t.Fatal("expired source description borrowed actual DATA")
			}
			if values, ok := work.descriptorEnumerationPayload(sourceStagedOperationRecipe{}, reading, resume.parent, resume.cut); ok || len(values) != 0 {
				t.Fatal("missing DATA recipe acquired enumeration")
			}
			// Enter the maintained original-P producer. No test writes a running,
			// observation, Get, input, ACK or graph flag.
			seen := 0
			var expired *sourceValueQuery
			if !work.withFrameworkGetResumptionSource(collection.facts, id, collection.owner, func(q *sourceValueQuery) {
				end, allowed := work.beginDescriptorSourceEnumeration(collection.facts, q, id, collection.owner)
				if !allowed {
					t.Fatal("real source enumeration issuer UNREACHED")
				}
				defer end()
				expired = q
				b := q.stagedMember
				original := b.returnResult
				b.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
					p := q.memberReceiverPreparation
					if p == nil || p.read == nil || !q.liveStagedMemberReceiverPreparation(call) || !work.descriptorSourceEnumerationOwned(q, resume.parent, p.cut) {
						t.Fatal("actual enumeration/ref/read interval UNREACHED")
					}
					seen++
					copied := *q
					if work.descriptorSourceEnumerationOwned(&copied, resume.parent, p.cut) {
						t.Fatal("copied query acquired enumeration issuer")
					}
					wrongCut := p.cut
					wrongCut.use = resume.parent.consumer
					if work.descriptorSourceEnumerationOwned(q, resume.parent, wrongCut) {
						t.Fatal("foreign physical cut acquired enumeration")
					}
					views, represented := work.descriptorSourceViewsAtEnumerationReading(q, data, reading, resume.parent, p.cut)
					if !represented || len(views) == 0 {
						t.Fatal("actual lexical SOURCE marker transfer UNREACHED")
					}
					return original(call, interest)
				}
				q.withDescriptorGetEffectsUse(resume.parent.producer.operation, func() { q.evaluatedSourceAccessors(resume.parent.producer.operation, nil) })
				if seen == 0 {
					t.Fatal("original source traversal/read callback UNREACHED")
				}
				end()
				if work.descriptorSourceEnumerationOwned(q, resume.parent, resume.cut) {
					t.Fatal("revoked enumeration issuer remained live")
				}
			}) {
				t.Fatal("maintained original source owner UNREACHED")
			}
			if expired == nil || work.descriptorSourceEnumerationOwned(expired, resume.parent, resume.cut) || work.operations[id.index].writerSourceRunning {
				t.Fatal("source execution/issuer escaped owning interval")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original typed source resumer/index/APPLIED connection UNREACHED")
		}
	})
}

// Source enumeration must retain actual prototype getter/body effects. A
// callable returned by that getter is dormant until a separate invocation.
func TestDescriptorSourceEnumerationPrototypeMutationDonors(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"getter", "export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}", true},
		{"immediate-call", "export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return (()=>document.title)()}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}", true},
		{"dormant-return", "export{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return ()=>document.title}});return typeof Object.getOwnPropertyDescriptor(value,'code')?.value}", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, row.browser)
				kind := descriptorStrictComparisonEffects
				if row.name == "dormant-return" {
					kind = descriptorTypeofEffects
				}
				assertOriginalDescriptorGetUseCurrent(t, collection, kind)
			})
		})
	}
}
