package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// A const binding does not freeze its object. Only direct read-only lookup uses prove that
// a category map or PluralRules instance can be replaced by an extracted static descriptor.
func intlConstLookupUnmodified(symbol *ast.Symbol, typeChecker *checker.Checker) bool {
	declaration := symbol.Declarations[0]
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil {
		return false
	}
	valid := true
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !valid || ast.IsTypeNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		actual := typeChecker.GetSymbolAtLocation(node)
		if actual == nil || ast.GetSymbolId(actual) != ast.GetSymbolId(symbol) {
			return true
		}
		parent := node.Parent
		if parent == nil || !((ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == node) || (ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == node)) {
			valid = false
			return false
		}
		if nativeAssignmentPatternTarget(parent) {
			valid = false
			return false
		}
		use := parent.Parent
		if use != nil && ast.IsCallExpression(use) && use.AsCallExpression().Expression == parent {
			if !ast.IsPropertyAccessExpression(parent) {
				valid = false
				return false
			}
			name := parent.AsPropertyAccessExpression().Name().Text()
			if name != "select" && name != "selectRange" {
				valid = false
				return false
			}
		} else if use != nil && ((ast.IsBinaryExpression(use) && ast.IsAssignmentExpression(use, false) && use.AsBinaryExpression().Left == parent) || ast.IsPrefixUnaryExpression(use) || ast.IsPostfixUnaryExpression(use) || ast.IsDeleteExpression(use) || ast.IsPropertyAccessExpression(use) || ast.IsElementAccessExpression(use)) {
			valid = false
			return false
		}
		return true
	})
	return valid
}
