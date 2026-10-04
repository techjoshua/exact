package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"math"
	"strings"
)

// temporalRoundedDurationPlan recognizes fixed-unit Temporal duration rounding whose moving
// endpoint is an opted-in clock read. Half-expand, directed, and truncating modes retain their
// exact fixed-unit boundary alignment. Calendar-relative duration rounding remains
// diagnostic because its boundaries require the authored relativeTo calendar context.
func (lowering *jsxLowering) temporalRoundedDurationPlan(node *ast.Node) (*ast.Node, bool) {
	anchor, quantum, boundary, supported := temporalRoundedDurationSensitivity(node)
	if !supported {
		return nil, false
	}
	milliseconds := lowering.propertyAccess(anchor, "epochMilliseconds")
	switch boundary {
	case "expand-increasing":
		return lowering.thresholdTimePlan(milliseconds,
			lowering.temporalQuantizedPlan(milliseconds, quantum, "floor-increasing"),
			lowering.temporalQuantizedPlan(milliseconds, quantum, "ceil-increasing")), true
	case "expand-decreasing":
		return lowering.thresholdTimePlan(milliseconds,
			lowering.temporalQuantizedPlan(milliseconds, quantum, "ceil-decreasing"),
			lowering.temporalQuantizedPlan(milliseconds, quantum, "floor-decreasing")), true
	case "half-trunc-increasing", "half-trunc-decreasing":
		return lowering.thresholdTimePlan(milliseconds,
			lowering.temporalQuantizedPlan(milliseconds, quantum, "round-increasing"),
			lowering.temporalQuantizedPlan(milliseconds, quantum, "round-decreasing")), true
	}
	return lowering.temporalQuantizedPlan(milliseconds, quantum, boundary), true
}

// temporalQuantizedPlan expresses directed ties with existing integer-millisecond operands.
// The boundary describes update times, so reversed rounding signs may share the same plan.
func (lowering *jsxLowering) temporalQuantizedPlan(milliseconds *ast.Node, quantum float64, boundary string) *ast.Node {
	if boundary == "ceil-increasing" || boundary == "floor-decreasing" {
		milliseconds = lowering.timeOffsetExpression(milliseconds, 1)
		boundary = "floor-increasing"
	}
	return lowering.quantizedTimePlan(milliseconds, quantum, boundary)
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
	boundary := ""
	switch roundingMode {
	case "", "halfExpand":
		boundary = "half-expand-decreasing"
		if increasing {
			boundary = "half-expand-increasing"
		}
	case "trunc":
		boundary = "trunc-decreasing"
		if increasing {
			boundary = "trunc-increasing"
		}
	case "floor":
		boundary = "floor-decreasing"
		if increasing {
			boundary = "floor-increasing"
		}
	case "ceil":
		boundary = "ceil-decreasing"
		if increasing {
			boundary = "ceil-increasing"
		}
	case "expand":
		boundary = "expand-decreasing"
		if increasing {
			boundary = "expand-increasing"
		}
	case "halfCeil":
		boundary = "round-decreasing"
		if increasing {
			boundary = "round-increasing"
		}
	case "halfFloor":
		boundary = "round-increasing"
		if increasing {
			boundary = "round-decreasing"
		}
	case "halfTrunc":
		boundary = "half-trunc-decreasing"
		if increasing {
			boundary = "half-trunc-increasing"
		}
	case "halfEven":
		boundary = "half-even-decreasing"
		if increasing {
			boundary = "half-even-increasing"
		}
	default:
		return nil, 0, "", false
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
			return "", 0, "", false
		}
		propertyName := property.AsPropertyAssignment().Name()
		if !ast.IsIdentifier(propertyName) && !ast.IsStringLiteral(propertyName) {
			return "", 0, "", false
		}
		name := propertyName.Text()
		value := unwrapRenderExpression(property.AsPropertyAssignment().Initializer)
		switch name {
		case "smallestUnit":
			if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
				unit = value.Text()
			}
		case "roundingMode":
			if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
				roundingMode = value.Text()
			} else {
				return "", 0, "", false
			}
		case "roundingIncrement":
			if parsed, ok := timeNumericLiteral(value); ok && parsed > 0 && math.Trunc(parsed) == parsed {
				increment = parsed
			} else {
				return "", 0, "", false
			}
		case "largestUnit":
			if !ast.IsStringLiteral(value) && !ast.IsNoSubstitutionTemplateLiteral(value) {
				return "", 0, "", false
			}
			if value.Text() != "auto" {
				if _, fixed := temporalFixedUnitMilliseconds(value.Text()); !fixed {
					return "", 0, "", false
				}
			}
		default:
			// A recognized unit cannot authorize reevaluating an unchecked option expression.
			// relativeTo needs calendar-aware planning, and unknown options have no contract.
			return "", 0, "", false
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
