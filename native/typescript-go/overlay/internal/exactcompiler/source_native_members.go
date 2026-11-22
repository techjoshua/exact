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
	sourceNativeArrayPush
	sourceNativeWeakMapConstructor
	sourceNativeWeakMapSourceInstance
	sourceNativeWeakMapGetEffect
	sourceNativeWeakMapSetEffect
	sourceNativeSymbolConstructorExposure
	sourceNativeSymbolForExposure
	sourceNativeObjectCreateExposure
	sourceNativeObjectPrototype                // Original standard constructor slot, not ordinary member integrity.
	sourceNativeObjectCreate                   // Scoped one-argument source algorithm, not exposure-only evidence.
	sourceNativeObjectDefineProperties         // Ordered map algorithm category, not strong descriptor conversion.
	sourceNativeSymbolConstructor              // Scoped original Symbol algorithm selection, distinct from exposure probing.
	sourceNativeSymbolFor                      // Conditional standard algorithm, not primitive/result readiness.
	sourceNativeDefaultHasInstance             // Conditional original Function.prototype protocol, never output.
	sourceNativeWeakMapPrototype               // Original standard prototype slot Effects, not instance/result identity.
	sourceNativeObjectGetOwnPropertyDescriptor // Selected Object retrieval, not a raw descriptor/result object.
	sourceNativeReflectGet                     // Selected property read, without a normal output receipt.
	sourceNativeObjectAssign                   // Selected original copy target, scoped to reflective writer source projection.
	sourceNativeReflectApply                   // Selected callback adapter for source effects only.
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

// standardNativeLookup identifies a lookup on an established standard container,
// not an ordinary receiver that happens to inherit a standard method. Unknown
// implementation corruption of that container is outside the builtin contract.
// Instance/facade own writes still require the ordinary pending-write path.
// This distinction supplies no own-write closure or descriptor/result authority.
func standardNativeLookup(get *sourceGetInputs) bool {
	if get == nil || get.receiver.native == nil {
		return false
	}
	if get.receiver.native.kind == sourceNativeWeakMapConstructor && get.operation != nil && ast.IsBinaryExpression(get.operation) && get.operation.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword {
		return true // This original operator owns its checker-keyed method and prototype Gets.
	}
	if get.constructionEffects != nil && get.constructionEffects.live(get) {
		return true // Effects-only prototype Get of this original selected New.
	}
	switch get.receiver.native.kind {
	case sourceNativeGlobalObject, sourceNativePromiseConstructor,
		sourceNativePromisePrototype, sourceNativeObjectConstructor,
		sourceNativeReflectObject, sourceNativeSymbolConstructor, sourceNativeFunctionConstructor,
		sourceNativeFunctionPrototype:
		return true
	}
	return false
}

