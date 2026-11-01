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
	matched := false
	for _, call := range caller.fieldCalls {
		if call.operation != operation {
			continue
		}
		if call.target != target.node || !call.complete {
			return false
		}
		covered := false
		for _, outcome := range call.outcomes {
			if outcome.demand == *origin {
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
	if source.fieldOrigin == nil {
		return callSourceIdentity(source) + descriptorSourceIdentity(source)
	}
	key := ":field:" + source.fieldOrigin.identity()
	if source.fieldForwarded {
		key += ":forwarded"
	}
	return key + callSourceIdentity(source) + descriptorSourceIdentity(source)
}

// displayEnvironmentSources preserves the existing process-facing summary shape
// and deduplication without feeding collapsed copies back into analysis facts.
func displayEnvironmentSources(values []EnvironmentEffectSource) []EnvironmentEffectSource {
	display := append([]EnvironmentEffectSource(nil), values...)
	for i := range display {
		display[i].callOrigin = nil
		display[i].callForwarded = false
		display[i].fieldOrigin = nil
		display[i].fieldForwarded = false
		display[i].descriptorOrigin = nil
		display[i].descriptorForwarded = false
	}
	return uniqueEnvironmentSources(display)
}
