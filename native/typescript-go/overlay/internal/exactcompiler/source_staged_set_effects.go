package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedSetEffectsBorrow is lent by the original Set source owner. Return
// endpoints can enter only source member coverage, never the selected callback.
// No sourceValue, capture map, binder edge or creating scope is installed.
type sourceStagedSetEffectsBorrow struct {
	work        *callableEffectWork
	facts       []callableFacts
	owner       *executableBodyOwner
	root        sourceStagedOperationRequest
	query       *sourceValueQuery
	plan        sourceStagedCallReturnPlan
	active      bool
	sourceInput *sourceAssignmentEffectsInput
	current     *sourceStagedCallReturnBranch
	suppliers   []sourceStagedSetEffectsSupplier
	receipt     *sourceStagedSetEffectProjection
}

// A supplier's bindings are accepted only by the Set Effects dependency reducer
// below. They are not sourceStagedDeclarationCall or mutation application inputs.
type sourceStagedSetEffectsSupplier struct {
	declaration       *ast.Node
	bindings          []sourceRelativeBinding
	complete          bool
	sourceInputsReady bool
	receiverBinding   *ast.Node
	receiver          sourceRelativeEndpoint
	accesses          []sourceQualifiedReadWrite
}

// sourceStagedSetEffectProjection joins original member coverage to canonical
// BODY read/write substitution. Its payload feeds real operation dependencies
// and writer delivery. The projection is graph-owned; only immutable payloads
// clone with recipes, never this issuer or consumed revision authority.
type sourceStagedSetEffectProjection struct {
	work                 *callableEffectWork
	issuer               *sourceStagedAssignmentIssuer
	root                 sourceStagedOperationRequest
	generation           *projectGeneration
	suppliers            []sourceStagedSetEffectsSupplier
	inputPlan            sourceStagedCallReturnPlan
	inputPopulationReady bool
}

// beginAssignmentSourceEffects lends a producer-authenticated original return
// plan to this Set source interval. Passive plan metadata alone cannot publish.
func (work *callableEffectWork) beginAssignmentSourceEffects(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, b *sourceStagedAssignmentBorrow, owner *executableBodyOwner) {
	if source := work.operationRecipes[root.producer].assignment; source != nil && source.sourceInput.parent.use != nil {
		if work.assignmentEffectsInputRoot(source.sourceInput, owner) != nil {
			b.sourceEffects = &sourceStagedSetEffectsBorrow{work: work, facts: facts, owner: owner, root: root, query: q, sourceInput: &source.sourceInput}
		}
		return
	}
	receiver, _ := accessorReceiver(stagedAssignmentTarget(root.use))
	if !ast.IsCallExpression(receiver) || owner == nil || owner.values == nil || b.generation != work.operationGeneration {
		return
	}
	source := work.operationRecipes[stagedDeclarationCallEffectsRequest(receiver, root.consumer).producer]
	if source.declarationCall == nil || source.declarationCallGeneration != work.operationGeneration || !validStagedDeclarationCallEffectsRecipe(source) || source.declarationCall.inputs != nil || source.declarationCall.sourceInputs == nil {
		return
	}
	plan, valid := describeStagedCallReturnSourcesForPurpose(*source.declarationCall, owner, root.consumer)
	if !valid {
		return
	}
	// The bounded SOURCE domain has an explicit terminal return. This avoids
	// treating a return inventory as proof that a fallthrough alternative is
	// absent. Earlier return alternatives still all participate in the plan;
	// abrupt receiver work remains on the original Call Effects producer.
	body := plan.declaration.Body()
	if body == nil || !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) == 0 || !ast.IsReturnStatement(body.AsBlock().Statements.Nodes[len(body.AsBlock().Statements.Nodes)-1]) {
		return
	}
	b.sourceEffects = &sourceStagedSetEffectsBorrow{work: work, facts: facts, owner: owner, root: root, query: q, plan: plan}
}

