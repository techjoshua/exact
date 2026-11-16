package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedNativeTargetCompositionSource = `
export function direct(prototype:object|null){return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',{value:()=>window.name,enumerable:true}))}
export function saved(prototype:object|null){const target=Object.create(prototype);const descriptor={value:()=>document.title,enumerable:true};return Object.freeze(Object.freeze(Object.defineProperty(target,'callback',descriptor)))}
`

// Native target composition preserves child Effects and conditional ordinary
// results, while installing a callback does not invoke its dormant body.
func TestStagedNativeTargetCompositionSessionAndArtifacts(t *testing.T) {
	var completed *Session
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		if target == TargetClient {
			completed = session
		}
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/native-target-composition.ts", Source: stagedNativeTargetCompositionSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		for _, name := range []string{"direct", "saved"} {
			for _, effect := range executableSummary(t, response, name).EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatalf("%s invoked a stored descriptor or lost target coverage: %#v", name, effect)
				}
			}
		}
		seen := make(map[string]bool)
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			for _, analysis := range project.callableCache.bySource {
				for _, fact := range analysis.facts {
					name := fact.summary.Name
					if fact.sourceFile == nil || fact.sourceFile.FileName() != "/virtual/native-target-composition.ts" || name != "direct" && name != "saved" {
						continue
					}
					seen[name] = true
					if !fact.staged.settled || fact.staged.operationsPending {
						t.Fatalf("%s native target chain was not published closed", name)
					}
					recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
					for _, recipe := range fact.staged.operationRecipes {
						recipes[recipe.key] = recipe
					}
					roots := make(map[*ast.Node]*sourceStagedNativeGetSource)
					for _, use := range fact.staged.operationUses {
						root := recipes[use.request.producer]
						if use.call == nil && root.nativeGet != nil && root.key.selector == (sourceStagedOperationSelector{}) && sameOperationRequest(root.nativeGet.request, use.request) {
							roots[root.key.operation] = root.nativeGet
						}
					}
					want := 3
					if name == "saved" {
						want = 4
					}
					if len(roots) != want {
						t.Fatalf("%s used legacy instead of all original native roots: got %d want %d", name, len(roots), want)
					}
					for _, root := range roots {
						algorithm := recipes[nativeRootDebtRequest(root, "algorithm").producer]
						if !validNativeGetRecipe(algorithm) || !sameNativeGetSource(algorithm.nativeGet, root) || root.kind != sourceNativeObjectDefineProperty && !algorithm.delta.extracted {
							t.Fatalf("%s original native algorithm not delivered", name)
						}
						if root.kind != sourceNativeObjectDefineProperty {
							continue
						}
						source := algorithm.nativeGet
						actuals := restrictedInvocationArguments(root.request.producer.operation.AsCallExpression())
						if source.installation == nil || len(actuals) != 3 || source.descriptorGet != actuals[2] || source.installation.descriptor.expression != actuals[2] || len(algorithm.delta.required) != len(reflectiveDescriptorKeys) {
							t.Fatalf("%s descriptor algorithm lost original field owner", name)
						}
						for i, field := range reflectiveDescriptorKeys {
							if !sameOperationRequest(algorithm.delta.required[i], nativeDescriptorFieldRequest(source, field)) {
								t.Fatalf("%s missing exact original %s field requirement", name, field)
							}
						}
						eager := recipes[nativeRootDebtRequest(source, "eager-inputs").producer]
						expected := nativeEagerRequired(eager.nativeGet)
						if len(eager.delta.required) != len(expected) || !operationPrefix(eager.delta.required, expected, sameOperationRequest) {
							t.Fatalf("%s eager role lost original target/DATA children", name)
						}
						if !validNativeTargetSource(source) || roots[source.targetSource.producer.operation] == nil {
							t.Fatalf("%s original target child association missing", name)
						}
						debt := recipes[nativeEagerTargetRequest(source).producer]
						if !debt.delta.extracted || len(debt.delta.required) != 1 || !sameOperationRequest(debt.delta.required[0], source.targetSource) {
							t.Fatalf("%s target source did not retain full child Effects", name)
						}
						if name == "saved" && source.targetBinding == nil || name == "direct" && source.targetBinding != nil {
							t.Fatalf("%s target binding association changed", name)
						}
					}
				}
			}
		}
		if !seen["direct"] || !seen["saved"] {
			t.Fatal("actual Session source facts missing")
		}
		file := filepath.Join(t.TempDir(), "native-target-composition.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('window');return 'w'}};globalThis.document={get title(){events.push('document');return 'd'}};const m=await import(pathToFileURL(process.argv[1]).href);const prototype={inherited:1};Object.defineProperty(prototype,'callback',{set(){throw 'inherited-target-setter'}});assert.throws(()=>m.direct(1),TypeError);assert.deepEqual(events,[]);const a=m.direct(prototype);const b=m.saved(null);assert.deepEqual(events,[]);assert.equal(Object.getPrototypeOf(a),prototype);assert.equal(Object.getPrototypeOf(b),null);assert.equal(Object.isFrozen(a),true);assert.equal(Object.isFrozen(b),true);assert.equal(a.callback(),'w');assert.equal(b.callback(),'d');assert.deepEqual(events,['window','document']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
	checkNativeTargetCompletedClone(t, completed)
}

