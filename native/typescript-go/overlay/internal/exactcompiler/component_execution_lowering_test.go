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
		`"state",`,
		`"output"`,
		"definition:",
		`render: "returned-function"`,
		`"tasks"`,
		`"continuations"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiled output is missing %q:\n%s", expected, response.Code)
		}
	}
	// Isomorphic private children carry resumption metadata for SSR publication;
	// the server-only Parent artifact itself does not.
}

func TestTaskFreeExportCarriesCanonicalDefinitionWithoutTaskCapability(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "static.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function StaticPanel() { return () => <p>ready</p>; }`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{"definition:", "state: []", "tasks: []", "capabilities: []"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("task-free definition is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/core/runtime/tasks"`) {
		t.Fatalf("task-free component imported the task runtime:\n%s", response.Code)
	}
}

func TestHydrateProjectionUsesLightweightSynchronousComponentComputations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "hydrate-computation.tsx", Kind: "compile", Target: TargetClient,
		ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `
			declare class Component<State> { state: State }
			export function Greeting(this: Component<{ message: string }>, props: { name: string }) {
				this.state.message = "Hello " + props.name;
				return () => <p>{this.state.message}</p>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "activateComputationForHost as __exactActivateComputation") ||
		!strings.Contains(response.Code, "__exactActivateComputation(this") {
		t.Fatalf("hydrate projection did not select the synchronous computation lane:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `label: "__exactComponentComputation_`) {
		t.Fatalf("hydrate projection wrapped a synchronous computation in a task definition:\n%s", response.Code)
	}
}

func TestComponentContractProjectionRetainsOnlyModeRuntimeMetadata(t *testing.T) {
	source := `
		import { TaskContext } from "@exactjs/core";
		declare class Component<State> { state: State }
		export function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			function refresh(_task: TaskContext = TaskContext.client().latest()) {
				this.state.count++;
			}
			return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
		}
	`
	hydrate := NewSession().Execute(Request{
		ID: "hydrate.tsx", Kind: "compile", Target: TargetClient, Source: source,
		ComponentContractProjection: ComponentContractProjectionHydrate,
	})
	if hydrate.Error != "" || len(hydrate.Diagnostics) != 0 {
		t.Fatalf("hydrate projection failed: %s %#v", hydrate.Error, hydrate.Diagnostics)
	}
	for _, expected := range []string{
		"definition:", "instantiate:", "capabilities:", "state:", "resumption:",
	} {
		if !strings.Contains(hydrate.Code, expected) {
			t.Fatalf("hydrate projection is missing %q:\n%s", expected, hydrate.Code)
		}
	}
	for _, omitted := range []string{"tasks: [", "reactive: [", `render: "returned-function"`} {
		if strings.Contains(hydrate.Code, omitted) {
			t.Fatalf("hydrate projection retained build-only metadata %q:\n%s", omitted, hydrate.Code)
		}
	}
	if !strings.Contains(hydrate.Code, "continuations: []") ||
		!strings.Contains(hydrate.Code, "boundaries: []") {
		t.Fatalf("hydrate projection retained composition-only catalogs:\n%s", hydrate.Code)
	}
	if strings.Contains(hydrate.Code, "execution:") ||
		strings.Contains(hydrate.Code, "componentExecutionValueForHost") {
		t.Fatalf("hydrate projection retained server-operation execution metadata:\n%s", hydrate.Code)
	}

	client := NewSession().Execute(Request{
		ID: "client.tsx", Kind: "compile", Target: TargetClient, Source: source,
		ComponentContractProjection: ComponentContractProjectionClient,
	})
	if client.Error != "" || len(client.Diagnostics) != 0 {
		t.Fatalf("client projection failed: %s %#v", client.Error, client.Diagnostics)
	}
	if strings.Contains(client.Code, "resumption:") {
		t.Fatalf("client-only projection retained hydration resumption metadata:\n%s", client.Code)
	}
}

func TestComponentExecutionPropagatesAggregateOutputSourcesThroughChildProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "projection.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Child(props: { value: { name: string; accent: string } }) {
				return () => <strong>{props.value.name}</strong>;
			}
			export function Parent(this: Component<{ name: string; accent: string }>) {
				async function load(_task: TaskContext = TaskContext.server()) {
					this.state.name = await Promise.resolve("Northwind");
					this.state.accent = "blue";
				}
				load();
				return () => <Child value={{ name: this.state.name, accent: this.state.accent }} />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		"componentExecutionValueForHost as __exactComponentOutput",
		`__exactComponentOutput(this, ["name", "accent"], __exactExpression(() => ({`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiled aggregate output is missing %q:\n%s", expected, response.Code)
		}
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
			export function Wrapper(props: { value: string; open: boolean }) {
				return () => <section aria-expanded={props.open}><Child value={props.value} /></section>;
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
	if !strings.Contains(response.Code, "__exactExpression(() => props.open)") {
		t.Fatalf("host attribute incorrectly retained replaceable forwarded identity:\n%s", response.Code)
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

func TestClientLatestTasksUseCompilerSelectedCompactLane(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "compact-latest.tsx", Kind: "compile", Target: TargetClient,
		ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Queue(this: Component<{ value: string }>) {
				async function load(task: TaskContext = TaskContext.client().latest()) {
					this.state.value = await fetchValue(task.signal);
				}
				const refresh = () => void load();
				load();
				return () => <button onClick={refresh}>{this.state.value}</button>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		"bindCompiledClientLatestTaskForHost as __exactBindClientLatestTask",
		"activateCompiledClientLatestTaskForHost as __exactActivateClientLatestTask",
		`const load = __exactBindClientLatestTask(this, "load", async`,
		`__exactActivateClientLatestTask(this, "load", async`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compact client/latest output is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, universal := range []string{"defineTask as", "bindTaskForHost as", "activateTaskForHost as"} {
		if strings.Contains(response.Code, universal) {
			t.Fatalf("compact client/latest output retained %q:\n%s", universal, response.Code)
		}
	}
}

func TestClientLatestTaskFallsBackForUniversalPolicies(t *testing.T) {
	for name, policy := range map[string]string{
		"blocking":   "TaskContext.client().latest().blocking()",
		"optimistic": "TaskContext.client().latest()",
	} {
		t.Run(name, func(t *testing.T) {
			optimistic := ""
			if name == "optimistic" {
				optimistic = `task.optimistic(() => { this.state.value = "pending"; });`
			}
			response := NewSession().Execute(Request{
				ID: "universal-" + name + ".tsx", Kind: "compile", Target: TargetClient,
				Source: `
					import { TaskContext } from "@exactjs/core";
					declare class Component<State> { state: State }
					export function Queue(this: Component<{ value: string }>) {
						async function load(task: TaskContext = ` + policy + `) {
							` + optimistic + `
							this.state.value = await fetchValue(task.signal);
						}
						return () => <button onClick={() => void load()} />;
					}
				`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if !strings.Contains(response.Code, "defineTask as __exactDefineTask") ||
				strings.Contains(response.Code, "bindCompiledClientLatestTaskForHost") {
				t.Fatalf("%s task did not retain the universal task lane:\n%s", name, response.Code)
			}
		})
	}
}

func TestClientLatestTaskFallsBackWhenCallableIdentityEscapes(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "observable-latest.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			import { TaskContext, taskStatus } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Queue(this: Component<{ value: string }>) {
				async function load(task: TaskContext = TaskContext.client().latest()) {
					this.state.value = await fetchValue(task.signal);
				}
				const status = taskStatus(load);
				return () => <button onClick={() => void load()}>{status.pending}</button>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "defineTask as __exactDefineTask") ||
		strings.Contains(response.Code, "bindCompiledClientLatestTaskForHost") {
		t.Fatalf("observable task identity did not retain the universal task lane:\n%s", response.Code)
	}
}