// liveAssignmentSourceEffects rechecks the original publisher/Program interval;
// copied, revoked or cross-graph loans cannot supply member coverage. The exact
// executable owns the loan; dependency queries keep fresh value state while
// sharing only its Program/checker/generation and static source summaries.
func (q *sourceValueQuery) liveAssignmentSourceEffects() *sourceStagedSetEffectsBorrow {
	b := q.liveStagedAssignment()
	if b == nil || b.sourceEffects == nil {
		return nil
	}
	s := b.sourceEffects
	if s.query != q || s.work == nil || s.work.operationGeneration != b.generation || s.owner == nil || s.owner.values == nil || q.executable != s.owner || q.owner.program != s.owner.values.program || q.owner.checker != s.owner.values.checker || q.owner.generation != s.owner.values.generation || s.root.use != b.request.operation || q.executable.project == nil || q.executable.project.activeGeneration != b.generation {
		return nil
	}
	if s.sourceInput != nil {
		if !s.work.assignmentEffectsInputCurrent(*s.sourceInput) {
			return nil
		}
		return s
	}
	publisher := s.owner.pendingMemberPublishers[s.root.consumer]
	caller, known := s.work.memberNodes[s.root.consumer]
	if !known || publisher == nil || !publisher.live || publisher.fact != &s.facts[caller] {
		return nil
	}
	return s
}

// projectAssignmentSourceReceiver follows only the original immutable captured
// binding source. Every pending/unsupported return remains alongside known
// branches. The original member publisher still owns writer/prototype coverage.
func (q *sourceValueQuery) projectAssignmentSourceReceiver(node *ast.Node, mode accessorTraversal, result *accessorCandidates, visit func(*ast.Node, []string, bool)) bool {
	s := q.liveAssignmentSourceEffects()
	if s == nil || mode != accessorSet|accessorNoGet || s.active {
		return false
	}
	if s.sourceInput != nil {
		if node != s.sourceInput.access.reference.Expression() {
			return false
		}
		root := s.work.assignmentEffectsInputRoot(*s.sourceInput, s.owner)
		if root == nil {
			return false
		}
		s.active = true
		defer func() { s.active = false }()
		visit(root, nil, false) // Original member publisher still owns all alternatives.
		return true
	}
	if node != s.plan.operation {
		return false
	}
	s.active = true
	defer func() { s.active = false; s.current = nil }()
	complete := len(s.plan.branches) != 0
	for i := range s.plan.branches {
		branch := &s.plan.branches[i]
		binding := branch.binding
		if branch.pending || binding == nil || !ast.IsVariableDeclaration(binding) || branch.endpoint.producer != binding || enclosingCallableNode(binding) != s.root.consumer || binding.Initializer() == nil || !ast.IsObjectLiteralExpression(binding.Initializer()) {
			complete = false
			continue
		}
		s.current = branch
		visit(binding.Initializer(), nil, false)
		s.current = nil
	}
	if !complete {
		q.liveStagedAssignment().complete = false
		result.valueIncomplete = true
	}
	return true
}

// supplyAssignmentSourceSetter is called by the genuine original member visitor
// in the SOURCE-purpose interval. It cannot call staged.consume or issue B.
func (q *sourceValueQuery) supplyAssignmentSourceSetter(body *ast.Node, get *sourceGetInputs, mode accessorTraversal, result *accessorCandidates) bool {
	s := q.liveAssignmentSourceEffects()
	if s == nil || !s.active || !ast.IsSetAccessorDeclaration(body) || mode != accessorSet|accessorNoGet {
		return false
	}
	b := q.liveStagedAssignment()
	if s.sourceInput != nil || !plainStagedAssignment(s.root.use) {
		result.retainCallableEffect(b.request.target, body)
		b.observed, b.allData, b.complete = true, false, false
		q.recordStagedAssignmentCoverage(b.alternative)
		return true // No numeric input value/B is fabricated for an authored hook.
	}
	if s.current == nil {
		return false
	}
	if get == nil || get.operation != b.request.target || b.alternative == nil || b.alternative.get != get || body.Parent != s.current.binding.Initializer() || b.alternative.origin != body.Parent {
		if get != nil {
			result.retainCallableEffect(get.operation, body) // Known inherited/unsupported donor stays MAY.
		}
		b.complete = false
		result.valueIncomplete = true
		return true
	}
	// Coverage is issued only by the original member publisher, not this
	// return branch or the checker's possible declaration list.
	q.recordStagedAssignmentCoverage(b.alternative)
	b.observed, b.allData, b.alternative.setter = true, false, true
	supplier := s.work.describeSetEffectsSupplier(s.facts, s.root, body, s.owner)
	supplier.receiverBinding, supplier.receiver = s.current.binding, s.current.endpoint
	s.suppliers = append(s.suppliers, supplier)
	b.complete = b.complete && supplier.complete
	return true
}

