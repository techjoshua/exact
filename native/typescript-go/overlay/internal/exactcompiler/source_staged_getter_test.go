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

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// stagedGetterWitness retains the prepared acquireMember definition unchanged.
// Its caller below is authored source, not a manually assembled returned value.
func stagedGetterWitness(t *testing.T) string {
	t.Helper()
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/member.ts", Path: tspath.Path("/member.ts")}, stagedOperationMemberFixture, core.ScriptKindTS)
	for _, statement := range source.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil && statement.Name().Text() == "acquireMember" {
			return sourceText(source, statement)
		}
	}
	t.Fatal("missing prepared getter source witness")
	return ""
}

const stagedGetterCaller = `export function invokeStored(){const saved=acquireMember();return saved();}`

// These controls establish the pre-migration semantic journey. Passing them is
// not staged-getter coverage until the producer/consumer path is connected and
// its legacy-recovery exclusion is asserted at the original source occurrences.
func TestGetterExposureSourceBaseline(t *testing.T) {
	source := stagedGetterWitness(t)
	var priorEffects []byte
	for _, invoked := range []bool{false, true} {
		text := source
		if invoked {
			text += stagedGetterCaller
		}
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/getter-journey.ts", Source: text, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("getter source: %s %#v", response.Error, response.Diagnostics)
		}
		acquired := executableSummary(t, response, "acquireMember")
		getter, callback, unknown := false, false, false
		for _, effect := range acquired.EffectSources {
			getter = getter || effect.Environment == "browser" && effect.Description == "window"
			callback = callback || effect.Environment == "browser" && effect.Description == "document"
			unknown = unknown || effect.Environment == "unknown"
		}
		if !getter || callback || unknown {
			t.Fatalf("Get changed the baseline eager/dormant/uncertainty disposition: %#v", acquired.EffectSources)
		}
		public, err := json.Marshal(acquired.EffectSources)
		if err != nil {
			t.Fatal(err)
		}
		if priorEffects != nil && !bytes.Equal(priorEffects, public) {
			t.Fatalf("caller changed public getter EffectSources: before=%s after=%s", priorEffects, public)
		}
		priorEffects = public
		t.Logf("baseline acquired unknown=%t publicEffectSources=%s", unknown, public)
		if !invoked {
			continue
		}
		getter, callback, unknown = false, false, false
		for _, effect := range executableSummary(t, response, "invokeStored").EffectSources {
			getter = getter || effect.Environment == "browser" && effect.Description == "window"
			callback = callback || effect.Environment == "browser" && effect.Description == "document"
			unknown = unknown || effect.Environment == "unknown"
		}
		if !getter || !callback || unknown {
			t.Fatalf("later source Call changed getter/callback/uncertainty disposition: %#v", executableSummary(t, response, "invokeStored").EffectSources)
		}
		t.Logf("baseline invoked unknown=%t", unknown)
	}
}

func TestGetterExposureEmittedBaseline(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/getter-emission.ts", Source: stagedGetterWitness(t) + stagedGetterCaller, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		filename := filepath.Join(t.TempDir(), "getter.mts")
		if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.window={get name(){events.push('getter');return'name'}};globalThis.document={get title(){events.push('callback');return'title'}};const m=await import(pathToFileURL(process.argv[1]).href);const saved=m.acquireMember();assert.equal(typeof saved,'function');assert.deepEqual(events,['getter']);assert.equal(saved(),'title');assert.deepEqual(events,['getter','callback']);assert.equal(m.invokeStored(),'title');assert.deepEqual(events,['getter','callback','getter','callback']);`
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// An independent unresolved eager Call must survive alongside the known getter
// effect. The returned callback remains dormant even in this uncertain case.
func TestGetterExposureIndependentUnknownBaseline(t *testing.T) {
	const source = `declare function foreign():void;export function acquireUnknown(){const table={get run(){window.name;foreign();return()=>document.title;}};return table.run;}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/getter-unknown.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("unknown getter source: %s %#v", response.Error, response.Diagnostics)
	}
	known, unknown, dormant := false, false, false
	for _, effect := range executableSummary(t, response, "acquireUnknown").EffectSources {
		known = known || effect.Environment == "browser" && effect.Description == "window"
		unknown = unknown || effect.Environment == "unknown"
		dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
	}
	if !known || !unknown || dormant {
		t.Fatalf("eager known/unknown or dormant disposition changed: %#v", executableSummary(t, response, "acquireUnknown").EffectSources)
	}
}

