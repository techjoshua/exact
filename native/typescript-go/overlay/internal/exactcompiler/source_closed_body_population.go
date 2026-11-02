package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// finalizedBodyProof validates the immutable result association only. The live
// source/candidate handoff is separate and cannot be reconstructed from it.
func (f *closedCallableProof) finalizedBodyProof(o *languageOwner) bool {
	if f == nil || !f.captureLayoutValid() || f.arrow == nil || !closedCallableNode(f.arrow) || f.plan == nil || f.plan.parameters == nil || !f.plan.parameters.validProjection() || f.parameters != len(f.plan.parameters.declarations) || o == nil || f.namespace != o || f.generation != o.generation || o.disposed || f.source == nil || f.plan == nil || f.plan.recipe != f.entry || f.plan.parameters == nil || f.plan.parameters.arrow != f.arrow || f.mapping != f.plan.parameters || ast.GetSourceFileOfNode(f.arrow) != f.source || f.entry == nil || f.entry.body != f.arrow || f.parameters != len(f.plan.parameters.declarations) || f.parameters != len(f.entry.declarations) {
		return false
	}
	for i, d := range f.entry.declarations {
		if f.plan.parameters.declarations[i] != d {
			return false
		}
	}
	return true
}

func expressionLiteralNode(n *ast.Node) bool {
	if n == nil {
		return false
	}
	switch n.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	}
	return false
}
