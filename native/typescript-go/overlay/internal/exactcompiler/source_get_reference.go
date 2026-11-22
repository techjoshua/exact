package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceGetReference associates the original source Get with its evaluated
// receiver. It carries no acquired value, normal operation or permission. The
// accessor traversal consumes it at that Get and never lends it to child Gets.
type sourceGetReference struct {
	operation, receiver *ast.Node
	key                 sourceKeySelection
}

// sourceGetReferenceFor is called only by the original source member owner.
// Exact receiver/key/mode matching prevents a projected or stale outer Member
// from qualifying a different lookup. Defined receiver presence is independent
// of whether analysis can represent its value.
func sourceGetReferenceFor(operation, receiver *ast.Node, path []string, name string, mode accessorTraversal) *sourceGetReference {
	if operation == nil || len(path) != 0 || (mode != accessorRead && mode != accessorRead|accessorSet) {
		return nil
	}
	if !ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation) {
		return nil
	}
	actualReceiver, actualName := accessorReceiver(operation)
	read, write := accessorEvaluationMode(operation)
	if !read || receiver != actualReceiver || name != actualName || write != (mode&accessorSet != 0) {
		return nil
	}
	// super references use an independently supplied this as their receiver.
	if actualReceiver == nil || actualReceiver.Kind == ast.KindSuperKeyword {
		return nil
	}
	key := sourceKeySelection{name: actualName, resolved: true}
	if ast.IsElementAccessExpression(operation) {
		key = sourceMemberKey(operation.AsElementAccessExpression().ArgumentExpression)
	}
	return &sourceGetReference{operation: operation, receiver: receiver, key: key}
}

// selectConstGetKey carries an authored const initializer to this original Get.
// A checked literal type alone does not identify the runtime key producer.
func (reference *sourceGetReference) selectConstGetKey(c *checker.Checker, allowCaptured bool) bool {
	if reference.key.resolved || !ast.IsElementAccessExpression(reference.operation) {
		return false
	}
	operand := unwrapSourceCallableReference(reference.operation.AsElementAccessExpression().ArgumentExpression)
	if operand == nil || !ast.IsIdentifier(operand) {
		return false
	}
	symbol := c.GetSymbolAtLocation(operand)
	if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	declaration := symbol.ValueDeclaration
	if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(operand) || declaration.End() > operand.Pos() {
		return false
	}
	if !allowCaptured && enclosingCallableNode(declaration) != enclosingCallableNode(reference.operation) {
		return false
	}
	// A captured const selects the same literal after initialization. If the
	// closure runs earlier, reading the key throws before the Get.
	key := unwrapSourceCallableReference(declaration.Initializer())
	if key == nil || !ast.IsStringLiteral(key) {
		return false
	}
	// The invoked callback graph still uses the checked member identity.
	// Keep selection opaque when an assertion makes that identity disagree.
	receiver, checkedName := restrictedInvocationMember(reference.operation, c)
	if receiver == nil || checkedName != key.Text() {
		return false
	}
	reference.key = sourceKeySelection{name: checkedName, resolved: true}
	return true
}

// matches consumes only the final property of this original Get. An earlier
// projected Get or a nested lookup cannot borrow its receiver definedness.
func (reference *sourceGetReference) matches(path []string, name string) bool {
	if reference.operation == nil || !ast.IsPropertyAccessExpression(reference.operation) && !ast.IsElementAccessExpression(reference.operation) {
		return false
	}
	key := reference.key.name
	if len(path) == 0 {
		return name == key
	}
	return len(path) == 1 && name == "" && path[0] == key
}

// after discards the relation when traversal crosses its actual Get into an
// output. Resolving an earlier receiver projection does not consume this Get.
func (reference *sourceGetReference) after(path []string, name string) *sourceGetReference {
	if reference != nil && reference.matches(path, name) {
		return nil
	}
	return reference
}
