package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"
import "github.com/microsoft/TypeScript/tsc/internal/checker"

// helperStateRestriction traces proven argument ownership without rejecting helpers called with
// ordinary application objects. Diagnostics belong to the component call that supplies state.
func helperStateRestriction(call *ast.CallExpression, aliases map[ast.SymbolId]stateAliasBinding, typeChecker *checker.Checker, active map[ast.SymbolId]bool) string {
	expression, arguments, receiver := restrictedCallArguments(call.Expression, restrictedInvocationArguments(call), typeChecker, map[ast.SymbolId]bool{})
	// An extracted method loses its implicit receiver. Only the actual member call
	// supplies that receiver, while native invocation adapters supply theirs explicitly.
	if receiver == nil && expression == call.Expression {
		receiver, _ = restrictedInvocationMember(expression, typeChecker)
	}
	symbol := restrictedHelperSymbol(expression, typeChecker)
	if symbol == nil || active[ast.GetSymbolId(symbol)] {
		return ""
	}
	var work *ast.Node
	for _, declaration := range symbol.Declarations {
		if ast.IsFunctionDeclaration(declaration) || ast.IsMethodDeclaration(declaration) {
			work = declaration
			break
		}
		if ast.IsVariableDeclaration(declaration) {
			value := declaration.AsVariableDeclaration().Initializer
			if value != nil && (ast.IsArrowFunction(value) || ast.IsFunctionExpression(value)) {
				work = value
				break
			}
		}
	}
	if work == nil || work.Body() == nil {
		return ""
	}
	owned := map[ast.SymbolId]stateAliasBinding{}
	for key, value := range aliases {
		owned[key] = value
	}
	matched := false
	if binding, exists := owned[0]; !ast.IsArrowFunction(work) || !exists || !helperOwnsReceiver(work, binding.receiverScope) && !componentOwnsReceiver(work, binding.receivers) {
		owned[0] = stateAliasBinding{}
	}
	if path, ok := statePath(receiver, aliases, typeChecker, true); !ast.IsArrowFunction(work) && (ok || componentAliasReceiver(receiver, aliases, typeChecker)) {
		owned[0] = stateAliasBinding{fact: StateAlias{Path: path}, component: componentAliasReceiver(receiver, aliases, typeChecker), receiverScope: work, invalidAt: int(^uint(0) >> 1)}
		matched = true
	}
	index := -1
	for _, parameter := range work.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		index++
		// Rest parameters own a newly created array. A spread also ends positional proof,
		// so later authored arguments cannot be attached to a particular formal safely.
		if parameter.AsParameterDeclaration().DotDotDotToken != nil || (index < len(arguments) && arguments[index].Kind == ast.KindSpreadElement) {
			break
		}
		if index >= len(arguments) || !ast.IsIdentifier(parameter.Name()) {
			continue
		}
		argument := arguments[index]
		path, ok := statePath(argument, aliases, typeChecker, true)
		component := componentAliasReceiver(argument, aliases, typeChecker)
		if !ok && !component {
			continue
		}
		if binding := typeChecker.GetSymbolAtLocation(parameter.Name()); binding != nil {
			owned[ast.GetSymbolId(binding)] = stateAliasBinding{fact: StateAlias{Path: path}, component: component, invalidAt: int(^uint(0) >> 1)}
			matched = true
		}
	}
	if !matched {
		return ""
	}
	// Rebinding a parameter or an alias ends that reference's proven ownership.
	// An alias captured before the rebinding retains its own object provenance.
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsBinaryExpression(node) {
			assignment := node.AsBinaryExpression()
			if assignment.OperatorToken.Kind == ast.KindEqualsToken && ast.IsIdentifier(assignment.Left) {
				if symbol := typeChecker.GetSymbolAtLocation(assignment.Left); symbol != nil {
					key := ast.GetSymbolId(symbol)
					if binding, exists := owned[key]; exists && node.Pos() < binding.invalidAt {
						binding.invalidAt = node.Pos()
						owned[key] = binding
					}
				}
			}
		}
		return true
	})
	var aliasFacts []StateAlias
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) {
			declaration := node.AsVariableDeclaration()
			if componentAliasReceiver(declaration.Initializer, owned, typeChecker) && ast.IsIdentifier(declaration.Name()) {
				if binding := typeChecker.GetSymbolAtLocation(declaration.Name()); binding != nil {
					owned[ast.GetSymbolId(binding)] = stateAliasBinding{component: true, invalidAt: int(^uint(0) >> 1)}
				}
			} else if path, ok := statePath(declaration.Initializer, owned, typeChecker, true); ok {
				bindStateAlias("", declaration.Name(), path, owned, &aliasFacts, typeChecker)
			}
		}
		return true
	})
	active[ast.GetSymbolId(symbol)] = true
	defer delete(active, ast.GetSymbolId(symbol))
	message := ""
	walkNode(work.Body(), func(node *ast.Node) bool {
		if message != "" {
			return false
		}
		if ast.IsForInStatement(node) || ast.IsForOfStatement(node) {
			initializer := node.AsForInOrOfStatement().Initializer
			if initializer != nil && !ast.IsVariableDeclarationList(initializer) && targetContainsStatePath(initializer, owned, typeChecker) {
				message = "helper uses component state as a for-in or for-of assignment target. Assign the iteration value explicitly inside the loop body"
			}
		}
		if ast.IsCallExpression(node) {
			child := node.AsCallExpression()
			if resolvedReflectiveMutation(child.Expression, typeChecker, map[ast.SymbolId]bool{}) {
				if _, ok := statePath(reflectiveMutationArgument(child, typeChecker), owned, typeChecker, true); ok {
					message = "helper performs reflective component-state mutation. Use an ordinary assignment, delete, array mutator, or Object.assign()"
				}
			} else {
				message = helperStateRestriction(child, owned, typeChecker, active)
			}
		}
		return message == ""
	})
	return message
}

// restrictedHelperSymbol resolves directly declared object methods without asking the checker
// to contextually check an arbitrary property-call receiver. Generic receiver checking remains
// an upstream panic boundary, so opaque instance methods retain their conservative classification.
func restrictedHelperSymbol(expression *ast.Node, typeChecker *checker.Checker) *ast.Symbol {
	if receiver, name := restrictedInvocationMember(expression, typeChecker); receiver != nil && ast.IsIdentifier(receiver) {
		root := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(receiver), typeChecker)
		if root != nil {
			for _, declaration := range root.Declarations {
				if !ast.IsVariableDeclaration(declaration) {
					continue
				}
				value := declaration.AsVariableDeclaration().Initializer
				if value == nil || !ast.IsObjectLiteralExpression(value) {
					continue
				}
				for _, property := range value.AsObjectLiteralExpression().Properties.Nodes {
					if ast.IsMethodDeclaration(property) && ast.IsIdentifier(property.Name()) && property.Name().Text() == name {
						return resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(property.Name()), typeChecker)
					}
				}
			}
		}
	}
	return resolvedCallableSymbol(callTargetSymbol(expression, typeChecker), typeChecker)
}
