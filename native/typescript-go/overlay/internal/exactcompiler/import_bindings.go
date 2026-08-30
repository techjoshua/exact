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
	byName map[string]externalImportReference
}

// exactCoreStructuralReference identifies compiler-owned structural syntax values. They are imported
// runtime symbols, but JSX lowering consumes them as native target operations rather than as
// foreign component dependencies.
func exactCoreStructuralReference(moduleSpecifier string, exportName string) bool {
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
		byName: make(map[string]externalImportReference),
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
	if reference, exists := bindings.byName[expression.Text()]; exists && !reference.namespace {
		return reference, true
	}
	return externalImportReference{}, false
}
