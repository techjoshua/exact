package exactcompiler

import (
	"strconv"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

type intlRelativeDurationProjection struct {
	value  *ast.Node
	fields []string
	zero   string
}

var intlRelativeDurationFields = map[string]struct{}{
	"years": {}, "months": {}, "weeks": {}, "days": {},
	"hours": {}, "minutes": {}, "seconds": {},
}

func analyzeIntlRelativeDuration(sourceFile *ast.SourceFile, expression *ast.Node, typeChecker *checker.Checker) (intlRelativeDurationProjection, bool) {
	current := unwrapRenderExpression(expression)
	var duration *ast.Node
	fields := []string{}
	seen := map[string]struct{}{}
	for ast.IsConditionalExpression(current) {
		conditional := current.AsConditionalExpression()
		value, field, valid := intlRelativeDurationCondition(conditional.Condition, typeChecker)
		if !valid || !intlSafeRelativeDurationBranch(sourceFile, conditional.WhenTrue, value, field, typeChecker) {
			return intlRelativeDurationProjection{}, false
		}
		if duration != nil && strings.TrimSpace(sourceText(sourceFile, duration)) != strings.TrimSpace(sourceText(sourceFile, value)) {
			return intlRelativeDurationProjection{}, false
		}
		if _, duplicate := seen[field]; duplicate {
			return intlRelativeDurationProjection{}, false
		}
		duration = value
		fields = append(fields, field)
		seen[field] = struct{}{}
		current = unwrapRenderExpression(conditional.WhenFalse)
	}
	zero, valid := intlStringLeaf(current)
	if duration == nil || len(fields) < 2 || !valid {
		return intlRelativeDurationProjection{}, false
	}
	return intlRelativeDurationProjection{value: duration, fields: fields, zero: zero}, true
}

func intlRelativeDurationCondition(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, string, bool) {
	condition := unwrapRenderExpression(expression)
	if !ast.IsBinaryExpression(condition) {
		return nil, "", false
	}
	binary := condition.AsBinaryExpression()
	if binary.OperatorToken.Kind != ast.KindGreaterThanToken {
		return nil, "", false
	}
	value, _, literal := intlFiniteLiteral(nil, binary.Right)
	if !literal || value != "0" {
		return nil, "", false
	}
	access, valid := intlMathAbsProperty(binary.Left, typeChecker)
	if !valid {
		return nil, "", false
	}
	field := access.AsPropertyAccessExpression().Name().Text()
	if _, supported := intlRelativeDurationFields[field]; !supported {
		return nil, "", false
	}
	return access.AsPropertyAccessExpression().Expression, field, true
}

func intlMathAbsProperty(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, bool) {
	value := unwrapRenderExpression(expression)
	if !ast.IsCallExpression(value) {
		return nil, false
	}
	call := value.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(operation.Expression) || operation.Expression.Text() != "Math" || operation.Name().Text() != "abs" || typeChecker == nil || !standardLibraryValue(operation.Expression, typeChecker) {
		return nil, false
	}
	argument := unwrapRenderExpression(call.Arguments.Nodes[0])
	return argument, ast.IsPropertyAccessExpression(argument)
}

// Only the canonical past-tense template can become the fixed relative-duration formatter.
// Arbitrary arithmetic or prose is authored behavior, not evidence of this formatter's semantics.
func intlSafeRelativeDurationBranch(sourceFile *ast.SourceFile, expression *ast.Node, value *ast.Node, field string, typeChecker *checker.Checker) bool {
	expression = unwrapRenderExpression(expression)
	if !ast.IsTemplateExpression(expression) {
		return false
	}
	template := expression.AsTemplateExpression()
	if template.Head.Text() != "" || len(template.TemplateSpans.Nodes) != 2 {
		return false
	}
	number := template.TemplateSpans.Nodes[0].AsTemplateSpan()
	plural := template.TemplateSpans.Nodes[1].AsTemplateSpan()
	expected := strings.TrimSpace(sourceText(sourceFile, value)) + "." + field
	matches := func(node *ast.Node) bool {
		access, valid := intlMathAbsProperty(unwrapRenderExpression(node), typeChecker)
		return valid && strings.TrimSpace(sourceText(sourceFile, access)) == expected
	}
	if !matches(number.Expression) || number.Literal.Text() != " "+strings.TrimSuffix(field, "s") || plural.Literal.Text() != " ago" {
		return false
	}
	condition := unwrapRenderExpression(plural.Expression)
	if !ast.IsConditionalExpression(condition) {
		return false
	}
	selection := condition.AsConditionalExpression()
	check := unwrapRenderExpression(selection.Condition)
	if !ast.IsBinaryExpression(check) {
		return false
	}
	binary := check.AsBinaryExpression()
	one, _, literal := intlFiniteLiteral(nil, binary.Right)
	singular, singularValid := intlStringLeaf(selection.WhenTrue)
	multiple, multipleValid := intlStringLeaf(selection.WhenFalse)
	return binary.OperatorToken.Kind == ast.KindEqualsEqualsEqualsToken && matches(binary.Left) && literal && one == "1" && singularValid && singular == "" && multipleValid && multiple == "s"
}

type intlOrdinalProjection struct {
	selector *ast.Node
	cases    []intlPatternCase
	fallback string
}

type intlPluralRuleProjection struct {
	selectors []*ast.Node
	selection string
	cases     []intlPatternCase
	fallback  []intlPatternNode
}

func analyzeIntlPluralRuleLookup(
	typeChecker *checker.Checker,
	expression *ast.Node,
) (intlPluralRuleProjection, bool) {
	if !ast.IsElementAccessExpression(expression) {
		return intlPluralRuleProjection{}, false
	}
	access := expression.AsElementAccessExpression()
	choices := intlConstInitializer(typeChecker, access.Expression)
	if choices == nil {
		choices = unwrapRenderExpression(access.Expression)
	}
	options, valid := intlObjectOptions(choices)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	selectors, selection, valid := intlPluralRulesSelect(typeChecker, access.ArgumentExpression)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	fallbackValue, valid := options["other"].(string)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	cases := []intlPatternCase{}
	for _, category := range []string{"zero", "one", "two", "few", "many"} {
		if value, exists := options[category]; exists {
			text, valid := value.(string)
			if !valid {
				return intlPluralRuleProjection{}, false
			}
			cases = append(cases, intlPatternCase{
				Key: category, Value: []intlPatternNode{{Kind: "text", Value: text}},
			})
		}
	}
	for name := range options {
		if name != "zero" && name != "one" && name != "two" && name != "few" && name != "many" && name != "other" {
			return intlPluralRuleProjection{}, false
		}
	}
	return intlPluralRuleProjection{
		selectors: selectors, selection: selection, cases: cases,
		fallback: []intlPatternNode{{Kind: "text", Value: fallbackValue}},
	}, true
}

func intlPluralRulesSelect(
	typeChecker *checker.Checker,
	expression *ast.Node,
) ([]*ast.Node, string, bool) {
	if !ast.IsCallExpression(expression) || ast.IsOptionalChain(expression) {
		return nil, "", false
	}
	call := expression.AsCallExpression()
	if call.Arguments == nil || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, "", false
	}
	member := call.Expression.AsPropertyAccessExpression()
	method := member.Name().Text()
	expectedArguments := 1
	if method == "selectRange" {
		expectedArguments = 2
	} else if method != "select" {
		return nil, "", false
	}
	if len(call.Arguments.Nodes) != expectedArguments {
		return nil, "", false
	}
	rules := intlConstInitializer(typeChecker, member.Expression)
	if rules == nil {
		rules = unwrapRenderExpression(member.Expression)
	}
	constructor, arguments, valid := intlConstructor(rules, typeChecker)
	if !valid || constructor != "PluralRules" || arguments == nil || len(arguments.Nodes) < 1 || len(arguments.Nodes) > 2 {
		return nil, "", false
	}
	locale := unwrapRenderExpression(arguments.Nodes[0])
	if !ast.IsStringLiteral(locale) && !ast.IsNoSubstitutionTemplateLiteral(locale) {
		return nil, "", false
	}
	if !intlExtractableLocale(locale.Text()) {
		return nil, "", false
	}
	options, valid := intlObjectOptions(intlArgument(arguments, 1))
	if !valid {
		return nil, "", false
	}
	selection := "plural-cardinal"
	for name, value := range options {
		if name != "type" {
			return nil, "", false
		}
		kind, valid := value.(string)
		if !valid || (kind != "cardinal" && kind != "ordinal") {
			return nil, "", false
		}
		if kind == "ordinal" {
			selection = "plural-ordinal"
		}
	}
	if method == "selectRange" {
		if selection == "plural-ordinal" {
			selection = "plural-range-ordinal"
		} else {
			selection = "plural-range-cardinal"
		}
	}
	selectors := make([]*ast.Node, 0, expectedArguments)
	for _, argument := range call.Arguments.Nodes {
		selector := unwrapRenderExpression(argument)
		if !intlScalarExpression(selector) || typeChecker == nil || !intlHomogeneousPrimitive(typeChecker.GetTypeAtLocation(selector), "number") {
			return nil, "", false
		}
		selectors = append(selectors, selector)
	}
	return selectors, selection, true
}

