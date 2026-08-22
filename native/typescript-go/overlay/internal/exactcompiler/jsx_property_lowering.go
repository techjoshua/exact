package exactcompiler

import (
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
	"github.com/microsoft/typescript-go/internal/printer"
)

func (lowering *jsxLowering) props(
	attributes *ast.Node,
	elementID string,
	intrinsic bool,
	tag string,
) *ast.Node {
	return lowering.propsWithReactivity(
		attributes,
		elementID,
		intrinsic,
		tag,
		true,
	)
}

func (lowering *jsxLowering) propsWithReactivity(
	attributes *ast.Node,
	elementID string,
	intrinsic bool,
	tag string,
	reactive bool,
) *ast.Node {
	properties := []*ast.Node{}
	enhancementEntries := make(map[string][]*ast.Node)
	enhancementOrder := []string{}
	application := enhancementApplication{}
	if attributes != nil {
		application = lowering.enhancementImports.applications[attributes.Pos()]
	}
	for _, component := range application.components {
		if _, grouped := enhancementEntries[component.identity]; grouped {
			continue
		}
		enhancementOrder = append(enhancementOrder, component.identity)
		enhancementEntries[component.identity] = []*ast.Node{}
	}
	if intrinsic {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral("data-exact-id", ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(elementID, ast.TokenFlagsNone),
			),
		)
	}
	if attributes != nil {
		conditionalClasses := jsxHasConditionalClassName(attributes)
		classNameEmitted := false
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if conditionalClasses && jsxClassNameContribution(property) {
				if !classNameEmitted {
					properties = append(
						properties,
						lowering.property(
							lowering.factory.NewIdentifier("className"),
							lowering.lowerClassNameValue(attributes, reactive),
						),
					)
					classNameEmitted = true
				}
				continue
			}
			if ast.IsJsxSpreadAttribute(property) {
				expression := property.AsJsxSpreadAttribute().Expression
				if plan, exists := lowering.enhancementImports.spreads[property.Pos()]; exists {
					visited := lowering.visitor.VisitNode(expression)
					keys := make([]*ast.Node, 0, len(plan.keys))
					for _, key := range plan.keys {
						keys = append(keys, lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone))
					}
					properties = append(properties, lowering.factory.NewSpreadAssignment(
						lowering.call(lowering.names.omitEnhancementProps, []*ast.Node{
							visited,
							lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(keys), false),
						}),
					))
					for _, member := range plan.members {
						if _, grouped := enhancementEntries[member.identity]; !grouped {
							enhancementOrder = append(enhancementOrder, member.identity)
							enhancementEntries[member.identity] = []*ast.Node{}
						}
						value := lowering.factory.NewElementAccessExpression(
							lowering.visitor.VisitNode(expression),
							nil,
							lowering.factory.NewStringLiteral(member.source, ast.TokenFlagsNone),
							ast.NodeFlagsNone,
						)
						value = lowering.reactiveExpression(expression, value)
						enhancementEntries[member.identity] = append(
							enhancementEntries[member.identity],
							lowering.property(lowering.factory.NewIdentifier(member.prop), value),
						)
					}
					continue
				}
				properties = append(
					properties,
					lowering.factory.NewSpreadAssignment(
						lowering.visitor.VisitNode(expression),
					),
				)
				continue
			}
			attribute := property.AsJsxAttribute()
			name := jsxAttributeText(attribute.Name())
			if binding, exists := lowering.componentBindings[property.Pos()]; exists {
				properties = append(properties, lowering.componentBindingProperties(binding)...)
				continue
			}
			if ast.IsJsxNamespacedName(attribute.Name()) {
				namespaced := attribute.Name().AsJsxNamespacedName()
				prefix := namespaced.Namespace.Text()
				if _, exists := lowering.enhancementImports.bindings[prefix]; exists {
					value := lowering.jsxAttributeInitializer(attribute, tag, name, reactive)
					if lowering.timeActivation != "" && timeUpdateMembers(application.attributes[property.Pos()], timeUpdateIdentity(application)) {
						value = lowering.timeActivationExpression(property)
					}
					if value != nil {
						for _, member := range application.attributes[property.Pos()] {
							enhancementEntries[member.identity] = append(
								enhancementEntries[member.identity],
								lowering.property(jsxPropertyName(lowering.factory, member.prop), value),
							)
						}
					}
					continue
				}
			}
			if bindingProperties := lowering.formBindingProperties(
				name,
				attribute.Initializer,
				attributes,
			); len(bindingProperties) != 0 {
				properties = append(properties, bindingProperties...)
				continue
			}
			var initializer *ast.Node
			switch {
			case attribute.Initializer == nil:
				initializer = lowering.factory.NewTrueExpression()
			case ast.IsStringLiteral(attribute.Initializer):
				initializer = lowering.factory.NewStringLiteral(
					attribute.Initializer.AsStringLiteral().Text,
					ast.TokenFlagsNone,
				)
			case ast.IsJsxExpression(attribute.Initializer):
				expression := attribute.Initializer.AsJsxExpression().Expression
				if expression == nil {
					continue
				}
				directInteraction := intrinsic && lowering.target != TargetServer && jsxEventAttribute(name)
				expression = lowering.preserveContextualCallbackTypes(
					expression,
					tag,
					name,
				)
				initializer = lowering.visitor.VisitNode(expression)
				if reactive && !jsxCallbackExpression(expression) &&
					!jsxEventAttribute(name) &&
					name != "key" && name != "ref" {
					initializer = lowering.reactiveExpressionMode(
						expression,
						initializer,
						!intrinsic,
					)
				}
				if directInteraction {
					name = "__exactDirectInteraction:" + name
				}
			default:
				initializer = lowering.visitor.VisitNode(attribute.Initializer)
			}
			properties = append(
				properties,
				lowering.property(jsxPropertyName(lowering.factory, name), initializer),
			)
		}
	}
	if len(enhancementOrder) != 0 {
		entries := make([]*ast.Node, 0, len(enhancementOrder))
		for _, identity := range enhancementOrder {
			members := enhancementEntries[identity]
			props := []*ast.Node{}
			var root *ast.Node
			for _, member := range members {
				if ast.IsPropertyAssignment(member) && member.AsPropertyAssignment().Name().Text() == "__exactRoot" {
					root = member.AsPropertyAssignment().Initializer
					continue
				}
				props = append(props, member)
			}
			entry := []*ast.Node{
				lowering.property(
					lowering.factory.NewIdentifier("identity"),
					lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone),
				),
				lowering.property(
					lowering.factory.NewIdentifier("props"),
					lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(props), false),
				),
			}
			if root != nil {
				entry = append(entry, lowering.property(lowering.factory.NewIdentifier("root"), root))
			}
			entries = append(entries, lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(entry), false))
		}
		properties = append(properties, lowering.property(
			lowering.factory.NewIdentifier("__exactEnhancements"),
			lowering.call(lowering.names.enhancements, []*ast.Node{
				lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(entries), false),
			}),
		))
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
}

