package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// localByteStorageOperation recognizes scalar method calls on a component-local
// native allocation. Its original arguments are still visited. Escaping the
// receiver or replacing a method leaves member selection with the source query.
func localByteStorageOperation(node *ast.Node, owner *sourceValueOwner) bool {
	member := node
	if ast.IsCallExpression(node) {
		member = node.Expression()
	}
	if !ast.IsPropertyAccessExpression(member) || byteStorageNumericArguments(member.Name().Text()) == 0 || !ast.IsIdentifier(member.Expression()) || member.Parent == nil || !ast.IsCallExpression(member.Parent) || member.Parent.Expression() != member {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(member.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	decl := symbol.ValueDeclaration
	if valid, known := owner.byteStorageOperations[decl]; known {
		return valid
	}
	value := unwrapSourceCallableReference(decl.Initializer())
	if value == nil || !ast.IsNewExpression(value) || decl.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(decl) == nil {
		return false
	}
	name := unwrapSourceCallableReference(value.Expression())
	if !ast.IsIdentifier(name) || !standardByteStorageName(name.Text()) {
		return false
	}
	constructor := owner.checker.GetSymbolAtLocation(name)
	if constructor == nil || constructor.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(constructor.ValueDeclaration)) {
		return false
	}
	index := owner.index(ast.GetSourceFileOfNode(decl))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		return false
	}
	valid := true
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !scalarByteStorageUse(use.node, owner) {
			valid = false
			break
		}
	}
	if owner.byteStorageOperations == nil {
		owner.byteStorageOperations = make(map[*ast.Node]bool)
	}
	owner.byteStorageOperations[decl] = valid
	return valid
}

// Each allowed use keeps the receiver private. fill returns its receiver, so
// only its discarded result qualifies. A slice or subarray returns a new view.
func scalarByteStorageUse(reference *ast.Node, owner *sourceValueOwner) bool {
	member := reference.Parent
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Expression() != reference || !nativeReceiverMemberDeclarations(member, owner.checker) {
		return false
	}
	call := member.Parent
	if call == nil || !ast.IsCallExpression(call) || call.Expression() != member {
		return false
	}
	if args := call.AsCallExpression().Arguments; args != nil {
		for _, arg := range args.Nodes {
			if ast.IsSpreadElement(arg) {
				return false
			}
		}
	}
	switch member.Name().Text() {
	case "fill":
		if call.Parent == nil || !ast.IsExpressionStatement(call.Parent) {
			return false
		}
	default:
		if byteStorageNumericArguments(member.Name().Text()) == 0 {
			return false
		}
	}
	return true
}

// The little-endian flag of a DataView operation uses ToBoolean, which never
// invokes a hook. Surplus arguments are evaluated without numeric conversion.
func byteStorageNumericArguments(method string) int {
	switch method {
	case "fill":
		return 3
	case "slice", "subarray":
		return 2
	}
	if len(method) > 3 && strings.HasPrefix(method, "get") {
		return 1
	}
	if len(method) > 3 && strings.HasPrefix(method, "set") {
		return 2
	}
	return 0
}

func hasByteStorageConversion(call *ast.Node, c *checker.Checker) bool {
	args := call.AsCallExpression().Arguments
	if args == nil {
		return false
	}
	count := byteStorageNumericArguments(call.Expression().Name().Text())
	for _, arg := range args.Nodes[:min(count, len(args.Nodes))] {
		if !checkedPrimitiveOperand(arg, c) {
			return true
		}
	}
	return false
}