// describeSetEffectsSupplier substitutes the canonical summary's original
// references. Local/capture endpoints keep their declaring binding and read;
// store-only next names the authored RHS source without requesting normal DATA.
// This reducer neither follows values nor simulates the setter's operations.
func (work *callableEffectWork) describeSetEffectsSupplier(facts []callableFacts, root sourceStagedOperationRequest, body *ast.Node, owner *executableBodyOwner) sourceStagedSetEffectsSupplier {
	out := sourceStagedSetEffectsSupplier{declaration: body, complete: true, sourceInputsReady: true}
	_, known := work.memberNodes[body]
	if !known || body.Parent == nil || enclosingCallableNode(body.Parent) != root.consumer {
		out.complete = false
		out.sourceInputsReady = false
		return out
	}
	index := owner.values.index(ast.GetSourceFileOfNode(body))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		out.complete = false
		out.sourceInputsReady = false
		return out
	}
	for _, node := range owner.values.summary(body).nodes {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil {
			out.complete = false
			out.sourceInputsReady = false
			continue
		}
		binding := symbol.ValueDeclaration
		lexical := enclosingCallableNode(binding)
		role := sourceRelativeRole{kind: relativeRoleCapture, declaration: body, binding: binding}
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: node, producer: binding, get: node, cut: sourceRelativeCut{operation: root.use, reading: node}}
		if lexical == body {
			if !ast.IsParameterDeclaration(binding) {
				continue // Canonical local initializer/body owners remain required.
			}
			if len(body.Parameters()) != 1 || body.Parameters()[0] != binding || binding.Initializer() != nil || binding.AsParameterDeclaration().DotDotDotToken != nil || owner.values.bindingWritten(symbol) {
				out.complete = false
				out.sourceInputsReady = false
				continue
			}
			role = sourceRelativeRole{kind: relativeRoleFormal, declaration: body, slot: 0}
			// A read which invokes/coerces/inspects next needs its real result
			// producer. The initial store domain does not infer that precision.
			parent := node.Parent
			if parent == nil || !ast.IsBinaryExpression(parent) || parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || parent.AsBinaryExpression().Right != node {
				out.complete = false
				out.sourceInputsReady = false
			}
			endpoint.expression, endpoint.producer = root.use.AsBinaryExpression().Right, root.use
			endpoint.cut = sourceRelativeCut{operation: root.use, reading: root.use.AsBinaryExpression().Left}
		} else if lexical == root.consumer {
			writeOnly := node.Parent != nil && ast.IsBinaryExpression(node.Parent) && node.Parent.AsBinaryExpression().Left == node && node.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken
			if !writeOnly && (owner.values.bindingWritten(symbol) || capturedBindingMutated(symbol, owner)) {
				out.complete = false
				out.sourceInputsReady = false // No raw entry for a live written capture.
			}
		} else if lexical != nil {
			out.complete = false
			out.sourceInputsReady = false // No cross-activation substitution.
		} else {
			continue // Module/standard sources keep their canonical effect owner.
		}
		out.bindings = append(out.bindings, sourceRelativeBinding{target: role, sources: []sourceRelativeEndpoint{endpoint}})
	}
	return out
}

