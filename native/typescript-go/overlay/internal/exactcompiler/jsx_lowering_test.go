package exactcompiler

import (
	"strings"
	"testing"
)

func TestTargetArtifactStructureReportsNoNativeFallbackForSupportedIntrinsics(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/structure.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function Page() { return () => <main><span>ready</span></main>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if response.Structure.NativeComponents != 1 || response.Structure.TargetArtifacts != 1 {
		t.Fatalf("target artifact inventory was not reported: %#v", response.Structure)
	}
	if response.Structure.DeclinedNativeJSXRegions != 0 ||
		response.Structure.FallbackBearingArtifacts != 0 {
		t.Fatalf("closed client interior reported a lowering fallback: %#v", response.Structure)
	}
	if response.Structure.GenericNativeRendererImports != 0 {
		t.Fatalf("closed client artifact retained generic component construction: %#v", response.Structure)
	}

	template := NewSession().Execute(Request{
		ID:     "C:/tmp/structure-fallback.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function Page() { return () => <template><main /></template>; }`,
	})
	if template.Error != "" {
		t.Fatal(template.Error)
	}
	if template.Structure.DeclinedNativeJSXRegions != 0 ||
		template.Structure.FallbackBearingArtifacts != 0 {
		t.Fatalf("supported template intrinsic reported a native fallback: %#v", template.Structure)
	}
	if strings.Contains(template.Code, "createCompiledVNode") ||
		!strings.Contains(template.Code, "createCompiledIntrinsicReceipt") {
		t.Fatalf("template intrinsic did not lower to its native receipt:\n%s", template.Code)
	}
}

func TestComponentLocalProgramDefersOpaqueParentNamespaceToAttachment(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/contextual-attachment.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare function Frame(props: { children?: unknown }): unknown;
			export function Page() { return () => <Frame><path data-route="ready" /></Frame>; }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if response.Structure.DeclinedNativeJSXRegions != 0 {
		t.Fatalf("opaque component parent caused a native JSX decline: %#v", response.Structure)
	}
	for _, expected := range []string{
		`namespace: "contextual"`,
		`attachmentTag: "path"`,
		`root: ["path"]`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("component-local program omitted %s:\n%s", expected, response.Code)
		}
	}
}

func TestJSXLoweringEmitsNativeRuntimeOperations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/native-equivalence.tsx",
		Kind: "compile",
		Source: `export function Panel(this: Component<{ count: number }>) { ` +
			`return () => <button title={this.state.count}>Count ` +
			`{this.state.count}</button>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledIntrinsicReceipt as __exactIntrinsicReceipt`,
		`createIndexedReactiveValue as __exactIndexedExpression`,
		`createCompiledChildRangeReceipt as __exactDynamic`,
		`__exactIntrinsicReceipt("button"`,
		`"data-exact-id": "xpQ67SWvp8CKhdHZwKUD67e"`,
		`title: __exactIndexedExpression(this.state, 0)`,
		`__exactDynamic(() => this.state.count, "xBmtwVG9HoTfsvcpoWEg1vm")`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native JSX output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "<button") {
		t.Fatalf("native JSX was not fully lowered:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "createCompiledFragment") {
		t.Fatalf("unused fragment helper escaped into native output:\n%s", response.Code)
	}
}