// Description carries the original dependency without lending a current result
// law. Only actual adoption supplies the strong Get receipt at every hop.
func TestStagedNativeTargetCompositionOriginalSource(t *testing.T) {
	for name, source := range map[string]string{
		"single":        `function factory(){return 0}export function invoke(){return Object.freeze(Object.defineProperty(Object.create(null),'callback',{value:()=>window.name}))}factory()`,
		"nested_direct": `function factory(){return 0}export function invoke(){return Object.freeze(Object.freeze(Object.defineProperty(Object.create(null),'callback',{value:()=>window.name})))}factory()`,
		"nested_saved":  `function factory(){return 0}export function invoke(){const target=Object.create(null);const descriptor={value:()=>window.name};return Object.freeze(Object.freeze(Object.defineProperty(target,'callback',descriptor)))}factory()`,
	} {
		t.Run(name, func(t *testing.T) {
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
				file := ast.GetSourceFileOfNode(call)
				facts := stagedReturnSourceFacts(file)
				work := registerCallableEffectWork(facts)
				var parent, child *ast.Node
				caller := -1
				for i, fact := range facts {
					if fact.summary.Name == "invoke" {
						caller = i
						statements := fact.node.Body().AsBlock().Statements.Nodes
						parent = statements[len(statements)-1].AsReturnStatement().Expression
					}
				}
				if caller < 0 {
					t.Fatal("original consumer absent")
				}
				occurrence, supported := work.describeNativeInputOccurrence(facts, caller, parent, owner)
				if !supported || occurrence.child == nil || occurrence.child.child == nil {
					for key, recipe := range work.operationRecipes {
						if key.kind != relativeDemandEffects || recipe.nativeGet == nil || key.selector != (sourceStagedOperationSelector{}) && key.selector.field != "algorithm" && key.selector.field != "eager-inputs" && key.selector.field != "eager-target" {
							continue
						}
						source := recipe.nativeGet
						t.Logf("description operation=%s@%d role=%q kind=%d extracted=%t required=%d installation=%t input=%t eager=%t targetChild=%v targetBinding=%v", key.operation.Kind, key.operation.Pos(), key.selector.field, source.kind, recipe.delta.extracted, len(recipe.delta.required), source.installation != nil, source.input != nil, source.eager != nil, source.targetSource.producer.operation != nil, source.targetBinding != nil)
					}
					t.Fatal("original target chain description missing")
				}
				cursor := occurrence
				var freezes []*sourceStagedNativeGetSource
				for cursor.source.kind == sourceNativeObjectFreeze {
					if cursor.child == nil {
						t.Fatal("described Freeze omitted its original child")
					}
					phase := work.operationRecipes[nativeRootDebtRequest(cursor.source, "algorithm").producer]
					if !validStagedNativeInputSource(phase.nativeGet) || phase.delta.extracted || len(phase.delta.required) != 1 || !sameOperationRequest(phase.delta.required[0], cursor.child.source.request) {
						t.Fatal("Freeze description lost pending original full child")
					}
					if work.connectNativeInputSource(facts, phase.nativeGet, cursor.child.source.request.producer.operation) {
						t.Fatal("Freeze description supplied semantic publication before actual Get")
					}
					freezes = append(freezes, phase.nativeGet)
					cursor = cursor.child
				}
				reflective := cursor.source
				algorithm := work.operationRecipes[nativeRootDebtRequest(reflective, "algorithm").producer].nativeGet
				if !validNativeTargetSource(algorithm) {
					t.Fatal("target association lost original child/cut")
				}
				child = algorithm.targetSource.producer.operation
				for _, recipe := range work.operationRecipes {
					if sameNativeGetSource(recipe.nativeGet, algorithm) && (!sameOperationRequest(recipe.nativeGet.targetSource, algorithm.targetSource) || recipe.nativeGet.targetBinding != algorithm.targetBinding) {
						t.Fatal("description partially updated original native source roles")
					}
				}
				eager := work.operationRecipes[nativeRootDebtRequest(algorithm, "eager-inputs").producer]
				if eager.delta.extracted || len(eager.delta.required) != len(nativeEagerRequired(eager.nativeGet)) || !sameOperationRequest(eager.delta.required[0], nativeEagerTargetRequest(algorithm)) {
					t.Fatal("pending eager role lost its original target phase requirement")
				}
				target := work.operationRecipes[nativeEagerTargetRequest(algorithm).producer]
				if target.delta.extracted || len(target.delta.required) != 1 || !sameOperationRequest(target.delta.required[0], algorithm.targetSource) || len(work.operationIDs) != 0 || work.nativeOrdinaryTargetResult(algorithm.targetSource) {
					t.Fatal("description supplied semantic result or lost full Effects")
				}
				if !work.adoptNativeInputOccurrence(facts, occurrence) || !work.nativeOrdinaryTargetResult(algorithm.targetSource) {
					t.Fatal("actual child receipt did not reach target consumer")
				}
				for _, freeze := range freezes {
					phase := work.operationRecipes[nativeRootDebtRequest(freeze, "algorithm").producer]
					if !phase.delta.extracted || !work.nativeOrdinaryTargetResult(freeze.request) {
						t.Fatal("actual recursive Get receipts did not publish Freeze input source")
					}
				}
				targetRequest := nativeEagerTargetRequest(algorithm)
				if !work.operationRecipes[targetRequest.producer].delta.extracted {
					t.Fatal("semantic target completion was not attached to its source recipe")
				}
				cached := false
				for _, recipe := range facts[caller].staged.operationRecipes {
					if recipe.key == targetRequest.producer {
						cached = recipe.delta.extracted && len(recipe.delta.required) == 1 && sameOperationRequest(recipe.delta.required[0], algorithm.targetSource)
					}
				}
				if !cached {
					t.Fatal("fact snapshot lost original target completion/child requirement")
				}
				callee := nativeRootDebtRequest(work.operationRecipes[algorithm.targetSource.producer].nativeGet, "callee-get")
				id := work.operationIDs[callee.producer]
				proof := work.operations[id.index].nativeCallee
				work.operations[id.index].nativeCallee = nil
				if work.nativeOrdinaryTargetResult(algorithm.targetSource) || work.nativeOrdinaryTargetResult(occurrence.source.request) {
					t.Fatal("missing actual Get receipt supplied recursive ordinary target/input")
				}
				work.operations[id.index].nativeCallee = proof
				generation := work.operationGeneration
				work.operationGeneration = &projectGeneration{}
				if work.nativeOrdinaryTargetResult(algorithm.targetSource) {
					t.Fatal("old generation supplied ordinary target")
				}
				work.operationGeneration = generation
				if child == nil || len(facts[caller].summary.Calls) != 0 {
					t.Fatal("target production invoked dormant descriptor callback")
				}
			})
		})
	}
}

