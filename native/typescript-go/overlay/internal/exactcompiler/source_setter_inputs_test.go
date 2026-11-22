package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// Set parameters consume the original assignment's values rather than the
// selected accessor's ambient captures. These are MAY effects, not Set receipts.
func TestSourceSetterInputs(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"browser callable", `function make(){const box={set work(next:()=>string){next()}};box.work=()=>document.title;return 'safe'}export const value=make();`, "client"},
		{"original lexical browser", `function make(){let selected=()=> 'safe';const box={set work(next:()=>string){selected=next},get work(){return selected}};box.work=()=>document.title;return box.work()}export const value=make();`, "client"},
		{"reverse lexical browser", `function make(){let selected=()=>document.title;const box={set work(next:()=>string){selected=next},get work(){return selected}};box.work=()=> 'safe';return box.work()}export const value=make();`, "client"},
		{"safe callable", `function make(){const box={set work(next:()=>string){next()}};box.work=()=> 'safe';return 'safe'}export const value=make();`, "isomorphic"},
		{"captured caller", `function make(input:{value:string}){const box={set work(next:()=>string){next()}};box.work=()=>input.value;return 'safe'}export const value=make({get value(){return document.title}});`, "client"},
		{"receiver", `function make(){const box={get value(){return document.title},set work(next:string){this.value}};box.work='safe';return 'safe'}export const value=make();`, "client"},
		{"pattern", `function make(){const box={set work({read}:{read:()=>string}){read()}};box.work={read:()=>document.title};return 'safe'}export const value=make();`, "client"},
		{"pattern default", `function make(){const box={set work({read=()=>document.title}:{read?:()=>string}){read()}};box.work={};return 'safe'}export const value=make();`, "client"},
		{"pattern default bypass", `function make(){const box={set work({read=()=>document.title}:{read?:()=>string}){read()}};box.work={read:()=> 'safe'};return 'safe'}export const value=make();`, "isomorphic"},
		{"RHS getter", `function make(){const input={get value(){return ()=>document.title}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
		{"unknown sibling", `declare function foreign():()=>string;declare const choose:boolean;function make(){const box={set work(next:()=>string){next()}};box.work=choose?()=>document.title:foreign();return 'safe'}export const value=make();`, "client"},
		{"throwing RHS donor", `function make(){const input={get value():()=>string{document.title;throw Error('stop')}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) {
			if row.name == "original lexical browser" || row.name == "reverse lexical browser" || row.name == "unknown sibling" || row.name == "throwing RHS donor" {
				assertSourceSetterResidual(t, row.source)
			} else {
				assertClosurePlacement(t, row.source, row.placement)
			}
		})
	}
}

