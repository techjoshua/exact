package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInitializerArgument is issued only by an actual pending argument phase.
// It is an exact input identity, not a module output or operation-creation grant.
type sourceInitializerArgument struct {
	demand sourceCallInputDemand
	header *sourcePreparedInvocation
}
type sourceInitializerSelection struct {
	argument *sourceInitializerArgument
	use      *ast.Node
	aliases  []*ast.Node
}

// sourceInitializerUse is exclusive pending provenance. The node beside it is
// never a finite raw Call output. Only the original actual may retain it through
// identity copies. Other publication resolves it or emits ordinary incomplete.
type sourceInitializerUse struct {
	binding, use *ast.Node
	argument     *sourceInitializerArgument
}

func (query *sourceValueQuery) initializerArgument(phase sourceNormalPhase, slot *sourceNormalOperation, result *accessorCandidates) *sourceInitializerSelection {
	op := query.operation
	value := unwrapSourceCallableReference(phase.argument)
	if value == nil || !ast.IsIdentifier(value) || op == nil || op.outputOnly || query.inputs == nil || op.inputs != query.inputs || op.owner != query.inputs.declaration || enclosingCallableNode(phase.node) != op.owner || op.node != phase.node || !ast.IsCallExpression(phase.node) || query.inputs.operations[phase.node] != slot || slot == nil || slot.selected == nil || slot.state != sourceOperationPending {
		return nil
	}
	for position, argument := range restrictedInvocationArguments(phase.node.AsCallExpression()) {
		if !query.charge(result, argument) {
			return nil
		}
		if argument == phase.argument {
			return &sourceInitializerSelection{argument: &sourceInitializerArgument{demand: sourceCallInputDemand{caller: &sourceCallerInputOwner{owner: op.owner, frame: query.inputs}, call: phase.node, expression: argument, position: position, parent: slot}, header: slot.selected}, use: value}
		}
	}
	return nil
}

// pendingInitializerValues follows only an actually selected immutable identity
// alias. The authored actual and the inner selected identifier remain distinct.
func (query *sourceValueQuery) pendingInitializerValues(symbol *ast.Symbol, use, binding *ast.Node, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	selection := query.initializerSelection
	if selection == nil || selection.use != use || selection.argument == nil || enclosingCallableNode(binding) != nil {
		return nil, false
	}
	for _, old := range selection.aliases {
		if !query.charge(result, use) || old == binding {
			result.valueIncomplete = true
			return []sourceValue{{}}, true
		}
	}
	if binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 || query.owner.bindingWritten(symbol) {
		return nil, false
	}
	value := unwrapSourceCallableReference(binding.Initializer())
	if value != nil && ast.IsIdentifier(value) {
		previous := query.initializerSelection
		query.initializerSelection = &sourceInitializerSelection{argument: selection.argument, use: value, aliases: append(append([]*ast.Node{}, selection.aliases...), binding)}
		defer func() { query.initializerSelection = previous }()
		return query.originsAt(value, binding, bindings, result), true
	}
	if value != nil && ast.IsCallExpression(value) && query.moduleInitializerBinding(value, result) == binding {
		return []sourceValue{{node: value, initializerUse: &sourceInitializerUse{binding: binding, use: use, argument: selection.argument}}}, true
	}
	return nil, false
}

// resolveInitializerUse only reads the original published actual and existing
// module fact. It does not acquire a body, Get, argument, default or module.
func (query *sourceValueQuery) resolveInitializerUse(value sourceValue, result *accessorCandidates) []sourceValue {
	r := value.initializerUse
	if r == nil || r.argument == nil || !query.charge(result, value.node) || len(value.path) != 0 {
		result.valueIncomplete = true
		return nil
	}
	d := r.argument.demand
	if query.operation == nil || d.caller == nil || query.operation.node != d.call || query.operation.owner != d.caller.owner || query.operation.inputs != d.caller.frame {
		result.valueIncomplete = true
		return nil
	}
	if d.caller == nil || d.caller.frame == nil || d.caller.owner != d.caller.frame.declaration || d.parent == nil || d.caller.frame.operations[d.call] != d.parent || d.parent.selected != r.argument.header || r.argument.header == nil || d.call == nil || !ast.IsCallExpression(d.call) || enclosingCallableNode(d.call) != d.caller.owner {
		result.valueIncomplete = true
		return nil
	}
	switch d.parent.state {
	case sourceOperationPending, sourceOperationInProgress, sourceOperationConsumed, sourceOperationRefused:
	default:
		result.valueIncomplete = true
		return nil
	}
	args := restrictedInvocationArguments(d.call.AsCallExpression())
	if d.position < 0 || d.position >= len(args) || args[d.position] != d.expression {
		result.valueIncomplete = true
		return nil
	}
	published := false
	for _, actual := range d.parent.actuals {
		if !query.charge(result, d.expression) {
			return nil
		}
		if actual.node != d.expression {
			continue
		}
		for _, observed := range actual.observed.values {
			if !query.charge(result, d.expression) {
				return nil
			}
			published = published || observed.value.initializerUse == r
		}
	}
	v := d.caller.frame.properties
	if !published || v == nil || v.frame != d.caller.frame || v.root != d.caller.owner || v.frame.properties != v || v.state == sourcePropertyDisposed || v.owner != query.owner || v.program != query.owner.program || v.checker != query.owner.checker || v.generation != query.owner.generation || v.executable != query.executable || r.binding == nil || !ast.IsVariableDeclaration(r.binding) || r.use == nil || value.node != unwrapSourceCallableReference(r.binding.Initializer()) {
		result.valueIncomplete = true
		return nil
	}
	// The demand supplies only lookup construction, never original value inputs.
	symbol := sourceCallableReferenceSymbol(r.use, query.owner.checker)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.sourceAlias(symbol, result)
	}
	if symbol == nil || symbol.ValueDeclaration != r.binding {
		result.valueIncomplete = true
		return nil
	}
	values, admitted := query.moduleInitializerValuesAt(v, symbol, r.use, result)
	if !admitted {
		result.valueIncomplete = true
	}
	if d.parent.state == sourceOperationRefused {
		result.valueIncomplete = true
	}
	return values
}