// Completed source descriptions survive cloning, but current DATA subscribers,
// Has/Get observations and native Get receipts belong to the fresh work graph.
func checkNativeTargetCompletedClone(t *testing.T, session *Session) {
	t.Helper()
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		var facts []callableFacts
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				facts = append(facts, cloneProjectCallableFact(fact))
			}
		}
		work := registerCallableEffectWork(facts)
		work.operationGeneration = owner.values.generation
		var parent sourceStagedOperationRequest
		var outer *ast.Node
		caller := -1
		for i, fact := range facts {
			if fact.summary.Name != "saved" || fact.sourceFile.FileName() != "/virtual/native-target-composition.ts" {
				continue
			}
			caller = i
			statements := fact.node.Body().AsBlock().Statements.Nodes
			outer = statements[len(statements)-1].AsReturnStatement().Expression
			for _, recipe := range fact.staged.operationRecipes {
				if recipe.nativeGet != nil && recipe.key.selector.field == "value" && recipe.key.selector.occurrence == recipe.nativeGet.descriptorGet {
					parent = nativeDescriptorFieldRequest(recipe.nativeGet, "value")
					break
				}
			}
		}
		if caller < 0 || parent.producer.operation == nil {
			continue
		}
		read := parent.producer.selector.occurrence
		reading := stagedDescriptorReceiverRequest(parent, read)
		if _, available := work.stagedDescriptorReceiverData(facts, parent, reading); available {
			t.Fatal("clone inherited descriptor DATA subscriber")
		}
		id, required := work.requireOperation(facts, parent)
		if !required {
			t.Fatal("cloned original descriptor field lost registration")
		}
		if work.operations[id.index].fieldDisposition != nil || work.closedOperationDependencies()[id.index] {
			t.Fatal("clone inherited completed original Has/Get")
		}
		occurrence, described := work.describeNativeInputOccurrence(facts, caller, outer, owner)
		if !described || !work.adoptNativeInputOccurrence(facts, occurrence) {
			t.Fatal("fresh original source could not reissue cloned target chain")
		}
		work.initializePropagation(facts)
		work.prepareOperationUses(facts, owner)
		data, available := work.stagedDescriptorReceiverData(facts, parent, reading)
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 {
			t.Fatal("fresh descriptor DATA not delivered after cloned original source observation")
		}
		if work.operations[id.index].fieldDisposition == nil || !work.closedOperationDependencies()[id.index] {
			t.Fatal("fresh original field source did not close cloned dependency graph")
		}
		return
	}
	t.Fatal("completed source graph absent for clone lifecycle")
}

// Unknown producer output and writable/escaped aliases must not obtain literal
// field coverage from their declaration syntax or the const binding alone.
func TestStagedNativeTargetCompositionUnrepresentedDescriptor(t *testing.T) {
	for name, source := range map[string]string{
		"unavailable_producer": `declare function supply():PropertyDescriptor;export function invoke(prototype:object|null){const descriptor=supply();return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',descriptor))}`,
		"written_binding":      `export function invoke(prototype:object|null,other:PropertyDescriptor){let descriptor:PropertyDescriptor={value:()=>window.name};descriptor=other;return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',descriptor))}`,
		"escaped_mutation":     `export function invoke(prototype:object|null,mutate:(descriptor:PropertyDescriptor)=>void){const descriptor={value:()=>window.name};mutate(descriptor);return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',descriptor))}`,
	} {
		t.Run(name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/native-target-pending.ts", Source: source, Target: target, Diagnostics: "semantic", stagedReplacement: true})
				if hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal("invalid negative fixture", response.Diagnostics)
				}
				if response.Error == "" || response.Code != "" {
					t.Logf("unexpected published descriptor summary: %+v", executableSummary(t, response, "invoke"))
					t.Fatalf("%s %s unrepresented descriptor published an artifact: %s", name, target, response.Error)
				}
			}
		})
	}
}

// A delivered source prefix authenticates the original guarded nominal mapping.
// Other source candidates still gate coverage and the original Session consumer.
func TestStagedNativeCreateTargetOriginalPrototypePrefix(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		generation := owner.values.generation
		if generation == nil || !generation.active || owner.project.activeGeneration != generation || work.operationGeneration != generation {
			t.Fatal("original live canonical source generation UNREACHED")
		}
		var source *sourceStagedNativeGetSource
		savedPresent := false
		for _, recipe := range work.operationRecipes {
			candidate := recipe.nativeGet
			if candidate == nil || candidate.kind != sourceNativeObjectDefineProperty || recipe.key != candidate.request.producer || candidate.request.consumer == nil {
				continue
			}
			name := facts[work.memberNodes[candidate.request.consumer]].summary.Name
			savedPresent = savedPresent || name == "saved"
			if name != "direct" {
				continue
			}
			if source != nil {
				t.Fatal("ambiguous original direct DefineProperty owner")
			}
			source = work.operationRecipes[nativeRootDebtRequest(candidate, "algorithm").producer].nativeGet
		}
		if !savedPresent {
			t.Fatal("whole original fixture lost its saved source candidate")
		}
		if source == nil || source.installation == nil || source.descriptorGet == nil || !validNativeTargetSource(source) || source.targetBinding != nil || source.installation.target.expression != source.targetSource.producer.operation {
			t.Fatal("original direct Create target association UNREACHED")
		}
		created := work.operationRecipes[source.targetSource.producer].nativeGet
		if created == nil || created.kind != sourceNativeObjectCreate || !sameOperationRequest(created.request, source.targetSource) {
			t.Fatal("original same-request Create producer UNREACHED")
		}
		target := nativeEagerTargetRequest(source)
		required := work.operationRecipes[target.producer].delta.required
		if len(required) != 1 || !sameOperationRequest(required[0], source.targetSource) {
			t.Fatal("nominal mapping lost full Create Effects membership")
		}
		field := nativeDescriptorFieldRequest(source, "enumerable")
		roles, valid := fieldSourceRequests(field)
		fieldID, prototypeID := work.operationIDs[field.producer], work.operationIDs[roles.prototype.producer]
		if !valid || fieldID.epoch != work.operationEpoch || prototypeID.epoch != work.operationEpoch || fieldID.index == 0 || prototypeID.index == 0 || int(fieldID.index) >= len(work.operations) || int(prototypeID.index) >= len(work.operations) {
			t.Fatal("original field/prototype source producer UNREACHED")
		}
		fieldState := &work.operations[fieldID.index]
		if !fieldState.getterSourceRequested || fieldState.fieldDisposition == nil || len(fieldState.fieldDisposition.invoked) != 0 {
			t.Fatal("original one-shot data-field Has/Get UNREACHED")
		}
		fieldConsumesPrototype := false
		for _, dependency := range fieldState.dependencies {
			fieldConsumesPrototype = fieldConsumesPrototype || dependency.producer == prototypeID && sameOperationRequest(dependency.request, roles.prototype)
		}
		if !fieldConsumesPrototype {
			t.Fatal("original field did not retain its exact prototype consumer")
		}
		prototype := &work.operations[prototypeID.index]
		for _, required := range prototype.delta.required {
			if required.consumer != prototype.key.declaration {
				t.Fatal("published prototype prefix contains a foreign consumer")
			}
		}
		eager := nativeRootDebtRequest(source, "eager-inputs")
		if !operationContainsRequest(prototype.delta.required, eager) {
			t.Fatal("original direct-DP eager dependency prefix UNREACHED")
		}
		for _, request := range []sourceStagedOperationRequest{nativeRootDebtRequest(source, "callee-get"), eager} {
			if !operationContainsRequest(work.operationRecipes[roles.prototype.producer].delta.required, request) || !operationContainsRequest(prototype.delta.required, request) {
				t.Fatal("prototype prefix lost original callee/eager debt")
			}
			connected := false
			for _, dependency := range prototype.dependencies {
				connected = connected || dependency.producer == work.operationIDs[request.producer] && sameOperationRequest(dependency.request, request)
			}
			if !connected {
				t.Fatal("prototype prefix retained metadata without its actual producer dependency")
			}
		}
		for _, request := range []sourceStagedOperationRequest{roles.prototype, target, source.targetSource, nativeRootDebtRequest(source, "callee-get"), eager} {
			id := work.operationIDs[request.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original required producer UNREACHED")
			}
			state := &work.operations[id.index]
			sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if state.key != request.producer || state.revision == 0 || state.invalid || !state.dependenciesRegistered || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.consumed != state.revision || sub.applied != state.revision || sub.cursor.required != len(state.delta.required) {
				t.Fatal("original prefix/target/input consumer did not consume/APPLY its current required prefix")
			}
		}
		// No coverage X/closed assertion: the exported saved source remains required.
	}, activeModuleCompleteAnalysis)
}

