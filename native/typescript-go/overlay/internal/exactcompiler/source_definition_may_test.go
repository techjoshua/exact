package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// This is a new small qualification, not a replacement or reduction of the
// original depth28 fixture. Its counters precede that unchanged expensive gate.
func TestDefinitionMAYSharedDependencyGrowth(t *testing.T) {
	for _, leaf := range []struct{ source, placement string }{
		{"window.innerWidth", "client"},
		// This virtual project has no Node declarations. Supply cwd's public
		// return type so this control measures checked primitive addition.
		{"process.cwd() as string", "server"},
		{"typeof window==='undefined'?1:window.innerWidth", "isomorphic"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			previousWork := 0
			for _, depth := range []int{4, 8} {
				t.Logf("qualification start: %s %s depth%d", target, leaf.placement, depth)
				source := "function h0(){return " + leaf.source + ";}"
				for level := 1; level <= depth; level++ {
					source += fmt.Sprintf("function h%d(){return h%d()+h%d();}", level, level-1, level-1)
				}
				source += fmt.Sprintf("export const width=h%d;export const stable=1;export function Page(){return ()=>h%d()}", depth, depth)
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/definition-may-growth.ts", Target: target, Source: source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("%s depth%d qualification: %s %#v", target, depth, response.Error, response.Diagnostics)
				}
				if !strings.Contains(response.Code, "width =") || !strings.Contains(response.Code, "stable = 1") {
					t.Fatal("lost reference export or independent known export")
				}
				head := executableSummary(t, response, fmt.Sprintf("h%d", depth))
				effect, targets := "neutral", []string{"client", "server"}
				if leaf.placement == "client" {
					effect, targets = "browser", []string{"client"}
				}
				if leaf.placement == "server" {
					effect, targets = "server", []string{"server"}
				}
				if head.Effect != effect || !slices.Equal(head.ArtifactTargets, targets) {
					t.Fatalf("lost non-neutral or guarded MAY effect: %#v", head)
				}
				work := definitionMAYGraphWork(t, session, depth)
				if previousWork > 0 && work > 4*previousWork {
					t.Fatalf("definition work grew beyond this qualification: depth4=%d depth8=%d", previousWork, work)
				}
				t.Logf("%s %s depth%d: definitions%d edges%d queryWork%d", target, leaf.placement, depth, depth, 2*depth, work)
				previousWork = work
			}
		}
	}
}

func TestDefinitionMAYDoesNotShareChangedCaptures(t *testing.T) {
	t.Run("distinct-arguments", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return {get value(){return input.value}}}const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`, "client")
	})
	t.Run("changed-module", func(t *testing.T) {
		assertClosurePlacement(t, `const box={value:'safe'};function read(){return box.value}export const first=read();box.value=document.title;export const value=read();`, "client")
	})
}

func TestDefinitionMAYActualOccurrences(t *testing.T) {
	const source = `let reads=0;let selected=3;const receiver={get value(){reads++;return selected;}};function read(){return receiver.value;}function make(){return {value:read()};}const first=make();selected=7;const second=make();export const observation=[reads,first.value,second.value,first===second];`
	for _, control := range []struct{ name, source, expected string }{
		{"objects-and-getter", source, "[2,3,7,false]"},
		{"captured-return", `let selected=3;function read(){return selected;}function twice(){return read()+read();}const first=twice();selected=7;const second=twice();export const observation=[first,second];`, "[6,14]"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(control.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/definition-actual-occurrences.ts", Source: control.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
				}
				module := filepath.Join(t.TempDir(), "actual.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				t.Cleanup(cancel)
				const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(m.observation,JSON.parse(process.argv[2]));`
				if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, control.expected).CombinedOutput(); err != nil {
					t.Fatalf("runtime: %v %s", err, output)
				}
			})
		}
	}
}

