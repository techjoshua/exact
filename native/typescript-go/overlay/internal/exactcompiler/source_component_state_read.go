package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

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

// componentStateCaptureOrigins projects a directly initialized setup binding.
// An ordinary derived value observes the live slot. An imported root peek with
// a direct read callback observes only setup writes that precede the snapshot.
// Array member selection still belongs to the ordinary writer and Get visitors.
func (q *sourceValueQuery) componentStateCaptureOrigins(binding *ast.Node, result *accessorCandidates) []sourceValue {
	if binding.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	if cached := q.owner.stateCaptureOrigins[binding]; cached != nil {
		return cached
	}
	read := unwrapSourceCallableReference(binding.Initializer())
	if read == nil || !ast.IsAccessExpression(read) && !ast.IsCallExpression(read) {
		return nil
	}
	component := enclosingCallableNode(binding)
	if _, owned := q.owner.components[component]; !owned ||
		binding.Parent.Parent == nil || binding.Parent.Parent.Parent != component.Body() {
		return nil
	}
	source := ast.GetSourceFileOfNode(binding)
	snapshot := reactiveSnapshotInitializer(read, source, q.owner.checker)
	if snapshot {
		args := read.AsCallExpression().Arguments
		if args == nil || len(args.Nodes) != 1 {
			return nil
		}
		callback := unwrapSourceCallableReference(args.Nodes[0])
		if callback == nil || !ast.IsArrowFunction(callback) || ast.HasSyntacticModifier(callback, ast.ModifierFlagsAsync) ||
			len(callback.Parameters()) != 0 || ast.IsBlock(callback.Body()) {
			return nil
		}
		read = unwrapSourceCallableReference(callback.Body())
		if !q.componentSnapshotSetupPrefix(component.Body(), binding.Parent.Parent, result) {
			return nil
		}
	}
	receiver, field := componentStateSlotReceiver(read)
	if receiver == nil || !helperOwnsReceiver(receiver, component) {
		return nil
	}
	index := q.owner.index(source)
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(binding.Name())
	if symbol == nil {
		return nil
	}
	scopes := componentStateReceiverScopes(component, q.owner.checker)
	var alternatives []sourceValue
	var initial *ast.Node
	minElements := int(^uint(0) >> 1)
	for _, region := range index.operationRegions {
		for _, site := range region.receivers {
			if site.Pos() < component.Pos() || site.End() > component.End() {
				continue
			}
			if !q.charge(result, site) {
				return nil
			}
			if !componentOwnsReceiver(site, scopes) {
				continue
			}
			facade := site.Parent
			if facade == nil || !ast.IsPropertyAccessExpression(facade) || facade.Expression() != site {
				return nil
			}
			if facade.Name().Text() != "state" {
				if !readComponentInstanceMember(facade, site) {
					return nil
				}
				continue
			}
			slot := facade.Parent
			_, key := componentStateSlotReceiver(slot)
			if key == "" {
				return nil
			}
			if key != field {
				continue
			}
			assignment := slot.Parent
			_, write := accessorEvaluationMode(slot)
			if !write {
				if slot != read && !q.componentArrayRead(slot, true, -1) {
					return nil
				}
				continue
			}
			if snapshot && (enclosingCallableNode(site) != component || slot.Pos() >= binding.End()) {
				// The prefix proof excludes any entry into deferred writers before
				// this snapshot. Later slot replacement cannot retarget its origin.
				continue
			}
			if !plainStagedAssignment(assignment) || assignment.AsBinaryExpression().Left != slot ||
				assignment.Parent == nil || !ast.IsExpressionStatement(assignment.Parent) {
				return nil
			}
			array := unwrapSourceCallableReference(assignment.AsBinaryExpression().Right)
			if array == nil || !ast.IsArrayLiteralExpression(array) ||
				!denseArrayElements(array.AsArrayLiteralExpression().Elements.Nodes) {
				return nil
			}
			if assignment.Parent.Parent == component.Body() && assignment.End() <= binding.Pos() {
				if initial == nil || initial.Pos() < array.Pos() {
					initial = array
				}
			}
			minElements = min(minElements, len(array.AsArrayLiteralExpression().Elements.Nodes))
			alternatives = append(alternatives, sourceValue{node: array})
		}
	}
	if initial == nil {
		return nil
	}
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !q.charge(result, use.node) || !q.componentArrayRead(use.node, false, minElements) {
			return nil
		}
	}
	if snapshot {
		alternatives = []sourceValue{{node: initial}}
	} else {
		slices.SortFunc(alternatives, func(a, b sourceValue) int { return a.node.Pos() - b.node.Pos() })
	}
	if q.owner.stateCaptureOrigins == nil {
		q.owner.stateCaptureOrigins = make(map[*ast.Node][]sourceValue)
	}
	q.owner.stateCaptureOrigins[binding] = alternatives
	return alternatives
}

