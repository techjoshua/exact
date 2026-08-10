package exactcompiler

import (
	"strings"
	"testing"
)

func TestComponentExecutionPropagatesOutputSourcesThroughChildProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "pipeline.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Child(props: { value: string }) {
				return () => <strong>{props.value}</strong>;
			}
			export function Parent(this: Component<{ result: string }>) {
				this.state.result = "waiting";
				async function load(_task: TaskContext = TaskContext.server().latest()) {
					this.state.result = await Promise.resolve("ready");
				}
				load();
				return () => <Child value={this.state.result} />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		"componentExecutionValueForHost as __exactComponentOutput",
		`__exactComponentOutput(this, "result", __exactExpression(() => this.state.result))`,
		"execution:",
		`direction: "output"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiled output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "resumption:") {
		t.Fatalf("server-only execution contract must not publish client resumption metadata:\n%s", response.Code)
	}
}

func TestComponentExecutionProjectsOppositeTargetTransitions(t *testing.T) {
	execution := ComponentExecution{
		Version: 1,
		Ports: []ComponentPort{
			{Index: 0, Kind: "state", Path: "server", Direction: "inout"},
			{Index: 1, Kind: "state", Path: "client", Direction: "inout"},
		},
		Transitions: []ComponentTransition{
			{ID: "server", Placement: "server", Inputs: []int{0}, Outputs: []int{0}},
			{ID: "client", Placement: "client", Inputs: []int{1}, Outputs: []int{1}},
		},
	}
	client := projectComponentExecution(execution, TargetClient)
	if len(client.Transitions) != 1 || client.Transitions[0].ID != "client" ||
		len(client.Ports) != 1 || client.Ports[0].Index != 0 || client.Ports[0].Path != "client" {
		t.Fatalf("unexpected client projection: %#v", client)
	}
	server := projectComponentExecution(execution, TargetServer)
	if len(server.Transitions) != 1 || server.Transitions[0].ID != "server" ||
		len(server.Ports) != 1 || server.Ports[0].Path != "server" {
		t.Fatalf("unexpected server projection: %#v", server)
	}
}

func TestComponentExecutionForwardsReactivePropIdentity(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "forward.tsx",
		Kind: "compile",
		Source: `
			declare function Child(props: { value: string }): unknown;
			export function Wrapper(props: { value: string }) {
				return () => <Child value={props.value} />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "createForwardedExpression as __exactForwardedExpression") ||
		!strings.Contains(response.Code, "__exactForwardedExpression(() => props.value)") {
		t.Fatalf("prop forwarding allocated a redundant reactive value:\n%s", response.Code)
	}
}

func TestComponentExecutorPreservesAuthoredStateContextualTypes(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "typed-executor.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { readFile } from "node:fs/promises";
			declare class Component<State> { state: State }
			export function Page(this: Component<{ items: string[]; result: string }>) {
				const load = async (_task: TaskContext = TaskContext.server()) => {
					this.state.result = (await Promise.all(
						this.state.items.map(async (item) => (await readFile(item, "utf8")).trim())
					)).join(",");
				};
				load();
				return () => <output>{this.state.result}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{"} as {", "state: {", "items: string[]"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("server executor lost authored state typing %q:\n%s", expected, response.Code)
		}
	}
}