// A declaration-owned Get view accounts for just one foreign SOURCE candidate.
// This runs before generation release and does not assert full field coverage.
func TestStagedNativeForeignCalleeGetOriginalPrototypeSource(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	var releasedWork *callableEffectWork
	var releasedRecipes []sourceStagedOperationRecipe
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if owner.values.generation == nil || !owner.values.generation.active || work.operationGeneration != owner.values.generation {
			t.Fatal("genuine whole-fixture live collector UNREACHED")
		}
		var views []sourceStagedOperationRecipe
		expected := make(map[*ast.Node]sourceStagedOperationRequest)
		counts := make(map[sourceNativeKind]int)
		for _, recipe := range work.operationRecipes {
			if source := recipe.nativeGet; source != nil && recipe.key == source.request.producer && source.request.consumer != nil && facts[work.memberNodes[source.request.consumer]].summary.Name == "saved" {
				switch source.kind {
				case sourceNativeObjectCreate, sourceNativeObjectFreeze, sourceNativeObjectDefineProperty:
					if _, duplicate := expected[source.get]; duplicate {
						t.Fatal("ambiguous original saved Get producer")
					}
					expected[source.get] = source.request
					counts[source.kind]++
				}
			}
			if recipe.memberSource == nil || recipe.memberSource.nativeFieldGet == nil || recipe.memberSource.nativeFieldGet.nominalCreate {
				continue
			}
			h := recipe.memberSource.nativeFieldGet
			parent, valid := fieldSourceParent(h.field)
			if !valid || parent.producer.selector.field != "enumerable" || facts[work.memberNodes[h.source.producer.declaration]].summary.Name != "saved" || facts[work.memberNodes[h.field.consumer]].summary.Name != "direct" {
				continue
			}
			views = append(views, recipe)
		}
		if len(expected) != 4 || counts[sourceNativeObjectCreate] != 1 || counts[sourceNativeObjectDefineProperty] != 1 || counts[sourceNativeObjectFreeze] != 2 {
			t.Fatal("four original saved Get producers UNREACHED", counts)
		}
		if len(views) != len(expected) {
			t.Fatal("four original saved Get typed readers UNREACHED", len(views), len(expected))
		}
		cloned := make([]callableFacts, len(facts))
		for i, fact := range facts {
			cloned[i] = cloneProjectCallableFact(fact)
		}
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = work.operationGeneration
		for _, view := range views {
			h := view.memberSource.nativeFieldGet
			want, original := expected[h.get]
			if !original || !sameOperationRequest(h.source, want) || !work.nativeFieldGetCurrent(view) {
				t.Fatal("original producer Get publication and current typed SOURCE delivery UNREACHED")
			}
			delete(expected, h.get)
			producer := work.nativeFieldGetSource(view)
			proof := work.currentNativeCalleeEffects(producer)
			if producer == nil || proof == nil || !proof.noUserEntry || producer.get != h.get || producer.method != h.method || !validStagedNativeCalleeEffects(*proof, producer) || !work.nativeEffectsGetCurrent(producer) {
				t.Fatal("view did not originate in exhaustive original standard Get acquisition")
			}
			prototypeID := work.operationIDs[h.field.producer]
			if prototypeID.epoch != work.operationEpoch || prototypeID.index == 0 || int(prototypeID.index) >= len(work.operations) {
				t.Fatal("original prototype SOURCE owner UNREACHED")
			}
			prototype := &work.operations[prototypeID.index]
			connected := false
			for _, dependency := range prototype.dependencies {
				connected = connected || sameOperationRequest(dependency.request, view.memberSource.request) && dependency.producer == work.operationIDs[view.key]
			}
			if !connected || !operationContainsRequest(prototype.delta.required, view.memberSource.request) {
				t.Fatal("typed view is metadata without original prototype membership")
			}
			for _, required := range []sourceStagedOperationRequest{h.field, view.memberSource.request, view.delta.required[0]} {
				id := work.operationIDs[required.producer]
				if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
					t.Fatal("actual source/view producer UNREACHED")
				}
				state := &work.operations[id.index]
				sub := state.subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}]
				if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !sameOperationRequest(required, h.field) && !state.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, required) || sub.consumed != state.revision || sub.applied != state.revision || sub.cursor.required != len(state.delta.required) {
					t.Fatal("original canonical SOURCE/view receipt did not consume/APPLY its current revision")
				}
			}
			if view.delta.required[0].producer.declaration != h.source.consumer || view.delta.required[0].consumer != h.field.consumer || view.delta.required[0].reading != view.key || h.cut.operation != h.field.producer.operation || len(view.delta.effects)+len(view.delta.invoked)+len(view.delta.relative)+len(view.delta.residuals)+len(view.delta.exposures) != 0 {
				t.Fatal("typed purpose rebased its producer or granted execution/value authority")
			}
			foreignRoot := work.operationRecipes[h.source.producer]
			for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
				if !operationContainsRequest(foreignRoot.delta.required, nativeRootDebtRequest(producer, role)) {
					t.Fatal("Get view erased the foreign producer's independent Call debt", role)
				}
			}
			// Call/input/freshness purposes are deliberately outside this view.
			parent, valid := fieldSourceParent(h.field)
			reader := work.operationRecipes[h.field.producer].nativeGet
			if reader == nil {
				t.Fatal("original descriptor field owner UNREACHED")
			}
			// The canonical Call retains its independent phases. First-own-data
			// SOURCE coverage may omit irrelevant predecessor copies of those debts.
			directRoot := work.operationRecipes[reader.request.producer]
			for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
				if !operationContainsRequest(directRoot.delta.required, nativeRootDebtRequest(reader, role)) {
					t.Fatal("Get-only contribution lost canonical direct Call debt", role)
				}
			}
			fullCreate := nativeEagerTargetRequest(reader)
			if !valid || reader == nil || !operationContainsRequest(work.operationRecipes[fullCreate.producer].delta.required, reader.targetSource) || parent.producer.selector.field != "enumerable" {
				t.Fatal("Get-only contribution lost original fullCreate/callee/eager obligations")
			}
			for name, change := range map[string]func(*sourceStagedNativeFieldGet){
				"producer":       func(x *sourceStagedNativeFieldGet) { x.source.consumer = x.field.consumer },
				"purpose":        func(x *sourceStagedNativeFieldGet) { x.field.producer.selector.field = "field-source:value:prototype" },
				"physical_cut":   func(x *sourceStagedNativeFieldGet) { x.cut.reading = x.get },
				"graph_cut":      func(x *sourceStagedNativeFieldGet) { x.field.cut.reading = x.get },
				"library":        func(x *sourceStagedNativeFieldGet) { x.method = x.get },
				"source_version": func(x *sourceStagedNativeFieldGet) { x.generation = nil },
			} {
				copy := view
				copy.memberSource = cloneStagedMemberSource(view.memberSource)
				change(copy.memberSource.nativeFieldGet)
				if work.nativeFieldGetSource(copy) != nil || work.nativeFieldGetCurrent(copy) {
					t.Fatal("foreign SOURCE purpose accepted mismatched immutable header", name)
				}
			}
			unregistered := view.delta.required[0]
			unregistered.reading.selector.field += ":unregistered"
			if work.validNativeFieldGetReading(work.operationRecipes[unregistered.producer], unregistered) {
				t.Fatal("late publication manufactured an unregistered field interest")
			}
			clonedView := fresh.operationRecipes[view.key]
			if clonedView.memberSource == nil || clonedView.memberSource.nativeFieldGet == h || fresh.nativeFieldGetCurrent(clonedView) || fresh.currentNativeCalleeEffects(producer) != nil {
				t.Fatal("clone retained SOURCE publisher or graph delivery/current authority")
			}
		}
		if len(expected) != 0 {
			t.Fatal("original saved Get occurrence omitted from actual prototype SOURCE delivery")
		}
		// Advance through the real editor/generation owner; no proof/receipt is set.
		next, err := owner.project.advance(context.Background(), request.ID, request.Source+"\n")
		if err != nil {
			t.Fatal(err)
		}
		defer next.release()
		for _, view := range views {
			if work.nativeFieldGetCurrent(view) {
				t.Fatal("source edit retained a retired Get view/current receipt")
			}
		}
		t.Log("four original saved Gets/direct enumerable SOURCE contributions, exact canonical APPLIED and purpose/cut/clone/edit/lifetime refusers reached; full field/Call/Session closure UNQUALIFIED")
		releasedWork, releasedRecipes = work, views
	}, activeModuleCompleteAnalysis)
	if releasedWork == nil || len(releasedRecipes) != 4 {
		t.Fatal("four original SOURCE readers UNREACHED before release")
	}
	for _, view := range releasedRecipes {
		if releasedWork.nativeFieldGetCurrent(view) {
			t.Fatal("released generation retained foreign SOURCE currentness")
		}
	}
}