// finishAssignmentSourceEffects accepts descriptions only after this source
// loan has produced matching original member coverage. The existing relative
// phase consumes the same canonical body dependency; no selected binder runs.
func (work *callableEffectWork) finishAssignmentSourceEffects(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, b *sourceStagedAssignmentBorrow, owner *executableBodyOwner) {
	s := q.liveAssignmentSourceEffects()
	if s == nil || len(s.suppliers) == 0 {
		return
	}
	if len(b.covered) == 0 {
		b.complete = false
		return
	}
	receipt := &sourceStagedSetEffectProjection{work: work, issuer: b.identity, root: root, generation: b.generation, inputPlan: s.plan, inputPopulationReady: work.setInputPopulationReady(root, s, b)}
	s.receipt = receipt
	var requiredSources []sourceStagedOperationRequest
	for i := range s.suppliers {
		supplier := &s.suppliers[i]
		accesses, complete := work.reduceSetBodyReadWrites(facts, root, supplier, owner)
		supplier.accesses = accesses
		supplier.complete = supplier.complete && complete
		receipt.suppliers = append(receipt.suppliers, *supplier)
		caller := work.memberNodes[root.consumer]
		target, known := work.memberNodes[supplier.declaration]
		if !known {
			b.complete = false
			continue
		}
		invocation := sourceRelativeInvocation{declaration: supplier.declaration, operation: root.use, cut: b.cut, use: q.effectUse()}
		edge := stagedDeclarationCallEdge(facts[caller].summary.ID, invocation) + ":source-effects"
		work.requireStagedSummary(facts, caller, target, edge, root.use, b.cut)
		work.stagedRequired[sourceStagedDependencyKey{caller, edge}].projectionPending = true
		work.operationInvocationOnEdge(facts, caller, target, root.use, b.cut, edge)
		for _, binding := range supplier.bindings {
			for _, endpoint := range binding.sources {
				read := endpoint.get
				if read == nil || !ast.IsIdentifier(read) || enclosingCallableNode(read) != supplier.declaration {
					supplier.complete = false
					continue
				}
				if read.Parent != nil && ast.IsBinaryExpression(read.Parent) && read.Parent.AsBinaryExpression().Left == read && read.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					continue // A write destination is not a read of its raw entry.
				}
				if binding.target.kind == relativeRoleFormal {
					// The original source Set, not a returned endpoint, owns the
					// RHS evaluation/throw contribution. Storage needs that SOURCE
					// relationship, not the getter's normal returned value.
					if binding.target.slot != 0 || endpoint.expression != root.use.AsBinaryExpression().Right || endpoint.producer != root.use || endpoint.cut != (sourceRelativeCut{operation: root.use, reading: root.use.AsBinaryExpression().Left}) {
						supplier.complete = false
						continue
					}
					requiredSources = appendEntryLawRequirement(requiredSources, stagedAssignmentRequest(root, "rhs"))
				}
				source, eligible := work.describeStagedCallResultSource(facts, target, read, owner)
				if !eligible || source == nil || source.generation != b.generation {
					supplier.complete = false
					continue
				}
				if binding.target.kind == relativeRoleCapture && (source.binding != endpoint.producer || endpoint.expression != read) || binding.target.kind == relativeRoleFormal && source.binding != supplier.declaration.Parameters()[0] {
					supplier.complete = false
					continue
				}
				child := sourceStagedOperationRecipe{key: source.request.producer, callResult: source}
				if _, exists := work.operationRecipes[child.key]; !exists && !work.registerOperationRecipe(facts, child) {
					supplier.complete = false
					continue
				}
				requiredSources = appendEntryLawRequirement(requiredSources, source.request)
			}
		}
		b.complete = b.complete && supplier.complete
	}
	for _, required := range requiredSources {
		b.covered = appendEntryLawRequirement(b.covered, required)
	}
}

