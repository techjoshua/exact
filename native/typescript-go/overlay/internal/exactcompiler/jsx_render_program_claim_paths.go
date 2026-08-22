package exactcompiler

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

// directRenderProgramClaimsAll retains the cursor-only fallback for an element path that cannot
// fit the compact generated path operand. Ordinary compiled DOM stays on the targeted lane.
func (lowering *jsxLowering) directRenderProgramClaimsAll(
	build *renderProgramBuild,
	target *ast.Node,
) []*ast.Node {
	statements := make([]*ast.Node, 0, len(build.nodes)+len(build.slots))
	emitCall := func(helper string, arguments ...*ast.Node) {
		statements = append(statements, lowering.factory.NewExpressionStatement(
			lowering.call(helper, append([]*ast.Node{target}, arguments...)),
		))
	}
	var emitChildren func([]int)
	emitChildren = func(parentPath []int) {
		claims := lowering.directProgramChildClaims(build, parentPath)
		position := 0
		for _, claim := range claims {
			childIndex := claim.path[len(claim.path)-1]
			skip := lowering.factory.NewNumericLiteral(strconv.Itoa(childIndex-position), ast.TokenFlagsNone)
			claimIndex := lowering.factory.NewNumericLiteral(strconv.Itoa(claim.index), ast.TokenFlagsNone)
			switch claim.kind {
			case "element":
				arguments := []*ast.Node{claimIndex, skip, lowering.factory.NewStringLiteral(claim.tag, ast.TokenFlagsNone)}
				if claim.namespace != build.namespace {
					arguments = append(arguments, lowering.factory.NewStringLiteral(claim.namespace, ast.TokenFlagsNone))
				}
				emitCall(lowering.names.claimProgramElement, arguments...)
				if directProgramHasChildren(build, claim.path) {
					emitCall(lowering.names.enterProgramElement, claimIndex)
					emitChildren(claim.path)
					emitCall(lowering.names.leaveProgramElement)
				}
			case "text":
				arguments := []*ast.Node{claimIndex, skip}
				if build.markerlessTextSlot(claim.index) {
					arguments = append(arguments, lowering.factory.NewTrueExpression())
				} else {
					arguments = append(arguments, lowering.factory.NewStringLiteral(claim.id, ast.TokenFlagsNone))
				}
				emitCall(lowering.names.claimProgramText, arguments...)
			default:
				arguments := []*ast.Node{claimIndex, skip, lowering.factory.NewStringLiteral(claim.id, ast.TokenFlagsNone)}
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
		emitCall(
			lowering.names.claimProgramProperty,
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.slots[0]), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.node), ast.TokenFlagsNone),
		)
	}
	return statements
}

func (lowering *jsxLowering) directProgramChildClaims(
	build *renderProgramBuild,
	parentPath []int,
) []renderProgramClaim {
	claims := make([]renderProgramClaim, 0)
	for index, node := range build.nodes {
		if index != 0 && directChildPath(node.path, parentPath) {
			claims = append(claims, renderProgramClaim{
				kind: "element", index: index, path: node.path, tag: node.tag,
				namespace: node.namespace, width: 1,
			})
		}
	}
	for index, slot := range build.slots {
		if slot.kind != "text" && slot.kind != "child" && slot.kind != "component" {
			continue
		}
		path := append([]int(nil), slot.path...)
		width := 2
		if slot.kind == "text" {
			path[len(path)-1]--
			width = 3
		}
		if directChildPath(path, parentPath) {
			claims = append(claims, renderProgramClaim{
				kind: slot.kind, index: index, path: path, id: slot.id, width: width,
			})
		}
	}
	sort.SliceStable(claims, func(left int, right int) bool {
		return claims[left].path[len(claims[left].path)-1] < claims[right].path[len(claims[right].path)-1]
	})
	return claims
}

// directProgramElementPath packs stable element-child ordinals rather than Node.childNodes offsets.
// Each seven-bit step stores a six-bit ordinal and a high bit selecting children from the end.
// The compiler selects an edge that no preceding structural slot can perturb; a component with
// structural slots on both sides falls back to its generated cursor claims.
func directProgramElementPath(build *renderProgramBuild, path []int) (uint64, bool) {
	if len(path) > 7 {
		return 0, false
	}
	encoded := uint64(len(path))
	factor := uint64(16)
	parent := []int{}
	for pathIndex, childNodeIndex := range path {
		step, stable := directProgramElementPathStep(build, parent, childNodeIndex)
		if !stable {
			return 0, false
		}
		encoded += step * factor
		if pathIndex != len(path)-1 {
			factor *= 128
		}
		parent = append(parent, childNodeIndex)
	}
	return encoded, encoded <= 9007199254740991
}

func directProgramElementPathStep(
	build *renderProgramBuild,
	parent []int,
	childNodeIndex int,
) (uint64, bool) {
	variableBefore := false
	variableAfter := false
	for _, slot := range build.slots {
		if (slot.kind != "child" && slot.kind != "component") || !directChildPath(slot.path, parent) {
			continue
		}
		candidate := slot.path[len(slot.path)-1]
		if candidate < childNodeIndex {
			variableBefore = true
		} else if candidate > childNodeIndex {
			variableAfter = true
		}
	}
	if variableBefore && variableAfter {
		return 0, false
	}

	before := 0
	after := 0
	found := false
	for _, node := range build.nodes {
		if !directChildPath(node.path, parent) {
			continue
		}
		candidate := node.path[len(node.path)-1]
		switch {
		case candidate < childNodeIndex:
			before++
		case candidate > childNodeIndex:
			after++
		default:
			found = true
		}
	}
	if !found {
		return 0, false
	}
	if !variableBefore && before < 64 {
		return uint64(before), true
	}
	if !variableAfter && after < 64 {
		return uint64(after + 64), true
	}
	return 0, false
}

func pathPrefix(prefix []int, path []int) bool {
	if len(prefix) > len(path) {
		return false
	}
	for index := range prefix {
		if prefix[index] != path[index] {
			return false
		}
	}
	return true
}
