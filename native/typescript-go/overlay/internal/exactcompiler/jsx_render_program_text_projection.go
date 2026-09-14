package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type renderProgramTextProjection struct {
	prefix string
	suffix string
}

type renderProgramTextProjections struct {
	values   map[int]renderProgramTextProjection
	consumed map[int]bool
}

// renderProgramTextProjections folds static text around one scalar expression into that scalar's
// focused operation. Several expressions retain independent operations; whole-element runs use
// a separate adoption plan to recover their text nodes without sharing computation ownership.
func (lowering *jsxLowering) renderProgramTextProjections(
	children []*ast.Node,
) renderProgramTextProjections {
	result := renderProgramTextProjections{
		values:   make(map[int]renderProgramTextProjection),
		consumed: make(map[int]bool),
	}
	for index, child := range children {
		if !ast.IsJsxExpression(child) {
			continue
		}
		expression := child.AsJsxExpression().Expression
		if expression == nil || expression.SubtreeFacts()&ast.SubtreeContainsJsx != 0 ||
			!lowering.scalarRenderProgramExpression(expression) {
			continue
		}
		start := index
		end := index
		if index > 0 && ast.IsJsxText(children[index-1]) {
			start--
		}
		if index+1 < len(children) && ast.IsJsxText(children[index+1]) {
			end++
		}
		if start > 0 && ast.IsJsxExpression(children[start-1]) ||
			end+1 < len(children) && ast.IsJsxExpression(children[end+1]) {
			continue
		}
		projection := renderProgramTextProjection{}
		if start != index {
			projection.prefix = normalizeJSXChildText(
				children[start].AsJsxText().Text, start, len(children),
			)
			if projection.prefix != "" {
				result.consumed[start] = true
			}
		}
		if end != index {
			projection.suffix = normalizeJSXChildText(
				children[end].AsJsxText().Text, end, len(children),
			)
			if projection.suffix != "" {
				result.consumed[end] = true
			}
		}
		if projection.prefix != "" || projection.suffix != "" {
			result.values[index] = projection
		}
	}
	return result
}
