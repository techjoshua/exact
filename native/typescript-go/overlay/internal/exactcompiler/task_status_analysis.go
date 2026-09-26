package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Status views are owner-bound setup resources. Recognize the imported API without matching
// shadowed local functions so server projection and island reconstruction share the same rule.
func isTaskStatusCall(node *ast.Node, imports externalImportBindings, typeChecker *checker.Checker) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	reference, imported := externalImportForExpression(call.Expression, imports, typeChecker)
	if !imported || reference.exportName != "taskStatus" ||
		(reference.moduleSpecifier != "@exactjs/core" && reference.moduleSpecifier != "@exactjs/core/tasks" && reference.moduleSpecifier != "@exactjs/core/tasks/v1") {
		return false
	}
	importName := call.Expression
	if ast.IsPropertyAccessExpression(importName) {
		if importName.AsPropertyAccessExpression().Name().Text() != "taskStatus" {
			return false
		}
		importName = importName.AsPropertyAccessExpression().Expression
	}
	if !ast.IsIdentifier(importName) {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(importName)
	isImport := false
	if symbol != nil {
		for _, declaration := range symbol.Declarations {
			isImport = isImport || ast.IsImportSpecifier(declaration) || ast.IsNamespaceImport(declaration)
		}
	}
	if !isImport {
		return false
	}
	return true
}
