package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
)

type enhancementBinding struct {
	identity string
}

type enhancementImports struct {
	bindings     map[string]enhancementBinding
	declarations map[int]struct{}
	diagnostics  []Diagnostic
}

func collectEnhancementImports(sourceFile *ast.SourceFile) enhancementImports {
	result := enhancementImports{
		bindings:     make(map[string]enhancementBinding),
		declarations: make(map[int]struct{}),
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !exactPluginImport(declaration) {
			continue
		}
		result.declarations[statement.Pos()] = struct{}{}
		addDiagnostic := func(code string, message string) {
			line, column := sourceLocation(sourceFile, statement.Pos())
			result.diagnostics = append(result.diagnostics, Diagnostic{
				Severity: "error",
				Code:     code,
				Message: fmt.Sprintf(
					"error: %s:%d:%d %s",
					sourceFile.FileName(), line, column, message,
				),
				Start:  statement.Pos(),
				Length: statement.End() - statement.Pos(),
			})
		}
		if declaration.ImportClause == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) {
			addDiagnostic("EXACT6001", "exact-plugin imports require value bindings from a string module specifier")
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause.PhaseModifier == ast.KindTypeKeyword {
			addDiagnostic("EXACT6002", "type-only imports cannot define an exact-plugin JSX namespace")
			continue
		}
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		if name := clause.Name(); name != nil {
			result.bindings[name.Text()] = enhancementBinding{
				identity: moduleSpecifier + "#default",
			}
		}
		bindings := clause.NamedBindings
		if bindings == nil {
			if clause.Name() == nil {
				addDiagnostic("EXACT6001", "exact-plugin imports require a default or named value binding")
			}
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			addDiagnostic("EXACT6003", "namespace imports cannot define an exact-plugin JSX namespace")
			continue
		}
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.IsTypeOnly {
				addDiagnostic("EXACT6002", "type-only imports cannot define an exact-plugin JSX namespace")
				continue
			}
			exportName := specifier.Name().Text()
			if specifier.PropertyName != nil {
				exportName = specifier.PropertyName.Text()
			}
			result.bindings[specifier.Name().Text()] = enhancementBinding{
				identity: moduleSpecifier + "#" + exportName,
			}
		}
	}
	return result
}

func exactPluginImport(declaration *ast.ImportDeclaration) bool {
	if declaration.Attributes == nil {
		return false
	}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		item := attribute.AsImportAttribute()
		if item.Name().Text() != "type" || item.Value == nil ||
			!ast.IsStringLiteral(item.Value) {
			continue
		}
		if item.Value.AsStringLiteral().Text == "exact-plugin" {
			return true
		}
	}
	return false
}
