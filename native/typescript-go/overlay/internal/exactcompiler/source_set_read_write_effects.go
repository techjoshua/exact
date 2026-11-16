package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceQualifiedReadWrite is a conditional BODY dependency after SOURCE role
// substitution. A target is a declaring binding, or the original receiver Call
// and its retained return binding. writtenFrom describes storage, not an output
// or a performed replacement. This product is private to Set Effects delivery;
// mutation application, normal DATA and selected binders never consume it.
type sourceQualifiedReadWrite struct {
	mutation                          string // Private SOURCE effect; not a current mutation application.
	arrayCall                         sourceStagedOperationRequest
	declaration, operation, reference *ast.Node
	owner, binding, receiver          *ast.Node
	target, writtenFrom               sourceRelativeEndpoint
	cut                               sourceRelativeCut
	generation                        *projectGeneration
	required                          []sourceStagedOperationRequest
	read, write, primitive            bool
}

func sameQualifiedReadWrite(a, b sourceQualifiedReadWrite) bool {
	return a.mutation == b.mutation && sameOperationRequest(a.arrayCall, b.arrayCall) && a.declaration == b.declaration && a.operation == b.operation && a.reference == b.reference && a.owner == b.owner && a.binding == b.binding && a.receiver == b.receiver && sameOperationEndpoint(a.target, b.target) && sameOperationEndpoint(a.writtenFrom, b.writtenFrom) && a.cut == b.cut && a.generation == b.generation && a.read == b.read && a.write == b.write && a.primitive == b.primitive && operationPrefix(a.required, b.required, sameOperationRequest) && len(a.required) == len(b.required)
}

func cloneQualifiedReadWrites(values []sourceQualifiedReadWrite) []sourceQualifiedReadWrite {
	out := append([]sourceQualifiedReadWrite(nil), values...)
	for i := range out {
		out[i].target = cloneSourceRelativeEndpoint(out[i].target)
		out[i].writtenFrom = cloneSourceRelativeEndpoint(out[i].writtenFrom)
		out[i].required = append([]sourceStagedOperationRequest(nil), out[i].required...)
	}
	return out
}

// setEffectReference uses the supplier's already checked bindings. It never
// recovers a written entry or relabels a run-local binding as a caller formal.
func setEffectReference(s *sourceStagedSetEffectsSupplier, reference *ast.Node, root sourceStagedOperationRequest, generation *projectGeneration) (sourceQualifiedReadWrite, bool) {
	out := sourceQualifiedReadWrite{declaration: s.declaration, reference: reference, owner: root.consumer, cut: sourceRelativeCut{operation: root.use, reading: reference}, generation: generation}
	base := reference
	if ast.IsPropertyAccessExpression(base) || ast.IsElementAccessExpression(base) {
		base = base.Expression()
	}
	if base == nil {
		return out, false
	}
	if base.Kind == ast.KindThisKeyword {
		out.binding, out.receiver, out.target = s.receiverBinding, root.use.AsBinaryExpression().Left.Expression(), s.receiver
		out.required = append(out.required, stagedDeclarationCallEffectsRequest(out.receiver, root.consumer))
		return out, out.binding != nil && out.target.producer == out.binding
	}
	if !ast.IsIdentifier(base) {
		return out, false
	}
	for _, binding := range s.bindings {
		for _, endpoint := range binding.sources {
			if endpoint.get != base {
				continue
			}
			if binding.target.kind != relativeRoleCapture || endpoint.producer == nil || enclosingCallableNode(endpoint.producer) != root.consumer {
				return out, false
			}
			out.binding, out.target = endpoint.producer, endpoint
			// A write destination does not read its raw entry. Object member
			// accesses still demand the declaring binding's SOURCE read.
			if reference != base || base.Parent == nil || !ast.IsBinaryExpression(base.Parent) || base.Parent.AsBinaryExpression().Left != base {
				out.required = append(out.required, stagedBindingResultRequest(base, s.declaration))
			}
			return out, true
		}
	}
	return out, false
}