func intlConstInitializer(typeChecker *checker.Checker, expression *ast.Node) *ast.Node {
	expression = unwrapRenderExpression(expression)
	if !ast.IsIdentifier(expression) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil || len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.Declarations[0]) {
		return nil
	}
	declaration := symbol.Declarations[0]
	if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	if !intlConstLookupUnmodified(symbol, typeChecker) {
		return nil
	}
	return unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
}

func analyzeIntlOrdinalMarker(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	ordinalMarkers map[string]struct{},
	typeChecker *checker.Checker,
) (intlOrdinalProjection, bool) {
	current := unwrapRenderExpression(expression)
	var selector *ast.Node
	cases := []intlPatternCase{}
	suffixes := []string{}
	seen := map[string]bool{}
	for ast.IsConditionalExpression(current) {
		conditional := current.AsConditionalExpression()
		condition := unwrapRenderExpression(conditional.Condition)
		if !ast.IsBinaryExpression(condition) {
			return intlOrdinalProjection{}, false
		}
		binary := condition.AsBinaryExpression()
		if binary.OperatorToken.Kind != ast.KindEqualsEqualsEqualsToken && binary.OperatorToken.Kind != ast.KindEqualsEqualsToken {
			return intlOrdinalProjection{}, false
		}
		left, _, leftLiteral := intlFiniteLiteral(sourceFile, binary.Left)
		right, _, rightLiteral := intlFiniteLiteral(sourceFile, binary.Right)
		candidate, value := binary.Left, right
		if leftLiteral {
			candidate, value = binary.Right, left
		} else if !rightLiteral {
			return intlOrdinalProjection{}, false
		}
		if _, err := strconv.Atoi(value); err != nil || !intlScalarExpression(candidate) || typeChecker == nil || !intlHomogeneousPrimitive(typeChecker.GetTypeAtLocation(candidate), "number") {
			return intlOrdinalProjection{}, false
		}
		if seen[value] {
			return intlOrdinalProjection{}, false
		}
		seen[value] = true
		suffix, valid := intlStringLeaf(conditional.WhenTrue)
		if !valid {
			return intlOrdinalProjection{}, false
		}
		if selector != nil && strings.TrimSpace(sourceText(sourceFile, selector)) != strings.TrimSpace(sourceText(sourceFile, candidate)) {
			return intlOrdinalProjection{}, false
		}
		selector = candidate
		suffixes = append(suffixes, suffix)
		cases = append(cases, intlPatternCase{Key: "=" + value, Value: []intlPatternNode{{Kind: "text", Value: suffix}}})
		current = unwrapRenderExpression(conditional.WhenFalse)
	}
	fallback, valid := intlStringLeaf(current)
	if selector == nil || len(cases) < 2 || !valid {
		return intlOrdinalProjection{}, false
	}
	suffixes = append(suffixes, fallback)
	for _, suffix := range suffixes {
		if _, supported := ordinalMarkers[suffix]; !supported {
			return intlOrdinalProjection{}, false
		}
	}
	return intlOrdinalProjection{selector: selector, cases: cases, fallback: fallback}, true
}

