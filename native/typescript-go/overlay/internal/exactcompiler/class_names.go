package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// analyzeClassNames validates compiler-owned conditional class syntax before
// JSX lowering. Dynamic class values remain intentionally opaque: only
// collisions that are provable from authored static tokens are rejected.
func analyzeClassNames(sourceFile *ast.SourceFile) []Diagnostic {
	diagnostics := []Diagnostic{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node) {
			return true
		}
		attributes := node.Attributes()
		if attributes == nil || !jsxHasConditionalClassName(attributes) {
			return true
		}
		tag := strings.TrimSpace(sourceText(sourceFile, openingTag(node)))
		if !jsxIntrinsic(tag) {
			diagnostics = append(
				diagnostics,
				classNameDiagnostic(
					node,
					"className:name is supported on intrinsic and custom elements, not component props",
				),
			)
			return true
		}

		staticTokens := map[string]*ast.Node{}
		conditional := []*ast.Node{}
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				diagnostics = append(
					diagnostics,
					classNameDiagnostic(
						property,
						"prop spreads cannot be combined with className:name until their ordered class contribution can be preserved",
					),
				)
				continue
			}
			attribute := property.AsJsxAttribute()
			name := attribute.Name()
			if ast.IsJsxNamespacedName(name) {
				namespaced := name.AsJsxNamespacedName()
				if namespaced.Namespace.Text() == "className" {
					conditional = append(conditional, property)
				}
				continue
			}
			switch name.Text() {
			case "class":
				diagnostics = append(
					diagnostics,
					classNameDiagnostic(
						property,
						"use className when className:name is present",
					),
				)
			case "className":
				if value, ok := staticClassNameValue(attribute); ok {
					for _, token := range strings.Fields(value) {
						if previous, exists := staticTokens[token]; exists {
							diagnostics = append(
								diagnostics,
								classNameCollisionDiagnostic(property, token, previous),
							)
							continue
						}
						staticTokens[token] = property
					}
				}
			}
		}
		guaranteedConditional := map[string]*ast.Node{}
		for _, property := range conditional {
			attribute := property.AsJsxAttribute()
			token := attribute.Name().AsJsxNamespacedName().Name().Text()
			if previous, exists := guaranteedConditional[token]; exists &&
				!jsxAttributeAlwaysFalse(attribute) {
				diagnostics = append(
					diagnostics,
					classNameCollisionDiagnostic(property, token, previous),
				)
				continue
			}
			if previous, exists := staticTokens[token]; exists &&
				!jsxAttributeAlwaysFalse(attribute) {
				diagnostics = append(
					diagnostics,
					classNameCollisionDiagnostic(property, token, previous),
				)
			}
			if jsxAttributeAlwaysTrue(attribute) {
				guaranteedConditional[token] = property
			}
		}
		return true
	})
	return diagnostics
}

func jsxHasConditionalClassName(attributes *ast.Node) bool {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		name := property.AsJsxAttribute().Name()
		if ast.IsJsxNamespacedName(name) &&
			name.AsJsxNamespacedName().Namespace.Text() == "className" {
			return true
		}
	}
	return false
}

func staticClassNameValue(attribute *ast.JsxAttribute) (string, bool) {
	if attribute.Initializer == nil {
		return "", false
	}
	if ast.IsStringLiteral(attribute.Initializer) {
		return attribute.Initializer.AsStringLiteral().Text, true
	}
	if !ast.IsJsxExpression(attribute.Initializer) {
		return "", false
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	if expression == nil {
		return "", false
	}
	if ast.IsStringLiteral(expression) ||
		expression.Kind == ast.KindNoSubstitutionTemplateLiteral {
		return expression.Text(), true
	}
	return "", false
}

func jsxAttributeAlwaysFalse(attribute *ast.JsxAttribute) bool {
	if attribute.Initializer == nil ||
		!ast.IsJsxExpression(attribute.Initializer) {
		return false
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	return expression != nil && expression.Kind == ast.KindFalseKeyword
}

func jsxAttributeAlwaysTrue(attribute *ast.JsxAttribute) bool {
	if attribute.Initializer == nil {
		return true
	}
	if !ast.IsJsxExpression(attribute.Initializer) {
		return false
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	return expression != nil && expression.Kind == ast.KindTrueKeyword
}

func classNameCollisionDiagnostic(
	node *ast.Node,
	token string,
	previous *ast.Node,
) Diagnostic {
	return classNameDiagnostic(
		node,
		fmt.Sprintf(
			"class token %q is already contributed by an earlier className prop at offset %d",
			token,
			previous.Pos(),
		),
	)
}

func classNameDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_CLASS_NAME",
		Message:  message,
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}