// reduceSetBodyReadWrites consumes the canonical operation population, once per
// supplier revision. Get/Set/Call requirements retain their authentic owners.
// Checked numeric ++ describes one read and one write; it computes no value.
// Unsupported operations retain debt even when a known sibling is described.
func (work *callableEffectWork) reduceSetBodyReadWrites(facts []callableFacts, root sourceStagedOperationRequest, s *sourceStagedSetEffectsSupplier, owner *executableBodyOwner) ([]sourceQualifiedReadWrite, bool) {
	target, known := work.memberNodes[s.declaration]
	if !known || owner == nil || owner.values == nil {
		return nil, false
	}
	complete := true
	var out, calls []sourceQualifiedReadWrite
	for _, node := range owner.values.summary(s.declaration).nodes {
		if enclosingCallableNode(node) != s.declaration {
			continue
		}
		kind, recorded := originalMutationBodyKind(node)
		if !recorded {
			continue
		}
		reference := node
		read, write := false, false
		switch kind {
		case originalMutationBodyGet:
			read = true
		case originalMutationBodyWrite:
			reference, write = node.AsBinaryExpression().Left, true
		case originalMutationBodyUnsupported:
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken && !stateArgumentMayOwnMutations(owner.checker.GetTypeAtLocation(node.AsBinaryExpression().Left)) && !stateArgumentMayOwnMutations(owner.checker.GetTypeAtLocation(node.AsBinaryExpression().Right)) {
				out = append(out, sourceQualifiedReadWrite{declaration: s.declaration, operation: node, reference: node, owner: root.consumer, cut: sourceRelativeCut{operation: root.use, reading: node}, generation: work.operationGeneration, primitive: true})
				continue
			}
			if !ast.IsPrefixUnaryExpression(node) && !ast.IsPostfixUnaryExpression(node) {
				complete = false
				continue
			}
			operator := ast.KindUnknown
			if ast.IsPrefixUnaryExpression(node) {
				reference, operator = node.AsPrefixUnaryExpression().Operand, node.AsPrefixUnaryExpression().Operator
			} else {
				reference, operator = node.AsPostfixUnaryExpression().Operand, node.AsPostfixUnaryExpression().Operator
			}
			if operator != ast.KindPlusPlusToken && operator != ast.KindMinusMinusToken || owner.checker.GetTypeAtLocation(reference).Flags()&checker.TypeFlagsNumberLike == 0 {
				complete = false
				continue
			}
			read, write = true, true
		case originalMutationBodyCall:
			complete = false // Current Call exporters describe prefixes, not exhaustive SOURCE writes.
			if access, represented := work.reduceSetArrayPush(facts, root, s, node, owner); represented {
				calls = append(calls, access)
			}
			continue // The separate original Call/algorithm debt remains mandatory.
		default:
			complete = false
			continue
		}
		access, valid := setEffectReference(s, reference, root, work.operationGeneration)
		if !valid {
			complete = false
			continue
		}
		access.operation, access.read, access.write = node, read, write
		if write && ast.IsBinaryExpression(node) {
			rhs := node.AsBinaryExpression().Right
			mapped := false
			for _, binding := range s.bindings {
				if binding.target.kind != relativeRoleFormal || binding.target.slot != 0 {
					continue
				}
				for _, endpoint := range binding.sources {
					if endpoint.get == rhs && endpoint.producer == root.use && endpoint.expression == root.use.AsBinaryExpression().Right {
						access.writtenFrom, mapped = endpoint, true
						access.required = appendEntryLawRequirement(access.required, stagedAssignmentRequest(root, "rhs"))
					}
				}
			}
			if !mapped {
				// Authored expression identity is sufficient for a conditional
				// store description; its operations remain in this population.
				access.writtenFrom = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: rhs, producer: node, cut: access.cut}
			}
		}
		if ast.IsPropertyAccessExpression(reference) || ast.IsElementAccessExpression(reference) {
			if read {
				if child, registered := work.registerQualifiedGetEffects(facts, target, reference, owner, sourceAssignmentEffectsInput{parent: root, access: access}); registered {
					access.required = appendEntryLawRequirement(access.required, child)
				} else {
					complete = false
				}
			}
			if write {
				if ast.IsBinaryExpression(node) {
					if child, registered := work.registerSourceWriteEffects(facts, target, node, owner, root, access); registered {
						access.required = appendEntryLawRequirement(access.required, child)
					} else {
						complete = false
					}
				} else {
					if child, registered := work.registerSourceWriteEffects(facts, target, node, owner, root, access); registered {
						access.required = appendEntryLawRequirement(access.required, child)
					} else {
						complete = false
					}
				}
			}
		}
		out = append(out, access)
	}
	// Keep published Call order, but use only freshly reduced current atoms.
	// A later discovered sibling extends rather than reorders the known prefix.
	for _, prior := range work.operationRecipes[root.producer].delta.readWrites {
		for i, current := range calls {
			if sameQualifiedReadWrite(prior, current) {
				out = append(out, current)
				calls = append(calls[:i], calls[i+1:]...)
				break
			}
		}
	}
	return append(out, calls...), complete
}