// Inspect original producer availability before proposing a new SOURCE reader.
func TestStagedNativeSavedCreateOriginalPhaseAvailability(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if work.operationGeneration == nil || !work.operationGeneration.active || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration {
			t.Fatal("original live canonical collector UNREACHED")
		}
		var source *sourceStagedNativeGetSource
		for _, recipe := range work.operationRecipes {
			candidate := recipe.nativeGet
			if candidate == nil || candidate.kind != sourceNativeObjectCreate || recipe.key != candidate.request.producer || facts[work.memberNodes[candidate.request.consumer]].summary.Name != "saved" {
				continue
			}
			if source != nil {
				t.Fatal("ambiguous original saved Create producer")
			}
			source = candidate
		}
		proof := work.currentNativeCalleeEffects(source)
		if source == nil || proof == nil || !proof.noUserEntry || !validStagedNativeCalleeEffects(*proof, source) || !work.nativeEffectsGetCurrent(source) {
			t.Fatal("original saved Create complete standard Get publisher UNREACHED")
		}
		for _, role := range []string{"eager-inputs", "algorithm"} {
			r := nativeRootDebtRequest(source, role)
			recipe, id := work.operationRecipes[r.producer], work.operationIDs[r.producer]
			phase := recipe.nativeGet
			if !validNativeGetRequest(recipe, r) || phase == nil || !sameOperationRequest(phase.request, source.request) || phase.get != source.get || phase.method != source.method || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original saved Create phase registration/producer UNREACHED", role)
			}
			state := &work.operations[id.index]
			if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) {
				t.Fatal("original saved Create phase publication UNREACHED", role)
			}
			if phase.input == nil || phase.prototype == nil || !phase.inputEffects || !validStagedNativeInputPlan(*phase.input, phase) || !sameOperationEndpoint(phase.prototype.input, phase.input.input) || phase.prototype.formal != (sourceRelativeRole{kind: relativeRoleFormal, declaration: source.request.producer.declaration, slot: 0}) || !work.currentNativeOrdinaryInputResult(phase) {
				t.Fatal("original saved Create prototype/input admission or current phase UNREACHED", role)
			}
		}
		t.Log("original saved Create Get/prototype/input and published eager/algorithm phases available; nominal SOURCE transport/fullCall/Session UNQUALIFIED")
	}, activeModuleCompleteAnalysis)
}