// assignmentSourceReadRequirement admits only the original same-activation
// binding read SOURCE in the Set phase. It grants no ordinary Get DATA or B.
func assignmentSourceReadRequirement(s *sourceStagedAssignment, r sourceStagedOperationRequest) bool {
	if s == nil || s.phase != "set" || r.use == nil || !ast.IsIdentifier(r.use) {
		return false
	}
	return sameOperationRequest(r, stagedBindingResultRequest(r.use, r.producer.declaration)) && r.producer.kind == relativeDemandDirectExposure && ast.IsSetAccessorDeclaration(r.producer.declaration) && enclosingCallableNode(r.producer.declaration.Parent) == s.root.consumer && sourceStagedOccurrenceOwned(r.use, r.producer.declaration)
}

// prepareRelativeSetEffects consumes canonical body revisions on the existing
// relative phase. SOURCE bindings never become generic invocation inputs.
func (work *callableEffectWork) prepareRelativeSetEffects(facts []callableFacts, owner *executableBodyOwner) {
	for _, observation := range work.assignmentObserved {
		if observation == nil || !observation.local || observation.effects == nil {
			continue
		}
		receipt := observation.effects
		if receipt.work != work || receipt.generation != work.operationGeneration || observation.disposition == nil || receipt.issuer != observation.disposition.issuer {
			continue
		}
		for _, supplier := range receipt.suppliers {
			for _, access := range supplier.accesses {
				if !access.write || !stagedAssignmentOperation(access.operation) {
					continue
				}
				for _, required := range access.required {
					source := work.operationRecipes[required.producer].assignment
					if source == nil || source.phase != "" || source.sourceInput.parent.use != receipt.root.use {
						continue
					}
					if id, adopted := work.operationIDs[required.producer]; adopted {
						work.prepareStagedAssignment(facts, id, owner)
					} else {
						work.refreshStagedAssignmentSource(facts, work.operationRecipes[required.producer], owner)
					}
				}
			}
		}
		closed := work.closedOperationDependencies()
		caller := work.memberNodes[receipt.root.consumer]
		for _, supplier := range receipt.suppliers {
			body := supplier.declaration
			target, known := work.memberNodes[body]
			if !known || !facts[target].staged.ready {
				continue
			}
			invocation := sourceRelativeInvocation{declaration: body, operation: receipt.root.use, cut: observation.disposition.cut, use: observation.disposition.cut.use}
			edge := stagedDeclarationCallEdge(facts[caller].summary.ID, invocation) + ":source-effects"
			dependency := work.stagedRequired[sourceStagedDependencyKey{caller, edge}]
			if dependency == nil {
				continue
			}
			// Only the purpose-specific Source read/store domain is admitted.
			// Invoked captures and mutation applications need their real owners;
			// this receipt cannot acknowledge them as current or delivered.
			dependency.projectionPending = len(facts[target].staged.invoked) != 0 || !work.setBodyReadWritesCovered(facts[target].staged.mutationBody, supplier.accesses, receipt.generation, closed)
			for _, source := range facts[target].summary.DirectEffectSources {
				dependency.projectionPending = dependency.projectionPending || source.relativeMutation != nil || source.relativeInput != nil || source.provenanceIncomplete && source.Opaque
			}
			work.observeStagedSummary(facts, caller, target, edge)
		}
	}
}

