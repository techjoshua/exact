package exactcompiler

import (
	"strings"
	"testing"
)

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
		`createCompiledVNode as __exactVNode`,
		`createExpression as __exactExpression`,
		`createDynamicChild as __exactDynamic`,
		`__exactVNode("button"`,
		`"data-exact-id": "xpQ67SWvp8CKhdHZwKUD67e"`,
		`title: __exactExpression(() => this.state.count)`,
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
		`placement: __exactExpression(() => this.state.placement)`,
	) {
		t.Fatalf("module declarative component prop lost reactivity:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `id: __exactExpression(() => column.id)`) {
		t.Fatalf("module collection value gained a redundant subscription:\n%s", response.Code)
	}
}
