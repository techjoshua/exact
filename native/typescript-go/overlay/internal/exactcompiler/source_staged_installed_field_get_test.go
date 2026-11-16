package exactcompiler

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Actual original member owners publish both source operations. The later Get,
// not registration or stored callback creation, requests the installed getter.
// Reverse registration exercises late source delivery without replaying a query.
func TestStagedInstalledFieldGetSourceJourney(t *testing.T) {
	const source = `export function invoke(){Object.defineProperty(Object.prototype,'value',{configurable:true,get:()=>window.name});return Object.defineProperty({},'run',{})}`
	var definition string
	for _, reverse := range []bool{false, true} {
		for _, packageType := range []string{"application", "library"} {
			withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, reader *ast.Node) {
				facts := installationSourceFacts(query)
				var writer *ast.Node
				walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && node != reader {
						writer = node
					}
					return !ast.IsFunctionLike(node)
				})
				if writer == nil {
					t.Fatal("missing source installation")
				}
				work := callableEffectWork{extracting: -1}
				calls := []*ast.Node{writer, reader}
				if reverse {
					calls[0], calls[1] = calls[1], calls[0]
				}
				for _, call := range calls {
					registerInstallationSource(t, &work, facts, query, call)
				}
				work.prepareOperationUses(facts, query.executable)
				key := sourceStagedOperationKey{declaration: enclosingCallableNode(reader), operation: reader, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: restrictedInvocationArguments(reader.AsCallExpression())[2], field: "value"}}
				state := work.operations[work.operationIDs[key].index]
				if len(state.getters) != 1 || state.getters[0].installed == nil || state.getters[0].declaration == nil || state.getters[0].inputs != nil {
					t.Fatalf("original Get did not consume source installation/exposure: %#v", state.getters)
				}
				getter := state.getters[0]
				for _, use := range facts[work.memberNodes[key.declaration]].staged.operationUses {
					if use.installed == nil {
						continue
					}
					wrong := use.request
					wrong.reading.selector.field = "get"
					if _, admitted := work.requireOperation(facts, wrong); admitted {
						t.Fatal("another field Get inherited installation exposure")
					}
					ordinary := use
					ordinary.installed = nil
					ordinary.call = reader
					if work.registerOperationUse(facts, ordinary) {
						t.Fatal("stored exposure became an ordinary invocation capability")
					}
				}
				payload, err := json.Marshal(facts[work.memberNodes[getter.declaration]].summary.EffectSources)
				if err != nil {
					t.Fatal(err)
				}
				if definition == "" {
					definition = string(payload)
				} else if definition != string(payload) {
					t.Fatal("public getter EffectSources changed with caller package or registration order")
				}
				if !getter.bodyTransferred || getter.installed.get.cut.operation != reader || getter.installed.get.receiver.expression != key.selector.occurrence {
					t.Fatal("actual Get did not transfer its known contribution or original receiver/cut was lost")
				}
				exposure := work.operations[getter.installed.exposure.index]
				if len(exposure.delta.exposures) != 1 || exposure.delta.exposures[0].endpoint.expression != getter.declaration || !exposure.delta.extracted || len(exposure.delta.required) != 3 {
					t.Fatal("known stored callable lost or partial source coverage became complete")
				}
				for _, required := range exposure.delta.required[1:] {
					if required.producer.kind != relativeDemandDirectExposure {
						t.Fatal("value projection used an Effects-only prerequisite")
					}
					childID, registered := work.operationIDs[required.producer]
					if !registered || childID.index == 0 {
						t.Fatal("required value projection missing before publication")
					}
					child := work.operations[childID.index]
					if child.delta.extracted || work.closedOperationDependencies()[work.operationIDs[required.producer].index] {
						t.Fatal("unrepresented writer/prototype values became complete")
					}
				}
				found := false
				for _, call := range facts[work.memberNodes[key.declaration]].summary.Calls {
					found = found || call.ID == getter.edge && call.TargetID == facts[work.memberNodes[getter.declaration]].summary.ID
				}
				if !found {
					t.Fatal("known installed getter did not reach the actual Get's canonical effect consumer")
				}
				if len(resolveCallableEffects(facts, query.executable)) == 0 {
					t.Fatal("known effect transfer paid pending value/installation/eager obligations")
				}
				browser := false
				for _, effect := range facts[work.memberNodes[key.declaration]].summary.EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
				}
				if !browser {
					t.Fatal("actual installed Get lost known browser donor while independent obligations remained pending")
				}

				if work.closedOperationDependencies()[work.operationIDs[key].index] {
					t.Fatal("pending installation/exposure became field ACK")
				}
				// Only semantic metadata, not an allocation address, fingerprints the
				// original source installation and issuing Get association.
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				cloned := make([]callableFacts, len(facts))
				for index := range facts {
					cloned[index] = cloneProjectCallableFact(facts[index])
					for slot := range cloned[index].staged.operationRecipes {
						recipe := &cloned[index].staged.operationRecipes[slot]
						if recipe.nativeGet != nil && recipe.nativeGet.installation != nil {
							metadata := *recipe.nativeGet
							copy := *metadata.installation
							metadata.installation = &copy
							recipe.nativeGet = &metadata
						}
					}
					for slot := range cloned[index].staged.operationUses {
						use := &cloned[index].staged.operationUses[slot]
						if use.installed != nil {
							copy := *use.installed
							use.installed = &copy
						}
					}
				}
				if before != callableAnalysisFingerprint(callableAnalysis{facts: cloned}) {
					t.Fatal("equivalent cloned source Get changed fingerprint")
				}
				other := callableEffectWork{extracting: -1}
				other.prepareOperationUses(cloned, query.executable)
				copyState := other.operations[other.operationIDs[key].index]
				if len(copyState.getters) != 1 || copyState.getters[0].installed == nil || copyState.getters[0].installed.exposure.epoch == getter.installed.exposure.epoch {
					t.Fatal("clone lost conditional consumer or retained old graph authority")
				}
			}, packageType)
		}
	}
}

