package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// A five-node recursive graph can keep permuting the same context set. The old ordered
// convergence check fails even though membership has stabilized, while state effects converge.
func TestRecursiveContextSetsConverge(t *testing.T) {
	edges := [][]int{{1, 3, 4}, {4}, {}, {0}, {0, 2, 3}}
	for _, kind := range []string{"read", "probe", "write"} {
		facts := make([]callableFacts, len(edges))
		for index, targets := range edges {
			facts[index] = callableFacts{
				summary: CallableSummary{ID: fmt.Sprint(index), Name: fmt.Sprint(index)},
				targets: targets, directContext: []ContextEffect{{Token: fmt.Sprint(index), Kind: kind, Confidence: "exact"}},
			}
		}
		before := append([]callableFacts(nil), facts...)
		if legacyResolveCallableEffects(before, contextEffectsSignature) {
			t.Fatal("fixture no longer reproduces ordered context oscillation")
		}
		resolveCallableEffects(facts)
		for _, index := range []int{0, 1, 3, 4} {
			if len(facts[index].summary.Contexts) != 5 {
				t.Fatalf("%s graph lost reachable contexts", kind)
			}
		}
		if len(facts[2].summary.Contexts) != 1 {
			t.Fatal("isolated callee inherited caller capabilities")
		}
	}
}

// Shared native analysis must terminate and produce semantically valid artifacts for all
// targets. Probe and write variants exercise the same convergence mechanism independently.
func TestRecursiveContextSourceCompilation(t *testing.T) {
	for _, method := range []string{"getContext", "hasContext", "setContext"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			source := `import {createContext,type Component} from '@exactjs/core';`
			for index := 0; index < 5; index++ {
				source += fmt.Sprintf(`const Token%d=createContext<number>('token%d');`, index, index)
			}
			source += `export function Page(this:Component<{}>){`
			for index, targets := range [][]int{{1, 3, 4}, {4}, {}, {0}, {0, 2, 3}} {
				argument := fmt.Sprintf("Token%d", index)
				if method == "setContext" {
					argument += ",1"
				}
				source += fmt.Sprintf("const helper%d=()=>{this.%s(%s);", index, method, argument)
				for _, callee := range targets {
					source += fmt.Sprintf("helper%d();", callee)
				}
				source += "};"
			}
			source += `return()=> <p>ready</p>;}`
			response := NewSession().Execute(Request{ID: "context-cycle.tsx", Kind: "compile", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || len(response.Diagnostics) != 0 || !strings.Contains(response.Code, "ready") {
				t.Fatalf("%s %s compilation failed: %s %#v", method, target, response.Error, response.Diagnostics)
			}
			for _, callable := range response.Analysis.Callables {
				if callable.Name == "helper0" && len(callable.Contexts) != 5 {
					t.Fatal("source graph lost recursive context capabilities")
				}
			}
		}
	}
}
