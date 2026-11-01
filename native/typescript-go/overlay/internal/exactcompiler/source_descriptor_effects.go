package exactcompiler

import (
	"fmt"
	"unsafe"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// descriptorEffectMode is the single combined binding-layout and effect fence
// shared by source-prefix caches and detached descriptor certificates.
const descriptorEffectMode = "closed-prefix-advisory-analysis-v30-hoisted-module-function-two-module-calls-module-cell-capture-component-input-demand-normal-default-precall-number-first-getter-descriptor-effects-two-elements-property-prefix-default-class-new-may-suffix-definition-graph-conditional-new-native-freeze-initializer-call-parameter-default-get-throw-activation-capture-earlier-object-member-default-nullish-direct-activation-call-possible-proxy-get-effects-typeof-represented-array-initializer"

// sourceDescriptorEffectAuthority projects generation identity without retaining
// the source query, executable owner, project generation or its checker lease.
// The existing language namespace fences final disposal and cannot execute code.
type sourceDescriptorEffectAuthority struct {
	program    *compiler.Program
	checker    *checker.Checker
	source     *ast.SourceFile
	namespace  *languageOwner
	generation uint64
	mode       string
	prefixMode [32]byte
}

// sourceDescriptorEffectOrigin names only an unavailable reflective conversion.
// Independent acquisition, body and prototype effects retain their own sources.
type sourceDescriptorEffectOrigin struct {
	declaration, operation *ast.Node
	native                 sourceNativeKind
	authority              sourceDescriptorEffectAuthority
}

// A nonzero-sized token distinguishes actual Calls at the same source operation.
// It retains no inputs and grants neither execution nor a publication right.
type sourceDescriptorEffectOccurrence struct{ identity byte }

// sourceDescriptorEffectOutcome is immutable evidence after original publication.
// complete is set only on the original publisher's detached fact copy, after its
// effect batch was published. Construction copies always remain incomplete.
type sourceDescriptorEffectOutcome struct {
	origin               sourceDescriptorEffectOrigin
	caller, call, target *ast.Node
	occurrence           *sourceDescriptorEffectOccurrence
	component            *ownedGetContribution
	propertyPrefix       sourceCompletedPropertyPrefix
	complete             bool
	authority            sourceDescriptorEffectAuthority
}

func (a sourceDescriptorEffectAuthority) valid() bool {
	if a.program == nil || a.checker == nil || a.source == nil || a.program.GetSourceFile(a.source.FileName()) != a.source || a.namespace == nil || a.generation == 0 || a.mode != descriptorEffectMode {
		return false
	}
	// Final disposal advances this namespace once. Already published history
	// stays inspectable under the same cache envelope, but cannot publish again.
	if a.namespace.disposed {
		return a.generation != ^uint64(0) && a.generation+1 == a.namespace.generation
	}
	return a.generation == a.namespace.generation
}

func (a sourceDescriptorEffectAuthority) live() bool {
	return a.valid() && !a.namespace.disposed
}

func (query *sourceValueQuery) descriptorEffectAuthority(node *ast.Node) sourceDescriptorEffectAuthority {
	if query.owner == nil || node == nil {
		return sourceDescriptorEffectAuthority{}
	}
	a := sourceDescriptorEffectAuthority{program: query.owner.program, checker: query.owner.checker, source: ast.GetSourceFileOfNode(node), namespace: query.owner.language, mode: descriptorEffectMode}
	if a.namespace != nil {
		a.generation = a.namespace.generation
	}
	// Refusal may already have removed candidate routing. Snapshot the mode
	// from the original producing fact, never from a remaining route/history.
	if query.inputs != nil && query.inputs.ownedFact != nil && query.inputs.ownedFact.sourceFile == a.source {
		a.prefixMode = query.inputs.ownedFact.descriptorMode
	} else if view := query.propertyView(); view != nil && view.frame != nil && view.frame.ownedFact != nil && view.frame.ownedFact.sourceFile == a.source {
		a.prefixMode = view.frame.ownedFact.descriptorMode
	}
	return a
}

func (query *sourceValueQuery) descriptorEffectOrigin(op *sourceReflectiveOperation) sourceDescriptorEffectOrigin {
	return sourceDescriptorEffectOrigin{declaration: op.owner, operation: op.operation, native: op.native, authority: query.descriptorEffectAuthority(op.owner)}
}

// descriptorEffectAllocation checks addressable slice/layout headroom. Its cost
// is advisory and never tests remaining query fuel or a reporting threshold.
func (query *sourceValueQuery) descriptorEffectAllocation(length int, size uintptr, result *accessorCandidates, cause *ast.Node) bool {
	max := int(^uint(0) >> 1)
	count, ok := budgetSum(max, length, 1)
	if !ok || size > uintptr(max) {
		return false
	}
	bytes, ok := budgetProduct(max, count, int(size))
	if !ok {
		return false
	}
	bytes, ok = budgetSum(max, bytes, bytes, 255)
	if !ok {
		return false
	}
	query.charge(result, cause)
	query.recordEstimatedCost(bytes)
	query.recordFacts(1)
	return true
}

// retainDescriptorEffectFallback is called at the missing actual-prefix branch,
// before conversion begins. It never classifies an aggregate opaque result.
func (query *sourceValueQuery) retainDescriptorEffectFallback(op *sourceReflectiveOperation, result *accessorCandidates) bool {
	if op == nil || op.owner == nil || !ast.IsFunctionLike(op.owner) || op.frame == nil || op.frame != query.inputs || op.frame.declaration != op.owner || op.frame.consumedCall != nil || op.frame.ownedFact == nil || op.frame.ownedFact.node != op.owner || op.referencesIncomplete || op.conversionIncomplete || !op.covered || op.key == "" || len(op.targets) == 0 || len(op.descriptors) != 1 || !reflectiveNative(op.native) {
		return false
	}
	slot := query.normalOperation(op.operation, false)
	origin := query.descriptorEffectOrigin(op)
	if slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(query) || slot.authority.generation == nil || !slot.authority.generation.active || !origin.authority.live() || !query.descriptorEffectAllocation(len(result.descriptorFallbacks), unsafe.Sizeof(origin), result, op.operation) {
		return false
	}
	result.descriptorFallbacks = append(result.descriptorFallbacks, origin)
	return true
}

// descriptorBodyEffects seals only actual, fully converted native alternatives.
// Effects and mutation records contain AST identities/verdicts. Their slices are
// copied. Its optional property prefix separately detaches finite converted
// outputs. Neither projection retains live scopes or property inspection maps.
func (query *sourceValueQuery) descriptorBodyEffects(node, body *ast.Node, inputs *sourceValueInputs, entered bool, operations []*sourceReflectiveOperation, result *accessorCandidates) (*sourceDescriptorEffectOccurrence, []sourceDescriptorEffectOutcome) {
	if len(operations) == 0 {
		return nil, nil
	}
	slot := query.normalOperation(node, false)
	if !entered || inputs == nil || inputs.invocation != node || inputs.declaration != body || query.inputs == nil || query.effectOwner == nil || query.operation == nil || query.operation.node != node || query.operation.inputs != query.inputs || slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(query) || slot.authority.generation == nil || !slot.authority.generation.active || slot.population != query.inputs.population || slot.entry == nil || slot.population.moduleEntry(node, slot.entry.statement) != slot.entry || result.thenIncomplete {
		return nil, nil
	}
	var outcomes []sourceDescriptorEffectOutcome
	var component *ownedGetContribution
	propertyMutations := query.detachPropertyMutations(operations, body, inputs, result)
	for _, op := range operations {
		query.charge(result, node)
		if op == nil || op.owner != body || op.frame != inputs {
			continue
		}
		complete := true
		for _, alternative := range operations {
			query.charge(result, op.operation)
			if alternative != nil && alternative.owner == body && alternative.frame == inputs && alternative.operation == op.operation {
				complete = query.completeDescriptorConversion(alternative, result) && complete
			}
		}
		origin := query.descriptorEffectOrigin(op)
		for _, previous := range outcomes {
			query.charge(result, op.operation)
			if previous.origin == origin {
				complete = false // One immutable result covers the closed population.
			}
		}
		index, indexed := query.owner.indexes[origin.authority.source]
		complete = complete && inputs.population != nil && inputs.population.root == body && indexed && !index.incomplete && !index.normalDynamicScope && inputs.population.entries[op.operation] != nil && inputs.population.entries[op.operation] == index.normalOccurrences[op.operation]
		if !complete || !origin.authority.live() || !query.descriptorEffectAllocation(len(outcomes), unsafe.Sizeof(sourceDescriptorEffectOutcome{}), result, node) {
			continue
		}
		if slot.descriptorOccurrence == nil {
			if !query.descriptorEffectAllocation(0, unsafe.Sizeof(sourceDescriptorEffectOccurrence{}), result, node) {
				continue
			}
			slot.descriptorOccurrence = &sourceDescriptorEffectOccurrence{}
		}
		if component == nil {
			if !query.descriptorEffectAllocation(len(result.effects), unsafe.Sizeof(sourceCallableEffect{}), result, node) || !query.descriptorEffectAllocation(len(result.accessorMutations), unsafe.Sizeof(sourceAccessorMutation{}), result, node) || !query.descriptorEffectAllocation(len(result.writes), unsafe.Sizeof(sourceValueWrite{}), result, node) || !query.descriptorEffectAllocation(0, unsafe.Sizeof(ownedGetContribution{})+unsafe.Sizeof(sourceLegacyPublication{})+unsafe.Sizeof(accessorCandidates{}), result, node) {
				continue
			}
			pathsReady := true
			for _, write := range result.writes {
				pathsReady = query.descriptorEffectAllocation(len(write.value.path), unsafe.Sizeof(""), result, node) && pathsReady
			}
			if !pathsReady {
				continue
			}
			// The original normal batch publishes these same known effects. This
			// detached container is evidence only and issues no Get claim/receipt.
			delta := accessorCandidates{opaque: result.opaque, valueIncomplete: result.valueIncomplete, receiverIncomplete: result.receiverIncomplete, thenIncomplete: result.thenIncomplete, cause: result.cause, effects: append([]sourceCallableEffect(nil), result.effects...), accessorMutations: append([]sourceAccessorMutation(nil), result.accessorMutations...)}
			for _, write := range result.writes {
				delta.writes = append(delta.writes, sourceValueWrite{value: sourceValue{node: write.value.node, path: append([]string(nil), write.value.path...)}, operation: write.operation})
			}
			component = &ownedGetContribution{delta: delta}
		}
		outcomes = append(outcomes, sourceDescriptorEffectOutcome{origin: origin, caller: query.effectOwner, call: node, target: body, occurrence: slot.descriptorOccurrence, component: component, propertyPrefix: sourceCompletedPropertyPrefix{mutations: propertyMutations}, authority: query.descriptorEffectAuthority(query.effectOwner)})
	}
	return slot.descriptorOccurrence, outcomes
}

func (query *sourceValueQuery) completeDescriptorConversion(op *sourceReflectiveOperation, result *accessorCandidates) bool {
	if !reflectiveNative(op.native) || !op.covered || !op.finalized || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation || !op.normal || len(op.targets) == 0 || len(op.descriptors) != 1 || op.key == "" {
		return false
	}
	for _, key := range reflectiveDescriptorKeys {
		query.charge(result, op.operation)
		field, present := op.fields[key]
		if !present || field.incomplete || field.presence == propertyUnknown || field.presence == propertyPresent && len(field.values) == 0 {
			return false
		}
	}
	for _, nested := range op.nested {
		query.charge(result, op.operation)
		if nested == nil || !nested.finalized || !nested.covered || nested.referencesIncomplete || nested.conversionIncomplete || nested.residualMutation || !nested.normal || len(nested.targets) == 0 || len(nested.descriptors) != 1 || nested.key == "" {
			return false
		}
		for _, key := range reflectiveDescriptorKeys {
			query.charge(result, nested.operation)
			field, present := nested.fields[key]
			if !present || field.incomplete || field.presence == propertyUnknown || field.presence == propertyPresent && len(field.values) == 0 {
				return false
			}
		}
	}
	return true
}

func cloneSourceFieldCall(call sourceFieldCall) sourceFieldCall {
	call.calls = append([]sourceCallOutcome(nil), call.calls...)
	call.outcomes = append([]sourceFieldOutcome(nil), call.outcomes...)
	call.descriptorEffects = append([]sourceDescriptorEffectOutcome(nil), call.descriptorEffects...)
	return call
}

// publishOriginalDescriptorCall preserves the existing normal Call's three
// appender payload and order. Its original pending batch owns publication, not
// the detached certificate or a fabricated Get population. Other Calls retain
// their existing path. Live payload fields are dropped by the same publisher.
func publishOriginalDescriptorCall(fact *callableFacts, node *ast.Node, candidates accessorCandidates, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker) bool {
	participating := len(candidates.descriptorFallbacks) != 0
	for _, call := range candidates.fieldCalls {
		participating = participating || len(call.descriptorEffects) != 0
	}
	if !participating {
		return false
	}
	claim := &sourceLegacyPublication{destination: fact, payload: &candidates, evidence: candidateEvidence(candidates)}
	fact.ownedLegacyPending = append(fact.ownedLegacyPending, claim)
	publishLegacyComponent(fact, claim, node, targets, source, c)
	return true
}

// finishDescriptorEffectCalls preserves selection semantics and additionally
// requires actual callee/argument completion before descriptor evidence can be
// published. Missing dependencies remove evidence, never their effect sources.
func (query *sourceValueQuery) finishDescriptorEffectCalls(node *ast.Node, result *accessorCandidates) {
	participating := false
	for _, call := range result.fieldCalls {
		participating = participating || call.operation == node && len(call.descriptorEffects) != 0
	}
	if !participating {
		return
	}
	slot := query.normalOperation(node, false)
	ready := slot != nil && slot.selectionComplete && slot.selected != nil && !slot.selected.acquired.valueIncomplete && !slot.selected.acquired.receiverIncomplete && !slot.selected.base.valueIncomplete && !slot.selected.base.receiverIncomplete && !result.thenIncomplete && ast.IsCallExpression(node) && len(slot.actuals) == len(node.AsCallExpression().Arguments.Nodes)
	if ready {
		for _, actual := range slot.actuals {
			query.charge(result, node)
			ready = ready && !actual.observed.incomplete && actual.observed.effects == sourceEffectsAccounted
		}
	}
	for i := range result.fieldCalls {
		call := &result.fieldCalls[i]
		if call.operation == node && (!ready || !call.complete || call.descriptorOccurrence != slot.descriptorOccurrence) {
			call.descriptorEffects = nil
		}
	}
}

// publishDescriptorEffectOutcomes runs after the original three-appender batch.
// It completes detached fact copies only, never construction evidence or a live
// claim. Cache readers cannot invoke it to execute or publish the body again.
func publishDescriptorEffectOutcomes(fact *callableFacts, claim *sourceLegacyPublication) {
	if claim == nil || claim.destination != fact || claim.state != ownedPublished || claim.payload == nil || claim.evidence == nil {
		return
	}
	registered := false
	for _, original := range fact.ownedLegacyPending {
		registered = registered || original == claim
	}
	if !registered {
		return
	}
	payload := *claim.payload
	for _, original := range payload.fieldCalls {
		if !original.complete || original.descriptorOccurrence == nil {
			continue
		}
		for i := range fact.fieldCalls {
			call := &fact.fieldCalls[i]
			if call.operation != original.operation || call.target != original.target || call.descriptorOccurrence != original.descriptorOccurrence || !call.complete {
				continue
			}
			for j := range call.descriptorEffects {
				o := &call.descriptorEffects[j]
				for _, issued := range original.descriptorEffects {
					if *o == issued && o.caller == fact.node && o.call == call.operation && o.target == call.target && o.occurrence == call.descriptorOccurrence && o.component != nil && o.origin.authority.live() && o.authority.live() && o.authority.source == fact.sourceFile && o.authority.prefixMode == fact.descriptorMode {
						o.complete = true
						if o.propertyPrefix.mutations != nil && claim.evidence != nil && !claim.evidence.delta.opaque && !claim.evidence.delta.valueIncomplete && !claim.evidence.delta.receiverIncomplete && !claim.evidence.delta.thenIncomplete && len(claim.evidence.delta.thenReferences) == 0 {
							o.propertyPrefix.referenceEvidence = claim.evidence
						}
					}
				}
			}
		}
	}
}

// descriptorFallbackFulfilled pays only this resolved edge's instantiated
// conversion origin. The generic summary and every independent effect remain.
func descriptorFallbackFulfilled(caller, target *callableFacts, edge CallEdge, source EnvironmentEffectSource) bool {
	origin := source.descriptorOrigin
	if origin == nil || origin.declaration == nil || origin.operation == nil || !reflectiveNative(origin.native) || source.Environment != "unknown" || !source.Opaque || !source.provenanceIncomplete || source.descriptorForwarded || !origin.authority.valid() || origin.declaration != target.node || origin.authority.source != target.sourceFile || origin.authority.prefixMode != target.descriptorMode || ast.GetSourceFileOfNode(origin.declaration) != origin.authority.source || ast.GetSourceFileOfNode(origin.operation) != origin.authority.source || enclosingCallableNode(origin.operation) != origin.declaration || !edge.Resolved || edge.TargetID != target.summary.ID || caller.node == nil || caller.sourceFile == nil || ast.GetSourceFileOfNode(caller.node) != caller.sourceFile || origin.authority.program.GetSourceFile(caller.sourceFile.FileName()) != caller.sourceFile {
		return false
	}
	unique := 0
	for _, candidate := range caller.summary.Calls {
		if candidate.ID == edge.ID {
			unique++
		}
	}
	operation := caller.fieldEdgeOperations[edge.ID]
	if unique != 1 || operation == nil {
		return false
	}
	matched := false
	for _, call := range caller.fieldCalls {
		if call.operation != operation {
			continue
		}
		if call.target != target.node || !call.complete || call.descriptorOccurrence == nil {
			return false
		}
		covered := false
		for _, outcome := range call.descriptorEffects {
			if outcome.origin != *origin {
				continue
			}
			a := outcome.authority
			if !outcome.complete || outcome.caller != caller.node || outcome.call != operation || outcome.target != target.node || outcome.occurrence != call.descriptorOccurrence || outcome.component == nil || !a.valid() || a.source != caller.sourceFile || a.prefixMode != caller.descriptorMode || a.program != origin.authority.program || a.checker != origin.authority.checker || a.namespace != origin.authority.namespace || a.generation != origin.authority.generation {
				return false
			}
			covered = true
		}
		if !covered {
			return false
		}
		matched = true
	}
	return matched
}

func descriptorSourceIdentity(source EnvironmentEffectSource) string {
	if source.descriptorOrigin == nil {
		return ""
	}
	o := source.descriptorOrigin
	return fmt.Sprintf(":descriptor:%p:%p:%d:%p:%p:%p:%d:%s:%x:%t", o.declaration, o.operation, o.native, o.authority.program, o.authority.checker, o.authority.namespace, o.authority.generation, o.authority.mode, o.authority.prefixMode, source.descriptorForwarded)
}