func (query *sourceValueQuery) nativeEntryRoot(symbol *ast.Symbol, fromGlobal bool, path []string) (*ast.Symbol, sourceNativeKind) {
	if fromGlobal {
		if len(path) == 0 {
			return nil, 0
		}
	} else if symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return nil, 0
	}
	for _, entry := range []struct {
		name string
		kind sourceNativeKind
	}{{"Promise", sourceNativePromiseConstructor}, {"Object", sourceNativeObjectConstructor}, {"Reflect", sourceNativeReflectObject}, {"Function", sourceNativeFunctionConstructor}, {"Proxy", sourceNativePossibleProxyConstructor}, {"WeakMap", sourceNativeWeakMapConstructor}, {"Symbol", sourceNativeSymbolConstructorExposure}, {"Symbol", sourceNativeSymbolConstructor}} {
		if entry.kind == sourceNativeSymbolConstructor && !query.stagedSymbolAcquisition() {
			continue
		}
		if entry.kind == sourceNativeSymbolConstructorExposure && !query.probingDirectExposure {
			continue
		}
		if fromGlobal && entry.name != path[0] {
			continue
		}
		global := query.owner.checker.GetGlobalSymbol(entry.name, ast.SymbolFlagsValue, nil)
		if global == nil || global.ValueDeclaration == nil {
			continue
		}
		if !fromGlobal && symbol.ValueDeclaration != global.ValueDeclaration {
			continue
		}
		if fromGlobal && !standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) {
			continue
		}
		offset := 0
		if fromGlobal {
			offset = 1
		}
		if query.probingDirectExposure && len(path) > offset && ((entry.kind == sourceNativeObjectConstructor && path[offset] == "create") || (entry.kind == sourceNativeSymbolConstructorExposure && path[offset] == "for")) {
			return global, entry.kind
		}
		if entry.kind == sourceNativeSymbolConstructor && len(path) == offset+1 && path[offset] == "for" {
			return global, entry.kind
		}
		if entry.kind == sourceNativeSymbolConstructorExposure || entry.kind == sourceNativeSymbolConstructor {
			continue
		}
		if entry.kind == sourceNativeObjectConstructor && len(path) == offset+1 && query.reflectiveCopyMember(path[offset]) {
			return global, entry.kind
		}
		if entry.kind == sourceNativeReflectObject && len(path) > offset && (path[offset] == "get" || query.dependenciesOnly && path[offset] == "apply") {
			return global, entry.kind
		}
		if entry.kind == sourceNativePossibleProxyConstructor || entry.kind == sourceNativeWeakMapConstructor || entry.kind == sourceNativePromiseConstructor || len(path) > offset && (entry.kind == sourceNativeFunctionConstructor && path[offset] == "prototype" || entry.kind != sourceNativeFunctionConstructor && (path[offset] == "defineProperty" || entry.kind == sourceNativeObjectConstructor && (path[offset] == "freeze" || path[offset] == "defineProperties" || path[offset] == "getOwnPropertyDescriptor" || query.stagedCreateAcquisition() && path[offset] == "create" || query.stagedTargetAcquisition() && path[offset] == "prototype" && len(path) == offset+1))) {
			return global, entry.kind
		}
	}
	return nil, 0
}
func (query *sourceValueQuery) nativeRootDeclaration(node *ast.Node) (*ast.Symbol, sourceNativeKind) {
	if node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(node)) {
		return nil, 0
	}
	for _, entry := range []struct {
		name string
		kind sourceNativeKind
	}{{"Promise", sourceNativePromiseConstructor}, {"Object", sourceNativeObjectConstructor}, {"Reflect", sourceNativeReflectObject}, {"Function", sourceNativeFunctionConstructor}, {"Proxy", sourceNativePossibleProxyConstructor}, {"WeakMap", sourceNativeWeakMapConstructor}, {"Symbol", sourceNativeSymbolConstructorExposure}, {"Symbol", sourceNativeSymbolConstructor}} {
		if entry.kind == sourceNativeSymbolConstructor && !query.stagedSymbolAcquisition() {
			continue
		}
		if entry.kind == sourceNativeSymbolConstructorExposure && !query.probingDirectExposure {
			continue
		}
		global := query.owner.checker.GetGlobalSymbol(entry.name, ast.SymbolFlagsValue, nil)
		if global != nil && global.ValueDeclaration == node {
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
	symbol := query.owner.checker.GetSymbolAtLocation(root)
	if symbol == nil {
		return nil, nil
	}
	fromGlobal := symbol == query.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil)
	global, kind := query.nativeEntryRoot(symbol, fromGlobal, path)
	if global == nil || len(path) == 0 && kind != sourceNativePossibleProxyConstructor && kind != sourceNativeWeakMapConstructor {
		return nil, nil
	}
	if fromGlobal {
		if path[0] != global.Name {
			return nil, nil
		}
		return &sourceValue{node: global.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeGlobalObject, acquired: root}}, path
	}
	return &sourceValue{node: global.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: root}}, path
}

