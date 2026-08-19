package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

// timeUpdateActivationForRange creates one range-local, data-planned clock binding. A lexical Intl
// message adopts a nested time binding because its prepared value expressions are emitted at the
// message boundary; the nested time enhancement still owns mounting and cleanup.
func (lowering *jsxLowering) timeUpdateActivationForRange(
	identityNode *ast.Node,
	opening *ast.Node,
) (*ast.Node, bool, *ast.Node, []*ast.Node, []timeAdoptedRange) {
	// An Intl message must prepare its dynamic values at the message boundary. Its adopted
	// activation is nevertheless mounted by the nested time enhancement, so that nested range
	// must reuse the surrounding activation instead of allocating an unmounted duplicate.
	if lowering.timeActivation != "" && lowering.timeActivationAdopted && lowering.nodeHasDirectTimeUpdate(identityNode) {
		return nil, false, nil, nil, nil
	}
	if activation, inputs := lowering.directTimeUpdateActivation(identityNode, opening); activation != nil {
		return activation, false, identityNode, inputs, nil
	}
	if !lowering.intlMessageOpening(opening) {
		return nil, false, nil, nil, nil
	}
	activations := []*ast.Node{}
	ranges := []timeAdoptedRange{}
	projections := []*ast.Node{}
	walkNode(identityNode, func(candidate *ast.Node) bool {
		if candidate == identityNode {
			return true
		}
		var candidateOpening *ast.Node
		switch {
		case ast.IsJsxElement(candidate):
			candidateOpening = candidate.AsJsxElement().OpeningElement
		case ast.IsJsxSelfClosingElement(candidate):
			candidateOpening = candidate
		default:
			return true
		}
		if timeMessageContentProjection(candidate) {
			projections = append(projections, candidate)
			return false
		}
		// The activation is lexically hoisted to the message boundary so prepared Intl values can
		// share it, but its sensitivity still belongs to the authored nested time range. Analyzing
		// the outer message would deliberately skip that independently enhanced child.
		activation, planInputs := lowering.directTimeUpdateActivationWithPlan(candidateOpening, candidate)
		if activation != nil {
			index := len(activations)
			activations = append(activations, activation)
			ranges = append(ranges, timeAdoptedRange{node: candidate, inputs: planInputs, index: index})
			return false
		}
		return true
	})
	if len(activations) == 0 {
		return nil, false, nil, nil, nil
	}
	canonicalRangeCount := len(ranges)
	for index, projection := range projections {
		if index >= canonicalRangeCount {
			break
		}
		canonical := ranges[index]
		ranges = append(ranges, timeAdoptedRange{
			node: projection, inputs: canonical.inputs, index: canonical.index,
		})
	}
	if len(activations) == 1 {
		for index := range ranges {
			ranges[index].index = -1
		}
		return activations[0], true, ranges[0].node, ranges[0].inputs, ranges
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(activations),
		false,
	), true, nil, nil, ranges
}

// timeMessageContentProjection identifies the range formatter introduced by Intl analysis. It
// renders translated children through the authored enhancement but does not own a scheduler.
func timeMessageContentProjection(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if ast.IsIdentifier(candidate) && candidate.Text() == "__intlChildren" {
			found = true
			return false
		}
		return true
	})
	return found
}

func (lowering *jsxLowering) timeActivationExpression(node *ast.Node) *ast.Node {
	activation := lowering.factory.NewIdentifier(lowering.timeActivation)
	if lowering.timeAdoptedSelection != nil {
		return lowering.timeIndexedActivation(activation, lowering.timeAdoptedSelection.index)
	}
	for _, adopted := range lowering.timeAdoptedRanges {
		if node.Pos() < adopted.node.Pos() || node.End() > adopted.node.End() {
			continue
		}
		return lowering.timeIndexedActivation(activation, adopted.index)
	}
	return activation
}

