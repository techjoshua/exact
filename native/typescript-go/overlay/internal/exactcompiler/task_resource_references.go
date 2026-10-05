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
	return taskResourceReferences(work, name, typeChecker, true)
}

func taskResourceReferences(work, name *ast.Node, typeChecker *checker.Checker, capture bool) ([]*ast.Node, bool) {
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return nil, false
	}
	symbols := map[ast.SymbolId]bool{ast.GetSymbolId(symbol): true}
	references := []*ast.Node{}
	seen := map[*ast.Node]bool{name: true}
	for {
		added := false
		var addValue func(*ast.Node)
		addValue = func(value *ast.Node) {
			if capture {
				if calls, localReturn := taskResourceLocalReturnCalls(value, work, typeChecker); localReturn {
					for _, call := range calls {
						if !seen[call] {
							seen[call] = true
							addValue(call)
						}
					}
					return
				}
			}
			parent := value.Parent
			for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsNonNullExpression(parent) || ast.IsSatisfiesExpression(parent)) {
				parent = parent.Parent
			}
			if parent != nil && ast.IsVariableDeclaration(parent) && parent.AsVariableDeclaration().Initializer != nil && unwrapRenderExpression(parent.AsVariableDeclaration().Initializer) == value {
				aliasName := parent.Name()
				if aliasName != nil && ast.IsIdentifier(aliasName) {
					alias := typeChecker.GetSymbolAtLocation(aliasName)
					if alias != nil && !symbols[ast.GetSymbolId(alias)] {
						symbols[ast.GetSymbolId(alias)] = true
						seen[aliasName] = true
						added = true
						return
					}
				}
			}
			references = append(references, value)
		}
		walkNode(work, func(node *ast.Node) bool {
			if ast.IsTypeNode(node) {
				return false
			}
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
			// Check the captured callable separately from its returned value. Calling
			// a local identity helper does not transfer the callback itself.
			if capture && taskResourceReturnedCapture(node, work, typeChecker) {
				references = append(references, node)
				return true
			}
			value := node
			if registration := taskContextResourceRegistration(work, node, typeChecker, "own"); registration != nil {
				value = registration
			}
			if value != node {
				addValue(value)
				references = append(references, node)
				return true
			}
			addValue(node)
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
		if !isCallableNode(current) && !ast.IsGetAccessorDeclaration(current) && !ast.IsSetAccessorDeclaration(current) {
			continue
		}
		parent := current.Parent
		for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsNonNullExpression(parent)) {
			parent = parent.Parent
		}
		if parent != nil && ast.IsReturnStatement(parent) {
			return true
		}
		if registration := taskContextResourceRegistration(work, current, typeChecker, "cleanup"); registration != nil {
			continue
		}
		if ast.IsMethodDeclaration(current) || ast.IsGetAccessorDeclaration(current) || ast.IsSetAccessorDeclaration(current) {
			container := current.Parent
			if container != nil && ast.IsObjectLiteralExpression(container) && taskResourceCapturedMemberEscapes(container, current, work, typeChecker) {
				return true
			}
		}
		var name *ast.Node
		if ast.IsFunctionDeclaration(current) {
			name = current.Name()
		}
		if parent != nil && ast.IsVariableDeclaration(parent) {
			name = parent.Name()
		}
		if name == nil || !ast.IsIdentifier(name) {
			if taskResourceCapturedValueEscapes(current, work, typeChecker) {
				return true
			}
			continue
		}
		references, ok := taskResourceReferences(work, name, typeChecker, false)
		if !ok {
			return true
		}
		for _, node := range references {
			if taskContextResourceRegistration(work, node, typeChecker, "cleanup") != nil {
				continue
			}
			// Invoking a local callback returns its result, not the captured callback.
			if node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node {
				continue
			}
			if resourceReferenceEscapes(node, work, "") {
				return true
			}
		}
	}
	return false
}

// Named cleanup aliases retain their authenticated frame registration. Resources
// created by that callback belong to native cleanup work rather than a new producer.
func taskResourceCleanupCallable(callable, work *ast.Node, typeChecker *checker.Checker) bool {
	if taskContextResourceRegistration(work, callable, typeChecker, "cleanup") != nil {
		return true
	}
	name := callable.Name()
	if callable.Parent != nil && ast.IsVariableDeclaration(callable.Parent) {
		name = callable.Parent.Name()
	}
	if name == nil || !ast.IsIdentifier(name) {
		return false
	}
	references, _ := taskResourceReferences(work, name, typeChecker, false)
	for _, reference := range references {
		if taskContextResourceRegistration(work, reference, typeChecker, "cleanup") != nil {
			return true
		}
	}
	return false
}

