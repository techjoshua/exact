package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type enhancementProvidedValue struct {
	valueType   *checker.Type
	stringValue *string
	valueless   bool
}

type enhancementTypeAlternative map[string]map[string]enhancementProvidedValue

// collectEnhancementTypeDiagnostics validates canonical values against the
// component prop type while retaining union correlation across finite spreads.
func collectEnhancementTypeDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	imports *enhancementImports,
) {
	if typeChecker == nil || len(imports.bindings) == 0 {
		return
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var attributes *ast.Node
		switch {
		case ast.IsJsxOpeningElement(node):
			attributes = node.AsJsxOpeningElement().Attributes
		case ast.IsJsxSelfClosingElement(node):
			attributes = node.AsJsxSelfClosingElement().Attributes
		default:
			return true
		}
		application := imports.applications[attributes.Pos()]
		if len(application.components) == 0 {
			return true
		}
		alternatives := []enhancementTypeAlternative{{}}
		components := make(map[string]enhancementComponent)
		for _, component := range application.components {
			components[component.identity] = component
			alternatives[0][component.identity] = make(map[string]enhancementProvidedValue)
		}
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				expression := property.AsJsxSpreadAttribute().Expression
				plan := imports.spreads[property.Pos()]
				// Validate the complete member type. Checking distributed branches separately
				// would accept a runtime choice between two different literal host tags.
				for _, member := range plan.members {
					if member.prop != "__exactIntrinsicFragment" {
						continue
					}
					symbol := typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(expression), member.source)
					value := enhancementProvidedValue{}
					if symbol != nil {
						value.valueType = typeChecker.GetTypeOfSymbolAtLocation(symbol, expression)
					}
					validateIntrinsicFragmentTag(sourceFile, property, value, imports)
				}
				branches := make([]enhancementTypeAlternative, 0)
				for _, memberType := range typeChecker.GetTypeAtLocation(expression).Distributed() {
					branch := enhancementTypeAlternative{}
					for _, symbol := range typeChecker.GetPropertiesOfType(memberType) {
						source := ast.SymbolName(symbol)
						for _, member := range plan.members {
							if member.source == source && member.prop == "__exactIntrinsicFragment" {
								continue
							}
							if member.source != source || member.prop == "__exactRoot" {
								continue
							}
							values := branch[member.identity]
							if values == nil {
								values = make(map[string]enhancementProvidedValue)
								branch[member.identity] = values
							}
							values[member.prop] = enhancementProvidedValue{
								valueType: typeChecker.GetTypeOfSymbolAtLocation(symbol, expression),
							}
						}
					}
					branches = append(branches, branch)
				}
				alternatives = combineEnhancementAlternatives(alternatives, branches)
				continue
			}
			attribute := property.AsJsxAttribute()
			if !ast.IsJsxNamespacedName(attribute.Name()) {
				continue
			}
			value := enhancementAttributeValue(attribute, typeChecker)
			if value.valueType == nil {
				continue
			}
			for _, member := range application.attributes[property.Pos()] {
				if member.prop == "__exactIntrinsicFragment" {
					validateIntrinsicFragmentTag(sourceFile, property, value, imports)
					continue
				}
				if member.prop == "__exactRoot" {
					continue
				}
				for _, alternative := range alternatives {
					values := alternative[member.identity]
					if values == nil {
						values = make(map[string]enhancementProvidedValue)
						alternative[member.identity] = values
					}
					values[member.prop] = value
				}
			}
		}

		reported := make(map[string]struct{})
		for _, alternative := range alternatives {
			for identity, component := range components {
				values := alternative[identity]
				if enhancementAlternativeMatches(component, values, typeChecker) {
					continue
				}
				if _, exists := reported[identity]; exists {
					continue
				}
				reported[identity] = struct{}{}
				imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
					sourceFile,
					node,
					"EXACT6011",
					fmt.Sprintf("enhancement props for %s do not satisfy any public prop union member. %s. Supply the required props with values accepted by one complete variant", identity, enhancementTypeExplanation(component, values, typeChecker)),
				))
			}
		}
		return true
	})
}

