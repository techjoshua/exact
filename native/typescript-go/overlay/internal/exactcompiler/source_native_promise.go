package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func (query *sourceValueQuery) nativePromiseDeclaration(node *ast.Node) bool {
	global := query.owner.checker.GetGlobalSymbol("Promise", ast.SymbolFlagsValue, nil)
	return global != nil && node != nil && node == global.ValueDeclaration && standardLibrarySource(ast.GetSourceFileOfNode(node))
}

func (query *sourceValueQuery) nativePromiseMemberSeed(value sourceValue, key string, symbol *ast.Symbol, result *accessorCandidates) (*ast.Node, sourceValue, bool) {
	global := query.owner.checker.GetGlobalSymbol("Promise", ast.SymbolFlagsValue, nil)
	if global == nil {
		result.opaque = true
		return nil, sourceValue{}, false
	}
	contract := query.owner.checker.GetTypeOfSymbol(global)
	resolve := query.owner.checker.GetPropertyOfType(contract, "resolve")
	prototype := query.owner.checker.GetPropertyOfType(contract, "prototype")
	if resolve == nil || prototype == nil {
		result.opaque = true
		return nil, sourceValue{}, false
	}
	origin := value.node
	var seed sourceValue
	switch value.native.kind {
	case sourceNativePromiseConstructor:
		species, speciesSymbol := query.nativeSpeciesKey(result)
		if symbol != nil && symbol == speciesSymbol && species != "" && key == species {
			// The actual well-known symbol's standard accessor returns its receiver.
			// This seed remains beside authored replacements and descriptor Gets below.
			seed = value
			contract := *value.native
			seed.native = &contract
		} else if key == resolve.Name {
			seed = sourceValue{node: resolve.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativePromiseResolve, acquired: value.native.acquired}}
		} else if key == prototype.Name {
			seed = sourceValue{node: prototype.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativePromisePrototype, acquired: value.native.acquired}}
		} else {
			result.opaque = true
			return nil, sourceValue{}, false
		}
	case sourceNativePromisePrototype, sourceNativePromiseFacade, sourceNativeAsyncFacade:
		if key == "then" {
			then := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(prototype), "then")
			if then == nil || then.ValueDeclaration == nil {
				result.opaque = true
				return nil, sourceValue{}, false
			}
			origin = prototype.ValueDeclaration
			seed = sourceValue{node: then.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativePromiseThen, acquired: value.native.acquired}}
		} else if key == "constructor" {
			origin = prototype.ValueDeclaration
			seed = sourceValue{node: global.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativePromiseConstructor, acquired: value.native.acquired}}
		} else {
			result.opaque = true
			return nil, sourceValue{}, false
		}
	default:
		result.opaque = true
		return nil, sourceValue{}, false
	}
	return origin, seed, true
}

// sourceNativeInvocation belongs to one normal operation and installed scope.
// Values are actual inputs, not raw call results. Only a successful-await consumer
// may later request fulfillment, and unresolved alternatives stay incomplete.
type sourceNativeInvocation struct {
	// Actual caller frame, never read to borrow another activation.
	frame                *sourceValueInputs
	operation, owner     *ast.Node
	values               []sourceValue
	scope                acquiredCallableScope
	incomplete           bool
	referencesIncomplete bool
	observed             sourceResultObservation
	privateInput         bool
	// scalarInput belongs to the original authored actual expression, not its
	// acquired receiver origin or a Promise-shaped result type.
	scalarInput bool
	actual      *ast.Node
}

func (query *sourceValueQuery) acquireNativeInputs(node *ast.Node, value sourceValue, bindings sourceValueBindings, exclusive bool, result *accessorCandidates) *sourceNativeInvocation {
	receipt := &sourceNativeInvocation{operation: node, frame: query.inputs, scope: query.acquireCallableScope(bindings, result), incomplete: !exclusive, referencesIncomplete: value.native != nil && value.native.referencesIncomplete}
	if query.operation == nil {
		receipt.incomplete = true
	} else {
		receipt.owner = query.operation.owner
	}
	call := node.AsCallExpression()
	plan := planOrdinaryInvocation(call.Expression, restrictedInvocationArguments(call), query.owner.checker, func(node *ast.Node) bool { return query.charge(result, node) })
	query.materializeInvocationVectors(node, plan, bindings, result)
	// Unclaimed adapter forms keep normal acquisition effects and explicit unknown.
	// They cannot borrow a method's historical receiver as the actual this input.
	if plan.adapted {
		receipt.incomplete = true
	}
	receiver, _ := restrictedInvocationMember(call.Expression, query.owner.checker)
	if receiver == nil {
		receipt.incomplete = true
	} else {
		actual := query.originsAt(receiver, node, bindings, result)
		if len(actual) == 0 {
			receipt.incomplete = true
		}
		for _, term := range actual {
			if term.native != nil {
				receipt.referencesIncomplete = receipt.referencesIncomplete || term.native.referencesIncomplete
			}
			if !query.nativeReceiverMatches(term, sourceValue{native: &sourceNativeValue{kind: sourceNativePromiseConstructor}}) {
				receipt.incomplete = true
			}
		}
	}
	for i, argument := range plan.actuals {
		if !query.charge(result, argument) {
			receipt.incomplete = true
			break
		}
		if ast.IsSpreadElement(argument) {
			receipt.incomplete = true
		}
		terms := query.originsAt(argument, query.boundInputAcquisition(argument, node), bindings, result)
		if i == 0 {
			receipt.actual = argument
			receipt.scalarInput = !ast.IsSpreadElement(argument) && query.primitiveSettlementValue(argument)
			receipt.values = append(receipt.values, terms...)
		}
	}
	if len(plan.actuals) == 0 {
		receipt.scalarInput = true
		receipt.values = []sourceValue{{undefined: true}}
	}
	if plan.actuals == nil && call.Arguments == nil {
		receipt.incomplete = true
	}
	if value.native == nil || value.native.kind != sourceNativePromiseResolve {
		receipt.incomplete = true
	}
	return receipt
}

