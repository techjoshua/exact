package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These source journeys enter through the actual selected member owner. Source
// role membership precedes field traversal. Discovery publishes only its local
// coverage and mapped debts, never normal property absence or algorithm ACK.
func TestStagedFieldSourceWorkOriginalOwner(t *testing.T) {
	for _, row := range []struct {
		source                   string
		baseline, prototypeReady bool
		bodyField                string
	}{
		{`export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, true, true, "value"},
		{`declare function mutate():void;export function invoke(){mutate();return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, true, false, ""},
		{`export function invoke(){return Object.defineProperty({},'run',{value:1})}`, true, true, ""},
		{`declare global {interface PropertyDescriptor {__proto__?:null}}export function invoke(){return Object.defineProperty({},'run',{__proto__:null,value:1})}`, false, false, ""},
		{`Object.defineProperty(Object.prototype,'enumerable',{get(){window.name;return false}});export function invoke(){return Object.defineProperty({},'run',{value:1})}`, true, false, ""},
	} {
		withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
			facts := installationSourceFacts(query)
			declaration := enclosingCallableNode(call)
			root := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "field-source-work", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
			request := sourceStagedNativeRequest{request: root, call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2]}
			work := callableEffectWork{extracting: -1}
			revoke, installed := beginStagedNativeDescriptorSource(query, &work, facts, request)
			if !installed {
				t.Fatal("original source issuer refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			work.prepareOperationUses(facts, query.executable)
			for _, field := range reflectiveDescriptorKeys {
				parent := root
				parent.producer.selector = sourceStagedOperationSelector{occurrence: request.descriptorGet, field: field}
				roles, valid := fieldSourceRequests(parent)
				if !valid {
					t.Fatal("finite role description refused")
				}
				writers := work.operations[work.operationIDs[roles.ownWriters.producer].index]
				prototype := work.operations[work.operationIDs[roles.prototype.producer].index]
				if writers.revision == 0 || !writers.delta.extracted || len(writers.delta.effects)+len(writers.delta.residuals)+len(writers.delta.invoked) != 0 {
					t.Fatal("original writer discovery did not publish independent local coverage")
				}
				if stagedLiteralStandardPrototype(work.operationRecipes[parent.producer].nativeGet, request.descriptorGet) != row.baseline {
					t.Fatal("conditional standard baseline lost or granted to an explicit prototype link")
				}
				requiredCount := 2
				if row.bodyField != "" {
					requiredCount++
					expectedBody := nativeDescriptorFieldRequest(work.operationRecipes[parent.producer].nativeGet, row.bodyField)
					if len(prototype.delta.required) < requiredCount || !sameOperationRequest(prototype.delta.required[2], expectedBody) {
						t.Fatal("dormant body source lost its exact field requirement")
					}
				}
				receipt := work.operations[work.operationIDs[parent.producer].index].fieldDisposition
				if receipt == nil {
					t.Fatal("original Has/Get receipt missing")
				}
				for _, phase := range []sourceStagedFieldObservationPhase{stagedFieldObservationHas, stagedFieldObservationGet} {
					context, valid := stagedFieldMemberRequest(parent, phase)
					if !valid {
						t.Fatal("original field source context refused")
					}
					expected := stagedMemberCoverageRequest(context, request.descriptorGet, receipt.cut)
					for _, state := range []sourceStagedOperationState{writers, prototype} {
						found := false
						for _, child := range state.delta.required {
							found = found || sameOperationRequest(child, expected)
						}
						if !found {
							t.Fatal("source role lost its exact original Has/Get source child")
						}
					}
					requiredCount++
				}
				if prototype.revision == 0 || (row.prototypeReady && !prototype.delta.extracted || !row.baseline && prototype.delta.extracted) || len(prototype.delta.required) != requiredCount || len(prototype.dependencies) != requiredCount || len(prototype.delta.residuals) != 0 {
					t.Fatalf("source=%s field=%s extracted=%t want=%t revision=%d required=%d dependencies=%d residuals=%d", row.source, field, prototype.delta.extracted, row.prototypeReady, prototype.revision, len(prototype.delta.required), len(prototype.dependencies), len(prototype.delta.residuals))
				}
				for index, role := range []string{"callee-get", "eager-inputs"} {
					expected := root
					expected.producer.selector = sourceStagedOperationSelector{occurrence: request.get, field: role}
					expected.edge += ":" + role
					if !sameOperationRequest(prototype.delta.required[index], expected) {
						t.Fatal("original selected algorithm lost independent eager debt")
					}
				}
				closed := work.closedOperationDependencies()
				if closed[work.operationIDs[parent.producer].index] != row.prototypeReady {
					t.Fatal("field settlement disagrees with independent source and shared debt coverage")
				}
				if !row.prototypeReady {
					if closed[work.operationIDs[root.producer].index] {
						t.Fatal("unresolved field source allowed original root closure")
					}
					if prototype.delta.extracted {
						// A finite local source disposition is independent of the
						// actual semantic exit still required by its source children.
						seen := make(map[sourceStagedOperationKey]bool)
						pending := false
						var inspect func(sourceStagedOperationRequest)
						inspect = func(child sourceStagedOperationRequest) {
							if seen[child.producer] {
								return
							}
							seen[child.producer] = true
							id, registered := work.operationIDs[child.producer]
							if !registered || closed[id.index] {
								return
							}
							pending = pending || child.producer.operation != nil && child.producer.operation != call
							for _, required := range work.operationRecipes[child.producer].delta.required {
								inspect(required)
							}
						}
						for _, child := range prototype.delta.required {
							inspect(child)
						}
						if !pending {
							t.Fatal("local source extraction lost its actual unclosed semantic exit")
						}
					}
				}
			}
			// A merged graph rebuilds source memberships and delivery cursors. Its
			// source-owner status comes from immutable descriptions, not a query.
			cloned := make([]callableFacts, len(facts))
			for index := range facts {
				cloned[index] = cloneProjectCallableFact(facts[index])
			}
			other := callableEffectWork{extracting: -1}
			other.prepareOperationUses(cloned, query.executable)
			if other.operationEpoch == work.operationEpoch {
				t.Fatal("clone inherited live source operation IDs")
			}
			for key, id := range work.operationIDs {
				if _, role := fieldSourceParent(sourceStagedOperationRequest{producer: key}); !role {
					continue
				}
				copyID, present := other.operationIDs[key]
				if !present || other.operations[copyID.index].delta.extracted != work.operations[id.index].delta.extracted || !operationDeltaPrefix(other.operations[copyID.index].delta, work.operations[id.index].delta) || !operationDeltaPrefix(work.operations[id.index].delta, other.operations[copyID.index].delta) {
					t.Fatal("clone lost admitted source prefix or local disposition")
				}
			}
		})
	}
}
