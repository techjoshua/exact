package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceReflectiveOperation is one current-construction contribution. Selection,
// conversion and the nominal write are separate facts. It is never cached with
// callable summaries and cannot activate a generic indexed candidate.
type sourceReflectiveOperation struct {
	operation, owner                       *ast.Node
	frame                                  *sourceValueInputs
	native                                 sourceNativeKind
	scope                                  acquiredCallableScope
	targets, descriptors                   []sourceObservedValue
	keys                                   []sourceObservedValue
	key                                    string
	covered, referencesIncomplete          bool
	finalized                              bool
	conversionIncomplete, residualMutation bool
	normal, abrupt, falseResult            bool
	fields                                 map[string]sourcePropertyResult
	nested                                 []*sourceReflectiveOperation
}

type sourcePropertyPresence uint8

const (
	propertyUnknown sourcePropertyPresence = iota
	propertyAbsent
	propertyPresent
)

// A property result distinguishes HasProperty from Get. Undefined is a value,
// not absence. A successful Get does not establish receiver confinement.
type sourcePropertyResult struct {
	presence   sourcePropertyPresence
	values     []sourceObservedValue
	incomplete bool
}

func reflectiveNative(kind sourceNativeKind) bool {
	return kind == sourceNativeObjectDefineProperty || kind == sourceNativeReflectDefineProperty
}
func nativeInvocable(kind sourceNativeKind) bool {
	return kind == sourceNativeArrayPush || kind == sourceNativePromiseResolve || kind == sourceNativeObjectFreeze || reflectiveNative(kind)
}

func (query *sourceValueQuery) acquireReflectiveOperation(node *ast.Node, callee sourceValue, bindings sourceValueBindings, exclusive bool, result *accessorCandidates) *sourceReflectiveOperation {
	op := &sourceReflectiveOperation{operation: node, scope: query.acquireCallableScope(bindings, result), frame: query.inputs, native: callee.native.kind, covered: exclusive, referencesIncomplete: callee.native.referencesIncomplete, fields: make(map[string]sourcePropertyResult)}
	if query.operation != nil {
		op.owner = query.operation.owner
	} else {
		op.covered = false
	}
	call := node.AsCallExpression()
	plan := planOrdinaryInvocation(call.Expression, restrictedInvocationArguments(call), query.owner.checker, func(n *ast.Node) bool { return query.charge(result, n) })
	query.materializeInvocationVectors(node, plan, bindings, result)
	sameVector := len(plan.actuals) == len(restrictedInvocationArguments(call))
	for i, arg := range plan.actuals {
		if !query.charge(result, arg) {
			sameVector = false
			break
		}
		sameVector = sameVector && i < len(restrictedInvocationArguments(call)) && arg == restrictedInvocationArguments(call)[i]
	}
	// A finite alias changes target syntax, not the acquired supplied vector.
	// Actual adapters with another receiver/vector remain explicitly incomplete.
	if plan.adapted && (!sameVector || plan.receiver != nil || len(plan.vectors) > 0) || len(plan.actuals) != 3 {
		op.conversionIncomplete = true
	}
	for i, arg := range plan.actuals {
		if !query.charge(result, arg) {
			op.conversionIncomplete = true
			break
		}
		if ast.IsSpreadElement(arg) {
			op.conversionIncomplete = true
			continue
		}
		input := accessorCandidates{}
		// Reuse this actual Call's already acquired input tuple. Missing output
		// under an admitted slot refuses, never reacquires the argument.
		values, admitted := query.actualArgumentValues(node, arg, &input)
		if !admitted {
			values = query.originsAt(arg, query.boundInputAcquisition(arg, node), bindings, &input)
		}
		op.conversionIncomplete = op.conversionIncomplete || input.opaque || input.valueIncomplete || input.receiverIncomplete
		mergeAccessorCandidates(result, input)
		if i == 1 {
			for _, value := range values {
				op.keys = append(op.keys, sourceObservedValue{value: value, scope: op.scope})
			}
			op.key = sourceLiteralMemberName(unwrapSourceCallableReference(arg))
			if op.key == "" {
				op.conversionIncomplete = true
			}
			continue
		}
		for _, value := range values {
			scope := op.scope
			if value.normal != nil {
				original, ok := query.normalValueScope(value, result)
				if !ok {
					op.conversionIncomplete = true
					continue
				}
				scope = original
			}
			observed := sourceObservedValue{value: value, scope: scope}
			if value.normal != nil && len(value.path) == 0 {
				// normalValueScope above admitted this actual input's binding.
				// Consume that wrapper here, before installing the original value
				// frame. Do not combine a current-frame normal wrapper with an
				// acquired child's different original input owner.
				observed = value.normal.observed
				if original := observed.value.acquired; original != nil {
					observed = *original
				}
			} else if value.acquired != nil {
				observed = *value.acquired
			}
			if i == 0 {
				op.targets = append(op.targets, observed)
			} else if i == 2 {
				op.descriptors = append(op.descriptors, observed)
			}
		}
	}
	if len(op.targets) == 0 || len(op.descriptors) != 1 {
		op.conversionIncomplete = true
	}
	return op
}

