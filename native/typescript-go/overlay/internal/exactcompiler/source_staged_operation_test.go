package exactcompiler

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

//go:embed source_m04_member_fixture.ts
var stagedOperationMemberFixture string

// Select the prepared source declaration by its authored name. The test keeps
// its real expression rather than constructing detached exposure records.
func stagedMemberWitness(t *testing.T) string {
	t.Helper()
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/member.ts", Path: tspath.Path("/member.ts")}, stagedOperationMemberFixture, core.ScriptKindTS)
	for _, statement := range source.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil && statement.Name().Text() == "selectMember" {
			return sourceText(source, statement)
		}
	}
	t.Fatal("missing prepared member source witness")
	return ""
}

func TestStagedOperationSelectMember(t *testing.T) {
	source := stagedMemberWitness(t)
	var definition []byte
	for _, application := range []bool{false, true} {
		text := source
		if application {
			text += `function known(){return window.name;}export function apply(flag:boolean){return selectMember(flag,known);}`
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-member.ts", Source: text, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("member source: %s %#v", response.Error, response.Diagnostics)
		}
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "warning" && diagnostic.Code != "EXACT_ANALYSIS_COST" {
				t.Fatalf("ordinary relative input acquired a warning: %#v", diagnostic)
			}
		}
		selected := executableSummary(t, response, "selectMember")
		known, unknown := false, false
		for _, effect := range selected.EffectSources {
			known = known || effect.Environment == "browser" && effect.Description == "document"
			unknown = unknown || effect.Environment == "unknown"
		}
		if !known || !unknown {
			t.Fatalf("lost known/relative contributions: %#v", selected.EffectSources)
		}
		public, err := json.Marshal(selected.EffectSources)
		if err != nil {
			t.Fatal(err)
		}
		// Native records also carry private AST pointers, which legitimately
		// differ across Sessions. Compare every public EffectSources field.
		if definition != nil && !bytes.Equal(definition, public) {
			t.Fatalf("application changed public EffectSources: before=%s after=%s", definition, public)
		}
		definition = public
		connected := false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name != "selectMember" {
				continue
			}
			connected = len(fact.staged.operationUses) == 1 && fact.staged.operationDeliveries == 2 && !fact.staged.operationsPending && fact.staged.settled
			for _, plan := range fact.staged.operationUses {
				if _, legacy := fact.staged.legacy[plan.call]; legacy {
					t.Fatal("covered member Call entered recursive legacy recovery")
				}
				if plan.request.producer.operation.Expression() == nil || plan.request.use != plan.call {
					t.Fatal("member producer lost its original Get/Call occurrence")
				}
			}
		}
		if !connected {
			t.Fatal("source producer did not reach the issuing consumer and publication")
		}
		if application {
			knownActual, unresolved := false, false
			for _, effect := range executableSummary(t, response, "apply").EffectSources {
				knownActual = knownActual || effect.Environment == "browser" && effect.Description == "window"
				unresolved = unresolved || effect.Environment == "unknown"
			}
			if !knownActual || unresolved {
				t.Fatal("real composition edge did not use demanded-role substitution")
			}
		}
	}
}

func TestStagedOperationDormantSibling(t *testing.T) {
	const source = `export function select(flag:boolean,foreign:()=>string){const table={run:flag?()=>document.title:foreign,unused:()=>window.name};return table.run();}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/staged-member-dormant.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("dormant source: %s %#v", response.Error, response.Diagnostics)
	}
	known, unknown := false, false
	for _, effect := range executableSummary(t, response, "select").EffectSources {
		known = known || effect.Description == "document" && effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
		if effect.Description == "window" {
			t.Fatal("storage activated the unrelated sibling")
		}
	}
	if !known || !unknown {
		t.Fatal("dormancy filtering discarded a selected contribution")
	}
}

func TestStagedOperationMemberEmission(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/staged-member-emission.ts", Source: stagedMemberWitness(t), Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		filename := filepath.Join(t.TempDir(), "member.mts")
		if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.document={get title(){events.push('browser');return'known'}};const m=await import(pathToFileURL(process.argv[1]).href);function foreign(){assert.equal(this.run,foreign);events.push('foreign');return'foreign'}assert.equal(m.selectMember(true,foreign),'known');assert.equal(m.selectMember(false,foreign),'foreign');assert.deepEqual(events,['browser','foreign']);`
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, strings.TrimSpace(string(output)))
		}
	}
}

func TestStagedOperationUnmigratedMembers(t *testing.T) {
	for _, control := range []struct{ name, source string }{
		{"captured-input", `export function read(callback:()=>string){const table={run:()=>{document.title;return callback()}};return table.run();}`},
		{"getter", `export function read(){const table={get run(){window.name;return ()=>document.title}};return table.run();}`},
		{"write", `export function read(){const table={run:()=>''};table.run=()=>document.title;return table.run();}`},
		{"rest", `export function read(...callbacks:(()=>string)[]){const table={run:callbacks[0]};return table.run();}`},
		{"new-target", `export function read(){const table={run:()=>new.target?document.title:''};return table.run();}`},
	} {
		t.Run(control.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-member-" + control.name + ".ts", Source: control.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("existing member owner: %s %#v", response.Error, response.Diagnostics)
			}
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name == "read" && len(fact.staged.operationUses) != 0 {
					t.Fatal("unsupported member capability acquired staged coverage")
				}
			}
			if control.name != "rest" && control.name != "new-target" {
				known := false
				for _, effect := range executableSummary(t, response, "read").EffectSources {
					known = known || effect.Environment == "browser" && effect.Description == "document"
				}
				if !known {
					t.Fatal("unmigrated owner lost the independent known donor")
				}
			}
		})
	}
}