func intlStringLeaf(expression *ast.Node) (string, bool) {
	value := unwrapRenderExpression(expression)
	if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
		return value.Text(), true
	}
	return "", false
}

func analyzeIntlRelativeTime(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, *ast.Node, map[string]any, bool) {
	if !ast.IsCallExpression(expression) || ast.IsOptionalChain(expression) {
		return nil, nil, nil, false
	}
	call := expression.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 2 || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, nil, nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if operation.Name().Text() != "format" {
		return nil, nil, nil, false
	}
	constructorName, constructorArguments, supported := intlConstructor(operation.Expression, typeChecker)
	if !supported || constructorName != "RelativeTimeFormat" || !intlInertLocaleArguments(constructorArguments, typeChecker) {
		return nil, nil, nil, false
	}
	options, valid := intlObjectOptions(intlArgument(constructorArguments, 1))
	if !valid {
		return nil, nil, nil, false
	}
	return call.Arguments.Nodes[0], call.Arguments.Nodes[1], options, true
}

func analyzeNativeIntlFormatter(expression *ast.Node, typeChecker *checker.Checker) ([]*ast.Node, string, map[string]any, bool) {
	// Extracted values cannot carry an optional call's skipped receiver and argument evaluation.
	if !ast.IsCallExpression(expression) || ast.IsOptionalChain(expression) {
		return nil, "", nil, false
	}
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, "", nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	method := operation.Name().Text()
	if method == "toLocaleString" || method == "toLocaleDateString" || method == "toLocaleTimeString" {
		if !intlInertLocaleArguments(call.Arguments, typeChecker) {
			return nil, "", nil, false
		}
		temporalKind := intlTemporalExpressionKind(operation.Expression, typeChecker)
		date := typeChecker != nil && standardLibraryCallOwner(call, typeChecker) == "Date"
		if temporalKind != "" && !nativeDeclarationSymbol(typeChecker.GetSymbolAtLocation(operation.Name())) {
			return nil, "", nil, false
		}
		if method == "toLocaleString" && temporalKind == "temporal-duration" {
			options, valid := intlObjectOptions(intlArgument(call.Arguments, 1))
			if !valid {
				return nil, "", nil, false
			}
			return []*ast.Node{operation.Expression}, temporalKind, map[string]any{
				"kind": "duration", "options": options,
			}, true
		}
		if (temporalKind != "" && temporalKind != "temporal-duration") || date {
			options, valid := intlObjectOptions(intlArgument(call.Arguments, 1))
			if !valid {
				return nil, "", nil, false
			}
			if date && !intlDateProjectionOptions(method, options) {
				return nil, "", nil, false
			}
			if date {
				temporalKind = "temporal-instant"
			}
			return []*ast.Node{operation.Expression}, temporalKind, map[string]any{
				"kind": "date-time", "temporalKind": temporalKind, "options": options,
			}, true
		}
	}
	if method == "of" && call.Arguments != nil && len(call.Arguments.Nodes) == 1 {
		constructorName, constructorArguments, supported := intlConstructor(operation.Expression, typeChecker)
		if supported && constructorName == "DisplayNames" && intlInertLocaleArguments(constructorArguments, typeChecker) {
			options, valid := intlObjectOptions(intlArgument(constructorArguments, 1))
			domain, domainValid := options["type"].(string)
			if valid && domainValid {
				return call.Arguments.Nodes, "string", map[string]any{
					"kind": "display-name", "domain": domain,
					"options": intlWithoutOptions(options, "type"),
				}, true
			}
		}
	}
	if method != "format" && method != "formatRange" {
		return nil, "", nil, false
	}
	rangeFormat := method == "formatRange"
	expectedArguments := 1
	if rangeFormat {
		expectedArguments = 2
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) != expectedArguments {
		return nil, "", nil, false
	}
	constructorName, constructorArguments, supported := intlConstructor(operation.Expression, typeChecker)
	if !supported || !intlInertLocaleArguments(constructorArguments, typeChecker) {
		return nil, "", nil, false
	}
	options, optionsSupported := intlObjectOptions(intlArgument(constructorArguments, 1))
	if !optionsSupported {
		return nil, "", nil, false
	}
	values := append([]*ast.Node(nil), call.Arguments.Nodes...)
	switch constructorName {
	case "DateTimeFormat":
		formatter := map[string]any{
			"kind": "date-time", "temporalKind": "temporal-date-time", "options": options,
		}
		if rangeFormat {
			formatter["range"] = true
		}
		return values, "temporal-date-time", formatter, true
	case "DurationFormat":
		if rangeFormat {
			return nil, "", nil, false
		}
		return values, "temporal-duration", map[string]any{
			"kind": "duration", "options": options,
		}, true
	case "NumberFormat":
		style, _ := options["style"].(string)
		if style == "currency" {
			currency, valid := options["currency"].(string)
			if !valid {
				return nil, "", nil, false
			}
			display, _ := options["currencyDisplay"].(string)
			if display == "" {
				display = "symbol"
			}
			projected := intlWithoutOptions(options, "style", "currency", "currencyDisplay")
			return values, "monetary", map[string]any{
				"kind": "currency", "currency": currency, "display": display, "options": projected,
			}, true
		}
		if style == "unit" {
			unit, valid := options["unit"].(string)
			if !valid || !intlNativeUnitIdentifier(unit) {
				return nil, "", nil, false
			}
			return values, "measurement", map[string]any{
				"kind": "unit", "quantity": "unit", "usage": "default",
				"sourceUnit": unit, "options": intlWithoutOptions(options, "style", "unit"),
			}, true
		}
		return values, "number", map[string]any{
			"kind": "number", "options": options,
		}, true
	case "ListFormat":
		if typeChecker == nil || !intlStringArray(typeChecker.GetTypeAtLocation(values[0]), typeChecker) {
			return nil, "", nil, false
		}
		return values, "string", map[string]any{"kind": "list", "options": options}, true
	}
	return nil, "", nil, false
}

