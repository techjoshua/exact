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
		function helper(this: Component<{ count: number }>, PARAMETERS) {
			return existsSync(".") ? this.state.count : 0;
		}
		export function Panel(this: Component<{ count: number }>) {
			this.state.count = 1;
			const invoke = HELPER_BIND;
			BOUND_CHANGE
			const run = (_task: TaskContext = TaskContext.server()) => {
				TASK_READ
				this.state.count = invoke();
			};
			return () => <button onClick={() => run()}>OUTPUT</button>;
		}
		export function label(invoke: string) { return invoke; }
		export function labelLength(invoke: string) { return invoke.length; }
	`
	for _, tc := range []struct {
		name, bind, output      string
		parameters, boundChange string
		taskRead, clientArity   string
		projected               bool
	}{
		{name: "task only", projected: true},
		{name: "first default", output: "{invoke.length}", parameters: "prefix = 0, later?: number", clientArity: "0", projected: true},
		{name: "optional counts before default", output: "{invoke.length}", parameters: "optional?: number, prefix = 0, ...rest: number[]", clientArity: "1", projected: true},
		{name: "rest stops the count", output: "{invoke.length}", parameters: "optional?: number, ...rest: number[]", clientArity: "1", projected: true},
		{name: "task reads length", output: "{invoke.length}", taskRead: "this.state.count += invoke.length;"},
		{name: "target descriptor", output: "{invoke.length}", taskRead: `Object.defineProperty(helper, "length", { value: 3 });`},
		{name: "bound descriptor", output: "{invoke.length}", boundChange: `Object.defineProperty(invoke, "length", { value: 4 });`},
		{name: "delete length", output: "{invoke.length}", boundChange: "delete (invoke as { length?: number }).length;"},
		{name: "effectful prefix", bind: "helper.bind(this, recordPrefix())"},
		{name: "authored method", bind: "({ bind(owner: Component<{ count: number }>) { owner.state.count++; return () => helper.call(owner); } }).bind(this)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			bind, parameters, output := tc.bind, tc.parameters, tc.output
			if bind == "" {
				bind = "helper.bind(this)"
			}
			if parameters == "" {
				parameters = "prefix = 0"
			}
			if output == "" {
				output = "Go"
			}
			input := strings.NewReplacer(
				"HELPER_BIND", bind, "PARAMETERS", parameters, "OUTPUT", output,
				"BOUND_CHANGE", tc.boundChange, "TASK_READ", tc.taskRead,
			).Replace(source)
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{ID: "component.tsx", Kind: "compile", Target: target, Source: input})
				if response.Error != "" || response.Code == "" {
					t.Fatalf("%s emission failed: %s %#v", target, response.Error, response.Diagnostics)
				}
				if target == TargetClient {
					if strings.Contains(response.Code, "const invoke =") == tc.projected ||
						!strings.Contains(response.Code, "return invoke;") ||
						!strings.Contains(response.Code, "return invoke.length;") ||
						tc.clientArity != "" && !strings.Contains(response.Code, "const invoke: number = "+tc.clientArity+";") ||
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
