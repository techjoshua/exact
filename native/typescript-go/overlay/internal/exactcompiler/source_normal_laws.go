package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceNormalWriteContext supplies facts from one evaluation domain. The actual
// domain validates installed initialization/operation ownership. A parametric
// domain supplies only independently completed recipe facts. Missing facts stay
// Top. Callbacks are borrowed for this fold and are never cached or published.
type sourceNormalWriteContext struct {
	charge    func(*ast.Node) bool
	component func(*ast.Node) sourceWriteVerdict
	read      func(*ast.Node) sourceWriteVerdict
	operation func(*ast.Node) sourceWriteVerdict
}

// sourceNormalWriteEffect is the shared mutation law for cached syntax folds.
// It performs no acquisition, invocation, AST traversal or publication. Sequence
// joins charge every visited child and refuse missing, unknown or unpaid facts.
// This scalar is independent of value, placement and completion observations.
func sourceNormalWriteEffect(fold sourceNormalFold, context sourceNormalWriteContext) sourceWriteVerdict {
	node := fold.node
	if node == nil || fold.kind == sourceNormalEnter {
		return sourceWriteTop
	}
	join := func() sourceWriteVerdict {
		for ordinal, child := range fold.children {
			if context.charge == nil || !context.charge(child) {
				return sourceWriteTop
			}
			if ordinal < len(fold.erasedChildren) && fold.erasedChildren[ordinal] {
				continue
			}
			if context.component == nil || context.component(child) != sourceWriteNoWrites {
				return sourceWriteTop
			}
		}
		return sourceWriteNoWrites
	}
	if sourceNormalStructural(node) {
		return sourceWriteNoWrites
	}
	if fold.creation {
		if (node.Name() == nil || !ast.IsComputedPropertyName(node.Name())) && (ast.IsFunctionDeclaration(node) && !ast.HasSyntacticModifier(node, ast.ModifierFlagsAsync) && node.AsFunctionDeclaration().AsteriskToken == nil || ast.IsGetAccessorDeclaration(node) || ast.IsArrowFunction(node) && !ast.HasSyntacticModifier(node, ast.ModifierFlagsAsync) || ast.IsFunctionExpression(node) && !ast.HasSyntacticModifier(node, ast.ModifierFlagsAsync) || ast.IsMethodDeclaration(node) && !ast.HasSyntacticModifier(node, ast.ModifierFlagsAsync) && node.AsMethodDeclaration().AsteriskToken == nil) {
			return join()
		}
		return sourceWriteTop
	}
	switch node.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return sourceWriteNoWrites
	case ast.KindIdentifier:
		if context.read != nil {
			return context.read(node)
		}
	case ast.KindSourceFile, ast.KindFunctionDeclaration, ast.KindGetAccessor, ast.KindSetAccessor, ast.KindBlock, ast.KindExpressionStatement, ast.KindReturnStatement, ast.KindVoidExpression, ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindTypeAssertionExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression, ast.KindObjectLiteralExpression:
		return join()
	case ast.KindPropertyAssignment:
		if name := node.Name(); name != nil && !ast.IsComputedPropertyName(name) && name.Text() != "__proto__" {
			return join()
		}
	case ast.KindPropertyAccessExpression, ast.KindElementAccessExpression, ast.KindCallExpression:
		if context.operation != nil {
			return context.operation(node)
		}
	}
	return sourceWriteTop
}
