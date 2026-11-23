package exactcompiler

// fieldFallbackFulfilled checks an immutable construction result against the
// current resolved edge. No summary display string or target-wide waiver grants
// coverage. Merge replacements and ambiguous edge identities retain fallback.
func fieldFallbackFulfilled(caller, target *callableFacts, edge CallEdge, source EnvironmentEffectSource) bool {
	origin := source.fieldOrigin
	if origin == nil || source.Environment != "unknown" || !source.Opaque || !source.provenanceIncomplete || source.fieldForwarded || origin.declaration != target.node || !edge.Resolved || edge.TargetID != target.summary.ID {
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
	// A normal-output refusal cannot erase independently accounted source
	// effects for this exact operation and demand. Other unknown sources keep
	// their own obligations and are never released by this association.
	sourceSummary := false
	for _, call := range caller.fieldCalls {
		if call.dependencies && call.operation == operation && call.target == target.node {
			for _, outcome := range call.outcomes {
				sourceSummary = sourceSummary || sameFieldObligation(outcome.demand, *origin)
			}
		}
	}
	matched := false
	for _, call := range caller.fieldCalls {
		if sourceSummary && (!call.dependencies || call.target != target.node) {
			continue
		}
		if call.operation != operation {
			continue
		}
		if call.target != target.node || !call.complete {
			return false
		}
		covered := false
		for _, outcome := range call.outcomes {
			if sameFieldObligation(outcome.demand, *origin) {
				if !outcome.fulfilled {
					return false
				}
				covered = true
			}
		}
		if !covered {
			return false
		}
		matched = true
	}
	return matched
}

// fieldSourceIdentity participates in internal joins before public display
// deduplication. Forwarded demands can never be discharged transitively.
func fieldSourceIdentity(source EnvironmentEffectSource) string {
	relative := relativeInvokedSourceIdentity(source) + relativeCoercionIdentity(source) + relativeFieldMutationIdentity(source.relativeMutation)
	if source.orderedSetupDescriptor {
		relative += ":ordered-descriptor"
	}
	if source.fieldOrigin == nil {
		return relative + callSourceIdentity(source) + descriptorSourceIdentity(source)
	}
	key := ":field:" + source.fieldOrigin.identity()
	if source.fieldForwarded {
		key += ":forwarded"
	}
	if source.componentReactiveField {
		key += ":component-reactive"
	}
	return relative + key + callSourceIdentity(source) + descriptorSourceIdentity(source)
}

// displayEnvironmentSources preserves the existing process-facing summary shape
// and deduplication without feeding collapsed copies back into analysis facts.
func displayEnvironmentSources(values []EnvironmentEffectSource) []EnvironmentEffectSource {
	display := append([]EnvironmentEffectSource(nil), values...)
	for i := range display {
		clearEnvironmentSourceProvenance(&display[i])
	}
	return uniqueEnvironmentSources(display)
}

// displayDirectEnvironmentSources collects original direct Gets before stripping
// their provenance. Other summary consumers use the ordinary display path.
func displayDirectEnvironmentSources(fact *callableFacts, setup *setupCallCandidates) []EnvironmentEffectSource {
	values := fact.summary.DirectEffectSources
	if setup.owner == nil || setup.owner.values == nil || len(setup.owner.values.components) == 0 {
		return displayEnvironmentSources(values)
	}
	display := append([]EnvironmentEffectSource(nil), values...)
	for i := range display {
		if field := display[i].fieldOrigin; field != nil {
			setup.collect(fact, field)
		}
		clearEnvironmentSourceProvenance(&display[i])
	}
	return uniqueEnvironmentSources(display)
}

func clearEnvironmentSourceProvenance(source *EnvironmentEffectSource) {
	source.relativeInput = nil
	source.relativeMutation = nil
	source.relativeCoercion = nil
	source.callOrigin = nil
	source.callForwarded = false
	source.fieldOrigin = nil
	source.fieldForwarded = false
	source.componentReactiveField = false
	source.descriptorOrigin = nil
	source.descriptorForwarded = false
	source.orderedSetupDescriptor = false
}
