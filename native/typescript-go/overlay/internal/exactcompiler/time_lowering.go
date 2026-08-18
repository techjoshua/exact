package exactcompiler

import (
	"math"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// inferTimeChangePlan builds a finite data plan while preserving conditional phase changes. It
// deliberately selects no polling fallback: callers can distinguish an unbounded clock dependency
// from a clock-independent branch and issue the auto-policy diagnostic.
func (lowering *jsxLowering) inferTimeChangePlan(node *ast.Node, visited map[ast.SymbolId]struct{}) (*ast.Node, bool) {
	node = unwrapRenderExpression(node)
	if initializer := lowering.timeIdentifierInitializer(node, visited); initializer != nil {
		return lowering.inferTimeChangePlan(initializer, visited)
	}
	if temporal, supported := lowering.temporalRoundedDurationPlan(node); supported {
		return temporal, true
	}
	if formatter, supported := lowering.standardTimeFormatterPlan(node, cloneTimeVisited(visited)); supported {
		return formatter, true
	}
	if ast.IsConditionalExpression(node) {
		conditional := node.AsConditionalExpression()
		whenTrue, trueSupported := lowering.inferTimeChangePlan(conditional.WhenTrue, cloneTimeVisited(visited))
		whenFalse, falseSupported := lowering.inferTimeChangePlan(conditional.WhenFalse, cloneTimeVisited(visited))
		if !trueSupported {
			whenTrue = lowering.completeTimePlan()
		}
		if !falseSupported {
			whenFalse = lowering.completeTimePlan()
		}
		if plan, supported := lowering.timeAbsoluteConditionPlan(
			conditional.Condition,
			whenTrue,
			whenFalse,
			cloneTimeVisited(visited),
		); supported {
			return plan, true
		}
		threshold, trueBefore, thresholdSupported := lowering.timeConditionThreshold(conditional.Condition, cloneTimeVisited(visited))
		if thresholdSupported {
			if trueSupported || falseSupported || timeExpressionHasClockDependency(conditional.Condition, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
				if !trueBefore {
					whenTrue, whenFalse = whenFalse, whenTrue
				}
				return lowering.thresholdTimePlan(threshold, whenTrue, whenFalse), true
			}
		}
	}

	plans := []*ast.Node{}
	walkNode(node, func(candidate *ast.Node) bool {
		if candidate != node && lowering.nodeHasDirectTimeUpdate(candidate) {
			return false
		}
		if candidate != node && ast.IsConditionalExpression(candidate) {
			if plan, supported := lowering.inferTimeChangePlan(candidate, cloneTimeVisited(visited)); supported {
				plans = append(plans, plan)
			}
			return false
		}
		if candidateAnchor, candidateQuantum, candidateBoundary, supported := lowering.timeQuantizationForExpression(candidate, cloneTimeVisited(visited)); supported {
			plans = append(plans, lowering.quantizedTimePlan(candidateAnchor, candidateQuantum, candidateBoundary))
			return false
		}
		if formatter, supported := lowering.standardTimeFormatterPlan(candidate, cloneTimeVisited(visited)); supported {
			plans = append(plans, formatter)
			return false
		}
		if ast.IsIdentifier(candidate) && !ast.IsDeclarationName(candidate) && !isStaticPropertyName(candidate) {
			candidateVisited := cloneTimeVisited(visited)
			if initializer := lowering.timeIdentifierInitializer(candidate, candidateVisited); initializer != nil {
				if plan, supported := lowering.inferTimeChangePlan(initializer, candidateVisited); supported {
					plans = append(plans, plan)
					return false
				}
			}
		}
		return true
	})
	if len(plans) == 0 {
		return nil, false
	}
	if len(plans) == 1 {
		return plans[0], true
	}
	return lowering.earliestTimePlan(plans), true
}

// temporalRoundedDurationPlan recognizes fixed-unit Temporal duration rounding whose moving
// endpoint is an opted-in clock read. Half-expand, directed, and truncating modes retain their
// exact fixed-unit boundary alignment. Calendar-relative duration rounding remains
// diagnostic because its boundaries require the authored relativeTo calendar context.
func (lowering *jsxLowering) temporalRoundedDurationPlan(node *ast.Node) (*ast.Node, bool) {
	anchor, quantum, boundary, supported := temporalRoundedDurationSensitivity(node)
	if !supported {
		return nil, false
	}
	return lowering.quantizedTimePlan(
		lowering.propertyAccess(anchor, "epochMilliseconds"),
		quantum,
		boundary,
	), true
}

func temporalRoundedDurationSensitivity(node *ast.Node) (*ast.Node, float64, string, bool) {
	node = unwrapRenderExpression(node)
	if !ast.IsCallExpression(node) || !ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
		return nil, 0, "", false
	}
	roundCall := node.AsCallExpression()
	roundMember := roundCall.Expression.AsPropertyAccessExpression()
	if roundMember.Name().Text() != "round" || roundCall.Arguments == nil || len(roundCall.Arguments.Nodes) != 1 {
		return nil, 0, "", false
	}
	duration := unwrapRenderExpression(roundMember.Expression)
	if !ast.IsCallExpression(duration) || !ast.IsPropertyAccessExpression(duration.AsCallExpression().Expression) {
		return nil, 0, "", false
	}
	durationCall := duration.AsCallExpression()
	durationMember := durationCall.Expression.AsPropertyAccessExpression()
	method := durationMember.Name().Text()
	if (method != "until" && method != "since") || durationCall.Arguments == nil || len(durationCall.Arguments.Nodes) != 1 {
		return nil, 0, "", false
	}
	base := unwrapRenderExpression(durationMember.Expression)
	argument := unwrapRenderExpression(durationCall.Arguments.Nodes[0])
	baseClock := timeTemporalNowCall(base)
	argumentClock := timeTemporalNowCall(argument)
	if baseClock == argumentClock {
		return nil, 0, "", false
	}
	anchor := base
	if baseClock {
		anchor = argument
	}
	unit, increment, roundingMode, supported := temporalRoundOptions(roundCall.Arguments.Nodes[0])
	if !supported {
		return nil, 0, "", false
	}
	quantum, fixed := temporalFixedUnitMilliseconds(unit)
	if !fixed || quantum < 1 {
		return nil, 0, "", false
	}
	quantum *= increment
	increasing := (method == "since" && baseClock) || (method == "until" && argumentClock)
	boundary := "floor-increasing"
	if strings.HasPrefix(roundingMode, "half") || roundingMode == "" {
		boundary = "half-expand-decreasing"
		if increasing {
			boundary = "half-expand-increasing"
		}
	}
	return anchor, quantum, boundary, true
}