// A nominal Create SOURCE contribution is not a Get, output or Call receipt.
func TestStagedNativeForeignCreateOriginalPrototypeSource(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	var releasedWork *callableEffectWork
	var releasedView sourceStagedOperationRecipe
	var releasedReader *sourceStagedNativeGetSource
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if work.operationGeneration == nil || !work.operationGeneration.active || owner.project.activeGeneration != work.operationGeneration {
			t.Fatal("genuine whole-fixture source collector UNREACHED")
		}
		var view sourceStagedOperationRecipe
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.nativeFieldGet == nil || !recipe.memberSource.nativeFieldGet.nominalCreate {
				continue
			}
			h := recipe.memberSource.nativeFieldGet
			parent, valid := fieldSourceParent(h.field)
			if valid && parent.producer.selector.field == "enumerable" && facts[work.memberNodes[h.source.consumer]].summary.Name == "saved" && facts[work.memberNodes[h.field.consumer]].summary.Name == "direct" {
				if view.memberSource != nil {
					t.Fatal("ambiguous original saved Create/direct prototype purpose")
				}
				view = recipe
			}
		}
		if view.memberSource == nil {
			t.Fatal("original saved Create nominal SOURCE consumer UNREACHED")
		}
		h := view.memberSource.nativeFieldGet
		producer, reader := work.nativeFieldGetSource(view), work.operationRecipes[h.field.producer].nativeGet
		if producer == nil || producer.kind != sourceNativeObjectCreate || reader == nil || !ast.IsObjectLiteralExpression(reader.descriptorGet) || len(view.delta.required) != 3 || work.nativeFieldGetCurrent(view) || !work.implicitSourceRequirementCurrent(view.memberSource.request, reader) {
			t.Fatal("nominal Create SOURCE purpose not current or confused with Get-only authority")
		}
		getView := work.operationRecipes[view.delta.required[0].producer]
		if !work.nativeFieldGetCurrent(getView) || !sameOperationRequest(getView.memberSource.nativeFieldGet.source, h.source) || !sameOperationRequest(getView.memberSource.nativeFieldGet.field, h.field) || getView.memberSource.nativeFieldGet.cut != h.cut {
			t.Fatal("nominal Create lost its exact original Get SOURCE premise")
		}
		for i, role := range []string{"eager-inputs", "algorithm"} {
			r := view.delta.required[i+1]
			original := nativeRootDebtRequest(producer, role)
			phase := work.operationRecipes[r.producer]
			if r.producer != original.producer || r.cut != original.cut || r.use != original.use || r.inputs != nil || r.consumer != h.field.consumer || r.reading != view.key || !validNativeGetRequest(phase, original) || work.validNativeFieldGetReading(phase, r) || !work.currentNativeOrdinaryInputResult(phase.nativeGet) || !phase.nativeGet.inputEffects {
				t.Fatal("nominal purpose changed original phase ownership/cut or borrowed Get authority", role)
			}
		}
		prototypeID := work.operationIDs[h.field.producer]
		if prototypeID.epoch != work.operationEpoch || prototypeID.index == 0 || int(prototypeID.index) >= len(work.operations) {
			t.Fatal("original prototype SOURCE owner UNREACHED")
		}
		prototype := &work.operations[prototypeID.index]
		connected := false
		for _, dependency := range prototype.dependencies {
			connected = connected || dependency.producer == work.operationIDs[view.key] && sameOperationRequest(dependency.request, view.memberSource.request)
		}
		if !connected || !operationContainsRequest(prototype.delta.required, view.memberSource.request) {
			t.Fatal("nominal SOURCE view is metadata without actual prototype contribution")
		}
		for _, r := range append([]sourceStagedOperationRequest{h.field, view.memberSource.request}, view.delta.required...) {
			id := work.operationIDs[r.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original SOURCE consumer producer UNREACHED")
			}
			state := &work.operations[id.index]
			sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
			if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !sameOperationRequest(r, h.field) && !state.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, r) || sub.consumed != state.revision || sub.applied != state.revision || sub.cursor.required != len(state.delta.required) {
				t.Fatal("actual nominal SOURCE/prototype/phase consumer did not consume/APPLY current revision")
			}
		}
		for _, source := range []*sourceStagedNativeGetSource{producer, reader} {
			for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
				if !operationContainsRequest(work.operationRecipes[source.request.producer].delta.required, nativeRootDebtRequest(source, role)) {
					t.Fatal("nominal SOURCE erased original Get/input/algorithm/Call debt")
				}
			}
		}
		if !operationContainsRequest(work.operationRecipes[nativeEagerTargetRequest(reader).producer].delta.required, reader.targetSource) || len(view.delta.exposures)+len(view.delta.invoked)+len(view.delta.relative)+len(view.delta.effects)+len(view.delta.residuals) != 0 {
			t.Fatal("nominal SOURCE granted output/execution authority or erased fullCreate debt")
		}
		for _, change := range []func(*sourceStagedOperationRecipe){
			func(x *sourceStagedOperationRecipe) { x.memberSource.nativeFieldGet.source.consumer = h.field.consumer },
			func(x *sourceStagedOperationRecipe) {
				x.memberSource.request.producer.selector.field = "field-prototype-native-callee-get"
			},
			func(x *sourceStagedOperationRecipe) { x.memberSource.nativeFieldGet.cut.reading = h.get },
			func(x *sourceStagedOperationRecipe) { x.memberSource.nativeFieldGet.field.cut.reading = h.get },
			func(x *sourceStagedOperationRecipe) { x.delta.required[1].edge += ":unissued" },
			func(x *sourceStagedOperationRecipe) { x.delta.required[2] = x.delta.required[0] },
		} {
			copy := view
			copy.memberSource, copy.delta = cloneStagedMemberSource(view.memberSource), cloneOperationDelta(view.delta)
			change(&copy)
			if work.nativeFieldGetSource(copy) != nil {
				t.Fatal("nominal SOURCE accepted foreign owner/purpose/cut/phase identity")
			}
		}
		cloned := make([]callableFacts, len(facts))
		for i, fact := range facts {
			cloned[i] = cloneProjectCallableFact(fact)
		}
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = work.operationGeneration
		if fresh.implicitSourceRequirementCurrent(view.memberSource.request, reader) {
			t.Fatal("clone reused nominal SOURCE phase revision/delivery authority")
		}
		next, err := owner.project.advance(context.Background(), request.ID, request.Source+"\n")
		if err != nil {
			t.Fatal(err)
		}
		defer next.release()
		if work.implicitSourceRequirementCurrent(view.memberSource.request, reader) {
			t.Fatal("source edit retained nominal SOURCE currency")
		}
		releasedWork, releasedView, releasedReader = work, view, reader
		t.Log("actual nominal Create SOURCE/prototype and original phase APPLIED contribution reached; output/fullCall/fullfield/Session and natural late/authored alternatives UNQUALIFIED")
	}, activeModuleCompleteAnalysis)
	if releasedWork == nil || releasedWork.implicitSourceRequirementCurrent(releasedView.memberSource.request, releasedReader) {
		t.Fatal("released nominal SOURCE view remained current")
	}
}

