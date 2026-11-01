package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceConsumedCallInputs is an input-only relation of an already consumed Call.
// It is not a normal result receipt or proof of completed PutValue. Suspended
// provenance remains conditional even when the installed body was analyzed.
type sourceConsumedCallInputs struct {
	operation, declaration *ast.Node
	parent, inputs         *sourceValueInputs
	entered, conditional   bool
}

// sourceConsumedLexicalWrite pairs an actual writer plan with its original cell
// and conditional assigned values. Only the construction root retains this list.
// Cached field/call outcomes never acquire its frames or return-value authority.
type sourceConsumedLexicalWrite struct {
	cell      *sourceValueInputs
	symbol    *ast.Symbol
	operation *ast.Node
	call      *sourceConsumedCallInputs
	observed  sourceResultObservation
}

// sourceLexicalCell is an admitted capture's original binding identity. It is
// independent of value alternatives and supplies no completion or callable value.
type sourceLexicalCell struct {
	frame       *sourceValueInputs
	symbol      *ast.Symbol
	producer    *ast.Node
	conditional bool
}

func installLexicalCell(inputs, original *sourceValueInputs, symbol *ast.Symbol) {
	if inputs.cells == nil {
		inputs.cells = make(map[ast.SymbolId]sourceLexicalCell)
	}
	if _, exists := inputs.cells[ast.GetSymbolId(symbol)]; !exists {
		inputs.cells[ast.GetSymbolId(symbol)] = sourceLexicalCell{frame: original, symbol: symbol}
	}
}

// normalInputOwned is shared by scope consumption and original-cell matching.
// The selected association is produced by the acquired alternative, never lookup.
func normalInputOwned(normal *sourceNormalValue, inputs *sourceValueInputs) bool {
	if normal == nil || normal.observed.inputs == nil || normal.observed.inputs.declaration != normal.owner {
		return false
	}
	if normal.installed == nil {
		return inputs == normal.observed.inputs
	}
	return normal.installed == inputs && normal.installed.invocation != nil && (enclosingCallableNode(normal.installed.invocation) == normal.owner || selectedNormalCaptureOwner(normal.installed, normal.selected) == normal.observed.inputs)
}

func consumedWriteRoot(inputs *sourceValueInputs) *sourceValueInputs {
	if inputs == nil || inputs.properties == nil || inputs.properties.state == sourcePropertyDisposed {
		return nil
	}
	return inputs.properties.frame
}

func (query *sourceValueQuery) consumedWriteCell(inputs *sourceValueInputs, symbol *ast.Symbol, result *accessorCandidates) *sourceValueInputs {
	if inputs == nil || symbol == nil {
		return nil
	}
	if cell, ok := inputs.cells[ast.GetSymbolId(symbol)]; ok && cell.symbol == symbol && cell.frame != nil {
		if !query.charge(result, nil) {
			return nil
		}
		return cell.frame
	}
	if !query.unambiguousLexicalCell(symbol.ValueDeclaration, enclosingCallableNode(symbol.ValueDeclaration), result) {
		return nil
	}
	for _, v := range inputs.bindings[ast.GetSymbolId(symbol)] {
		if !query.charge(result, v.node) {
			return nil
		}
		n := v.normal
		if n != nil && n.symbol == symbol && normalInputOwned(n, inputs) {
			return n.observed.inputs
		}
	}
	return nil
}

// lexicalWriteGet selects the already owned ordinary RHS Get for value capture.
// It neither suppresses that effect owner nor grants a nonlocal completed slot.
func (query *sourceValueQuery) lexicalWriteGet(node *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) *ast.Node {
	if inputs == nil || inputs.consumedCall == nil {
		return nil
	}
	outer := node
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == node {
		outer = outer.Parent
	}
	operation := outer.Parent
	if operation == nil || !ast.IsBinaryExpression(operation) {
		return nil
	}
	binary := operation.AsBinaryExpression()
	if binary.OperatorToken.Kind != ast.KindEqualsToken || binary.Right != outer || !ast.IsIdentifier(binary.Left) {
		return nil
	}
	symbol := query.owner.checker.GetSymbolAtLocation(binary.Left)
	if query.consumedWriteCell(inputs, symbol, result) == nil {
		return nil
	}
	return operation
}

