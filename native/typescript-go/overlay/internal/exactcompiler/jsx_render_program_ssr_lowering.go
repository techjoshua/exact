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
	context := lowering.factory.NewIdentifier("__exactContext")
	invocation := lowering.factory.NewIdentifier("__exactInvocation")
	output := lowering.factory.NewIdentifier("__exactOutput")
	characters := lowering.factory.NewIdentifier("__exactCharacters")
	statements := make([]*ast.Node, 0, len(build.serverSlots)*3+4)
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
	assignCall := func(method string, arguments ...*ast.Node) {
		statements = append(statements, lowering.factory.NewExpressionStatement(
			lowering.binary(characters, ast.KindEqualsToken, callExpression(method, arguments...)),
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
		} else if slot.kind == "child" {
			method = "prepareChild"
		} else if slot.kind == "component" {
			method = "prepareComponent"
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
						callExpression(method, invocation, numberLiteral(index)),
					),
				}),
				ast.NodeFlagsConst,
			),
		))
		statements = append(statements, lowering.factory.NewIfStatement(
			lowering.binary(
				value,
				ast.KindEqualsEqualsEqualsToken,
				lowering.factory.NewPropertyAccessExpression(
					target,
					nil,
					lowering.factory.NewIdentifier("unprepared"),
					ast.NodeFlagsNone,
				),
			),
			lowering.factory.NewReturnStatement(nil),
			nil,
		))
	}
	staticCharacters := 0
	for _, segment := range build.serverSegments {
		staticCharacters += utf16Length(segment)
	}
	call(
		"begin",
		context,
		numberLiteral(len(build.nodes)),
		numberLiteral(len(build.slots)),
		numberLiteral(staticCharacters),
	)
	statements = append(statements, lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					output,
					nil,
					nil,
					callExpression("output"),
				),
			}),
			ast.NodeFlagsConst,
		),
	))
	statements = append(statements, lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					characters,
					nil,
					nil,
					numberLiteral(staticCharacters),
				),
			}),
			ast.NodeFlagsLet,
		),
	))
	for position, slotIndex := range build.serverSlots {
		if part := build.serverSegments[position]; part != "" {
			call("static", output, stringLiteral(part))
		}
		slot := build.slots[slotIndex]
		value := values[slotIndex]
		switch slot.kind {
		case "text":
			arguments := []*ast.Node{context, output, value, stringLiteral(slot.id), characters}
			if build.markerlessTextSlot(slotIndex) {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			assignCall("text", arguments...)
		case "child":
			if slot.markerlessTail {
				call("keyedChild", output, value)
			} else {
				assignCall("child", context, output, value, stringLiteral(slot.id), characters)
			}
		case "component":
			arguments := []*ast.Node{context, output, value, stringLiteral(slot.id), characters}
			if slot.markerlessTail {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			assignCall("component", arguments...)
		default:
			assignCall(
				"attribute",
				context,
				output,
				value,
				stringLiteral(slot.name),
				stringLiteral(build.nodes[slot.node].tag),
				characters,
			)
		}
	}
	if last := build.serverSegments[len(build.serverSegments)-1]; last != "" {
		call("static", output, stringLiteral(last))
	}
	statements = append(statements, lowering.factory.NewReturnStatement(output))
	parameters := lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewParameterDeclaration(nil, nil, target, nil, nil, nil),
		lowering.factory.NewParameterDeclaration(nil, nil, context, nil, nil, nil),
		lowering.factory.NewParameterDeclaration(nil, nil, invocation, nil, nil, nil),
	})
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		parameters,
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}