func temporalRoundOptions(node *ast.Node) (string, float64, string, bool) {
	node = unwrapRenderExpression(node)
	if ast.IsStringLiteral(node) || ast.IsNoSubstitutionTemplateLiteral(node) {
		return node.Text(), 1, "", true
	}
	if !ast.IsObjectLiteralExpression(node) {
		return "", 0, "", false
	}
	unit := ""
	roundingMode := ""
	increment := 1.0
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) {
			continue
		}
		name := property.AsPropertyAssignment().Name().Text()
		value := unwrapRenderExpression(property.AsPropertyAssignment().Initializer)
		switch name {
		case "smallestUnit":
			if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
				unit = value.Text()
			}
		case "roundingMode":
			if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
				roundingMode = value.Text()
			}
		case "roundingIncrement":
			if parsed, ok := timeNumericLiteral(value); ok && parsed > 0 && math.Trunc(parsed) == parsed {
				increment = parsed
			} else {
				return "", 0, "", false
			}
		}
	}
	return unit, increment, roundingMode, unit != ""
}

func temporalFixedUnitMilliseconds(unit string) (float64, bool) {
	switch strings.TrimSuffix(unit, "s") {
	case "nanosecond":
		return 0.000001, true
	case "microsecond":
		return 0.001, true
	case "millisecond":
		return 1, true
	case "second":
		return 1_000, true
	case "minute":
		return 60_000, true
	case "hour":
		return 3_600_000, true
	default:
		return 0, false
	}
}

// timeAbsoluteConditionPlan preserves both transitions of a finite Math.abs window. A single
// threshold cannot represent the future -> near -> past phases used by signed relative-time
// views, but two nested threshold nodes can do so without executable plan metadata.
func (lowering *jsxLowering) timeAbsoluteConditionPlan(
	node *ast.Node,
	whenTrue *ast.Node,
	whenFalse *ast.Node,
	visited map[ast.SymbolId]struct{},
) (*ast.Node, bool) {
	node = unwrapRenderExpression(node)
	if initializer := lowering.timeIdentifierInitializer(node, visited); initializer != nil {
		return lowering.timeAbsoluteConditionPlan(initializer, whenTrue, whenFalse, visited)
	}
	if !ast.IsBinaryExpression(node) {
		return nil, false
	}
	binary := node.AsBinaryExpression()
	comparison, literalNode := binary.Left, binary.Right
	operator := binary.OperatorToken.Kind
	literal, supported := timeNumericLiteral(literalNode)
	if !supported {
		literal, supported = timeNumericLiteral(binary.Left)
		if !supported {
			return nil, false
		}
		comparison = binary.Right
		operator = reverseTimeComparison(operator)
	}
	comparison = unwrapRenderExpression(comparison)
	if !ast.IsCallExpression(comparison) {
		return nil, false
	}
	absCall := comparison.AsCallExpression()
	if absCall.Arguments == nil || len(absCall.Arguments.Nodes) != 1 ||
		!ast.IsPropertyAccessExpression(absCall.Expression) {
		return nil, false
	}
	abs := absCall.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(abs.Expression) || abs.Expression.Text() != "Math" || abs.Name().Text() != "abs" ||
		literal < 0 || math.Trunc(literal) != literal {
		return nil, false
	}
	anchor, quantum, boundary, supported := lowering.timeQuantizationForExpression(absCall.Arguments.Nodes[0], visited)
	if !supported || (boundary != "floor-increasing" && boundary != "ceil-decreasing") {
		return nil, false
	}
	var startOffset, endOffset float64
	trueInside := true
	switch operator {
	case ast.KindLessThanToken:
		if literal == 0 {
			return whenFalse, true
		}
		startOffset, endOffset = -(literal-1)*quantum, literal*quantum
	case ast.KindLessThanEqualsToken:
		startOffset, endOffset = -literal*quantum, (literal+1)*quantum
	case ast.KindGreaterThanToken:
		startOffset, endOffset, trueInside = -literal*quantum, (literal+1)*quantum, false
	case ast.KindGreaterThanEqualsToken:
		if literal == 0 {
			return whenTrue, true
		}
		startOffset, endOffset, trueInside = -(literal-1)*quantum, literal*quantum, false
	default:
		return nil, false
	}
	inside, outside := whenTrue, whenFalse
	if !trueInside {
		inside, outside = whenFalse, whenTrue
	}
	return lowering.thresholdTimePlan(
		lowering.timeOffsetExpression(anchor, startOffset),
		outside,
		lowering.thresholdTimePlan(
			lowering.timeOffsetExpression(anchor, endOffset),
			inside,
			outside,
		),
	), true
}