// reflectiveOperationEffects performs conversion at the actual native alternative.
// It never executes the function stored in a descriptor's get/set DATA field.
func (query *sourceValueQuery) reflectiveOperationEffects(op *sourceReflectiveOperation, result *accessorCandidates) {
	firstFallback := len(result.descriptorFallbacks)
	query.preparePropertyReferences(op.owner, result, op)
	if len(result.descriptorFallbacks) != firstFallback {
		// The generic definition lacks an actual caller prefix. Its conversion
		// remains one typed obligation rather than speculative field execution.
		op.conversionIncomplete = true
		return
	}
	for i := range op.targets {
		target := &op.targets[i]
		get := &sourceGetInputs{operation: op.operation, receiver: target.value}
		get.receiver.acquired = target
		if query.nativeFreezeFor(get, target.value.node, op.operation, result) != nil {
			// General compatible redefinition is not admitted here. Retain
			// Object's possible Throw and Reflect's false outcome separately.
			// No new/replaced descriptor or normal mutation is published.
			op.conversionIncomplete, op.abrupt = true, true
			op.falseResult = op.native == sourceNativeReflectDefineProperty
			result.opaque = true
			return
		}
	}
	if view := query.propertyView(); view != nil {
		previous := view.converting
		view.converting = op
		defer func() { view.converting = previous }()
	}
	previousCreators := query.creators
	query.creators = op.scope.creators
	defer func() { query.creators = previousCreators }()
	firstEffects, firstWrites, firstReferences, firstNested := len(result.effects), len(result.writes), len(result.thenReferences), len(result.reflective)
	priorOpaque := result.opaque
	op.abrupt = true // Conditional successful alternatives do not erase throws.
	op.falseResult = op.native == sourceNativeReflectDefineProperty
	if op.key == "" {
		query.reflectiveKeyEffects(op, result)
	}
	for _, target := range op.targets {
		value := target.value
		ordinary := query.nativeOrdinaryReflectiveTarget(value, result) || sourceFunctionPrototype(value, query.owner.checker) || value.node != nil && len(value.path) == 0 && (ast.IsObjectLiteralExpression(value.node) || ast.IsFunctionLike(value.node))
		if !ordinary {
			op.residualMutation = true
		}
	}
	if len(op.descriptors) != 1 {
		op.conversionIncomplete = true
	}
	unknownPopulation := len(op.descriptors) == 0
	for _, descriptor := range op.descriptors {
		if !query.charge(result, op.operation) {
			op.conversionIncomplete = true
			unknownPopulation = true
			break
		}
		literal := descriptor.value.node != nil && len(descriptor.value.path) == 0 && ast.IsObjectLiteralExpression(descriptor.value.node)
		if !literal {
			op.conversionIncomplete = true
		}
		selection := accessorCandidates{}
		receivers := query.acquireRequiredReceivers(descriptor, &selection)
		mergeAccessorCandidates(result, selection)
		unknownPopulation = unknownPopulation || selection.opaque || selection.valueIncomplete || selection.receiverIncomplete || len(receivers) == 0
		for _, receiver := range receivers {
			if !query.charge(result, op.operation) {
				op.conversionIncomplete = true
				unknownPopulation = true
				break
			}
			fields := make(map[string]sourcePropertyResult)
			for _, key := range reflectiveDescriptorKeys {
				if !query.charge(result, op.operation) {
					op.conversionIncomplete = true
					unknownPopulation = true
					break
				}
				field := query.reflectiveDescriptorProperty(op, receiver, key, result)
				fields[key] = field
				op.conversionIncomplete = op.conversionIncomplete || field.incomplete || field.presence == propertyUnknown
			}
			data := fields["value"].presence == propertyPresent || fields["writable"].presence == propertyPresent
			accessor := fields["get"].presence == propertyPresent || fields["set"].presence == propertyPresent
			if data && accessor {
				op.conversionIncomplete = true
			}
			for _, key := range []string{"get", "set"} {
				for _, value := range fields[key].values {
					if !query.charge(result, op.operation) {
						op.conversionIncomplete = true
						unknownPopulation = true
						break
					}
					v := value.value
					if !v.undefined && (v.node == nil || len(v.path) != 0 || !ast.IsFunctionLike(v.node) || v.node.Body() == nil) {
						op.conversionIncomplete = true
					}
				}
			}
			query.joinReflectiveFields(op, fields, result)
		}
	}
	if unknownPopulation {
		op.conversionIncomplete = true
		// Six fixed refusal publications retain known outputs without semantic reads.
		for _, key := range reflectiveDescriptorKeys {
			field := op.fields[key]
			field.presence = propertyUnknown
			field.incomplete = true
			op.fields[key] = field
		}
	}

	op.normal = !op.conversionIncomplete
	op.nested = append(op.nested, result.reflective[firstNested:]...)
	op.residualMutation = op.residualMutation || op.conversionIncomplete || len(result.writes) > firstWrites || len(result.thenReferences) > firstReferences || !priorOpaque && result.opaque
	// A host effect alone is not a receiver mutation. Keep it at the existing
	// execution owner even when the nominal write is disjoint from a later slot.
	_ = firstEffects
	if op.referencesIncomplete || op.conversionIncomplete || op.residualMutation {
		result.opaque = true
	}
	if v := query.propertyView(); v != nil {
		found := false
		for _, previous := range v.operations {
			found = found || previous == op
		}
		if !found {
			v.operations = append(v.operations, op)
		}
	}
}