// assignmentSourceEffectsCurrent validates local source/input accounting and
// consumed BODY revisions. Required operation children and callable settlement
// remain separate conjunctions; this is not normal execution or Set completion.
func (work *callableEffectWork) assignmentSourceEffectsCurrent(receipt *sourceStagedSetEffectProjection) bool {
	if receipt == nil || receipt.work != work || receipt.generation != work.operationGeneration || !receipt.generation.active || receipt.generation.project == nil || receipt.generation.project.activeGeneration != receipt.generation || receipt.issuer == nil || receipt.issuer.generation != work.operationGeneration || receipt.issuer.operation != receipt.root.use {
		return false
	}
	observation := work.assignmentObserved[receipt.root.producer]
	if observation == nil || observation.effects != receipt || observation.disposition == nil || observation.disposition.issuer != receipt.issuer || receipt.issuer.observation != observation || !work.passiveAssignmentSourceReady(work.operationRecipes[receipt.root.producer]) {
		return false
	}
	if !work.originalWriterReadWritesConsumed(receipt) {
		return false
	}
	caller := work.memberNodes[receipt.root.consumer]
	for _, supplier := range receipt.suppliers {
		body := supplier.declaration
		target, known := work.memberNodes[body]
		invocation := sourceRelativeInvocation{declaration: body, operation: receipt.root.use, cut: observation.disposition.cut, use: observation.disposition.cut.use}
		edge := stagedDeclarationCallEdge(work.operationFacts[caller].summary.ID, invocation) + ":source-effects"
		dependency := work.stagedRequired[sourceStagedDependencyKey{caller, edge}]
		if !known || dependency == nil || dependency.invalid || dependency.projectionPending || target >= len(work.stagedRevisions) || !work.operationFacts[target].staged.ready || dependency.consumed != work.stagedRevisions[target] {
			return false
		}
	}
	return true
}

// refreshSetSourceBodyRevision uses the already published original setter MAY
// edge, not a selected setter or an inventory-discovered association. Existing
// summary consumption coalesces unchanged revisions. Only the original Set
// owner can renew its SOURCE receipt; no saved issuer or payload is reused.
func (work *callableEffectWork) refreshSetSourceBodyRevision(facts []callableFacts, consumer, producer int, edge CallEdge, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.checker != owner.values.checker || owner.project == nil || work.operationPreparing || facts[consumer].normalInputs != nil || edge.sourceUse != nil || !ast.IsSetAccessorDeclaration(facts[producer].node) || enclosingCallableNode(facts[producer].node.Parent) != facts[consumer].node {
		return false
	}
	target := facts[consumer].fieldEdgeOperations[edge.ID]
	if target == nil || target.Parent == nil || !plainStagedAssignment(target.Parent) || target.Parent.AsBinaryExpression().Left != target {
		return false
	}
	root := work.operationRecipes[sourceStagedOperationKey{declaration: facts[consumer].node, operation: target.Parent, kind: relativeDemandEffects}]
	s := root.assignment
	if s == nil || s.phase != "" || root.delta.extracted || s.generation == nil || s.generation != work.operationGeneration || s.generation != owner.values.generation || owner.project.activeGeneration != s.generation || !s.generation.active || owner.values.program.GetSourceFile(facts[consumer].sourceFile.FileName()) != facts[consumer].sourceFile || work.assignmentObserving[s.root.producer] {
		return false
	}
	p := owner.pendingMemberPublishers[s.root.consumer]
	if p == nil || !p.live || p.fact != &facts[consumer] {
		return false
	}
	key := sourceStagedDependencyKey{consumer, edge.ID}
	if work.stagedRequired[key] == nil {
		work.requireStagedSummary(facts, consumer, producer, edge.ID, s.root.use, s.root.cut)
	}
	d := work.stagedRequired[key]
	if d.invalid || d.producer != producer || !validSetSourceRevisionCut(d.operation, d.cut, target, s.root.use) || producer >= len(work.stagedRevisions) || work.stagedRevisions[producer] == 0 || d.consumed == work.stagedRevisions[producer] {
		return false
	}
	// This is operation preparation inside the existing effect-propagation
	// owner. Nested preparation cannot deliver before the fresh receipt exists.
	work.operationPreparing = true
	defer func() { work.operationPreparing = false }()
	work.observeStagedAssignment(facts, s.root, owner, false)
	return true
}

// A BODY revision may invalidate this original Set use, not a foreign reading.
func validSetSourceRevisionCut(operation *ast.Node, cut sourceRelativeCut, target, root *ast.Node) bool {
	return (operation == target || operation == root) && (cut.operation == target || cut.operation == root) && (cut.reading == target || cut.reading == root) && (cut.use == nil || cut.use == root) && cut.initializing == nil && cut.returning == nil && cut.invoking == nil
}

