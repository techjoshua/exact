package compiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"maps"
)

// canReuseExactJSXRuntimeImport preserves resolution only when the implicit module and
// resolution mode are unchanged. Helpers and content-mapped siblings retain upstream guards.
func (p *Program) canReuseExactJSXRuntimeImport(oldFile, newFile *ast.SourceFile) bool {
	old := p.jsxRuntimeImportSpecifiers[oldFile.Path()]
	next := p.jsxRuntimeImportSpecifier(newFile)
	if old == nil {
		return next == ""
	}
	return old.moduleReference == next && p.GetDefaultResolutionModeForFile(oldFile) == p.GetDefaultResolutionModeForFile(newFile)
}

// replaceExactJSXRuntimeImport creates fresh synthetic nodes parented to the new source.
// Never mutate the old program's map or AST: concurrent checkers can still own them.
func (p *Program) replaceExactJSXRuntimeImport(file *ast.SourceFile) {
	old := p.jsxRuntimeImportSpecifiers[file.Path()]
	if old == nil {
		return
	}
	factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	specifier := factory.NewStringLiteral(old.moduleReference, ast.TokenFlagsNone)
	declaration := factory.NewImportDeclaration(nil, nil, specifier, nil)
	specifier.Parent = declaration
	declaration.Parent = file.AsNode()
	p.jsxRuntimeImportSpecifiers = maps.Clone(p.jsxRuntimeImportSpecifiers)
	p.jsxRuntimeImportSpecifiers[file.Path()] = &jsxRuntimeImportSpecifier{moduleReference: old.moduleReference, specifier: specifier}
}
