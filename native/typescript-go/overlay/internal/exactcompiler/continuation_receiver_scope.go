package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// continuationOwnedReceiverNode preserves callable and class receivers during executor capture.
// Computed member names evaluate in the enclosing scope, while bodies and field initializers
// establish their own receiver. Arrow functions inherit the surrounding receiver.
func continuationOwnedReceiverNode(factory *printer.NodeFactory, node, work *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if ast.IsClassStaticBlockDeclaration(node) {
		return node
	}
	if ast.IsPropertyDeclaration(node) {
		field := node.AsPropertyDeclaration()
		return factory.UpdatePropertyDeclaration(field, field.Modifiers(), visitor.VisitNode(field.Name()), field.PostfixToken, field.Type, field.Initializer)
	}
	if ast.IsMethodDeclaration(node) {
		method := node.AsMethodDeclaration()
		return factory.UpdateMethodDeclaration(method, method.Modifiers(), method.AsteriskToken, visitor.VisitNode(method.Name()), method.PostfixToken, method.TypeParameters, method.Parameters, method.Type, method.FullSignature, method.Body)
	}
	if ast.IsGetAccessorDeclaration(node) {
		method := node.AsGetAccessorDeclaration()
		return factory.UpdateGetAccessorDeclaration(method, method.Modifiers(), visitor.VisitNode(method.Name()), method.TypeParameters, method.Parameters, method.Type, method.FullSignature, method.Body)
	}
	if ast.IsSetAccessorDeclaration(node) {
		method := node.AsSetAccessorDeclaration()
		return factory.UpdateSetAccessorDeclaration(method, method.Modifiers(), visitor.VisitNode(method.Name()), method.TypeParameters, method.Parameters, method.Type, method.FullSignature, method.Body)
	}
	if node != work && ast.IsFunctionLike(node) && !ast.IsArrowFunction(node) {
		return node
	}
	return nil
}
