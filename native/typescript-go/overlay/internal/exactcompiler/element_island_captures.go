package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// islandCaptureValue projects owner props into serializable data. Rendered children retain
// their server owner and cross as a slot reference, never as serialized render operations.
func (lowering *jsxLowering) islandCaptureValue(capture islandValueCapture) *ast.Node {
	value := lowering.factory.NewIdentifier(capture.name)
	if capture.propsKeys == nil {
		return value
	}
	properties := []*ast.Node{}
	for _, key := range capture.propsKeys {
		var member *ast.Node = lowering.factory.NewElementAccessExpression(value, nil,
			lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone), ast.NodeFlagsNone)
		if key == "children" {
			continue
		}
		properties = append(properties, lowering.property(jsxPropertyName(lowering.factory, key), member))
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)
}

func islandCaptureSlotID(island clientElementIsland, capture islandValueCapture) string {
	return island.id + ":capture:" + capture.name + ":children"
}

// lowerIslandCapturedChildren marks the actual position of forwarded server content inside
// the fallback. The hydrated wrapper adopts this range without constructing its children again.
func (lowering *jsxLowering) lowerIslandCapturedChildren(node *ast.Node) *ast.Node {
	island := lowering.serverCaptureIsland
	if island == nil || lowering.checker == nil {
		return nil
	}
	key, receiver, ok := directPropsRead(node)
	if !ok || key != "children" {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(receiver)
	if symbol == nil {
		return nil
	}
	for _, capture := range island.valueCaptures {
		if capture.propsKeys != nil && capture.symbol == ast.GetSymbolId(symbol) {
			return lowering.call(lowering.names.serverSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(islandCaptureSlotID(*island, capture), ast.TokenFlagsNone),
				lowering.islandCaptureSlotReference(*island, capture), node,
			})
		}
	}
	return nil
}

// islandDefinitionKey separates executable layouts while preserving the authored program ID.
func (lowering *jsxLowering) islandDefinitionKey(position int) int {
	if island := lowering.clientCaptureIsland; island != nil {
		return -1 - position - island.index*(len(lowering.sourceFile.Text())+1)
	}
	return position
}

func (lowering *jsxLowering) islandCaptureSlotReference(island clientElementIsland, capture islandValueCapture) *ast.Node {
	return lowering.serverSlotAuthority(islandCaptureSlotID(island, capture), island.component.ID,
		contractObject(lowering.factory, false, contractProperty(lowering.factory, "kind", contractString(lowering.factory, "single"))))
}

// islandChildrenCapture identifies the owner input transported through the existing boundary
// slot envelope, where SSR supplies request-specific execution authority.
func islandChildrenCapture(island clientElementIsland) (islandValueCapture, bool) {
	for _, capture := range island.valueCaptures {
		for _, key := range capture.propsKeys {
			if key == "children" {
				return capture, true
			}
		}
	}
	return islandValueCapture{}, false
}

func (lowering *jsxLowering) islandCapturedChildrenInput(island clientElementIsland) *ast.Node {
	capture, _ := islandChildrenCapture(island)
	return lowering.factory.NewPropertyAccessExpression(lowering.factory.NewIdentifier(capture.name), nil,
		lowering.factory.NewIdentifier("children"), ast.NodeFlagsNone)
}

// islandUsesAuthoredRootProps keeps enhancement definitions in executable code. Their imported
// functions and provider objects are not application data and must not enter the JSON envelope.
func (lowering *jsxLowering) islandUsesAuthoredRootProps(island clientElementIsland) bool {
	opening := island.node
	if ast.IsJsxFragment(opening) {
		return false
	}
	if ast.IsJsxElement(opening) {
		opening = opening.AsJsxElement().OpeningElement
	}
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	return tag == "_" || (jsxIntrinsic(tag) && lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes()))
}