func (lowering *jsxLowering) timeIndexedActivation(activation *ast.Node, index int) *ast.Node {
	if index < 0 {
		return activation
	}
	return lowering.factory.NewElementAccessExpression(
		activation,
		nil,
		lowering.factory.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) timePlanInputsForNode(node *ast.Node) []*ast.Node {
	if lowering.timeAdoptedSelection != nil {
		return lowering.timeAdoptedSelection.inputs
	}
	for _, adopted := range lowering.timeAdoptedRanges {
		if node.Pos() >= adopted.node.Pos() && node.End() <= adopted.node.End() {
			return adopted.inputs
		}
	}
	return lowering.timePlanInputs
}

func (lowering *jsxLowering) timeAdoptedRangeForNode(node *ast.Node) *timeAdoptedRange {
	for index := range lowering.timeAdoptedRanges {
		adopted := &lowering.timeAdoptedRanges[index]
		if node.Pos() >= adopted.node.Pos() && node.End() <= adopted.node.End() {
			return adopted
		}
	}
	return nil
}

func (lowering *jsxLowering) directTimeUpdateActivation(identityNode *ast.Node, opening *ast.Node) (*ast.Node, []*ast.Node) {
	return lowering.directTimeUpdateActivationWithPlan(opening, identityNode)
}

func (lowering *jsxLowering) directTimeUpdateActivationWithPlan(opening *ast.Node, planNode *ast.Node) (*ast.Node, []*ast.Node) {
	attributes := opening.Attributes()
	if attributes == nil {
		return nil, nil
	}
	application, exists := lowering.enhancementImports.applications[attributes.Pos()]
	if !exists {
		return nil, nil
	}
	identity := timeUpdateIdentity(application)
	if identity == "" {
		return nil, nil
	}
	var policy *ast.Node
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) || !timeUpdateMembers(application.attributes[property.Pos()], identity) {
			continue
		}
		attribute := property.AsJsxAttribute()
		policy = lowering.jsxAttributeInitializer(attribute, "", "time:update", true)
		break
	}
	if policy == nil {
		return nil, nil
	}
	plan, inputs := lowering.compileTimeChangePlan(planNode)
	arguments := []*ast.Node{policy, plan}
	if len(inputs) != 0 {
		arguments = append(arguments, lowering.timePlanInputArray(inputs))
	}
	activation := lowering.call(lowering.names.createTimeActivation, arguments)
	return lowering.call(lowering.names.peek, []*ast.Node{lowering.arrow(activation)}), inputs
}

func (lowering *jsxLowering) compileTimeChangePlan(rangeNode *ast.Node) (*ast.Node, []*ast.Node) {
	previousInputs := lowering.timePlanInputs
	previousIndexes := lowering.timePlanInputIndexes
	lowering.timePlanInputs = nil
	lowering.timePlanInputIndexes = make(map[*ast.Node]int)
	plan := lowering.timeChangePlan(rangeNode)
	inputs := append([]*ast.Node(nil), lowering.timePlanInputs...)
	lowering.timePlanInputs = previousInputs
	lowering.timePlanInputIndexes = previousIndexes
	return plan, inputs
}

func (lowering *jsxLowering) timePlanNumber(value *ast.Node) *ast.Node {
	value = unwrapRenderExpression(value)
	if ast.IsNumericLiteral(value) {
		return lowering.factory.NewNumericLiteral(value.Text(), ast.TokenFlagsNone)
	}
	if index, exists := lowering.timePlanInputIndexes[value]; exists {
		return lowering.timePlanBinding(index)
	}
	index := len(lowering.timePlanInputs)
	lowering.timePlanInputs = append(lowering.timePlanInputs, value)
	lowering.timePlanInputIndexes[value] = index
	return lowering.timePlanBinding(index)
}

func (lowering *jsxLowering) timePlanBinding(index int) *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(
				lowering.factory.NewIdentifier("binding"),
				lowering.factory.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone),
			),
		}),
		false,
	)
}

func (lowering *jsxLowering) timePlanInputArray(inputs []*ast.Node) *ast.Node {
	values := make([]*ast.Node, 0, len(inputs))
	for _, input := range inputs {
		values = append(values, lowering.visitor.VisitNode(input))
	}
	return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
}

func (lowering *jsxLowering) timeChangePlan(rangeNode *ast.Node) *ast.Node {
	plan, supported := lowering.inferTimeChangePlan(rangeNode, make(map[ast.SymbolId]struct{}))
	if supported {
		return plan
	}
	return lowering.continuousTimePlan()
}

func (lowering *jsxLowering) continuousTimePlan() *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(
				lowering.factory.NewIdentifier("protocol"),
				lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone),
			),
			lowering.property(
				lowering.factory.NewIdentifier("kind"),
				lowering.factory.NewStringLiteral("continuous", ast.TokenFlagsNone),
			),
		}),
		false,
	)
}

func (lowering *jsxLowering) completeTimePlan() *ast.Node {
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(lowering.factory.NewIdentifier("protocol"), lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
			lowering.property(lowering.factory.NewIdentifier("kind"), lowering.factory.NewStringLiteral("complete", ast.TokenFlagsNone)),
		}),
		false,
	)
}
