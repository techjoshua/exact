package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A method input may bind its own this and lexical arrows, but cannot retarget
// an unrelated receiver while inspecting indexed source writes.
func TestSourceReceiverLexicalInputOwnership(t *testing.T) {
	const source = `export function outer(this:{mark:number}){this.mark;const value={mark:1,method(){this.mark;return()=>this.mark}};return value}`
	session := NewSession()
	request := Request{Kind: "analyze", ID: "/virtual/receiver-scope.ts", Source: source, Diagnostics: "semantic"}
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		var method, object *ast.Node
		var receivers []*ast.Node
		walkNode(project.program.GetSourceFile(request.ID).AsNode(), func(node *ast.Node) bool {
			if ast.IsMethodDeclaration(node) {
				method = node
			}
			if ast.IsObjectLiteralExpression(node) {
				object = node
			}
			if node.Kind == ast.KindThisKeyword {
				receivers = append(receivers, node)
			}
			return true
		})
		if method == nil || object == nil || len(receivers) != 3 {
			t.Fatal("receiver fixture missing")
		}
		bindings := sourceValueBindings{0: []sourceValue{{node: object}}}
		q := &sourceValueQuery{owner: project.callableCache.owner.values, inputs: &sourceValueInputs{declaration: method, bindings: bindings}, remaining: 4096, active: make(map[*ast.Node]bool)}
		for i, node := range receivers {
			values := q.origins(node, bindings, &accessorCandidates{})
			wanted := object
			if i == 0 {
				wanted = node
			}
			if len(values) != 1 || values[0].node != wanted {
				t.Fatalf("receiver %d borrowed another owner", i)
			}
		}
	}
}
