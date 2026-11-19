package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/binder"
)

// hasComponentReceiver authenticates a receiver against the core Component
// declaration before normalization changes its body. The TypeScript binder owns
// lexical shadowing, including type parameters. Imports, local type aliases and interface heritage
// retain identity, while structural compatibility supplies no such authority.
func hasComponentReceiver(node *ast.Node, sourceFile *ast.SourceFile) bool {
	annotation := componentReceiverAnnotation(node)
	if annotation == nil {
		return false
	}
	binder.BindSourceFile(sourceFile)
	return componentReceiverType(annotation, make(map[*ast.Symbol]bool))
}

func componentReceiverAnnotation(node *ast.Node) *ast.Node {
	for _, parameter := range node.Parameters() {
		if name := parameter.Name(); name != nil && ast.IsIdentifier(name) && name.Text() == "this" {
			return parameter.Type()
		}
	}
	return nil
}

func componentReceiverType(node *ast.Node, seen map[*ast.Symbol]bool) bool {
	if ast.IsParenthesizedTypeNode(node) {
		return componentReceiverType(node.Type(), seen)
	}
	if !ast.IsTypeReferenceNode(node) {
		return false
	}
	return componentReceiverName(node.AsTypeReferenceNode().TypeName, seen)
}

// componentReceiverName follows declaration edges only. Each symbol is visited
// once, so cyclic aliases or interface bases cannot recurse indefinitely.
func componentReceiverName(name *ast.Node, seen map[*ast.Symbol]bool) bool {
	if ast.IsQualifiedName(name) {
		qualified := name.AsQualifiedName()
		if !ast.IsIdentifier(qualified.Left) || qualified.Right.Text() != "Component" {
			return false
		}
		symbol := componentReceiverTypeSymbol(qualified.Left)
		if symbol == nil {
			return false
		}
		for _, declaration := range symbol.Declarations {
			if ast.IsNamespaceImport(declaration) && componentReceiverCoreImport(declaration) {
				return true
			}
		}
		return false
	}
	if !ast.IsIdentifier(name) {
		return false
	}
	symbol := componentReceiverTypeSymbol(name)
	if symbol == nil || seen[symbol] {
		return false
	}
	seen[symbol] = true
	for _, declaration := range symbol.Declarations {
		if ast.IsImportSpecifier(declaration) {
			imported := declaration.AsImportSpecifier().PropertyName
			if imported == nil {
				imported = declaration.Name()
			}
			if imported.Text() == "Component" && componentReceiverCoreImport(declaration) {
				return true
			}
		} else if ast.IsTypeAliasDeclaration(declaration) && componentReceiverType(declaration.Type(), seen) {
			return true
		} else if ast.IsInterfaceDeclaration(declaration) {
			heritage := declaration.AsInterfaceDeclaration().HeritageClauses
			if heritage == nil {
				continue
			}
			for _, clause := range heritage.Nodes {
				if clause.AsHeritageClause().Token != ast.KindExtendsKeyword {
					continue
				}
				for _, base := range clause.AsHeritageClause().Types.Nodes {
					if componentReceiverType(base, seen) {
						return true
					}
				}
			}
		}
	}
	return false
}

// componentReceiverTypeSymbol uses binder scopes rather than reconstructing a
// type namespace from identifiers or giving value-only shadows type authority.
func componentReceiverTypeSymbol(name *ast.Node) *ast.Symbol {
	return componentLexicalSymbol(name, ast.SymbolFlagsType|ast.SymbolFlagsNamespace|ast.SymbolFlagsAlias)
}

// componentLexicalSymbol looks up the nearest binder-owned declaration in the
// requested namespace before normalization builds a checker program.
func componentLexicalSymbol(name *ast.Node, meaning ast.SymbolFlags) *ast.Symbol {
	for scope := name.Parent; scope != nil; scope = scope.Parent {
		symbol := scope.Locals()[name.Text()]
		if symbol != nil && symbol.Flags&meaning != 0 {
			return symbol
		}
	}
	return nil
}
func componentReceiverCoreImport(declaration *ast.Node) bool {
	imported := enclosingImportDeclaration(declaration)
	return imported != nil && ast.IsStringLiteral(imported.AsImportDeclaration().ModuleSpecifier) && imported.AsImportDeclaration().ModuleSpecifier.Text() == "@exactjs/core"
}
