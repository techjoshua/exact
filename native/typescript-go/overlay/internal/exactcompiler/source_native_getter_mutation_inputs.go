package exactcompiler

// liveInstalledGetterMutationInputs authenticates the original zero-actual Get
// binder interval. An outer trap's input lease is never a getter binding. The
// detached result only describes SOURCE inputs; real Get owns BODY execution.
func (q *sourceValueQuery) liveInstalledGetterMutationInputs(request sourceRelativeInvocation, inputs *sourceValueInputs) bool {
	if q == nil || q.owner == nil || q.installedGetBody == nil || inputs == nil || request.inputKind != relativeInputSourceGetter || request.declaration != inputs.declaration || request.operation == nil || !request.actualsKnown || len(request.actuals) != 0 || request.cut != q.relativeInputCut(request.operation) || request.use != q.effectUse() || q.operation != nil || !q.dependenciesOnly {
		return false
	}
	b := q.installedGetBody
	return b.live && b.issuer == q && b.inputs == inputs && b.body == request.declaration && b.generation == q.owner.generation && q.relativeInputBinding == inputs && q.installedSourceGetterObservation(b.body, request.operation, inputs) == b.get
}

// describeNativeGetterMutationInputs is called by the actual installed getter
// publisher before consuming its BODY. Requested captures come only from the
// original indexed writer templates, never a later AST/binding reconstruction.
func (work *callableEffectWork) describeNativeGetterMutationInputs(facts []callableFacts, q *sourceValueQuery, inputs *sourceValueInputs, get *sourceGetInputs) *sourceRelativeInputEdge {
	if q == nil || q.owner == nil || q.owner.generation != work.operationGeneration || inputs == nil || get == nil || q.installedSourceGetterObservation(inputs.declaration, get.operation, inputs) != get {
		return nil
	}
	phase := q.installedMemberNativePhase
	actor, known := work.memberNodes[inputs.declaration]
	caller, owned := work.memberNodes[q.effectOwner]
	if phase == nil || !phase.live || phase.issuer != q || phase.generation != work.operationGeneration || phase.publisher == nil || !phase.publisher.live || !known || actor < 0 || actor >= len(facts) || !owned || caller < 0 || caller >= len(facts) || phase.publisher.fact != &facts[caller] || q.executable.pendingMemberPublishers[q.effectOwner] != phase.publisher {
		return nil
	}
	request, described := mutationGetterInvocation(q, inputs, get)
	if !described {
		return nil
	}
	for _, retained := range facts[actor].staged.mutationWriters {
		template, current := currentMutationWriterTemplate(retained, q.owner)
		if !current || template.role.kind != relativeRoleCapture {
			continue
		}
		seen := false
		for _, capture := range request.captures {
			seen = seen || capture.target == template.role
		}
		if !seen {
			request.captures = append(request.captures, sourceRelativeBinding{target: template.role})
		}
	}
	edge := publishMutationGetterBindings(q, inputs, get, request)
	if edge == nil {
		return nil
	}
	// Retain the actual phase relation, rather than copying the trap binder as
	// the getter's inputs. Local RHS description cannot pay this child.
	event := q.stagedMember.installedMember
	if event == nil || !event.live || event.issuer != q || event.get != get || event.application.generation != work.operationGeneration {
		return nil
	}
	q.installedGetBody.mutationRequired = appendEntryLawRequirement(nil, event.application.request)
	for _, required := range event.application.inputRequired {
		q.installedGetBody.mutationRequired = appendEntryLawRequirement(q.installedGetBody.mutationRequired, required)
	}
	return edge
}
