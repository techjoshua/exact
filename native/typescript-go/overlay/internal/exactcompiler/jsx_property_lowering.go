package exactcompiler

import (
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
	"github.com/microsoft/typescript-go/internal/printer"
)

type enhancementPropertyAccumulator struct {
	entries map[string][]*ast.Node
	order   []string
}

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
	return lowering.propsWithProjection(attributes, elementID, intrinsic, tag, reactive, false)
}

// serverRenderProgramProps preserves target/enhancement contributions while excluding authored
// client-only callbacks before their expressions are evaluated for a compiler-closed SSR writer.
func (lowering *jsxLowering) serverRenderProgramProps(
	attributes *ast.Node,
	tag string,
) *ast.Node {
	return lowering.propsWithProjection(attributes, "", false, tag, false, true)
}

func (lowering *jsxLowering) propsWithProjection(
	attributes *ast.Node,
	elementID string,
	intrinsic bool,
	tag string,
	reactive bool,
	serverOnly bool,
) *ast.Node {
	properties := []*ast.Node{}
	application := enhancementApplication{}
	if attributes != nil {
		application = lowering.enhancementImports.applications[attributes.Pos()]
	}
	enhancements := newEnhancementPropertyAccumulator(application)
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
							lowering.lowerClassNameValue(attributes, reactive, false),
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
					lowering.appendEnhancementSpread(&enhancements, expression, plan, reactive)
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
			if lowering.appendEnhancementAttribute(&enhancements, application, property, attribute, tag, name, reactive) {
				continue
			}
			if serverOnly {
				if bindingProperty := lowering.serverFormBindingProperty(name, attribute.Initializer); bindingProperty != nil {
					properties = append(properties, bindingProperty)
					continue
				}
				if name == "ref" {
					if lowering.serverObservableRefAttribute(attribute) && ast.IsJsxExpression(attribute.Initializer) {
						expression := attribute.Initializer.AsJsxExpression().Expression
						if expression != nil {
							properties = append(properties, lowering.property(
								jsxPropertyName(lowering.factory, name),
								lowering.visitor.VisitNode(expression),
							))
						}
					}
					continue
				}
				if interactiveJSXAttribute(name) {
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
				if serverOnly && name == "className" {
					if closed := lowering.lowerCompilerClosedServerClassName(expression); closed != nil {
						initializer = closed
					}
				}
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
					if jsxEventOmitsArgument(expression, lowering.checker) {
						name = "__exactClosedInteraction:" + name
					} else {
						name = "__exactDirectInteraction:" + name
					}
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
	if marker := lowering.enhancementMarker(enhancements); marker != nil {
		properties = append(properties, lowering.property(
			lowering.factory.NewIdentifier("__exactEnhancements"),
			marker,
		))
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
}

// lowerCompilerClosedServerClassName removes request-local arrays and truthy-map objects only when
// their class-token order and Boolean conditions are statically closed. Other authored class value
// shapes retain the recursive runtime normalizer.
func (lowering *jsxLowering) lowerCompilerClosedServerClassName(expression *ast.Node) *ast.Node {
	if !ast.IsArrayLiteralExpression(expression) {
		return nil
	}
	elements := expression.AsArrayLiteralExpression().Elements.Nodes
	if len(elements) == 0 || !ast.IsStringLiteral(elements[0]) || elements[0].Text() == "" {
		return nil
	}
	output := lowering.factory.NewStringLiteral(elements[0].Text(), ast.TokenFlagsNone)
	for _, element := range elements[1:] {
		switch {
		case ast.IsStringLiteral(element):
			if element.Text() == "" {
				return nil
			}
			output = lowering.binary(
				output,
				ast.KindPlusToken,
				lowering.factory.NewStringLiteral(" "+element.Text(), ast.TokenFlagsNone),
			)
		case ast.IsObjectLiteralExpression(element):
			for _, property := range element.AsObjectLiteralExpression().Properties.Nodes {
				if !ast.IsPropertyAssignment(property) {
					return nil
				}
				assignment := property.AsPropertyAssignment()
				name := assignment.Name()
				if name == nil || (!ast.IsIdentifier(name) && !ast.IsStringLiteral(name)) || name.Text() == "" {
					return nil
				}
				condition := assignment.Initializer
				if condition == nil ||
					!compilerClosedBooleanExpression(condition, lowering.checker) {
					return nil
				}
				output = lowering.binary(
					output,
					ast.KindPlusToken,
					lowering.conditional(
						lowering.visitor.VisitNode(condition),
						lowering.factory.NewStringLiteral(" "+name.Text(), ast.TokenFlagsNone),
						lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
					),
				)
			}
		default:
			return nil
		}
	}
	return output
}

func compilerClosedBooleanExpression(expression *ast.Node, typeChecker *checker.Checker) bool {
	expression = unwrapRenderExpression(expression)
	if expression == nil {
		return false
	}
	if expression.Kind == ast.KindTrueKeyword || expression.Kind == ast.KindFalseKeyword {
		return true
	}
	if ast.IsPrefixUnaryExpression(expression) &&
		expression.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken {
		return true
	}
	if ast.IsBinaryExpression(expression) {
		switch expression.AsBinaryExpression().OperatorToken.Kind {
		case ast.KindEqualsEqualsToken,
			ast.KindEqualsEqualsEqualsToken,
			ast.KindExclamationEqualsToken,
			ast.KindExclamationEqualsEqualsToken:
			return true
		}
	}
	return typeChecker != nil && compilerClosedBooleanType(typeChecker.GetTypeAtLocation(expression))
}

func compilerClosedBooleanType(value *checker.Type) bool {
	if value == nil {
		return false
	}
	members := value.Distributed()
	if len(members) == 0 {
		return false
	}
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsBooleanLike == 0 {
			return false
		}
	}
	return true
}

func newEnhancementPropertyAccumulator(application enhancementApplication) enhancementPropertyAccumulator {
	result := enhancementPropertyAccumulator{entries: make(map[string][]*ast.Node)}
	for _, component := range application.components {
		if _, grouped := result.entries[component.identity]; grouped {
			continue
		}
		result.order = append(result.order, component.identity)
		result.entries[component.identity] = []*ast.Node{}
	}
	return result
}

func (lowering *jsxLowering) appendEnhancementSpread(
	result *enhancementPropertyAccumulator,
	expression *ast.Node,
	plan enhancementSpread,
	reactive bool,
) {
	for _, member := range plan.members {
		if _, grouped := result.entries[member.identity]; !grouped {
			result.order = append(result.order, member.identity)
			result.entries[member.identity] = []*ast.Node{}
		}
		value := lowering.factory.NewElementAccessExpression(
			lowering.visitor.VisitNode(expression),
			nil,
			lowering.factory.NewStringLiteral(member.source, ast.TokenFlagsNone),
			ast.NodeFlagsNone,
		)
		if reactive {
			value = lowering.reactiveExpression(expression, value)
		}
		result.entries[member.identity] = append(
			result.entries[member.identity],
			lowering.property(lowering.factory.NewIdentifier(member.prop), value),
		)
	}
}

func (lowering *jsxLowering) appendEnhancementAttribute(
	result *enhancementPropertyAccumulator,
	application enhancementApplication,
	property *ast.Node,
	attribute *ast.JsxAttribute,
	tag string,
	name string,
	reactive bool,
) bool {
	if !ast.IsJsxNamespacedName(attribute.Name()) {
		return false
	}
	prefix := attribute.Name().AsJsxNamespacedName().Namespace.Text()
	if _, exists := lowering.enhancementImports.bindings[prefix]; !exists {
		return false
	}
	value := lowering.jsxAttributeInitializer(attribute, tag, name, reactive)
	if lowering.timeActivation != "" && timeUpdateMembers(application.attributes[property.Pos()], timeUpdateIdentity(application)) {
		value = lowering.timeActivationExpression(property)
	}
	if value != nil {
		for _, member := range application.attributes[property.Pos()] {
			result.entries[member.identity] = append(
				result.entries[member.identity],
				lowering.property(jsxPropertyName(lowering.factory, member.prop), value),
			)
		}
	}
	return true
}

func (lowering *jsxLowering) enhancementMarker(result enhancementPropertyAccumulator) *ast.Node {
	if len(result.order) == 0 {
		return nil
	}
	entries := make([]*ast.Node, 0, len(result.order))
	for _, identity := range result.order {
		members := result.entries[identity]
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
			lowering.property(lowering.factory.NewIdentifier("identity"), lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("props"), lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(props), false)),
		}
		if root != nil {
			entry = append(entry, lowering.property(lowering.factory.NewIdentifier("root"), root))
		}
		entries = append(entries, lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(entry), false))
	}
	return lowering.call(lowering.names.enhancements, []*ast.Node{
		lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(entries), false),
	})
}

