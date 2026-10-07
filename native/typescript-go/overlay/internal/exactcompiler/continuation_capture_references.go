package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// projectContinuationCaptureReferences restores analyzed setup values inside reconstructed helpers.
// Reference spans retain lexical identity across nested callable scopes. Receiver rewriting remains
// separate so ordinary helper functions preserve their own this binding.
func projectContinuationCaptureReferences(factory *printer.NodeFactory, source *ast.Node, references map[string]string) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if name, exists := references[nodeSpanKey(node)]; exists {
			return factory.NewIdentifier(name)
		}
		return visitor.VisitEachChild(node)
	}, &factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(source)
}
