package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type formBinding struct {
	name       string
	valueKind  string
	empty      string
	control    string
	element    string
	event      string
	target     *ast.Node
	option     *ast.Node
	targetPath []string
}

// analyzeFormBindings validates namespaced native-control bindings once, before
// lowering, and retains the checker-derived conversion contract by source
// position for both ordinary JSX and generated client islands.
func analyzeFormBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
) (map[int]formBinding, []Diagnostic) {
	result := make(map[int]formBinding)
	diagnostics := []Diagnostic{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node) {
			return true
		}
		tag := strings.TrimSpace(sourceText(sourceFile, openingTag(node)))
		if !jsxIntrinsic(tag) {
			return true
		}
		attributes := node.Attributes()
		if attributes == nil {
			return true
		}
		binders := []*ast.Node{}
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if !ast.IsJsxAttribute(property) {
				continue
			}
			name := jsxAttributeText(property.AsJsxAttribute().Name())
			if name == "bindInput" || name == "bindChange" {
				diagnostics = append(
					diagnostics,
					formBindingDiagnostic(
						property,
						"bindInput and bindChange were removed; use value:input, value:change, or checked:change",
					),
				)
				return true
			}
			if strings.HasPrefix(name, "value:") ||
				strings.HasPrefix(name, "checked:") {
				binders = append(binders, property)
			}
		}
		if len(binders) == 0 {
			return true
		}
		if len(binders) > 1 {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					"an element may declare only one binding",
				),
			)
			return true
		}
		attribute := binders[0].AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if name != "value:input" && name != "value:change" &&
			name != "checked:change" {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					"supported reactive form attributes are value:input, value:change, and checked:change",
				),
			)
			return true
		}
		if attribute.Initializer == nil ||
			!ast.IsJsxExpression(attribute.Initializer) {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" requires one writable reactive location",
				),
			)
			return true
		}
		target := attribute.Initializer.AsJsxExpression().Expression
		if target == nil ||
			(!ast.IsPropertyAccessExpression(target) &&
				!ast.IsElementAccessExpression(target)) {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" requires one writable reactive location",
				),
			)
			return true
		}
		targetType := typeChecker.GetTypeAtLocation(target)
		valueKind, empty, array := formBindingType(typeChecker, targetType)
		if valueKind == "" && targetType != nil &&
			targetType.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
			valueKind = "string"
			if name == "checked:change" {
				valueKind = "boolean"
			}
			empty = "value"
		}
		if valueKind == "" {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" requires a string, number, Date, or homogeneous array",
				),
			)
			return true
		}
		staticType, _ := jsxStaticAttribute(attributes, "type")
		multiple := jsxHasAttribute(attributes, "multiple")
		control := "value"
		switch {
		case tag == "select" && multiple:
			control = "multiple"
		case staticType == "checkbox" && array:
			control = "checkbox-group"
		case staticType == "checkbox":
			control = "checked"
		case staticType == "radio":
			control = "radio"
		}
		if tag != "input" && tag != "textarea" && tag != "select" {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" is supported only on input, textarea, and select",
				),
			)
			return true
		}
		generatedProp := "value"
		if control == "checked" || control == "checkbox-group" ||
			control == "radio" {
			generatedProp = "checked"
		}
		requiredEvent := strings.TrimPrefix(name, generatedProp+":")
		if control == "checked" || control == "checkbox-group" ||
			control == "radio" || tag == "select" {
			requiredEvent = "change"
		}
		if name != generatedProp+":"+requiredEvent {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" is not supported by this control; use "+
						generatedProp+":"+requiredEvent,
				),
			)
			return true
		}
		if valueKind == "boolean" && control != "checked" {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					"boolean bindings require an input with type=\"checkbox\"",
				),
			)
			return true
		}
		if (array && control != "multiple" && control != "checkbox-group") ||
			(!array && (control == "multiple" || control == "checkbox-group")) {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" array values require <select multiple> or checkbox inputs",
				),
			)
			return true
		}
		if array && valueKind != "string" && valueKind != "number" {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" arrays must contain strings or numbers",
				),
			)
			return true
		}
		option := jsxAttributeExpression(attributes, "value")
		if control == "checkbox-group" && option == nil {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					"checkbox array bindings require an explicit value prop",
				),
			)
			return true
		}
		if valueKind == "date" && (tag != "input" || staticType != "date") {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" Date values require <input type=\"date\">",
				),
			)
			return true
		}
		if jsxHasAttribute(attributes, generatedProp) {
			diagnostics = append(
				diagnostics,
				formBindingDiagnostic(
					binders[0],
					name+" cannot be combined with an explicit "+
						generatedProp+" prop",
				),
			)
			return true
		}
		path := exactStatePathAt(target, stateReads)
		result[target.Pos()] = formBinding{
			name:       name,
			valueKind:  valueKind,
			empty:      empty,
			control:    control,
			element:    tag,
			event:      requiredEvent,
			target:     target,
			option:     option,
			targetPath: path,
		}
		return true
	})
	return result, diagnostics
}

