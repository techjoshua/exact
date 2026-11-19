package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// standardLibraryCallOwner identifies the selected built-in method declaration.
// Custom overrides and similarly named application types retain their own effects.
func standardLibraryCallOwner(call *ast.CallExpression, typeChecker *checker.Checker) string {
	signature := typeChecker.GetResolvedSignature(call.AsNode())
	if signature == nil || signature.Declaration() == nil {
		return ""
	}
	declaration := signature.Declaration()
	source := ast.GetSourceFileOfNode(declaration)
	if !standardLibrarySource(source) {
		return ""
	}
	filename := filepath.Base(source.FileName())
	if (!strings.HasPrefix(filename, "lib.es") && filename != "lib.scripthost.d.ts") || !strings.HasSuffix(filename, ".d.ts") {
		return ""
	}
	parent := declaration.Parent
	if parent == nil || !ast.IsInterfaceDeclaration(parent) || parent.Name() == nil {
		return ""
	}
	return parent.Name().Text()
}

// directDenseArrayIncludes identifies the inherited method of an immediately
// constructed dense array. Its normal operand evaluation remains authored.
func directDenseArrayIncludes(member *ast.Node, c *checker.Checker, argumentCount int) bool {
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Parent == nil || !ast.IsCallExpression(member.Parent) {
		return false
	}
	property := member.AsPropertyAccessExpression()
	call := member.Parent.AsCallExpression()
	if call.Expression != member || property.Name().Text() != "includes" || !ast.IsArrayLiteralExpression(property.Expression) || call.Arguments == nil || len(call.Arguments.Nodes) != argumentCount {
		return false
	}
	for _, argument := range call.Arguments.Nodes {
		if ast.IsSpreadElement(argument) {
			return false
		}
	}
	return denseArrayElements(property.Expression.AsArrayLiteralExpression().Elements.Nodes) && standardLibraryCallOwner(call, c) == "Array"
}

// denseArrayElements identifies a literal whose own slots are all explicit indexed values.
func denseArrayElements(elements []*ast.Node) bool {
	for _, element := range elements {
		if ast.IsSpreadElement(element) || element.Kind == ast.KindOmittedExpression {
			return false
		}
	}
	return true
}

// standardLibraryValue excludes imported or local functions that happen to use
// a built-in name. Placement and reevaluation remain separate decisions.
func standardLibraryValue(node *ast.Node, typeChecker *checker.Checker) bool {
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return false
	}
	valueDeclaration := false
	for _, declaration := range symbol.Declarations {
		// Ambient interface augmentation extends instance types without replacing
		// the global runtime value (for example Node's Array compatibility types).
		if ast.IsInterfaceDeclaration(declaration) {
			continue
		}
		valueDeclaration = true
		source := ast.GetSourceFileOfNode(declaration)
		if !standardLibrarySource(source) {
			return false
		}
		filename := filepath.Base(source.FileName())
		if (!strings.HasPrefix(filename, "lib.es") && filename != "lib.scripthost.d.ts") || !strings.HasSuffix(filename, ".d.ts") {
			return false
		}
	}
	return valueDeclaration
}

// freshCollectionIterator recognizes a newly created native iterator. Consuming an existing
// iterator can advance shared state, so its type alone cannot authorize reevaluation.
func freshCollectionIterator(node *ast.Node, typeChecker *checker.Checker) bool {
	node = unwrapRenderExpression(node)
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if len(callArguments(node)) != 0 {
		return false
	}
	_, name := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression), typeChecker)
	if name != "values" && name != "keys" && name != "entries" {
		return false
	}
	switch standardLibraryCallOwner(call, typeChecker) {
	case "Map", "ReadonlyMap", "Set", "ReadonlySet":
		return true
	}
	return false
}

// primitiveBooleanReceiver excludes boxed objects and custom conversion hooks even
// when the selected inherited signature has the standard Object declaration.
func primitiveBooleanReceiver(node *ast.Node, typeChecker *checker.Checker) bool {
	value := typeChecker.GetTypeAtLocation(node)
	for _, member := range value.Distributed() {
		if member.Flags()&checker.TypeFlagsBooleanLike == 0 {
			return false
		}
	}
	return true
}