func (lowering *jsxLowering) nodeHasDirectTimeUpdate(node *ast.Node) bool {
	var opening *ast.Node
	switch {
	case ast.IsJsxElement(node):
		opening = node.AsJsxElement().OpeningElement
	case ast.IsJsxSelfClosingElement(node):
		opening = node
	default:
		return false
	}
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	application, exists := lowering.enhancementImports.applications[attributes.Pos()]
	return exists && timeUpdateIdentity(application) != ""
}

func (lowering *jsxLowering) standardTimeFormatterPlan(node *ast.Node, visited map[ast.SymbolId]struct{}) (*ast.Node, bool) {
	if value, _, _, supported := analyzeIntlRelativeTime(node); supported {
		return lowering.inferTimeChangePlan(value, visited)
	}
	values, _, formatter, supported := analyzeNativeIntlFormatter(node, lowering.checker)
	if !supported {
		return nil, false
	}
	if formatter["kind"] == "duration" {
		plans := []*ast.Node{}
		for _, value := range values {
			if plan, inferred := lowering.inferTimeChangePlan(value, cloneTimeVisited(visited)); inferred {
				plans = append(plans, plan)
			}
		}
		if len(plans) == 1 {
			return plans[0], true
		}
		if len(plans) > 1 {
			return lowering.earliestTimePlan(plans), true
		}
		return nil, false
	}
	if formatter["kind"] != "date-time" {
		return nil, false
	}
	clockDependent := false
	for _, value := range values {
		if timeExpressionHasClockDependency(value, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
			clockDependent = true
			break
		}
	}
	if !clockDependent {
		return nil, false
	}
	options, _ := formatter["options"].(map[string]any)
	unit, quantum := timeFormatterSensitivity(options)
	if quantum > 0 {
		return lowering.quantizedTimePlan(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone), quantum, "floor-increasing"), true
	}
	return lowering.calendarTimePlan(unit, options), true
}

func timeFormatterSensitivity(options map[string]any) (string, float64) {
	if digits, ok := options["fractionalSecondDigits"].(float64); ok && digits > 0 {
		return "", 1000 / math.Pow(10, digits)
	}
	if _, present := options["second"]; present {
		return "", 1_000
	}
	if style, _ := options["timeStyle"].(string); style != "" {
		if style == "short" {
			return "", 60_000
		}
		return "", 1_000
	}
	if _, present := options["minute"]; present {
		return "", 60_000
	}
	if _, present := options["hour"]; present {
		return "", 3_600_000
	}
	if _, present := options["day"]; present {
		return "day", 0
	}
	if _, present := options["weekday"]; present {
		return "day", 0
	}
	if _, present := options["month"]; present {
		return "month", 0
	}
	if _, present := options["year"]; present {
		return "year", 0
	}
	// DateTimeFormat's default projection contains year, month, and day.
	return "day", 0
}

