package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// islandCapturedStateWrites projects captured function effects to the JSX range that
// invokes them, so their rendered consumers share that range's durable state owner.
func islandCapturedStateWrites(elements []componentElement, component *ast.Node, writes []StateWrite, typeChecker *checker.Checker) []StateWrite {
	result := append([]StateWrite(nil), writes...)
	for _, element := range elements {
		if !element.interactive {
			continue
		}
		_, captures := islandCaptures(component, fullJSXElementNode(element.node), typeChecker)
		for _, capture := range captures {
			for _, write := range writes {
				if write.Start >= capture.declaration.Pos() && write.Start < capture.declaration.End() {
					projected := write
					projected.Start = element.fullStart
					result = append(result, projected)
				}
			}
		}
	}
	return result
}