func (lowering *jsxLowering) jsxAttributeInitializer(
	attribute *ast.JsxAttribute,
	tag string,
	name string,
	reactive bool,
) *ast.Node {
	switch {
	case attribute.Initializer == nil:
		return lowering.factory.NewTrueExpression()
	case ast.IsStringLiteral(attribute.Initializer):
		return lowering.factory.NewStringLiteral(attribute.Initializer.AsStringLiteral().Text, ast.TokenFlagsNone)
	case ast.IsJsxExpression(attribute.Initializer):
		expression := attribute.Initializer.AsJsxExpression().Expression
		if expression == nil {
			return nil
		}
		expression = lowering.preserveContextualCallbackTypes(expression, tag, name)
		initializer := lowering.visitor.VisitNode(expression)
		if reactive && !jsxCallbackExpression(expression) {
			initializer = lowering.reactiveExpression(expression, initializer)
		}
		return initializer
	default:
		return lowering.visitor.VisitNode(attribute.Initializer)
	}
}

func kebabToCamel(value string) string {
	result := ""
	upper := false
	for _, character := range value {
		if character == '-' {
			upper = true
			continue
		}
		if upper {
			result += strings.ToUpper(string(character))
			upper = false
			continue
		}
		result += string(character)
	}
	return result
}

