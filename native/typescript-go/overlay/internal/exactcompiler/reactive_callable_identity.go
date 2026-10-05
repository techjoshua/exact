package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Only the imported root snapshot operation freezes the whole initializer. Nested peek calls
// remain native untracked reads within a computation whose other reads can still be live.
func reactiveSnapshotInitializer(node *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	node = unwrapSourceCallableReference(node)
	return node != nil && ast.IsCallExpression(node) && reactivePeekOperation(node.AsCallExpression().Expression, source, typeChecker)
}

func reactivePeekOperation(expression *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	reference, valid := resolvedCoreImportReference(expression, source, typeChecker)
	return valid && !reference.namespace && reference.moduleSpecifier == "@exactjs/core" && reference.exportName == "peek"
}

// Source bodies describe a selected member only while the receiver stays locally owned and
// that member is not replaced. Escaped receivers need an explicit pure-call contract.
func reactiveCallableMemberStable(symbol *ast.Symbol, typeChecker *checker.Checker) bool {
	if len(symbol.Declarations) != 1 {
		for _, declaration := range symbol.Declarations {
			if ast.IsMethodDeclaration(declaration) || ast.IsPropertyAssignment(declaration) || ast.IsShorthandPropertyAssignment(declaration) {
				return false
			}
		}
		return true
	}
	declaration := symbol.Declarations[0]
	if !ast.IsMethodDeclaration(declaration) && !ast.IsPropertyAssignment(declaration) && !ast.IsShorthandPropertyAssignment(declaration) {
		return true
	}
	object := declaration.Parent
	if object == nil || !ast.IsObjectLiteralExpression(object) || object.Parent == nil || !ast.IsVariableDeclaration(object.Parent) {
		return false
	}
	owner := object.Parent
	if owner.Parent == nil || owner.Parent.Flags&ast.NodeFlagsConst == 0 || !ast.IsIdentifier(owner.Name()) {
		return false
	}
	receiver := typeChecker.GetSymbolAtLocation(owner.Name())
	source := ast.GetSourceFileOfNode(owner)
	if receiver == nil || source == nil {
		return false
	}
	valid := true
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !valid || ast.IsTypeNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		actual := typeChecker.GetSymbolAtLocation(node)
		if actual == nil || ast.GetSymbolId(actual) != ast.GetSymbolId(receiver) {
			return true
		}
		parent := node.Parent
		if parent == nil || (!ast.IsPropertyAccessExpression(parent) && !ast.IsElementAccessExpression(parent)) {
			valid = false
			return false
		}
		selected := sourceCallableReferenceSymbol(parent, typeChecker)
		if selected == nil {
			valid = false
			return false
		}
		if ast.GetSymbolId(selected) == ast.GetSymbolId(symbol) && (identifierIsWriteTarget(node) || nativeAssignmentPatternTarget(parent)) {
			valid = false
			return false
		}
		return true
	})
	return valid
}

// Read captured inputs from a local callable without executing or reconstructing it.
func localCallableBody(symbol *ast.Symbol, typeChecker *checker.Checker) *ast.Node {
	return reactiveCallableBody(symbol, typeChecker, make(map[ast.SymbolId]bool))
}

func reactiveCallableBody(symbol *ast.Symbol, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) *ast.Node {
	symbol = sourceCallableSymbol(symbol, typeChecker)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return nil
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		switch {
		case ast.IsFunctionDeclaration(declaration), ast.IsMethodDeclaration(declaration):
			if declaration.Body() != nil {
				return declaration.Body()
			}
		case ast.IsVariableDeclaration(declaration), ast.IsPropertyAssignment(declaration):
			initializer := unwrapSourceCallableReference(declaration.Initializer())
			if initializer == nil {
				continue
			}
			if ast.IsArrowFunction(initializer) || ast.IsFunctionExpression(initializer) {
				return initializer.Body()
			}
			return reactiveCallableBody(sourceCallableReferenceSymbol(initializer, typeChecker), typeChecker, seen)
		case ast.IsShorthandPropertyAssignment(declaration):
			return reactiveCallableBody(typeChecker.GetShorthandAssignmentValueSymbol(declaration), typeChecker, seen)
		}
	}
	return nil
}