func TestStagedOperationReceiverActualRetainsOwner(t *testing.T) {
	source := stagedMemberWitness(t) + `function observe(this:{run?:unknown}){return this.run?window.name:window.name;}export function apply(flag:boolean){return selectMember(flag,observe);}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-member-receiver.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("receiver source: %s %#v", response.Error, response.Diagnostics)
	}
	known := false
	for _, effect := range executableSummary(t, response, "apply").EffectSources {
		known = known || effect.Environment == "browser" && effect.Description == "window"
	}
	if !known {
		t.Fatal("original receiver/effect owner lost its known donor")
	}
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "apply" {
			continue
		}
		retained := len(fact.staged.legacy) != 0
		for _, call := range fact.staged.calls {
			if !call.legacyInputs {
				t.Fatal("receiver-dependent actual silently used formal-only substitution")
			}
			retained = true
		}
		if !retained {
			t.Fatal("receiver-dependent actual lost its original input consumer")
		}
	}
}

func TestStagedOperationMergedCloneRebuild(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-member-clone.ts", Source: stagedMemberWitness(t), Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("clone source: %s %#v", response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		cache := project.callableCache
		if cache == nil {
			continue
		}
		for source, analysis := range cache.bySource {
			if source.FileName() != "/virtual/staged-member-clone.ts" {
				continue
			}
			cloned := analysis
			cloned.facts = make([]callableFacts, len(analysis.facts))
			for index, fact := range analysis.facts {
				cloned.facts[index] = cloneProjectCallableFact(fact)
			}
			if blocked := callableAnalysisFromFacts(source, cloned.facts, nil); len(blocked.pending) == 0 || len(blocked.summaries) != 0 {
				t.Fatal("clone inherited member publication rights")
			}
			merged := mergeProjectCallableEffects(source, []callableAnalysis{cloned}, cache.owner)
			if len(merged.pending) != 0 {
				t.Fatal("real merged operation graph did not settle")
			}
			known, unknown, delivered := false, false, false
			for _, summary := range merged.summaries {
				if summary.Name == "selectMember" {
					for _, effect := range summary.EffectSources {
						known = known || effect.Environment == "browser"
						unknown = unknown || effect.Environment == "unknown"
					}
				}
			}
			for _, fact := range merged.facts {
				if fact.summary.Name == "selectMember" {
					delivered = fact.staged.operationDeliveries == 2 && fact.staged.settled && !fact.staged.operationsPending
				}
			}
			if !known || !unknown || !delivered {
				t.Fatal("merged source alternatives did not reach independent publication")
			}
			for _, fact := range analysis.facts {
				if fact.summary.Name == "selectMember" && (fact.staged.operationDeliveries != 2 || !fact.staged.settled) {
					t.Fatal("merged delivery changed retained source graph")
				}
			}
			return
		}
	}
	t.Fatal("missing source analysis for independent graph")
}

// Native issuer/disposition negatives use the real source-produced recipe. They
// protect graph ownership and empty-vs-unimplemented boundaries, independently
// of the ordinary Session journey above.
func TestStagedOperationSourceProtocol(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-member-protocol.ts", Source: stagedMemberWitness(t), Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("protocol source: %s %#v", response.Error, response.Diagnostics)
	}
	facts := stagedDeclarationFacts(session)
	for index, fact := range facts {
		if fact.summary.Name != "selectMember" {
			continue
		}
		if len(fact.staged.operationUses) != 1 {
			t.Fatal("missing natural source producer")
		}
		plan := fact.staged.operationUses[0]
		work := callableEffectWork{extracting: -1}
		id, ok := work.requireOperation(facts, plan.request)
		if !ok {
			t.Fatal("source requirement refused")
		}
		if !facts[index].staged.operationsPending || len(stagedPublicationPending(facts)) == 0 {
			t.Fatal("required membership was not enforced before yielding")
		}
		wrong := plan.request
		wrong.cut.reading = plan.call
		if _, ok := work.requireOperation(facts, wrong); ok {
			t.Fatal("different cut borrowed membership")
		}
		wrong = plan.request
		wrong.producer.kind = relativeDemandExactProof
		if _, ok := work.requireOperation(facts, wrong); ok {
			t.Fatal("effect producer admitted exact-proof authority")
		}
		if work.publishOperation(id, sourceStagedOperationDelta{extracted: true}) {
			t.Fatal("absent alternatives became covered empty")
		}
		unsupported := sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{plan.request}}
		for _, recipe := range fact.staged.operationRecipes {
			if recipe.key == plan.request.producer {
				unsupported.exposures = recipe.delta.exposures
			}
		}
		if work.publishOperation(id, unsupported) {
			t.Fatal("unimplemented dependency was silently accepted")
		}
		work.extractOperation(facts, callableExtractionTask{callable: index, operation: id})
		delivery, ok := work.consumeOperation(id, plan.request)
		if !ok || len(delivery.delta.exposures) != 2 || !delivery.delta.extracted {
			t.Fatal("source prefix not delivered")
		}
		again, ok := work.consumeOperation(id, plan.request)
		if !ok || len(again.delta.exposures) != 0 || again.revision != delivery.revision {
			t.Fatal("unchanged revision redelivered old atoms")
		}
		independent := callableEffectWork{extracting: -1}
		if _, ok := independent.requireOperation(facts, plan.request); !ok {
			t.Fatal("independent graph rejected source recipe")
		}
		if independent.publishOperation(id, delivery.delta) {
			t.Fatal("other graph accepted an expired producer ID")
		}
		if _, ok := independent.consumeOperation(id, plan.request); ok {
			t.Fatal("other graph borrowed a delivery cursor")
		}
		return
	}
	t.Fatal("missing source fact")
}
