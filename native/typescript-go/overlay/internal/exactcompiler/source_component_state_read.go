package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// componentStateFieldRead accounts for the first field lookup on the state facade
// of a lexical component receiver. The same origin and path reach this visitor
// through direct access and through an actual helper argument. State mutation
// diagnostics own reflective replacement. Field contents, nested Gets and
// evaluation of the authored receiver and key remain with their existing owners.
func (q *sourceValueQuery) componentStateFieldRead(receiver *ast.Node, path []string, name string, mode accessorTraversal) bool {
	member := q.protectedMember
	if !q.dependenciesOnly || mode != accessorRead || member == nil ||
		(!ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member)) {
		return false
	}
	if len(path) == 2 && name == "" {
		path, name = path[:1], path[1]
	}
	_, key := accessorReceiver(member)
	if len(path) != 1 || path[0] != "state" || name == "" || name == "*" || name == "__proto__" || name != key {
		return false
	}
	for scope := receiver.Parent; scope != nil; scope = scope.Parent {
		if _, component := q.owner.components[scope]; component {
			return helperOwnsReceiver(receiver, scope) && q.owner.stableComponentStateFacade(scope)
		}
	}
	return false
}

// stableComponentStateFacade checks the existing receiver index once per
// component. A root replacement or an exposed instance can supply a different
// object to the helper, even when its argument still spells this.state.
func (owner *sourceValueOwner) stableComponentStateFacade(component *ast.Node) bool {
	if stable, known := owner.stateFacadeReads[component]; known {
		return stable
	}
	index := owner.index(ast.GetSourceFileOfNode(component))
	if index.incomplete {
		return false
	}
	stable := !index.normalDynamicScope
	if stable {
		scopes := componentStateReceiverScopes(component, owner.checker)
		for _, region := range index.operationRegions {
			for _, receiver := range region.receivers {
				if receiver.Pos() < component.Pos() || receiver.End() > component.End() ||
					!componentOwnsReceiver(receiver, scopes) {
					continue
				}
				member := receiver.Parent
				for member != nil && unwrapSourceCallableReference(member) == receiver {
					member = member.Parent
				}
				if !readComponentInstanceMember(member, receiver) {
					stable = false
					break
				}
			}
			if !stable {
				break
			}
		}
	}
	if owner.stateFacadeReads == nil {
		owner.stateFacadeReads = make(map[*ast.Node]bool)
	}
	owner.stateFacadeReads[component] = stable
	return stable
}

// readComponentInstanceMember allows an ordinary finite read of the instance.
// Calls can run with the instance as this and writes can replace its state.
func readComponentInstanceMember(member, receiver *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(member) && !ast.IsElementAccessExpression(member) {
		return false
	}
	base, key := accessorReceiver(member)
	if unwrapSourceCallableReference(base) != receiver || key == "" || key == "*" {
		return false
	}
	read, write := accessorEvaluationMode(member)
	return read && !write && normalCalleeGetOwner(member) == nil
}