func formBindingType(
	typeChecker *checker.Checker,
	value *checker.Type,
) (kind string, empty string, array bool) {
	if value == nil {
		return "", "", false
	}
	members := []*checker.Type{value}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		members = value.Types()
	}
	hasNull, hasUndefined := false, false
	values := []*checker.Type{}
	for _, member := range members {
		switch {
		case member.Flags()&checker.TypeFlagsNull != 0:
			hasNull = true
		case member.Flags()&checker.TypeFlagsUndefined != 0:
			hasUndefined = true
		default:
			values = append(values, member)
		}
	}
	if hasNull && hasUndefined || len(values) == 0 {
		return "", "", false
	}
	empty = "value"
	if hasNull {
		empty = "null"
	} else if hasUndefined {
		empty = "undefined"
	}
	scalars := []*checker.Type{}
	for index, candidate := range values {
		element := typeChecker.GetElementTypeOfArrayType(candidate)
		candidateArray := element != nil
		if index == 0 {
			array = candidateArray
		} else if array != candidateArray {
			return "", "", false
		}
		if candidateArray {
			candidate = element
		}
		if candidate.Flags()&checker.TypeFlagsUnion != 0 {
			scalars = append(scalars, candidate.Types()...)
		} else {
			scalars = append(scalars, candidate)
		}
	}
	for _, member := range scalars {
		candidate := primitiveFormBindingKind(typeChecker, member)
		if candidate == "" || kind != "" && candidate != kind {
			return "", "", false
		}
		kind = candidate
	}
	return kind, empty, array
}

func primitiveFormBindingKind(
	typeChecker *checker.Checker,
	value *checker.Type,
) string {
	switch {
	case value.Flags()&checker.TypeFlagsStringLike != 0:
		return "string"
	case value.Flags()&checker.TypeFlagsNumberLike != 0:
		return "number"
	case value.Flags()&checker.TypeFlagsBooleanLike != 0:
		return "boolean"
	case typeChecker.TypeToString(value) == "Date":
		return "date"
	default:
		return ""
	}
}

func exactStatePathAt(node *ast.Node, reads []StateRead) []string {
	for _, read := range reads {
		if read.Start == node.Pos() && read.Length == node.End()-node.Pos() &&
			read.Confidence == "exact" {
			return append([]string(nil), read.Path...)
		}
	}
	return nil
}

func jsxHasAttribute(attributes *ast.Node, name string) bool {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxAttribute(property) &&
			jsxAttributeText(property.AsJsxAttribute().Name()) == name {
			return true
		}
	}
	return false
}

func jsxStaticAttribute(attributes *ast.Node, name string) (string, bool) {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if jsxAttributeText(attribute.Name()) != name ||
			attribute.Initializer == nil ||
			!ast.IsStringLiteral(attribute.Initializer) {
			continue
		}
		return attribute.Initializer.AsStringLiteral().Text, true
	}
	return "", false
}

func jsxAttributeExpression(attributes *ast.Node, name string) *ast.Node {
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if jsxAttributeText(attribute.Name()) != name ||
			attribute.Initializer == nil {
			continue
		}
		if ast.IsStringLiteral(attribute.Initializer) {
			return attribute.Initializer
		}
		if ast.IsJsxExpression(attribute.Initializer) {
			return attribute.Initializer.AsJsxExpression().Expression
		}
	}
	return nil
}

func formBindingDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_FORM_BINDING",
		Message:  message,
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}

func (lowering *jsxLowering) lowerFormBinding(
	binding formBinding,
	attributes *ast.Node,
) []*ast.Node {
	target := lowering.visitor.VisitNode(binding.target)
	projection := lowering.formBindingProjection(binding, target)
	property := "value"
	if binding.control == "checked" ||
		binding.control == "checkbox-group" ||
		binding.control == "radio" {
		property = "checked"
	}
	eventProperty := "__exactBindChange"
	if binding.event == "input" {
		eventProperty = "__exactBindInput"
	}
	return []*ast.Node{
		lowering.property(
			lowering.factory.NewIdentifier(property),
			lowering.reactiveExpression(binding.target, projection),
		),
		lowering.property(
			lowering.factory.NewIdentifier(eventProperty),
			lowering.formBindingHandler(binding, target, attributes),
		),
	}
}

func (lowering *jsxLowering) serverFormBindingProperty(
	name string,
	initializer *ast.Node,
) *ast.Node {
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
	property := "value"
	if binding.control == "checked" ||
		binding.control == "checkbox-group" ||
		binding.control == "radio" {
		property = "checked"
	}
	return lowering.property(
		lowering.factory.NewIdentifier(property),
		lowering.formBindingProjection(
			binding,
			lowering.visitor.VisitNode(target),
		),
	)
}

func (lowering *jsxLowering) formBindingProjection(
	binding formBinding,
	target *ast.Node,
) *ast.Node {
	switch binding.control {
	case "radio":
		return lowering.binary(
			target,
			ast.KindEqualsEqualsEqualsToken,
			lowering.formBindingOption(binding),
		)
	case "checkbox-group":
		values := lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewArrayLiteralExpression(nil, false),
		)
		return lowering.memberCall(
			lowering.factory.NewParenthesizedExpression(values),
			"includes",
			lowering.convertFormBindingValue(
				binding,
				lowering.formBindingOption(binding),
				false,
			),
		)
	case "checked":
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewFalseExpression(),
		)
	case "multiple":
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewArrayLiteralExpression(nil, false),
		)
	}
	if binding.valueKind == "number" {
		empty := lowering.binary(
			target,
			ast.KindEqualsEqualsToken,
			lowering.factory.NewKeywordExpression(ast.KindNullKeyword),
		)
		nan := lowering.memberCall(
			lowering.factory.NewIdentifier("Number"),
			"isNaN",
			target,
		)
		return lowering.conditional(
			lowering.binary(empty, ast.KindBarBarToken, nan),
			lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
			lowering.call("String", []*ast.Node{target}),
		)
	}
	if binding.valueKind == "string" {
		return lowering.binary(
			target,
			ast.KindQuestionQuestionToken,
			lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
		)
	}
	return target
}

func (lowering *jsxLowering) formBindingHandler(
	binding formBinding,
	target *ast.Node,
	attributes *ast.Node,
) *ast.Node {
	event := lowering.factory.NewIdentifier("event")
	current := lowering.propertyAccess(event, "currentTarget")
	if binding.control == "checkbox-group" {
		return lowering.checkboxGroupBindingHandler(
			binding,
			target,
			event,
			current,
		)
	}
	var next *ast.Node
	switch binding.control {
	case "checked":
		next = lowering.propertyAccess(current, "checked")
	case "radio":
		next = lowering.convertFormBindingValue(
			binding,
			lowering.formBindingOption(binding),
			false,
		)
	case "multiple":
		option := lowering.factory.NewIdentifier("option")
		values := lowering.memberCall(
			lowering.factory.NewIdentifier("Array"),
			"from",
			lowering.propertyAccess(current, "selectedOptions"),
			lowering.arrowWithParameter(
				option,
				lowering.convertFormBindingValue(
					binding,
					lowering.propertyAccess(option, "value"),
					false,
				),
			),
		)
		if binding.empty != "value" {
			next = lowering.conditional(
				lowering.propertyAccess(
					lowering.propertyAccess(current, "selectedOptions"),
					"length",
				),
				values,
				lowering.formBindingEmpty(binding),
			)
		} else {
			next = values
		}
	default:
		value := lowering.propertyAccess(current, "value")
		converted := lowering.convertFormBindingRead(binding, current, value)
		if binding.valueKind == "string" && binding.empty == "value" {
			next = converted
		} else {
			next = lowering.conditional(
				lowering.binary(
					value,
					ast.KindEqualsEqualsEqualsToken,
					lowering.factory.NewStringLiteral("", ast.TokenFlagsNone),
				),
				lowering.formBindingEmpty(binding),
				converted,
			)
		}
	}
	if binding.valueKind == "string" {
		next = lowering.factory.NewAsExpression(
			next,
			lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
		)
	}
	update := lowering.formBindingUpdate(binding, target, next)
	if binding.control == "radio" {
		update = lowering.binary(
			lowering.propertyAccess(current, "checked"),
			ast.KindAmpersandAmpersandToken,
			lowering.factory.NewParenthesizedExpression(update),
		)
	}
	return lowering.formBindingArrow(binding, event, update)
}