func (lowering *jsxLowering) calendarTimePlan(unit string, options map[string]any) *ast.Node {
	properties := []*ast.Node{
		lowering.property(lowering.factory.NewIdentifier("protocol"), lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
		lowering.property(lowering.factory.NewIdentifier("kind"), lowering.factory.NewStringLiteral("calendar", ast.TokenFlagsNone)),
		lowering.property(lowering.factory.NewIdentifier("unit"), lowering.factory.NewStringLiteral(unit, ast.TokenFlagsNone)),
	}
	if timeZone, ok := options["timeZone"].(string); ok && timeZone != "" {
		properties = append(properties, lowering.property(lowering.factory.NewIdentifier("timeZone"), lowering.factory.NewStringLiteral(timeZone, ast.TokenFlagsNone)))
	}
	if calendar, ok := options["calendar"].(string); ok && calendar != "" {
		properties = append(properties, lowering.property(lowering.factory.NewIdentifier("calendar"), lowering.factory.NewStringLiteral(calendar, ast.TokenFlagsNone)))
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)
}

func (lowering *jsxLowering) earliestTimePlan(plans []*ast.Node) *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(lowering.factory.NewIdentifier("protocol"), lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("kind"), lowering.factory.NewStringLiteral("earliest", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("plans"), lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(plans), false)),
		}),
		false,
	)
}

func (lowering *jsxLowering) thresholdTimePlan(threshold *ast.Node, before *ast.Node, after *ast.Node) *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(lowering.factory.NewIdentifier("protocol"), lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("kind"), lowering.factory.NewStringLiteral("threshold", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("thresholdMilliseconds"), lowering.timePlanNumber(threshold)),
			lowering.property(lowering.factory.NewIdentifier("before"), before),
			lowering.property(lowering.factory.NewIdentifier("after"), after),
		}),
		false,
	)
}

func cloneTimeVisited(visited map[ast.SymbolId]struct{}) map[ast.SymbolId]struct{} {
	cloned := make(map[ast.SymbolId]struct{}, len(visited))
	for id := range visited {
		cloned[id] = struct{}{}
	}
	return cloned
}

func (lowering *jsxLowering) quantizedTimePlan(anchor *ast.Node, quantum float64, boundary string) *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(lowering.factory.NewIdentifier("protocol"), lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("kind"), lowering.factory.NewStringLiteral("quantized", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("quantumMilliseconds"), lowering.factory.NewNumericLiteral(strconv.FormatFloat(quantum, 'f', -1, 64), ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("anchorMilliseconds"), lowering.timePlanNumber(anchor)),
			lowering.property(lowering.factory.NewIdentifier("boundary"), lowering.factory.NewStringLiteral(boundary, ast.TokenFlagsNone)),
		}),
		false,
	)
}

func (lowering *jsxLowering) timeIdentifierInitializer(node *ast.Node, visited map[ast.SymbolId]struct{}) *ast.Node {
	if lowering.checker == nil || !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil
	}
	id := ast.GetSymbolId(symbol)
	if _, seen := visited[id]; seen {
		return nil
	}
	visited[id] = struct{}{}
	for _, declaration := range symbol.Declarations {
		if declaration.Kind == ast.KindParameter {
			return timeArgumentForParameterUse(declaration, lowering.checker, lowering.sourceFile)
		}
		if ast.IsBindingElement(declaration) && ast.GetSourceFileOfNode(declaration) == lowering.sourceFile {
			return lowering.timeDestructuredInitializer(declaration)
		}
		if !ast.IsVariableDeclaration(declaration) || ast.GetSourceFileOfNode(declaration) != lowering.sourceFile {
			continue
		}
		return declaration.AsVariableDeclaration().Initializer
	}
	return nil
}

// timeDestructuredInitializer follows statically named record/array binding paths back to the
// immutable source expression. Defaults and rest bindings remain unsupported because they add
// branch or collection semantics that require a separate finite summary.
func (lowering *jsxLowering) timeDestructuredInitializer(declaration *ast.Node) *ast.Node {
	segments := []string{}
	current := declaration
	for ast.IsBindingElement(current) {
		binding := current.AsBindingElement()
		if binding.Initializer != nil || binding.DotDotDotToken != nil || current.Parent == nil {
			return nil
		}
		pattern := current.Parent
		segment := ""
		if ast.IsArrayBindingPattern(pattern) {
			for index, element := range pattern.AsBindingPattern().Elements.Nodes {
				if element == current {
					segment = strconv.Itoa(index)
					break
				}
			}
		} else if ast.IsObjectBindingPattern(pattern) {
			property := binding.PropertyName
			if property == nil {
				property = binding.Name()
			}
			if ast.IsIdentifier(property) || ast.IsStringLiteral(property) || ast.IsNumericLiteral(property) {
				segment = property.Text()
			}
		}
		if segment == "" || pattern.Parent == nil {
			return nil
		}
		segments = append([]string{segment}, segments...)
		current = pattern.Parent
	}
	if !ast.IsVariableDeclaration(current) || current.AsVariableDeclaration().Initializer == nil {
		return nil
	}
	value := current.AsVariableDeclaration().Initializer
	if selected := timeSelectStaticMember(value, segments, lowering.checker, make(map[ast.SymbolId]struct{})); selected != nil {
		return selected
	}
	if lowering.factory == nil {
		return nil
	}
	for _, segment := range segments {
		if _, error := strconv.Atoi(segment); error == nil {
			value = lowering.factory.NewElementAccessExpression(
				value,
				nil,
				lowering.factory.NewNumericLiteral(segment, ast.TokenFlagsNone),
				ast.NodeFlagsNone,
			)
		} else {
			value = lowering.propertyAccess(value, segment)
		}
	}
	return value
}

