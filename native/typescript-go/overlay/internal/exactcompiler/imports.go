package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

func collectImports(sourceFile *ast.SourceFile) []Import {
	var imports []Import
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsImportDeclaration(statement) {
			declaration := statement.AsImportDeclaration()
			if !ast.IsStringLiteral(declaration.ModuleSpecifier) {
				continue
			}
			clause := declaration.ImportClause
			typeOnly := clause != nil &&
				clause.AsImportClause().PhaseModifier == ast.KindTypeKeyword
			sideEffectOnly := clause == nil
			imports = append(imports, Import{
				ModuleSpecifier: declaration.ModuleSpecifier.AsStringLiteral().Text,
				TypeOnly:        typeOnly,
				SideEffectOnly:  sideEffectOnly,
				RuntimeBinding:  importHasRuntimeBinding(clause),
				Enhancement:     exactEnhancementImport(declaration),
				Start:           statement.Pos(),
				Length:          statement.End() - statement.Pos(),
			})
			continue
		}
		if !ast.IsExportDeclaration(statement) {
			continue
		}
		declaration := statement.AsExportDeclaration()
		if declaration.ModuleSpecifier == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) {
			continue
		}
		runtimeBinding := exportHasRuntimeBinding(declaration)
		imports = append(imports, Import{
			ModuleSpecifier: declaration.ModuleSpecifier.AsStringLiteral().Text,
			TypeOnly:        !runtimeBinding,
			SideEffectOnly:  false,
			RuntimeBinding:  runtimeBinding,
			Start:           statement.Pos(),
			Length:          statement.End() - statement.Pos(),
		})
	}
	return imports
}

func exportHasRuntimeBinding(declaration *ast.ExportDeclaration) bool {
	if declaration.IsTypeOnly {
		return false
	}
	if declaration.ExportClause == nil {
		return true
	}
	clause := declaration.ExportClause.AsNode()
	if !ast.IsNamedExports(clause) {
		return true
	}
	for _, element := range clause.AsNamedExports().Elements.Nodes {
		if !element.AsExportSpecifier().IsTypeOnly {
			return true
		}
	}
	return false
}

func importHasRuntimeBinding(clause *ast.Node) bool {
	if clause == nil {
		return true
	}
	importClause := clause.AsImportClause()
	if importClause.PhaseModifier == ast.KindTypeKeyword {
		return false
	}
	if importClause.Name() != nil {
		return true
	}
	bindings := importClause.NamedBindings
	if bindings == nil {
		return false
	}
	if ast.IsNamespaceImport(bindings) {
		return true
	}
	for _, element := range bindings.AsNamedImports().Elements.Nodes {
		if !element.AsImportSpecifier().IsTypeOnly {
			return true
		}
	}
	return false
}
