package exactcompiler

import (
	"unsafe"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourcePriorPropertyFacts borrows the collector's original facts only while
// its current frame is live. Disposal revokes the borrow before cache copying.
// It owns no publication right and is never part of a detached outcome.
type sourcePriorPropertyFacts struct {
	owner   *sourceValueOwner
	current *callableFacts
	facts   []callableFacts
	active  bool
}

func (q *sourceValueQuery) installPriorPropertyFacts(facts []callableFacts, result *accessorCandidates) {
	if q.inputs == nil || q.inputs.ownedFact == nil || !q.descriptorEffectAllocation(0, unsafe.Sizeof(sourcePriorPropertyFacts{}), result, q.inputs.declaration) {
		return
	}
	q.inputs.priorPropertyFacts = &sourcePriorPropertyFacts{owner: q.owner, current: q.inputs.ownedFact, facts: facts, active: true}
}

// sourceCompletedPropertyPrefix is optional, immutable original-call history.
// Its reference evidence is attached only by the same original Published batch.
// The descriptor effect certificate alone never establishes reference coverage.
// Pointer fields keep sourceDescriptorEffectOutcome structurally comparable.
type sourceCompletedPropertyPrefix struct {
	referenceEvidence *ownedGetContribution
	mutations         *sourcePropertyMutationPopulation
}

type sourcePropertyMutationPopulation struct {
	operations []sourceCompletedReflectiveMutation
}

// These are converted outputs, not recipes. Values and captured bindings have
// already been acquired. No frame, source query, live scope map or Get claim is
// retained. Materialization copies the original scope instead of inventing one.
type sourceCompletedReflectiveMutation struct {
	operation, owner            *ast.Node
	native                      sourceNativeKind
	key                         string
	targets                     []sourceDetachedPropertyValue
	fields                      [6]sourceDetachedPropertyField
	normal, abrupt, falseResult bool
}
type sourceDetachedPropertyField struct {
	presence sourcePropertyPresence
	values   []sourceDetachedPropertyValue
}
type sourceDetachedPropertyBinding struct {
	symbol ast.SymbolId
	values []sourceValue
}
type sourceDetachedPropertyCreator struct {
	owner *ast.Node
	value sourceValueCreation
}
type sourceDetachedPropertyValue struct {
	value    sourceValue
	returned *ast.Node
	bindings []sourceDetachedPropertyBinding
	creators []sourceDetachedPropertyCreator
}

// detachPropertyValue accepts only finite immutable source/native values. A
// normal/acquired wrapper or container capability needs its original live owner
// and refuses this projection. The existing value/provenance owner remains in
// charge of those domains. Native facades likewise cannot lose their receipts.
func (q *sourceValueQuery) detachPropertyValue(value sourceValue, result *accessorCandidates, cause *ast.Node) (sourceValue, bool) {
	if value.instance != nil {
		return sourceValue{}, false
	}
	if value.ownedGetRow != nil || value.initializerUse != nil || value.adapter != nil || value.entrySlot != nil || value.bound != nil || value.normal != nil || value.awaited != nil || value.acquired != nil || value.rest != nil || value.copied != nil {
		return sourceValue{}, false
	}
	if value.native == nil && !value.undefined && value.number == (numberPayload{}) && value.node != nil && !sourcePrimitiveValue(value.node) && !ast.IsFunctionLike(value.node) {
		return sourceValue{}, false
	}
	if value.native != nil {
		if value.native.acquired == nil || value.native.async != nil || value.native.resolve != nil || value.native.referencesIncomplete || !q.descriptorEffectAllocation(0, unsafe.Sizeof(sourceNativeValue{}), result, cause) {
			return sourceValue{}, false
		}
		copy := *value.native
		value.native = &copy
	}
	if !q.descriptorEffectAllocation(len(value.path), unsafe.Sizeof(""), result, cause) || !q.descriptorEffectAllocation(len(value.forwarded), unsafe.Sizeof((*ast.Node)(nil)), result, cause) {
		return sourceValue{}, false
	}
	value.path = append([]string(nil), value.path...)
	value.forwarded = append([]*ast.Node(nil), value.forwarded...)
	return value, true
}

func (q *sourceValueQuery) detachPropertyObserved(observed sourceObservedValue, result *accessorCandidates, cause *ast.Node) (sourceDetachedPropertyValue, bool) {
	value, ok := q.detachPropertyValue(observed.value, result, cause)
	if !ok {
		return sourceDetachedPropertyValue{}, false
	}
	out := sourceDetachedPropertyValue{value: value, returned: observed.returned}
	for symbol, values := range observed.scope.bindings {
		if !q.descriptorEffectAllocation(len(out.bindings), unsafe.Sizeof(sourceDetachedPropertyBinding{}), result, cause) {
			return sourceDetachedPropertyValue{}, false
		}
		binding := sourceDetachedPropertyBinding{symbol: symbol}
		for _, value := range values {
			copy, ok := q.detachPropertyValue(value, result, cause)
			if !ok || !q.descriptorEffectAllocation(len(binding.values), unsafe.Sizeof(sourceValue{}), result, cause) {
				return sourceDetachedPropertyValue{}, false
			}
			binding.values = append(binding.values, copy)
		}
		out.bindings = append(out.bindings, binding)
	}
	for owner, creator := range observed.scope.creators {
		if !q.descriptorEffectAllocation(len(out.creators), unsafe.Sizeof(sourceDetachedPropertyCreator{}), result, cause) {
			return sourceDetachedPropertyValue{}, false
		}
		out.creators = append(out.creators, sourceDetachedPropertyCreator{owner, creator})
	}
	return out, true
}

func (q *sourceValueQuery) detachPropertyMutations(operations []*sourceReflectiveOperation, body *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) *sourcePropertyMutationPopulation {
	if result.opaque || result.valueIncomplete || result.receiverIncomplete || result.thenIncomplete || len(result.thenReferences) != 0 || len(result.writes) != 0 || !q.descriptorEffectAllocation(0, unsafe.Sizeof(sourcePropertyMutationPopulation{}), result, body) {
		return nil
	}
	for _, mutation := range result.accessorMutations {
		if !q.charge(result, mutation.body) || mutation.verdict != sourceWriteNoWrites {
			return nil
		}
	}
	population := &sourcePropertyMutationPopulation{}
	for _, op := range operations {
		if op == nil || op.owner != body || op.frame != inputs || len(op.nested) != 0 || !q.completeDescriptorConversion(op, result) || !q.descriptorEffectAllocation(len(population.operations), unsafe.Sizeof(sourceCompletedReflectiveMutation{}), result, body) {
			return nil
		}
		copy := sourceCompletedReflectiveMutation{operation: op.operation, owner: op.owner, native: op.native, key: op.key, normal: op.normal, abrupt: op.abrupt, falseResult: op.falseResult}
		for _, target := range op.targets {
			value, ok := q.detachPropertyObserved(target, result, op.operation)
			if !ok || !q.descriptorEffectAllocation(len(copy.targets), unsafe.Sizeof(sourceDetachedPropertyValue{}), result, op.operation) {
				return nil
			}
			copy.targets = append(copy.targets, value)
		}
		for i, key := range reflectiveDescriptorKeys {
			q.charge(result, op.operation)
			field := op.fields[key]
			copy.fields[i].presence = field.presence
			for _, observed := range field.values {
				value, ok := q.detachPropertyObserved(observed, result, op.operation)
				if !ok || !q.descriptorEffectAllocation(len(copy.fields[i].values), unsafe.Sizeof(sourceDetachedPropertyValue{}), result, op.operation) {
					return nil
				}
				copy.fields[i].values = append(copy.fields[i].values, value)
			}
		}
		population.operations = append(population.operations, copy)
	}
	if len(population.operations) == 0 {
		return nil
	}
	return population
}

func (q *sourceValueQuery) materializePropertyValue(value sourceDetachedPropertyValue, result *accessorCandidates, cause *ast.Node) (sourceObservedValue, bool) {
	copy, ok := q.detachPropertyValue(value.value, result, cause)
	if !ok || !q.descriptorEffectAllocation(len(value.bindings), unsafe.Sizeof(sourceDetachedPropertyBinding{}), result, cause) || !q.descriptorEffectAllocation(len(value.creators), unsafe.Sizeof(sourceDetachedPropertyCreator{}), result, cause) {
		return sourceObservedValue{}, false
	}
	// The complete original map contents, including actual empty maps, are
	// copied. This is no fallback for a lost scope or uninstalled invocation.
	scope := acquiredCallableScope{bindings: make(sourceValueBindings, len(value.bindings)), creators: make(map[*ast.Node]sourceValueCreation, len(value.creators))}
	for _, binding := range value.bindings {
		scope.bindings[binding.symbol] = nil
		for _, old := range binding.values {
			v, ok := q.detachPropertyValue(old, result, cause)
			if !ok || !q.descriptorEffectAllocation(len(scope.bindings[binding.symbol]), unsafe.Sizeof(sourceValue{}), result, cause) {
				return sourceObservedValue{}, false
			}
			scope.bindings[binding.symbol] = append(scope.bindings[binding.symbol], v)
		}
	}
	for _, creator := range value.creators {
		scope.creators[creator.owner] = creator.value
	}
	return sourceObservedValue{value: copy, scope: scope, returned: value.returned}, true
}

// materializePropertyMutations creates read-only contributions for this view.
// They have no producer frame, descriptor input or execution/publication claim.
func (q *sourceValueQuery) materializePropertyMutations(population *sourcePropertyMutationPopulation, result *accessorCandidates) ([]*sourceReflectiveOperation, bool) {
	var operations []*sourceReflectiveOperation
	for _, old := range population.operations {
		if !q.descriptorEffectAllocation(len(operations), unsafe.Sizeof((*sourceReflectiveOperation)(nil))+unsafe.Sizeof(sourceReflectiveOperation{}), result, old.operation) || !q.descriptorEffectAllocation(len(reflectiveDescriptorKeys), unsafe.Sizeof("")+unsafe.Sizeof(sourcePropertyResult{}), result, old.operation) {
			return nil, false
		}
		op := &sourceReflectiveOperation{operation: old.operation, owner: old.owner, native: old.native, key: old.key, covered: true, finalized: true, normal: old.normal, abrupt: old.abrupt, falseResult: old.falseResult, fields: make(map[string]sourcePropertyResult, len(reflectiveDescriptorKeys))}
		for _, target := range old.targets {
			value, ok := q.materializePropertyValue(target, result, old.operation)
			if !ok || !q.descriptorEffectAllocation(len(op.targets), unsafe.Sizeof(sourceObservedValue{}), result, old.operation) {
				return nil, false
			}
			op.targets = append(op.targets, value)
		}
		for i, key := range reflectiveDescriptorKeys {
			field := sourcePropertyResult{presence: old.fields[i].presence}
			for _, oldValue := range old.fields[i].values {
				value, ok := q.materializePropertyValue(oldValue, result, old.operation)
				if !ok || !q.descriptorEffectAllocation(len(field.values), unsafe.Sizeof(sourceObservedValue{}), result, old.operation) {
					return nil, false
				}
				field.values = append(field.values, value)
			}
			op.fields[key] = field
		}
		operations = append(operations, op)
	}
	return operations, len(operations) != 0
}

// consumePriorPropertyCall reads only an original, published earlier occurrence.
// The current auxiliary slot supplies callee selection, not body completion.
// It is never marked consumed and no new Call result or effect is published.
func (q *sourceValueQuery) consumePriorPropertyCall(view *sourcePropertyReferenceView, source *ast.SourceFile, node *ast.Node, result *accessorCandidates) bool {
	if q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || view == nil || q.propertyView() != view || view.frame == nil || !ast.IsCallExpression(node) || ast.GetSourceFileOfNode(node) != source || source != view.source || q.inputs == nil || q.operation == nil || q.operation.node != node || q.operation.inputs != q.inputs {
		return false
	}
	history := view.frame.priorPropertyFacts
	identity := view.normalSources[source]
	if history == nil || !history.active || history.owner != q.owner || history.current == nil || history.current != view.frame.ownedFact || history.current.normalInputs != view.frame || history.current.sourceFile != source || identity == nil || identity.source != source || identity.cyclic || identity.population == nil || identity.population.root != source.AsNode() {
		return false
	}
	entry, current := identity.population.entries[node], identity.population.entries[history.current.node]
	index, indexed := q.owner.indexes[source]
	if !indexed || index.incomplete || entry == nil || current == nil || index.normalOccurrences[node] != entry || index.normalOccurrences[history.current.node] != current || !entry.once || !current.once || entry.region != nil || current.region != nil || entry.callOwner != nil || entry.statement == nil || entry.statement.Parent != source.AsNode() || current.statement != history.current.node || entry.statement == current.statement || entry.ordinal >= current.ordinal {
		return false
	}
	// Initial projection covers discarded, argument-free ordinary invocations.
	// Other input/effect populations stay with the normal producer, not this read.
	if node.Parent != entry.statement || !ast.IsExpressionStatement(entry.statement) || node.AsCallExpression().Arguments != nil && len(node.AsCallExpression().Arguments.Nodes) != 0 {
		return false
	}
	slot := q.normalOperation(node, false)
	if slot == nil || slot.state != sourceOperationPending || !slot.authority.valid(q) || slot.entry != entry || slot.population != identity.population || q.inputs.population != identity.population || q.inputs.declaration != source.AsNode() || q.operation.owner != entry.statement || !slot.writePopulationComplete || len(slot.writeAlternatives) == 0 {
		return false
	}
	want := q.descriptorEffectAuthority(history.current.node)
	if !want.live() || want.program != view.program || want.checker != view.checker || want.namespace != q.owner.language || want.prefixMode != history.current.descriptorMode {
		return false
	}
	var original *callableFacts
	for i := range history.facts {
		q.charge(result, node)
		fact := &history.facts[i]
		if fact.node == entry.statement && fact.sourceFile == source {
			if original != nil || fact == history.current || fact.normalInputs != nil || fact.descriptorMode != want.prefixMode {
				return false
			}
			original = fact
		}
	}
	if original == nil {
		return false
	}
	for i, alternative := range slot.writeAlternatives {
		if alternative == nil || !alternative.eligible {
			return false
		}
		for _, earlier := range slot.writeAlternatives[:i] {
			q.charge(result, node)
			if earlier.declaration == alternative.declaration {
				return false
			}
		}
		count := 0
		for _, call := range original.fieldCalls {
			q.charge(result, node)
			if call.operation == node && call.target == alternative.declaration {
				count++
			}
		}
		if count != 1 {
			return false
		}
	}
	var mutations *sourcePropertyMutationPopulation
	var selectedOccurrence *sourceDescriptorEffectOccurrence
	matched := 0
	for _, call := range original.fieldCalls {
		q.charge(result, node)
		if call.operation != node {
			continue
		}
		if !call.complete || call.descriptorOccurrence == nil || len(call.descriptorEffects) == 0 {
			return false
		}
		alternative := false
		for _, candidate := range slot.writeAlternatives {
			q.charge(result, node)
			alternative = alternative || candidate != nil && candidate.eligible && candidate.declaration == call.target
		}
		if !alternative || selectedOccurrence != nil && selectedOccurrence != call.descriptorOccurrence {
			return false
		}
		selectedOccurrence = call.descriptorOccurrence
		matched++
		for _, outcome := range call.descriptorEffects {
			p := outcome.propertyPrefix
			if !outcome.complete || outcome.caller != original.node || outcome.call != node || outcome.target != call.target || outcome.occurrence != call.descriptorOccurrence || outcome.authority != want || outcome.origin.authority != want || outcome.origin.declaration != call.target || p.referenceEvidence == nil || p.mutations == nil || p.referenceEvidence.delta.thenIncomplete || len(p.referenceEvidence.delta.thenReferences) != 0 {
				return false
			}
			published := false
			for _, claim := range original.ownedLegacyPending {
				q.charge(result, node)
				published = published || claim != nil && claim.destination == original && claim.state == ownedPublished && claim.payload == nil && claim.evidence == p.referenceEvidence
			}
			if !published || mutations != nil && mutations != p.mutations {
				return false
			}
			mutations = p.mutations
		}
	}
	// No alternative or repeated copy can be paid by another body's outcome.
	if matched != len(slot.writeAlternatives) || mutations == nil {
		return false
	}
	operations, ok := q.materializePropertyMutations(mutations, result)
	total, addressable := budgetSum(int(^uint(0)>>1), len(result.reflective), len(operations))
	if !ok || !addressable || !q.descriptorEffectAllocation(total, unsafe.Sizeof((*sourceReflectiveOperation)(nil)), result, node) || !q.descriptorEffectAllocation(len(result.owned), unsafe.Sizeof(sourceOwnedObligations{}), result, node) {
		return false
	}
	result.reflective = append(result.reflective, operations...)
	result.owned = append(result.owned, sourceOwnedObligations{owner: original.node, operation: node})
	return true
}
