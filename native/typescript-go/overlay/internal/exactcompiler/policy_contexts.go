package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Context lifetime supplies server residency unless an explicit keep option owns it.
// Read native option values, never substrings inside unrelated properties or comments.
func contextDataPolicy(options *ast.Node, c *checker.Checker) (DataPolicy, string) {
	if keep := policyContextOption(options, "keep", c, make(map[ast.SymbolId]bool)); keep != "" {
		return dataPolicy(keep), "context-option"
	}
	scope := policyContextOption(options, "scope", c, make(map[ast.SymbolId]bool))
	if scope == "request" || scope == "application" {
		return dataPolicy("server"), "inference"
	}
	return dataPolicy("shared"), "inference"
}

// Resolve immutable option aliases and literal properties before consulting the selected type.
// Object spreads follow source order so later explicit options replace earlier ones.
func policyContextOption(options *ast.Node, name string, c *checker.Checker, seen map[ast.SymbolId]bool) string {
	options = unwrapSourceCallableReference(options)
	if options == nil {
		return ""
	}
	if ast.IsIdentifier(options) {
		symbol := c.GetSymbolAtLocation(options)
		if symbol != nil && !seen[ast.GetSymbolId(symbol)] {
			seen[ast.GetSymbolId(symbol)] = true
			defer delete(seen, ast.GetSymbolId(symbol))
			for _, declaration := range symbol.Declarations {
				if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
					if result := policyContextOption(declaration.Initializer(), name, c, seen); result != "" {
						return result
					}
				}
			}
		}
	}
	if ast.IsObjectLiteralExpression(options) {
		result := ""
		for _, property := range options.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsSpreadAssignment(property) {
				if selected := policyContextOption(property.AsSpreadAssignment().Expression, name, c, seen); selected != "" {
					result = selected
				}
			} else if key, known := policyStaticPropertyName(property.Name(), c); known && key == name {
				var value *ast.Node
				if ast.IsShorthandPropertyAssignment(property) {
					value = property.Name()
				} else if ast.IsPropertyAssignment(property) {
					value = property.AsPropertyAssignment().Initializer
				}
				result = policyContextLiteral(value, c)
			}
		}
		return result
	}
	value := c.GetTypeAtLocation(options)
	if property := c.GetPropertyOfType(value, name); property != nil {
		selected := c.GetTypeOfSymbol(property)
		if selected != nil && selected.Flags()&checker.TypeFlagsStringLiteral != 0 {
			if result, valid := selected.AsLiteralType().Value().(string); valid {
				return result
			}
		}
	}
	return ""
}

func policyContextLiteral(value *ast.Node, c *checker.Checker) string {
	value = unwrapSourceCallableReference(value)
	if value == nil {
		return ""
	}
	if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
		return value.Text()
	}
	selected := c.GetTypeAtLocation(value)
	if selected != nil && selected.Flags()&checker.TypeFlagsStringLiteral != 0 {
		if result, valid := selected.AsLiteralType().Value().(string); valid {
			return result
		}
	}
	return ""
}