func timeSelectStaticMember(
	value *ast.Node,
	segments []string,
	typeChecker *checker.Checker,
	visited map[ast.SymbolId]struct{},
) *ast.Node {
	value = unwrapTimeStaticExpression(value)
	if ast.IsIdentifier(value) && typeChecker != nil {
		symbol := typeChecker.GetSymbolAtLocation(value)
		if symbol == nil {
			return nil
		}
		id := ast.GetSymbolId(symbol)
		if _, exists := visited[id]; exists {
			return nil
		}
		visited[id] = struct{}{}
		for _, declaration := range symbol.Declarations {
			if ast.IsVariableDeclaration(declaration) && declaration.AsVariableDeclaration().Initializer != nil {
				return timeSelectStaticMember(declaration.AsVariableDeclaration().Initializer, segments, typeChecker, visited)
			}
		}
		return nil
	}
	if len(segments) == 0 {
		return value
	}
	segment := segments[0]
	if ast.IsObjectLiteralExpression(value) {
		for _, property := range value.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsPropertyAssignment(property) && property.AsPropertyAssignment().Name().Text() == segment {
				return timeSelectStaticMember(property.AsPropertyAssignment().Initializer, segments[1:], typeChecker, visited)
			}
		}
		return nil
	}
	if ast.IsArrayLiteralExpression(value) {
		index, error := strconv.Atoi(segment)
		if error != nil || index < 0 || index >= len(value.AsArrayLiteralExpression().Elements.Nodes) {
			return nil
		}
		return timeSelectStaticMember(value.AsArrayLiteralExpression().Elements.Nodes[index], segments[1:], typeChecker, visited)
	}
	return nil
}

func unwrapTimeStaticExpression(expression *ast.Node) *ast.Node {
	for expression != nil {
		switch {
		case ast.IsParenthesizedExpression(expression):
			expression = expression.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(expression):
			expression = expression.AsAsExpression().Expression
		case ast.IsSatisfiesExpression(expression):
			expression = expression.AsSatisfiesExpression().Expression
		case ast.IsNonNullExpression(expression):
			expression = expression.AsNonNullExpression().Expression
		default:
			return expression
		}
	}
	return nil
}

func timeArgumentForParameter(parameter *ast.Node) *ast.Node {
	callable := parameter.Parent
	for callable != nil && !isCallableNode(callable) {
		callable = callable.Parent
	}
	if callable == nil {
		return nil
	}
	index := -1
	for candidateIndex, candidate := range callable.Parameters() {
		if candidate == parameter {
			index = candidateIndex
			break
		}
	}
	if index < 0 {
		return nil
	}
	current := callable
	for current.Parent != nil && ast.IsParenthesizedExpression(current.Parent) {
		current = current.Parent
	}
	if current.Parent == nil || !ast.IsCallExpression(current.Parent) {
		return nil
	}
	call := current.Parent.AsCallExpression()
	if unwrapRenderExpression(call.Expression) != callable || call.Arguments == nil || index >= len(call.Arguments.Nodes) {
		return nil
	}
	return call.Arguments.Nodes[index]
}

func timeArgumentForParameterUse(parameter *ast.Node, typeChecker interface {
	GetSymbolAtLocation(*ast.Node) *ast.Symbol
}, sourceFile *ast.SourceFile) *ast.Node {
	if argument := timeArgumentForParameter(parameter); argument != nil {
		return argument
	}
	callable := parameter.Parent
	for callable != nil && !isCallableNode(callable) {
		callable = callable.Parent
	}
	if callable == nil {
		return nil
	}
	if rendererArray := callable.Parent; rendererArray != nil && ast.IsArrayLiteralExpression(rendererArray) &&
		rendererArray.Parent != nil && ast.IsCallExpression(rendererArray.Parent) {
		prepare := rendererArray.Parent.AsCallExpression()
		if ast.IsIdentifier(prepare.Expression) && prepare.Expression.Text() == "__exactPrepareIntl" &&
			prepare.Arguments != nil && len(prepare.Arguments.Nodes) >= 3 &&
			prepare.Arguments.Nodes[2] == rendererArray {
			return prepare.Arguments.Nodes[1]
		}
	}
	index := -1
	for candidateIndex, candidate := range callable.Parameters() {
		if candidate == parameter {
			index = candidateIndex
			break
		}
	}
	if index < 0 {
		return nil
	}
	var name *ast.Node
	if ast.IsFunctionDeclaration(callable) {
		name = callable.Name()
	} else if callable.Parent != nil && ast.IsVariableDeclaration(callable.Parent) {
		name = callable.Parent.AsVariableDeclaration().Name()
	}
	if name == nil || !ast.IsIdentifier(name) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return nil
	}
	id := ast.GetSymbolId(symbol)
	var resolved *ast.Node
	ambiguous := false
	walkNode(sourceFile.AsNode(), func(candidate *ast.Node) bool {
		if !ast.IsCallExpression(candidate) || !ast.IsIdentifier(candidate.AsCallExpression().Expression) {
			return true
		}
		called := typeChecker.GetSymbolAtLocation(candidate.AsCallExpression().Expression)
		call := candidate.AsCallExpression()
		if called == nil || ast.GetSymbolId(called) != id || call.Arguments == nil || index >= len(call.Arguments.Nodes) {
			return true
		}
		if resolved != nil {
			ambiguous = true
			return false
		}
		resolved = call.Arguments.Nodes[index]
		return true
	})
	if ambiguous {
		return nil
	}
	return resolved
}