func intlTemporalExpressionKind(expression *ast.Node, typeChecker *checker.Checker) string {
	if expression == nil || typeChecker == nil {
		return ""
	}
	return intlTemporalTypeKind(typeChecker.GetTypeAtLocation(expression))
}

func intlConstructor(expression *ast.Node, typeChecker *checker.Checker) (string, *ast.NodeList, bool) {
	if expression == nil || ast.IsOptionalChain(expression) {
		return "", nil, false
	}
	var target *ast.Node
	var arguments *ast.NodeList
	switch {
	case ast.IsCallExpression(expression):
		call := expression.AsCallExpression()
		target, arguments = call.Expression, call.Arguments
	case ast.IsNewExpression(expression):
		constructor := expression.AsNewExpression()
		target, arguments = constructor.Expression, constructor.Arguments
	default:
		return "", nil, false
	}
	if !ast.IsPropertyAccessExpression(target) {
		return "", nil, false
	}
	member := target.AsPropertyAccessExpression()
	if !ast.IsIdentifier(member.Expression) || member.Expression.Text() != "Intl" || typeChecker == nil || !intlNativeNamespaceValue(member.Expression, typeChecker) {
		return "", nil, false
	}
	return member.Name().Text(), arguments, true
}

func intlArgument(arguments *ast.NodeList, index int) *ast.Node {
	if arguments == nil || index < 0 || index >= len(arguments.Nodes) {
		return nil
	}
	return arguments.Nodes[index]
}

