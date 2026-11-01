package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// An implicit Get has the supplied receiver and genuinely zero arguments. This
// owner-unit boundary protects defaults, empty rest and restoration without
// pretending that an AST endpoint establishes a dynamic getter occurrence.
func TestOperationGetInputDomain(t *testing.T) {
	request := Request{Kind: "analyze", ID: "/virtual/operation-get.ts", Diagnostics: "semantic", Source: `function getter(this:unknown,value=1,...rest:unknown[]){return value}const receiver={kind:"audit"};export {getter,receiver};`}
	session := NewSession()
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid source: %#v", response)
	}
	for _, project := range session.projects {
		var getter, receiver *ast.Node
		walkNode(project.program.GetSourceFile(request.ID).AsNode(), func(node *ast.Node) bool {
			if ast.IsFunctionDeclaration(node) {
				getter = node
			}
			if ast.IsObjectLiteralExpression(node) {
				receiver = node
			}
			return true
		})
		owner := project.callableCache.owner.values
		query := sourceValueQuery{owner: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
		result := accessorCandidates{}
		inputs := query.bindGetInputs(getter, receiver, sourceValue{node: receiver}, nil, &result)
		if result.opaque || inputs.get == nil || inputs.invocation != nil || len(inputs.bindings[0]) != 1 || inputs.bindings[0][0].node != receiver {
			t.Fatalf("Get receiver domain: %#v", inputs)
		}
		valueID := ast.GetSymbolId(owner.checker.GetSymbolAtLocation(getter.Parameters()[1].Name()))
		restID := ast.GetSymbolId(owner.checker.GetSymbolAtLocation(getter.Parameters()[2].Name()))
		if len(inputs.bindings[valueID]) != 1 || inputs.bindings[valueID][0].node == nil || inputs.bindings[valueID][0].node.Text() != "1" {
			t.Error("zero arguments lost default")
		}
		if len(inputs.bindings[restID]) != 1 || inputs.bindings[restID][0].rest == nil || len(inputs.bindings[restID][0].rest) != 0 {
			t.Error("zero arguments lost empty rest")
		}
		query.remaining = 0
		result = accessorCandidates{}
		query.bindGetInputs(getter, receiver, sourceValue{node: receiver}, nil, &result)
		if result.opaque {
			t.Error("advisory allowance changed Get input binding")
		}
	}
}