func taskResourceCapturedValueEscapes(value, work *ast.Node, typeChecker *checker.Checker) bool {
	parent := value.Parent
	if parent != nil && ast.IsPropertyAssignment(parent) && isCallableNode(value) {
		container := parent.Parent
		if container != nil && ast.IsObjectLiteralExpression(container) {
			return taskResourceCapturedMemberEscapes(container, parent, work, typeChecker)
		}
	}
	return taskResourceCapturedMemberEscapes(value, nil, work, typeChecker)
}

// A method value carries the closure even when its containing object stays local.
// Invoking that method consumes the callback and is distinct from publishing it.
func taskResourceCapturedMemberEscapes(value, member, work *ast.Node, typeChecker *checker.Checker) bool {
	parent := value.Parent
	for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsNonNullExpression(parent) || ast.IsSatisfiesExpression(parent)) {
		parent = parent.Parent
	}
	if parent != nil && ast.IsVariableDeclaration(parent) && ast.IsIdentifier(parent.Name()) {
		references, proven := taskResourceReferences(work, parent.Name(), typeChecker, false)
		if !proven {
			return true
		}
		for _, reference := range references {
			access := reference.Parent
			if member != nil && (ast.IsMethodDeclaration(member) || ast.IsPropertyAssignment(member)) && access != nil {
				matches := ast.IsPropertyAccessExpression(access) && access.AsPropertyAccessExpression().Expression == reference && access.Name().Text() == member.Name().Text()
				if ast.IsElementAccessExpression(access) && access.AsElementAccessExpression().Expression == reference {
					key := unwrapRenderExpression(access.AsElementAccessExpression().ArgumentExpression)
					matches = !ast.IsStringLiteral(key) || key.Text() == member.Name().Text()
				}
				if matches {
					call := access.Parent
					if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().Expression != access {
						if taskResourceCapturedValueEscapes(access, work, typeChecker) {
							return true
						}
					}
				}
			}
			if resourceReferenceEscapes(reference, work, "") {
				return true
			}
		}
		return false
	}
	return resourceReferenceEscapes(value, work, "")
}

// Local helper results follow the same identity flow as direct aliases. This
// proves only task-local result ownership and leaves native helper bodies intact.
func taskResourceLocalReturnCalls(value, work *ast.Node, typeChecker *checker.Checker) ([]*ast.Node, bool) {
	current := value
	for current.Parent != nil && (ast.IsParenthesizedExpression(current.Parent) || ast.IsAsExpression(current.Parent) || ast.IsNonNullExpression(current.Parent) || ast.IsSatisfiesExpression(current.Parent)) {
		current = current.Parent
	}
	parent := current.Parent
	var callable *ast.Node
	if parent != nil && ast.IsArrowFunction(parent) && parent.Body() == current {
		callable = parent
	} else if parent != nil && ast.IsReturnStatement(parent) && parent.AsReturnStatement().Expression == current {
		for ancestor := parent.Parent; ancestor != nil && ancestor != work; ancestor = ancestor.Parent {
			if isCallableNode(ancestor) {
				callable = ancestor
				break
			}
		}
	}
	if callable == nil || (!ast.IsFunctionDeclaration(callable) && !ast.IsFunctionExpression(callable) && !ast.IsArrowFunction(callable)) {
		return nil, false
	}
	name := callable.Name()
	if callable.Parent != nil && ast.IsVariableDeclaration(callable.Parent) {
		name = callable.Parent.Name()
	}
	if name == nil || !ast.IsIdentifier(name) {
		return nil, false
	}
	references, ok := taskResourceReferences(work, name, typeChecker, false)
	if !ok {
		return nil, false
	}
	calls := []*ast.Node{}
	for _, reference := range references {
		parent := reference.Parent
		if parent != nil && ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == reference {
			calls = append(calls, parent)
		} else if resourceReferenceEscapes(reference, work, "") {
			return nil, false
		}
	}
	return calls, true
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