func jsxClassNameContribution(property *ast.Node) bool {
	if !ast.IsJsxAttribute(property) {
		return false
	}
	name := property.AsJsxAttribute().Name()
	if ast.IsJsxNamespacedName(name) {
		return name.AsJsxNamespacedName().Namespace.Text() == "className"
	}
	return name.Text() == "className"
}

// lowerClassNameValue retains each authored class contribution as one ordered
// list entry. Conditional names use truthy-map entries so their reactive
// condition remains independently observable by the shared class normalizer.
func (lowering *jsxLowering) lowerClassNameValue(
	attributes *ast.Node,
	reactive bool,
) *ast.Node {
	contributions := []*ast.Node{}
	allStatic := true
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !jsxClassNameContribution(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		name := attribute.Name()
		if !ast.IsJsxNamespacedName(name) {
			value, static := lowering.lowerOrdinaryClassName(attribute, reactive)
			if value != nil {
				contributions = append(contributions, value)
				allStatic = allStatic && static
			}
			continue
		}
		token := name.AsJsxNamespacedName().Name().Text()
		if attribute.Initializer == nil {
			contributions = append(
				contributions,
				lowering.factory.NewStringLiteral(token, ast.TokenFlagsNone),
			)
			continue
		}
		condition := lowering.lowerClassNameCondition(attribute, reactive)
		if condition == nil {
			continue
		}
		allStatic = false
		contributions = append(
			contributions,
			lowering.factory.NewObjectLiteralExpression(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.property(
						lowering.factory.NewStringLiteral(token, ast.TokenFlagsNone),
						condition,
					),
				}),
				false,
			),
		)
	}
	if allStatic {
		values := make([]string, 0, len(contributions))
		for _, contribution := range contributions {
			values = append(values, contribution.AsStringLiteral().Text)
		}
		return lowering.factory.NewStringLiteral(
			strings.Join(values, " "),
			ast.TokenFlagsNone,
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(contributions),
		false,
	)
}

func (lowering *jsxLowering) lowerOrdinaryClassName(
	attribute *ast.JsxAttribute,
	reactive bool,
) (*ast.Node, bool) {
	switch {
	case attribute.Initializer == nil:
		return lowering.factory.NewTrueExpression(), false
	case ast.IsStringLiteral(attribute.Initializer):
		return lowering.factory.NewStringLiteral(
			attribute.Initializer.AsStringLiteral().Text,
			ast.TokenFlagsNone,
		), true
	case ast.IsJsxExpression(attribute.Initializer):
		expression := attribute.Initializer.AsJsxExpression().Expression
		if expression == nil {
			return nil, false
		}
		value := lowering.visitor.VisitNode(expression)
		if reactive && !jsxCallbackExpression(expression) {
			value = lowering.reactiveExpression(expression, value)
		}
		return value, false
	default:
		return lowering.visitor.VisitNode(attribute.Initializer), false
	}
}

