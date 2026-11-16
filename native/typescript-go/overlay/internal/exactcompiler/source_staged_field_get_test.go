package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This runs the actual native source issuer, then the original Get owner. Only
// its selected zero-argument accessor binder can deliver the detached receiver.
// The existing summary fixed point, rather than recursive Get body execution,
// supplies the known body effect. The unrelated original debts remain pending.
func TestStagedFieldGetSourceBodyConsumer(t *testing.T) {
	for _, row := range []struct {
		name, source string
		transferred  bool
	}{
		{"throwing getter", `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, true},
		{"empty declaration inventory", `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, true},
		{"late summary", `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, true},
		{"known and unknown", `declare function foreign():void;export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;foreign();throw 1}})}`, true},
		{"dormant returned callback", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, true},
		{"receiver remains mapped pending", `export function invoke(){return Object.defineProperty({},'run',{get value():never{void this;window.name;throw 1}})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "field-get-body", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, ok := beginStagedNativeDescriptorSource(query, &work, facts, request)
				if !ok {
					t.Fatal("source issuer refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				getterNode := request.descriptorGet.AsObjectLiteralExpression().Properties.Nodes[0]
				if row.name == "late summary" {
					// Hold the queued canonical producer while the real Get binds.
					facts[work.memberNodes[getterNode]].staged.ready = false
				}
				if row.name == "empty declaration inventory" {
					// Omit the availability inventory, not the source getter. Only
					// the original Get may rediscover and bind this alternative.
					key := request.request.producer
					key.selector = sourceStagedOperationSelector{occurrence: request.descriptorGet, field: "value"}
					id := work.operationIDs[key]
					work.prepareFieldGetterRequirements(facts, id, query.executable)
					work.operations[id.index].getters = nil
				}
				work.prepareOperationUses(facts, query.executable)
				if row.name == "late summary" {
					before := query.executable.values.work
					key := request.request.producer
					key.selector = sourceStagedOperationSelector{occurrence: request.descriptorGet, field: "value"}
					getters := work.operations[work.operationIDs[key].index].getters
					if len(getters) != 1 || getters[0].inputs == nil || getters[0].bodyTransferred {
						t.Fatal("body readiness became an acquisition prerequisite")
					}
					facts[work.memberNodes[getterNode]].staged.ready = true
					work.prepareOperationUses(facts, query.executable)
					if query.executable.values.work != before {
						t.Fatal("late summary replayed original Get acquisition")
					}
				}
				key := request.request.producer
				key.selector = sourceStagedOperationSelector{occurrence: request.descriptorGet, field: "value"}
				id := work.operationIDs[key]
				state := &work.operations[id.index]
				if len(state.getters) != 1 {
					t.Fatalf("missing source getter: %#v", state.getters)
				}
				getter := state.getters[0]
				if getter.inputs == nil || !getter.inputs.delivered || getter.receiverPending || getter.selectionPending || getter.bodyTransferred != row.transferred {
					t.Fatalf("original Get did not transfer receiver/body: %#v", getter)
				}
				bound := getter.inputs.bound
				if len(bound.bindings) != 1 || len(bound.bindings[0].sources) != 1 || bound.bindings[0].target.kind != relativeRoleReceiver || bound.bindings[0].sources[0].expression != request.descriptorGet || bound.cut.operation != call || bound.cut.reading != call {
					t.Fatalf("wrong Get receiver or original cut: %#v", bound)
				}
				if query.inputs != nil || query.operation != nil || !state.delta.extracted || state.revision == 0 || state.fieldDisposition == nil || state.fieldDisposition.kind != stagedFieldDispositionGetter || work.closedOperationDependencies()[id.index] {
					t.Fatalf("accounted getter local=%t closed=%t disposition=%#v inputsDelivered=%t receiver=%#v boundCut=%#v", state.delta.extracted, work.closedOperationDependencies()[id.index], state.fieldDisposition, getter.inputs.delivered, getter.demand.receiver, getter.inputs.bound.cut)
				}
				// Publication/final artifact decisions must still wait for callee Get,
				// eager inputs and all six independent field/effect dispositions.
				for _, role := range []string{"callee-get", "eager-inputs"} {
					debt := request.request.producer
					debt.selector = sourceStagedOperationSelector{occurrence: request.get, field: role}
					d := work.operations[work.operationIDs[debt].index]
					if d.delta.extracted {
						recipe := work.operationRecipes[debt]
						if role == "callee-get" && (d.nativeCallee == nil || !validStagedNativeCalleeEffects(*d.nativeCallee, recipe.nativeGet)) || role == "eager-inputs" && (recipe.nativeGet.eager == nil || !validStagedNativeEagerInputs(*recipe.nativeGet.eager, recipe.nativeGet)) {
							t.Fatal("getter paid independent debt without its original owner proof")
						}
					}
				}
				if row.transferred {
					pending := resolveCallableEffects(facts, query.executable)
					parent := facts[work.memberNodes[declaration]]
					copy := cloneProjectCallableFact(parent)
					copy.fieldEdgeOperations["independent-delivery"] = call
					if _, leaked := parent.fieldEdgeOperations["independent-delivery"]; leaked {
						t.Fatal("late Get operation association mutated another graph")
					}
					known, unknown, dormant := false, false, false
					for _, effect := range parent.summary.EffectSources {
						known = known || effect.Environment == "browser" && effect.Description == "window"
						unknown = unknown || effect.Environment == "unknown"
						dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
					}
					if !known || dormant || row.name == "known and unknown" && !unknown || len(pending) == 0 {
						t.Fatalf("known/unknown/pending contributions lost: known=%t unknown=%t pending=%d effects=%#v", known, unknown, len(pending), parent.summary.EffectSources)
					}
				}
			})
		})
	}
}