// applySetReadWrites delivers actual substituted payloads to the original
// writer's root subscriber. Each accepted access independently retains all of
// its required producers; a known access is not completion of its siblings.
// Consumed payloads live only on this graph subscriber and are never cloned.
func (work *callableEffectWork) applySetReadWrites(use sourceStagedOperationUse, values []sourceQualifiedReadWrite) bool {
	if len(values) == 0 {
		return true
	}
	recipe := work.operationRecipes[use.request.producer]
	source := recipe.assignment
	if source == nil || source.phase != "" && source.phase != "set" || !sameOperationRequest(source.request, use.request) {
		return false
	}
	observation := work.assignmentObserved[source.root.producer]
	if observation == nil || observation.effects == nil || observation.effects.work != work || observation.effects.generation != work.operationGeneration || observation.effects.issuer == nil || observation.effects.issuer.observation != observation || observation.disposition == nil || observation.disposition.issuer != observation.effects.issuer || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration {
		return false
	}
	if !work.assignmentEffectPrefixMatches(source.root, observation) {
		return false
	}
	id, found := work.operationIDs[use.request.producer]
	if !found || id.epoch != work.operationEpoch {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
	if subscriber == nil {
		return false
	}
	for _, access := range values {
		if access.mutation != "" && !work.arrayPushAccessCurrent(access) {
			return false
		}
		matched := false
		for _, supplier := range observation.effects.suppliers {
			for _, original := range supplier.accesses {
				if sameQualifiedReadWrite(original, access) && validSetReadWriteSubstitution(&supplier, access, source.root) {
					matched = true
				}
			}
		}
		if !matched || access.generation != work.operationGeneration || access.owner != source.root.consumer || access.cut.operation != source.root.use {
			return false
		}

		present := false
		for _, prior := range subscriber.readWrites {
			present = present || sameQualifiedReadWrite(prior, access)
		}
		if !present {
			subscriber.readWrites = append(subscriber.readWrites, cloneQualifiedReadWrites([]sourceQualifiedReadWrite{access})[0])
		}
	}
	return true
}

// validSetReadWriteSubstitution is the consuming role reducer. It reuses the
// authentic supplier's SOURCE bindings, not its generated access inventory, to
// check where each read/write lands and what source a store carries. A producer
// omission cannot become a valid effect merely because both atom copies agree.
// No checker/query, activation or current-value operation runs here.
func validSetReadWriteSubstitution(s *sourceStagedSetEffectsSupplier, access sourceQualifiedReadWrite, root sourceStagedOperationRequest) bool {
	if access.primitive {
		return true // The original checked-primitive issuer owns this atom.
	}
	expected, mapped := setEffectReference(s, access.reference, root, access.generation)
	if !mapped || expected.owner != access.owner || expected.binding != access.binding || expected.receiver != access.receiver || !sameOperationEndpoint(expected.target, access.target) || !operationPrefix(expected.required, access.required, sameOperationRequest) {
		return false
	}
	contains := func(request sourceStagedOperationRequest) bool {
		for _, required := range access.required {
			if sameOperationRequest(request, required) {
				return true
			}
		}
		return false
	}
	if access.mutation != "" {
		return validSetArrayPushSubstitution(s, access, root) && contains(access.arrayCall)
	}
	if access.read && (ast.IsPropertyAccessExpression(access.reference) || ast.IsElementAccessExpression(access.reference)) && !contains(qualifiedGetRequest(access.reference, s.declaration, "effects", sourceAssignmentEffectsInput{parent: root, access: access})) {
		return false
	}
	if access.write && ast.IsBinaryExpression(access.operation) {
		rhs := access.operation.AsBinaryExpression().Right
		for _, binding := range s.bindings {
			if binding.target.kind != relativeRoleFormal {
				continue
			}
			for _, endpoint := range binding.sources {
				if endpoint.get == rhs {
					return sameOperationEndpoint(endpoint, access.writtenFrom) && contains(stagedAssignmentRequest(root, "rhs"))
				}
			}
		}
		return access.writtenFrom.expression == rhs && access.writtenFrom.producer == access.operation
	}
	return true
}

// operationEffectRequirements is the single dependency consumer for ordinary
// requirements and SOURCE-qualified read/write effects. Substituting a store's
// formal therefore changes the writer's real dependency graph, not a receipt
// membership flag. All channels use the same enrollment and closure machinery.
func operationEffectRequirements(delta sourceStagedOperationDelta) []sourceStagedOperationRequest {
	if len(delta.readWrites) == 0 {
		return delta.required
	}
	out := append([]sourceStagedOperationRequest(nil), delta.required...)
	for _, access := range delta.readWrites {
		for _, required := range access.required {
			out = appendEntryLawRequirement(out, required)
		}
	}
	return out
}

func validSetReadWriteDescription(s *sourceStagedAssignment, access sourceQualifiedReadWrite) bool {
	if access.mutation != "" && !validSetArrayPushShape(access) {
		return false
	}
	if access.primitive {
		return s != nil && (s.phase == "" || s.phase == "set") && access.declaration != nil && ast.IsSetAccessorDeclaration(access.declaration) && enclosingCallableNode(access.declaration.Parent) == s.root.consumer && access.operation != nil && ast.IsBinaryExpression(access.operation) && access.operation.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken && enclosingCallableNode(access.operation) == access.declaration && access.reference == access.operation && access.owner == s.root.consumer && access.generation == s.generation && access.cut == (sourceRelativeCut{operation: s.root.use, reading: access.reference}) && !access.read && !access.write && access.binding == nil && access.receiver == nil && len(access.required) == 0
	}
	if s == nil || s.phase != "" && s.phase != "set" || access.declaration == nil || !ast.IsSetAccessorDeclaration(access.declaration) || enclosingCallableNode(access.declaration.Parent) != s.root.consumer || access.operation == nil || enclosingCallableNode(access.operation) != access.declaration || access.reference == nil || access.owner != s.root.consumer || access.binding == nil || enclosingCallableNode(access.binding) != access.owner || access.generation != s.generation || access.cut != (sourceRelativeCut{operation: s.root.use, reading: access.reference}) || !access.read && !access.write {
		return false
	}
	if access.receiver != nil && (access.receiver != s.root.use.AsBinaryExpression().Left.Expression() || access.target.producer != access.binding) {
		return false
	}
	for _, r := range access.required {
		// Every typed child retains its own original declaration and physical
		// cut. Cross-owner source operands are not renamed as setter formals.
		if r.inputs != nil || r.consumer != r.producer.declaration || r.use != r.producer.operation || r.cut != (sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}) {
			return false
		}
		if sameOperationRequest(r, stagedAssignmentRequest(s.root, "rhs")) || sameOperationRequest(r, stagedDeclarationCallEffectsRequest(s.root.use.AsBinaryExpression().Left.Expression(), s.root.consumer)) {
			continue
		}
		if r.consumer != access.declaration || r.use == nil || enclosingCallableNode(r.use) != access.declaration || r.producer.kind != relativeDemandEffects && !sameOperationRequest(r, stagedBindingResultRequest(r.use, access.declaration)) {
			return false
		}
	}
	return true
}