func intlObjectOptions(node *ast.Node) (map[string]any, bool) {
	if node == nil {
		return map[string]any{}, true
	}
	if !ast.IsObjectLiteralExpression(node) {
		return nil, false
	}
	result := map[string]any{}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) {
			return nil, false
		}
		assignment := property.AsPropertyAssignment()
		propertyName := assignment.Name()
		if propertyName == nil {
			return nil, false
		}
		if ast.IsComputedPropertyName(propertyName) {
			propertyName = unwrapRenderExpression(propertyName.AsComputedPropertyName().Expression)
			if !ast.IsStringLiteral(propertyName) && !ast.IsNoSubstitutionTemplateLiteral(propertyName) {
				return nil, false
			}
		}
		name := propertyName.Text()
		value := unwrapRenderExpression(assignment.Initializer)
		switch {
		case ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value):
			result[name] = value.Text()
		case ast.IsNumericLiteral(value):
			number, err := strconv.ParseFloat(value.Text(), 64)
			if err != nil {
				return nil, false
			}
			result[name] = number
		case value.Kind == ast.KindTrueKeyword:
			result[name] = true
		case value.Kind == ast.KindFalseKeyword:
			result[name] = false
		default:
			return nil, false
		}
	}
	return result, true
}

func intlWithoutOptions(input map[string]any, names ...string) map[string]any {
	removed := map[string]struct{}{}
	for _, name := range names {
		removed[name] = struct{}{}
	}
	result := map[string]any{}
	for name, value := range input {
		if _, skip := removed[name]; !skip {
			result[name] = value
		}
	}
	return result
}