func registerInstallationSource(t *testing.T, work *callableEffectWork, facts []callableFacts, parent *sourceValueQuery, call *ast.Node) {
	t.Helper()
	query := newSourceDependencyQuery(call, parent.owner.checker, parent.executable, enclosingCallableNode(call))
	defer query.publishDependencyStatistics()
	request := installationSourceRequest(call)
	request.request.edge = fmt.Sprintf("installed-source:%d", call.Pos())
	revoke, installed := beginStagedNativeDescriptorSource(query, work, facts, request)
	if !installed {
		t.Fatal("original source native owner refused")
	}
	defer revoke()
	query.receiverCandidates(call, nil)
}

// A native source relationship in another dormant callable cannot install a
// getter in the current activation. Source discovery retains it pending.
func TestStagedInstalledFieldGetUnrelatedSources(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"dormant factory", `function dormant(){Object.defineProperty(Object.prototype,'value',{get:()=>window.name})}export function invoke(){return Object.defineProperty({},'run',{})}`},
		{"ordinary receiver", `export function invoke(){const other={};Object.defineProperty(other,'value',{get:()=>window.name});return Object.defineProperty({},'run',{})}`},
		{"different field", `export function invoke(){Object.defineProperty(Object.prototype,'unrelated',{get:()=>window.name});return Object.defineProperty({},'run',{})}`},
		{"own data shadows prototype", `export function invoke(){Object.defineProperty(Object.prototype,'value',{get:()=>window.name});return Object.defineProperty({},'run',{value:1})}`},
		{"unmapped capture", `export function invoke(callback:()=>string){Object.defineProperty(Object.prototype,'value',{get:()=>callback()});return Object.defineProperty({},'run',{})}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, reader *ast.Node) {
				facts := installationSourceFacts(query)
				work := callableEffectWork{extracting: -1}
				walkNode(ast.GetSourceFileOfNode(reader).AsNode(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && (ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty") {
						registerInstallationSource(t, &work, facts, query, node)
					}
					return true
				})
				work.prepareOperationUses(facts, query.executable)
				key := sourceStagedOperationKey{declaration: enclosingCallableNode(reader), operation: reader, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: restrictedInvocationArguments(reader.AsCallExpression())[2], field: "value"}}
				if len(work.operations[work.operationIDs[key].index].getters) != 0 {
					t.Fatal("unrelated, shadowed or unsupported source created an actual Get obligation")
				}
			})
		})
	}
}

// This isolates the live publisher boundary over source-derived AST and a real
// selected-native admission. Events are supplied here, rather than claimed as
// original Has/Get proof. The source journey above supplies that separate proof.
func TestStagedFieldCallableExposureIssuer(t *testing.T) {
	const source = `export function invoke(){return Object.defineProperty({},'run',{get:()=>window.name,set:()=>document.title})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		registerInstallationSource(t, &work, facts, query, call)
		descriptor := restrictedInvocationArguments(call.AsCallExpression())[2]
		key := sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: descriptor, field: "get"}}
		id := work.operationIDs[key]
		work.prepareFieldGetterRequirements(facts, id, query.executable)
		demand := *work.operations[id.index].effectsDemand
		cut := query.relativeInputCut(call)
		observation := &sourceStagedFieldObservation{phase: stagedFieldObservationGet}
		borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: descriptor, field: "get", cut: cut, observation: observation}
		get := &sourceGetInputs{operation: call, receiver: sourceValue{node: descriptor}, propertyKey: "get", stagedEffects: borrow}
		prior := query.stagedFieldGet
		query.stagedFieldGet = borrow
		defer func() { query.stagedFieldGet = prior; borrow.issuer = nil }()
		value := descriptor.AsObjectLiteralExpression().Properties.Nodes[0].AsPropertyAssignment().Initializer
		sibling := descriptor.AsObjectLiteralExpression().Properties.Nodes[1].AsPropertyAssignment().Initializer
		publish := func(issuer *sourceValueQuery, value *ast.Node, use sourceRelativeCut) bool {
			return work.recordFieldCallableExposure(facts, id, demand, issuer, get, value, use, query.executable)
		}
		copy := *query
		if publish(&copy, value, cut) || publish(query, sibling, cut) {
			t.Fatal("copied query or another field inherited exposure authority")
		}
		wrong := cut
		wrong.reading = value
		if publish(query, value, wrong) {
			t.Fatal("different acquisition cut published a callable")
		}
		if !publish(query, value, cut) {
			t.Fatal("original live source publication refused")
		}
		exposureKey := key
		exposureKey.kind = relativeDemandDirectExposure
		if _, demanded := work.operationIDs[exposureKey]; demanded {
			t.Fatal("stored source callable demanded invocation/exposure by publication alone")
		}
		observation.phase = stagedFieldObservationFinished
		if publish(query, value, cut) {
			t.Fatal("finished source observation retained publication authority")
		}
		observation.phase = stagedFieldObservationGet
		borrow.issuer = nil
		if publish(query, value, cut) {
			t.Fatal("expired source observation retained publication authority")
		}
	})
}