// setBodyReadWritesCovered checks the actual canonical BODY population. Numeric
// update retains two facets on its original operation. A missing or misrouted
// contribution cannot be paid by an unrelated SOURCE request or BODY revision.
func (work *callableEffectWork) setBodyReadWritesCovered(population sourceOriginalMutationBodyPopulation, values []sourceQualifiedReadWrite, generation *projectGeneration, closed []bool) bool {
	if !population.complete || population.generation != generation {
		return false
	}
	for _, operation := range population.operations {
		if operation.kind == originalMutationBodyCall {
			continue // Its canonical invocation/dependency owner remains mandatory.
		}
		matched := false
		for _, access := range values {
			if access.operation == operation.node && access.declaration == population.declaration && access.generation == generation {
				if access.write && (ast.IsPrefixUnaryExpression(operation.node) || ast.IsPostfixUnaryExpression(operation.node)) && (ast.IsPropertyAccessExpression(access.reference) || ast.IsElementAccessExpression(access.reference)) {
					paid := false
					for _, required := range access.required {
						if required.producer.operation != operation.node || required.producer.declaration != access.declaration || required.producer.selector.field != "assignment-source-effects" {
							continue
						}
						id, adopted := work.operationIDs[required.producer]
						paid = adopted && id.epoch == work.operationEpoch && int(id.index) < len(closed) && closed[id.index]
					}
					if !paid {
						return false // A counted write is not a paid original update Set.
					}
				}
				matched = access.primitive || operation.kind == originalMutationBodyGet && access.read || operation.kind == originalMutationBodyWrite && access.write || operation.kind == originalMutationBodyUnsupported && access.read && access.write && (ast.IsPrefixUnaryExpression(operation.node) || ast.IsPostfixUnaryExpression(operation.node))
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

// originalWriterReadWritesConsumed is the assignment owner's Effects exit.
// The original writer must have consumed every actual substituted payload; a
// copied recipe, closed formal source or independent subscription is insufficient.
// This says nothing about DATA, selected execution or current mutation output.
func (work *callableEffectWork) originalWriterReadWritesConsumed(projection *sourceStagedSetEffectProjection) bool {
	id, found := work.operationIDs[projection.root.producer]
	if !found || id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{projection.root.consumer, projection.root.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision {
		return false
	}
	for _, supplier := range projection.suppliers {
		for _, wanted := range supplier.accesses {
			found := false
			for _, consumed := range subscriber.readWrites {
				found = found || sameQualifiedReadWrite(wanted, consumed)
			}
			if !found {
				return false
			}
		}
	}
	return true
}
