package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// setupTaskInitializationOnly distinguishes authored empty policy calls from inferred computations.
// Their body captures establish initial availability without extending activation lifetime.
func setupTaskInitializationOnly(sourceFile *ast.SourceFile, task Task) bool {
	work := nodeAtSpan(sourceFile.AsNode(), task.WorkStart, task.WorkLength)
	if work == nil || !isCallableNode(work) || task.CompilerComputation {
		return false
	}
	if task.CompilerSetup {
		return false
	}
	source := nodeAtSpan(sourceFile.AsNode(), task.Start, task.Length)
	return source != nil && ast.IsCallExpression(source) && len(callArguments(source)) == 0 && len(work.Parameters()) > task.ArgumentCount
}