// This checks conservative bounded progress separately. It cannot waive the
// original non-neutral/guarded placement assertions in the preceding test.
func TestDefinitionMAYUnknownCoercionRemainsOpaque(t *testing.T) {
	previous := 0
	for _, depth := range []int{4, 8} {
		source := "function h0(){return process.cwd();}"
		for level := 1; level <= depth; level++ {
			source += fmt.Sprintf("function h%d(){return h%d()+h%d();}", level, level-1, level-1)
		}
		source += fmt.Sprintf("export const width=h%d;export const stable=1;", depth)
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/definition-may-unknown.ts", Target: TargetClient, Source: source})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("qualification: %s %#v", response.Error, response.Diagnostics)
		}
		head := executableSummary(t, response, fmt.Sprintf("h%d", depth))
		known, unknown := false, false
		for _, effect := range head.EffectSources {
			known = known || effect.Environment == "server"
			unknown = unknown || effect.Environment == "unknown" && effect.Opaque
		}
		if !known || !unknown {
			t.Fatalf("lost known callee effect or unknown coercion obligation: %#v", head)
		}
		work := definitionMAYGraphWork(t, session, depth)
		if previous > 0 && work > 4*previous {
			t.Fatalf("unbounded or missing graph work: depth%d edges%d work%d prior%d", depth, 2*depth, work, previous)
		}
		t.Logf("unknown return depth%d: edges%d queryWork%d knownServer+opaque conserved", depth, 2*depth, work)
		previous = work
	}
}

// definitionMAYGraphWork checks the exact shared-source graph. It cannot renew
// disposed invocation authority and never interprets an absent receipt as success.
func definitionMAYGraphWork(t *testing.T, session *Session, depth int) int {
	t.Helper()
	work, definitions, edges := 0, 0, 0
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		work += project.callableCache.owner.values.work
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				if fact.summary.Name == "h0" || !strings.HasPrefix(fact.summary.Name, "h") {
					continue
				}
				definitions++
				if len(fact.normalCalls) != 0 || len(fact.nativeCalls) != 0 {
					t.Fatal("MAY graph materialized occurrence receipts")
				}
				seen := make(map[string]bool)
				for _, edge := range fact.summary.Calls {
					if seen[edge.ID] || !edge.Resolved || edge.TargetID == "" {
						t.Fatalf("duplicate or unresolved graph edge in %s: %#v", fact.summary.Name, edge)
					}
					seen[edge.ID] = true
					edges++
				}
			}
		}
	}
	if definitions != depth || edges != 2*depth || work <= 0 {
		t.Fatalf("missing graph work: depth%d definitions%d edges%d work%d", depth, definitions, edges, work)
	}
	return work
}

// This conserves known effects and graph structure at the original depth. The
// strict Effect==server assertion remains independently required above.
func TestDefinitionMAYDepth28GraphConservation(t *testing.T) {
	for _, leaf := range []struct{ source, effect string }{
		{"window.innerWidth", "browser"},
		{"process.cwd()", "server"},
		{"typeof window==='undefined'?1:window.innerWidth", "neutral"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := "function h0(){return " + leaf.source + ";}"
			for depth := 1; depth <= 28; depth++ {
				source += fmt.Sprintf("function h%d(){return h%d()+h%d();}", depth, depth-1, depth-1)
			}
			source += "export const width=h28;export const stable=1;"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/dependency-diamond.ts", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			head := executableSummary(t, response, "h28")
			known := leaf.effect == "neutral" && head.Effect == "neutral"
			for _, effect := range head.EffectSources {
				known = known || effect.Environment == leaf.effect
			}
			if !known {
				t.Fatalf("lost known/guarded leaf effect: %#v", head)
			}
			work := definitionMAYGraphWork(t, session, 28)
			t.Logf("%s leaf%s depth28 definitions28 edges56 work%d combinedEffect%s targets%v", target, leaf.effect, work, head.Effect, head.ArtifactTargets)
		}
	}
}