// Field order belongs to ToPropertyDescriptor. It does not certify abrupt pruning.
var reflectiveDescriptorKeys = [...]string{"enumerable", "configurable", "value", "writable", "get", "set"}

// joinReflectiveFields transfers finished per-receiver results. No mutable Has
// cell or local field map survives. An unvisited field contributes unknown.
func (query *sourceValueQuery) joinReflectiveFields(op *sourceReflectiveOperation, fields map[string]sourcePropertyResult, result *accessorCandidates) {
	for _, key := range reflectiveDescriptorKeys {
		field, visited := fields[key]
		if !visited {
			field = sourcePropertyResult{presence: propertyUnknown, incomplete: true}
		}
		prior, seen := op.fields[key]
		if !seen {
			op.fields[key] = field
			continue
		}
		if !query.charge(result, op.operation) {
			prior.presence = propertyUnknown
			prior.incomplete = true
			op.fields[key] = prior
			op.conversionIncomplete = true
			continue
		}
		if prior.presence != field.presence {
			prior.presence = propertyUnknown
		}
		prior.incomplete = prior.incomplete || field.incomplete
		for _, value := range field.values {
			if !query.charge(result, op.operation) {
				prior.presence = propertyUnknown
				prior.incomplete = true
				op.conversionIncomplete = true
				break
			}
			prior.values = append(prior.values, value)
		}
		op.fields[key] = prior
	}
}

func (query *sourceValueQuery) reflectiveDescriptorProperty(op *sourceReflectiveOperation, descriptor sourceObservedValue, key string, result *accessorCandidates) sourcePropertyResult {
	presence := propertyUnknown
	get := &sourceGetInputs{operation: op.operation, receiver: descriptor.value, presence: &presence, propertyKey: key, hasOnly: true, reflective: op}
	has := query.acquireRequiredPropertyAt(descriptor, get, accessorNoGet)
	mergeAccessorCandidates(result, has)
	field := sourcePropertyResult{presence: presence, incomplete: has.opaque || has.valueIncomplete || has.receiverIncomplete}
	if field.presence == propertyAbsent && !field.incomplete {
		return field
	}
	get.hasOnly = false
	acquired := query.acquireRequiredPropertyAt(descriptor, get, accessorAcquire)
	// Each Get's post-effects constrain the next Has immediately. This fact is
	// independent of value and normal/abrupt completion observations.
	for _, mutation := range acquired.accessorMutations {
		if !query.charge(result, mutation.body) || mutation.verdict != sourceWriteNoWrites {
			op.residualMutation = true
		}
	}
	mergeAccessorCandidates(result, acquired)
	field.incomplete = field.incomplete || acquired.opaque || acquired.valueIncomplete || acquired.receiverIncomplete || len(acquired.values) == 0
	for i, value := range acquired.values {
		scope, ok := acquired.callableScopes[i]
		if !ok {
			scope = descriptor.scope
		}
		observed := sourceObservedValue{value: value, scope: scope}
		if value.acquired != nil {
			observed = *value.acquired
		}
		field.values = append(field.values, observed)
	}
	return field
}

