package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// Import describes a static declaration, re-export, or literal dynamic import edge.
type Import struct {
	ModuleSpecifier string `json:"moduleSpecifier"`
	ResolvedFile    string `json:"resolvedFile,omitempty"`
	TypeOnly        bool   `json:"typeOnly"`
	SideEffectOnly  bool   `json:"sideEffectOnly"`
	RuntimeBinding  bool   `json:"runtimeBinding"`
	Enhancement     bool   `json:"enhancement,omitempty"`
	Dynamic         bool   `json:"dynamic,omitempty"`
	Start           int    `json:"start"`
	Length          int    `json:"length"`
}

func forEachStaticImport(sourceFile *ast.SourceFile, visit func(Import, *ast.Node)) {
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
			visit(Import{
				ModuleSpecifier: declaration.ModuleSpecifier.AsStringLiteral().Text,
				TypeOnly:        typeOnly,
				SideEffectOnly:  sideEffectOnly,
				RuntimeBinding:  importHasRuntimeBinding(clause),
				Enhancement:     exactEnhancementImport(declaration),
				Start:           statement.Pos(),
				Length:          statement.End() - statement.Pos(),
			}, declaration.ModuleSpecifier)
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
		visit(Import{
			ModuleSpecifier: declaration.ModuleSpecifier.AsStringLiteral().Text,
			TypeOnly:        !runtimeBinding,
			SideEffectOnly:  false,
			RuntimeBinding:  runtimeBinding,
			Start:           statement.Pos(),
			Length:          statement.End() - statement.Pos(),
		}, declaration.ModuleSpecifier)
	}
}

func collectImports(sourceFile *ast.SourceFile, program *compiler.Program) []Import {
	var imports []Import
	forEachStaticImport(sourceFile, func(edge Import, specifier *ast.Node) {
		if resolved := program.GetResolvedModuleFromModuleSpecifier(sourceFile, specifier); resolved != nil && resolved.IsResolved() {
			edge.ResolvedFile = resolved.ResolvedFileName
		}
		imports = append(imports, edge)
	})
	// Literal dynamic imports are dependency edges even though their evaluation is deferred.
	// Project compilation must emit and rewrite their targets before moving artifacts.
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if call.Expression == nil || call.Expression.Kind != ast.KindImportKeyword ||
			call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			return true
		}
		argument := call.Arguments.Nodes[0]
		if !ast.IsStringLiteral(argument) && !ast.IsNoSubstitutionTemplateLiteral(argument) {
			return true
		}
		imports = append(imports, Import{
			ModuleSpecifier: argument.Text(), RuntimeBinding: true, Dynamic: true,
			Start: node.Pos(), Length: node.End() - node.Pos(),
		})
		return true
	})
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
