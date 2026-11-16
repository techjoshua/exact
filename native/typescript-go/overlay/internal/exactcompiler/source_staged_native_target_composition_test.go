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
