package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Event construction reads these Web IDL dictionary fields in key order.
var eventInitFields = [...]string{"bubbles", "cancelable", "composed"}

// eventConstructor classifies default EventTarget and primitive-name Event construction.
// EventInit field Gets remain required by the constructor effect consumer.
func eventConstructor(node *ast.Node, c *checker.Checker) string {
	if node == nil || !ast.IsNewExpression(node) {
		return ""
	}
	constructor := node.AsNewExpression()
	name := unwrapSourceCallableReference(constructor.Expression)
	if !ast.IsIdentifier(name) {
		return ""
	}
	switch name.Text() {
	case "EventTarget":
		if constructor.Arguments != nil && len(constructor.Arguments.Nodes) != 0 {
			return ""
		}
	case "Event":
		if constructor.Arguments == nil || len(constructor.Arguments.Nodes) < 1 || len(constructor.Arguments.Nodes) > 2 || !checkedPrimitiveOperand(constructor.Arguments.Nodes[0], c) {
			return ""
		}
	default:
		return ""
	}
	symbol := c.GetSymbolAtLocation(name)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return ""
	}
	return name.Text()
}

// freshEventMember accounts for the Get or Call on an unexposed standard event
// object. A fresh EventTarget has no listeners to invoke during dispatch.
func freshEventMember(node *ast.Node, owner *executableBodyOwner) bool {
	member := node
	var args *ast.NodeList
	if ast.IsCallExpression(node) {
		member = node.Expression()
		args = node.AsCallExpression().Arguments
	}
	if !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) {
		return false
	}
	alloc := singleUseLiteral(member.Expression(), owner.values, ast.KindNewExpression)
	if alloc == nil {
		return false
	}
	kind := eventConstructor(alloc, owner.checker)
	if kind == "" {
		return false
	}
	_, name := restrictedInvocationMember(member, owner.checker)
	if name == "" {
		return false
	}
	symbol := nativeReceiverMemberSymbol(member, owner.checker)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, decl := range symbol.Declarations {
		if decl.Parent == nil || !ast.IsInterfaceDeclaration(decl.Parent) || decl.Parent.Name().Text() != kind || !standardLibrarySource(ast.GetSourceFileOfNode(decl)) {
			return false
		}
	}
	if node == member {
		read, write := accessorEvaluationMode(member)
		return read && !write
	}
	if kind == "EventTarget" {
		return name == "dispatchEvent" && args != nil && len(args.Nodes) == 1 && !ast.IsSpreadElement(args.Nodes[0])
	}
	return args == nil || len(args.Nodes) == 0
}

// eventDispatchCallbacks follows the existing use index for a local EventTarget.
// Only a reached matching registration in the dispatch statement's block can
// donate its callback. Definitions and listener registration remain deferred.
func eventDispatchCallbacks(call *ast.Node, owner *executableBodyOwner) []*ast.Node {
	if !ast.IsCallExpression(call) {
		return nil
	}
	member := call.Expression()
	if !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "dispatchEvent" {
		return nil
	}
	if callbacks, ok := owner.eventCallbacks[call]; ok {
		return callbacks
	}
	args := callArguments(call)
	receiver := member.Expression()
	if len(args) != 1 || !ast.IsIdentifier(receiver) {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || symbol.ValueDeclaration.Parent.Flags&ast.NodeFlagsConst == 0 || eventConstructor(symbol.ValueDeclaration.Initializer(), owner.checker) != "EventTarget" {
		return nil
	}
	index := owner.values.index(ast.GetSourceFileOfNode(call))
	uses := index.privateUses
	if index.incomplete || uses == nil || !uses.complete {
		return nil
	}
	if owner.eventCallbacks == nil {
		owner.eventCallbacks = make(map[*ast.Node][]*ast.Node)
	}
	owner.eventCallbacks[call] = nil
	type listener struct {
		value    *ast.Node
		identity *ast.Symbol
		capture  ast.Kind
	}
	type registration struct {
		block *ast.Node
		name  string
	}
	active := make(map[registration][]listener)
	// The source index visits the receiver's operations in lexical order.
	// Record the reachable callback references once per dispatch site.
	for _, use := range uses.uses[ast.GetSymbolId(symbol)] {
		ref := use.node
		method := ref.Parent
		if method == nil || !ast.IsPropertyAccessExpression(method) || method.Expression() != ref {
			continue
		}
		op := method.Parent
		if op == nil || !ast.IsCallExpression(op) || op.Expression() != method {
			continue
		}
		statement := sourceEvaluationStatement(op)
		if statement == nil {
			continue
		}
		actuals := callArguments(op)
		if method.Name().Text() == "dispatchEvent" && len(actuals) == 1 {
			event, fields := immutableEffectArgumentRoot(actuals[0], owner.checker, map[ast.SymbolId]bool{})
			if len(fields) != 0 || eventConstructor(event, owner.checker) != "Event" {
				continue
			}
			name := unwrapSourceCallableReference(event.AsNewExpression().Arguments.Nodes[0])
			if !ast.IsStringLiteralLike(name) {
				continue
			}
			var callbacks []*ast.Node
			for _, l := range active[registration{statement.Parent, name.Text()}] {
				callbacks = append(callbacks, eagerCallbackReferences(l.value, owner.checker)...)
			}
			owner.eventCallbacks[op] = callbacks
			continue
		}
		if statement.Expression() != op || len(actuals) < 2 || !ast.IsStringLiteralLike(actuals[0]) {
			continue
		}
		slot := registration{statement.Parent, actuals[0].Text()}
		capture := ast.KindFalseKeyword
		if len(actuals) > 2 {
			capture = unwrapSourceCallableReference(actuals[2]).Kind
		}
		callback := unwrapSourceCallableReference(actuals[1])
		var identity *ast.Symbol
		if ast.IsIdentifier(callback) {
			identity = owner.checker.GetSymbolAtLocation(callback)
		}
		switch method.Name().Text() {
		case "addEventListener":
			active[slot] = append(active[slot], listener{callback, identity, capture})
		case "removeEventListener":
			if identity != nil && !owner.values.bindingWritten(identity) && (capture == ast.KindTrueKeyword || capture == ast.KindFalseKeyword) {
				active[slot] = slices.DeleteFunc(active[slot], func(l listener) bool { return l.identity == identity && l.capture == capture })
			}
		}
	}
	return owner.eventCallbacks[call]
}