func combineEnhancementAlternatives(
	current []enhancementTypeAlternative,
	branches []enhancementTypeAlternative,
) []enhancementTypeAlternative {
	if len(branches) == 0 {
		return current
	}
	result := make([]enhancementTypeAlternative, 0, len(current)*len(branches))
	for _, base := range current {
		for _, branch := range branches {
			combined := cloneEnhancementAlternative(base)
			for identity, values := range branch {
				target := combined[identity]
				if target == nil {
					target = make(map[string]enhancementProvidedValue)
					combined[identity] = target
				}
				for prop, value := range values {
					target[prop] = value
				}
			}
			result = append(result, combined)
		}
	}
	return result
}

func cloneEnhancementAlternative(source enhancementTypeAlternative) enhancementTypeAlternative {
	result := make(enhancementTypeAlternative, len(source))
	for identity, values := range source {
		cloned := make(map[string]enhancementProvidedValue, len(values))
		for prop, value := range values {
			cloned[prop] = value
		}
		result[identity] = cloned
	}
	return result
}

func enhancementAlternativeMatches(
	component enhancementComponent,
	values map[string]enhancementProvidedValue,
	typeChecker *checker.Checker,
) bool {
	for _, variant := range component.variants {
		matches := true
		for prop, value := range values {
			expected, exists := variant[prop]
			if !exists || !enhancementValueAssignable(value, expected.valueType, typeChecker) {
				matches = false
				break
			}
		}
		if matches {
			for prop, expected := range variant {
				if expected.optional {
					continue
				}
				if _, provided := values[prop]; !provided {
					matches = false
					break
				}
			}
		}
		if matches {
			return true
		}
	}
	return false
}

// validateIntrinsicFragmentTag checks static identity, not HTML suitability in the authored parent.
func validateIntrinsicFragmentTag(sourceFile *ast.SourceFile, node *ast.Node, value enhancementProvidedValue, imports *enhancementImports) {
	if _, valid := intrinsicFragmentTagValue(value); !valid {
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(sourceFile, node, "EXACT6019", "intrinsicFragment requires one compile-time constant, nonempty tag string"))
	}
}

func intrinsicFragmentTagValue(value enhancementProvidedValue) (string, bool) {
	if value.stringValue != nil {
		return *value.stringValue, *value.stringValue != ""
	}
	if value.valueType != nil && value.valueType.IsStringLiteral() {
		text, ok := value.valueType.AsLiteralType().Value().(string)
		return text, ok && text != ""
	}
	return "", false
}

func enhancementAttributeValue(
	attribute *ast.JsxAttribute,
	typeChecker *checker.Checker,
) enhancementProvidedValue {
	if attribute.Initializer == nil {
		return enhancementProvidedValue{valueType: typeChecker.GetBooleanType(), valueless: true}
	}
	if ast.IsJsxExpression(attribute.Initializer) {
		expression := attribute.Initializer.AsJsxExpression().Expression
		if expression == nil {
			return enhancementProvidedValue{}
		}
		return enhancementProvidedValue{valueType: typeChecker.GetTypeAtLocation(expression)}
	}
	if ast.IsStringLiteral(attribute.Initializer) {
		value := attribute.Initializer.AsStringLiteral().Text
		// JSX attribute literals lack an expression type before intrinsic resolution.
		// Ask TypeScript to check an anchored literal type rather than duplicating
		// its template, numeric, bigint and string-mapping assignability rules.
		factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
		text := factory.NewStringLiteral(value, ast.TokenFlagsNone)
		literal := factory.NewLiteralTypeNode(text)
		text.Parent = literal
		literal.Parent = attribute.AsNode()
		return enhancementProvidedValue{valueType: typeChecker.GetTypeFromTypeNode(literal), stringValue: &value}
	}
	return enhancementProvidedValue{valueType: typeChecker.GetTypeAtLocation(attribute.Initializer)}
}

func enhancementValueAssignable(
	value enhancementProvidedValue,
	target *checker.Type,
	typeChecker *checker.Checker,
) bool {
	if value.valueless {
		for _, candidate := range target.Distributed() {
			if candidate.Flags()&checker.TypeFlagsBooleanLike != 0 {
				return true
			}
		}
		return false
	}
	return typeChecker.IsTypeAssignableTo(value.valueType, target)
}
