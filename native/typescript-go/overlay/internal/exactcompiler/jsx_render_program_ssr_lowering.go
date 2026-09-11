package exactcompiler

import (
	"html"
	"strconv"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// directRenderProgramSsrPlan records component-owned serialization order. The server runtime
// supplies escaping, marker, traversal-limit, and child-rendering primitives; it never interprets
// a topology table to reconstruct what the compiler already proved.
func (lowering *jsxLowering) directRenderProgramSsrPlan(build *renderProgramBuild) renderProgramSsrPlan {
	target := lowering.factory.NewIdentifier("__exactSsr")
	context := lowering.factory.NewIdentifier("__exactContext")
	invocation := lowering.factory.NewIdentifier("__exactInvocation")
	output := lowering.factory.NewIdentifier("__exactOutput")
	characters := lowering.factory.NewIdentifier("__exactCharacters")
	statements := make([]*ast.Node, 0, len(build.serverSlots)*3+4)
	writes := make([]renderProgramSsrWrite, 0, len(build.serverSlots)*2+1)
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
		if method != "begin" {
			writes = append(writes, renderProgramSsrWrite{statement: len(statements), method: method})
		}
		statements = append(statements, lowering.factory.NewExpressionStatement(
			callExpression(method, arguments...),
		))
	}
	assignCall := func(method string, arguments ...*ast.Node) {
		writes = append(writes, renderProgramSsrWrite{statement: len(statements), method: method, assignsCharacters: true})
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
	scalarPropsProofs := make(map[string]*ast.Node)
	for index, slot := range build.slots {
		method := "prepareAttribute"
		if slot.kind == "text" {
			method = "prepareText"
		} else if slot.kind == "child" {
			method = "prepareChild"
		} else if slot.kind == "component" && slot.serverComponent != nil {
			method = "prepareComponentProps"
		} else if slot.kind == "component" {
			method = "prepareComponent"
		}
		value := lowering.factory.NewIdentifier("__exactValue_" + strconv.Itoa(index))
		values[index] = value
		if slot.kind == "component" && slot.serverComponent != nil {
			if proof := lowering.scalarServerPropsProof(slot.reader); proof != nil {
				scalarPropsProofs[value.Text()] = proof
			}
		}
		// Root bags are object literals constructed by this compiler, not authored reactive
		// values. Their individual attributes still pass through ordinary serialization.
		preparedRoot := slot.kind == "root-attributes" && ast.IsObjectLiteralExpression(slot.reader)
		initializer := callExpression(method, invocation, numberLiteral(index))
		if preparedRoot {
			initializer = lowering.factory.NewElementAccessExpression(
				lowering.factory.NewPropertyAccessExpression(invocation, nil, lowering.factory.NewIdentifier("eagerValues"), ast.NodeFlagsNone),
				nil, numberLiteral(index), ast.NodeFlagsNone,
			)
		}
		statements = append(statements, lowering.factory.NewVariableStatement(
			nil,
			lowering.factory.NewVariableDeclarationList(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewVariableDeclaration(
						value,
						nil,
						nil,
						initializer,
					),
				}),
				ast.NodeFlagsConst,
			),
		))
		if preparedRoot {
			continue
		}
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
	staticBytes := 0
	for _, segment := range build.serverSegments {
		staticCharacters += utf16Length(segment)
		staticBytes += len(segment)
	}
	for _, slot := range build.slots {
		if slot.kind != "text" {
			continue
		}
		prefix := html.EscapeString(slot.textPrefix)
		suffix := html.EscapeString(slot.textSuffix)
		staticCharacters += utf16Length(prefix) + utf16Length(suffix)
		staticBytes += len(prefix) + len(suffix)
	}
	call(
		"begin",
		context,
		numberLiteral(len(build.nodes)),
		numberLiteral(len(build.slots)),
		numberLiteral(staticCharacters),
		numberLiteral(staticBytes),
	)
	outputDeclaration := len(statements)
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
	skipStaticPosition := -1
	for position, slotIndex := range build.serverSlots {
		slot := build.slots[slotIndex]
		if part := build.serverSegments[position]; part != "" &&
			position != skipStaticPosition && slot.kind != "root-attributes" && slot.kind != "text" {
			call("static", output, stringLiteral(part))
		}
		value := values[slotIndex]
		switch slot.kind {
		case "text":
			prefix := html.EscapeString(slot.textPrefix)
			suffix := html.EscapeString(slot.textSuffix)
			// Surrounding markup is already serialized and charged by begin. Fold it into
			// the scalar write while preserving rootOpening's ownership of its segments.
			if position != skipStaticPosition {
				prefix = build.serverSegments[position] + prefix
			}
			nextPosition := position + 1
			if nextPosition == len(build.serverSlots) || build.slots[build.serverSlots[nextPosition]].kind != "root-attributes" {
				suffix += build.serverSegments[nextPosition]
				skipStaticPosition = nextPosition
			}
			arguments := []*ast.Node{context, output, value, stringLiteral(slot.id), characters}
			markerless := build.markerlessTextSlot(slotIndex)
			if markerless || prefix != "" || suffix != "" {
				if markerless {
					arguments = append(arguments, lowering.factory.NewTrueExpression())
				} else {
					arguments = append(arguments, lowering.factory.NewIdentifier("undefined"))
				}
			}
			if prefix != "" || suffix != "" {
				arguments = append(
					arguments,
					stringLiteral(prefix),
					stringLiteral(suffix),
				)
			}
			assignCall("text", arguments...)
		case "child":
			if slot.markerlessTail {
				call("keyedChild", output, value)
			} else {
				assignCall("child", context, output, value, stringLiteral(slot.id), characters)
			}
		case "component":
			method := "component"
			arguments := []*ast.Node{context, output, value, stringLiteral(slot.id), characters}
			if slot.serverComponent != nil {
				method = "directComponent"
				arguments = []*ast.Node{context, output, slot.serverComponent, value, stringLiteral(slot.id), characters}
			}
			if _, bounded := boundedComponentEndPath(build, slotIndex); slot.markerlessTail || bounded {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			assignCall(method, arguments...)
		case "spread":
			assignCall(
				"attributes",
				context,
				output,
				value,
				stringLiteral(build.nodes[slot.node].tag),
				characters,
			)
		case "root-attributes":
			skipStaticPosition = position + 1
			assignCall(
				"rootOpening",
				context,
				output,
				value,
				stringLiteral(slot.name),
				stringLiteral(build.serverSegments[position]),
				stringLiteral(build.serverSegments[skipStaticPosition]),
				characters,
				lowering.factory.NewPropertyAccessExpression(
					lowering.factory.NewPropertyAccessExpression(
						invocation,
						nil,
						lowering.factory.NewIdentifier("program"),
						ast.NodeFlagsNone,
					),
					nil,
					lowering.factory.NewIdentifier("ssrRootStatic"),
					ast.NodeFlagsNone,
				),
			)
		default:
			attribute := compiledSsrAttribute(build.nodes[slot.node].tag, slot.name)
			assignCall(
				"compiledAttribute",
				context,
				output,
				value,
				numberLiteral(attribute.kind),
				stringLiteral(slot.name),
				stringLiteral(attribute.attribute),
				stringLiteral(build.nodes[slot.node].tag),
				characters,
			)
		}
	}
	if lastPosition := len(build.serverSegments) - 1; lastPosition != skipStaticPosition {
		last := build.serverSegments[lastPosition]
		if last != "" {
			if lowering.target == TargetServer && build.nodes[0].tag == "body" && strings.HasSuffix(last, "</body>") {
				// Keep the document insertion boundary in compiler metadata instead of scanning rendered HTML.
				call("static", output, stringLiteral(last), numberLiteral(utf16Length(last)-7))
			} else {
				call("static", output, stringLiteral(last))
			}
		}
	}
	statements = append(statements, lowering.factory.NewReturnStatement(output))
	return renderProgramSsrPlan{
		statements: statements, writes: writes,
		scalarPropsProofs: scalarPropsProofs,
		target:            target, context: context, invocation: invocation,
		output: output, outputDeclaration: outputDeclaration,
	}
}
