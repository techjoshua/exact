package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Supplied grants test loan lifetime/accounting only. Actual source closure is
// exercised separately below through the original member owners and work graph.
func TestStagedFieldSourceCoverageObservation(t *testing.T) {
	for _, mode := range []string{"granted", "refused", "revoked", "replaced-observation", "changed-phase", "copied-query", "wrong-phase", "sticky-refusal"} {
		t.Run(mode, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{})}`, func(query *sourceValueQuery, call *ast.Node) {
				observation := &sourceStagedFieldObservation{phase: stagedFieldObservationHas}
				receiver := restrictedInvocationArguments(call.AsCallExpression())[2]
				borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call), observation: observation}
				query.stagedFieldGet = borrow
				defer func() { query.stagedFieldGet = nil; borrow.issuer = nil; borrow.sourcesCovered = nil }()
				get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", hasOnly: true, stagedEffects: borrow}
				calls := 0
				borrow.sourcesCovered = func(issuer *sourceValueQuery, input *sourceGetInputs) bool {
					calls++
					if issuer != query || input != get {
						t.Fatal("callback lost original query/Get")
					}
					switch mode {
					case "refused":
						return false
					case "revoked":
						borrow.issuer = nil
					case "replaced-observation":
						borrow.observation = &sourceStagedFieldObservation{phase: stagedFieldObservationHas}
					case "changed-phase":
						observation.phase = stagedFieldObservationGet
					}
					return true
				}
				issuer := query
				if mode == "copied-query" {
					copy := *query
					issuer = &copy
				}
				if mode == "wrong-phase" {
					get.hasOnly = false
				}
				if mode == "sticky-refusal" {
					query.observeStagedFieldHas(get, propertyUnknown, sourceEffectsRefused, observation)
				}
				granted := issuer.observeStagedFieldSourceCoverage(get)
				want := mode == "granted" || mode == "sticky-refusal"
				if granted != want || observation.sourceHas != want || observation.sourceGet {
					t.Fatal("invalid grant or wrong-phase coverage recorded")
				}
				if !want {
					if observation.hasSeen || observation.getSeen {
						t.Fatal("refused or expired loan contributed accounting")
					}
					if (mode == "copied-query" || mode == "wrong-phase") && calls != 0 {
						t.Fatal("invalid issuer/phase reached source callback")
					}
					return
				}
				if observation.presence != propertyUnknown || observation.getSeen || len(observation.effects.invoked) != 0 {
					t.Fatal("Has source coverage invented presence, Get or invocation")
				}
				observation.phase = stagedFieldObservationGet
				get.hasOnly = false
				if !query.observeStagedFieldSourceCoverage(get) || !observation.sourceGet || !observation.getSeen || len(observation.effects.invoked) != 0 {
					t.Fatal("Get source coverage missing or invented invocation")
				}
				wantKind := stagedFieldDispositionSources
				if mode == "sticky-refusal" {
					wantKind = stagedFieldDispositionUnknown
				}
				if classifyStagedFieldObservation(observation) != wantKind {
					t.Fatal("source flags erased refused accounting or became selected data")
				}
				observation.phase = stagedFieldObservationFinished
				before := calls
				if query.observeStagedFieldSourceCoverage(get) || calls != before {
					t.Fatal("finished observation reused source loan")
				}
			})
		})
	}
}

func TestStagedFieldSourceCoverageClassification(t *testing.T) {
	observation := sourceStagedFieldObservation{presence: propertyUnknown, sourceHas: true, sourceGet: true, effects: sourceReflectiveFieldEffects{has: sourceEffectsAccounted, get: sourceEffectsAccounted}}
	if classifyStagedFieldObservation(&observation) != stagedFieldDispositionSources {
		t.Fatal("represented source Effects classified as a selected value")
	}
	observation.sourceGet = false
	if classifyStagedFieldObservation(&observation) != classifyStagedFieldDisposition(observation.presence, observation.effects) {
		t.Fatal("one source flag replaced original classifier")
	}
	observation.sourceGet = true
	observation.presence = propertyPresent
	if classifyStagedFieldObservation(&observation) != stagedFieldDispositionData {
		t.Fatal("positive selected data lost its existing classification")
	}
	observation.presence = propertyAbsent
	observation.effects.get = sourceEffectsBypassed
	if classifyStagedFieldObservation(&observation) != stagedFieldDispositionAbsent {
		t.Fatal("positive absence lost its existing classifier")
	}
	if classifyStagedFieldObservation(nil) != stagedFieldDispositionUnknown {
		t.Fatal("missing observation supplied coverage")
	}
}

// No callback outcomes are supplied. The quiet construction needs two original
// Effects source roles for every field and independently authenticated native roots.
func TestStagedFieldSourceCoverageOriginalReceipts(t *testing.T) {
	const source = `export function invoke(){return Object.defineProperty({},'run',{})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		registerInstallationSource(t, &work, facts, query, call)
		work.prepareOperationUses(facts, query.executable)
		closed := work.closedOperationDependencies()
		for _, field := range reflectiveDescriptorKeys {
			key := storedValueForwardingFieldKey(call, field, relativeDemandEffects)
			id, registered := work.operationIDs[key]
			if !registered {
				t.Fatalf("%s original field missing", field)
			}
			state := work.operations[id.index]
			receipt := state.fieldDisposition
			if receipt == nil || receipt.kind != stagedFieldDispositionSources || receipt.has != sourceEffectsAccounted || receipt.get != sourceEffectsAccounted || len(receipt.invoked) != 0 {
				t.Fatalf("%s lacks source-owned Has/Get Effects receipt: %#v", field, receipt)
			}
			if !state.delta.extracted || !closed[id.index] {
				t.Fatalf("%s represented source Effects did not close", field)
			}
			valueKey := key
			valueKey.kind = relativeDemandDirectExposure
			if len(work.operationRecipes[valueKey].delta.exposures) != 0 {
				t.Fatal("source Effects supplied a Value alternative")
			}
		}
		root := sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call, kind: relativeDemandEffects}
		rootID, registered := work.operationIDs[root]
		if !registered || !closed[rootID.index] {
			t.Fatal("represented fields and independent native owners did not close root")
		}
		sourceOwner := work.operationRecipes[root].nativeGet
		if sourceOwner == nil {
			t.Fatal("closed root lost original source relationship")
		}
		calleeKey := nativeRootDebtRequest(sourceOwner, "callee-get").producer
		calleeID, registered := work.operationIDs[calleeKey]
		if !registered {
			t.Fatal("original callee owner missing")
		}
		calleeRecipe := work.operationRecipes[calleeKey]
		callee := work.operations[calleeID.index]
		if !closed[calleeID.index] || !callee.delta.extracted || calleeRecipe.delta.extracted || callee.nativeCallee == nil || callee.nativeCallee.generation != work.operationGeneration || callee.nativeCallee.generation != query.owner.generation || !validStagedNativeCalleeEffects(*callee.nativeCallee, calleeRecipe.nativeGet) {
			t.Fatal("closed root lacks current graph original Get proof")
		}
		eagerKey := nativeRootDebtRequest(sourceOwner, "eager-inputs").producer
		eagerID, registered := work.operationIDs[eagerKey]
		if !registered {
			t.Fatal("independent eager owner missing")
		}
		eager := work.operationRecipes[eagerKey].nativeGet
		if !closed[eagerID.index] || !work.operations[eagerID.index].delta.extracted || eager == nil || eager.eager == nil || !sameOperationRequest(eager.request, sourceOwner.request) || !validStagedNativeEagerInputs(*eager.eager, eager) {
			t.Fatal("closed root lacks independent original eager proof")
		}
	})
}

