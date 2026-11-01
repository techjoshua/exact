package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type sourceNativeKind uint8

const (
	sourceNativeGlobalObject sourceNativeKind = iota + 1
	sourceNativePromiseConstructor
	sourceNativePromiseResolve
	sourceNativePromisePrototype
	sourceNativePromiseFacade
	sourceNativeAsyncFacade
	sourceNativePromiseThen
	sourceNativeObjectConstructor
	sourceNativeReflectObject
	sourceNativeObjectDefineProperty
	sourceNativeReflectDefineProperty
	sourceNativeFunctionConstructor
	sourceNativeFunctionPrototype
	sourceNativeObjectFreeze
	sourceNativePossibleProxyConstructor
)

// sourceNativeValue is one trusted standard-entry alternative. The declaration
// names its builtin contract, while acquired retains its original read boundary.
// It is not a type brand, immutable property premise or global native registry.
type sourceNativeValue struct {
	// async identifies a language-created facade from one actual selected call.
	// It is detached result storage, not a current global Promise lookup.
	async    *sourceInvocationResult
	resolve  *sourceNativeInvocation
	kind     sourceNativeKind
	acquired *ast.Node
	// Missing may-reference metadata is not an executed effect. It still
	// withholds native result identity/absence and private transfer authority.
	referencesIncomplete bool
}

func (query *sourceValueQuery) nativeEntryRoot(root *ast.Node, path []string) (*ast.Symbol, sourceNativeKind) {
	symbol := query.owner.checker.GetSymbolAtLocation(root)
	for _, entry := range []struct {
		name string
		kind sourceNativeKind
	}{{"Promise", sourceNativePromiseConstructor}, {"Object", sourceNativeObjectConstructor}, {"Reflect", sourceNativeReflectObject}, {"Function", sourceNativeFunctionConstructor}, {"Proxy", sourceNativePossibleProxyConstructor}} {
		global := query.owner.checker.GetGlobalSymbol(entry.name, ast.SymbolFlagsValue, nil)
		if global == nil || global.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
			continue
		}
		direct := symbol != nil && symbol.ValueDeclaration == global.ValueDeclaration
		fromGlobal := symbol != nil && symbol == query.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) && len(path) > 0 && path[0] == global.Name
		offset := 0
		if fromGlobal {
			offset = 1
		}
		if (direct || fromGlobal) && (entry.kind == sourceNativePossibleProxyConstructor || entry.kind == sourceNativePromiseConstructor || len(path) > offset && (entry.kind == sourceNativeFunctionConstructor && path[offset] == "prototype" || entry.kind != sourceNativeFunctionConstructor && (path[offset] == "defineProperty" || entry.kind == sourceNativeObjectConstructor && path[offset] == "freeze"))) {
			return global, entry.kind
		}
	}
	return nil, 0
}
func (query *sourceValueQuery) nativeRootDeclaration(node *ast.Node) (*ast.Symbol, sourceNativeKind) {
	for _, entry := range []struct {
		name string
		kind sourceNativeKind
	}{{"Promise", sourceNativePromiseConstructor}, {"Object", sourceNativeObjectConstructor}, {"Reflect", sourceNativeReflectObject}, {"Function", sourceNativeFunctionConstructor}, {"Proxy", sourceNativePossibleProxyConstructor}} {
		global := query.owner.checker.GetGlobalSymbol(entry.name, ast.SymbolFlagsValue, nil)
		if global != nil && global.ValueDeclaration == node && standardLibrarySource(ast.GetSourceFileOfNode(node)) {
			return global, entry.kind
		}
	}
	return nil, 0
}

// nativePromiseEntry seeds only the binder-owned standard global. Local shadows
// follow their actual initializer instead. liveValues owns source assignments to
// that binding before aliases or member selection consume the seed.
func (query *sourceValueQuery) nativePromiseEntry(node, root *ast.Node, path []string) (*sourceValue, []string) {
	// Bare values keep ordinary acquisition, except the possible Proxy
	// constructor seed consumed by the original New effect-origin owner.
	// That seed still passes current binding/member-write selection.
	if root == nil {
		return nil, nil
	}
	global, kind := query.nativeEntryRoot(root, path)
	if global == nil || len(path) == 0 && kind != sourceNativePossibleProxyConstructor {
		return nil, nil
	}
	if symbol := query.owner.checker.GetSymbolAtLocation(root); symbol != nil && symbol == query.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) {
		if path[0] != global.Name {
			return nil, nil
		}
		return &sourceValue{node: global.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeGlobalObject, acquired: root}}, path
	}
	symbol := query.owner.checker.GetSymbolAtLocation(root)
	if symbol == nil || symbol.ValueDeclaration != global.ValueDeclaration {
		return nil, nil
	}
	return &sourceValue{node: symbol.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: root}}, path
}