// sealInitializerValues is a publication fence. The original actual remains
// unchanged. No unresolved pointer enters bindings, scopes, child or raw outputs.
func (query *sourceValueQuery) sealInitializerValues(values []sourceValue, result *accessorCandidates) []sourceValue {
	var sealed []sourceValue
	for i, value := range values {
		if value.initializerUse == nil {
			if sealed != nil {
				sealed = append(sealed, value)
			}
			continue
		}
		if sealed == nil {
			sealed = append(make([]sourceValue, 0, len(values)), values[:i]...)
		}
		resolved := query.resolveInitializerUse(value, result)
		if len(resolved) == 0 {
			resolved = []sourceValue{{}}
		}
		sealed = append(sealed, resolved...)
	}
	if sealed == nil {
		return values
	}
	return sealed
}

// sealInitializerCandidates publishes values and their indexed scopes together.
// Resolved arms own their original acquired scopes. Refusal has no callable
// scope authority, while unaffected siblings retain their original association.
func (query *sourceValueQuery) sealInitializerCandidates(result *accessorCandidates) {
	first := -1
	for i, value := range result.values {
		if value.initializerUse != nil {
			first = i
			break
		}
	}
	if first < 0 {
		return
	}
	original, scopes := result.values, result.callableScopes
	values := append(make([]sourceValue, 0, len(original)), original[:first]...)
	var selected map[int]acquiredCallableScope
	retain := func(index int, scope acquiredCallableScope) {
		if selected == nil {
			selected = make(map[int]acquiredCallableScope)
		}
		selected[index] = scope
	}
	for i := 0; i < first; i++ {
		if scope, ok := scopes[i]; ok {
			retain(i, scope)
		}
	}
	for i := first; i < len(original); i++ {
		value := original[i]
		if value.initializerUse == nil {
			if scope, ok := scopes[i]; ok {
				retain(len(values), scope)
			}
			values = append(values, value)
			continue
		}
		for _, resolved := range query.sealInitializerValues([]sourceValue{value}, result) {
			if resolved.acquired != nil {
				retain(len(values), resolved.acquired.scope)
			}
			values = append(values, resolved)
		}
	}
	result.values, result.callableScopes = values, selected
}

func (query *sourceValueQuery) sealInitializerObservation(observed sourceResultObservation, result *accessorCandidates) sourceResultObservation {
	var values []sourceObservedValue
	for i, original := range observed.values {
		if original.value.initializerUse == nil {
			if values != nil {
				values = append(values, original)
			}
			continue
		}
		if values == nil {
			values = append(make([]sourceObservedValue, 0, len(observed.values)), observed.values[:i]...)
		}
		part := accessorCandidates{}
		for _, value := range query.sealInitializerValues([]sourceValue{original.value}, &part) {
			if value.acquired != nil {
				values = append(values, *value.acquired)
			} else {
				copy := original
				copy.value = value
				values = append(values, copy)
			}
		}
		observed.incomplete = observed.incomplete || part.valueIncomplete
		mergeAccessorCandidates(result, part)
	}
	if values != nil {
		observed.values = values
	}
	return observed
}

// dropInitializerActuals touches only the ending overlay's actual observations.
// Every inspected operation/value was already charged at creation/publication.
// It neither visits borrowed scopes nor mutates the restored previous table.
func dropInitializerActuals(operations map[*ast.Node]*sourceNormalOperation) {
	for _, operation := range operations {
		dropInitializerOperation(operation)
	}
}

func dropInitializerOperation(operation *sourceNormalOperation) {
	if operation == nil {
		return
	}
	for i := range operation.actuals {
		actual := &operation.actuals[i].observed
		for j := range actual.values {
			if actual.values[j].value.initializerUse != nil {
				actual.values[j].value = sourceValue{}
				actual.incomplete = true
			}
		}
	}
}