func TestStagedFieldSourceCoverageUnsupportedConstruction(t *testing.T) {
	for _, source := range []string{
		`declare const extras:PropertyDescriptor;export function invoke(){return Object.defineProperty({},'run',{...extras})}`,
		`export function invoke(){const key='value';return Object.defineProperty({},'run',{[key]:1})}`,
		`declare global{interface PropertyDescriptor{__proto__?:null}}export function invoke(){return Object.defineProperty({},'run',{__proto__:null})}`,
		`declare function mutate(value:object):void;export function invoke(){mutate(Object.prototype);return Object.defineProperty({},'run',{})}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
			facts := installationSourceFacts(query)
			work := callableEffectWork{extracting: -1}
			registerInstallationSource(t, &work, facts, query, call)
			work.prepareOperationUses(facts, query.executable)
			closed := work.closedOperationDependencies()
			rootKey := sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call, kind: relativeDemandEffects}
			root, registered := work.operationIDs[rootKey]
			if !registered || closed[root.index] {
				t.Fatal("unsupported construction lost its original pending root")
			}
			pendingSource := false
			for _, field := range reflectiveDescriptorKeys {
				key := storedValueForwardingFieldKey(call, field, relativeDemandEffects)
				id, registered := work.operationIDs[key]
				if !registered {
					continue
				}
				// Finite source discovery can now account a local field prefix.
				// Its actual unresolved source children still prevent closure.
				roles, valid := fieldSourceRequests(nativeDescriptorFieldRequest(work.operationRecipes[key].nativeGet, field))
				if !valid {
					t.Fatal("original field lost its finite source roles")
				}
				for _, role := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
					if child, issued := work.operationIDs[role.producer]; issued && !closed[child.index] && !closed[id.index] {
						for _, required := range work.operationRecipes[role.producer].delta.required {
							if dependency, exists := work.operationIDs[required.producer]; exists && !closed[dependency.index] {
								pendingSource = true
							}
						}
					}
				}
			}
			if !pendingSource {
				t.Fatal("unsupported construction lost its actual pending source child")
			}
		})
	}
}
