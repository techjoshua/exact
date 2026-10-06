package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// oppositeExportBindings connects pruned public exports to their own local initializers.
// Re-exports do not grant authority to remove a same-named binding in this module.
func oppositeExportBindings(sourceFile *ast.SourceFile, omittedExports map[string]struct{}) map[string]struct{} {
	result := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsVariableStatement(statement) && ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) {
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				for _, name := range componentBindingNames(declaration.Name()) {
					if _, omit := omittedExports[name]; omit {
						result[name] = struct{}{}
					}
				}
			}
		}
		if ast.IsExportDeclaration(statement) {
			declaration := statement.AsExportDeclaration()
			if declaration.ModuleSpecifier != nil || declaration.ExportClause == nil || !ast.IsNamedExports(declaration.ExportClause) {
				continue
			}
			for _, element := range declaration.ExportClause.AsNamedExports().Elements.Nodes {
				specifier := element.AsExportSpecifier()
				if _, omit := omittedExports[specifier.Name().Text()]; !omit {
					continue
				}
				name := specifier.Name()
				if specifier.PropertyName != nil {
					name = specifier.PropertyName
				}
				result[name.Text()] = struct{}{}
			}
		}
		if ast.IsExportAssignment(statement) {
			assignment := statement.AsExportAssignment()
			if _, omit := omittedExports["default"]; omit && !assignment.IsExportEquals && ast.IsIdentifier(assignment.Expression) {
				result[assignment.Expression.Text()] = struct{}{}
			}
		}
	}
	return result
}
