package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func timeDiagnostics(sourceFile *ast.SourceFile, typeChecker *checker.Checker, enhancements enhancementImports) []Diagnostic {
	var diagnostics []Diagnostic
	analysis := &jsxLowering{sourceFile: sourceFile, checker: typeChecker, enhancementImports: enhancements}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var opening *ast.Node
		rangeNode := node
		switch {
		case ast.IsJsxElement(node):
			opening = node.AsJsxElement().OpeningElement
		case ast.IsJsxSelfClosingElement(node):
			opening = node
		default:
			return true
		}
		attributes := opening.Attributes()
		if attributes == nil {
			return true
		}
		application, exists := enhancements.applications[attributes.Pos()]
		if !exists {
			return true
		}
		identity := timeUpdateIdentity(application)
		if identity == "" {
			return true
		}
		var update *ast.Node
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxAttribute(property) && timeUpdateMembers(application.attributes[property.Pos()], identity) {
				update = property
				break
			}
		}
		if update == nil {
			return true
		}
		if timeRangeRequestsUnavailablePrecision(rangeNode) {
			diagnostics = append(diagnostics, enhancementDiagnostic(sourceFile, update, "EXACT_TIME_PRECISION", "the selected clock provides millisecond precision; Temporal microsecond and nanosecond updates are unavailable"))
			return true
		}
		_, _, _, bounded := analysis.findTimeQuantization(rangeNode, make(map[ast.SymbolId]struct{}))
		if !bounded {
			bounded = timeRangeHasStandardFormatterPlan(rangeNode, typeChecker, sourceFile)
		}
		if !analysis.timeRangeHasOwnedClock(rangeNode) && !bounded && !timeRangeHasPreparedIntlValue(rangeNode) {
			diagnostics = append(diagnostics, enhancementDiagnostic(sourceFile, update, "EXACT_TIME_NO_CLOCK", "time:update requires a reachable Date.now(), zero-argument new Date(), or Temporal.Now clock source"))
			return true
		}
		if analysis.timeRangeHasUnsafeClockExpression(rangeNode) {
			diagnostics = append(diagnostics, enhancementDiagnostic(sourceFile, update, "EXACT_TIME_UNSAFE", "time:update cannot repeatedly evaluate an effectful or opaque clock-derived expression; expose pure quantized input or move the effect outside the range"))
		}
		if timeAttributeMayUseAuto(update.AsJsxAttribute()) {
			if !bounded {
				diagnostics = append(diagnostics, enhancementDiagnostic(sourceFile, update, "EXACT_TIME_AUTO", "automatic update accuracy cannot be inferred; use an explicit time:update accuracy or expose compiler-provable quantization"))
			}
		}
		return true
	})
	return diagnostics
}

func timeRangeRequestsUnavailablePrecision(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		candidate = unwrapRenderExpression(candidate)
		if !ast.IsCallExpression(candidate) || !ast.IsPropertyAccessExpression(candidate.AsCallExpression().Expression) {
			return true
		}
		call := candidate.AsCallExpression()
		member := call.Expression.AsPropertyAccessExpression()
		if member.Name().Text() != "round" || call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
			return true
		}
		unit, _, _, supported := temporalRoundOptions(call.Arguments.Nodes[0])
		if supported && (strings.TrimSuffix(unit, "s") == "microsecond" || strings.TrimSuffix(unit, "s") == "nanosecond") {
			found = true
			return false
		}
		return true
	})
	return found
}

func timeRangeHasPreparedIntlValue(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if ast.IsIdentifier(candidate) && strings.HasPrefix(candidate.Text(), "__intl") {
			found = true
			return false
		}
		return true
	})
	return found
}

func (lowering *jsxLowering) timeRangeHasOwnedClock(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if candidate != node && lowering.nodeHasDirectTimeUpdate(candidate) {
			return false
		}
		if timeDateNowCall(candidate) || timeTemporalNowCall(candidate) || timeZeroArgumentDate(candidate) {
			found = true
			return false
		}
		if ast.IsIdentifier(candidate) && !ast.IsDeclarationName(candidate) && !isStaticPropertyName(candidate) &&
			timeExpressionHasClockDependency(candidate, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
			found = true
			return false
		}
		return true
	})
	return found
}

func (lowering *jsxLowering) timeRangeHasUnsafeClockExpression(node *ast.Node) bool {
	unsafe := false
	walkNode(node, func(candidate *ast.Node) bool {
		if candidate != node && lowering.nodeHasDirectTimeUpdate(candidate) {
			return false
		}
		if !ast.IsJsxExpression(candidate) || candidate.AsJsxExpression().Expression == nil {
			return true
		}
		expression := candidate.AsJsxExpression().Expression
		if lowering.timeExpressionHasUnsafeClockCall(expression) {
			unsafe = true
			return false
		}
		return true
	})
	return unsafe
}

func (lowering *jsxLowering) timeExpressionHasUnsafeClockCall(node *ast.Node) bool {
	unsafe := false
	walkNode(node, func(candidate *ast.Node) bool {
		if !ast.IsCallExpression(candidate) ||
			!timeExpressionHasClockDependency(candidate, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
			return true
		}
		if timeDateNowCall(candidate) || timeTemporalNowCall(candidate) || timeMillisecondsClockRead(candidate) {
			return true
		}
		if _, _, _, supported := analyzeIntlRelativeTime(candidate); supported {
			return false
		}
		if _, _, _, supported := analyzeNativeIntlFormatter(candidate, lowering.checker); supported {
			return false
		}
		if _, _, _, supported := temporalRoundedDurationSensitivity(candidate); supported {
			return false
		}
		if _, _, _, supported := lowering.timeQuantizationForExpression(candidate, make(map[ast.SymbolId]struct{})); supported {
			return false
		}
		if ast.IsPropertyAccessExpression(candidate.AsCallExpression().Expression) {
			member := candidate.AsCallExpression().Expression.AsPropertyAccessExpression()
			if ast.IsIdentifier(member.Expression) && member.Expression.Text() == "Math" {
				return true
			}
		}
		unsafe = true
		return false
	})
	return unsafe
}

func timeRangeHasStandardFormatterPlan(node *ast.Node, typeChecker *checker.Checker, sourceFile *ast.SourceFile) bool {
	found := false
	analysis := &jsxLowering{sourceFile: sourceFile, checker: typeChecker}
	walkNode(node, func(candidate *ast.Node) bool {
		if value, _, _, supported := analyzeIntlRelativeTime(candidate); supported {
			_, _, _, found = analysis.findTimeQuantization(value, make(map[ast.SymbolId]struct{}))
			return !found
		}
		values, _, formatter, supported := analyzeNativeIntlFormatter(candidate, typeChecker)
		if !supported || (formatter["kind"] != "date-time" && formatter["kind"] != "duration") {
			return true
		}
		if formatter["kind"] == "duration" {
			for _, value := range values {
				if _, _, _, supported := analysis.findTimeQuantization(value, make(map[ast.SymbolId]struct{})); supported {
					found = true
					return false
				}
				if _, _, _, supported := temporalRoundedDurationSensitivity(value); supported {
					found = true
					return false
				}
			}
			return true
		}
		for _, value := range values {
			if timeExpressionHasClockDependency(value, typeChecker, sourceFile, make(map[ast.SymbolId]struct{})) {
				found = true
				return false
			}
		}
		return true
	})
	return found
}
