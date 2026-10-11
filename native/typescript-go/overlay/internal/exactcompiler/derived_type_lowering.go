package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// lowerDerivedTypeQueries preserves authored value types after a local becomes a reactive
// cell. Type subtrees use this dedicated visitor, never the executable-expression visitor.
func (lowering *jsxLowering) lowerDerivedTypeQueries(root *ast.Node) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if !ast.IsTypeQueryNode(node) || lowering.directServerFrameComponent(node) {
			return visitor.VisitEachChild(node)
		}
		query := node.AsTypeQueryNode()
		name := query.ExprName
		for ast.IsQualifiedName(name) {
			qualified := name.AsQualifiedName()
			name = qualified.Left
		}
		if !ast.IsIdentifier(name) {
			return node
		}
		if _, derived := lowering.derivedBindingAtReference(name); !derived {
			return node
		}
		// The authored checker owns generic instantiation and selected member types. Do not
		// introduce a utility type that authored aliases could shadow or drop type arguments.
		if value := lowering.checker.TypeToTypeNode(lowering.checker.GetTypeAtLocation(node), node,
			nodebuilder.FlagsNoTruncation|nodebuilder.FlagsInTypeAlias, nil); value != nil {
			return value
		}
		return node
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(root)
}