func (lowering *jsxLowering) checkboxGroupBindingHandler(
	binding formBinding,
	target *ast.Node,
	event *ast.Node,
	current *ast.Node,
) *ast.Node {
	value := lowering.factory.NewIdentifier("value")
	values := lowering.factory.NewIdentifier("values")
	next := lowering.factory.NewIdentifier("next")
	item := lowering.factory.NewIdentifier("item")
	option := lowering.convertFormBindingValue(
		binding,
		lowering.propertyAccess(current, "value"),
		true,
	)
	currentValues := lowering.binary(
		target,
		ast.KindQuestionQuestionToken,
		lowering.factory.NewArrayLiteralExpression(nil, false),
	)
	added := lowering.conditional(
		lowering.memberCall(values, "includes", value),
		values,
		lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewSpreadElement(values),
				value,
			}),
			false,
		),
	)
	removed := lowering.memberCall(
		values,
		"filter",
		lowering.arrowWithParameter(
			item,
			lowering.binary(item, ast.KindExclamationEqualsEqualsToken, value),
		),
	)
	nextValues := lowering.conditional(
		lowering.propertyAccess(current, "checked"),
		added,
		removed,
	)
	assigned := next
	if binding.empty != "value" {
		assigned = lowering.conditional(
			lowering.propertyAccess(next, "length"),
			next,
			lowering.formBindingEmpty(binding),
		)
	}
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.constStatement(value, option),
			lowering.constStatement(values, currentValues),
			lowering.constStatement(next, nextValues),
			lowering.factory.NewExpressionStatement(
				lowering.formBindingUpdate(binding, target, assigned),
			),
		}),
		true,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewParameterDeclaration(
				nil,
				nil,
				event,
				nil,
				lowering.formBindingEventType(binding),
				nil,
			),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) formBindingArrow(
	binding formBinding,
	event *ast.Node,
	body *ast.Node,
) *ast.Node {
	parameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		event,
		nil,
		lowering.formBindingEventType(binding),
		nil,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) formBindingEventType(binding formBinding) *ast.Node {
	element := "HTMLInputElement"
	if binding.element == "select" {
		element = "HTMLSelectElement"
	} else if binding.element == "textarea" {
		element = "HTMLTextAreaElement"
	}
	currentTarget := lowering.factory.NewPropertySignatureDeclaration(
		lowering.factory.NewModifierList([]*ast.Node{
			lowering.factory.NewModifier(ast.KindReadonlyKeyword),
		}),
		lowering.factory.NewIdentifier("currentTarget"),
		nil,
		lowering.factory.NewTypeReferenceNode(
			lowering.factory.NewIdentifier(element),
			nil,
		),
		nil,
	)
	return lowering.factory.NewIntersectionTypeNode(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewTypeReferenceNode(
				lowering.factory.NewIdentifier("Event"),
				nil,
			),
			lowering.factory.NewTypeLiteralNode(
				lowering.factory.NewNodeList([]*ast.Node{currentTarget}),
			),
		}),
	)
}

