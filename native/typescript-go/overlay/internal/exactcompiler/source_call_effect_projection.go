package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// callableCallEffects is descriptive per-call EFFECT knowledge. It supplies no
// target identity, value/DATA, BODY, currentness or APPLIED authority. Canonical
// callable/state/context/dependency/ownership summaries remain unchanged.
type callableCallEffects struct {
	Effect        string
	EffectSources []EnvironmentEffectSource
}

// appendCallableEdgeEffectSources is the canonical target-to-caller transfer.
// Both fixed-point propagation and call-site consumers apply this exact order.
// A consumer without the live installed-current callback keeps that debt; stored
// recipes and completed source descriptions never substitute for an ACK.
func appendCallableEdgeEffectSources(into []EnvironmentEffectSource, caller, target *callableFacts, edge CallEdge, owner *executableBodyOwner, installed ...func(*sourceInstalledMemberRequirement) bool) []EnvironmentEffectSource {
	for _, source := range target.summary.EffectSources {
		if transferred, covered := stagedRelativeCoercionTransfer(caller, edge, source); covered {
			into = append(into, transferred...)
			continue
		}
		if transferred, covered := stagedRelativeInputTransfer(caller, edge, source); covered {
			into = append(into, transferred...)
			continue
		}
		if sourceObligationCoveredOnEdge(caller, target, edge, source, installed...) || mapInputFallbackFulfilled(caller, target, edge, source, owner) || fieldFallbackFulfilled(caller, target, edge, source) || callFallbackFulfilled(caller, target, edge, source) || descriptorFallbackFulfilled(caller, target, edge, source) {
			continue
		}
		transferred := source
		transferred.componentReactiveField = false
		operation := caller.callExpressions[edge.ID]
		if operation == nil {
			operation = caller.fieldEdgeOperations[edge.ID]
		}
		transferred = sourceDefaultPhaseEffect(transferred, operation, caller.node)
		if len(source.Path) == 0 || source.Path[0] != caller.summary.Name {
			transferred.Path = append([]string{caller.summary.Name}, source.Path...)
		}
		if transferred.callOrigin != nil {
			transferred.callForwarded = true
		}
		if transferred.descriptorOrigin != nil {
			transferred.descriptorForwarded = true
		}
		if transferred.fieldOrigin != nil {
			transferred.fieldForwarded = true
			transferred.componentReactiveField = edge.componentReactiveProducer && !source.fieldForwarded &&
				source.fieldOrigin.declaration == target.node && source.fieldOrigin.consumer == target.node
		}
		into = append(into, transferred)
	}
	return into
}

// callableSourceProjectionCurrent checks source compatibility, not a live
// execution loan. Completed descriptions may survive a released collector or a
// compatible cache clone; a replaced/abandoned Program cannot lend its proofs.
func callableSourceProjectionCurrent(analysis callableAnalysis, source *ast.SourceFile) bool {
	owner := analysis.owner
	if source == nil || owner == nil || owner.values == nil || owner.project == nil || owner.project.abandoned || owner.values.program == nil || owner.values.program != owner.project.program || owner.checker != owner.values.checker {
		return false
	}
	generation := owner.values.generation
	return generation != nil && generation.project == owner.project && generation.program == owner.values.program && generation.checker == owner.checker && owner.values.program.GetSourceFile(source.FileName()) == source
}

// projectedCallableEffectsForCall joins every existing real Call effect-edge
// alternative at the exact source operation. Unknown/missing alternatives remain
// independent compiler debt; no first-target or whole-caller summary is used.
func projectedCallableEffectsForCall(analysis callableAnalysis, source *ast.SourceFile, position int) (callableCallEffects, bool) {
	var effects []EnvironmentEffectSource
	current := callableSourceProjectionCurrent(analysis, source)
	resolved, unresolved := false, false
	for i := range analysis.facts {
		caller := &analysis.facts[i]
		if caller.sourceFile != source {
			continue
		}
		for _, edge := range caller.summary.Calls {
			operation := caller.fieldEdgeOperations[edge.ID]
			// A contextual source parent aggregates its original child EFFECTS;
			// it never renames that Get/Call as a new operation or pays DATA.
			use := edge.sourceUse
			direct := use == nil && operation != nil && ast.IsCallExpression(operation) && operation.Pos() == position && ast.GetSourceFileOfNode(operation) == source
			contextual := false
			if current && use != nil && ast.IsCallExpression(use) && use.Pos() == position && ast.GetSourceFileOfNode(use) == source && enclosingCallableNode(use) == caller.node && operation != nil {
				childSource := ast.GetSourceFileOfNode(operation)
				_, component := analysis.owner.values.components[caller.node]
				contextual = component && childSource != nil && analysis.owner.values.program.GetSourceFile(childSource.FileName()) == childSource
			}
			if !direct && !contextual {
				continue
			}
			if !edge.Resolved {
				unresolved = true
				continue
			}
			resolved = true
			targetIndex := -1
			ambiguous := false
			// These are the canonical propagation's existing target indices, not a
			// second symbol/receiver/callee query or a new index/cache.
			for _, index := range caller.targets {
				if index < 0 || index >= len(analysis.facts) || analysis.facts[index].summary.ID != edge.TargetID {
					continue
				}
				if targetIndex >= 0 && targetIndex != index {
					ambiguous = true
					break
				}
				targetIndex = index
			}
			if targetIndex < 0 || ambiguous {
				gap := environmentSource("unknown", "call target source unavailable", caller.summary.Name)
				gap.Opaque, gap.provenanceIncomplete = true, true
				effects = append(effects, gap)
				continue
			}
			target := &analysis.facts[targetIndex]
			if current {
				effects = appendCallableEdgeEffectSources(effects, caller, target, edge, analysis.owner)
			} else {
				effects = append(effects, target.summary.EffectSources...)
			}
		}
	}
	// Pure declaration-owned platform calls keep their established classifier.
	// With an actual authored target, unresolved siblings cannot be discarded.
	if !resolved {
		return callableCallEffects{}, false
	}
	if unresolved {
		gap := environmentSource("unknown", "call target alternative unresolved", "")
		gap.Opaque, gap.provenanceIncomplete = true, true
		effects = append(effects, gap)
	}
	effects = uniqueEnvironmentSources(effects)
	return callableCallEffects{Effect: environmentEffectFor(effects), EffectSources: effects}, true
}
