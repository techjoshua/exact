package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
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
		{"RHS getter", `function make(){const input={get value(){return ()=>document.title}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
		{"unknown sibling", `declare function foreign():()=>string;declare const choose:boolean;function make(){const box={set work(next:()=>string){next()}};box.work=choose?()=>document.title:foreign();return 'safe'}export const value=make();`, "client"},
		{"throwing RHS donor", `function make(){const input={get value():()=>string{document.title;throw Error('stop')}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
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
