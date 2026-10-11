package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type externalImportReference struct {
	moduleSpecifier string
	exportName      string
	namespace       bool
}

type externalImportBindings struct {
	byName       map[string]externalImportReference
	bySymbol     map[ast.SymbolId]externalImportReference
	byNode       map[*ast.Node]externalImportReference
	checker      *checker.Checker
	originalNode func(*ast.Node) *ast.Node
}

// exactCoreStructuralReference identifies compiler-owned structural syntax values. They are imported
// runtime symbols, but JSX lowering consumes them as native target operations rather than as
// foreign component dependencies.
func exactCoreStructuralReference(moduleSpecifier string, exportName string) bool {
	if moduleSpecifier == "@exactjs/core/document" && exportName == "Document" {
		return true
	}
	if moduleSpecifier != "@exactjs/core" {
		return false
	}
	switch exportName {
	case "Activity", "Cell", "Dynamic", "Fragment", "Portal", "RenderProgram", "ServerBoundary", "ServerSlot", "Suspense", "Target", "Text", "UnsafeHtml":
		return true
	default:
		return false
	}
}

func collectExternalImportBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) externalImportBindings {
	result := externalImportBindings{
		byName:   make(map[string]externalImportReference),
		bySymbol: make(map[ast.SymbolId]externalImportReference),
		checker:  typeChecker,
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
	if typeChecker != nil {
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			bindings.bySymbol[ast.GetSymbolId(symbol)] = reference
		}
	}
}

func externalImportForExpression(
	expression *ast.Node,
	bindings externalImportBindings,
	typeChecker *checker.Checker,
) (externalImportReference, bool) {
	if bindings.originalNode != nil {
		expression = bindings.originalNode(expression)
	}
	if expression == nil {
		return externalImportReference{}, false
	}
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return externalImportForExpression(member.Expression, bindings, typeChecker)
		}
		if ast.IsIdentifier(member.Expression) {
			if reference, exists := externalImportIdentifier(member.Expression, bindings, typeChecker); exists &&
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
	if reference, exists := externalImportIdentifier(expression, bindings, typeChecker); exists && !reference.namespace {
		return reference, true
	}
	return externalImportReference{}, false
}

// externalImportIdentifier preserves binder identity across local names which
// shadow imports. Name-only lookup is reserved for callers without a checker.
func externalImportIdentifier(expression *ast.Node, bindings externalImportBindings, typeChecker *checker.Checker) (externalImportReference, bool) {
	if bindings.originalNode != nil {
		expression = bindings.originalNode(expression)
	}
	if _, exists := bindings.byName[expression.Text()]; !exists {
		return externalImportReference{}, false
	}
	if bindings.byNode != nil {
		reference, exists := bindings.byNode[expression]
		return reference, exists
	}
	if typeChecker != nil {
		symbol := typeChecker.GetSymbolAtLocation(expression)
		if symbol == nil {
			return externalImportReference{}, false
		}
		reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]
		return reference, exists
	}
	reference, exists := bindings.byName[expression.Text()]
	return reference, exists
}

// captureImportReferences freezes authored binder proofs before lowering
// reparents retained identifiers into generated declarations and module scopes.
func (bindings *externalImportBindings) captureImportReferences(sourceFile *ast.SourceFile, typeChecker *checker.Checker) {
	bindings.byNode = make(map[*ast.Node]externalImportReference)
	if len(bindings.byName) == 0 {
		return
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) {
			return true
		}
		if _, relevant := bindings.byName[node.Text()]; !relevant {
			return true
		}
		if symbol := typeChecker.GetSymbolAtLocation(node); symbol != nil {
			if reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]; exists {
				bindings.byNode[node] = reference
			}
		}
		return true
	})
}

// nativeModuleLoaderExpression accepts native import and an unresolved or
// ambient CommonJS loader. Authored local callbacks named require stay ordinary.
func nativeModuleLoaderExpression(expression *ast.Node, typeChecker *checker.Checker) bool {
	if !moduleCallExpression(expression) {
		return false
	}
	if expression.Kind == ast.KindImportKeyword {
		return true
	}
	// Replacement imports construct their own loader identifiers after binding.
	// Only authored identifiers need checker proof of their lexical owner.
	if !ast.IsParseTreeNode(expression) {
		return true
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if declaration.Flags&ast.NodeFlagsAmbient == 0 {
			return false
		}
	}
	return true
}