func (lowering *jsxLowering) timeQuantizationForExpression(node *ast.Node, visited map[ast.SymbolId]struct{}) (*ast.Node, float64, string, bool) {
	node = unwrapRenderExpression(node)
	if initializer := lowering.timeIdentifierInitializer(node, visited); initializer != nil {
		return lowering.timeQuantizationForExpression(initializer, visited)
	}
	if anchor, quantum, boundary, supported := lowering.timeLocalHelperQuantization(node); supported {
		return anchor, quantum, boundary, true
	}
	return timeQuantization(node)
}

func (lowering *jsxLowering) timeLocalHelperQuantization(node *ast.Node) (*ast.Node, float64, string, bool) {
	if lowering.checker == nil || !ast.IsCallExpression(node) || !ast.IsIdentifier(node.AsCallExpression().Expression) {
		return nil, 0, "", false
	}
	call := node.AsCallExpression()
	symbol := lowering.checker.GetSymbolAtLocation(call.Expression)
	if symbol == nil {
		return nil, 0, "", false
	}
	var callable *ast.Node
	for _, declaration := range symbol.Declarations {
		if ast.GetSourceFileOfNode(declaration) != lowering.sourceFile {
			continue
		}
		switch {
		case ast.IsFunctionDeclaration(declaration):
			callable = declaration
		case ast.IsVariableDeclaration(declaration):
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil && (ast.IsArrowFunction(initializer) || ast.IsFunctionExpression(initializer)) {
				callable = initializer
			}
		}
	}
	if callable == nil || len(callable.Parameters()) != len(call.Arguments.Nodes) {
		return nil, 0, "", false
	}
	body := callable.Body()
	if body == nil {
		return nil, 0, "", false
	}
	if ast.IsBlock(body) {
		returns := directCallableReturns(callable)
		if len(returns) != 1 || len(body.AsBlock().Statements.Nodes) != 1 {
			return nil, 0, "", false
		}
		body = returns[0]
	}
	if !safeReactiveInitializer(body, lowering.sourceFile, lowering.checker) {
		return nil, 0, "", false
	}
	clockParameters := map[string]struct{}{}
	arguments := map[string]*ast.Node{}
	for index, parameter := range callable.Parameters() {
		name := parameter.Name()
		if name == nil || !ast.IsIdentifier(name) {
			return nil, 0, "", false
		}
		argument := call.Arguments.Nodes[index]
		arguments[name.Text()] = argument
		if timeExpressionHasClockDependency(argument, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
			clockParameters[name.Text()] = struct{}{}
		}
	}
	anchor, quantum, boundary, supported := timeQuantizationWithClock(body, func(candidate *ast.Node) bool {
		candidate = unwrapRenderExpression(candidate)
		if !ast.IsIdentifier(candidate) {
			return false
		}
		_, exists := clockParameters[candidate.Text()]
		return exists
	})
	if !supported {
		return nil, 0, "", false
	}
	resolved, supported := lowering.timeHelperAnchor(anchor, arguments)
	return resolved, quantum, boundary, supported
}

func (lowering *jsxLowering) timeHelperAnchor(anchor *ast.Node, arguments map[string]*ast.Node) (*ast.Node, bool) {
	anchor = unwrapRenderExpression(anchor)
	if ast.IsIdentifier(anchor) {
		if argument := arguments[anchor.Text()]; argument != nil {
			return argument, true
		}
		return anchor, true
	}
	if ast.IsCallExpression(anchor) && ast.IsPropertyAccessExpression(anchor.AsCallExpression().Expression) &&
		(anchor.AsCallExpression().Arguments == nil || len(anchor.AsCallExpression().Arguments.Nodes) == 0) {
		access := anchor.AsCallExpression().Expression.AsPropertyAccessExpression()
		if access.Name().Text() == "getTime" && ast.IsIdentifier(access.Expression) {
			if argument := arguments[access.Expression.Text()]; argument != nil {
				return lowering.memberCall(argument, "getTime"), true
			}
		}
	}
	return nil, false
}

