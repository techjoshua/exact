package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// planRenderProgramText selects independent run adoption or single-scalar static projection.
func (lowering *jsxLowering) planRenderProgramText(build *renderProgramBuild, node int, children []*ast.Node) (renderProgramTextProjections, bool) {
	if !lowering.renderProgramTextRun(children) {
		return lowering.renderProgramTextProjections(children), false
	}
	if build.textRuns == nil {
		build.textRuns = make(map[int][]*ast.Node)
	}
	build.textRuns[node] = nil
	return renderProgramTextProjections{}, true
}

// renderProgramTextRun proves that the complete intrinsic content consists of scalar
// expressions and literal text. Values are collected by the normal initial bindings.
func (lowering *jsxLowering) renderProgramTextRun(children []*ast.Node) bool {
	if lowering.target != TargetClient && lowering.target != TargetServer {
		return false
	}
	count := 0
	for _, child := range children {
		if ast.IsJsxText(child) {
			continue
		}
		if !ast.IsJsxExpression(child) {
			return false
		}
		expression := child.AsJsxExpression().Expression
		if expression == nil {
			continue
		}
		if expression.SubtreeFacts()&ast.SubtreeContainsJsx != 0 || !lowering.scalarRenderProgramExpression(expression) {
			return false
		}
		count++
	}
	return count >= 2
}

// renderProgramTextRunClaim defers proven whole-element text claims to initial binding adoption.
func (lowering *jsxLowering) renderProgramTextRunClaim(build *renderProgramBuild, path []int) *ast.Node {
	for index, node := range build.nodes {
		if len(node.path) == len(path) && pathPrefix(path, node.path) && len(build.textRuns[index]) != 0 {
			return lowering.renderProgramOperation(8, lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(build.textRuns[index]), false,
			))
		}
	}
	return nil
}