type intlSelection struct {
	selector    *ast.Node
	bindingType string
	selection   string
	trueKey     string
}

func analyzeIntlSelection(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	condition *ast.Node,
) (intlSelection, bool) {
	condition = unwrapRenderExpression(condition)
	if ast.IsBinaryExpression(condition) {
		binary := condition.AsBinaryExpression()
		if binary.OperatorToken.Kind == ast.KindEqualsEqualsEqualsToken ||
			binary.OperatorToken.Kind == ast.KindEqualsEqualsToken {
			leftValue, leftType, leftLiteral := intlFiniteLiteral(sourceFile, binary.Left)
			rightValue, rightType, rightLiteral := intlFiniteLiteral(sourceFile, binary.Right)
			selector, literal, bindingType := binary.Left, rightValue, rightType
			if leftLiteral {
				selector, literal, bindingType = binary.Right, leftValue, leftType
			} else if !rightLiteral {
				selector = nil
			}
			if selector != nil && intlScalarExpression(selector) && typeChecker != nil && intlHomogeneousPrimitive(typeChecker.GetTypeAtLocation(selector), bindingType) {
				selection, trueKey := "exact", literal
				if bindingType == "number" && literal == "1" {
					selection, trueKey = "plural-cardinal", "=1"
				}
				return intlSelection{selector, bindingType, selection, trueKey}, true
			}
		}
	}
	if intlScalarExpression(condition) && !ast.IsStringLiteral(condition) && !ast.IsNumericLiteral(condition) {
		return intlSelection{condition, "boolean", "boolean", "true"}, true
	}
	if typeChecker != nil &&
		typeChecker.GetTypeAtLocation(condition).Flags()&checker.TypeFlagsBooleanLike != 0 &&
		safeReactiveInitializer(condition, sourceFile, typeChecker) {
		return intlSelection{condition, "boolean", "boolean", "true"}, true
	}
	return intlSelection{}, false
}