// reflectiveWriteDisjoint consumes complete actual alternatives for one indexed
// operation. It omits only nominal writes. No accumulated uncertainty is cleared.
func (query *sourceValueQuery) reflectiveWriteDisjoint(node, origin *ast.Node, demand []string, bindings sourceValueBindings, result *accessorCandidates) bool {
	v := query.propertyView()
	if v == nil || v.state != sourcePropertyComplete && v.state != sourcePropertyRefused {
		return false
	}
	key := ""
	for _, part := range demand {
		if part != "" {
			key = part
			break
		}
	}
	if key == "" || key == "*" {
		return false
	}
	found := false
	for _, op := range v.operations {
		if !query.charge(result, node) {
			return false
		}
		if op.operation != node {
			continue
		}
		found = true
		if op.native == sourceNativeObjectFreeze {
			// Freeze changes integrity attributes, not an existing own Get/Set
			// payload. This is operation-local receiver interference, never a
			// NoWrites or body-effect exemption. Argument effects stay owned.
			if op.frame == nil {
				return false
			}
			slot := op.frame.operations[op.operation]
			if !op.covered || !op.finalized || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation || op.frame != query.inputs || op.frame.operationLifetime == nil || len(op.targets) != 1 || op.targets[0].inputs != op.frame || op.targets[0].value.node != origin || slot == nil || slot.state != sourceOperationConsumed || !slot.authority.valid(query) || slot.authority.generation == nil || !slot.authority.generation.active || slot.output.effects != sourceEffectsAccounted {
				return false
			}
			preserved := false
			for _, row := range op.nested {
				preserved = preserved || row.key == key
			}
			if !preserved {
				return false
			}
			continue
		}
		// The completed integrity event above preserves its own descriptor
		// payload even when other view obligations remain unresolved. Other
		// descriptor operations still require the complete predecessor view.
		if v.state != sourcePropertyComplete || !v.produced || v.incomplete || !op.covered || !op.finalized || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation || op.key == "" || op.key == key {
			return false
		}
	}
	return found
}

// ToPropertyKey may Get/call coercion hooks. Their primitive outcome is not
// interpreted here. Known Get and callable MAY effects survive the refusal.
func (query *sourceValueQuery) reflectiveKeyEffects(op *sourceReflectiveOperation, result *accessorCandidates) {
	for _, observed := range op.keys {
		if !query.charge(result, op.operation) {
			return
		}
		value := observed.value
		if value.undefined || value.node != nil && len(value.path) == 0 && sourcePrimitiveValue(value.node) {
			continue
		}
		previous := query.creators
		query.creators = observed.scope.creators
		symbolKey, symbol := query.nativeWellKnownKey("toPrimitive", result)
		for _, key := range []string{symbolKey, "toString", "valueOf"} {
			if key == "" {
				result.opaque = true
				continue
			}
			if value.node == nil {
				result.opaque = true
				continue
			}
			get := &sourceGetInputs{operation: op.operation, receiver: value, propertyKey: key}
			if key == symbolKey {
				get.symbol = symbol
			}
			path := append(append([]string{}, value.path...), key)
			acquired := query.accessorsAtGet(value.node, path, "", accessorAcquire, observed.scope.bindings, nil, get)
			retainCallableThenEffects(&acquired, op.operation)
			mergeAccessorCandidates(result, acquired)
		}
		query.creators = previous
	}
	op.conversionIncomplete = true
	result.opaque = true
}

// Only an already acquired standard native alternative supplies this ordinary
// object category. A demanded projection uses the shared member seed contract.
// It does not complete the Get, discard authored alternatives or clear input
// uncertainty, which remain separate fields on the actual contribution.
func (query *sourceValueQuery) nativeOrdinaryReflectiveTarget(value sourceValue, result *accessorCandidates) bool {
	if value.native == nil || value.native.referencesIncomplete || !query.charge(result, value.node) {
		return false
	}
	if len(value.path) == 0 {
		return value.native.kind == sourceNativePromisePrototype || value.native.kind == sourceNativePromiseConstructor || value.native.kind == sourceNativeObjectConstructor || value.native.kind == sourceNativeReflectObject || value.native.kind == sourceNativeFunctionPrototype
	}
	if len(value.path) != 1 {
		return false
	}
	_, selected, ok := query.nativeMemberSeed(value, value.path[0], nil, result)
	return ok && selected.native != nil && selected.native.kind == sourceNativePromisePrototype
}