func (query *sourceValueQuery) nativeMemberSeed(value sourceValue, key string, symbol *ast.Symbol, result *accessorCandidates) (*ast.Node, sourceValue, bool) {
	if value.native.kind == sourceNativeGlobalObject {
		global, kind := query.nativeRootDeclaration(value.node)
		if global != nil && key == global.Name {
			return value.node, sourceValue{node: global.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: value.native.acquired}}, true
		}
		result.opaque = true
		return nil, sourceValue{}, false
	}
	if value.native.kind == sourceNativeObjectConstructor || value.native.kind == sourceNativeReflectObject {
		global, _ := query.nativeRootDeclaration(value.node)
		if global != nil {
			memberName := "defineProperty"
			if value.native.kind == sourceNativeObjectConstructor && key == "freeze" {
				memberName = "freeze"
			}
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), memberName)
			if member != nil && key == member.Name && member.ValueDeclaration != nil {
				kind := sourceNativeObjectDefineProperty
				if memberName == "freeze" {
					kind = sourceNativeObjectFreeze
				}
				if value.native.kind == sourceNativeReflectObject {
					kind = sourceNativeReflectDefineProperty
				}
				return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: value.native.acquired}}, true
			}
		}
		result.opaque = true
		return nil, sourceValue{}, false
	}
	if value.native.kind == sourceNativeFunctionConstructor {
		global, kind := query.nativeRootDeclaration(value.node)
		if global != nil && kind == sourceNativeFunctionConstructor && key == "prototype" {
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
			if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
				// The declaration identifies the standard slot contract. The native
				// alternative carries this actual acquisition, not a declared value.
				return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeFunctionPrototype, acquired: value.native.acquired}}, true
			}
		}
		result.opaque = true
		return nil, sourceValue{}, false
	}
	return query.nativePromiseMemberSeed(value, key, symbol, result)
}

// nativeReceiverMatches compares an already acquired ordinary origin with the
// selected standard entry. Bare globals retain their normal origin representation.
// Unknown and authored replacement alternatives cannot acquire this identity.
func (query *sourceValueQuery) nativeReceiverMatches(value, selected sourceValue) bool {
	if selected.native == nil || value.node == nil {
		return false
	}
	if value.native != nil {
		// Origins may retain a demanded projection. Matching that possible
		// receiver does not complete the Get or discharge its uncertainty.
		if value.native.kind == sourceNativePromiseConstructor && selected.native.kind == sourceNativePromisePrototype && len(value.path) == 1 && value.path[0] == "prototype" {
			return true
		}
		if value.native.kind == sourceNativeFunctionConstructor && selected.native.kind == sourceNativeFunctionPrototype && len(value.path) == 1 && value.path[0] == "prototype" {
			return true
		}
		return len(value.path) == 0 && value.native.kind == selected.native.kind && (selected.native.kind != sourceNativeAsyncFacade || value.native.async == selected.native.async)
	}
	symbol := query.owner.checker.GetSymbolAtLocation(value.node)
	if symbol == nil {
		return false
	}
	if symbol == query.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) {
		return len(value.path) == 0 && selected.native.kind == sourceNativeGlobalObject
	}
	_, rootKind := query.nativeRootDeclaration(symbol.ValueDeclaration)
	if rootKind == 0 {
		return false
	}
	if rootKind == sourceNativeFunctionConstructor && len(value.path) == 1 && value.path[0] == "prototype" {
		return selected.native.kind == sourceNativeFunctionPrototype
	}
	if rootKind != sourceNativePromiseConstructor {
		return len(value.path) == 0 && selected.native.kind == rootKind
	}
	if len(value.path) == 0 {
		return selected.native.kind == sourceNativePromiseConstructor
	}
	prototype := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(symbol), "prototype")
	return prototype != nil && len(value.path) == 1 && value.path[0] == prototype.Name && selected.native.kind == sourceNativePromisePrototype
}

// nativeMember adds the standard data slot beside the same member/write and
// descriptor alternatives used for source objects. Alias origins are already
// acquired before this operation. No opaque/reflected alternative is discarded.
// A source visitor preserves captured alternatives. Normal callers keep their
// existing raw-node visitor and cannot borrow source capture as operation proof.
func (query *sourceValueQuery) nativeMember(value sourceValue, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), sourceVisits ...func(sourceValue)) {
	query.nativeMemberKey(value, projection, name, nil, mode, bindings, result, visit, sourceVisits...)
}