// The source journey must transfer both kinds of requirements and exclude the
// old recovery at the actual Get, creating Call and stored Call. Public effects
// alone would also pass when the old recursive acquisition still did the work.
func TestStagedGetterSourceTransfer(t *testing.T) {
	for _, invoked := range []bool{false, true} {
		source := stagedGetterWitness(t)
		if invoked {
			source += stagedGetterCaller
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-getter-source.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("staged getter: %s %#v", response.Error, response.Diagnostics)
		}
		factory, caller := false, !invoked
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name == "acquireMember" {
				factory = len(fact.staged.operationRecipes) == 2 && len(fact.staged.operationUses) == 1 && fact.staged.operationDeliveries == 1 && fact.staged.operationCreatingDeliveries == 0 && fact.staged.settled && !fact.staged.operationsPending
				for _, use := range fact.staged.operationUses {
					if use.request.producer.kind != relativeDemandEffects || use.call != nil || !stagedGetterSkipped(fact, use.request.producer.operation) {
						t.Fatal("eager Get was not transferred independently")
					}
				}
			}
			if fact.summary.Name == "invokeStored" {
				t.Logf("stored source: uses=%d deliveries=%d creating=%d settled=%t pending=%t legacy=%v", len(fact.staged.operationUses), fact.staged.operationDeliveries, fact.staged.operationCreatingDeliveries, fact.staged.settled, fact.staged.operationsPending, fact.staged.legacy)
				caller = len(fact.staged.operationUses) == 1 && fact.staged.operationCreatingDeliveries == 1 && fact.staged.operationDeliveries == 1 && fact.staged.settled && !fact.staged.operationsPending
				for _, use := range fact.staged.operationUses {
					edge := use.request.inputs
					if edge != nil && (edge.request.use != nil || edge.request.cut.use != nil) {
						t.Fatal("definition-relative creating Call acquired an instantiated use")
					}
					if edge == nil || !edge.delivered || use.call == nil || edge.request.operation == use.call || use.request.cut.operation == edge.request.operation || !stagedGetterSkipped(fact, edge.request.operation) || !stagedGetterSkipped(fact, use.call) {
						t.Fatal("creating/Get/later Call associations were lost or recovery was replayed")
					}
					if _, legacy := fact.staged.legacy[edge.request.operation]; legacy {
						t.Fatal("creating Call entered legacy recovery")
					}
					if _, legacy := fact.staged.legacy[use.call]; legacy {
						t.Fatal("stored Call entered legacy recovery")
					}
				}
			}
		}
		if !factory || !caller {
			t.Fatalf("decorative getter transfer: factory=%t caller=%t", factory, caller)
		}
	}
}

func stagedGetterSkipped(fact callableFacts, node *ast.Node) bool {
	for _, skipped := range fact.staged.operationSkipped {
		if skipped == node {
			return true
		}
	}
	return false
}

func TestStagedGetterReverseOrder(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/getter-reverse.ts", Source: stagedGetterCaller + stagedGetterWitness(t), Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("reverse source: %s %#v", response.Error, response.Diagnostics)
	}
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "invokeStored" {
			if fact.staged.operationCreatingDeliveries != 1 || !fact.staged.settled || fact.staged.operationsPending || len(fact.staged.operationUses) != 1 {
				t.Fatal("caller-before-factory did not receive its creating association")
			}
			use := fact.staged.operationUses[0]
			if !stagedGetterSkipped(fact, use.call) || !stagedGetterSkipped(fact, use.request.inputs.request.operation) {
				t.Fatal("reverse source order replayed original Call recovery")
			}
		}
	}
	known := map[string]bool{}
	for _, effect := range executableSummary(t, response, "invokeStored").EffectSources {
		known[effect.Description] = true
		if effect.Environment == "unknown" {
			t.Fatal("reverse order introduced uncertainty")
		}
	}
	if !known["window"] || !known["document"] {
		t.Fatal("reverse order lost an eager or invoked donor")
	}
}

func TestStagedGetterCloneAssociations(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/getter-clone.ts", Source: stagedGetterWitness(t) + stagedGetterCaller, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("clone source: %s %#v", response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		cache := project.callableCache
		if cache == nil {
			continue
		}
		for source, analysis := range cache.bySource {
			if source.FileName() != "/virtual/getter-clone.ts" {
				continue
			}
			cloned := analysis
			cloned.facts = make([]callableFacts, len(analysis.facts))
			for index, fact := range analysis.facts {
				cloned.facts[index] = cloneProjectCallableFact(fact)
			}
			if blocked := callableAnalysisFromFacts(source, cloned.facts, nil); len(blocked.pending) == 0 || len(blocked.summaries) != 0 {
				t.Fatal("cloned getter inherited publication rights")
			}
			merged := mergeProjectCallableEffects(source, []callableAnalysis{cloned}, cache.owner)
			if len(merged.pending) != 0 {
				t.Fatal("cloned getter dependencies did not settle")
			}
			for _, fact := range merged.facts {
				if fact.summary.Name == "invokeStored" {
					if fact.staged.operationCreatingDeliveries != 1 || len(fact.staged.operationUses) != 1 || !fact.staged.settled {
						t.Fatal("new graph failed to deliver the detached creating association")
					}
					edge := fact.staged.operationUses[0].request.inputs
					if !edge.delivered || edge.request.use != nil || edge.request.operation == fact.staged.operationUses[0].call {
						t.Fatal("clone rebound the original creating edge")
					}
				}
			}
			for _, fact := range analysis.facts {
				if fact.summary.Name == "invokeStored" && fact.staged.operationCreatingDeliveries != 1 {
					t.Fatal("clone mutated retained source delivery state")
				}
			}
			return
		}
	}
	t.Fatal("missing getter source analysis")
}
