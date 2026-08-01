package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type externalImportReference struct {
	moduleSpecifier string
	exportName      string
	namespace       bool
}

type externalImportBindings struct {
	bySymbol map[ast.SymbolId]externalImportReference
	byName   map[string]externalImportReference
}

func collectExternalImportBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) externalImportBindings {
	result := externalImportBindings{
		bySymbol: make(map[ast.SymbolId]externalImportReference),
		byName:   make(map[string]externalImportReference),
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration.ImportClause == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) {
			continue
		}
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		clause := declaration.ImportClause.AsImportClause()
		if clause.PhaseModifier == ast.KindTypeKeyword {
			continue
		}
		if name := clause.Name(); name != nil {
			bindExternalImportSymbol(
				result,
				name,
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					exportName:      "default",
				},
				typeChecker,
			)
		}
		bindings := clause.NamedBindings
		if bindings == nil {
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			bindExternalImportSymbol(
				result,
				bindings.AsNamespaceImport().Name(),
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					namespace:       true,
				},
				typeChecker,
			)
			continue
		}
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			exportName := specifier.Name().Text()
			if specifier.PropertyName != nil {
				exportName = specifier.PropertyName.Text()
			}
			bindExternalImportSymbol(
				result,
				specifier.Name(),
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					exportName:      exportName,
				},
				typeChecker,
			)
		}
	}
	return result
}

func bindExternalImportSymbol(
	bindings externalImportBindings,
	name *ast.Node,
	reference externalImportReference,
	typeChecker *checker.Checker,
) {
	bindings.byName[name.Text()] = reference
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return
	}
	bindings.bySymbol[ast.GetSymbolId(symbol)] = reference
	if target := resolvedCallableSymbol(symbol, typeChecker); target != nil {
		bindings.bySymbol[ast.GetSymbolId(target)] = reference
	}
}

func externalImportForExpression(
	expression *ast.Node,
	bindings externalImportBindings,
	typeChecker *checker.Checker,
) (externalImportReference, bool) {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return externalImportForExpression(member.Expression, bindings, typeChecker)
		}
		if ast.IsIdentifier(member.Expression) {
			bindingSymbol := typeChecker.GetSymbolAtLocation(member.Expression)
			symbol := typeChecker.GetResolvedSymbol(member.Expression)
			if symbol != nil {
				reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]
				if exists && reference.namespace {
					reference.exportName = member.Name().Text()
					reference.namespace = false
					return reference, true
				}
				if !exists &&
					(symbolDeclaredByImport(symbol) ||
						symbolDeclaredByImport(bindingSymbol) ||
						symbolDeclaredOutsideSource(symbol, member.Expression)) {
					reference, exists = bindings.byName[member.Expression.Text()]
					if exists && reference.namespace {
						reference.exportName = member.Name().Text()
						reference.namespace = false
						return reference, true
					}
				}
			}
			if reference, exists := bindings.byName[member.Expression.Text()]; exists &&
				reference.namespace {
				reference.exportName = member.Name().Text()
				reference.namespace = false
				return reference, true
			}
		}
	}
	if !ast.IsIdentifier(expression) {
		// Direct imported callables are identifiers. Property accesses are
		// relevant only for namespace imports, handled above; asking the
		// checker to resolve an arbitrary receiver can contextually check an
		// unrelated callback/object graph.
		return externalImportReference{}, false
	}
	symbol := typeChecker.GetResolvedSymbol(expression)
	bindingSymbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		reference, exists := bindings.byName[expression.Text()]
		return reference, exists && !reference.namespace
	}
	reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]
	if !exists {
		target := resolvedCallableSymbol(symbol, typeChecker)
		if target != nil {
			reference, exists = bindings.bySymbol[ast.GetSymbolId(target)]
		}
	}
	if !exists &&
		(symbolDeclaredByImport(symbol) ||
			symbolDeclaredByImport(bindingSymbol) ||
			symbolDeclaredOutsideSource(symbol, expression)) {
		reference, exists = bindings.byName[expression.Text()]
	}
	if !exists {
		reference, exists = bindings.byName[expression.Text()]
	}
	return reference, exists && !reference.namespace
}

func symbolDeclaredOutsideSource(symbol *ast.Symbol, location *ast.Node) bool {
	if symbol == nil || location == nil {
		return false
	}
	current := ast.GetSourceFileOfNode(location)
	if current == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source != nil && source != current {
			return true
		}
	}
	return false
}

func symbolDeclaredByImport(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if enclosingImportDeclaration(declaration) != nil {
			return true
		}
	}
	return false
}
