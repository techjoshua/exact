package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// resolvedCoreImportReference proves core imports through lexical aliases and reexports.
// Source spelling and a function's contextual type never supply framework identity.
func resolvedCoreImportReference(expression *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) (externalImportReference, bool) {
	if typeChecker == nil {
		return externalImportReference{}, false
	}
	return coreImportExpression(expression, source, typeChecker, make(map[ast.SymbolId]bool))
}

func coreImportExpression(expression *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (externalImportReference, bool) {
	if expression == nil || ast.NodeIsSynthesized(expression) || expression.Parent == nil {
		return externalImportReference{}, false
	}
	switch {
	case ast.IsParenthesizedExpression(expression):
		return coreImportExpression(expression.AsParenthesizedExpression().Expression, source, typeChecker, seen)
	case ast.IsAsExpression(expression):
		return coreImportExpression(expression.AsAsExpression().Expression, source, typeChecker, seen)
	case ast.IsSatisfiesExpression(expression):
		return coreImportExpression(expression.AsSatisfiesExpression().Expression, source, typeChecker, seen)
	case ast.IsNonNullExpression(expression):
		return coreImportExpression(expression.AsNonNullExpression().Expression, source, typeChecker, seen)
	}
	var receiver *ast.Node
	var member string
	if ast.IsPropertyAccessExpression(expression) {
		access := expression.AsPropertyAccessExpression()
		receiver, member = access.Expression, access.Name().Text()
	} else if ast.IsElementAccessExpression(expression) {
		access := expression.AsElementAccessExpression()
		if access.ArgumentExpression != nil && (ast.IsStringLiteral(access.ArgumentExpression) || ast.IsNoSubstitutionTemplateLiteral(access.ArgumentExpression)) {
			receiver, member = access.Expression, access.ArgumentExpression.Text()
		}
	}
	if receiver != nil {
		if reference, valid := coreImportExpression(receiver, source, typeChecker, seen); valid && reference.namespace {
			if reference.moduleSpecifier != "@exactjs/core" && reference.moduleSpecifier != "@exactjs/core/document" {
				// Only module namespaces need a member lookup. Checking arbitrary receivers
				// can recursively contextually type unrelated callbacks and object graphs.
				return coreImportSymbol(typeChecker.GetSymbolAtLocation(expression), source, typeChecker, seen)
			}
			reference.namespace, reference.exportName = false, member
			return reference, true
		}
		return externalImportReference{}, false
	}
	if !ast.IsIdentifier(expression) {
		return externalImportReference{}, false
	}
	return coreImportSymbol(typeChecker.GetSymbolAtLocation(expression), source, typeChecker, seen)
}

func coreImportSymbol(symbol *ast.Symbol, source *ast.SourceFile, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (externalImportReference, bool) {
	if symbol == nil {
		return externalImportReference{}, false
	}
	id := ast.GetSymbolId(symbol)
	if seen[id] {
		return externalImportReference{}, false
	}
	seen[id] = true
	for _, declaration := range symbol.Declarations {
		var module *ast.Node
		var name string
		namespace := false
		switch {
		case ast.IsImportSpecifier(declaration):
			specifier := declaration.AsImportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			name = specifier.Name().Text()
			if specifier.PropertyName != nil {
				name = specifier.PropertyName.Text()
			}
		case ast.IsNamespaceImport(declaration):
			namespace = true
		case ast.IsExportSpecifier(declaration):
			specifier := declaration.AsExportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			name = specifier.Name().Text()
			if specifier.PropertyName != nil {
				name = specifier.PropertyName.Text()
			}
			for parent := declaration.Parent; parent != nil; parent = parent.Parent {
				if ast.IsExportDeclaration(parent) {
					module = parent.AsExportDeclaration().ModuleSpecifier
					break
				}
			}
		case ast.IsVariableDeclaration(declaration):
			if declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			owner := ast.GetSourceFileOfNode(declaration)
			if owner == nil || componentValueSymbolIsWrittenAfter(symbol, declaration.End(), owner, typeChecker) {
				continue
			}
			if reference, valid := coreImportExpression(declaration.AsVariableDeclaration().Initializer, owner, typeChecker, seen); valid {
				return reference, true
			}
			continue
		default:
			continue
		}
		if imported := enclosingImportDeclaration(declaration); imported != nil {
			module = imported.AsImportDeclaration().ModuleSpecifier
		}
		if module != nil && ast.IsStringLiteral(module) && (namespace || module.Text() == "@exactjs/core" || module.Text() == "@exactjs/core/document") {
			return externalImportReference{moduleSpecifier: module.Text(), exportName: name, namespace: namespace}, true
		}
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return coreImportSymbol(typeChecker.GetImmediateAliasedSymbol(symbol), source, typeChecker, seen)
	}
	return externalImportReference{}, false
}

// componentRegistryFactoryCall shares the same identity rule across analysis and lowering.
func componentRegistryFactoryCall(expression *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	reference, valid := resolvedCoreImportReference(expression, source, typeChecker)
	return valid && !reference.namespace && reference.moduleSpecifier == "@exactjs/core" && reference.exportName == "createComponentRegistry"
}