// consumeLexicalWrite acquires values at this admitted assignment, not at a later
// read. Get and Call RHS domains consume retained outputs. Data expressions use
// this installed writer scope. Unbound identifiers cannot reread initializers.
func (query *sourceValueQuery) consumeLexicalWrite(operation *ast.Node, bindings sourceValueBindings, result *accessorCandidates, inputs *sourceValueInputs) {
	if inputs == nil || inputs.consumedCall == nil || !inputs.consumedCall.entered || operation == nil || !ast.IsBinaryExpression(operation) {
		return
	}
	binary := operation.AsBinaryExpression()
	if binary.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(binary.Left) {
		return
	}
	// Both dependent and ordinary routes use the same actual-demand admission.
	if !query.assignmentWriteAdmitted(operation, bindings, inputs, result) {
		return
	}
	symbol := query.owner.checker.GetSymbolAtLocation(binary.Left)
	cell := query.consumedWriteCell(inputs, symbol, result)
	if cell == nil {
		return
	}
	root := consumedWriteRoot(inputs)
	if root == nil {
		result.opaque = true
		return
	}
	if !query.charge(result, operation) {
		return
	}
	for _, old := range root.consumedWrites {
		if !query.charge(result, old.operation) {
			return
		}
		if old.call == inputs.consumedCall && old.operation == operation && old.cell == cell && old.symbol == symbol {
			return
		}
	}
	previous := query.returnObservation
	query.returnObservation = &sourceReturnObservation{kind: sourceRawNormalResult, owner: inputs.declaration, reader: operation, frame: inputs, receipts: result.nativeCalls, normalCalls: result.normalCalls}
	defer func() { query.returnObservation = previous }()
	rhs := unwrapSourceCallableReference(binary.Right)
	observed := sourceResultObservation{incomplete: true}
	switch {
	case ast.IsPropertyAccessExpression(rhs) || ast.IsElementAccessExpression(rhs):
		// Each pending receipt belongs to this assignment occurrence. Remove it
		// only after copying its alternatives. Body exit releases refused residue.
		foundGet := false
		for i := 0; i < len(inputs.lexicalGets); {
			get := inputs.lexicalGets[i]
			if !query.charge(result, get.site) {
				return
			}
			if get.site != operation {
				i++
				continue
			}
			if !foundGet {
				observed.incomplete = false
			}
			foundGet = true
			observed.incomplete = observed.incomplete || get.incomplete
			for _, value := range get.values {
				if !query.charge(result, value.value.node) {
					return
				}
				observed.values = append(observed.values, value)
			}
			copy(inputs.lexicalGets[i:], inputs.lexicalGets[i+1:])
			inputs.lexicalGets[len(inputs.lexicalGets)-1] = sourceGetReturn{}
			inputs.lexicalGets = inputs.lexicalGets[:len(inputs.lexicalGets)-1]
		}
	case ast.IsCallExpression(rhs):
		raw, found := query.acquireNormalCallResult(rhs, result)
		observed.values = raw.values
		observed.incomplete = raw.incomplete || !found
	case ast.IsAwaitExpression(rhs):
		// Await output belongs to its existing normal producer, never a new execution.
		acquired := accessorCandidates{}
		query.observeNativeAwait(rhs, bindings, &acquired)
		mergeAccessorCandidates(result, acquired)
		for i, v := range acquired.values {
			observed.values = append(observed.values, sourceObservedValue{value: v, inputs: inputs, scope: acquired.callableScopes[i]})
		}
	default:
		bound := true
		if ast.IsIdentifier(rhs) {
			s := query.owner.checker.GetSymbolAtLocation(rhs)
			if s == nil {
				bound = false
			} else {
				_, bound = bindings[ast.GetSymbolId(s)]
			}
		}
		if bound {
			acquired := accessorCandidates{}
			for _, v := range query.originsAt(rhs, operation, bindings, &acquired) {
				if !query.charge(&acquired, operation) {
					break
				}
				scope := acquiredCallableScope{}
				if v.acquired != nil {
					scope = query.copyCallableScope(v.acquired.scope, &acquired)
				} else if v.normal != nil {
					var ok bool
					scope, ok = query.normalValueScope(v, &acquired)
					if !ok {
						continue
					}
				} else {
					scope = query.acquireCallableScope(bindings, &acquired)
				}
				observed.values = append(observed.values, sourceObservedValue{value: v, inputs: inputs, scope: scope})
			}
			observed.incomplete = acquired.valueIncomplete || len(observed.values) == 0
			mergeAccessorCandidates(result, acquired)
		}
	}
	root.consumedWrites = append(root.consumedWrites, sourceConsumedLexicalWrite{cell: cell, symbol: symbol, operation: operation, call: inputs.consumedCall, observed: observed})
}

