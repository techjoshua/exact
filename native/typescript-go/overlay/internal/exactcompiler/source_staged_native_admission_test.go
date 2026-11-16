package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This source journey tests central admission authority, independently of the
// adapter's source entry helper. No manually delivered native substitutes for
// the original member owner's actual pre-inventory callback.
func TestStagedNativeAlgorithmAdmissionSourceAuthority(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		declaration := enclosingCallableNode(call)
		request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{
			producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "native-admission-witness", cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
		work := callableEffectWork{extracting: -1}
		var saved func(sourceStagedNativeDescriptorPlan) bool
		var savedPlan sourceStagedNativeDescriptorPlan
		delivered := 0
		consumer := func(selection sourceStagedNativeSelection, admit func(sourceStagedNativeDescriptorPlan) bool) {
			delivered++
			sharedRevisions := map[sourceStagedOperationKey]uint64{}
			for key, id := range work.operationIDs {
				if key.selector.field == "callee-get" || key.selector.field == "eager-inputs" {
					sharedRevisions[key] = work.operations[id.index].revision
				}
			}
			if selection.selected.native == nil || selection.selected.native.kind != sourceNativeObjectDefineProperty {
				t.Fatal("not original selected standard alternative")
			}
			plan, ok := describeSelectedNativeDescriptor(selection, nil)
			if !ok {
				t.Fatal("source algorithm adapter refused")
			}
			initialRecipes := len(work.operationRecipes)
			initialStates := len(work.operations)
			for _, debt := range []string{"callee-get", "eager-inputs", "algorithm"} {
				required := nativeRootDebtRequest(work.operationRecipes[request.request.producer].nativeGet, debt)
				id, registered := work.operationIDs[required.producer]
				if !registered || !sameOperationRequest(work.operationRecipes[required.producer].nativeGet.request, request.request) || work.operations[id.index].subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}] == nil {
					t.Fatal("original root debt not registered before selected callback", debt)
				}
			}
			bad := plan
			bad.eager.key = request.request.producer
			if admit(bad) {
				t.Fatal("algorithm replaced root demand")
			}
			bad = plan
			bad.fields[0].request.cut.reading = declaration
			if admit(bad) {
				t.Fatal("wrong original field cut admitted")
			}
			bad = plan
			bad.fields[0].recipe.delta.effects = []EnvironmentEffectSource{environmentSource("browser", "window", "invoke")}
			if admit(bad) {
				t.Fatal("uncorrelated field payload acquired source authority")
			}
			bad = plan
			bad.fields[0].recipe.delta.extracted = true
			if admit(bad) {
				t.Fatal("empty field became completed by adapter assertion")
			}
			if len(work.operationRecipes) != initialRecipes || len(work.operations) != initialStates {
				t.Fatal("rejected admission left partial registrations")
			}
			reading := query.reading
			query.reading = declaration
			if admit(plan) {
				t.Fatal("changed live observation cut admitted")
			}
			query.reading = reading
			revokeNested, ok := query.beginStagedNativeGetSource(&work, facts, request)
			if !ok {
				t.Fatal("nested issuer refused")
			}
			if admit(plan) {
				t.Fatal("nested issuer inherited prior admission")
			}
			revokeNested()
			if !admit(plan) {
				t.Fatal("restored original issuer refused valid pending algorithm")
			}
			if len(work.operationRecipes) != initialRecipes+18 || len(work.operations) != initialStates+18 {
				t.Fatal("six fields and twelve source roles not registered atomically")
			}
			if !admit(plan) || len(work.operations) != initialStates+18 {
				t.Fatal("identical admission was not idempotent")
			}
			for _, field := range plan.fields {
				roles, valid := fieldSourceRequests(field.request)
				if !valid {
					t.Fatal("original field has no finite source roles")
				}
				for _, required := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
					id, registered := work.operationIDs[required.producer]
					if !registered || work.operations[id.index].revision != 0 || work.operations[id.index].delta.extracted || work.operations[id.index].subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}] == nil {
						t.Fatal("source debt missing or paid before original field traversal")
					}
				}
			}
			for key, revision := range sharedRevisions {
				if work.operations[work.operationIDs[key].index].revision != revision {
					t.Fatal("algorithm admission published an independent shared debt")
				}
			}
			saved, savedPlan = admit, plan
		}
		revoke, ok := query.beginStagedNativeGetSource(&work, facts, request, consumer)
		if !ok {
			t.Fatal("original Get issuer refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		if delivered != 1 || saved == nil {
			t.Fatal("original member owner did not deliver actual selected value")
		}
		if saved(savedPlan) {
			t.Fatal("saved admission retained callback authority after return")
		}
		work.prepareOperationUses(facts, query.executable)
		root := work.operationIDs[request.request.producer]
		for _, required := range work.operationRecipes[request.request.producer].delta.required {
			state := work.operations[work.operationIDs[required.producer].index]
			if required.producer.selector.field == "algorithm" {
				if !state.delta.extracted || len(state.dependencies) != 6 {
					t.Fatal("algorithm did not extract six owned pending requirements")
				}
			} else {
				source := work.operationRecipes[required.producer].nativeGet
				valid := state.revision > 0 && state.delta.extracted
				if required.producer.selector.field == "callee-get" {
					valid = valid && state.nativeCallee != nil && state.nativeCallee.generation == query.owner.generation && validStagedNativeCalleeEffects(*state.nativeCallee, source)
				} else {
					valid = valid && source.eager != nil && validStagedNativeEagerInputs(*source.eager, source)
				}
				if !valid {
					t.Fatal("completed shared debt lacks its independent original-owner proof")
				}
			}
		}
		for _, field := range savedPlan.fields {
			id := work.operationIDs[field.request.producer]
			if len(work.operations[id.index].dependencies) != 2 {
				t.Fatal("field extraction lost required writer/prototype memberships")
			}
			for _, dependency := range work.operations[id.index].dependencies {
				child := work.operations[dependency.producer.index]
				parent, sourceRole := fieldSourceParent(dependency.request)
				if !sourceRole || !sameOperationRequest(parent, field.request) || child.invalid {
					t.Fatal("source required edge lost its exact original field")
				}
				if dependency.request.producer.selector.field == "field-source:"+field.request.producer.selector.field+":prototype" && !child.delta.extracted {
					t.Fatal("source discovery failed to represent dormant callback source")
				}
			}
		}
		if !work.closedOperationDependencies()[root.index] {
			t.Fatal("represented dormant fields and independently proved shared debts failed to close")
		}
	})
}
