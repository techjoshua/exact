package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Replacement acceptance must report its first missing consumer before entering
// legacy recovery. This is the unchanged composition and its actual imports,
// rather than a source-profile admission or a timeout localization probe.
func TestStagedReplacementOriginalComposition(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke} from "./component-abi/opaque-operation";`})
	for name, source := range map[string]string{
		"component-abi/opaque-operation.ts": writerInputOpaqueComposition,
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = source
	}
	request := f.request("compile", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	response := f.session.Execute(request)
	for _, fragment := range []string{"Compiler analysis coverage gap: not yet implemented:", "opaque-operation.ts:", "consumer ", "source operation ", "demand ", "attempted legacy transition consumeInvocation"} {
		if !strings.Contains(response.Error, fragment) {
			t.Fatalf("missing causal replacement boundary %q: %s", fragment, response.Error)
		}
	}
	if response.Code != "" || response.SourceMap != nil || len(response.Analysis.Callables) != 0 {
		t.Fatal("interrupted replacement published partial artifacts or summaries")
	}
	for _, project := range f.session.projects {
		if project.stagedReplacement && !project.abandoned {
			t.Fatal("interrupted checker state remained reusable")
		}
	}
	t.Log(response.Error)
}

// DEFAULT and the now-represented module prefix retain the same artifact.
// Dormant writer donors remain on their own declaration, not module execution.
func TestStagedReplacementLegacyComparison(t *testing.T) {
	const source = `declare function foreign():void;function latent(target:Record<PropertyKey,unknown>,key:PropertyKey){window.name;foreign();target[key]=()=>document.title}export const prefix=Object.freeze(Object.defineProperties({}, {tag:{value:true}}));export const store=new WeakMap<object,unknown>();`
	request := Request{Kind: "compile", ID: "/virtual/replacement-comparison.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"}
	session := NewSession()
	before := session.Execute(request)
	if before.Error != "" || hasErrorDiagnostic(before.Diagnostics) || before.Code == "" {
		t.Fatal("legacy comparison no longer supported", before.Error, before.Diagnostics)
	}
	request.stagedReplacement = true
	after := session.Execute(request)
	if after.Error != "" || hasErrorDiagnostic(after.Diagnostics) || after.Code == "" || after.Code != before.Code {
		t.Fatal("represented module prefix changed ordinary artifact", after.Error, after.Diagnostics)
	}
	roots := make(map[*ast.Node]bool)
	latentKnown, latentUnknown := false, false
	var replacementFacts []callableFacts
	for _, project := range session.projects {
		if project.stagedReplacement && project.callableCache != nil {
			for _, analysis := range project.callableCache.bySource {
				replacementFacts = append(replacementFacts, analysis.facts...)
			}
		}
	}
	for _, fact := range replacementFacts {
		if runtimeModuleEvaluation(fact.node) {
			if !fact.staged.settled || fact.staged.operationsPending || len(fact.summary.EffectSources) != 0 {
				t.Fatal("module publication acquired a dormant donor or lost source closure")
			}
			for _, use := range fact.staged.operationUses {
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.key != use.request.producer || recipe.nativeGet == nil || recipe.key.selector != (sourceStagedOperationSelector{}) {
						continue
					}
					if !validNativeGetRecipe(recipe) || !sameOperationRequest(recipe.nativeGet.request, use.request) || recipe.nativeGet.method == nil {
						t.Fatal("module artifact bypassed original native source owner")
					}
					roots[recipe.key.operation] = true
				}
			}
		} else if fact.summary.Name == "latent" {
			for _, effect := range fact.summary.EffectSources {
				latentKnown = latentKnown || effect.Environment == "browser"
				latentUnknown = latentUnknown || effect.Environment == "unknown"
			}
		}
	}
	if len(roots) != 2 || !latentKnown || !latentUnknown {
		t.Fatal("comparison lost actual native roots or independent dormant donors", len(roots), latentKnown, latentUnknown)
	}
	// Replacement completion cannot contaminate the ordinary cache either.
	request.stagedReplacement = false
	again := session.Execute(request)
	if again.Error != "" || hasErrorDiagnostic(again.Diagnostics) || again.Code != before.Code {
		t.Fatal("replacement analysis changed ordinary ownership", again.Error, again.Diagnostics)
	}
}

// An actual ambient Call is represented runtime uncertainty, not a missing
// source producer. Enabling the migration gate must retain both donors.
func TestStagedReplacementKnownAndRuntimeUnknown(t *testing.T) {
	const source = `declare function foreign():void;function leaf(){window.name;foreign()}export function invoke(){leaf()}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/replacement-runtime-unknown.ts", Source: source, Diagnostics: "semantic", stagedReplacement: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	known, unknown := false, false
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !known || !unknown {
		t.Fatal("replacement gate erased represented runtime alternatives")
	}
}

func TestStagedReplacementSupportedArtifact(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/replacement-supported.ts", Source: `export function invoke(){return Object.freeze({value:1})}`, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal("supported staged producer refused", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "replacement.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);const result=m.invoke();assert.equal(result.value,1);assert.equal(Object.isFrozen(result),true);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatal(target, err, string(output))
		}
	}
}

// An actual native source can have an unmapped argument consumer. Replacement
// analysis must stop before its fallback publishes compiler provenance as an
// opaque runtime effect. DEFAULT remains comparison evidence only.
func TestStagedReplacementNativeEffectsFallback(t *testing.T) {
	const source = `export function invoke(prototype:object|null,other:PropertyDescriptor){let descriptor:PropertyDescriptor={value:()=>window.name};descriptor=other;return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',descriptor))}`
	session := NewSession()
	request := Request{Kind: "compile", ID: "/virtual/native-replacement-gap.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"}
	before := session.Execute(request)
	if before.Error != "" || hasErrorDiagnostic(before.Diagnostics) || before.Code == "" {
		t.Fatal("DEFAULT comparison unavailable", before.Error, before.Diagnostics)
	}
	incomplete := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "invoke" {
			for _, effect := range fact.summary.EffectSources {
				incomplete = incomplete || effect.provenanceIncomplete
			}
		}
	}
	if !incomplete {
		t.Fatal("comparison no longer contains original fallback provenance")
	}
	request.stagedReplacement = true
	after := session.Execute(request)
	for _, fragment := range []string{"not yet implemented: native Call Effects input/source delivery", "consumer ", "source operation KindCallExpression@", "demand 0", "attempted legacy transition appendAccessorEffects"} {
		if !strings.Contains(after.Error, fragment) {
			t.Fatalf("missing original native fallback boundary %q: %s", fragment, after.Error)
		}
	}
	if after.Code != "" || after.SourceMap != nil || len(after.Analysis.Callables) != 0 {
		t.Fatal("interrupted native replacement published artifacts or summaries")
	}
	for _, project := range session.projects {
		if project.stagedReplacement && !project.abandoned {
			t.Fatal("aborted native graph remained reusable")
		}
	}
	request.stagedReplacement = false
	again := session.Execute(request)
	if again.Error != "" || again.Code != before.Code {
		t.Fatal("private replacement gate changed DEFAULT behavior", again.Error)
	}
}