// qualifiedGetSourceInputsCurrent authenticates input association independently
// of BODY accounting. Every original return branch must agree for this exact Get.
// It grants only the no-binding Effects member purpose, never ordinary inputs.
func (work *callableEffectWork) qualifiedGetSourceInputsCurrent(in sourceAssignmentEffectsInput, owners ...*executableBodyOwner) bool {
	g := work.operationGeneration
	if g == nil || !g.active || g.project == nil || g.project.activeGeneration != g || in.access.generation != g {
		return false
	}
	o := work.assignmentObserved[in.parent.producer]
	if o == nil || o.effects == nil || !o.effects.inputPopulationReady || o.effects.work != work || o.effects.generation != g || o.effects.issuer == nil || o.effects.issuer.observation != o || o.disposition == nil || o.disposition.issuer != o.effects.issuer || o.effects.issuer.disposition != o.disposition || !work.assignmentEffectPrefixMatches(in.parent, o) {
		return false
	}
	get := in.access.reference
	if get == nil || get.Parent == nil || get.Parent.Parent == nil {
		return false
	}
	call := get.Parent.Parent
	request, known := work.memberProtocolSources[call]
	native := work.operationRecipes[request.producer].nativeGet
	if !known || !work.arrayPushPrefixCurrent(native) || native.request.consumer != in.access.declaration {
		return false
	}
	if len(owners) > 1 || len(owners) == 1 && native.effectsSource.arrayIssuer.owner != owners[0] {
		return false
	}
	argument, supported := arrayPushArgumentGet(native)
	if !supported || argument != get {
		return false
	}
	plan := o.effects.inputPlan
	if plan.operation != in.access.receiver || len(plan.branches) == 0 {
		return false
	}
	for _, branch := range plan.branches {
		if branch.pending || branch.binding == nil {
			return false
		}
		matched := false
		for _, supplier := range o.effects.suppliers {
			if !supplier.sourceInputsReady || supplier.declaration != in.access.declaration || supplier.receiverBinding != branch.binding || !sameOperationEndpoint(supplier.receiver, branch.endpoint) {
				continue
			}
			expected, valid := setEffectReference(&supplier, get, in.parent, g)
			expected.operation, expected.read = get, true
			if valid && sameAssignmentEffectsInput(sourceAssignmentEffectsInput{parent: in.parent, access: expected}, in) {
				matched = true
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

// The original member traversal issues population readiness before any BODY
// reduction. Indexed coverage means issued source children, never child closure.
func (work *callableEffectWork) setInputPopulationReady(root sourceStagedOperationRequest, s *sourceStagedSetEffectsBorrow, b *sourceStagedAssignmentBorrow) bool {
	if !b.observed || b.external || len(b.alternatives) == 0 || len(s.plan.branches) == 0 {
		return false
	}
	for _, branch := range s.plan.branches {
		if branch.pending || branch.binding == nil {
			return false
		}
		supplied := false
		for _, supplier := range s.suppliers {
			supplied = supplied || supplier.sourceInputsReady && supplier.receiverBinding == branch.binding && sameOperationEndpoint(supplier.receiver, branch.endpoint) && supplier.declaration.Parent == branch.binding.Initializer()
		}
		if !supplied {
			return false
		}
	}
	for _, alternative := range b.alternatives {
		if alternative.external || !alternative.setter || alternative.sourceStagedAssignmentAlternative.get != stagedAssignmentTarget(root.use) {
			return false
		}
		owned := false
		for _, supplier := range s.suppliers {
			owned = owned || supplier.sourceInputsReady && supplier.declaration.Parent == alternative.origin && supplier.receiverBinding != nil && supplier.receiverBinding.Initializer() == alternative.origin
		}
		if !owned {
			return false
		}
		covered := false
		for _, required := range b.covered {
			recipe := work.operationRecipes[required.producer]
			source := recipe.memberSource
			covered = covered || source != nil && source.coverage != nil && source.coverage.origin == alternative.origin && source.coverage.extracted && source.generation == b.generation && validStagedMemberCoverageRecipe(recipe)
		}
		if !covered {
			return false
		}
	}
	return true
}