// nativeSelectionSources follows the already selected eager dependency edges.
// It reuses the indexed runtime imports and existing dependency producer. Missing
// source and exhaustion remain incomplete, never a trusted empty module world.
func (query *sourceValueQuery) nativeSelectionSources(origin *ast.Node, result *accessorCandidates) ([]*ast.SourceFile, bool) {
	referencesIncomplete := false
	var sources []*ast.SourceFile
	seen := make(map[*ast.SourceFile]bool)
	var visit func(*ast.SourceFile)
	visit = func(source *ast.SourceFile) {
		if source == nil || seen[source] || standardLibrarySource(source) {
			return
		}
		if !query.charge(result, source.AsNode()) {
			return
		}
		seen[source] = true
		sources = append(sources, source)
		index := query.owner.index(source)
		if index.incomplete {
			referencesIncomplete = true
			return
		}
		for _, edge := range index.runtimeImports {
			dependency, state := query.operationDependencyState(edge, result)
			if view := query.propertyView(); view != nil && view.normalSelectionDone {
				matched := false
				for _, selected := range view.edges {
					if !query.charge(result, edge) {
						referencesIncomplete = true
						return
					}
					if selected.edge == edge {
						matched = selected.source == dependency && selected.state == state
						if state == sourceDependencyAvailable {
							matched = matched && selected.target != nil && selected.target == view.normalSources[dependency]
						}
						break
					}
				}
				referencesIncomplete = referencesIncomplete || !matched
			}
			switch state {
			case sourceDependencyErased:
				continue
			case sourceDependencyAvailable:
				visit(dependency)
			case sourceDependencyReferencesUnavailable:
				referencesIncomplete = true
			case sourceDependencyExecutableUnavailable:
				result.opaque = true
			}
		}
	}
	for _, node := range []*ast.Node{origin, query.initializing, query.reading, query.returning} {
		if node != nil {
			visit(ast.GetSourceFileOfNode(node))
		}
	}
	return sources, referencesIncomplete
}

// nativeEntryValues acquires the actual global property before selecting a
// constructor member. Reflection on globalThis.Promise and aliases shares the
// same descriptor/write owner as Promise.resolve. Unknown alternatives survive.
func (query *sourceValueQuery) nativeEntryValues(value sourceValue, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	if value.native.kind == sourceNativeGlobalObject {
		return []sourceValue{value}
	}
	// Reentrant provenance cannot certify a native entry. Retain its possible
	// standard alternative beside incompleteness under the existing active guard.
	at := value.native.acquired
	if query.active[at] {
		result.opaque = true
		return []sourceValue{value}
	}
	previous, present := query.active[at]
	query.active[at] = true
	defer func() {
		if present {
			query.active[at] = previous
		} else {
			delete(query.active, at)
		}
	}()
	global := value
	global.native = &sourceNativeValue{kind: sourceNativeGlobalObject, acquired: value.native.acquired, referencesIncomplete: value.native.referencesIncomplete}
	acquired := accessorCandidates{}
	// Entry acquisition observes the original binding read. A later member Get
	// keeps its own boundary instead of freezing mutable slots at alias creation.
	previousReading := query.reading
	query.reading = value.native.acquired
	defer func() { query.reading = previousReading }()
	root, _ := query.nativeRootDeclaration(value.node)
	if root == nil {
		result.opaque = true
		return nil
	}
	query.nativeMember(global, nil, root.Name, accessorAcquire, bindings, &acquired, func(node *ast.Node, path []string, instance bool) {
		other := query.accessors(node, path, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(&acquired, other)
		for index, term := range other.values {
			if scope, exists := other.callableScopes[index]; exists {
				if acquired.callableScopes == nil {
					acquired.callableScopes = make(map[int]acquiredCallableScope)
				}
				acquired.callableScopes[len(acquired.values)] = scope
			}
			acquired.values = append(acquired.values, term)
		}
	})
	mergeAccessorCandidates(result, acquired)
	return acquired.values
}

// nativeSpeciesKey obtains the checker's real unique-symbol key, not the string
// "species". It anchors the trusted language contract only. Source key/receiver
// acquisition and relevant computed/reflective writes remain with memberValuesAtGet.
func (query *sourceValueQuery) nativeSpeciesKey(result *accessorCandidates) (string, *ast.Symbol) {
	return query.nativeWellKnownKey("species", result)
}

func (query *sourceValueQuery) nativeWellKnownKey(name string, result *accessorCandidates) (string, *ast.Symbol) {
	symbol := query.owner.checker.GetGlobalSymbol("Symbol", ast.SymbolFlagsValue, nil)
	if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) || !query.charge(result, symbol.ValueDeclaration) {
		return "", nil
	}
	species := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(symbol), name)
	if species == nil || species.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(species.ValueDeclaration)) {
		return "", nil
	}
	value := query.owner.checker.GetTypeOfSymbol(species)
	if value == nil || value.Flags()&checker.TypeFlagsUniqueESSymbol == 0 {
		return "", nil
	}
	return checker.GetPropertyNameFromType(value), species
}
