package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// This source witness traverses producer A, real binder B, validated edge C,
// demanded-role substitution D and central summary delivery E. Merely passing
// the dormant function is deliberately absent from any invocation requirement.
func TestStagedInvokedInputPublicTransfer(t *testing.T) {
	definitions := []string{
		`function browser(){return document.title;}`,
		`function dormant(){return window.name;}`,
		`function invoke(fn:()=>string,unused:()=>string){return fn();}`,
		`function forward(fn:()=>string,unused:()=>string){return invoke(fn,unused);}`,
		`export function run(other:()=>string){forward(browser,dormant);return forward(other,dormant);}`,
	}
	for _, reverse := range []bool{false, true} {
		ordered := append([]string(nil), definitions...)
		if reverse {
			slices.Reverse(ordered)
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-invoked-input.ts", Source: strings.Join(ordered, "\n"), Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("source qualification: %s %#v", response.Error, response.Diagnostics)
		}
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "warning" && diagnostic.Code != "EXACT_ANALYSIS_COST" {
				t.Fatalf("ordinary unresolved input acquired a warning: %#v", diagnostic)
			}
		}
		run := executableSummary(t, response, "run")
		browser, unknown, dormant := false, false, false
		for _, effect := range run.EffectSources {
			browser = browser || effect.Environment == "browser" && effect.Description == "document"
			unknown = unknown || effect.Environment == "unknown"
			dormant = dormant || effect.Environment == "browser" && effect.Description == "window"
		}
		if !browser || !unknown || dormant {
			t.Fatalf("lost donor/residual or activated dormant sibling: %#v", run)
		}
		for _, name := range []string{"invoke", "forward"} {
			definition := executableSummary(t, response, name)
			for _, effect := range definition.EffectSources {
				if effect.Environment == "browser" {
					t.Fatalf("application donor specialized %s definition: %#v", name, definition)
				}
			}
		}
		foundProducer, foundConsumer := false, false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name == "invoke" {
				foundProducer = len(fact.staged.invoked) == 1
				for _, demand := range fact.staged.invoked {
					if _, legacy := fact.staged.legacy[demand.origin]; legacy {
						t.Fatal("covered invoked formal entered legacy recovery")
					}
				}
			}
			if fact.summary.Name == "run" {
				for _, edge := range fact.summary.Calls {
					foundConsumer = foundConsumer || strings.Contains(edge.ID, ":invoked-input:") && edge.Resolved
				}
				for _, call := range fact.staged.calls {
					if call.inputs == nil || !call.inputs.delivered || call.inputs.relative.unsupported != relativeInputsSupported {
						t.Fatal("composition did not consume the original binder edge")
					}
				}
			}
		}
		if !foundProducer || !foundConsumer {
			t.Fatalf("source transfer was decorative: producer=%t consumer=%t", foundProducer, foundConsumer)
		}
	}
}

func TestStagedInvokedInputEmission(t *testing.T) {
	const source = `function browser(){return document.title;}function dormant(){return window.name;}function invoke(fn:()=>string,unused:()=>string){return fn();}function forward(fn:()=>string,unused:()=>string){return invoke(fn,unused);}export function run(other:()=>string){forward(browser,dormant);return forward(other,dormant);}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/staged-invoked-emission.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		filename := filepath.Join(t.TempDir(), "invoked.mts")
		if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.document={get title(){events.push('browser');return 'known'}};globalThis.window={get name(){throw new Error('dormant sibling invoked')}};const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.run(()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['browser','other']);`
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

func TestStagedInvokedInputRecursiveClosure(t *testing.T) {
	const source = `declare const flag:boolean;function browser(){return document.title;}function dormant(){return window.name;}function a(fn:()=>string):string{if(flag)return b(fn);return fn();}function b(fn:()=>string):string{return a(fn);}export function run(other:()=>string):string{a(browser);return a(other);}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-invoked-cycle.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("recursive source: %s %#v", response.Error, response.Diagnostics)
	}
	known, unknown := false, false
	for _, effect := range executableSummary(t, response, "run").EffectSources {
		known = known || effect.Environment == "browser" && effect.Description == "document"
		unknown = unknown || effect.Environment == "unknown"
		if effect.Description == "window" {
			t.Fatal("recursive forwarding activated an unrelated donor")
		}
	}
	if !known || !unknown {
		t.Fatal("recursive requirements lost known/relative alternatives")
	}
	deliveries := 0
	for _, fact := range stagedDeclarationFacts(session) {
		for _, byDemand := range fact.staged.transfers {
			deliveries += len(byDemand)
		}
	}
	// Four source Call edges consume the same original invocation requirement.
	// This is the finite relation contract, independent of recursive path depth.
	if deliveries != 4 {
		t.Fatalf("unexpected unique edge/requirement deliveries: %d", deliveries)
	}
}