// timeConditionThreshold recognizes monotone comparisons over compiler-provable quantized clock
// values. The returned boolean states whether the authored condition is true before the threshold.
func (lowering *jsxLowering) timeConditionThreshold(node *ast.Node, visited map[ast.SymbolId]struct{}) (*ast.Node, bool, bool) {
	node = unwrapRenderExpression(node)
	if initializer := lowering.timeIdentifierInitializer(node, visited); initializer != nil {
		return lowering.timeConditionThreshold(initializer, visited)
	}
	if !ast.IsBinaryExpression(node) {
		return nil, false, false
	}
	binary := node.AsBinaryExpression()
	comparison, literalNode := binary.Left, binary.Right
	operator := binary.OperatorToken.Kind
	literal, supported := timeNumericLiteral(literalNode)
	if !supported {
		literal, supported = timeNumericLiteral(binary.Left)
		if !supported {
			return nil, false, false
		}
		comparison = binary.Right
		operator = reverseTimeComparison(operator)
	}
	anchor, quantum, boundary, supported := lowering.timeQuantizationForExpression(comparison, visited)
	if !supported {
		return nil, false, false
	}
	offset := 0.0
	trueBefore := false
	switch boundary {
	case "floor-increasing":
		switch operator {
		case ast.KindLessThanToken:
			offset, trueBefore = literal*quantum, true
		case ast.KindLessThanEqualsToken:
			offset, trueBefore = (literal+1)*quantum, true
		case ast.KindGreaterThanEqualsToken:
			offset, trueBefore = literal*quantum, false
		case ast.KindGreaterThanToken:
			offset, trueBefore = (literal+1)*quantum, false
		default:
			return nil, false, false
		}
	case "ceil-decreasing":
		switch operator {
		case ast.KindGreaterThanToken:
			offset, trueBefore = -literal*quantum, true
		case ast.KindGreaterThanEqualsToken:
			offset, trueBefore = -(literal-1)*quantum, true
		case ast.KindLessThanToken:
			offset, trueBefore = -(literal-1)*quantum, false
		case ast.KindLessThanEqualsToken:
			offset, trueBefore = -literal*quantum, false
		default:
			return nil, false, false
		}
	default:
		return nil, false, false
	}
	return lowering.timeOffsetExpression(anchor, offset), trueBefore, true
}

func (lowering *jsxLowering) timeOffsetExpression(anchor *ast.Node, offset float64) *ast.Node {
	if offset == 0 {
		return anchor
	}
	operator := ast.KindPlusToken
	if offset < 0 {
		operator = ast.KindMinusToken
		offset = -offset
	}
	return lowering.binary(
		anchor,
		operator,
		lowering.factory.NewNumericLiteral(strconv.FormatFloat(offset, 'f', -1, 64), ast.TokenFlagsNone),
	)
}

func timeNumericLiteral(node *ast.Node) (float64, bool) {
	node = unwrapRenderExpression(node)
	if ast.IsNumericLiteral(node) {
		value, error := strconv.ParseFloat(node.Text(), 64)
		return value, error == nil
	}
	if ast.IsPrefixUnaryExpression(node) && node.AsPrefixUnaryExpression().Operator == ast.KindMinusToken {
		value, supported := timeNumericLiteral(node.AsPrefixUnaryExpression().Operand)
		return -value, supported
	}
	return 0, false
}

func reverseTimeComparison(operator ast.Kind) ast.Kind {
	switch operator {
	case ast.KindLessThanToken:
		return ast.KindGreaterThanToken
	case ast.KindLessThanEqualsToken:
		return ast.KindGreaterThanEqualsToken
	case ast.KindGreaterThanToken:
		return ast.KindLessThanToken
	case ast.KindGreaterThanEqualsToken:
		return ast.KindLessThanEqualsToken
	default:
		return operator
	}
}

func (lowering *jsxLowering) findTimeQuantization(node *ast.Node, visited map[ast.SymbolId]struct{}) (*ast.Node, float64, string, bool) {
	var anchor *ast.Node
	var quantum float64
	var boundary string
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if candidate != node && lowering.nodeHasDirectTimeUpdate(candidate) {
			return false
		}
		if candidateAnchor, candidateQuantum, candidateBoundary, supported := lowering.timeQuantizationForExpression(candidate, cloneTimeVisited(visited)); supported {
			anchor, quantum, boundary, found = candidateAnchor, candidateQuantum, candidateBoundary, true
			return false
		}
		if lowering.checker == nil || !ast.IsIdentifier(candidate) || ast.IsDeclarationName(candidate) || isStaticPropertyName(candidate) {
			return true
		}
		initializer := lowering.timeIdentifierInitializer(candidate, visited)
		if initializer != nil {
			if nestedAnchor, nestedQuantum, nestedBoundary, supported := lowering.findTimeQuantization(initializer, visited); supported {
				anchor, quantum, boundary, found = nestedAnchor, nestedQuantum, nestedBoundary, true
				return false
			}
		}
		return !found
	})
	return anchor, quantum, boundary, found
}

