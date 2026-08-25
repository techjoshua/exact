package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// emittedRuntimeDependencies returns the bare package specifiers that survive target lowering.
// This is an emitted-artifact contract, not an approximation from authored imports.
func emittedRuntimeDependencies(sourceFile *ast.SourceFile) []string {
	dependencies := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		var moduleSpecifier *ast.Node
		switch {
		case ast.IsImportDeclaration(statement):
			moduleSpecifier = statement.AsImportDeclaration().ModuleSpecifier
		case ast.IsExportDeclaration(statement):
			moduleSpecifier = statement.AsExportDeclaration().ModuleSpecifier
		}
		if moduleSpecifier == nil || !ast.IsStringLiteral(moduleSpecifier) {
			continue
		}
		specifier := moduleSpecifier.Text()
		if specifier == "" || strings.HasPrefix(specifier, ".") || strings.HasPrefix(specifier, "/") {
			continue
		}
		dependencies[specifier] = struct{}{}
	}
	result := make([]string, 0, len(dependencies))
	for dependency := range dependencies {
		result = append(result, dependency)
	}
	sort.Strings(result)
	return result
}
