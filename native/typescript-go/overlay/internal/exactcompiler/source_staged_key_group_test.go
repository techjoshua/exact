package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This is a connected module-key/map source journey. A conditional Symbol
// category is consumed only with the exact original producer root dependency.
// It does not establish registry identity or replace module initialization.
func TestStagedKeySourcesComputedMapOriginalModule(t *testing.T) {
	const source = `const identity=Symbol.for('identity');const execution=Symbol.for('execution');const generation=Symbol.for('generation');const metadata=Symbol.for('metadata');const prototype=Object.freeze(Object.defineProperties({},{[identity]:{value:true},[generation]:{value:6},[execution]:{value:()=>document.title},[metadata]:{value:7}}));export function invoke(){return prototype}`
	withStagedKeyModuleQuery(t, source, func(query *sourceValueQuery) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		var outer *ast.Node
		walkNode(ast.GetSourceFileOfNode(query.effectOwner).AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && stagedNativeInputIntent(node.Expression()) == sourceNativeObjectFreeze {
				outer = node
			}
			return true
		})
		declaration := sourceStagedModuleOwner(outer)
		work.indexOperationSources(facts)
		index, found := work.memberNodes[declaration]
		if !found || !work.stageNativeInputCall(facts, index, outer, query.executable) {
			t.Fatal("original module group not adopted")
		}
		work.prepareOperationUses(facts, query.executable)
		symbols, computed := 0, 0
		for key, recipe := range work.operationRecipes {
			if recipe.nativeGet == nil {
				continue
			}
			if recipe.nativeGet.kind == sourceNativeSymbolFor && key == recipe.nativeGet.request.producer {
				symbols++
			}
			if recipe.mapEntry != nil {
				continue
			}
			if recipe.nativeGet.descriptorMap != nil && key == nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
				source := recipe.nativeGet
				if len(source.keySources) != 4 {
					t.Fatal("computed key source associations missing", len(source.keySources))
				}
				eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer]
				if len(eager.delta.required) != 4 {
					t.Fatal("key module roots not required before map extraction")
				}
				for _, required := range eager.delta.required {
					producer := work.operationRecipes[required.producer]
					if !work.validStagedKeySourceReading(producer, required) || required.cut != producer.nativeGet.request.cut || required.consumer != declaration {
						t.Fatal("producer/read cut or module association lost")
					}
					wrong := required
					wrong.reading.selector.occurrence = outer
					if work.validStagedKeySourceReading(producer, wrong) {
						t.Fatal("unissued key occurrence borrowed source category")
					}
				}
				computed++
			}
		}
		closed := work.closedOperationDependencies()
		for _, use := range facts[index].staged.operationUses {
			if id, adopted := work.operationIDs[use.request.producer]; !adopted || !closed[id.index] {
				for i := 1; i < len(work.operations); i++ {
					if !closed[i] {
						state := work.operations[i]
						t.Log("pending", state.key.operation.Pos(), state.key.selector.field, "rev", state.revision, "extracted", state.delta.extracted, "invalid", state.invalid, "required", len(state.dependencies))
					}
				}
				t.Fatal("original module group did not settle", use.request.producer.selector)
			}
		}
		if symbols != 4 || computed != 1 {
			t.Fatal("original key/map producer chain incomplete", symbols, computed)
		}
	})
}

// This source-inspection helper permits only the explicit no-partial-output
// compiler-pending response while the group is being connected. Terminal public
// tests use the ordinary Session contract and cannot use this helper as evidence.
func withStagedKeyModuleQuery(t *testing.T, source string, inspect func(*sourceValueQuery)) {
	t.Helper()
	const id = "/virtual/key-source-group.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if hasErrorDiagnostic(response.Diagnostics) || response.Error != "" && !strings.HasPrefix(response.Error, "Compiler analysis coverage gap: required staged effect contribution") {
		t.Fatal(response.Error, response.Diagnostics)
	}
	if response.Error != "" && (response.Code != "" || len(response.Analysis.Callables) != 0) {
		t.Fatal("partial publication")
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && enclosingCallableNode(node) == nil && stagedNativeInputIntent(node.Expression()) == sourceNativeObjectFreeze {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("original module call")
		}
		owner := project.callableCache.owner
		inspect(newSourceDependencyQuery(call, owner.checker, owner, sourceStagedModuleOwner(call)))
		return
	}
	t.Fatal("original source project unavailable")
}

