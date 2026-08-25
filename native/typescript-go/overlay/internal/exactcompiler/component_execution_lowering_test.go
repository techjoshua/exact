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
		"readIndexedReactiveSlot as __exactReadState",
		"writeIndexedReactiveLazy as __exactWriteState",
		"__exactWriteState(this.state, 0, () => 0)",
		"__exactReadState(this.state, 0)",
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
		strings.Contains(server.Code, "writeIndexedReactiveLazy") ||
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
		"__exactWriteState(this.state, 0, () => __exactBindingValue)",
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
	if !strings.Contains(response.Code, "__exactWriteState(this.state, 0") ||
		strings.Contains(response.Code, `__exactWrite(this.state, ["message"]`) {
		t.Fatalf("compiler-generated computation did not preserve its indexed write:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `label: "__exactComponentComputation_`) {
		t.Fatalf("hydrate projection wrapped a synchronous computation in a task definition:\n%s", response.Code)
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
		`keyCompiledVNode as`, `rejectDirectServerComponentConstruction as`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("direct list frame is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `@exactjs/core/runtime/lists`) ||
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
		`issueServerComponentVNode as`, `__exactIssueServerComponent(__exactComponentVNode(Page`,
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
		`execution:`, `slices:`, `createServerSlot as`, `markIndependentAsyncSiblings as`,
		`createCompiledVNode as`,
	} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf("scheduled direct server component retained generic runtime %q:\n%s", forbidden, response.Code)
		}
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
		`__exactRenderClosedUnmarkedSsr(__exactComponentVNode(Page`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiler-closed root is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/ssr"`) ||
		strings.Contains(response.Code, `renderToStringAsync(__exactComponentVNode(Page`) {
		t.Fatalf("compiler-closed root retained the universal renderer:\n%s", response.Code)
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
		`__exactRenderClosedHydratableSsr(__exactComponentVNode(Page`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("compiler-closed hydratable root is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `from "@exactjs/ssr"`) ||
		strings.Contains(response.Code, `renderToHydratableStringAsync(__exactComponentVNode(Page`) {
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
		strings.Contains(response.Code, `renderToStringAsync(__exactComponentVNode(Page`) ||
		strings.Contains(response.Code, `lane: "generic"`) {
		t.Fatalf("direct context descendant did not select the narrow renderer:\n%s", response.Code)
	}
}

func TestManualVNodeServerOutputUsesDirectFrameWithoutClaimingClosedTopology(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "server-root-manual-vnode.ts", Kind: "compile", Target: TargetServer,
		Source: `
			import { createVNode } from "@exactjs/core";
			import { renderToStringAsync } from "@exactjs/ssr";
			export function Page(props: { value: string }) {
				return () => createVNode("main", null, props.value);
			}
			export function render(value: string) {
				return renderToStringAsync(createVNode(Page, { value }));
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{
		`lane: "direct"`,
		`rejectDirectServerComponentConstruction as`,
		`renderToStringAsync(createVNode(Page, { value }))`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("manual VNode direct artifact is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, excluded := range []string{
		`lane: "generic"`,
		`@exactjs/ssr/runtime/generic-components`,
		`renderCompilerClosedToStringAsync as`,
	} {
		if strings.Contains(response.Code, excluded) {
			t.Fatalf("manual VNode direct artifact retained %q:\n%s", excluded, response.Code)
		}
	}
}

func TestCompilerClosedServerRootRetainsUniversalRendererForGeneralChildSlot(t *testing.T) {
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
	if strings.Contains(response.Code, `renderCompilerClosedToStringAsync as`) ||
		!strings.Contains(response.Code, `renderToStringAsync(__exactComponentVNode(Page`) {
		t.Fatalf("general child slot incorrectly selected the narrow renderer:\n%s", response.Code)
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
				!strings.Contains(response.Code, `renderToStringAsync(__exactComponentVNode(Page`) {
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
	if !strings.Contains(response.Code, `createDirectSsrContextFrame as`) ||
		!strings.Contains(response.Code, `from "@exactjs/ssr/runtime/direct-context-frame"`) ||
		!strings.Contains(response.Code, `frame: __exactDirectSsrContextFrame`) {
		t.Fatalf("direct server context component omitted its focused capability:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `createPreparedServerRenderProgram`) ||
		!strings.Contains(response.Code, `from "@exactjs/core/framework/server-render-structure"`) ||
		strings.Contains(response.Code, `createPreparedRenderProgram`) {
		t.Fatalf("direct server context component did not use the compiler-owned server writer lane:\n%s", response.Code)
	}
}

func TestMixedServerExecutionImportsDirectAndGenericRenderCapabilities(t *testing.T) {
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
		`from "@exactjs/core/framework/render-structure"`,
		`import { createPreparedServerRenderProgram as __exactPreparedServerRenderProgram } from "@exactjs/core/framework/server-render-structure"`,
		`import "@exactjs/ssr/runtime/generic-components"`,
		`lane: "generic"`,
		`lane: "direct"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("mixed server component module is missing %q:\n%s", expected, response.Code)
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
	for _, expected := range []string{`role: "render"`, "executors: []", "definition:", `lane: "direct"`} {
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
	if !strings.Contains(response.Code, "return () => __exactReadState(props, 0)") ||
		!strings.Contains(response.Code, "abi: 32") {
		t.Fatalf("transparent render did not select compiler-owned component-range output:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "createDynamicChild") ||
		strings.Contains(response.Code, "createCompiledComponentOutput") {
		t.Fatalf("transparent render retained a nested range helper:\n%s", response.Code)
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
	if strings.Contains(static.Code, "createDynamicChild") || !strings.Contains(static.Code, "abi: 1") {
		t.Fatalf("constant render retained unnecessary reactive work:\n%s", static.Code)
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
		`props: [`, `"title"`, `__exactReadState(props, 0) as string`, `props[key]`,
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
	if strings.Contains(server.Code, `__exactReadState(props`) || strings.Contains(server.Code, `props: [`) {
		t.Fatalf("server artifact retained client-only indexed props:\n%s", server.Code)
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
	if !strings.Contains(response.Code, "return () => renderView(this.state)") ||
		!strings.Contains(response.Code, "abi: 32") {
		t.Fatalf("state-forwarding render helper did not select its component range:\n%s", response.Code)
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
	if !strings.Contains(snapshot.Code, "abi: 32") {
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