func (query *sourceValueQuery) consumedCellMatches(write sourceConsumedLexicalWrite, symbol *ast.Symbol, entry []sourceValue, inputs *sourceValueInputs, result *accessorCandidates) bool {
	if write.symbol != symbol || write.call == nil || !write.call.entered || write.call.inputs == nil || write.call.operation == nil || !ast.IsCallExpression(write.call.operation) {
		return false
	}
	if cell, ok := inputs.cells[ast.GetSymbolId(symbol)]; ok && cell.symbol == symbol && cell.frame == write.cell {
		return query.charge(result, write.operation)
	}
	for _, v := range entry {
		if !query.charge(result, v.node) {
			return false
		}
		if v.normal != nil && v.normal.symbol == symbol && normalInputOwned(v.normal, inputs) && v.normal.observed.inputs == write.cell {
			return true
		}
	}
	return false
}

// consumedWriteValues projects original alternatives/scopes plus incompleteness.
// It does not replace an earlier binding or imply normal operation completion.
func (query *sourceValueQuery) consumedWriteValues(symbol *ast.Symbol, entry []sourceValue, result *accessorCandidates) []sourceValue {
	root := consumedWriteRoot(query.inputs)
	if root == nil {
		return nil
	}
	var values []sourceValue
	for _, write := range root.consumedWrites {
		if !query.charge(result, write.operation) {
			break
		}
		if !query.consumedCellMatches(write, symbol, entry, query.inputs, result) {
			continue
		}
		for _, original := range write.observed.values {
			if !query.charge(result, write.operation) {
				break
			}
			observed := original
			observed.scope = query.copyCallableScope(original.scope, result)
			value := observed.value
			if value.acquired == nil {
				value.normal = nil
				value.acquired = &observed
			}
			values = append(values, value)
		}
		if write.observed.incomplete || len(write.observed.values) == 0 {
			result.valueIncomplete = true
			values = append(values, sourceValue{})
		}
	}
	return values
}

// assignmentWriteAdmitted shares ordinary reachability and installed default
// admission for both write producer routes. Uncertain reachable writes remain MAY.
func (query *sourceValueQuery) assignmentWriteAdmitted(node *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs, result *accessorCandidates) bool {
	if inputs == nil {
		return false
	}
	if defaults, owned := query.defaultInput(inputs, node, result); owned && defaults.bindings == nil {
		return false
	}
	possible, _ := query.reachable(node, bindings)
	return possible
}

// unambiguousLexicalCell refuses repeated block/iteration environments that the
// existing invocation frame cannot distinguish. This does not erase effects.
func (query *sourceValueQuery) unambiguousLexicalCell(site, owner *ast.Node, result *accessorCandidates) bool {
	for n := site; n != nil && n != owner; n = n.Parent {
		if !query.charge(result, n) {
			return false
		}
		if ast.IsIterationStatement(n, false) {
			result.opaque = true
			return false
		}
	}
	return true
}

// produceLexicalCell is called only by the actual postorder declaration consumer.
// It records identity/admission, never an initializer value or completed slot.
func (query *sourceValueQuery) produceLexicalCell(site, owner *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs, result *accessorCandidates) {
	if site == nil || !ast.IsVariableDeclaration(site) || site.Initializer() == nil || !ast.IsIdentifier(site.Name()) || inputs == nil || inputs.declaration != owner {
		return
	}
	if !query.unambiguousLexicalCell(site, owner, result) {
		return
	}
	if !query.assignmentWriteAdmitted(site, bindings, inputs, result) {
		return
	}
	symbol := normalBindingSymbol(site.Name(), owner, inputs, query.owner.checker)
	if symbol == nil {
		return
	}
	if inputs.cells == nil {
		inputs.cells = make(map[ast.SymbolId]sourceLexicalCell)
	}
	inputs.cells[ast.GetSymbolId(symbol)] = sourceLexicalCell{frame: inputs, symbol: symbol, producer: site, conditional: true}
}

// captureLexicalCell selects an already consumed producer under the callee's
// existing ordinary/selected owner guard. Read precision remains independent.
func (query *sourceValueQuery) captureLexicalCell(inputs, parent *sourceValueInputs, symbol *ast.Symbol, at *ast.Node, result *accessorCandidates) {
	cell, exists := parent.cells[ast.GetSymbolId(symbol)]
	if !exists || cell.symbol != symbol || cell.frame == nil || cell.producer == nil {
		return
	}
	if !query.charge(result, cell.producer) {
		return
	}
	if cell.frame == parent && !query.normalOperandPrecedes(sourceNormalBinding{owner: parent.declaration, site: cell.producer, symbol: symbol}, at, parent.bindings) {
		return
	}
	if inputs.cells == nil {
		inputs.cells = make(map[ast.SymbolId]sourceLexicalCell)
	}
	inputs.cells[ast.GetSymbolId(symbol)] = cell
}
