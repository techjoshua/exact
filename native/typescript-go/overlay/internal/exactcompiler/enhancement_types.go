package exactcompiler

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type enhancementProvidedValue struct {
	valueType   *checker.Type
	stringValue *string
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
				branches := make([]enhancementTypeAlternative, 0)
				for _, memberType := range typeChecker.GetTypeAtLocation(expression).Distributed() {
					branch := enhancementTypeAlternative{}
					for _, symbol := range typeChecker.GetPropertiesOfType(memberType) {
						source := ast.SymbolName(symbol)
						for _, member := range plan.members {
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
					fmt.Sprintf("enhancement props for %s do not satisfy any public prop union member", identity),
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

func enhancementAttributeValue(
	attribute *ast.JsxAttribute,
	typeChecker *checker.Checker,
) enhancementProvidedValue {
	if attribute.Initializer == nil {
		return enhancementProvidedValue{valueType: typeChecker.GetBooleanType()}
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
		return enhancementProvidedValue{valueType: typeChecker.GetStringType(), stringValue: &value}
	}
	return enhancementProvidedValue{valueType: typeChecker.GetTypeAtLocation(attribute.Initializer)}
}

func enhancementValueAssignable(
	value enhancementProvidedValue,
	target *checker.Type,
	typeChecker *checker.Checker,
) bool {
	if value.stringValue == nil {
		return typeChecker.IsTypeAssignableTo(value.valueType, target)
	}
	return enhancementStringAssignable(*value.stringValue, target)
}

func enhancementStringAssignable(value string, target *checker.Type) bool {
	for _, candidate := range target.Distributed() {
		switch {
		case candidate.IsString():
			return true
		case candidate.IsStringLiteral():
			if text, ok := candidate.AsLiteralType().Value().(string); ok && text == value {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsTemplateLiteral != 0:
			if enhancementTemplateMatches(value, candidate.AsTemplateLiteralType(), 0, 0) {
				return true
			}
		}
	}
	return false
}

func enhancementTemplateMatches(
	value string,
	template *checker.TemplateLiteralType,
	index int,
	position int,
) bool {
	texts := template.Texts()
	types := template.Types()
	if index >= len(texts) || !strings.HasPrefix(value[position:], texts[index]) {
		return false
	}
	position += len(texts[index])
	if index == len(types) {
		return position == len(value)
	}
	next := texts[index+1]
	if next == "" {
		for end := position; end <= len(value); end++ {
			if enhancementTemplatePlaceholderMatches(value[position:end], types[index]) &&
				enhancementTemplateMatches(value, template, index+1, end) {
				return true
			}
		}
		return false
	}
	for offset := position; offset <= len(value); {
		relative := strings.Index(value[offset:], next)
		if relative < 0 {
			return false
		}
		end := offset + relative
		if enhancementTemplatePlaceholderMatches(value[position:end], types[index]) &&
			enhancementTemplateMatches(value, template, index+1, end) {
			return true
		}
		offset = end + 1
	}
	return false
}

func enhancementTemplatePlaceholderMatches(value string, target *checker.Type) bool {
	for _, candidate := range target.Distributed() {
		switch {
		case candidate.IsString(), candidate.IsStringLiteral() && enhancementStringAssignable(value, candidate):
			return true
		case candidate.Flags()&checker.TypeFlagsNumberLike != 0:
			if _, err := strconv.ParseFloat(value, 64); err == nil {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsBigIntLike != 0:
			if _, err := strconv.ParseInt(strings.TrimSuffix(value, "n"), 10, 64); err == nil {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsBooleanLike != 0:
			if value == "true" || value == "false" {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsNull != 0:
			if value == "null" {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsUndefined != 0:
			if value == "undefined" {
				return true
			}
		case candidate.Flags()&checker.TypeFlagsTemplateLiteral != 0:
			if enhancementTemplateMatches(value, candidate.AsTemplateLiteralType(), 0, 0) {
				return true
			}
		}
	}
	return false
}
