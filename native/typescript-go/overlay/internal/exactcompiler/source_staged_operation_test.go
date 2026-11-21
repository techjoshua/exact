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

// A component task executes the helper and publishes its result to rendered state.
const memberOperationTask = `
import { TaskContext, type Component } from "@exactjs/core";
declare function unbound(): string;
export function Page(this: Component<{label: string}>, props: {flag: boolean}) {
	this.state.label = "initial";
	const updateLabel = (task: TaskContext = TaskContext.client()) => {
		this.state.label = MEMBER;
	};
	return () => <button onClick={() => updateLabel()}>{this.state.label}</button>;
}
`

func memberOperationTaskEffects(t *testing.T, declaration, expression, packageType string, target Target) []EnvironmentEffectSource {
	t.Helper()
	response := NewSession().Execute(Request{
		Kind: "compile", ID: "/virtual/component-member.tsx", Target: target, PackageType: packageType,
		Source: declaration + strings.Replace(memberOperationTask, "MEMBER", expression, 1),
	})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatalf("member component %s/%s: %s %#v", packageType, target, response.Error, response.Diagnostics)
	}
	return executableSummary(t, response, "updateLabel").EffectSources
}

func TestStagedOperationSelectMember(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		var application []byte
		for _, packageType := range []string{"application", "library"} {
			effects := memberOperationTaskEffects(t, stagedMemberWitness(t), "selectMember(props.flag, unbound)", packageType, target)
			assertMemberOperationEffects(t, effects, true, false, true)
			// Compare public EffectSources fields. Private source identities
			// legitimately differ between native sessions.
			public, err := json.Marshal(effects)
			if err != nil {
				t.Fatal(err)
			}
			if application != nil && !bytes.Equal(application, public) {
				t.Fatalf("package mode changed task effects: before=%s after=%s", application, public)
			}
			application = public
		}
	}
}

func TestStagedOperationDormantSibling(t *testing.T) {
	const source = `function select(flag:boolean,foreign:()=>string){const table={run:flag?()=>document.title:foreign,unused:()=>window.name};return table.run();}`
	for _, target := range []Target{TargetClient, TargetServer} {
		effects := memberOperationTaskEffects(t, source, "select(props.flag, unbound)", "application", target)
		assertMemberOperationEffects(t, effects, true, false, true)
	}
}

func assertMemberOperationEffects(t *testing.T, effects []EnvironmentEffectSource, document, window, unknown bool) {
	t.Helper()
	hasDocument, hasWindow, hasUnknown := false, false, false
	for _, effect := range effects {
		hasDocument = hasDocument || effect.Environment == "browser" && effect.Description == "document"
		hasWindow = hasWindow || effect.Environment == "browser" && effect.Description == "window"
		hasUnknown = hasUnknown || effect.Environment == "unknown"
	}
	if hasDocument != document || hasWindow != window || hasUnknown != unknown {
		t.Fatalf("task browser document/window and unknown, want %t/%t/%t: %#v", document, window, unknown, effects)
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
	for _, control := range []struct {
		name, source, call        string
		document, window, unknown bool
	}{
		{"captured-input", `export function read(callback:()=>string){const table={run:()=>{document.title;return callback()}};return table.run();}`, "read(unbound)", true, false, true},
		{"getter", `export function read(){const table={get run(){window.name;return ()=>document.title}};return table.run();}`, "read()", true, true, false},
		{"write", `export function read(){const table={run:()=>''};table.run=()=>document.title;return table.run();}`, "read()", true, false, false},
		{"rest", `export function read(...callbacks:(()=>string)[]){const table={run:callbacks[0]};return table.run();}`, "read(unbound)", false, false, true},
		{"new-target", `export function read(){const table={run:()=>new.target?document.title:''};return table.run();}`, "", false, false, false},
	} {
		t.Run(control.name, func(t *testing.T) {
			facts := stagedDeltaFacts(t, control.source)
			read := facts[stagedDeltaFact(t, facts, "read")]
			if len(read.staged.operationUses) != 0 {
				t.Fatal("unsupported member capability acquired staged coverage")
			}
			if control.call != "" {
				for _, target := range []Target{TargetClient, TargetServer} {
					effects := memberOperationTaskEffects(t, control.source, control.call, "application", target)
					assertMemberOperationEffects(t, effects, control.document, control.window, control.unknown)
				}
			}
		})
	}
}

func TestStagedOperationReceiverActualRetainsOwner(t *testing.T) {
	source := stagedMemberWitness(t) + `function observe(this:{run?:unknown}){return this.run?window.name:window.name;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		effects := memberOperationTaskEffects(t, source, "selectMember(props.flag, observe)", "application", target)
		browser := false
		for _, effect := range effects {
			browser = browser || effect.Environment == "browser" && effect.Description == "window"
		}
		if !browser {
			t.Fatalf("receiver-dependent actual lost its browser effect: %#v", effects)
		}
	}
}

func TestStagedOperationMergedCloneRebuild(t *testing.T) {
	withOriginalSetEffectsCollector(t, stagedMemberWitness(t), func(owner *executableBodyOwner, source *ast.SourceFile, originals []callableFacts, _ *callableEffectWork) {
		analysis := callableAnalysisFromFacts(source, originals, nil)
		cloned := analysis
		cloned.facts = make([]callableFacts, len(analysis.facts))
		for index, fact := range analysis.facts {
			cloned.facts[index] = cloneProjectCallableFact(fact)
		}
		if blocked := callableAnalysisFromFacts(source, cloned.facts, nil); len(blocked.pending) == 0 || len(blocked.summaries) != 0 {
			t.Fatal("clone inherited member publication rights")
		}
		merged := mergeProjectCallableEffects(source, []callableAnalysis{cloned}, owner)
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
	})
}

// Native issuer/disposition negatives use the real source-produced recipe. They
// protect graph ownership and empty-vs-unimplemented boundaries, independently
// of the ordinary Session journey above.
func TestStagedOperationSourceProtocol(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedMemberWitness(t))
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