// Receiver writes require live source implicit-body admission in addition to
// parameter substitution. A captured write independently checks the input map.
func TestSourceSetterReceiverWriteMapping(t *testing.T) {
	const source = `declare function marker():void;const captured={field:0};export function invoke(input:{field:number}){const box={field:0,set work(next:number){this.field=next;input.field=next}};box.work=1;marker()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		var selected, captured, receiver, parameter *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && node.Name() != nil && node.Name().Text() == "captured" {
				captured = node.Initializer()
			}
			if ast.IsVariableDeclaration(node) && node.Name() != nil && node.Name().Text() == "box" {
				receiver = node.Initializer()
			}
			if ast.IsParameterDeclaration(node) && node.Name() != nil && node.Name().Text() == "input" {
				parameter = node.Name()
			}
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "work" {
				selected = node
			}
			return true
		})
		if selected == nil || captured == nil || receiver == nil || parameter == nil {
			t.Fatal("missing source endpoints")
		}
		symbol := q.owner.checker.GetSymbolAtLocation(parameter)
		bindings := sourceValueBindings{ast.GetSymbolId(symbol): {{node: captured}}}
		part := q.evaluatedSourceAccessors(selected, bindings)
		if q.setterInput != nil || q.sourceReceiver != nil {
			t.Fatal("source Set association survived its selected consumer")
		}
		q.dependenciesOnly = false
		if q.sourceSetterRequest(selected, accessorSet, bindings) != nil {
			t.Fatal("normal query issued a source Set mapping")
		}
		q.dependenciesOnly = true
		seenReceiver, seenCapture := false, false
		for _, write := range part.writes {
			if len(write.value.path) != 1 || write.value.path[0] != "field" {
				continue
			}
			seenReceiver = seenReceiver || write.value.node == receiver
			seenCapture = seenCapture || write.value.node == captured
		}
		if !seenReceiver || !seenCapture {
			t.Fatalf("receiver write=%v captured write=%v", seenReceiver, seenCapture)
		}
	})
}

// A MAY association preserves known donors without authorizing an unresolved
// module initializer on a conflicting target. Closed use mappings are not library facts.
func assertSourceSetterResidual(t *testing.T, source string) {
	t.Helper()
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/setter-residual.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, r, source, true)
	if !browser || !unknown {
		t.Fatalf("browser=%v unknown=%v, want both", browser, unknown)
	}
	for _, e := range r.Analysis.Exports {
		if e.Name == "value" && e.Placement != "unknown" {
			t.Fatalf("unresolved placement %s", e.Placement)
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		out := session.Execute(Request{Kind: "compile", ID: "/virtual/setter-residual.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if target == TargetClient {
			if out.Error != "" || hasErrorDiagnostic(out.Diagnostics) || out.Code == "" {
				t.Fatalf("browser artifact refused: %s %#v", out.Error, out.Diagnostics)
			}
		} else if !hasDiagnosticCode(out.Diagnostics, "EXACT2101") || out.Code != "" {
			t.Fatalf("unresolved server target was admitted: %s %#v", out.Error, out.Diagnostics)
		}
	}
}

// An observed safe installation may specialize that application use. The
// exported install body must still retain the unknown caller's callable input.
func TestSourceSetterOpenLibrary(t *testing.T) {
	const source = `export function install(input:()=>string){const box={set work(next:()=>string){next()}};box.work=input;return 'safe'}export const value=install(()=> 'safe');`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/setter-library.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	found := false
	for _, fact := range r.Analysis.Callables {
		if fact.Name != "install" {
			continue
		}
		for _, effect := range fact.EffectSources {
			found = found || effect.Environment == "unknown"
		}
	}
	if !found {
		t.Fatal("observed safe caller erased the open-library unknown callable")
	}
}

// A component's downstream read follows the setter's stored value across the
// helper return while keeping the field's original acquisition position.
func TestComponentReadsReturnedSetterStorage(t *testing.T) {
	const definition = "function read() { const box = { field: { value: 'safe' }, other: { value: 'safe' }, set store(value: { value: string }) { this.SLOT = value; } }; "
	const store = "box.store = { get value() { return document.title; } }; "
	const overwrite = "box.field = { value: 'safe' }; "
	for _, row := range []struct {
		name, slot, statements, use string
		browser                     bool
	}{
		{"read inside helper", "field", store + "return box.field.value;", "read()", true},
		{"returned field", "field", store + "return box.field;", "read().value", true},
		{"returned receiver", "field", store + "return box;", "read().field.value", true},
		{"saved after Set", "field", store + "const saved = box.field; return saved;", "read().value", true},
		{"saved before Set", "field", "const saved = box.field; " + store + "return saved;", "read().value", false},
		{"saved receiver", "field", "const saved = box; " + store + "return saved;", "read().field.value", true},
		{"overwritten field", "field", store + overwrite + "return box.field;", "read().value", false},
		{"overwritten receiver", "field", store + overwrite + "return box;", "read().field.value", false},
		{"disjoint field", "other", store + "return box;", "read().field.value", false},
		{"dormant installer", "field", "function install() { " + store + " } return box;", "read().field.value", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := strings.Replace(definition, "SLOT", row.slot, 1) + row.statements + " }"
			checkFormalGetterComponent(t, source, row.use, row.browser)
		})
	}
}