func intlFiniteLiteral(sourceFile *ast.SourceFile, expression *ast.Node) (string, string, bool) {
	expression = unwrapRenderExpression(expression)
	switch {
	case ast.IsStringLiteral(expression) || ast.IsNoSubstitutionTemplateLiteral(expression):
		return expression.Text(), "string", true
	case ast.IsNumericLiteral(expression):
		value, err := strconv.ParseFloat(expression.Text(), 64)
		if err != nil {
			return "", "", false
		}
		return strconv.FormatFloat(value, 'f', -1, 64), "number", true
	case expression.Kind == ast.KindTrueKeyword:
		return "true", "boolean", true
	case expression.Kind == ast.KindFalseKeyword:
		return "false", "boolean", true
	default:
		return "", "", false
	}
}

func registerIntlScalar(sourceFile *ast.SourceFile, expression *ast.Node, build *intlPatternBuild) int {
	identity := strings.TrimSpace(sourceText(sourceFile, expression))
	// Only direct primitive reads can be reused between potentially effectful
	// expressions. Property access may invoke a getter, and a call can change
	// the value of an identifier read later in the same message.
	switch expression.Kind {
	case ast.KindIdentifier, ast.KindNumericLiteral, ast.KindStringLiteral:
	default:
		clear(build.identities)
	}
	if binding, found := build.identities[identity]; found {
		return binding
	}
	binding := len(build.bindings)
	bindingType := "string"
	if ast.IsNumericLiteral(expression) {
		bindingType = "number"
	}
	start := scanner.SkipTrivia(sourceFile.Text(), expression.Pos())
	build.bindings = append(build.bindings, intlBinding{Index: binding, Kind: "value", Type: bindingType})
	build.values = append(build.values, intlSpan{Start: start, Length: expression.End() - start})
	build.identities[identity] = binding
	return binding
}

func registerIntlSelector(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	bindingType string,
	build *intlPatternBuild,
) int {
	binding := registerIntlScalar(sourceFile, expression, build)
	build.bindings[binding].Kind = "selector"
	build.bindings[binding].Type = bindingType
	if build.selectorExpressions == nil {
		build.selectorExpressions = map[int]string{}
	}
	build.selectorExpressions[binding] = strings.TrimSpace(sourceText(sourceFile, expression))
	return binding
}

func registerIntlTypedScalar(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	bindingType string,
	build *intlPatternBuild,
) int {
	binding := registerIntlScalar(sourceFile, expression, build)
	build.bindings[binding].Type = bindingType
	return binding
}

// Prepared scalar calls keep their evaluated result. Their implementation is never inferred or rewritten.
func intlScalarValue(expression *ast.Node, typeChecker *checker.Checker) bool {
	return intlScalarExpression(expression) || (ast.IsCallExpression(expression) && typeChecker != nil && scalarDerivedType(typeChecker.GetTypeAtLocation(expression)))
}

func intlScalarExpression(expression *ast.Node) bool {
	return ast.IsIdentifier(expression) || ast.IsPropertyAccessExpression(expression) ||
		ast.IsElementAccessExpression(expression) || ast.IsStringLiteral(expression) ||
		ast.IsNumericLiteral(expression)
}

func intlOwner(node *ast.Node, components []Component) (int, string) {
	owner := -1
	ownerLength := int(^uint(0) >> 1)
	ownerID := ""
	for index, component := range components {
		end := component.Start + component.Length
		if component.Start <= node.Pos() && end >= node.End() && component.Length < ownerLength {
			owner, ownerLength, ownerID = index, component.Length, component.ID
		}
	}
	return owner, ownerID
}

func intlChildrenSpan(children []*ast.Node, fallback int) (int, int) {
	if len(children) == 0 {
		return fallback, fallback
	}
	start := children[0].Pos()
	end := children[len(children)-1].End()
	return start, end
}

func normalizeIntlJSXText(value string) string {
	return normalizeJSXText(value)
}
