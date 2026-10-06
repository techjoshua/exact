package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskGenerationSignalCall preserves signals used to identify publication and continuation frames.
// Resource signals close on successful settlement and must not replace generation identity.
func taskGenerationSignalCall(expression *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker) bool {
	reference, exists := externalImportForExpression(expression, collectExternalImportBindings(sourceFile, typeChecker), typeChecker)
	if !exists {
		return false
	}
	switch reference.moduleSpecifier {
	case "@exactjs/core", "@exactjs/core/tasks", "@exactjs/core/tasks/v1", "@exactjs/core/runtime/tasks", "@exactjs/core/framework/server-task-helpers":
	default:
		return false
	}
	switch reference.exportName {
	case "dispatchComponentContinuation", "stageTaskMutation", "publishTaskMutations", "discardTaskMutations", "mutateTaskCollection", "takeTaskCollectionMutations", "createTaskState", "taskAwait":
		return true
	default:
		return false
	}
}