func (query *sourceValueQuery) nativeMemberSeed(value sourceValue, key string, symbol *ast.Symbol, result *accessorCandidates) (*ast.Node, sourceValue, bool) {
	if value.descriptorView != nil {
		return nil, sourceValue{}, false
	}
	if query.stagedSymbolAcquisition() && value.native.kind == sourceNativeSymbolConstructor && key == "for" {
		global, _ := query.nativeRootDeclaration(value.node)
		if global != nil {
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
			if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
				return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeSymbolFor, acquired: value.native.acquired}}, true
			}
		}
	}
	copyMember := value.native.kind == sourceNativeObjectConstructor && query.reflectiveCopyMember(key)
	if copyMember || query.probingDirectExposure && ((value.native.kind == sourceNativeObjectConstructor && key == "create") || (value.native.kind == sourceNativeSymbolConstructorExposure && key == "for")) || query.stagedCreateAcquisition() && value.native.kind == sourceNativeObjectConstructor && key == "create" {
		global, _ := query.nativeRootDeclaration(value.node)
		if global != nil {
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
			if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
				kind := sourceNativeObjectCreateExposure
				if key == "create" && (copyMember || query.stagedCreateAcquisition()) {
					kind = sourceNativeObjectCreate
				}
				if copyMember && key == "assign" {
					kind = sourceNativeObjectAssign
				}
				if key == "for" {
					kind = sourceNativeSymbolForExposure
				}
				return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: value.native.acquired}}, true
			}
		}
	}

	if value.native.kind == sourceNativeWeakMapConstructor {
		if key == "prototype" {
			global, kind := query.nativeRootDeclaration(value.node)
			if global != nil && kind == sourceNativeWeakMapConstructor {
				member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
				if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
					return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeWeakMapPrototype, acquired: value.native.acquired}}, true
				}
			}
		}
		wellKnown, _ := query.nativeWellKnownKey("hasInstance", result)
		if wellKnown != "" && key == wellKnown {
			function := query.owner.checker.GetGlobalSymbol("Function", ast.SymbolFlagsValue, nil)
			if function != nil && function.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(function.ValueDeclaration)) {
				prototype := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(function), "prototype")
				if prototype != nil {
					method := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(prototype), wellKnown)
					if method != nil && method.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(method.ValueDeclaration)) {
						return value.node, sourceValue{node: method.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeDefaultHasInstance, acquired: value.native.acquired}}, true
					}
				}
			}
		}
	}
	if value.native.kind == sourceNativeWeakMapSourceInstance {
		return query.standardConstructionMemberSeed(value, key)
	}
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
			if query.stagedTargetAcquisition() && value.native.kind == sourceNativeObjectConstructor && key == "prototype" {
				member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
				if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
					// This actual standard-container Get supplies the trusted data
					// slot alternative. Authored properties of that object still
					// use ordinary member/writer owners.
					return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: sourceNativeObjectPrototype, acquired: value.native.acquired}}, true
				}
			}
			if value.native.kind == sourceNativeReflectObject && (key == "get" || query.dependenciesOnly && key == "apply") {
				member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), key)
				if member != nil && member.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
					kind := sourceNativeReflectGet
					if key == "apply" {
						kind = sourceNativeReflectApply
					}
					return value.node, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: kind, acquired: value.native.acquired}}, true
				}
			}
			memberName := "defineProperty"
			if value.native.kind == sourceNativeObjectConstructor && key == "getOwnPropertyDescriptor" {
				memberName = key
			}
			if value.native.kind == sourceNativeObjectConstructor && key == "freeze" {
				memberName = "freeze"
			}
			if value.native.kind == sourceNativeObjectConstructor && key == "defineProperties" {
				memberName = "defineProperties"
			}
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), memberName)
			if member != nil && key == member.Name && member.ValueDeclaration != nil {
				kind := sourceNativeObjectDefineProperty
				if memberName == "getOwnPropertyDescriptor" {
					kind = sourceNativeObjectGetOwnPropertyDescriptor
				}
				if memberName == "freeze" {
					kind = sourceNativeObjectFreeze
				}
				if memberName == "defineProperties" {
					kind = sourceNativeObjectDefineProperties
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
	if value.descriptorView != nil || selected.descriptorView != nil {
		return false
	}
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
	query.nativeMemberKeyAtGet(value, projection, name, symbol, mode, bindings, result, visit, nil, sourceVisits...)
}

// Only the explicitly borrowed construction Get is transported to this original
// native-member owner. Other operation markers retain their existing owners.
func (query *sourceValueQuery) nativeMemberKeyAtGet(value sourceValue, projection []string, name string, symbol *ast.Symbol, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), external *sourceGetInputs, sourceVisits ...func(sourceValue)) {
	path := value.path
	if len(projection) != 0 {
		if len(path) != 0 {
			result.opaque = true
			return
		}
		path = projection
	}
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
	// Invocation adapters keep target identity separate from the selected call/apply
	// property. The existing ordinary route owns actual this and argument vectors.
	if nativeInvocable(value.native.kind) && (key == "call" || key == "apply") {
		query.nativeInvocationMember(value, key, mode, bindings, result, visit, sourceVisits...)
		return
	}
	origin, seed, ok := query.nativeMemberSeed(value, key, symbol, result)
	if !ok {
		return
	}
	if query.probingDirectExposure && seed.native != nil && directExposureNative(seed.native.kind) {
		result.values = append(result.values, seed)
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
	get := &sourceGetInputs{operation: query.reading, receiver: value, symbol: symbol}
	get.lookupOwner = &get.receiver
	if value.native.kind == sourceNativePromiseFacade || value.native.kind == sourceNativeAsyncFacade {
		contract := *value.native
		contract.kind = sourceNativePromisePrototype
		prototype := value
		prototype.node, prototype.native = origin, &contract
		get.lookupOwner = &prototype
	}
	// Only this original fresh scalar Await can use the standard constructor
	// contract without proving a pristine external reference universe.
	standardAwait := mode == accessorAcquire && query.immediateScalarPromiseAwaitLookup(get, key)
	seed.native.referencesIncomplete = value.native.referencesIncomplete || referencesIncomplete && !standardAwait
	releaseConstruction := query.lendConstructionEffectsGet(external, get, key)
	defer releaseConstruction()
	// The genuine constructor's own prototype property is nonwritable and
	// nonconfigurable (ECMA-262, WeakMap.prototype). This exact original New
	// Get therefore cannot invoke a replacement or inherited getter. Receiver
	// acquisition remains with its caller. Mutable prototype members still use
	// the ordinary writer owner below, and no descriptor verdict is promoted.
	if mode == accessorAcquire && get.constructionEffects != nil && get.constructionEffects.live(get) && value.native.kind == sourceNativeWeakMapConstructor && seed.native != nil && seed.native.kind == sourceNativeWeakMapPrototype && !seed.native.referencesIncomplete {
		result.values = append(result.values, seed)
		query.publishStandardMemberGet(value, seed, result)
		return
	}
	if value.native.kind == sourceNativeAsyncFacade || value.native.kind == sourceNativePromiseFacade {
		v := query.propertyView()
		// This actual Get may retain known descriptors even when absence and
		// constructor closure are unavailable. Unknown is not a named effect.
		if !standardAwait && (v == nil || v.state != sourcePropertyComplete || !v.produced || v.incomplete) {
			result.opaque = true
		}
	}
	visitMember := func(value sourceValue) { visit(value.node, value.path, false) }
	if query.dependenciesOnly && len(sourceVisits) == 1 {
		visitMember = sourceVisits[0]
	}
	// A selected standard entry uses the same conditional acquisition path as
	// source arrays. Pending own writers and descriptors remain in that owner.
	// No native implementation body is needed to retain this alternative, and
	// no normal result or descriptor premise is supplied by the candidate.
	var standard *sourceValue
	if mode == accessorAcquire || query.ordinaryWeakMapLookup(get, seed, mode) || mode == accessorSet|accessorNoGet && value.native.kind == sourceNativeWeakMapSourceInstance && query.liveStagedAssignment() != nil {
		standard = &seed
	}
	if mode == accessorSet|accessorNoGet && standard != nil {
		revoke := query.beginStagedAssignmentAlternative(origin, get, mode)
		defer revoke()
	}
	if standard != nil && query.publishStagedConstructedMemberSource(get, value, seed, []string{key}, "", bindings, sources, referencesIncomplete) {
		result.valueIncomplete = true // Required source producers own this Get, not a selected value.
		return
	}
	replaced := query.memberValuesAtGetWithStandard(origin, []string{key}, "", mode, bindings, result, visitMember, sourceMemberOperationProof{sources: sources}, get, standard)
	if b := query.stagedConstructedMember; b != nil && b.live && b.owner == query && b.issued == get && (b.transferred || b.coverageTransferred) {
		return // The original owner transferred method Effects or result-source coverage, not a value.
	}
	// The allocation source owner consumes its Get-only marker after this
	// native traversal returns. Do not consume it before that outer handoff.
	if b := query.stagedMember; b != nil && b.constructedGetEffects != nil && b.transferredGet == get {
		return
	}
	if query.takeStagedMemberGetTransfer(get) {
		// The original source consumer owns every required writer/protocol
		// relationship. It received no selected value or result category, so the
		// stronger legacy tail must not reacquire those same relationships.
		return
	}
	// Delete/computed writes have no assignment RHS. Retain them explicitly at
	// this same owned source view rather than treating an empty RHS list as safe.
	var sourceIndexes [4]sourceValueIndex
	for _, index := range query.occurrenceSourceViewIn(origin, result, sources, sourceIndexes[:0]) {
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
				// A symbol-keyed compound assignment or delete cannot replace a named
				// standard entry. Its own receiver, key, and operation still execute.
				if get.symbol == nil && !index.incomplete && !index.normalDynamicScope && ast.IsElementAccessExpression(written) &&
					query.symbolKeyDisjointFromName(written.AsElementAccessExpression().ArgumentExpression, key) {
					continue
				}
				// Plain assignments, including computed keys, already belong to
				// memberValuesAtGet's ordered memberOrigins/dynamicMembers walk.
				// Its original-use cut and writer inputs own their admission. Do
				// not acquire them again here without that scope or ordering.
				// Delete and compound routes have no plain-assignment RHS there.
				if written.Parent != nil && ast.IsBinaryExpression(written.Parent) && written.Parent.AsBinaryExpression().Left == written && written.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					continue
				}
				temporary := accessorCandidates{}
				candidates := query.occurrenceOrigins(receiver, written, origin, bindings, &temporary)
				unresolved := len(candidates) == 0 || temporary.opaque || temporary.valueIncomplete || temporary.receiverIncomplete
				for _, candidate := range candidates {
					if query.nativeReceiverMatches(candidate, *get.lookupOwner) {
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
		query.publishStandardMemberGet(value, seed, result)
	}
	if standard != nil {
		query.recordStagedNativeEntry(get, *standard, result)
	}
	if standard != nil && query.stagedNativeGet != nil && query.stagedNativeGet.finish != nil {
		query.stagedNativeGet.finish(query, get, standard, result)
	}
	if standard != nil {
		query.accountSourceCalleeComponents(get, *standard, key, result)
	}
}

// standardArrayMemberValue identifies the inherited operation of an established
// source array. The caller owns own-member replacement selection and retains all
// independent uncertainty. Standard identity grants no result, completion or
// nonwriter fact. It is independent of the receiver later supplied to the Call.
func standardArrayMemberValue(origin, declaration, acquired *ast.Node) sourceValue {
	value := sourceValue{node: declaration}
	if origin == nil || !ast.IsArrayLiteralExpression(origin) || declaration == nil || acquired == nil || declaration.Kind != ast.KindMethodSignature || !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) {
		return value
	}
	parent := declaration.Parent
	if parent != nil && ast.IsInterfaceDeclaration(parent) && callableNameText(parent.Name()) == "Array" && callableNameText(declaration.Name()) == "push" {
		value.native = &sourceNativeValue{kind: sourceNativeArrayPush, acquired: acquired}
	}
	return value
}

// nativeInvocationMember retains an established standard target through the
// existing ordinary adapter relation. Own overrides remain selected members,
// while unresolved lookup debt stays additive. The target is not the adapter's
// identity and cannot grant normal input, output or completion authority.
func (query *sourceValueQuery) nativeInvocationMember(value sourceValue, key string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), sourceVisits ...func(sourceValue)) {
	ordinary, occurrence := query.ordinaryFunctionMember(value.node, nil, key, mode)
	if ordinary == nil {
		result.opaque = true
		return
	}
	visitMember := func(member sourceValue) { visit(member.node, member.path, false) }
	if query.dependenciesOnly && len(sourceVisits) == 1 {
		visitMember = sourceVisits[0]
	}
	get := &sourceGetInputs{operation: query.reading, receiver: value}
	members := accessorCandidates{}
	replaced := query.memberValuesAtGetWithStandard(value.node, []string{key}, "", mode, bindings, &members, visitMember, sourceMemberOperationProof{}, get, &value)
	if !members.ownOperation && !replaced {
		target := value
		target.path = nil
		result.sourceCallable = true
		result.ordinaryBodies = append(result.ordinaryBodies, sourceInvocationBody{invocation: occurrence, declaration: value.node, scope: query.acquireCallableScope(bindings, result), nativeTarget: &target})
		if mode == accessorAcquire {
			for _, declaration := range ordinary.Declarations {
				result.values = append(result.values, sourceValue{node: declaration})
			}
		}
	}
	mergeAccessorCandidates(result, members)
}

// The additional container alternative is scoped to the source target owner.
// Ordinary acquisition and normal operation frames retain their prior paths.
func (query *sourceValueQuery) stagedTargetAcquisition() bool {
	return query != nil && query.probingStagedTarget && query.dependenciesOnly && query.inputs == nil && query.operation == nil
}
