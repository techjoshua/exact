package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const stagedReturnedCaptureSource = `
function factory(callback:()=>string){return ()=>callback()}
function browser(){return window.name}
function quiet(){return 'quiet'}
export function savedBrowser(){const saved=factory(browser);const fresh=factory(quiet);return saved()}
export function savedQuiet(){const saved=factory(quiet);const fresh=factory(browser);return saved()}
export function partial(callback:()=>string){const known=factory(browser);const other=factory(callback);known();return other()}
`

const returnedCaptureTaskExpression = "savedBrowser() + savedQuiet() + partial(props.callback)"

func returnedCaptureTaskSource(source, expression string) string {
	return "import { type Component, TaskContext } from '@exactjs/core';\n" + source + `
export function Page(this: Component<{ display: string }>, props: { callback: () => string }) {
	this.state.display = '';
	const refresh = (_task: TaskContext = TaskContext.client()) => {
		this.state.display = ` + expression + `;
	};
	return () => <button onClick={() => refresh()}>{this.state.display}</button>;
}`
}

func returnedCaptureTaskFixture(t *testing.T, source, expression string) *executableFixture {
	t.Helper()
	fixture := newExecutableFixture(t, map[string]string{"entry.tsx": returnedCaptureTaskSource(source, expression)})
	const config = `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"jsx":"preserve","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
	if err := os.WriteFile(fixture.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func TestStagedReturnedCapturePublicBaseline(t *testing.T) {
	var prior []byte
	fixture := returnedCaptureTaskFixture(t, stagedReturnedCaptureSource, returnedCaptureTaskExpression)
	request := fixture.request("analyze", "entry.tsx")
	for _, application := range []bool{false, true} {
		source, expression := stagedReturnedCaptureSource, returnedCaptureTaskExpression
		if application {
			source += `export function applied(){return partial(quiet)}`
			expression += " + applied()"
		}
		request.Source = returnedCaptureTaskSource(source, expression)
		response := NewSession().Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("source: %s %#v", response.Error, response.Diagnostics)
		}
		for name, want := range map[string]struct{ browser, unknown bool }{"savedBrowser": {true, false}, "savedQuiet": {false, false}, "partial": {true, true}} {
			summary := executableSummary(t, response, name)
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
			}
			t.Logf("%s browser=%t unknown=%t effects=%#v", name, browser, unknown, summary.EffectSources)
			if browser != want.browser || unknown != want.unknown {
				t.Fatalf("%s capture retargeted, lost donor or changed uncertainty", name)
			}
		}
		public, err := json.Marshal(executableSummary(t, response, "partial").EffectSources)
		if err != nil {
			t.Fatal(err)
		}
		if prior != nil && !bytes.Equal(prior, public) {
			t.Fatalf("application specialized public definition EffectSources: %s -> %s", prior, public)
		}
		prior = public
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "warning" && diagnostic.Code != "EXACT_ANALYSIS_COST" {
				t.Fatalf("ordinary relative input became a warning: %#v", diagnostic)
			}
		}
	}
}

func TestStagedReturnedCaptureSourceJourney(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/returned-journey.ts", Source: stagedReturnedCaptureSource, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source: %s %#v", response.Error, response.Diagnostics)
	}
	found := 0
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "savedBrowser" || fact.summary.Name == "savedQuiet" {
			found++
			if len(fact.staged.operationUses) != 1 || fact.staged.operationCreatingDeliveries != 1 || fact.staged.operationsPending || !fact.staged.settled || len(fact.staged.operationSkipped) != 3 {
				t.Fatalf("%s source return/capture producer was not consumed without legacy recovery: uses=%d creating=%d pending=%t skipped=%d legacy=%v", fact.summary.Name, len(fact.staged.operationUses), fact.staged.operationCreatingDeliveries, fact.staged.operationsPending, len(fact.staged.operationSkipped), fact.staged.legacy)
			}
			for _, node := range fact.staged.operationSkipped {
				if _, legacy := fact.staged.legacy[node]; legacy {
					t.Fatal("covered source occurrence entered legacy")
				}
			}
		}
	}
	if found != 2 {
		t.Fatal("missing actual saved source consumers")
	}
	capture := false
	for _, fact := range stagedDeclarationFacts(session) {
		for _, demand := range fact.staged.invoked {
			if demand.role.kind == relativeRoleCapture {
				capture = true
				if !stagedGetterSkipped(fact, demand.origin) {
					t.Fatal("capture Call entered recursive acquisition")
				}
			}
		}
	}
	if !capture {
		t.Fatal("actual returned body Call never issued its capture requirement")
	}
}

func TestStagedReturnedCaptureEmission(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/returned-emission.ts", Source: stagedReturnedCaptureSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "returned.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const oracle = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.window={get name(){reads++;return'browser'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(reads,0);assert.equal(m.savedBrowser(),'browser');assert.equal(reads,1);assert.equal(m.savedQuiet(),'quiet');assert.equal(reads,1);assert.equal(m.partial(()=> 'caller'),'caller');assert.equal(reads,2);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", oracle, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("emitted %s: %v %s", target, err, output)
		}
	}
}

func TestStagedReturnedCaptureCloneClosure(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/returned-clone.ts", Source: stagedReturnedCaptureSource, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source: %s %#v", response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		cache := project.callableCache
		if cache == nil {
			continue
		}
		for source, analysis := range cache.bySource {
			if source.FileName() != "/virtual/returned-clone.ts" {
				continue
			}
			for _, fault := range []bool{false, true} {
				cloned := analysis
				cloned.facts = make([]callableFacts, len(analysis.facts))
				for i, fact := range analysis.facts {
					cloned.facts[i] = cloneProjectCallableFact(fact)
				}
				if fault {
					for i := range cloned.facts {
						for _, demand := range cloned.facts[i].staged.invoked {
							if demand.role.kind == relativeRoleCapture {
								cloned.facts[i].staged.ready = false
							}
						}
					}
				}
				merged := mergeProjectCallableEffects(source, []callableAnalysis{cloned}, cache.owner)
				if fault && len(merged.pending) == 0 || !fault && len(merged.pending) != 0 {
					t.Fatal("clone inherited or lost required closure", fault)
				}
				for _, fact := range merged.facts {
					if fact.summary.Name == "savedBrowser" || fact.summary.Name == "savedQuiet" {
						if fact.staged.settled == fault {
							t.Fatal("issuing returned consumer ignored required body disposition", fault)
						}
					}
				}
			}
			for _, fact := range analysis.facts {
				if fact.summary.Name == "savedBrowser" && !fact.staged.settled {
					t.Fatal("clone altered retained source closure")
				}
			}
			return
		}
	}
	t.Fatal("missing returned source analysis")
}

func TestStagedReturnedCaptureReverseOrder(t *testing.T) {
	const source = `export function entry(){const saved=create(browser);const fresh=create(quiet);return saved()}function create(callback:()=>string){return()=>callback()}function browser(){return window.name}function quiet(){return 'quiet'}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/returned-reverse.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("reverse source: %s %#v", response.Error, response.Diagnostics)
	}
	known := false
	for _, effect := range executableSummary(t, response, "entry").EffectSources {
		known = known || effect.Environment == "browser"
		if effect.Environment == "unknown" {
			t.Fatal("reverse ordering lost captured input")
		}
	}
	if !known {
		t.Fatal("reverse ordering lost browser donor")
	}
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "entry" && (fact.staged.operationCreatingDeliveries != 1 || fact.staged.operationsPending || !fact.staged.settled) {
			t.Fatal("caller-before-factory failed source subscription")
		}
	}
}

func TestStagedReturnedCaptureIssuerIdentity(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedReturnedCaptureSource)
	caller := stagedDeltaFact(t, facts, "savedBrowser")
	use := facts[caller].staged.operationUses[0]
	work := callableEffectWork{extracting: -1}
	if _, ok := work.requireOperation(facts, use.request); !ok {
		t.Fatal("original source issuer refused")
	}
	forged := use.request
	forged.use = facts[caller].staged.returnedCreations[1].inputs.request.operation
	forged.edge += "-wrong-use"
	if _, ok := work.requireOperation(facts, forged); ok {
		t.Fatal("fresh factory Call borrowed saved invocation's input association")
	}
	source := facts[caller].staged.returnedCreations[0].uses[0]
	clone := cloneProjectCallableFact(facts[caller])
	clone.staged.returnedCreations[0].uses[0] = forged.use
	if facts[caller].staged.returnedCreations[0].uses[0] != source {
		t.Fatal("cloned source issuer list mutated original")
	}
}
