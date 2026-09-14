package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// nativePropDiagnostics checks both explicit attributes and statically known spread keys.
// Unknown bags retain the runtime boundary; component props keep their authored semantics.
func nativePropDiagnostics(source *ast.SourceFile, typeChecker *checker.Checker) []Diagnostic {
	var diagnostics []Diagnostic
	type propCatalog struct {
		names    map[string]string
		platform bool
	}
	catalogs := make(map[string]propCatalog)
	var catalog propCatalog
	report := func(node *ast.Node, name string, valueType *checker.Type, literalString bool) {
		lower := strings.ToLower(name)
		message := ""
		switch lower {
		case "innerhtml", "outerhtml", "dangerouslysetinnerhtml":
			message = "native eXact does not support " + name + "; use unsafeHtml() with explicit root opt-in"
		default:
			if strings.HasPrefix(lower, "on") && len(lower) > 2 && (literalString || nativeEventContainsString(valueType)) {
				message = "native eXact event handlers must be functions; inline event strings are not supported"
			} else if strings.ContainsAny(name, " \t\r\n\"'<>/=") || name == "" {
				message = "invalid native eXact property name: " + name
			} else if catalog.platform && catalog.names[lower] == "" && !nativeExtensionProp(lower) {
				message = "unknown native eXact property " + name + "; use a supported DOM property or a data-* attribute"
			}
		}
		if message != "" {
			diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT_NATIVE_PROP", Message: message, Start: node.Pos(), Length: node.End() - node.Pos()})
		}
	}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node) {
			return true
		}
		tag := sourceText(source, openingTag(node))
		if !jsxIntrinsic(tag) || node.Attributes() == nil || len(node.Attributes().AsJsxAttributes().Properties.Nodes) == 0 {
			return true
		}
		var exists bool
		catalog, exists = catalogs[tag]
		if !exists {
			catalog.names, catalog.platform = nativePropNames(node, tag, typeChecker)
			catalog.platform = catalog.platform && !strings.Contains(tag, "-") && !strings.HasPrefix(tag, "_")
			catalogs[tag] = catalog
		}
		for _, property := range node.Attributes().AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxAttribute(property) {
				attribute := property.AsJsxAttribute()
				value := attribute.Initializer
				if value != nil && ast.IsJsxExpression(value) {
					value = value.AsJsxExpression().Expression
				}
				var valueType *checker.Type
				if value != nil && strings.HasPrefix(strings.ToLower(jsxAttributeText(attribute.Name())), "on") {
					valueType = typeChecker.GetTypeAtLocation(value)
				}
				report(property, jsxAttributeText(attribute.Name()), valueType, value != nil && (value.Kind == ast.KindStringLiteral || value.Kind == ast.KindNoSubstitutionTemplateLiteral))
			} else if ast.IsJsxSpreadAttribute(property) {
				value := property.AsJsxSpreadAttribute().Expression
				valueType := typeChecker.GetTypeAtLocation(value)
				if valueType == nil {
					continue
				}
				for _, symbol := range typeChecker.GetPropertiesOfType(valueType) {
					var handlerType *checker.Type
					if strings.HasPrefix(strings.ToLower(symbol.Name), "on") {
						handlerType = typeChecker.GetTypeOfSymbolAtLocation(symbol, value)
					}
					report(property, symbol.Name, handlerType, false)
				}
			}
		}
		return true
	})
	return diagnostics
}

// Namespaced bindings have their own compiler validation. Hyphenated attributes include SVG
// presentation names; custom data and ARIA names remain extensible without a framework registry.
func nativeExtensionProp(name string) bool {
	return strings.ContainsAny(name, "-:") || strings.HasPrefix(name, "__exact") ||
		strings.HasPrefix(name, "on") || name == "use" || name == "as"
}

func nativeEventContainsString(value *checker.Type) bool {
	if value == nil {
		return false
	}
	if value.Flags()&checker.TypeFlagsStringLike != 0 {
		return true
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		for _, member := range value.Distributed() {
			if nativeEventContainsString(member) {
				return true
			}
		}
	}
	return false
}
