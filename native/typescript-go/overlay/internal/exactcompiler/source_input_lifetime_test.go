package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Source instantiation retains parameter/default decisions without issuing normal
// operation lifetime or consumed-entry authority for the symbolic body.
func TestSourceInputPlanDoesNotStartNormalLifetime(t *testing.T) {
	source := `function read(input:{value:string},label="safe"){return input.value+label}export const value=read({value:"safe"});`
	request := Request{Kind: "analyze", ID: "/virtual/source-input-lifetime.ts", Source: source, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var declaration, call *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		if ast.IsCallExpression(node) {
			call = node
		}
		return true
	})
	if declaration == nil || call == nil {
		t.Fatal("missing checked input witness")
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	query := newSourceDependencyQuery(call, generation.checker, owner, declaration)
	result := accessorCandidates{}
	inputs := query.bindInputs(declaration, call, nil, &result)
	if inputs.operationLifetime != nil || inputs.dispatcher != nil || inputs.population != nil {
		t.Fatal("symbolic input binding issued normal lifetime scaffolding")
	}
	parameters := declaration.Parameters()
	for _, parameter := range parameters {
		symbol := generation.checker.GetSymbolAtLocation(parameter.Name())
		if symbol == nil || len(inputs.bindings[ast.GetSymbolId(symbol)]) == 0 {
			t.Fatal("lost actual/default source binding")
		}
		values := inputs.bindings[ast.GetSymbolId(symbol)]
		if len(values) != 1 || values[0].node == nil {
			t.Fatal("known actual/default became unresolved")
		}
		if parameter.Initializer() != nil && (values[0].node.Kind != ast.KindStringLiteral || values[0].node.Text() != "safe") {
			t.Fatal("activated default lost its supplied literal")
		}
	}
	if len(inputs.defaults) == 0 || len(inputs.order) == 0 {
		t.Fatal("lost activated default context")
	}
	if !query.executeInputs(declaration, inputs.bindings, &result, nil, inputs) {
		t.Fatal("source body not instantiated")
	}
	if inputs.operationLifetime != nil || inputs.dispatcher != nil || inputs.population != nil || inputs.consumedCall != nil || inputs.operations != nil {
		t.Fatal("source summary published a normal entry or operation")
	}
	if query.inputs != nil || query.operation != nil || query.invoking != nil || query.reading != call {
		t.Fatal("source input/read scope escaped")
	}
	if len(result.inputs) == 0 {
		t.Fatal("source effect consumer lost its per-use input plan")
	}

	// The precise binding consumer keeps its existing lifecycle and guards.
	precise := &sourceValueQuery{owner: owner.values, executable: owner, active: make(map[*ast.Node]bool)}
	normal := precise.bindInputs(declaration, call, nil, &accessorCandidates{})
	defer releaseNormalOperations(normal)
	if normal.operationLifetime == nil || normal.dispatcher == nil {
		t.Fatal("precise input binding lost its normal lifecycle")
	}
	lifetime, dispatcher := normal.operationLifetime, normal.dispatcher
	if !query.executeInputs(declaration, normal.bindings, &accessorCandidates{}, nil, normal) {
		t.Fatal("source consumer refused supplied input bindings")
	}
	if normal.operationLifetime != lifetime || normal.dispatcher != dispatcher {
		t.Fatal("source consumer released a lifetime owned by its precise caller")
	}
	if normal.population != nil || normal.consumedCall != nil {
		t.Fatal("source consumer invented normal entry on supplied inputs")
	}
}
