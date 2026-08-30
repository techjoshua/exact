package exactcompiler

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

type renderProgramClaim struct {
	kind      string
	component bool
	index     int
	path      []int
	tag       string
	namespace string
	id        string
	width     int
}

// directRenderProgramClaims turns the compiler's intrinsic tree into compact cursor operations.
// Dynamic ranges advance themselves to their matching close marker, so later static siblings never
// depend on the number of server-rendered nodes inside those ranges.
func (lowering *jsxLowering) directRenderProgramClaims(
	build *renderProgramBuild,
) []*ast.Node {
	operations := make([]*ast.Node, 0, len(build.nodes)+len(build.slots))
	claimedElements := map[int]bool{0: true}
	var emitChildren func([]int)
	emitCall := func(helper string, arguments ...*ast.Node) {
		opcode := map[string]int{
			lowering.names.claimProgramElement:    0,
			lowering.names.enterProgramElement:    1,
			lowering.names.leaveProgramElement:    2,
			lowering.names.claimProgramText:       3,
			lowering.names.claimProgramKeyedChild: 4,
			lowering.names.claimProgramChild:      5,
			lowering.names.claimElementPath:       6,
			lowering.names.claimProgramProperty:   7,
		}[helper]
		operations = append(operations, lowering.renderProgramOperation(opcode, arguments...))
	}
	emitChildren = func(parentPath []int) {
		claims := make([]renderProgramClaim, 0)
		for index, node := range build.nodes {
			if index == 0 || !directChildPath(node.path, parentPath) ||
				!directProgramHasSlotDescendant(build, node.path) {
				continue
			}
			claims = append(claims, renderProgramClaim{
				kind: "element", index: index, path: node.path, tag: node.tag,
				namespace: node.namespace, width: 1,
			})
		}
		for index, slot := range build.slots {
			if slot.kind != "text" && slot.kind != "child" && slot.kind != "component" {
				continue
			}
			path := append([]int(nil), slot.path...)
			width := 2
			kind := slot.kind
			if slot.markerlessTail {
				kind = "keyed"
				width = 0
			}
			if slot.kind == "text" {
				path[len(path)-1]--
				width = 3
			}
			if !directChildPath(path, parentPath) {
				continue
			}
			claims = append(claims, renderProgramClaim{
				kind: kind, component: slot.kind == "component", index: index, path: path, id: slot.id, width: width,
			})
		}
		sort.SliceStable(claims, func(left int, right int) bool {
			return claims[left].path[len(claims[left].path)-1] < claims[right].path[len(claims[right].path)-1]
		})
		position := 0
		for _, claim := range claims {
			childIndex := claim.path[len(claim.path)-1]
			skip := lowering.factory.NewNumericLiteral(strconv.Itoa(childIndex-position), ast.TokenFlagsNone)
			claimIndex := lowering.factory.NewNumericLiteral(strconv.Itoa(claim.index), ast.TokenFlagsNone)
			switch claim.kind {
			case "element":
				claimedElements[claim.index] = true
				arguments := []*ast.Node{
					claimIndex,
					skip,
					lowering.factory.NewStringLiteral(claim.tag, ast.TokenFlagsNone),
				}
				if claim.namespace != build.namespace || build.namespace == "contextual" {
					arguments = append(
						arguments,
						lowering.factory.NewStringLiteral(claim.namespace, ast.TokenFlagsNone),
					)
				}
				emitCall(lowering.names.claimProgramElement, arguments...)
				if directProgramHasSlotDescendant(build, claim.path) {
					emitCall(lowering.names.enterProgramElement, claimIndex)
					emitChildren(claim.path)
					emitCall(lowering.names.leaveProgramElement)
				}
			case "text":
				arguments := []*ast.Node{claimIndex, skip}
				if build.markerlessTextSlot(claim.index) {
					arguments = append(arguments, lowering.factory.NewTrueExpression())
				} else {
					arguments = append(
						arguments,
						lowering.factory.NewStringLiteral(claim.id, ast.TokenFlagsNone),
					)
				}
				emitCall(lowering.names.claimProgramText, arguments...)
			case "keyed":
				arguments := []*ast.Node{claimIndex, skip}
				if claim.component {
					arguments = append(arguments, lowering.factory.NewTrueExpression())
				}
				emitCall(lowering.names.claimProgramKeyedChild, arguments...)
			default:
				arguments := []*ast.Node{
					claimIndex,
					skip,
					lowering.factory.NewStringLiteral(claim.id, ast.TokenFlagsNone),
				}
				if claim.kind == "component" {
					arguments = append(arguments, lowering.factory.NewTrueExpression())
				}
				emitCall(lowering.names.claimProgramChild, arguments...)
			}
			position = childIndex + claim.width
		}
	}
	emitChildren(nil)
	for _, binding := range build.propertyBindings() {
		if !claimedElements[binding.node] {
			encoded, encodable := directProgramElementPath(build, build.nodes[binding.node].path)
			if !encodable {
				return lowering.directRenderProgramClaimsAll(build)
			}
			node := build.nodes[binding.node]
			arguments := []*ast.Node{
				lowering.factory.NewNumericLiteral(strconv.Itoa(binding.node), ast.TokenFlagsNone),
				lowering.factory.NewNumericLiteral(strconv.FormatUint(encoded, 10), ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(node.tag, ast.TokenFlagsNone),
			}
			if node.namespace != build.namespace || build.namespace == "contextual" {
				arguments = append(
					arguments,
					lowering.factory.NewStringLiteral(node.namespace, ast.TokenFlagsNone),
				)
			}
			emitCall(lowering.names.claimElementPath, arguments...)
			claimedElements[binding.node] = true
		}
		emitCall(
			lowering.names.claimProgramProperty,
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.slots[0]), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.node), ast.TokenFlagsNone),
		)
	}
	return operations
}

func (lowering *jsxLowering) renderProgramOperation(kind int, operands ...*ast.Node) *ast.Node {
	values := make([]*ast.Node, 0, len(operands)+1)
	values = append(values, lowering.factory.NewNumericLiteral(strconv.Itoa(kind), ast.TokenFlagsNone))
	values = append(values, operands...)
	return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
}
