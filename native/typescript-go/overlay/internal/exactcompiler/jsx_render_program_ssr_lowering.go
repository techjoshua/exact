package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

// directRenderProgramSsrWriter emits component-owned serialization order. The server runtime
// supplies escaping, marker, traversal-limit, and child-rendering primitives; it never interprets
// a topology table to reconstruct what the compiler already proved.
func (lowering *jsxLowering) directRenderProgramSsrWriter(build *renderProgramBuild) *ast.Node {
	target := lowering.factory.NewIdentifier("__exactSsr")
	statements := make([]*ast.Node, 0, len(build.serverSlots)*2+2)
	callExpression := func(method string, arguments ...*ast.Node) *ast.Node {
		callee := lowering.factory.NewPropertyAccessExpression(
			target,
			nil,
			lowering.factory.NewIdentifier(method),
			ast.NodeFlagsNone,
		)
		return lowering.factory.NewCallExpression(
			callee,
			nil,
			nil,
			lowering.factory.NewNodeList(arguments),
			ast.NodeFlagsNone,
		)
	}
	call := func(method string, arguments ...*ast.Node) {
		statements = append(statements, lowering.factory.NewExpressionStatement(
			callExpression(method, arguments...),
		))
	}
	stringLiteral := func(value string) *ast.Node {
		return lowering.factory.NewStringLiteral(value, ast.TokenFlagsNone)
	}
	numberLiteral := func(value int) *ast.Node {
		return lowering.factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
	}
	values := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		method := "prepareAttribute"
		if slot.kind == "text" {
			method = "prepareText"
		} else if slot.kind == "child" || slot.kind == "component" {
			method = "prepareChild"
		}
		value := lowering.factory.NewIdentifier("__exactValue_" + strconv.Itoa(index))
		values[index] = value
		statements = append(statements, lowering.factory.NewVariableStatement(
			nil,
			lowering.factory.NewVariableDeclarationList(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewVariableDeclaration(
						value,
						nil,
						nil,
						callExpression(method, numberLiteral(index)),
					),
				}),
				ast.NodeFlagsConst,
			),
		))
	}
	call("begin", numberLiteral(len(build.nodes)), numberLiteral(len(build.slots)))
	for position, slotIndex := range build.serverSlots {
		if part := build.serverSegments[position]; part != "" {
			call("static", stringLiteral(part))
		}
		slot := build.slots[slotIndex]
		value := values[slotIndex]
		switch slot.kind {
		case "text":
			arguments := []*ast.Node{value, stringLiteral(slot.id)}
			if build.markerlessTextSlot(slotIndex) {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			call("text", arguments...)
		case "child", "component":
			if slot.markerlessTail {
				call("keyedChild", value)
			} else {
				call("child", value, stringLiteral(slot.id))
			}
		default:
			call(
				"attribute",
				value,
				stringLiteral(slot.name),
				stringLiteral(build.nodes[slot.node].tag),
			)
		}
	}
	if last := build.serverSegments[len(build.serverSegments)-1]; last != "" {
		call("static", stringLiteral(last))
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, target, nil, nil, nil)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}