func TestStagedNativeForeignSourcesRemainingDescriptorFields(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if work.operationGeneration == nil || !work.operationGeneration.active || owner.project.activeGeneration != work.operationGeneration {
			t.Fatal("genuine whole-fixture field service UNREACHED")
		}
		expected := make(map[*ast.Node]sourceStagedOperationRequest)
		for _, recipe := range work.operationRecipes {
			if n := recipe.nativeGet; n != nil && recipe.key == n.request.producer && facts[work.memberNodes[n.request.consumer]].summary.Name == "saved" && (n.kind == sourceNativeObjectCreate || n.kind == sourceNativeObjectFreeze || n.kind == sourceNativeObjectDefineProperty) {
				expected[n.get] = n.request
			}
		}
		counts := make(map[string][2]int)
		readings := make(map[sourceStagedOperationKey]map[sourceStagedOperationConsumer]bool)
		for _, view := range work.operationRecipes {
			if view.memberSource == nil || view.memberSource.nativeFieldGet == nil {
				continue
			}
			h := view.memberSource.nativeFieldGet
			parent, valid := fieldSourceParent(h.field)
			if !valid || parent.producer.selector.field == "enumerable" || facts[work.memberNodes[h.source.consumer]].summary.Name != "saved" || facts[work.memberNodes[h.field.consumer]].summary.Name != "direct" {
				continue
			}
			name := parent.producer.selector.field
			producer, reader := work.nativeFieldGetSource(view), work.operationRecipes[h.field.producer].nativeGet
			if producer == nil || reader == nil || parent.producer.kind != relativeDemandEffects || !sameOperationRequest(h.source, expected[h.get]) || !sameOperationRequest(parent, nativeDescriptorFieldRequest(reader, name)) || !work.implicitSourceRequirementCurrent(view.memberSource.request, reader) {
				t.Fatal("original field-specific SOURCE consumer UNREACHED", name)
			}
			count, dependencies := counts[name], view.delta.required
			if h.nominalCreate {
				count[1]++
				dependencies = dependencies[1:]
			} else {
				count[0]++
			}
			counts[name] = count
			id := work.operationIDs[h.field.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("prototype owner UNREACHED", name)
			}
			prototype, connected := &work.operations[id.index], false
			for _, dep := range prototype.dependencies {
				connected = connected || dep.producer == work.operationIDs[view.key] && sameOperationRequest(dep.request, view.memberSource.request)
			}
			if !connected || !operationContainsRequest(prototype.delta.required, view.memberSource.request) || !operationContainsRequest(work.operationRecipes[nativeEagerTargetRequest(reader).producer].delta.required, reader.targetSource) || len(view.delta.effects)+len(view.delta.invoked)+len(view.delta.relative)+len(view.delta.residuals)+len(view.delta.exposures) != 0 {
				t.Fatal("actual prototype contribution/fullCreate debt lost or execution granted", name)
			}
			for _, r := range append([]sourceStagedOperationRequest{h.field, view.memberSource.request}, view.delta.required...) {
				id := work.operationIDs[r.producer]
				if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
					t.Fatal("SOURCE producer UNREACHED", name)
				}
				state := &work.operations[id.index]
				sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
				if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !sameOperationRequest(r, h.field) && !state.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, r) || sub.consumed != state.revision || sub.applied != state.revision || sub.cursor.required != len(state.delta.required) {
					t.Fatal("field SOURCE current revision not consumed/APPLIED", name)
				}
			}
			for _, r := range dependencies {
				if readings[r.producer] == nil {
					readings[r.producer] = make(map[sourceStagedOperationConsumer]bool)
				}
				subscriber := sourceStagedOperationConsumer{r.consumer, r.edge}
				if readings[r.producer][subscriber] || r.reading != view.key || h.nominalCreate && !work.validNativeFieldCreateReading(work.operationRecipes[r.producer], r) || !h.nominalCreate && !work.validNativeFieldGetReading(work.operationRecipes[r.producer], r) {
					t.Fatal("field/purpose key or SOURCE/phase subscriber collision", name)
				}
				readings[r.producer][subscriber] = true
			}
			for _, n := range []*sourceStagedNativeGetSource{producer, reader} {
				for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
					if !operationContainsRequest(work.operationRecipes[n.request.producer].delta.required, nativeRootDebtRequest(n, role)) {
						t.Fatal("independent Call/input/algorithm debt lost", name)
					}
				}
			}
			copy := view
			copy.memberSource = cloneStagedMemberSource(view.memberSource)
			other, _ := fieldSourceRequests(nativeDescriptorFieldRequest(reader, "enumerable"))
			copy.memberSource.nativeFieldGet.field = other.prototype
			if work.nativeFieldGetSource(copy) != nil || work.nativeFieldSourceCurrent(copy) {
				t.Fatal("cross-field header accepted", name)
			}
		}
		if len(expected) != 4 || len(counts) != 5 {
			t.Fatal("remaining-five-field SOURCE consumers UNREACHED", counts)
		}
		for _, count := range counts {
			if count != [2]int{4, 1} {
				t.Fatal("25 field-specific four Get/one Create contributions UNREACHED", counts)
			}
		}
	}, activeModuleCompleteAnalysis)
}

