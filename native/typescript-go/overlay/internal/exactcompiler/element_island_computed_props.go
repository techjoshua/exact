package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func islandComputedPropsRead(node *ast.Node) (*ast.Node, *ast.Node, bool) {
	if ast.IsElementAccessExpression(node) && !identifierIsWriteTarget(node) && !isDeleteOperand(node) {
		member := node.AsElementAccessExpression()
		if ast.IsIdentifier(member.Expression) && member.ArgumentExpression != nil && !ast.IsStringLiteral(member.ArgumentExpression) {
			return member.Expression, member.ArgumentExpression, true
		}
	}
	return nil, nil, false
}

// lowerIslandComputedPropsRead keeps computed data keys on their captured facade while routing
// children through the same retained range as a literal read. The authored key runs exactly once.
func (lowering *jsxLowering) lowerIslandComputedPropsRead(node *ast.Node) *ast.Node {
	island := lowering.clientCaptureIsland
	read := node
	if lowering.serverCaptureIsland != nil {
		island = lowering.serverCaptureIsland
		if !island.renderedChildren[nodeSpanKey(node)] {
			return nil
		}
		read = islandSelectedChildRead(node)
	}
	if island == nil {
		return nil
	}
	receiver, argument, computed := islandComputedPropsRead(read)
	if !computed {
		return nil
	}
	capture, hasChildren := islandChildrenCapture(*island)
	if !hasChildren || island.captureReferences[nodeSpanKey(receiver)] != capture.name {
		return nil
	}
	key := lowering.factory.NewUniqueName("__exactChildKey")
	isChildren := lowering.binary(key, ast.KindEqualsEqualsEqualsToken, lowering.factory.NewStringLiteral("children", ast.TokenFlagsNone))
	var body *ast.Node
	if lowering.serverCaptureIsland != nil {
		value := lowering.factory.NewUniqueName("__exactChildValue")
		member := lowering.factory.NewElementAccessExpression(receiver, nil, key, ast.NodeFlagsNone)
		slot := lowering.call(lowering.names.serverSlot, []*ast.Node{
			lowering.factory.NewStringLiteral(islandCaptureSlotID(*island, capture), ast.TokenFlagsNone),
			lowering.islandCaptureSlotReference(*island, capture), value,
		})
		output := lowering.conditional(isChildren, lowering.conditional(lowering.islandScalarChildren(value), value, slot), value)
		body = lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{
			lowering.constStatement(value, member),
			lowering.factory.NewReturnStatement(lowering.islandSelectedValueOutput(node, read, value, output)),
		}), true)
	} else {
		body = lowering.conditional(isChildren,
			lowering.clientIslandPropsRead(lowering.factory.NewIdentifier("props"), "children"),
			lowering.factory.NewElementAccessExpression(lowering.clientIslandCapturedValue(capture.name), nil, key, ast.NodeFlagsNone),
		)
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, key, nil, lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword), nil)
	arrow := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), body)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(arrow), nil, nil,
		lowering.factory.NewNodeList([]*ast.Node{lowering.visitor.VisitNode(argument)}), ast.NodeFlagsNone)
}
