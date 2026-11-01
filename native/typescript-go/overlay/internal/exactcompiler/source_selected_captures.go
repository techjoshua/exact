package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// selectedNormalCaptureOwner validates an already selected returned observation.
// Lexical identity limits projection but supplies no value or completion proof.
// The original owner and its return occurrence must belong to this observation.
func selectedNormalCaptureOwner(inputs *sourceValueInputs, selected *sourceObservedValue) *sourceValueInputs {
	if selected == nil || selected.inputs == nil || selected.value.node != inputs.declaration || len(selected.value.path) != 0 || inputs.invocation == nil || selected.scope.creators == nil {
		return nil
	}
	parent := selected.inputs
	if parent.declaration != enclosingCallableNode(inputs.declaration) {
		return nil
	}
	returned := selected.scope.creators[parent.declaration].returning
	if returned == nil || enclosingCallableNode(returned) != parent.declaration {
		return nil
	}
	return parent
}

// installSelectedNormalCaptures projects conditional lexical slots from this
// selected original result. It never borrows the current caller's completed map.
// The projection is construction-local, charged, and keeps known/unknown pairs.
// Live reads retain their ordinary writer joins under the original creator scope.
func (query *sourceValueQuery) installSelectedNormalCaptures(inputs *sourceValueInputs, selected *sourceObservedValue, result *accessorCandidates) {
	parent := selectedNormalCaptureOwner(inputs, selected)
	if parent == nil || len(parent.completed) == 0 && len(parent.cells) == 0 {
		return
	}
	async, ordinary := ordinaryResultCategory(inputs.declaration)
	if !ordinary || async {
		return
	}
	index := query.owner.index(ast.GetSourceFileOfNode(inputs.declaration))
	if index.incomplete {
		result.opaque = true
		return
	}
	region := index.operationRegions[inputs.declaration]
	if region == nil {
		return
	}
	previousInputs, previousCreators := query.inputs, query.creators
	query.inputs, query.creators = parent, selected.scope.creators
	defer func() { query.inputs, query.creators = previousInputs, previousCreators }()
	returned := selected.scope.creators[parent.declaration].returning
	projected := make(map[ast.SymbolId]bool)
	for _, reference := range region.references {
		if !query.charge(result, reference) {
			return
		}
		symbol := query.owner.checker.GetSymbolAtLocation(reference)
		if symbol == nil {
			continue
		}
		id := ast.GetSymbolId(symbol)
		if !projected[id] {
			query.captureLexicalCell(inputs, parent, symbol, returned, result)
		}
		entry, exists := parent.completed[id]
		if !exists || projected[id] || entry.owner != parent.declaration || entry.symbol != symbol || enclosingCallableNode(symbol.ValueDeclaration) != parent.declaration || !query.normalOperandPrecedes(entry, returned, parent.bindings) {
			continue
		}
		projected[id] = true
		installLexicalCell(inputs, parent, symbol)
		values := query.normalBindingValues(entry, result)
		for position, value := range values {
			if value.normal != nil {
				installed := *value.normal
				installed.installed, installed.selected = inputs, selected
				values[position].normal = &installed
			}
		}
		inputs.bindings[id] = values
	}
}