// The first inert own-data slot closes its actual Has/Get and own-writer SOURCE,
// while prototype discovery and every ordinary field/Call debt remain independent.
func TestStagedNativeFirstOwnDataSourceClosure(t *testing.T) {
	const file = "/virtual/native-target-composition.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeTargetCompositionSource, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{file: stagedNativeTargetCompositionSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if work.operationGeneration == nil || !work.operationGeneration.active || owner.project.activeGeneration != work.operationGeneration {
			t.Fatal("genuine whole-fixture field service UNREACHED")
		}
		var source *sourceStagedNativeGetSource
		for _, recipe := range work.operationRecipes {
			if n := recipe.nativeGet; n != nil && n.kind == sourceNativeObjectDefineProperty && recipe.key == n.request.producer && facts[work.memberNodes[n.request.consumer]].summary.Name == "direct" {
				source = work.operationRecipes[nativeRootDebtRequest(n, "algorithm").producer].nativeGet
			}
		}
		if source == nil || !validNativeTargetSource(source) || source.targetBinding != nil {
			t.Fatal("original direct conversion/current Create association UNREACHED")
		}
		closed := work.closedOperationDependencies()
		paid := func(r sourceStagedOperationRequest) *sourceStagedOperationState {
			id := work.operationIDs[r.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original required producer UNREACHED", r)
			}
			state := &work.operations[id.index]
			sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
			if state.invalid || !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted || sub == nil || sub.blocked || !sameOperationRequest(sub.request, r) || sub.consumed != state.revision || sub.applied != state.revision || sub.cursor.required != len(state.delta.required) {
				t.Fatal("original current extracted delivery not consumed/APPLIED", r)
			}
			return state
		}
		field := nativeDescriptorFieldRequest(source, reflectiveDescriptorKeys[0])
		roles, valid := fieldSourceRequests(field)
		if !valid {
			t.Fatal("original field SOURCE roles UNREACHED")
		}
		own := paid(roles.ownWriters)
		if !closed[work.operationIDs[roles.ownWriters.producer].index] || len(own.delta.required) != 2 || len(own.dependencies) != 2 {
			t.Fatal("first own-writer SOURCE closure UNREACHED")
		}
		phases := make(map[sourceStagedFieldObservationPhase]bool)
		for _, dep := range own.dependencies {
			member := work.operationRecipes[dep.request.producer].memberSource
			if member == nil || member.coverage == nil || !sameOperationRequest(member.request, dep.request) || !sameOperationRequest(stagedMemberCoverageRequest(member.parent, member.coverage.origin, member.coverage.cut), dep.request) {
				t.Fatal("exact original Has/Get coverage relation UNREACHED")
			}
			parent, phase, valid := stagedFieldMemberParent(member.parent)
			child := paid(dep.request)
			if !valid || !sameOperationRequest(parent, field) || dep.producer != work.operationIDs[dep.request.producer] || !operationContainsRequest(own.delta.required, dep.request) || phases[phase] || !closed[dep.producer.index] || !child.memberCoverageObserved || work.memberCoverageObserved[child.key] != work.operationGeneration {
				t.Fatal("exact original enumerable Has/Get observed closure UNREACHED")
			}
			phases[phase] = true
		}
		prototype := paid(roles.prototype)
		paid(field)
		if !closed[work.operationIDs[roles.prototype.producer].index] || !closed[work.operationIDs[field.producer].index] {
			t.Fatalf("first own-data prototype/field closure UNREACHED: prototype=%t field=%t", closed[work.operationIDs[roles.prototype.producer].index], closed[work.operationIDs[field.producer].index])
		}
		views := [2]int{}
		for _, dep := range prototype.dependencies {
			view := work.operationRecipes[dep.request.producer]
			if view.memberSource == nil || view.memberSource.nativeFieldGet == nil {
				continue
			}
			h := view.memberSource.nativeFieldGet
			if !sameOperationRequest(h.field, roles.prototype) || facts[work.memberNodes[h.source.consumer]].summary.Name != "saved" || dep.producer != work.operationIDs[dep.request.producer] || !operationContainsRequest(prototype.delta.required, dep.request) || !work.nativeFieldSourceCurrent(view) {
				t.Fatal("retained genuine prototype SOURCE view lost")
			}
			paid(dep.request)
			if h.nominalCreate {
				views[1]++
			} else {
				views[0]++
			}
		}
		if views != [2]int{4, 1} {
			t.Fatal("whole-fixture prototype contributions UNREACHED", views)
		}
		algorithm := paid(nativeRootDebtRequest(source, "algorithm"))
		for _, name := range reflectiveDescriptorKeys {
			if !operationContainsRequest(algorithm.delta.required, nativeDescriptorFieldRequest(source, name)) {
				t.Fatal("six-field Effects debt lost", name)
			}
			r := nativeDescriptorFieldRequest(source, name)
			id := work.operationIDs[r.producer]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("actual field producer UNREACHED", name)
			}
			sources, valid := fieldSourceRequests(r)
			for _, required := range []sourceStagedOperationRequest{sources.ownWriters, sources.prototype} {
				requiredID := work.operationIDs[required.producer]
				connected := false
				for _, dep := range work.operations[id.index].dependencies {
					connected = connected || dep.producer == requiredID && sameOperationRequest(dep.request, required)
				}
				if !valid || requiredID.epoch != work.operationEpoch || requiredID.index == 0 || !work.operations[id.index].dependenciesRegistered || !operationContainsRequest(work.operations[id.index].delta.required, required) || !connected {
					t.Fatal("actual field SOURCE membership lost", name, required)
				}
			}
		}
		for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			if !operationContainsRequest(work.operationRecipes[source.request.producer].delta.required, nativeRootDebtRequest(source, role)) {
				t.Fatal("independent original Call debt lost", role)
			}
		}
		if !operationContainsRequest(work.operationRecipes[nativeEagerTargetRequest(source).producer].delta.required, source.targetSource) {
			t.Fatal("full Create Effects debt lost")
		}
	}, activeModuleCompleteAnalysis)
}

func TestStagedFirstOwnDataLiteralRefusers(t *testing.T) {
	for _, expression := range []string{
		`{get enumerable(){return true}}`, `{enumerable:(()=>true)()}`, `{["enumerable"]:true}`,
		`{...{enumerable:true}}`, `{__proto__:null,enumerable:true}`, `{value:1}`,
	} {
		withReflectiveRelevanceSource(t, "export const descriptor="+expression, func(_ *executableBodyOwner, file *ast.SourceFile) {
			if sourceInertDataLiteral(file.Statements.Nodes[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].AsVariableDeclaration().Initializer, reflectiveDescriptorKeys[0]) {
				t.Fatal("unsupported literal supplied first-own-data scope", expression)
			}
		})
	}
}
