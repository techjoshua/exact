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

// directEntriesMap identifies the standard inherited map on the immediate
// result of Object.entries. A successful entries call creates a fresh array.
// Its input enumeration and the map callback keep their original effect owners.
func (owner *sourceValueOwner) directEntriesMap(member *ast.Node) *ast.Node {
	c := owner.checker
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Parent == nil || !ast.IsCallExpression(member.Parent) {
		return nil
	}
	property := member.AsPropertyAccessExpression()
	call := member.Parent.AsCallExpression()
	entries := unwrapSourceCallableReference(property.Expression)
	if call.Expression != member || property.Name().Text() != "map" || !ast.IsCallExpression(entries) {
		return nil
	}
	input := owner.standardEntriesArgument(entries)
	if input == nil || standardLibraryCallOwner(call, c) != "Array" {
		return nil
	}
	input = unwrapSourceCallableReference(input)
	if ast.IsIdentifier(input) {
		symbol := c.GetSymbolAtLocation(input)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) ||
			symbol.ValueDeclaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			return nil
		}
		input = unwrapSourceCallableReference(symbol.ValueDeclaration.Initializer())
	}
	// Keep unknown inputs with the existing enumeration and result analysis.
	if input == nil || !ast.IsObjectLiteralExpression(input) {
		return nil
	}
	return c.GetResolvedSignature(member.Parent).Declaration()
}

// standardEntriesArgument recognizes the immediately called standard method.
// Authored selections and same-source replacements remain with normal analysis.
func (owner *sourceValueOwner) standardEntriesArgument(node *ast.Node) *ast.Node {
	if node == nil || !ast.IsCallExpression(node) || node.AsCallExpression().QuestionDotToken != nil {
		return nil
	}
	c := owner.checker
	callee := unwrapSourceCallableReference(node.Expression())
	base, name := restrictedInvocationMember(callee, c)
	if name != "entries" || base == nil || !ast.IsIdentifier(base) || base.Text() != "Object" || !ast.IsPropertyAccessExpression(callee) || ast.IsOptionalChain(callee) ||
		!standardLibraryCallRoot(callee, c) || standardLibraryCallOwner(node.AsCallExpression(), c) != "ObjectConstructor" {
		return nil
	}
	args := restrictedInvocationArguments(node.AsCallExpression())
	if len(args) != 1 || ast.IsSpreadElement(args[0]) {
		return nil
	}
	index := owner.index(ast.GetSourceFileOfNode(callee))
	if index.incomplete || index.objectEntriesWritten {
		return nil
	}
	return args[0]
}

// directEntriesMapReturnPair admits a fresh two-slot result when its immediate
// consumer is the standard fromEntries algorithm. The first slot is a known
// property key. The second slot is read as data without inspecting its contents.
// The callback body still owns all effects that compute those slots.
func (owner *sourceValueOwner) directEntriesMapReturnPair(node, callback *ast.Node) (*ast.Node, bool) {
	c := owner.checker
	if !ast.IsArrowFunction(callback) || ast.HasSyntacticModifier(callback, ast.ModifierFlagsAsync) {
		return nil, false
	}
	consumerInput := node
	for consumerInput.Parent != nil && unwrapSourceCallableReference(consumerInput.Parent) == node {
		consumerInput = consumerInput.Parent
	}
	consumer := consumerInput.Parent
	if consumer == nil || !ast.IsCallExpression(consumer) {
		return nil, false
	}
	args := callArguments(consumer)
	if len(args) != 1 || args[0] != consumerInput {
		return nil, false
	}
	callee := unwrapSourceCallableReference(consumer.Expression())
	root, name := restrictedInvocationMember(callee, c)
	if name != "fromEntries" || root == nil || !ast.IsIdentifier(root) || root.Text() != "Object" ||
		!standardLibraryCallRoot(callee, c) || standardLibraryCallOwner(consumer.AsCallExpression(), c) != "ObjectConstructor" {
		return nil, false
	}
	index := owner.index(ast.GetSourceFileOfNode(callee))
	if index.incomplete || index.objectFromEntriesWritten {
		return nil, false
	}
	pair := unwrapSourceCallableReference(callback.Body())
	if !ast.IsArrayLiteralExpression(pair) {
		return nil, false
	}
	slots := pair.AsArrayLiteralExpression().Elements.Nodes
	if len(slots) != 2 || !denseArrayElements(slots) {
		return nil, false
	}
	parameters := callback.Parameters()
	if len(parameters) > 1 {
		return nil, false
	}
	key := unwrapSourceCallableReference(slots[0])
	literalKey := ast.IsStringLiteral(key) || ast.IsNumericLiteral(key)
	if len(parameters) == 0 {
		return nil, literalKey
	}
	parameter := parameters[0].AsParameterDeclaration()
	if parameter.Initializer != nil || parameter.DotDotDotToken != nil {
		return nil, false
	}
	pattern := parameter.Name()
	if ast.IsIdentifier(pattern) {
		return nil, literalKey
	}
	if !ast.IsArrayBindingPattern(pattern) {
		return nil, false
	}
	elements := pattern.AsBindingPattern().Elements.Nodes
	if len(elements) < 1 || len(elements) > 2 {
		return nil, false
	}
	for _, node := range elements {
		if node.Kind == ast.KindOmittedExpression {
			continue
		}
		element := node.AsBindingElement()
		if element.DotDotDotToken != nil || element.Initializer != nil || !ast.IsIdentifier(element.Name()) {
			return nil, false
		}
	}
	if literalKey {
		return pattern, true
	}
	return pattern, ast.IsBindingElement(elements[0]) && ast.IsIdentifier(key) &&
		c.GetSymbolAtLocation(key) == c.GetSymbolAtLocation(elements[0].Name())
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
