package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskResourceLocalReferences follows local identity aliases without changing
// ordinary JavaScript. A shorthand property's value symbol is the resource,
// while its property symbol is unrelated. Scan to a fixed point so declaration
// order and multi-hop aliases cannot hide a generation escape.
func taskResourceLocalReferences(work, name *ast.Node, typeChecker *checker.Checker) ([]*ast.Node, bool) {
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return nil, false
	}
	symbols := map[ast.SymbolId]bool{ast.GetSymbolId(symbol): true}
	references := []*ast.Node{}
	seen := map[*ast.Node]bool{name: true}
	for {
		added := false
		walkNode(work, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || seen[node] {
				return true
			}
			reference := typeChecker.GetSymbolAtLocation(node)
			if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) && node.Parent.Name() == node {
				reference = typeChecker.GetShorthandAssignmentValueSymbol(node.Parent)
			}
			if reference == nil || !symbols[ast.GetSymbolId(reference)] {
				return true
			}
			seen[node] = true
			value := node
			if registration := taskContextResourceRegistration(work, node, typeChecker, "own"); registration != nil {
				value = registration
			}
			parent := value.Parent
			for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsNonNullExpression(parent) || ast.IsSatisfiesExpression(parent)) {
				parent = parent.Parent
			}
			if parent != nil && ast.IsVariableDeclaration(parent) && parent.AsVariableDeclaration().Initializer != nil && unwrapRenderExpression(parent.AsVariableDeclaration().Initializer) == value {
				aliasName := parent.Name()
				if aliasName != nil && ast.IsIdentifier(aliasName) {
					alias := typeChecker.GetSymbolAtLocation(aliasName)
					if alias != nil {
						symbols[ast.GetSymbolId(alias)] = true
						seen[aliasName] = true
						added = true
						if value != node {
							references = append(references, node)
						}
						return true
					}
				}
			}
			references = append(references, node)
			return true
		})
		if !added {
			break
		}
	}
	return references, true
}

// Returned functions are result data, not cleanup registrations. Follow named
// callback aliases as well as direct returned closures before accepting a close
// call as authored disposal of a generation-local resource.
func taskResourceReturnedCapture(reference, work *ast.Node, typeChecker *checker.Checker) bool {
	for current := reference.Parent; current != nil && current != work; current = current.Parent {
		if !isCallableNode(current) {
			continue
		}
		parent := current.Parent
		for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsNonNullExpression(parent)) {
			parent = parent.Parent
		}
		if parent != nil && ast.IsReturnStatement(parent) {
			return true
		}
		var name *ast.Node
		if ast.IsFunctionDeclaration(current) {
			name = current.Name()
		}
		if parent != nil && ast.IsVariableDeclaration(parent) {
			name = parent.Name()
		}
		if name == nil || !ast.IsIdentifier(name) {
			continue
		}
		references, ok := taskResourceLocalReferences(work, name, typeChecker)
		if !ok {
			return true
		}
		for _, node := range references {
			// Invoking a local callback returns its result, not the captured callback.
			if node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node {
				continue
			}
			for ancestor := node.Parent; ancestor != nil && ancestor != work; ancestor = ancestor.Parent {
				if ast.IsReturnStatement(ancestor) {
					return true
				}
			}
		}
	}
	return false
}

// Native cancellation consumes a handle without transferring resource ownership.
// Keep the managed callback and settlement cleanup even if an authored clear call
// is conditional. Unknown same-named functions remain opaque escape boundaries.
func taskNativeResourceReleaseReference(reference *ast.Node, candidate resourceCandidate, typeChecker *checker.Checker) bool {
	argument := reference
	for argument.Parent != nil && (ast.IsParenthesizedExpression(argument.Parent) || ast.IsAsExpression(argument.Parent) || ast.IsNonNullExpression(argument.Parent) || ast.IsSatisfiesExpression(argument.Parent)) {
		argument = argument.Parent
	}
	call := argument.Parent
	if call == nil || !ast.IsCallExpression(call) || len(call.AsCallExpression().Arguments.Nodes) != 1 || call.AsCallExpression().Arguments.Nodes[0] != argument {
		return false
	}
	target := call.AsCallExpression().Expression
	name := resourceTargetName(target)
	switch candidate.kind {
	case "timeout", "interval":
		if name != "clearTimeout" && name != "clearInterval" {
			return false
		}
	case "animation-frame":
		if name != "cancelAnimationFrame" {
			return false
		}
	case "idle-callback":
		if name != "cancelIdleCallback" {
			return false
		}
	default:
		return false
	}
	actual := callTargetSymbol(target, typeChecker)
	expected := typeChecker.GetGlobalSymbol(name, ast.SymbolFlagsValue, nil)
	if actual != nil && expected != nil && ast.GetSymbolId(actual) == ast.GetSymbolId(expected) {
		return true
	}
	if !ast.IsPropertyAccessExpression(target) {
		return false
	}
	receiver := target.AsPropertyAccessExpression().Expression
	if !ast.IsIdentifier(receiver) || (receiver.Text() != "window" && receiver.Text() != "self" && receiver.Text() != "globalThis") {
		return false
	}
	actual = typeChecker.GetResolvedSymbol(receiver)
	expected = typeChecker.GetGlobalSymbol(receiver.Text(), ast.SymbolFlagsValue|ast.SymbolFlagsNamespace, nil)
	if actual == nil || expected == nil || ast.GetSymbolId(actual) != ast.GetSymbolId(expected) {
		return false
	}
	// The receiver identity is now proven, so this native member query avoids
	// contextual checking of arbitrary generic receiver expressions.
	return nativeDeclarationSymbol(typeChecker.GetSymbolAtLocation(target.AsPropertyAccessExpression().Name()))
}
