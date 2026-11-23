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

// A complete disjoint target retires only the descriptor's local relevance
// uncertainty. Actual key/descriptor acquisition still owns its effects and
// unavailable source contribution, even when the writer cannot reach this Get.
func TestReflectiveRelevanceOriginalAcquisition(t *testing.T) {
	for _, row := range []struct {
		name, prefix, target, descriptor   string
		possible, opaque, getter, external bool
	}{
		{"disjoint literal", "", `{}`, `{field:{value:()=>navigator.userAgent}}`, false, false, false, false},
		{"disjoint descriptor getter", `const descriptors={get map(){document.title;return {field:{value:()=>navigator.userAgent}}}};`, `{}`, `descriptors.map`, false, false, true, false},
		{"disjoint descriptor getter with ambient Call", `declare function external():void;const descriptors={get map(){external();return {field:{value:()=>navigator.userAgent}}}};`, `{}`, `descriptors.map`, false, false, true, true},
		{"matching", "", `target`, `{field:{value:()=>navigator.userAgent}}`, true, true, false, false},
		{"mixed", `declare const choose:boolean;`, `choose?target:{}`, `{field:{value:()=>navigator.userAgent}}`, true, true, false, false},
		{"unknown", `declare const foreign:object;`, `foreign`, `{field:{value:()=>navigator.userAgent}}`, true, true, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `const target=new WeakMap<object,unknown>();` + row.prefix + `Object.defineProperties(` + row.target + `,` + row.descriptor + `);export function invoke(key:object){return target.get(key)}`
			withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
				var operation, origin, read, getter, externalCall *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && node.Name().Text() == "target" {
						origin = node.Initializer()
					}
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "defineProperties" {
						operation = node
					}
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && ast.IsIdentifier(node.Expression().Expression()) && node.Expression().Expression().Text() == "target" {
						read = node
					}
					if ast.IsGetAccessorDeclaration(node) {
						getter = node
					}
					if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "external" {
						externalCall = node
					}
					return true
				})
				if operation == nil || origin == nil || read == nil {
					t.Fatal("original reflective source/reader missing")
				}
				facts := stagedReturnSourceFacts(file)
				restore := registerWriterInputFacts(owner, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				caller := work.memberNodes[enclosingCallableNode(read)]
				if !work.prepareStagedConstructionSource(facts, origin, owner) {
					t.Fatal("original native receiver source unavailable")
				}
				request, owned := sourceStagedOccurrenceRequest(&facts[caller], read, relativeDemandEffects, "reflective-native-reader")
				if !owned {
					t.Fatal("original native Get request unavailable")
				}
				query := newSourceDependencyQuery(read, owner.checker, owner, facts[caller].node)
				query.initializing, query.protectedMember = read, read.Expression()
				observed := 0
				revoke, installed := query.beginStagedConstructedMemberSource(request, origin, func(source sourceStagedConstructedMember, _ []*ast.SourceFile, _ bool) bool {
					if !work.registerConstructedMemberSourcePrefix(facts, source) {
						t.Fatal("original source prefix unavailable")
					}
					get := query.stagedConstructedMember.issued
					if get == nil || get.receiver.native == nil || get.receiver.node != origin {
						t.Fatal("original native Get not issued")
					}
					observed++
					part := accessorCandidates{}
					values, possible := query.reflectiveMemberValuesAtGet(origin, []string{"get"}, "", operation, accessorAcquire, nil, &part, get, query.memberWriterReadCut(nil, nil, &part, get))
					if possible != row.possible || len(values) != 0 {
						t.Fatal("original target relevance differs", possible, row.possible, len(values))
					}
					if !row.getter && !row.external && part.opaque != row.opaque {
						t.Fatal("relevance suppressed or manufactured opacity", part.opaque, row.opaque)
					}

					if row.getter {
						retained := false
						for _, effect := range part.effects {
							retained = retained || effect.declaration == getter
						}
						for _, call := range part.fieldCalls {
							retained = retained || call.target == getter
						}
						if !retained {
							t.Fatal("disjoint target discarded descriptor acquisition getter")
						}
						if row.external {
							containsOriginalCall := false
							if getter != nil && getter.Body() != nil {
								walkNode(getter.Body(), func(node *ast.Node) bool {
									containsOriginalCall = containsOriginalCall || externalCall != nil && node == externalCall
									return true
								})
							}
							if !containsOriginalCall || enclosingCallableNode(externalCall) != getter {
								t.Fatal("retained getter lost its original ambient Call body dependency")
							}
						}
					}
					if len(part.normalCalls)+len(part.nativeCalls)+len(part.accessorMutations) != 0 {
						t.Fatal("MAY relevance supplied normal/descriptor authority")
					}
					return true
				})
				if !installed {
					t.Fatal("original native member sink unavailable")
				}
				defer revoke()
				result := accessorCandidates{}
				query.standardConstructionMember(sourceConstructedMemberDemand{source: origin, projection: []string{"get"}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) {}, func([]sourceValue, []string, bool) {})
				if observed != 1 || len(result.values) != 0 {
					t.Fatal("original native event absent or supplied selected output", observed)
				}

			})
		})
	}
}

