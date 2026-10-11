package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestPortableTaskCaptureTypeScopes(t *testing.T) {
	factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	reference := func(name string) *ast.Node {
		return factory.NewTypeReferenceNode(factory.NewIdentifier(name), nil)
	}
	callable := func(constraint, result *ast.Node) *ast.Node {
		parameter := factory.NewTypeParameterDeclaration(nil, factory.NewIdentifier("T"), constraint, nil, nil)
		return factory.NewFunctionTypeNode(factory.NewNodeList([]*ast.Node{parameter}), nil, result)
	}
	local := callable(nil, reference("T"))
	for _, candidate := range []struct {
		name     string
		typeNode *ast.Node
		portable bool
	}{
		{"primitive", factory.NewKeywordTypeNode(ast.KindStringKeyword), true},
		{"enclosing name", reference("T"), false},
		{"callable parameter", local, true},
		{"source-owned constraint", callable(reference("Source"), reference("T")), false},
		{"source-owned return", callable(nil, reference("Source")), false},
		{"sibling scope", factory.NewUnionTypeNode(factory.NewNodeList([]*ast.Node{local, reference("T")})), false},
		{"value query", factory.NewTypeQueryNode(factory.NewIdentifier("value"), nil), false},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			if portableTaskCaptureType(candidate.typeNode) != candidate.portable {
				t.Fatal("capture annotation escaped its lexical ownership")
			}
		})
	}
}