func TestStagedKeySourcesComputedMapPublicArtifacts(t *testing.T) {
	const source = `const identity=Symbol.for('identity');const execution=Symbol.for('execution');const generation=Symbol.for('generation');const metadata=Symbol.for('metadata');const prototype=Object.freeze(Object.defineProperties({},{[identity]:{value:true},[generation]:{value:6},[execution]:{value:()=>document.title},[metadata]:{value:7}}));export function invoke(){return prototype}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/key-map-public.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		invoke := executableSummary(t, response, "invoke")
		for _, effect := range invoke.EffectSources {
			if effect.Environment == "browser" || effect.Environment == "unknown" {
				t.Fatal("computed key construction invoked dormant data", effect)
			}
		}
		runStagedKeyModule(t, response.Code, `const p=m.invoke();assert.equal(reads,0);assert.equal(Object.isFrozen(p),true);assert.equal(p[Symbol.for('identity')],true);assert.equal(p[Symbol.for('generation')],6);assert.equal(p[Symbol.for('metadata')],7);assert.equal(p[Symbol.for('execution')](),'title');assert.equal(reads,1);`)
	}
}

func runStagedKeyModule(t *testing.T, code, assertions string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "key-map.mts")
	if err := os.WriteFile(path, []byte(code), 0600); err != nil {
		t.Fatal(err)
	}
	runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.document={get title(){reads++;return 'title'}};const m=await import(pathToFileURL(process.argv[1]).href);` + assertions
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(output))
	}
}

// The formal's type supplies no coercion authority. The original Call's detached
// input association transfers the actual primitive source to the ToString role.
func TestStagedKeySourcesTemplateRelativeCoercion(t *testing.T) {
	const source = "function makeKey(name:string){return Symbol.for(`registry/${name}`)}export function invoke(){return makeKey('fixture')}"
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/key-coercion.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			if effect.Environment == "unknown" || effect.Environment == "browser" {
				t.Fatal("primitive actual left unresolved coercion", effect)
			}
		}
		relative := false
		for _, fact := range stagedDeclarationFacts(session) {
			for _, effect := range fact.summary.DirectEffectSources {
				relative = relative || effect.relativeCoercion != nil
			}
		}
		if !relative {
			t.Fatal("formal ToString role was paid from its type or syntax")
		}
		runStagedKeyModule(t, response.Code, `assert.equal(Symbol.keyFor(m.invoke()),'registry/fixture');assert.equal(reads,0);`)
	}
}

// Imported scalar reads require the existing selected module initializer, not
// an acquired module value or invocation of its declarations.
func TestStagedKeySourcesImportedDescriptorInput(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":    `import{version}from'./contract.js';const identity=Symbol.for('identity');const generation=Symbol.for('generation');const prototype=Object.freeze(Object.defineProperties({},{[identity]:{value:true},[generation]:{value:version}}));export function invoke(){return prototype}`,
		"contract.ts": `export const version=6;`,
	})
	for _, target := range []Target{TargetClient, TargetServer} {
		request := f.request("compile", "entry.ts")
		request.Target = target
		response := f.session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		for _, summary := range response.Analysis.Callables {
			for _, effect := range summary.EffectSources {
				if effect.Environment == "unknown" || effect.Environment == "browser" {
					t.Fatal("imported data read acquired or invoked its value", effect)
				}
			}
		}
	}
}

func TestStagedKeySourcesTypeDoesNotPayCoercion(t *testing.T) {
	const source = "export function invoke(name:string){return Symbol.for(`registry/${name}`)}"
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/key-unbound.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		unknown := false
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			unknown = unknown || effect.Environment == "unknown"
		}
		if !unknown {
			t.Fatal("string annotation paid an unbound ToString demand")
		}
		runStagedKeyModule(t, response.Code, `const sentinel={};let calls=0;assert.throws(()=>m.invoke({toString(){calls++;throw sentinel}}),error=>error===sentinel);assert.equal(calls,1);`)
	}
}

func TestStagedKeySourcesObjectCoercionRetainsOriginalOwner(t *testing.T) {
	const source = "function makeKey(name:string){return Symbol.for(`registry/${name}`)}export function invoke(){window.name;return makeKey({toString(){return document.title}} as unknown as string)}"
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/key-object.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	known, unknown := false, false
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		known = known || effect.Environment == "browser" && effect.Description == "window"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !known || !unknown {
		t.Fatal("unsupported object conversion discarded known or unknown Effects")
	}
	legacy := false
	for _, fact := range stagedDeclarationFacts(session) {
		for _, call := range fact.staged.calls {
			legacy = legacy || call.invocation.declaration.Name() != nil && callableNameText(call.invocation.declaration.Name()) == "makeKey" && call.legacyInputs
		}
	}
	if !legacy {
		t.Fatal("object coercion borrowed primitive source delivery")
	}
	runStagedKeyModule(t, response.Code, `let windowReads=0;globalThis.window={get name(){windowReads++;return 'known'}};assert.equal(reads,0);assert.equal(Symbol.keyFor(m.invoke()),'registry/title');assert.equal(reads,1);assert.equal(windowReads,1);`)
}