// componentFilterInputs finds possible filter element sources for a confined
// state slot. All authored uses of the facade and array must preserve the array
// method. The returned literals include deferred replacement writes.
func (q *sourceValueQuery) componentFilterInputs(call *ast.Node, bindings sourceValueBindings) []*ast.Node {
	if !q.dependenciesOnly || q.inputs == nil || len(bindings) == 0 || call == nil || !ast.IsCallExpression(call) || ast.IsOptionalChain(call) || !arrayCallbackCannotAccessReceiver(call) {
		return nil
	}
	member := call.Expression()
	if !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "filter" ||
		standardLibraryCallOwner(call.AsCallExpression(), q.owner.checker) != "Array" ||
		!nativeReceiverMemberDeclarations(member, q.owner.checker) {
		return nil
	}
	field := member.Expression()
	if !ast.IsPropertyAccessExpression(field) || !ast.IsIdentifier(field.Expression()) {
		return nil
	}
	formal := field.Expression()
	symbol := q.owner.checker.GetSymbolAtLocation(formal)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) {
		return nil
	}
	terms := bindings[ast.GetSymbolId(symbol)]
	if len(terms) != 1 || !inventorySourceValue(terms[0]) || terms[0].node == nil ||
		terms[0].node.Kind != ast.KindThisKeyword || len(terms[0].path) != 1 || terms[0].path[0] != "state" {
		return nil
	}
	input := terms[0].node
	facade := input.Parent
	component := q.effectOwner
	for component != nil {
		if _, owned := q.owner.components[component]; owned {
			break
		}
		component = component.Parent
	}
	if facade == nil || !ast.IsPropertyAccessExpression(facade) || facade.Parent == nil || !ast.IsCallExpression(facade.Parent) ||
		q.inputs.declaration != enclosingCallableNode(call) || q.inputs.invocation != facade.Parent ||
		enclosingCallableNode(symbol.ValueDeclaration) != q.inputs.declaration ||
		component == nil || !helperOwnsReceiver(input, component) || !q.owner.stableComponentStateFacade(component) {
		return nil
	}
	uses, known := q.mapKeySourceUses(symbol, symbol.ValueDeclaration)
	if !known || len(uses) != 1 || uses[0].node != formal {
		return nil
	}
	key := componentArrayFieldUse{component, facade, field.Name().Text()}
	if sources, known := q.owner.stateArraySources[key]; known {
		return sources
	}
	sources := q.componentArrayFieldSources(component, facade, key.field)
	if q.owner.stateArraySources == nil {
		q.owner.stateArraySources = make(map[componentArrayFieldUse][]*ast.Node)
	}
	q.owner.stateArraySources[key] = sources
	return sources
}

type componentArrayFieldUse struct {
	component, facade *ast.Node
	field             string
}

// componentArrayFieldSources accounts for each source use that can replace the
// slot, change its indexed input effects, or expose either object.
func (q *sourceValueQuery) componentArrayFieldSources(component, transferred *ast.Node, key string) []*ast.Node {
	index := q.owner.index(ast.GetSourceFileOfNode(component))
	var sources []*ast.Node
	hasDefault := false
	for _, region := range index.operationRegions {
		for _, receiver := range region.receivers {
			if receiver.Pos() < component.Pos() || receiver.End() > component.End() || !helperOwnsReceiver(receiver, component) {
				continue
			}
			facade := receiver.Parent
			if facade == transferred {
				continue
			}
			if facade == nil || !ast.IsAccessExpression(facade) || facade.Expression() != receiver {
				return nil
			}
			_, name := accessorReceiver(facade)
			if name != "state" {
				if name == "" || name == "*" {
					return nil
				}
				continue
			}
			field := facade.Parent
			if field == nil || !ast.IsAccessExpression(field) || field.Expression() != facade {
				return nil
			}
			_, name = accessorReceiver(field)
			if name == "" || name == "*" || name == "__proto__" {
				return nil
			}
			if name != key {
				continue
			}
			assignment := field.Parent
			if plainStagedAssignment(assignment) && assignment.AsBinaryExpression().Left == field {
				// A consumed assignment expression can expose the stored array.
				statement := assignment.Parent
				if statement == nil || !ast.IsExpressionStatement(statement) {
					return nil
				}
				array := unwrapSourceCallableReference(assignment.AsBinaryExpression().Right)
				if array == nil || !ast.IsArrayLiteralExpression(array) || !denseArrayElements(array.AsArrayLiteralExpression().Elements.Nodes) {
					return nil
				}
				for _, element := range array.AsArrayLiteralExpression().Elements.Nodes {
					if !checkedPrimitiveOperand(element, q.owner.checker) {
						return nil
					}
				}
				sources = append(sources, array)
				hasDefault = hasDefault || statement.Parent == component.Body() && assignment.Pos() < transferred.Pos()
				continue
			}
			// A primitive indexed read does not expose the array.
			if assignment != nil && ast.IsElementAccessExpression(assignment) && assignment.Expression() == field {
				_, index := accessorReceiver(assignment)
				read, write := accessorEvaluationMode(assignment)
				if _, numeric := sourceArrayIndex(index); numeric && read && !write {
					continue
				}
			}
			return nil
		}
	}
	if hasDefault {
		return sources
	}
	return nil
}