// Disjointness of the eventual mutation target cannot erase evaluation of the
// original key or descriptor. Throw prevents the mutation, and the unrelated
// helper remains dormant. Both emitted targets keep that order.
func TestReflectiveRelevanceEvaluationSessionAndArtifacts(t *testing.T) {
	const source = `function key(){document.title;return 'field'}function descriptor():PropertyDescriptor{window.name;throw new Error('descriptor-evaluation')}function dormant(){return navigator.userAgent}export function invoke(){return Object.defineProperty({},key(),descriptor())}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/reflective-evaluation.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		taskSource := "import { type Component, TaskContext } from '@exactjs/core';\n" + source + `
export function Page(this: Component<{ message: string }>) {
	this.state.message = 'ready';
	const owner = this;
	function run(_task: TaskContext = TaskContext.client()) {
		try {
			invoke();
			owner.state.message = 'unexpected success';
		} catch (error) {
			owner.state.message = (error as Error).message;
		}
	}
	return () => <button onClick={() => run()}>{this.state.message}</button>;
}
`
		fixture := newExecutableTSXFixture(t, taskSource)
		request := fixture.request("compile", "entry.tsx")
		request.Target = target
		componentResponse := fixture.session.Execute(request)
		if componentResponse.Error != "" || hasErrorDiagnostic(componentResponse.Diagnostics) || componentResponse.Code == "" {
			t.Fatal(target, componentResponse.Error, componentResponse.Diagnostics)
		}
		findComponent(t, componentResponse.Analysis.Components, "Page")
		if tasks := componentResponse.Analysis.Tasks; len(tasks) != 1 || tasks[0].Placement != "client" || !tasks[0].BrowserEffects {
			t.Fatalf("%s original operand effects must reach the client task: %#v", target, tasks)
		}
		document, window, navigator := false, false, false
		summary := executableSummary(t, componentResponse, "invoke")
		for _, effect := range summary.EffectSources {
			document = document || effect.Environment == "browser" && effect.Description == "document"
			window = window || effect.Environment == "browser" && effect.Description == "window"
			navigator = navigator || effect.Environment == "browser" && effect.Description == "navigator"
		}
		if !document || !window || navigator {
			t.Fatal("original reflective operand effects/dormancy differ", summary)
		}

		file := filepath.Join(t.TempDir(), "reflective-evaluation.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.document={get title(){events.push('key');return 'key'}};globalThis.window={get name(){events.push('descriptor');return 'descriptor'}};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get userAgent(){throw Error('unused-descriptor-callback')}}});const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.throws(()=>m.invoke(),/descriptor-evaluation/);assert.deepEqual(events,['key','descriptor']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s operand order/Throw: %v %s", target, err, output)
		}
	}
}

// A migration-debt marker records actual reconstruction, not visiting a writer
// candidate whose every original Call was excluded. A later exclusion cannot
// erase a real reconstruction already encountered in the same native Get.
func TestReflectiveRelevanceWriterRecoveryMarker(t *testing.T) {
	for _, row := range []struct {
		name, body        string
		reconstruct, zero bool
	}{
		{name: "excluded discovery"},
		{name: "writer reconstruction", body: `latent({});`, reconstruct: true},
		{name: "reconstruction without writer scopes", body: `unrelated();`, reconstruct: true, zero: true},
	} {
		reconstruct := row.reconstruct
		source := `const quiet=Symbol.for('quiet');function unrelated(){}function latent(target:Record<string,unknown>){target.freeze=()=>document.title}export function invoke(){` + row.body + `return Object.freeze({})}`
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			var prefix, parent, write *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsVariableDeclaration(node) && node.Name().Text() == "quiet" {
					prefix = node.Initializer()
				}
				if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "freeze" {
					parent = node
				}
				if plainStagedAssignment(node) {
					write = node
				}
				return true
			})
			if prefix == nil || parent == nil || write == nil {
				t.Fatal("original recovery/exclusion source missing")
			}
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			restore := registerWriterInputFacts(owner, facts)
			defer restore()
			if !work.stageNativeInputCall(facts, work.memberNodes[sourceStagedModuleOwner(prefix)], prefix, owner) {
				t.Fatal("original earlier primitive producer unavailable")
			}
			work.prepareOperationUses(facts, owner)
			caller := work.memberNodes[enclosingCallableNode(parent)]
			request, ok := sourceStagedOccurrenceRequest(&facts[caller], parent, relativeDemandEffects, "original-recovery-marker")
			if !ok {
				t.Fatal("original native parent request missing")
			}
			query := newSourceDependencyQuery(parent, owner.checker, owner, facts[caller].node)
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: parent, get: parent.Expression(), request: request})
			if !installed {
				t.Fatal("original native Get loan unavailable")
			}
			defer revoke()
			part := accessorCandidates{}
			cut := query.memberWriterReadCut(nil, nil, &part)
			var inputs []sourceMemberWriterInput
			query.withActiveInvocation(parent, func() { inputs = query.memberWriterInputs(write.AsBinaryExpression().Left, nil, &part, cut) })
			if row.zero && len(inputs) != 0 {
				t.Fatal(row.name, "unrelated actual reconstruction returned writer scopes", len(inputs))
			}
			if query.stagedNativeGet.writerDependent != reconstruct {
				t.Fatal("writer marker differs from actual reconstruction", reconstruct, query.stagedNativeGet.writerDependent)
			}
			retired := query.registerWriterInputRequest(prefix)
			if retired == nil {
				t.Fatal("original primitive discovery request unavailable")
			}
			defer retired.revoke()
			if !retired.excludeDiscovery(query, nil) || query.stagedNativeGet.writerDependent != reconstruct {
				t.Fatal("later actual exclusion erased reconstruction or failed to retire")
			}
		})
	}
}

// Keep a real current checker namespace; these are original source operations,
// not a copied acquired scope or a synthesized normal Get/binder.
func withReflectiveRelevanceSource(t *testing.T, source string, inspect func(*executableBodyOwner, *ast.SourceFile), packageTypes ...string) {
	t.Helper()
	const id = "/virtual/reflective-relevance.ts"
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}
	if len(packageTypes) == 1 {
		request.PackageType = packageTypes[0]
	}
	project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	inspect(newExecutableBodyOwner(project, generation.checker), generation.sourceFile)
}