func (lowering *jsxLowering) lowerClassNameCondition(
	attribute *ast.JsxAttribute,
	reactive bool,
) *ast.Node {
	if ast.IsStringLiteral(attribute.Initializer) {
		return lowering.factory.NewStringLiteral(
			attribute.Initializer.AsStringLiteral().Text,
			ast.TokenFlagsNone,
		)
	}
	if !ast.IsJsxExpression(attribute.Initializer) {
		return lowering.visitor.VisitNode(attribute.Initializer)
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	if expression == nil {
		return nil
	}
	value := lowering.visitor.VisitNode(expression)
	if reactive && !jsxCallbackExpression(expression) {
		value = lowering.reactiveExpression(expression, value)
	}
	return value
}

func jsxEventAttribute(name string) bool {
	return len(name) > 2 &&
		name[0] == 'o' &&
		name[1] == 'n' &&
		name[2] >= 'A' &&
		name[2] <= 'Z'
}

// preserveContextualCallbackTypes materializes types that TypeScript inferred
// from JSX before JSX lowering removes the contextual typing site. This keeps
// the emitted TypeScript independently checkable without reimplementing the
// JSX event-type table in eXact.
func (lowering *jsxLowering) preserveContextualCallbackTypes(
	expression *ast.Node,
	tag string,
	attribute string,
) *ast.Node {
	if lowering.checker == nil ||
		(!ast.IsArrowFunction(expression) &&
			!ast.IsFunctionExpression(expression)) {
		return expression
	}
	parameters := append([]*ast.Node(nil), expression.Parameters()...)
	contextualParameters := lowering.contextualCallbackParameterTypes(expression)
	changed := false
	for index, node := range parameters {
		parameter := node.AsParameterDeclaration()
		if parameter.Type != nil {
			continue
		}
		contextualType := contextualParameters[index]
		if contextualType == nil ||
			lowering.checker.TypeToString(contextualType) == "any" {
			contextualType = lowering.checker.GetTypeAtLocation(node)
		}
		if (contextualType == nil ||
			lowering.checker.TypeToString(contextualType) == "any") &&
			index == 0 {
			if eventType := lowering.jsxEventParameterType(
				expression,
				tag,
				attribute,
			); eventType != nil {
				parameters[index] = lowering.factory.UpdateParameterDeclaration(
					parameter,
					parameter.Modifiers(),
					parameter.DotDotDotToken,
					parameter.Name(),
					parameter.QuestionToken,
					eventType,
					parameter.Initializer,
				)
				changed = true
				continue
			}
		}
		if contextualType == nil {
			continue
		}
		typeNode := lowering.checker.TypeToTypeNode(
			contextualType,
			node,
			nodebuilder.FlagsNoTruncation,
			nil,
		)
		if typeNode == nil {
			continue
		}
		parameters[index] = lowering.factory.UpdateParameterDeclaration(
			parameter,
			parameter.Modifiers(),
			parameter.DotDotDotToken,
			parameter.Name(),
			parameter.QuestionToken,
			typeNode,
			parameter.Initializer,
		)
		changed = true
	}
	if !changed {
		return expression
	}
	list := lowering.factory.NewNodeList(parameters)
	if ast.IsArrowFunction(expression) {
		arrow := expression.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(
			arrow,
			arrow.Modifiers(),
			arrow.TypeParameters,
			list,
			arrow.Type,
			arrow.FullSignature,
			arrow.EqualsGreaterThanToken,
			arrow.Body,
		)
	}
	function := expression.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(
		function,
		function.Modifiers(),
		function.AsteriskToken,
		function.Name(),
		function.TypeParameters,
		list,
		function.Type,
		function.FullSignature,
		function.Body,
	)
}

// jsxEventParameterType resolves element and event types from TypeScript's DOM
// declarations, then qualifies eXact's event wrapper through its public JSX
// runtime. This is a semantic fallback for projects whose unresolved JSX
// import source causes the checker to expose `any` at the callback itself.
func (lowering *jsxLowering) jsxEventParameterType(
	location *ast.Node,
	tag string,
	attribute string,
) *ast.Node {
	if tag == "" || len(attribute) <= 2 ||
		!strings.HasPrefix(attribute, "on") {
		return nil
	}
	eventName := strings.TrimSuffix(attribute[2:], "Capture")
	if eventName == "" {
		return nil
	}
	eventName = strings.ToLower(eventName)
	if eventName == "doubleclick" {
		eventName = "dblclick"
	}
	elementType := lowering.globalPropertyType(
		"HTMLElementTagNameMap",
		strings.ToLower(tag),
		location,
	)
	eventType := lowering.globalPropertyType(
		"GlobalEventHandlersEventMap",
		eventName,
		location,
	)
	if elementType == nil || eventType == nil {
		return nil
	}
	elementNode := lowering.checker.TypeToTypeNode(
		elementType,
		location,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	eventNode := lowering.checker.TypeToTypeNode(
		eventType,
		location,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	if elementNode == nil || eventNode == nil {
		return nil
	}
	qualifier := lowering.factory.NewQualifiedName(
		lowering.factory.NewIdentifier("JSX"),
		lowering.factory.NewIdentifier("TargetedEvent"),
	)
	return lowering.factory.NewImportTypeNode(
		false,
		lowering.factory.NewLiteralTypeNode(
			lowering.factory.NewStringLiteral(
				"@exactjs/jsx/jsx-runtime",
				ast.TokenFlagsNone,
			),
		),
		nil,
		qualifier,
		lowering.factory.NewNodeList([]*ast.Node{elementNode, eventNode}),
	)
}

func (lowering *jsxLowering) globalPropertyType(
	globalName string,
	propertyName string,
	location *ast.Node,
) *checker.Type {
	symbol := lowering.checker.GetGlobalSymbol(
		globalName,
		ast.SymbolFlagsType,
		nil,
	)
	if symbol == nil {
		return nil
	}
	globalType := lowering.checker.GetDeclaredTypeOfSymbol(symbol)
	property := lowering.checker.GetPropertyOfType(globalType, propertyName)
	if property == nil {
		return nil
	}
	return lowering.checker.GetTypeOfSymbolAtLocation(property, location)
}

func (lowering *jsxLowering) contextualCallbackParameterTypes(
	expression *ast.Node,
) map[int]*checker.Type {
	result := make(map[int]*checker.Type)
	contextual := lowering.checker.GetContextualType(
		expression,
		checker.ContextFlagsNone,
	)
	if contextual == nil {
		return result
	}
	contextual = lowering.checker.GetNonNullableType(contextual)
	signatures := lowering.checker.GetSignaturesOfType(
		contextual,
		checker.SignatureKindCall,
	)
	if len(signatures) == 0 {
		return result
	}
	for index, parameter := range signatures[0].Parameters() {
		result[index] = lowering.checker.GetTypeOfSymbolAtLocation(
			parameter,
			expression,
		)
	}
	return result
}

func (lowering *jsxLowering) componentBindingProperties(
	binding componentBinding,
) []*ast.Node {
	target := lowering.visitor.VisitNode(binding.target)
	next := lowering.factory.NewIdentifier("__exactBindingValue")
	write := lowering.call(
		lowering.names.write,
		[]*ast.Node{
			lowering.stateWriteRoot(binding.write),
			lowering.stateWritePathNode(binding.write),
			lowering.arrow(next),
		},
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewExpressionStatement(write),
		}),
		true,
	)
	parameterType := lowering.checker.TypeToTypeNode(
		binding.parameter,
		binding.target,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	parameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		next,
		nil,
		parameterType,
		nil,
	)
	callback := lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
	return []*ast.Node{
		lowering.property(
			jsxPropertyName(lowering.factory, binding.valueProp),
			lowering.reactiveExpression(binding.target, target),
		),
		lowering.property(
			jsxPropertyName(lowering.factory, binding.callbackProp),
			callback,
		),
	}
}

func (lowering *jsxLowering) formBindingProperties(
	name string,
	initializer *ast.Node,
	attributes *ast.Node,
) []*ast.Node {
	if name != "value:onInput" && name != "value:onChange" &&
		name != "checked:onChange" && name != "open:onToggle" &&
		name != "modal:isOpen" {
		return nil
	}
	if initializer == nil || !ast.IsJsxExpression(initializer) {
		return nil
	}
	target := initializer.AsJsxExpression().Expression
	if target == nil {
		return nil
	}
	binding, exists := lowering.formBindings[target.Pos()]
	if !exists || binding.name != name {
		return nil
	}
	return lowering.lowerFormBinding(binding, attributes)
}

func (lowering *jsxLowering) stateReadPath(node *ast.Node) []string {
	for _, read := range lowering.stateReads {
		if read.Start == node.Pos() && read.Length == node.End()-node.Pos() &&
			read.Confidence == "exact" {
			return append([]string(nil), read.Path...)
		}
	}
	return nil
}

func jsxAttributeText(name *ast.Node) string {
	if ast.IsJsxNamespacedName(name) {
		namespaced := name.AsJsxNamespacedName()
		return namespaced.Namespace.Text() + ":" + namespaced.Name().Text()
	}
	return name.Text()
}

func jsxPropertyName(factory *printer.NodeFactory, name string) *ast.Node {
	if validIdentifier(name) {
		return factory.NewIdentifier(name)
	}
	return factory.NewStringLiteral(name, ast.TokenFlagsNone)
}

func validIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, character := range value {
		if index == 0 {
			if character != '_' && character != '$' &&
				!unicode.IsLetter(character) {
				return false
			}
			continue
		}
		if character != '_' && character != '$' &&
			!unicode.IsLetter(character) &&
			!unicode.IsDigit(character) {
			return false
		}
	}
	return true
}

func jsxCallbackExpression(node *ast.Node) bool {
	return ast.IsArrowFunction(node) || ast.IsFunctionExpression(node)
}
