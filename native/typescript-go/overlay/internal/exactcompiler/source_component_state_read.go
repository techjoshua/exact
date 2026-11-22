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