func (query *sourceValueQuery) nativeMemberKey(value sourceValue, projection []string, name string, symbol *ast.Symbol, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), sourceVisits ...func(sourceValue)) {
	path := append(append([]string{}, value.path...), projection...)
	if len(path) == 0 && name == "" {
		if mode == accessorAcquire {
			result.values = append(result.values, value)
		}
		return
	}
	key := name
	if len(path) == 1 && name == "" {
		key = path[0]
	} else if len(path) != 0 {
		result.opaque = true
		return
	}
	origin, seed, ok := query.nativeMemberSeed(value, key, symbol, result)
	if !ok {
		return
	}
	previous := query.reading
	if query.reading == nil && query.operation != nil {
		query.reading = query.operation.node
	}
	if query.reading == nil {
		query.reading = value.native.acquired
	}
	defer func() { query.reading = previous }()
	sources, referencesIncomplete := query.nativeSelectionSources(origin, result)
	seed.native.referencesIncomplete = value.native.referencesIncomplete || referencesIncomplete
	lookup := value
	if value.native.kind == sourceNativePromiseFacade || value.native.kind == sourceNativeAsyncFacade {
		contract := *value.native
		contract.kind = sourceNativePromisePrototype
		lookup.node, lookup.native = origin, &contract
	}
	get := &sourceGetInputs{operation: query.reading, receiver: value, lookupOwner: &lookup, symbol: symbol}
	if value.native.kind == sourceNativeAsyncFacade || value.native.kind == sourceNativePromiseFacade {
		v := query.propertyView()
		// This actual Get may retain known descriptors even when absence and
		// constructor closure are unavailable. Unknown is not a named effect.
		if v == nil || v.state != sourcePropertyComplete || !v.produced || v.incomplete {
			result.opaque = true
		}
	}
	visitMember := func(value sourceValue) { visit(value.node, value.path, false) }
	if query.dependenciesOnly && len(sourceVisits) == 1 {
		visitMember = sourceVisits[0]
	}
	replaced := query.memberValuesAtGet(origin, []string{key}, "", mode, bindings, result, visitMember, sourceMemberOperationProof{sources: sources}, get)
	// Delete/computed writes have no assignment RHS. Retain them explicitly at
	// this same owned source view rather than treating an empty RHS list as safe.
	for _, index := range query.occurrenceSourceViewIn(origin, result, sources) {
		for _, region := range index.operationRegions {
			for _, written := range region.writes {
				if !query.charge(result, written) {
					return
				}
				// Binding writes are liveValues alternatives, not member targets.
				if !ast.IsPropertyAccessExpression(written) && !ast.IsElementAccessExpression(written) {
					continue
				}
				receiver, writtenKey := accessorReceiver(written)
				if receiver == nil || writtenKey != "" && writtenKey != key {
					continue
				}
				// Finite plain assignments already belong to memberValuesAtGet.
				// This inventory retains delete/computed/compound routes.
				if writtenKey != "" && written.Parent != nil && ast.IsBinaryExpression(written.Parent) && written.Parent.AsBinaryExpression().Left == written && written.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					continue
				}
				temporary := accessorCandidates{}
				candidates := query.occurrenceOrigins(receiver, written, origin, bindings, &temporary)
				unresolved := len(candidates) == 0 || temporary.opaque || temporary.valueIncomplete || temporary.receiverIncomplete
				for _, candidate := range candidates {
					if query.nativeReceiverMatches(candidate, lookup) {
						result.opaque = true
					}
					finiteOther := candidate.node != nil && len(candidate.path) == 0 && (ast.IsObjectLiteralExpression(candidate.node) || ast.IsArrayLiteralExpression(candidate.node) || ast.IsFunctionExpression(candidate.node) || ast.IsArrowFunction(candidate.node))
					if candidate.native != nil {
						finiteOther = candidate.native.kind != value.native.kind
					}
					unresolved = unresolved || candidate.node != origin && !finiteOther
				}
				if unresolved {
					result.opaque = true
				}
			}
		}
	}
	if kind := standardNativeDataSlot(value, key); kind != 0 && mode == accessorAcquire {
		verdict := sourceWriteTop
		if !replaced && !result.opaque && !result.ownOperation && !seed.native.referencesIncomplete && query.normalDescriptorSources(sources, value.native.acquired, result) {
			verdict = sourceWriteNoWrites
		}
		if verdict != sourceWriteNoWrites {
			admitted := query.currentArgumentPrefix() != nil
			if query.operation != nil {
				if slot := query.normalOperation(query.operation.node, false); slot != nil && slot.entry != nil && slot.entry.region == nil && slot.prefixView != nil {
					admitted = true
				}
			}
			if admitted {
				result.opaque = true
				result.valueIncomplete = true
			}
		}
		result.nativeDescriptorEffects = append(result.nativeDescriptorEffects, sourceNativeDescriptorEffect{acquired: value.native.acquired, kind: kind, verdict: verdict})
	}
	if !replaced && mode == accessorAcquire {
		result.values = append(result.values, seed)
	}
}