// componentArrayRead limits the source projection to unescaped arrays and
// elements. Unrepresented writes keep the original conservative demand. A
// selected standard push on the slot can append data without replacing any
// original element or changing its descriptor.
func (q *sourceValueQuery) componentArrayRead(value *ast.Node, direct bool, elements int) bool {
	if elements >= 0 {
		member := value.Parent
		for member != nil && unwrapSourceCallableReference(member) == value {
			member = member.Parent
		}
		if member == nil || !ast.IsAccessExpression(member) {
			return false
		}
		_, key := accessorReceiver(member)
		if key != "length" {
			index, indexed := sourceArrayIndex(key)
			if !indexed || index >= uint64(elements) {
				return false
			}
		}
	}
	for current := value; current.Parent != nil; {
		parent := current.Parent
		if unwrapSourceCallableReference(parent) == current {
			current = parent
			continue
		}
		if ast.IsAccessExpression(parent) && parent.Expression() == current {
			current = parent
			continue
		}
		if direct && ast.IsCallExpression(parent) && parent.Expression() == current &&
			ast.IsPropertyAccessExpression(current) && current.Expression() == value && current.Name().Text() == "push" {
			// The caller requires dense array literals and excludes authored
			// member writes and exposure before accepting this confined receiver.
			return true
		}
		if current == value {
			return false
		}
		if ast.IsConditionalExpression(parent) && parent.AsConditionalExpression().Condition == current {
			return true
		}
		read, write := accessorEvaluationMode(current)
		return read && !write && !stateArgumentMayOwnMutations(q.owner.checker.GetTypeAtLocation(current))
	}
	return false
}

// componentSnapshotSetupPrefix proves that setup executes only ordinary
// state data assignments before the root peek. A nested writer cannot enter
// during this prefix. Authored reads inside element getters remain deferred.
func (q *sourceValueQuery) componentSnapshotSetupPrefix(body, end *ast.Node, result *accessorCandidates) bool {
	if body == nil || !ast.IsBlock(body) {
		return false
	}
	for _, statement := range body.AsBlock().Statements.Nodes {
		if statement == end {
			return true
		}
		if !q.charge(result, statement) || !ast.IsExpressionStatement(statement) {
			return false
		}
		assignment := statement.Expression()
		if !plainStagedAssignment(assignment) {
			return false
		}
		binary := assignment.AsBinaryExpression()
		if receiver, _ := componentStateSlotReceiver(binary.Left); receiver == nil {
			return false
		}
		right := unwrapSourceCallableReference(binary.Right)
		if ast.IsArrayLiteralExpression(right) {
			for _, element := range right.AsArrayLiteralExpression().Elements.Nodes {
				if !q.charge(result, element) || !sourceInertValueCreation(element) {
					return false
				}
			}
		} else if !sourceInertValueCreation(right) {
			return false
		}
	}
	return false
}

// componentStateSlotReceiver accepts a finite slot with its original state
// receiver. A computed key with eager work stays with ordinary acquisition.
func componentStateSlotReceiver(slot *ast.Node) (*ast.Node, string) {
	if slot == nil || !ast.IsAccessExpression(slot) || ast.IsOptionalChain(slot) {
		return nil, ""
	}
	facade, key := accessorReceiver(slot)
	if facade == nil || !ast.IsPropertyAccessExpression(facade) || ast.IsOptionalChain(facade) ||
		facade.Name().Text() != "state" || facade.Expression().Kind != ast.KindThisKeyword ||
		key == "" || key == "*" || key == "__proto__" {
		return nil, ""
	}
	if ast.IsElementAccessExpression(slot) && !sourceInertValueCreation(slot.AsElementAccessExpression().ArgumentExpression) {
		return nil, ""
	}
	return facade.Expression(), key
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
