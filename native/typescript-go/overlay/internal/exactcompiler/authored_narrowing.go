package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// authoredNarrowedType preserves a checker-proven read type when compiler-created closures or
// repeated derived getters separate that read from its authored guard. Server slot inlining also
// removes a closure boundary, so preserve an unchanged state union read against setup-only narrowing.
// These assertions erase at runtime. This never narrows a read
// whose source checker type still includes the unsafe alternative.
func (lowering *jsxLowering) authoredNarrowedType(node *ast.Node) *ast.Node {
	if lowering.checker == nil || lowering.clientIslandPropsSlots != nil || ast.NodeIsSynthesized(node) || ast.GetSourceFileOfNode(node) == nil {
		return nil
	}
	// Wrapping a continuing optional segment introduces a parenthesized chain
	// boundary. Preserve the type at its receiver or terminal value instead.
	if node.Flags&ast.NodeFlagsOptionalChain != 0 && optionalChainContinuesThrough(node.Parent, node) {
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
	if declared.Flags()&checker.TypeFlagsUnion == 0 || (declared == read && (lowering.target != TargetServer || !lowering.authoredStateRead(node))) || read.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0 {
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

// authoredStateRead recognizes an exact state read and its receiver prefixes.
// A nested read's analysis span covers the base union whose flow must survive
// closure elimination. Top-level indexed slots alone omit these nested prefixes.
func (lowering *jsxLowering) authoredStateRead(node *ast.Node) bool {
	for _, read := range lowering.stateReads {
		if read.Confidence == "exact" && read.Start == node.Pos() && read.Length >= node.End()-node.Pos() {
			return true
		}
	}
	return false
}

// authoredServerReadBaseType removes setup flow before reinstating an authored guard.
// Widening to the declared union first avoids asserting directly between disjoint
// setup and render variants. Both assertions are compiler proofs and erase at runtime.
func (lowering *jsxLowering) authoredServerReadBaseType(node *ast.Node) *ast.Node {
	if lowering.target != TargetServer || !lowering.authoredStateRead(node) {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil || symbol.ValueDeclaration == nil || symbol.ValueDeclaration.Name() == nil {
		return nil
	}
	declared := lowering.checker.GetTypeAtLocation(symbol.ValueDeclaration.Name())
	if declared.Flags()&checker.TypeFlagsUnion == 0 || declared == lowering.checker.GetTypeAtLocation(node) {
		return nil
	}
	return lowering.checker.TypeToTypeNode(declared, node, nodebuilder.FlagsNoTruncation, nil)
}