func (lowering *jsxLowering) renderProgramEnhancement(attributes *ast.Node, tag string) *ast.Node {
	if attributes == nil {
		return nil
	}
	application := lowering.enhancementImports.applications[attributes.Pos()]
	result := newEnhancementPropertyAccumulator(application)
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			if plan, exists := lowering.enhancementImports.spreads[property.Pos()]; exists {
				lowering.appendEnhancementSpread(&result, property.AsJsxSpreadAttribute().Expression, plan, true)
			}
			continue
		}
		attribute := property.AsJsxAttribute()
		lowering.appendEnhancementAttribute(&result, application, property, attribute, tag, jsxAttributeText(attribute.Name()), true)
	}
	return lowering.enhancementMarker(result)
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
	materialize bool,
) *ast.Node {
	if lowering.target == TargetServer && !reactive {
		if closed := lowering.lowerCompilerClosedServerConditionalClasses(attributes); closed != nil {
			return closed
		}
	}
	contributions := []*ast.Node{}
	allStatic := true
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !jsxClassNameContribution(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		name := attribute.Name()
		if !ast.IsJsxNamespacedName(name) {
			value, static := lowering.lowerOrdinaryClassName(attribute, reactive, materialize)
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
		condition := lowering.lowerClassNameCondition(attribute, reactive, materialize)
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

// lowerCompilerClosedServerConditionalClasses writes the compiler-created conditional-class
// collection as an ordered string when every contribution is a static token or Boolean condition.
func (lowering *jsxLowering) lowerCompilerClosedServerConditionalClasses(
	attributes *ast.Node,
) *ast.Node {
	var output *ast.Node
	appendStatic := func(token string) {
		literal := token
		if output != nil {
			literal = " " + token
		}
		if output == nil {
			output = lowering.factory.NewStringLiteral(literal, ast.TokenFlagsNone)
		} else {
			output = lowering.binary(
				output,
				ast.KindPlusToken,
				lowering.factory.NewStringLiteral(literal, ast.TokenFlagsNone),
			)
		}
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !jsxClassNameContribution(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		name := attribute.Name()
		if !ast.IsJsxNamespacedName(name) {
			if !ast.IsStringLiteral(attribute.Initializer) || attribute.Initializer.Text() == "" {
				return nil
			}
			appendStatic(attribute.Initializer.Text())
			continue
		}
		token := name.AsJsxNamespacedName().Name().Text()
		if token == "" {
			return nil
		}
		if attribute.Initializer == nil {
			appendStatic(token)
			continue
		}
		if output == nil || !ast.IsJsxExpression(attribute.Initializer) {
			return nil
		}
		condition := attribute.Initializer.AsJsxExpression().Expression
		if condition == nil || !compilerClosedBooleanExpression(condition, lowering.checker) {
			return nil
		}
		output = lowering.binary(
			output,
			ast.KindPlusToken,
			lowering.conditional(
				lowering.visitor.VisitNode(condition),
				lowering.factory.NewStringLiteral(" "+token, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
			),
		)
	}
	return output
}

func (lowering *jsxLowering) lowerOrdinaryClassName(
	attribute *ast.JsxAttribute,
	reactive bool,
	materialize bool,
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
		value := lowering.lowerPlannedClassNameExpression(expression, materialize)
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
	materialize bool,
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
	value := lowering.lowerPlannedClassNameExpression(expression, materialize)
	if reactive && !jsxCallbackExpression(expression) {
		value = lowering.reactiveExpression(expression, value)
	}
	return value
}

// lowerPlannedClassNameExpression keeps render-program property writers closed
// over derived values whose setup declaration the compiler intentionally elided.
func (lowering *jsxLowering) lowerPlannedClassNameExpression(
	expression *ast.Node,
	materialize bool,
) *ast.Node {
	if materialize {
		if closure := lowering.reactiveClosure(expression); closure != nil {
			return lowering.factory.NewCallExpression(
				closure,
				nil,
				nil,
				lowering.factory.NewNodeList(nil),
				ast.NodeFlagsNone,
			)
		}
	}
	return lowering.visitor.VisitNode(expression)
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
	name, reference := lowering.stateWriteReference(
		binding.target,
		binding.write,
		lowering.names.write,
		lowering.names.writeState,
	)
	argument := lowering.arrow(next)
	if name == lowering.names.writeState {
		argument = next
	}
	write := lowering.call(
		name,
		[]*ast.Node{
			lowering.stateWriteRoot(binding.write),
			reference,
			argument,
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

// jsxEventOmitsArgument proves that a locally declared handler cannot observe the DOM event.
func jsxEventOmitsArgument(expression *ast.Node, typeChecker *checker.Checker) bool {
	callable := expression
	if ast.IsIdentifier(expression) && typeChecker != nil {
		symbol := typeChecker.GetResolvedSymbol(expression)
		if symbol == nil {
			symbol = typeChecker.GetSymbolAtLocation(expression)
		}
		if symbol != nil {
			declaration := symbol.ValueDeclaration
			switch {
			case declaration != nil && ast.IsFunctionDeclaration(declaration):
				callable = declaration
			case declaration != nil && ast.IsVariableDeclaration(declaration):
				callable = declaration.AsVariableDeclaration().Initializer
			}
		}
	}
	if callable == nil || (!ast.IsArrowFunction(callable) && !ast.IsFunctionExpression(callable) && !ast.IsFunctionDeclaration(callable)) || len(callable.Parameters()) != 0 {
		return false
	}
	if ast.IsArrowFunction(callable) {
		return true
	}
	usesArguments := false
	walkNode(callable.Body(), func(node *ast.Node) bool {
		if ast.IsIdentifier(node) && node.Text() == "arguments" {
			usesArguments = true
			return false
		}
		return !usesArguments
	})
	return !usesArguments
}
