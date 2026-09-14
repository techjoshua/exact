package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// renderProgramSsrWrite identifies a compiler-emitted write without rediscovering calls from
// printed JavaScript. Character assignments must resume with the settled operation result.
type renderProgramSsrWrite struct {
	statement         int
	method            string
	assignsCharacters bool
}

// maySuspend distinguishes recursive rendering from synchronous serialization primitives.
// All writes can still create sink backpressure, independently of their operation result.
func (write renderProgramSsrWrite) maySuspend() bool {
	switch write.method {
	case "static", "text", "attribute", "compiledAttribute", "attributes", "rootOpening":
		return false
	default:
		return true
	}
}

// renderProgramSsrPlan keeps preparation and ordered write sites in the same native AST plan.
// These are serialization boundaries, not proof that task-dependent inputs can be read early.
type renderProgramSsrPlan struct {
	statements                  []*ast.Node
	writes                      []renderProgramSsrWrite
	scalarPropsProofs           map[string]*ast.Node
	target, context, invocation *ast.Node
	output                      *ast.Node
	outputDeclaration           int
}

// directRenderProgramSsrWriter selects the caller-owned continuation ABI.
func (lowering *jsxLowering) directRenderProgramSsrWriter(build *renderProgramBuild) *ast.Node {
	return lowering.directRenderProgramSsrSinkWriter(build)
}
