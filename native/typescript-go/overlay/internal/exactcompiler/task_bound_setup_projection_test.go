package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionProjectsStoredServerTaskBind(t *testing.T) {
	const source = `
		import { TaskContext } from "@exactjs/core";
		import { existsSync } from "node:fs";
		declare class Component<State> { state: State }
		function recordPrefix() { console.log("prefix"); return 1; }
		function helper(this: Component<{ count: number }>, prefix = 0) {
			return existsSync(".") ? this.state.count + prefix : 0;
		}
		export function Panel(this: Component<{ count: number }>) {
			this.state.count = 1;
			const invoke = HELPER_BIND;
			const run = (_task: TaskContext = TaskContext.server()) => {
				this.state.count = invoke();
			};
			return () => <button onClick={() => run()}>OUTPUT</button>;
		}
		export function label(invoke: string) { return invoke; }
	`
	for _, tc := range []struct {
		name, bind, output string
		projected          bool
	}{
		{"task only", "helper.bind(this)", "Go", true},
		{"runtime consumer", "helper.bind(this)", "{invoke.length}", false},
		{"effectful prefix", "helper.bind(this, recordPrefix())", "Go", false},
		{"authored method", "({ bind(owner: Component<{ count: number }>) { owner.state.count++; return () => helper.call(owner); } }).bind(this)", "Go", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := strings.ReplaceAll(strings.ReplaceAll(source, "HELPER_BIND", tc.bind), "OUTPUT", tc.output)
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{ID: "component.tsx", Kind: "compile", Target: target, Source: input})
				if response.Error != "" || response.Code == "" {
					t.Fatalf("%s emission failed: %s %#v", target, response.Error, response.Diagnostics)
				}
				if target == TargetClient {
					if strings.Contains(response.Code, "const invoke =") == tc.projected ||
						!strings.Contains(response.Code, "return invoke;") ||
						tc.projected && strings.Contains(response.Code, "node:fs") {
						t.Fatalf("unexpected client setup projection:\n%s", response.Code)
					}
					continue
				}
				if strings.Contains(response.Code, "const invoke = helper.bind(__exactComponent_") != tc.projected {
					t.Fatalf("unexpected server executor dependency:\n%s", response.Code)
				}
			}
		})
	}
}