func TestJSXLoweringPreservesOrdinaryCallerLocalsMaterializedIntoComponentProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/ordinary-caller-local.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { render } from "@exactjs/dom";
			function KeyedList(props: { items: string[] }) {
				return () => <ul>{props.items.map((item) => <li key={item}>{item}</li>)}</ul>;
			}
			export function run(base: string[], mutate: (items: string[]) => void, container: Element) {
				render(<KeyedList items={[...base]} />, container);
				const next = [...base];
				mutate(next);
				render(<KeyedList items={next} />, container);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{`const next = [...base];`, `mutate(next);`, `__exactExpression(() => next)`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("ordinary caller local was not preserved at %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `const __exact_next_`) {
		t.Fatalf("component prop consumer reconstructed a retained caller local:\n%s", response.Code)
	}
}

func TestClientRootLoweringRetainsMixedGenericRenderImport(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/mixed-client-root.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { render } from "@exactjs/dom";
			function Panel() { return () => <p>ready</p>; }
			export function mount(container: Element, operation: unknown) {
				render(<Panel />, container);
				render(operation, container);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`import { render } from "@exactjs/dom";`,
		`renderCompiledComponentRoot`,
		`render(operation, container);`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("mixed root rendering omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestClientRootLoweringSelectsCompiledProgramAlias(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/intrinsic-client-root.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { render } from "@exactjs/dom";
			export function mount(container: Element) {
				const tree = (<section><button>ready</button></section>);
				render(tree, container);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `__exactRenderCompiledProgramRoot(tree, container);`) ||
		strings.Contains(response.Code, `render(tree, container);`) {
		t.Fatalf("compiled program alias did not select the render-program root entry:\n%s", response.Code)
	}
}

func TestClientRootLoweringScopesSameNamedOperationAliases(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/scoped-client-roots.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { render } from "@exactjs/dom";
			function Panel() { return () => <p>ready</p>; }
			export function mountComponent(container: Element) {
				const tree = <Panel />;
				render(tree, container);
			}
			export function mountIntrinsic(container: Element) {
				const tree = <section>ready</section>;
				render(tree, container);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Count(response.Code, `__exactRenderCompiledRoot(tree, container);`) != 1 ||
		strings.Count(response.Code, `__exactRenderCompiledProgramRoot(tree, container);`) != 1 ||
		strings.Contains(response.Code, `render(tree, container);`) {
		t.Fatalf("same-named operation aliases lost lexical identity:\n%s", response.Code)
	}
}

func TestClientRootLoweringSelectsEnhancedIntrinsicRoot(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/enhanced-intrinsic-root.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { createEnhancementNode } from "@exactjs/core";
			import { render } from "@exactjs/dom";
			export function mount(container: Element, root: unknown) {
				const marker = createEnhancementNode([{ identity: "./motion#motion", props: {}, root }]);
				const tree = (<section {...{ __exactEnhancements: marker }}><button>ready</button></section>);
				render(tree, container, { enhancementCatalog: new Map() });
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `__exactRenderCompiledIntrinsicRoot(tree, container,`) ||
		strings.Contains(response.Code, `render(tree, container,`) {
		t.Fatalf("enhanced intrinsic did not select the intrinsic root entry:\n%s", response.Code)
	}
}

func TestJSXLoweringUsesFocusedReceiptsForNamedNativeRanges(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/named-ranges.tsx",
		Kind: "compile",
		Source: `import { Fragment, Target } from "@exactjs/core";
			export function Panel() {
				return () => <Fragment><Target className="surface"><span>Ready</span></Target></Fragment>;
			}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledFragmentReceipt as __exactFragment`,
		`createCompiledTargetReceipt as __exactTarget`,
		`__exactFragment({}, __exactTarget({ className: "surface" }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("named native range output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "createCompiledVNode") {
		t.Fatalf("named native range selected the generic VNode helper:\n%s", response.Code)
	}
}

func TestJSXLoweringRepublishesReactiveTransparentRangeAttributes(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "C:/tmp/reactive-transparent-range.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `import { createEnhancementNode } from "@exactjs/core";
			function attributes(value: string) {
				return { __exactEnhancements: createEnhancementNode([{ identity: "./motion.js#motion", props: { value } }]) };
			}
			export function Panel(this: Component<{ value: string }>) {
				this.state.value = "initial";
				return () => <_ {...attributes(this.state.value)}><button>Ready</button></_>;
			}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledFragmentReceipt as __exactFragment`,
		`createCompiledChildRangeReceipt as __exactDynamic`,
		`__exactDynamic(() => __exactFragment({ ...attributes(__exactReadState(this.state, 0)`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("reactive transparent range omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestJSXLoweringUsesFocusedReceiptForPortal(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/portal.tsx",
		Kind: "compile",
		Source: `import { Portal } from "@exactjs/core";
			export function Panel(props: { target: Element }) {
				return () => <Portal target={props.target}><span>Ready</span></Portal>;
			}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledPortalReceipt as __exactPortalReceipt`,
		`__exactPortalReceipt({ target: __exactForwardedExpression(() => props.target) }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("portal output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "createCompiledVNode") {
		t.Fatalf("portal selected the generic VNode helper:\n%s", response.Code)
	}
}

func TestJSXLoweringUsesFocusedReceiptsForNamedServerStructures(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/server-structures.tsx",
		Kind: "compile",
		Source: `import { ServerBoundary, ServerSlot } from "@exactjs/core";
			export function Panel() {
				return () => <ServerBoundary id="shell" name="Shell" props={{}}><ServerSlot id="child"><span>Ready</span></ServerSlot></ServerBoundary>;
			}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledServerBoundaryReceipt as __exactBoundaryReceipt`,
		`createCompiledServerSlotReceipt as __exactServerSlotReceipt`,
		`__exactBoundaryReceipt({ id: "shell", name: "Shell", props: __exactExpression(() => ({})) }`,
		`__exactServerSlotReceipt({ id: "child" }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("named server structure output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "createCompiledVNode") {
		t.Fatalf("named server structure selected the generic VNode helper:\n%s", response.Code)
	}
}

func TestJSXLoweringSelectsLazyCompiledEventInteractions(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/direct-interaction.tsx",
		Kind: "compile",
		Source: `export function Counter(this: Component<{ count: number }>) {
			return () => <button onClick={() => this.state.count++}>Count</button>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `"__exactClosedInteraction:onClick"`) {
		t.Fatalf("closed event handler did not select the direct interaction lane:\n%s", response.Code)
	}
}

func TestJSXLoweringRetainsEventObjectsForObservableHandlerParameters(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/event-argument.tsx",
		Kind: "compile",
		Source: `export function Counter(this: Component<{}>) {
			function click(event: MouseEvent) { console.log(event.currentTarget); }
			return () => <button onClick={click}>Count</button>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `"__exactDirectInteraction:onClick"`) ||
		strings.Contains(response.Code, `"__exactClosedInteraction:onClick"`) {
		t.Fatalf("event-observing handler lost its complete event lane:\n%s", response.Code)
	}
}

func TestJSXLoweringRetainsImplicitArgumentsReads(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/event-arguments.tsx",
		Kind: "compile",
		Source: `export function Counter(this: Component<{}>) {
			function click() { console.log(arguments[0]); }
			return () => <button onClick={click}>Count</button>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `"__exactDirectInteraction:onClick"`) ||
		strings.Contains(response.Code, `"__exactClosedInteraction:onClick"`) {
		t.Fatalf("arguments-observing handler lost its complete event lane:\n%s", response.Code)
	}
}

func TestJSXLoweringKeepsComponentCallbacksOutsideTheNativeEventLane(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/general-interaction.tsx",
		Kind: "compile",
		Source: `declare function Button(props: { onClick(): void }): unknown;
		export function Link(this: Component<{}>, props: { navigate(): void }) {
			return () => <Button onClick={props.navigate} />;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, `"__exactDirectInteraction:onClick"`) {
		t.Fatalf("component callback prop incorrectly selected the native event lane:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `onClick:`) {
		t.Fatalf("component callback prop was not preserved:\n%s", response.Code)
	}
}

func TestModuleDeclarativeCollectionRetainsReactiveComponentProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/declarative-component-props.tsx",
		Kind: "compile",
		Source: `const columns = [{ id: "todo" }, { id: "done" }];
			declare function Column(props: { id: string; placement?: { status: string } }): unknown;
			export function Board(this: Component<{ placement?: { status: string } }>) {
				return () => <section>{columns.map(column => (
					<Column id={column.id} placement={this.state.placement} />
				))}</section>;
			}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(
		response.Code,
		`placement: __exactIndexedExpression(this.state, 0)`,
	) {
		t.Fatalf("module declarative component prop lost reactivity:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `id: __exactExpression(() => column.id)`) {
		t.Fatalf("module collection value gained a redundant subscription:\n%s", response.Code)
	}
}