// These negatives exercise the new synchronous capability, independently of the
// source-produced positive above. Copied queries and a different Get cannot use
// its callback, and revocation destroys callback authority rather than a fact.
func TestStagedFieldGetBorrowIsolation(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, func(query *sourceValueQuery, call *ast.Node) {
		descriptor := restrictedInvocationArguments(call.AsCallExpression())[2]
		body := descriptor.AsObjectLiteralExpression().Properties.Nodes[0]
		deliveries := 0
		borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: descriptor, field: "value", cut: query.relativeInputCut(call), consume: func(*ast.Node, sourceRelativeBoundInputs) bool { deliveries++; return true }}
		query.stagedFieldGet = borrow
		defer func() { query.stagedFieldGet = nil }()
		get := &sourceGetInputs{operation: call, receiver: sourceValue{node: descriptor}, propertyKey: "value", stagedEffects: borrow}
		result := accessorCandidates{}
		copied := *query
		if copied.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &result) || deliveries != 0 {
			t.Fatal("copied query inherited issuer")
		}
		other := *get
		other.propertyKey = "get"
		if query.transferStagedFieldGetter(body, &other, acquiredCallableScope{}, &result) || deliveries != 0 {
			t.Fatal("other field inherited issuer")
		}
		query.dependenciesOnly = false
		if query.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &result) || deliveries != 0 {
			t.Fatal("normal query inherited Effects-only authority")
		}
		query.dependenciesOnly = true
		originalGeneration := borrow.generation
		borrow.generation = &projectGeneration{}
		if query.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &result) || deliveries != 0 {
			t.Fatal("expired generation inherited issuer")
		}
		borrow.generation = originalGeneration
		if !query.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &result) || deliveries != 1 || !result.valueIncomplete || query.inputs != nil || query.operation != nil || len(result.effects) != 0 || len(result.values) != 0 || len(result.normalCalls) != 0 {
			t.Fatal("original binder did not yield without normal authority")
		}
		borrow.consume = func(*ast.Node, sourceRelativeBoundInputs) bool { return false }
		refused := accessorCandidates{}
		if query.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &refused) || refused.valueIncomplete {
			t.Fatal("unadmitted body lost its original Get consumer")
		}
		borrow.issuer, borrow.consume = nil, nil
		if query.transferStagedFieldGetter(body, get, acquiredCallableScope{}, &result) || deliveries != 1 {
			t.Fatal("revoked borrow retained callback authority")
		}
	})
}