func (lowering *jsxLowering) formBindingUpdate(
	binding formBinding,
	target *ast.Node,
	value *ast.Node,
) *ast.Node {
	if len(binding.targetPath) != 0 {
		return lowering.call(
			lowering.names.write,
			[]*ast.Node{
				lowering.stateRoot(),
				lowering.statePath(binding.targetPath),
				lowering.arrow(value),
			},
		)
	}
	return lowering.factory.NewAssignmentExpression(target, value)
}

func (lowering *jsxLowering) formBindingOption(binding formBinding) *ast.Node {
	if binding.option == nil {
		return lowering.factory.NewStringLiteral("", ast.TokenFlagsNone)
	}
	if ast.IsStringLiteral(binding.option) {
		return lowering.factory.NewStringLiteral(
			binding.option.AsStringLiteral().Text,
			ast.TokenFlagsNone,
		)
	}
	return lowering.visitor.VisitNode(binding.option)
}

func (lowering *jsxLowering) formBindingEmpty(binding formBinding) *ast.Node {
	switch binding.empty {
	case "null":
		return lowering.factory.NewKeywordExpression(ast.KindNullKeyword)
	case "undefined":
		return lowering.factory.NewIdentifier("undefined")
	case "number":
		return lowering.propertyAccess(
			lowering.factory.NewIdentifier("Number"),
			"NaN",
		)
	}
	if binding.valueKind == "number" {
		return lowering.propertyAccess(
			lowering.factory.NewIdentifier("Number"),
			"NaN",
		)
	}
	if binding.valueKind == "date" {
		return lowering.factory.NewNewExpression(
			lowering.factory.NewIdentifier("Date"),
			nil,
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.propertyAccess(
					lowering.factory.NewIdentifier("Number"),
					"NaN",
				),
			}),
		)
	}
	return lowering.factory.NewStringLiteral("", ast.TokenFlagsNone)
}

func (lowering *jsxLowering) convertFormBindingRead(
	binding formBinding,
	current *ast.Node,
	value *ast.Node,
) *ast.Node {
	if binding.valueKind == "number" && binding.element == "input" {
		return lowering.propertyAccess(current, "valueAsNumber")
	}
	if binding.valueKind == "date" {
		return lowering.propertyAccess(current, "valueAsDate")
	}
	return lowering.convertFormBindingValue(binding, value, false)
}

func (lowering *jsxLowering) convertFormBindingValue(
	binding formBinding,
	value *ast.Node,
	widenString bool,
) *ast.Node {
	switch binding.valueKind {
	case "number":
		return lowering.call("Number", []*ast.Node{value})
	case "date":
		return lowering.factory.NewNewExpression(
			lowering.factory.NewIdentifier("Date"),
			nil,
			lowering.factory.NewNodeList([]*ast.Node{value}),
		)
	case "string":
		if widenString {
			return lowering.factory.NewAsExpression(
				value,
				lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
			)
		}
	}
	return value
}

func (lowering *jsxLowering) propertyAccess(
	value *ast.Node,
	name string,
) *ast.Node {
	return lowering.factory.NewPropertyAccessExpression(
		value,
		nil,
		lowering.factory.NewIdentifier(name),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) memberCall(
	value *ast.Node,
	name string,
	arguments ...*ast.Node,
) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.propertyAccess(value, name),
		nil,
		nil,
		lowering.factory.NewNodeList(arguments),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) binary(
	left *ast.Node,
	operator ast.Kind,
	right *ast.Node,
) *ast.Node {
	return lowering.factory.NewBinaryExpression(
		nil,
		left,
		nil,
		lowering.factory.NewToken(operator),
		right,
	)
}

func (lowering *jsxLowering) conditional(
	condition *ast.Node,
	whenTrue *ast.Node,
	whenFalse *ast.Node,
) *ast.Node {
	return lowering.factory.NewConditionalExpression(
		condition,
		lowering.factory.NewToken(ast.KindQuestionToken),
		whenTrue,
		lowering.factory.NewToken(ast.KindColonToken),
		whenFalse,
	)
}

func (lowering *jsxLowering) constStatement(
	name *ast.Node,
	value *ast.Node,
) *ast.Node {
	return lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					name,
					nil,
					nil,
					value,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
}
