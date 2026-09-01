package exactcompiler

import (
	"os"
	"path/filepath"
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
		"serverComponentExecutionValueForHost as __exactServerComponentOutput",
		`__exactServerComponentOutput(this, "result", () => this.state.result)`,
		"activateServerComponentTaskForHost as __exactActivateServerTask",
		"execution:",
		`classification: "scheduled"`,
		`lane: "direct"`,
		`"state",`,
		"artifact:",
		`render: "returned-function"`,
		`"tasks"`,
		`"continuations"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiled output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `@exactjs/ssr/runtime/generic-components`) {
		t.Fatalf("scheduled output propagation retained the generic component renderer:\n%s", response.Code)
	}
	// Isomorphic private children carry resumption metadata for SSR publication;
	// the server-only Parent artifact itself does not.
}

func TestTaskFreeExportCarriesCanonicalArtifactWithoutTaskCapability(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "static.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function StaticPanel() { return () => <p>ready</p>; }`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{"artifact:", `target: "client"`, "state: []", "tasks: []", "capabilities: []"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("task-free artifact is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/core/runtime/tasks"`) {
		t.Fatalf("task-free component imported the task runtime:\n%s", response.Code)
	}
}

func TestSynchronousServerArtifactExecutesClosedProgramWithoutReturnedClosure(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "direct-server-executor.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			type Child = unknown;
			export function Direct(props: { label: string }): () => Child {
				return () => <p>{props.label}</p>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	compact := strings.Join(strings.Fields(response.Code), " ")
	for _, expected := range []string{
		`return __exactPreparedServerRenderProgram(`,
		`classification: "synchronous"`,
		`mode: "direct"`,
	} {
		if !strings.Contains(compact, expected) {
			t.Fatalf("direct server executor omitted %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(compact, `return () => __exactPreparedServerRenderProgram(`) {
		t.Fatalf("direct server executor retained the returned render closure:\n%s", response.Code)
	}
}

func TestSynchronousServerArtifactRetainsCallableForForwardedOutput(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "forwarded-server-output.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			type Child = unknown;
			export function Forward(props: { child: Child }): () => Child {
				return () => props.child;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	compact := strings.Join(strings.Fields(response.Code), " ")
	if !strings.Contains(compact, `return () => __exactDynamic(() => props.child)`) {
		t.Fatalf("forwarded server output lost its callable fallback:\n%s", response.Code)
	}
	if strings.Contains(compact, `mode: "direct"`) {
		t.Fatalf("forwarded server output incorrectly selected the closed executor:\n%s", response.Code)
	}
}

func TestClientComponentReadsCompilerIndexedStateSlots(t *testing.T) {
	source := `
		declare class Component<State> { state: State }
		export function Counter(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () => <output>{this.state.count}</output>;
		}
	`
	client := NewSession().Execute(Request{
		ID: "indexed-state-client.tsx", Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" || len(client.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", client.Error, client.Diagnostics)
	}
	for _, expected := range []string{
		"writeIndexedReactiveValue as __exactWriteState",
		"__exactWriteState(this.state, 0, 0)",
		"[[0, 0, [0, 0], true]",
		"__exactApplyProgramText(__exactTarget0, 0, 0, 0)",
		"__exactPreparedRenderProgram(__exact_render_program_1, [], this)",
		`state: [`,
		`"count"`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf("indexed client output is missing %q:\n%s", expected, client.Code)
		}
	}

	server := NewSession().Execute(Request{
		ID: "indexed-state-server.tsx", Kind: "compile", Target: TargetServer, Source: source,
	})
	if server.Error != "" || len(server.Diagnostics) != 0 {
		t.Fatalf("server compile failed: %s %#v", server.Error, server.Diagnostics)
	}
	if strings.Contains(server.Code, "readIndexedReactiveSlot") ||
		strings.Contains(server.Code, "__exactReadState") ||
		strings.Contains(server.Code, "writeIndexedReactiveValue") ||
		strings.Contains(server.Code, "__exactWriteState") {
		t.Fatalf("plain request-local server state used the indexed client facade:\n%s", server.Code)
	}
}

func TestClientComponentBindingWritesCompilerIndexedStateSlot(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "indexed-component-binding.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			declare function Dialog(props: { open: boolean; onOpenChanged(value: boolean): void }): unknown;
			export function View(this: Component<{ open: boolean }>) {
				return () => <Dialog open:onOpenChanged={this.state.open} />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(
		response.Code,
		"__exactWriteState(this.state, 0, __exactBindingValue)",
	) {
		t.Fatalf("component binding did not use its compiler-indexed state slot:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `__exactWrite(this.state, ["open"]`) {
		t.Fatalf("component binding retained its generic path write:\n%s", response.Code)
	}
}

func TestClientNestedCallbackWritesThroughIndexedStateFacadeAlias(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "indexed-state-alias.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			export function Counter(this: Component<{ count: number }>) {
				const state = this.state;
				function increment() { state.count += 1; }
				return () => <button onClick={increment}>{this.state.count}</button>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "__exactUpdateState(state, 0, previous => previous + 1)") {
		t.Fatalf("state facade alias did not retain its indexed slot identity:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `__exactUpdate(state, ["count"]`) {
		t.Fatalf("state facade alias retained a generic top-level path update:\n%s", response.Code)
	}
}

func TestHydrateProjectionUsesIndexedSynchronousComponentInputUpdates(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "hydrate-computation.tsx", Kind: "compile", Target: TargetClient,
		ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `
			declare class Component<State> { state: State }
			export function Greeting(this: Component<{ message: string }>, props: { name: string }) {
				this.state.message = "initial";
				this.state.message = "Hello " + props.name;
				return () => <p>{this.state.message}</p>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`const __exact_component_inputs_1 = { bindings: [[0, 1, 0]] as const`,
		`const __exactDependency = __exactReadState(props, 0) as string`,
		`__exactWriteState(__exactInstance.state, 0, "Hello " + __exactDependency)`,
		`__exact_component_inputs_1.apply(this, 1, 0)`,
		`inputs: __exact_component_inputs_1`,
		`constructRenderComponentInstance as __exactConstructRenderComponent`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("hydrate projection omitted indexed component input update %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "activateComputationForHost as") ||
		strings.Contains(response.Code, "__exactActivateComputation(this") ||
		strings.Contains(response.Code, `"tasks"`) ||
		strings.Contains(response.Code, `"continuations"`) {
		t.Fatalf("indexed component input update retained computation/task machinery:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, "__exactWriteState(__exactInstance.state, 0") ||
		strings.Contains(response.Code, `__exactWrite(this.state, ["message"]`) {
		t.Fatalf("indexed component input update did not preserve its indexed write:\n%s", response.Code)
	}
	if strings.Count(response.Code, "const __exact_component_inputs_1") != 1 ||
		strings.Contains(response.Code, `updates: __exact_component_inputs_1`) {
		t.Fatalf("component input and DOM update artifacts collided:\n%s", response.Code)
	}
	initialWrite := strings.Index(response.Code, `__exactWriteState(this.state, 0, "initial")`)
	initialApply := strings.Index(response.Code, `__exact_component_inputs_1.apply(this, 1, 0)`)
	if initialWrite < 0 || initialApply < initialWrite {
		t.Fatalf("initial component input update moved ahead of authored setup order:\n%s", response.Code)
	}
}

func TestHydrateProjectionIndexesNestedInputsAndRetainsAuthoredComputations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "hydrate-nested-computation.tsx", Kind: "compile", Target: TargetClient,
		ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `
			declare class Component<State> { state: State }
			type Input = { name: string };
			declare function formatName(value: string): string;
			export function Greeting(this: Component<{ nested: string; formatted: string }>, props: { input: Input }) {
				this.state.nested = props.input.name;
				this.state.formatted = formatName(props.input.name);
				return () => <p>{this.state.nested} {this.state.formatted}</p>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Count(response.Code, "__exactActivateComputation(this") != 1 ||
		!strings.Contains(response.Code, "activateComputationForHost as __exactActivateComputation") {
		t.Fatalf("authored-call computation lost its executable owner:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `const __exactDependency = (__exactReadState(props, 0) as Input).name`) ||
		!strings.Contains(response.Code, `__exactWriteState(__exactInstance.state, 1, __exactDependency)`) {
		t.Fatalf("exact nested prop projection omitted the indexed input plan:\n%s", response.Code)
	}
}

func TestServerProjectionInlinesCompilerSynchronousComputations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-computation.tsx", Kind: "compile", Target: TargetServer,
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
	for _, omitted := range []string{
		"activateTaskForHost as", "defineTask as", "createDerived as",
		`label: "__exactComponentComputation_`, `"tasks"`,
	} {
		if strings.Contains(response.Code, omitted) {
			t.Fatalf("direct server computation retained %q:\n%s", omitted, response.Code)
		}
	}
	for _, expected := range []string{
		`})(props.name, { signal: void 0 })`,
		`classification: "synchronous"`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct server computation is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestServerDirectFrameEvaluatesSharedDerivedValuesWithoutReactiveOwnership(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-derived.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> { state: State }
			export function Summary(this: Component<{ count: number }>, props: { count: number }) {
				this.state.count = props.count;
				const label = ` + "`Count: ${this.state.count}`" + `;
				return () => <output aria-label={label}>{label}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, omitted := range []string{"createDerived", "label.get()", "componentExecutionValueForHost"} {
		if strings.Contains(response.Code, omitted) {
			t.Fatalf("direct server frame retained %q:\n%s", omitted, response.Code)
		}
	}
	for _, expected := range []string{
		"const label = `Count: ${this.state.count}`",
		`lane: "direct"`,
		`"resumption"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct server frame is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestServerDirectFrameOwnsCompiledKeyedListFallbackWithoutListRuntime(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-list.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> { state: State }
			interface Row {
				/** @exact key */
				id: string;
				label: string;
			}
			export function Rows(
				this: Component<{ filter: string }>,
				props: { rows: Row[] }
			) {
				this.state.filter = "";
				return () => <ul>{props.rows.map((row) => <li>{row.label}</li>)}</ul>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`lane: "direct"`, `abi: 1`, `createPreparedServerRenderProgram as`,
		`createPreparedServerKeyedChild as`, `rejectDirectServerComponentConstruction as`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct list frame is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `@exactjs/core/runtime/lists`) ||
		strings.Contains(response.Code, `createCompiledKeyedChildReceipt`) ||
		strings.Contains(response.Code, `constructDurableComponentInstance`) ||
		strings.Contains(response.Code, "this.map") ||
		strings.Contains(response.Code, "(__exactSlot) =>") {
		t.Fatalf("direct server list retained durable list runtime:\n%s", response.Code)
	}
}

func TestServerScheduledComponentSelectsRequestLocalDirectLane(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-scheduled-direct.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Page(this: Component<{ value: string }>, props: { request: string }) {
				async function load(request: string, _task: TaskContext = TaskContext.server().blocking()) {
					this.state.value = await Promise.resolve(request);
				}
				load(props.request);
				return () => <output>{this.state.value}</output>;
			}
			export function Shell() {
				return () => <main><Page request="first" /><Page request="second" /></main>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`classification: "scheduled"`, `lane: "direct"`,
		`from "@exactjs/core/framework/server-render-structure"`,
		`render: __exactImplementation_Page_1`, `deferredTaskProps: [`, `"request"`,
		`issueServerComponentReceipt as`, `__exactIssueServerComponent(__exactComponentReceipt(Page`,
		`createPreparedServerRenderProgram as`,
		`activateServerComponentTaskForHost as`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("scheduled server component is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, forbidden := range []string{
		`defineTask as`, `bindTaskForHost as`, `activateTaskForHost as`,
		`@exactjs/core/runtime/component-execution`, `@exactjs/ssr/runtime/generic-components`,
		`slices:`, `createServerSlot as`, `markIndependentAsyncSiblings as`,
		`createCompiledVNode as`,
	} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf("scheduled direct server component retained generic runtime %q:\n%s", forbidden, response.Code)
		}
	}
	if count := strings.Count(response.Code, "execution:"); count != 2 {
		t.Fatalf("scheduled direct server artifacts retained a top-level execution catalog: count=%d\n%s", count, response.Code)
	}
}

func TestServerScheduledComponentDefersOnlyTaskExclusiveProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-scheduled-shared-prop.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Page(
				this: Component<{ value: string; initial: string }>,
				props: { request: string; initial: string }
			) {
				this.state.initial = props.initial;
				async function load(value: string, _task: TaskContext = TaskContext.server().blocking()) {
					this.state.value = await Promise.resolve(value);
				}
				load(props.request);
				return () => <output>{this.state.initial}{this.state.value}</output>;
			}
			export function Shell(props: { request: string; initial: string }) {
				return () => <Page request={props.request} initial={props.initial} />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	compact := strings.Join(strings.Fields(response.Code), " ")
	if !strings.Contains(compact, `deferredTaskProps: [ "request" ]`) {
		t.Fatalf("task-exclusive prop was not isolated from direct setup props:\n%s", response.Code)
	}
	if strings.Contains(compact, `deferredTaskProps: [ "initial"`) ||
		strings.Contains(compact, `deferredTaskProps: [ "request", "initial"`) {
		t.Fatalf("directly consumed prop was incorrectly deferred:\n%s", response.Code)
	}
}

func TestServerScheduledComponentRetainsDirectLifecycle(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-scheduled-lifecycle.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> {
				state: State;
				onUnmount(handler: () => void): void;
			}
			export function Page(this: Component<{ value: string }>) {
				const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
					this.state.value = await Promise.resolve("ready");
				};
				load();
				this.onUnmount(() => undefined);
				return () => <output>{this.state.value}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`classification: "scheduled"`,
		`registerDirectSsrLifecycleHandler as __exactRegisterDirectSsrLifecycle`,
		`"unmount", () => undefined`,
		`lifecycle: __exactDirectSsrLifecycle`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("scheduled server lifecycle omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestCompilerClosedServerRootSelectsNarrowStringRenderer(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root.tsx", Kind: "compile", Target: TargetServer,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
		Source: `
			import { renderToStringAsync } from "@exactjs/ssr";
			function Label(props: { label: string }) {
				return () => <strong>{props.label}</strong>;
			}
			export function Page(props: { label: string }) {
				return () => <main><Label label={props.label} /></main>;
			}
			export function render(label: string) {
				return renderToStringAsync(<Page label={label} />, { markers: false });
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`renderCompilerClosedUnmarkedToStringAsync as`,
		`from "@exactjs/ssr/runtime/compiler-closed"`,
		`__exactRenderClosedUnmarkedSsr(__exactComponentReceipt(Page`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiler-closed root is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/ssr"`) ||
		strings.Contains(response.Code, `renderToStringAsync(__exactComponentReceipt(Page`) {
		t.Fatalf("compiler-closed root retained the universal renderer:\n%s", response.Code)
	}
}

func TestCompilerClosedServerRootDoesNotRequireImportedChildGraphClosure(t *testing.T) {
	root := t.TempDir()
	childFile := filepath.Join(root, "child.tsx")
	entryFile := filepath.Join(root, "entry.tsx")
	childSource := `export function Child(props: { label: string }) { return () => <strong>{props.label}</strong>; }`
	entrySource := `
		import { renderToStringAsync } from "@exactjs/ssr";
		import { Child } from "./child.js";
		export function Page(props: { label: string }) {
			return () => <main><Child label={props.label} /></main>;
		}
		export function render(label: string) {
			return renderToStringAsync(<Page label={label} />, { markers: false });
		}
	`
	for filename, source := range map[string]string{
		childFile: childSource,
		entryFile: entrySource,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Root: root, Kind: "compile", Target: TargetServer, Source: entrySource,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`renderCompilerClosedUnmarkedToStringAsync as`,
		`from "@exactjs/ssr/runtime/compiler-closed"`,
		`__exactSsr.directComponent(__exactContext, __exactOutput, Child,`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("imported child ABI root is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/ssr"`) {
		t.Fatalf("imported child forced the universal renderer:\n%s", response.Code)
	}
}

func TestCompilerClosedMarkedServerRootRetainsMarkerFormatting(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-marked.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { renderToStringAsync } from "@exactjs/ssr";
			export function Page() { return () => <main>ready</main>; }
			export function render() { return renderToStringAsync(<Page />); }
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
		strings.Contains(response.Code, `renderCompilerClosedUnmarkedToStringAsync as`) {
		t.Fatalf("marked closed root did not retain marker formatting:\n%s", response.Code)
	}
}

func TestCompilerClosedServerRootInsideNestedArrowSelectsNarrowRenderer(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-nested-arrow.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { renderToStringAsync } from "@exactjs/ssr";
			export function Page(props: { value: number }) {
				return () => <main>{props.value}</main>;
			}
			export function renderMany(values: number[], markers: boolean) {
				return Promise.all(values.map((value) =>
					renderToStringAsync(<Page value={value} />, {
						markers,
						maxAsyncSsrConcurrency: 4
					})
				));
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
		strings.Contains(response.Code, `from "@exactjs/ssr"`) {
		t.Fatalf("nested compiler-closed root retained the universal renderer:\n%s", response.Code)
	}
}

func TestCompilerClosedHydratableRootSelectsPairedRenderer(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-hydratable.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { renderToHydratableStringAsync } from "@exactjs/ssr";
			function Label(props: { label: string }) {
				return () => <strong>{props.label}</strong>;
			}
			export function Page(props: { label: string }) {
				return () => <main><Label label={props.label} /></main>;
			}
			export function render(label: string) {
				return renderToHydratableStringAsync(<Page label={label} />);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`renderCompilerClosedToHydratableStringAsync as`,
		`from "@exactjs/ssr/runtime/compiler-closed"`,
		`__exactRenderClosedHydratableSsr(__exactComponentReceipt(Page`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiler-closed hydratable root is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/ssr"`) ||
		strings.Contains(response.Code, `renderToHydratableStringAsync(__exactComponentReceipt(Page`) {
		t.Fatalf("compiler-closed hydratable root retained the universal renderer:\n%s", response.Code)
	}
}

func TestUnmarkedClosedServerOnlyRootOmitsResumptionFormatting(t *testing.T) {
	for name, exported := range map[string]string{
		"private":  "",
		"exported": "export ",
	} {
		t.Run(name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID: "server-root-unmarked-" + name + ".tsx", Kind: "compile", Target: TargetServer,
				Source: `
					import { TaskContext } from "@exactjs/core";
					import { renderToStringAsync } from "@exactjs/ssr";
					declare class Component<State> { state: State }
					` + exported + `function Page(this: Component<{ value: string }>) {
						async function load(_task: TaskContext = TaskContext.server().blocking()) {
							this.state.value = await Promise.resolve("ready");
						}
						load();
						return () => <main>{this.state.value}</main>;
					}
					export function render() {
						return renderToStringAsync(<Page />, { markers: false });
					}
				`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, `import "@exactjs/ssr/runtime/resumption-boundaries"`) ||
				strings.Contains(response.Code, `publication:`) {
				t.Fatalf("%s server-only component retained client resumption publication:\n%s", name, response.Code)
			}
		})
	}
}

func TestIsomorphicContinuationEmitsPreparedServerPublication(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "isomorphic-publication.tsx", Kind: "compile", Target: TargetServer,
		ComponentContractProjection: ComponentContractProjectionServerRender,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Page(this: Component<{ value: string }>) {
				async function load(_task: TaskContext = TaskContext.server().blocking()) {
					this.state.value = await Promise.resolve("ready");
				}
				return () => <button onClick={() => load()}>{this.state.value}</button>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`import "@exactjs/ssr/runtime/resumption-boundaries"`,
		`publication:`,
		`kind: "resumption"`,
		`name: "Page"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("isomorphic continuation artifact is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestCompilerClosedServerRootIncludesDirectContextDescendant(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-generic-child.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { renderToStringAsync } from "@exactjs/ssr";
			declare class Component { getContext(token: unknown): unknown }
			function ContextChild(this: Component) {
				this.getContext(Symbol.for("request"));
				return () => <strong>ready</strong>;
			}
			export function Page() { return () => <main><ContextChild /></main>; }
			export function render() { return renderToStringAsync(<Page />); }
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
		strings.Contains(response.Code, `renderToStringAsync(__exactComponentReceipt(Page`) ||
		strings.Contains(response.Code, `lane: "generic"`) {
		t.Fatalf("direct context descendant did not select the narrow renderer:\n%s", response.Code)
	}
}

func TestReceiverForwardingSetupHelperDoesNotReceiveComponentArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "component-setup-helper.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			declare class Component<State> { state: State; onMount(callback: () => void): void }
			export function Input(this: Component<{}>, props: { value: string }) {
				return control.call(this, "input", props);
			}
			function control(this: Component<{}>, tag: "input", props: { value: string }) {
				this.onMount(() => undefined);
				return () => <tag>{props.value}</tag>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, `__exactImplementation_control`) ||
		strings.Contains(response.Code, `name: "control", role: "root"`) {
		t.Fatalf("receiver-forwarding setup helper received a component artifact:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `__exactPreparedRenderProgram`) {
		t.Fatalf("setup helper output was not lowered with its owning component:\n%s", response.Code)
	}
}

func TestCompilerClosedServerRootUsesFocusedChildOperationForGeneralChildSlot(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-general-child.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { renderToStringAsync } from "@exactjs/ssr";
			export function Page(props: { content: unknown }) {
				return () => <main>{props.content}</main>;
			}
			export function render(content: unknown) {
				return renderToStringAsync(<Page content={content} />);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
		!strings.Contains(response.Code, `__exactRenderClosedSsr(__exactComponentReceipt(Page`) {
		t.Fatalf("general child slot did not retain its focused operation in the narrow renderer:\n%s", response.Code)
	}
}

func TestCompilerClosedServerRootRetainsUniversalRendererForDynamicMarkupOptions(t *testing.T) {
	for name, options := range map[string]string{
		"dynamic":          "options",
		"enabled":          "{ reactMarkup: true }",
		"spread":           "{ ...options, markers: false }",
		"computed":         `{ ["reactMarkup"]: false }`,
		"output-extension": `{ markers: false, outputExtensions: [undefined as never] }`,
	} {
		t.Run(name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID: "server-root-" + name + ".tsx", Kind: "compile", Target: TargetServer,
				Source: `
					import { renderToStringAsync } from "@exactjs/ssr";
					export function Page() { return () => <main>ready</main>; }
					export function render(options: { reactMarkup?: boolean; markers?: boolean }) {
						return renderToStringAsync(<Page />, ` + options + `);
					}
				`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
				!strings.Contains(response.Code, `renderToStringAsync(__exactComponentReceipt(Page`) {
				t.Fatalf("%s render options incorrectly selected the narrow renderer:\n%s", name, response.Code)
			}
		})
	}
}

func TestServerContextExecutionUsesDirectRequestLocalFrame(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-generic-execution.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> {
				state: State;
				getContext(token: unknown): unknown;
			}
			export function ContextPage(this: Component<{ value: string }>) {
				async function load(_task: TaskContext = TaskContext.server().blocking()) {
					this.getContext(Symbol.for("request"));
					this.state.value = await Promise.resolve("ready");
				}
				load();
				return () => <output>{this.state.value}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, excluded := range []string{
		`import "@exactjs/ssr/runtime/generic-components"`,
		`import "@exactjs/core/runtime/contexts"`,
		`lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("direct server context component retained %q:\n%s", excluded, response.Code)
		}
	}
	if !strings.Contains(response.Code, `lane: "direct"`) {
		t.Fatalf("context-bearing server component did not select the direct lane:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `"contexts"`) ||
		strings.Contains(response.Code, `@exactjs/ssr/runtime/direct-context-frame`) ||
		strings.Contains(response.Code, `frame: __exactDirectSsrContextFrame`) {
		t.Fatalf("direct server context component did not publish its renderer-neutral capability:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `createPreparedServerRenderProgram`) ||
		!strings.Contains(response.Code, `from "@exactjs/core/framework/server-render-structure"`) ||
		strings.Contains(response.Code, `createPreparedRenderProgram`) {
		t.Fatalf("direct server context component did not use the compiler-owned server writer lane:\n%s", response.Code)
	}
}

func TestServerLoggingUsesFocusedDirectFrameBesideOrdinaryDirectComponents(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "mixed-server-execution.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> {
				state: State;
				log: { info(message: string): void };
			}
			export function GenericPage(this: Component<{ value: string }>) {
				this.log.info("rendering");
				return () => <output>{this.state.value}</output>;
			}
			export function DirectPage(props: { value: string }) {
				return () => <output>{props.value}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`createPreparedServerRenderProgram as __exactPreparedServerRenderProgram`,
		`from "@exactjs/core/framework/server-render-structure"`,
		`componentLogMethod as __exactComponentLog`,
		`from "@exactjs/core/runtime/logging"`,
		`createDirectSsrLoggingFrame as __exactDirectSsrLoggingFrame`,
		`from "@exactjs/ssr/runtime/direct-logging-frame"`,
		`frame: __exactDirectSsrLoggingFrame`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct logging server component module is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`import "@exactjs/ssr/runtime/generic-components"`,
		`lane: "generic"`,
		`constructDurableComponentInstance`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("direct logging server component retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerLocalizationUsesDirectContextFrame(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "localized-server-execution.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> {
				state: State;
				intl: Intl;
			}
			export function LocalizedPage(this: Component<{}>, props: { total: number }) {
				return () => <output>{this.intl.NumberFormat().format(props.total)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`componentIntl as __exactComponentIntl`,
		`from "@exactjs/core/runtime/localization"`,
		`__exactComponentIntl(this).NumberFormat()`,
		`"contexts"`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct localized server component module is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`import "@exactjs/ssr/runtime/generic-components"`,
		`lane: "generic"`,
		`constructDurableComponentInstance`,
		`import "@exactjs/core/runtime/contexts"`,
		`@exactjs/ssr/runtime/direct-context-frame`,
		`frame: __exactDirectSsrContextFrame`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("direct localized server component retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionRemovesClientOnlyRefCapability(t *testing.T) {
	source := `
		declare const buttonRef: unknown;
		declare class Component<State> {
			state: State;
			ref(key: unknown): any;
		}
		export function RefPage(this: Component<{}>) {
			return () => <button ref={this.ref(buttonRef)}>Save</button>;
		}
	`
	server := NewSession().Execute(Request{
		ID: "server-ref-projection.tsx", Kind: "compile", Target: TargetServer, Source: source,
	})
	if server.Error != "" || len(server.Diagnostics) != 0 {
		t.Fatalf("server compile failed: %s %#v", server.Error, server.Diagnostics)
	}
	for _, excluded := range []string{
		`runtime/refs`,
		`generic-components`,
		`lane: "generic"`,
		`this.ref`,
	} {
		if strings.Contains(server.Code, excluded) {
			t.Fatalf("server ref projection retained %q:\n%s", excluded, server.Code)
		}
	}
	if !strings.Contains(server.Code, `lane: "direct"`) {
		t.Fatalf("client-only ref prevented direct SSR:\n%s", server.Code)
	}

	client := NewSession().Execute(Request{
		ID: "client-ref-projection.tsx", Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" || len(client.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", client.Error, client.Diagnostics)
	}
	if !strings.Contains(client.Code, `@exactjs/core/runtime/refs`) ||
		!strings.Contains(client.Code, `this.ref(buttonRef)`) {
		t.Fatalf("server projection weakened the client ref surface:\n%s", client.Code)
	}
}

func TestServerProjectionRetainsObservableRefReads(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-ref-read.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare const buttonRef: unknown;
			declare class Component<State> {
				state: State;
				readRef(key: unknown): unknown;
			}
			export function RefState(this: Component<{}>) {
				const current = this.readRef(buttonRef);
				return () => <output>{String(current)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`directSsrReadRef as __exactDirectSsrReadRef`,
		`@exactjs/ssr/runtime/direct-refs`,
		`__exactDirectSsrReadRef(this, buttonRef)`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("observable server ref read omitted direct operation %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`@exactjs/core/runtime/refs`,
		`@exactjs/ssr/runtime/generic-components`,
		`lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("observable server ref read retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionPublishesRefBindingsObservedOutsideTheRefAttribute(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-observed-ref-attribute.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare const buttonRef: unknown;
			declare class Component<State> {
				state: State;
				ref(key: unknown): any;
			}
			export function RefPage(this: Component<{}>) {
				const binding = this.ref(buttonRef);
				const observed = binding;
				return () => <><output>{String(observed)}</output><button ref={binding}>Save</button></>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("server compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`directSsrRef as __exactDirectSsrRef`,
		`ref: binding`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("observable server ref attribute omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestServerProjectionLinksCanonicalRefBindingAndRootOperations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-ref-operations.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare const rootKey: unknown;
			declare class Component<State> {
				state: State;
				ref(key: unknown): any;
				refs: { get(key: unknown): unknown; root(binding?: unknown): unknown };
			}
			export function RefState(this: Component<{}>) {
				const binding = this.ref(rootKey);
				const current = this.refs.get(rootKey);
				const root = this.refs.root(binding);
				return () => <output>{String(current)}:{String(root)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`__exactDirectSsrRef(this, rootKey)`,
		`__exactDirectSsrReadRef(this, rootKey)`,
		`__exactDirectSsrRoot(this, binding)`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("server ref operations omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestServerProjectionLinksExtractedRefSurfaceToStableDirectMethod(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-ref-extracted.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> { state: State; readRef(key: unknown): unknown }
			export function RefState(this: Component<{}>) {
				const read = this.readRef;
				return () => <output>{String(read)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{`directSsrReadRefMethod as`, `lane: "direct"`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("extracted ref surface omitted %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{`@exactjs/core/runtime/refs`, `generic-components`, `lane: "generic"`} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("extracted ref surface retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionLinksCanonicalComponentReactiveValues(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-component-reactive.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import type { Component } from "@exactjs/core";
			export function ReactiveState(this: Component<{ count: number }>) {
				this.state.count = 2;
				this.reactive(() => this.state.count * 2);
				this.reactive(this.state.count);
				return () => <output>ready</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`directSsrReactive as __exactDirectSsrReactive`,
		`__exactDirectSsrReactive(() => this.state.count * 2)`,
		`__exactDirectSsrReactive(() => this.state.count)`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("server reactive operation omitted %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`@exactjs/core/runtime/component-reactivity`,
		`@exactjs/ssr/runtime/generic-components`,
		`lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("server reactive operation retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionLinksExtractedReactiveSurfaceToStableDirectMethod(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-component-reactive-extracted.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import type { Component } from "@exactjs/core";
			export function ReactiveState(this: Component<{}>) {
				const create = this.reactive;
				return () => <output>{String(create)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{`directSsrReactiveMethod as`, `lane: "direct"`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("extracted reactive surface omitted %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`@exactjs/core/runtime/component-reactivity`, `generic-components`, `lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("extracted reactive surface retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionLinksCanonicalLifecycleOperations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-component-lifecycle.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> {
				state: State;
				onUnmount(handler: () => void): void;
				onRender(handler: (event: { duration: number }) => void): void;
				own<T extends { dispose(): void }>(resource: T): T;
			}
			declare const resource: { dispose(): void };
			export function Lifecycle(this: Component<{}>) {
				this.onRender(() => undefined);
				this.onUnmount(() => undefined);
				this.own(resource);
				return () => <output>ready</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`@exactjs/ssr/runtime/direct-lifecycle`,
		`__exactRegisterDirectSsrRender(this, () => undefined)`,
		`__exactRegisterDirectSsrLifecycle(this, "unmount", () => undefined)`,
		`__exactOwnDirectSsrResource(this, resource)`,
		`lifecycle: __exactDirectSsrLifecycle`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("server lifecycle operation omitted %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`@exactjs/core/framework/component-lifecycle`,
		`@exactjs/ssr/runtime/generic-components`,
		`lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("server lifecycle operation retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestServerProjectionLinksExtractedLifecycleSurfaceToStableDirectMethod(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-component-lifecycle-extracted.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component<State> { state: State; onUnmount(handler: () => void): void }
			export function Lifecycle(this: Component<{}>) {
				const register = this.onUnmount;
				return () => <output>{String(register)}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{`directSsrLifecycleMethod as`, `lane: "direct"`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("extracted lifecycle surface omitted %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`@exactjs/core/runtime/lifecycle`, `ComponentInstanceImpl as __exactConstructDurableComponent`,
		`generic-components`, `lane: "generic"`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("extracted lifecycle surface retained %q:\n%s", excluded, response.Code)
		}
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
		"artifact:", `target: "client"`, "instantiate:", "capabilities:", "state:", "resumption:",
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

	serverRender := NewSession().Execute(Request{
		ID: "server-render.tsx", Kind: "compile", Target: TargetServer,
		ComponentContractProjection: ComponentContractProjectionServerRender,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Loader(this: Component<{ value: number }>) {
				async function load(_task: TaskContext = TaskContext.server().blocking()) {
					this.state.value = await Promise.resolve(1);
				}
				load();
				return () => <output>{this.state.value}</output>;
			}
		`,
	})
	if serverRender.Error != "" || len(serverRender.Diagnostics) != 0 {
		t.Fatalf("server render projection failed: %s %#v", serverRender.Error, serverRender.Diagnostics)
	}
	for _, expected := range []string{`role: "render"`, "executors: []", "artifact:", `target: "server"`, `lane: "direct"`} {
		if !strings.Contains(serverRender.Code, expected) {
			t.Fatalf("server render projection is missing %q:\n%s", expected, serverRender.Code)
		}
	}
	if strings.Contains(serverRender.Code, "execute: async") {
		t.Fatalf("server render projection retained a continuation dispatch executor:\n%s", serverRender.Code)
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
		"serverComponentExecutionValueForHost as __exactServerComponentOutput",
		`__exactServerComponentOutput(this, ["name", "accent"], () => ({`,
		`classification: "scheduled"`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiled aggregate output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `@exactjs/ssr/runtime/generic-components`) {
		t.Fatalf("aggregate output propagation retained the generic component renderer:\n%s", response.Code)
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

func TestClientTransparentComponentUsesItsCompiledBoundaryRange(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "transparent.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			export function Transparent(props: { children?: string }) {
				return () => props.children;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "return () => __exactDynamic(() => __exactReadState(props, 0)") ||
		!strings.Contains(response.Code, "abi: 1") {
		t.Fatalf("transparent render did not select a focused dynamic output range:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "createCompiledComponentOutput") {
		t.Fatalf("transparent render retained the obsolete component-wide range helper:\n%s", response.Code)
	}
	server := NewSession().Execute(Request{
		ID:     "transparent.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			export function Transparent(props: { children?: string }) {
				return () => props.children;
			}
		`,
	})
	if server.Error != "" || len(server.Diagnostics) != 0 {
		t.Fatalf("server compile failed: %s %#v", server.Error, server.Diagnostics)
	}
	if !strings.Contains(server.Code, "return () => __exactDynamic(() => props.children") {
		t.Fatalf("server projection omitted the client hydration range:\n%s", server.Code)
	}

	static := NewSession().Execute(Request{
		ID:     "static-transparent.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			export function StaticTransparent() {
				return () => null;
			}
		`,
	})
	if static.Error != "" || len(static.Diagnostics) != 0 {
		t.Fatalf("static compile failed: %s %#v", static.Error, static.Diagnostics)
	}
	if strings.Contains(static.Code, "createCompiledChildRangeReceipt") || !strings.Contains(static.Code, "abi: 1") {
		t.Fatalf("constant render retained unnecessary reactive work:\n%s", static.Code)
	}
}

func TestClientOperationFactoryFinalizesParameterProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "root-factory.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare function Child(props: { binding: string }): unknown;
			export const root = (binding: string) => <Child binding={binding} />;
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `__exactComponentReceipt(Child, { binding: binding })`) {
		t.Fatalf("operation factory did not finalize its invocation prop:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `__exactForwardedExpression(() => binding)`) {
		t.Fatalf("operation factory leaked a live-slot operand into its root receipt:\n%s", response.Code)
	}
}

func TestClientConditionalJSXCollectionUsesItsFocusedBoundaryRange(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "conditional-collection.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			export function Conditional(props: { shown: boolean }) {
				return () => props.shown ? [<span key="content">shown</span>] : [];
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "return () => __exactDynamic(() =>") ||
		!strings.Contains(response.Code, "abi: 1") {
		t.Fatalf("conditional JSX collection did not select a focused dynamic output range:\n%s", response.Code)
	}
}

func TestClientComponentIndexesProvenPropsWithoutRewritingDynamicAccess(t *testing.T) {
	source := `
		export function Label(props: { title: string; [key: string]: unknown }) {
			const key = "detail";
			return () => <p>{props.title}{String(props[key])}</p>;
		}
	`
	client := NewSession().Execute(Request{
		ID: "indexed-props.tsx", Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" || len(client.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", client.Error, client.Diagnostics)
	}
	for _, expected := range []string{
		`props: [`, `"title"`, `[0, 0, [1, 0], true]`, `props[key]`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf("indexed client props are missing %q:\n%s", expected, client.Code)
		}
	}

	server := NewSession().Execute(Request{
		ID: "indexed-props.tsx", Kind: "compile", Target: TargetServer, Source: source,
		ServerComponents: true,
	})
	if server.Error != "" || len(server.Diagnostics) != 0 {
		t.Fatalf("server compile failed: %s %#v", server.Error, server.Diagnostics)
	}
	if strings.Contains(server.Code, `__exactReadState(props`) ||
		!strings.Contains(server.Code, `props: [`) ||
		!strings.Contains(server.Code, `"title"`) {
		t.Fatalf("server artifact did not retain its compiler-owned props layout:\n%s", server.Code)
	}
}

func TestClientComponentKeepsDerivedTextAsExecutableReader(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "derived-text-reader.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			export function Count(this: Component<{ count: number }>) {
				this.state.count = 0;
				return () => <output>{this.state.count + 1}</output>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("client compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `() => (__exactReadState(this.state, 0) as number) + 1`) ||
		strings.Contains(response.Code, `[0, 0, [0, 0], true]`) {
		t.Fatalf("derived text did not retain its executable reader fallback:\n%s", response.Code)
	}
}

func TestClientComponentRetainsFinitePropsPassedToHelper(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "helper-props.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			type Props = { density?: "compact" | "comfortable"; tonic?: string; children?: unknown };
			function sourceFromProps(props: Props) { return props.density ?? props.tonic; }
			export function Scope(props: Props) {
				const source = () => sourceFromProps(props);
				return () => <section data-source={source()}>{props.children}</section>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{`props: [`, `"children"`, `"density"`, `"tonic"`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("helper-visible finite props are missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestClientStructuralImportsDoNotSelectCompatibilityProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "structural-imports.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { Activity, Suspense } from "@exactjs/core";
			export function Panel(props: { count: number }) {
				return () => (
					<Suspense fallback={<span>loading</span>}>
						<Activity mode="active">
							{Array.from({ length: props.count }, (_, index) => <i>{index}</i>)}
						</Activity>
					</Suspense>
				);
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		"createCompiledActivityReceipt",
		"createCompiledSuspenseReceipt",
		"__exactReadState(props, 0)",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native structural lowering is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `"compatibility"`) ||
		strings.Contains(response.Code, "__exactInteropComponent") {
		t.Fatalf("native structural import selected compatibility ownership:\n%s", response.Code)
	}
}

func TestClientRenderHelperStateFacadeUsesItsCompiledBoundaryRange(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "render-helper.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			declare function renderView(state: { label: string }): unknown;
			export function View(this: Component<{ label: string }>) {
				return () => renderView(this.state);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "return () => __exactDynamic(() => renderView(this.state))") ||
		!strings.Contains(response.Code, "abi: 1") {
		t.Fatalf("state-forwarding render helper did not select its focused range:\n%s", response.Code)
	}
}

func TestClientLocalOpaqueRenderHelperOwnsComponentRangeObservation(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "local-render-helper.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			export function Presence(props: { when: boolean }) {
				function render() {
					return props.when ? "shown" : null;
				}
				return () => render();
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "return () => __exactDynamic(() => render())") ||
		!strings.Contains(response.Code, "abi: 1") {
		t.Fatalf("local opaque render helper did not retain its focused observation range:\n%s", response.Code)
	}
}

func TestClientCompiledRenderHelperUsesFiniteProgramABI(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "view.tsx")
	helperSource := `
		export function renderView(state: { labels: string[] }) {
			const visible = state.labels.filter(label => label.length !== 0);
			return <output>{visible.join(",")}</output>;
		}
		export function renderLabel(label: string) {
			return <output>{label}</output>;
		}
	`
	if err := os.WriteFile(
		helper,
		[]byte(helperSource),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:     entry,
		Root:   root,
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { renderView } from "./view.js";
			declare class Component<State> { state: State }
			export function View(this: Component<{ labels: string[] }>) {
				return () => renderView(this.state);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "return () => renderView(this.state)") ||
		!strings.Contains(response.Code, "abi: 1") {
		t.Fatalf("compiled render helper did not select the finite program ABI:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "abi: 32") {
		t.Fatalf("compiled render helper retained generic range reconciliation:\n%s", response.Code)
	}
	snapshot := NewSession().Execute(Request{
		ID:     filepath.Join(root, "snapshot.tsx"),
		Root:   root,
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { renderLabel } from "./view.js";
			declare class Component<State> { state: State }
			export function Snapshot(this: Component<{ label: string }>) {
				return () => renderLabel(this.state.label);
			}
		`,
	})
	if snapshot.Error != "" || len(snapshot.Diagnostics) != 0 {
		t.Fatalf("snapshot compile failed: %s %#v", snapshot.Error, snapshot.Diagnostics)
	}
	if !strings.Contains(snapshot.Code, "__exactDynamic(() => renderLabel(") ||
		!strings.Contains(snapshot.Code, "abi: 1") ||
		strings.Contains(snapshot.Code, "abi: 32") {
		t.Fatalf("eager helper argument snapshot lost range invalidation:\n%s", snapshot.Code)
	}
	helperResponse := NewSession().Execute(Request{
		ID:     helper,
		Root:   root,
		Kind:   "compile",
		Target: TargetClient,
		Source: helperSource,
	})
	if helperResponse.Error != "" || len(helperResponse.Diagnostics) != 0 {
		t.Fatalf("helper compile failed: %s %#v", helperResponse.Error, helperResponse.Diagnostics)
	}
	if !strings.Contains(helperResponse.Code, "createDerived as __exactDerived") ||
		!strings.Contains(helperResponse.Code, "const visible = __exactDerived(") ||
		!strings.Contains(helperResponse.Code, "visible.get()") {
		t.Fatalf("compiled render helper did not retain parameter-derived work:\n%s", helperResponse.Code)
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
		`const load = __exactBindClientLatestTask(this, "load", async`,
		`load();`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compact client/latest output is missing %q:\n%s", expected, response.Code)
		}
	}
	compact := response.Code[strings.Index(response.Code, "const __exactImplementation_Queue_1"):]
	for _, universal := range []string{
		"defineTask as",
		"bindTaskForHost as",
		"activateTaskForHost as",
		"activateCompiledClientLatestTaskForHost as",
	} {
		if strings.Contains(compact, universal) {
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