func timeQuantization(node *ast.Node) (*ast.Node, float64, string, bool) {
	return timeQuantizationWithClock(node, timeMillisecondsClockRead)
}

func timeMillisecondsClockRead(node *ast.Node) bool {
	node = unwrapRenderExpression(node)
	if timeDateNowCall(node) {
		return true
	}
	if ast.IsPropertyAccessExpression(node) {
		member := node.AsPropertyAccessExpression()
		return member.Name().Text() == "epochMilliseconds" && timeTemporalNowCall(member.Expression)
	}
	if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) &&
		(node.AsCallExpression().Arguments == nil || len(node.AsCallExpression().Arguments.Nodes) == 0) {
		member := node.AsCallExpression().Expression.AsPropertyAccessExpression()
		return member.Name().Text() == "getTime" && timeZeroArgumentDate(member.Expression)
	}
	return false
}

func timeQuantizationWithClock(node *ast.Node, clockRead func(*ast.Node) bool) (*ast.Node, float64, string, bool) {
	if !ast.IsCallExpression(node) {
		return nil, 0, "", false
	}
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, 0, "", false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(operation.Expression) || operation.Expression.Text() != "Math" {
		return nil, 0, "", false
	}
	method := operation.Name().Text()
	if method != "ceil" && method != "floor" && method != "round" && method != "trunc" {
		return nil, 0, "", false
	}
	division := unwrapRenderExpression(call.Arguments.Nodes[0])
	if !ast.IsBinaryExpression(division) || division.AsBinaryExpression().OperatorToken.Kind != ast.KindSlashToken {
		return nil, 0, "", false
	}
	binary := division.AsBinaryExpression()
	quantumNode := unwrapRenderExpression(binary.Right)
	if !ast.IsNumericLiteral(quantumNode) {
		return nil, 0, "", false
	}
	quantum, error := strconv.ParseFloat(quantumNode.Text(), 64)
	if error != nil || quantum <= 0 {
		return nil, 0, "", false
	}
	difference := unwrapRenderExpression(binary.Left)
	if !ast.IsBinaryExpression(difference) || difference.AsBinaryExpression().OperatorToken.Kind != ast.KindMinusToken {
		return nil, 0, "", false
	}
	left := difference.AsBinaryExpression().Left
	right := difference.AsBinaryExpression().Right
	if method == "ceil" && clockRead(right) {
		return left, quantum, "ceil-decreasing", true
	}
	if method == "floor" && clockRead(left) {
		return right, quantum, "floor-increasing", true
	}
	if method == "round" && clockRead(right) {
		return left, quantum, "round-decreasing", true
	}
	if method == "round" && clockRead(left) {
		return right, quantum, "round-increasing", true
	}
	if method == "trunc" && clockRead(right) {
		return left, quantum, "trunc-decreasing", true
	}
	if method == "trunc" && clockRead(left) {
		return right, quantum, "trunc-increasing", true
	}
	return nil, 0, "", false
}

func timeDateNowCall(node *ast.Node) bool {
	node = unwrapRenderExpression(node)
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		return false
	}
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return false
	}
	access := call.Expression.AsPropertyAccessExpression()
	return access.Name().Text() == "now" && ast.IsIdentifier(access.Expression) && access.Expression.Text() == "Date"
}

func (lowering *jsxLowering) intlMessageOpening(opening *ast.Node) bool {
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	application, exists := lowering.enhancementImports.applications[attributes.Pos()]
	if !exists {
		return false
	}
	for _, component := range application.components {
		if component.module == "@exactjs/intl/enhancements" &&
			(component.export == "message" || component.export == "default") {
			return true
		}
	}
	return false
}

func timeUpdateIdentity(application enhancementApplication) string {
	for _, component := range application.components {
		if component.module == "@exactjs/time/enhancements" &&
			(component.export == "update" || component.export == "default") {
			return component.identity
		}
	}
	return ""
}

func timeUpdateMembers(members []enhancementSpreadMember, identity string) bool {
	for _, member := range members {
		if member.identity == identity && member.prop == "update" {
			return true
		}
	}
	return false
}

func timeAttributeMayUseAuto(attribute *ast.JsxAttribute) bool {
	if attribute.Initializer == nil {
		return true
	}
	if ast.IsStringLiteral(attribute.Initializer) {
		return attribute.Initializer.AsStringLiteral().Text == "auto"
	}
	if !ast.IsJsxExpression(attribute.Initializer) {
		return true
	}
	expression := unwrapRenderExpression(attribute.Initializer.AsJsxExpression().Expression)
	if expression == nil {
		return true
	}
	if expression.Kind == ast.KindTrueKeyword {
		return true
	}
	if ast.IsStringLiteral(expression) {
		return expression.AsStringLiteral().Text == "auto"
	}
	return true
}
