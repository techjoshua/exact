package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// authoredNarrowedType preserves a checker-proven read type when compiler-created closures or
// repeated derived getters separate that read from its authored guard. It never narrows a read
// whose source checker type still includes the unsafe alternative.
func (lowering *jsxLowering) authoredNarrowedType(node *ast.Node) *ast.Node {
	if lowering.checker == nil || ast.NodeIsSynthesized(node) || ast.GetSourceFileOfNode(node) == nil {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return nil
	}
	declaration := symbol.ValueDeclaration.Name()
	if declaration == nil {
		return nil
	}
	declared := lowering.checker.GetTypeAtLocation(declaration)
	read := lowering.checker.GetTypeAtLocation(node)
	if declared.Flags()&checker.TypeFlagsUnion == 0 || declared == read || read.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0 {
		return nil
	}
	return lowering.checker.TypeToTypeNode(read, node, nodebuilder.FlagsNoTruncation, nil)
}

// isDeleteOperand excludes property references whose identity must survive checking projection.
// Parentheses preserve a delete target, but a narrowing assertion does not.
func isDeleteOperand(node *ast.Node) bool {
	parent := node.Parent
	for parent != nil && ast.IsParenthesizedExpression(parent) {
		parent = parent.Parent
	}
	return parent != nil && ast.IsDeleteExpression(parent)
}
