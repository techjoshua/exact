package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceCandidateComponents partitions live publication work from immutable
// evidence. Views are copy-on-write. Pending entries share one publication right,
// not semantic occurrence identity. Cache adapters copy only references.
type sourceCandidateComponents struct {
	pending    []*sourceLegacyPublication
	references []*ownedGetContribution
}

// sourceLegacyPublication stays local to the live candidate/fact owner. Its
// narrowed payload may borrow legacy then-reference scopes until the original
// consumer runs. Neither payload nor destination enters a receipt/cache.
type sourceLegacyPublication struct {
	destination *callableFacts
	state       ownedGetPublicationState
	payload     *accessorCandidates
	evidence    *ownedGetContribution
}

// candidatePublisherPayload copies exactly the three existing appenders' inputs,
// plus detached uncertainty/write evidence. It excludes values, installed inputs,
// builders, invocation caches and scope maps except original live then scopes.
func candidatePublisherPayload(c accessorCandidates) accessorCandidates {
	p := accessorCandidates{opaque: c.opaque, thenIncomplete: c.thenIncomplete, receiverIncomplete: c.receiverIncomplete, valueIncomplete: c.valueIncomplete, fieldReceiverIncomplete: c.fieldReceiverIncomplete, cause: c.cause}
	p.callOutcomes = append([]sourceCallOutcome(nil), c.callOutcomes...)
	p.environmentEffects = append([]EnvironmentEffectSource(nil), c.environmentEffects...)
	p.contextEffects = append([]ContextEffect(nil), c.contextEffects...)
	p.effects = append([]sourceCallableEffect(nil), c.effects...)
	p.declarations = append([]*ast.Node(nil), c.declarations...)
	p.accessorMutations = append([]sourceAccessorMutation(nil), c.accessorMutations...)
	p.nativeDescriptorEffects = append([]sourceNativeDescriptorEffect(nil), c.nativeDescriptorEffects...)
	p.fieldFallbacks = append([]sourceFieldDemand(nil), c.fieldFallbacks...)
	p.callFallbacks = append([]sourceCallOutcome(nil), c.callFallbacks...)
	p.descriptorFallbacks = append([]sourceDescriptorEffectOrigin(nil), c.descriptorFallbacks...)
	p.owned = append([]sourceOwnedObligations(nil), c.owned...)
	p.thenReferences = append([]sourceThenReference(nil), c.thenReferences...)
	p.ownedLocalCauses = append([]string(nil), c.ownedLocalCauses...)
	for _, f := range c.fieldCalls {
		p.fieldCalls = append(p.fieldCalls, cloneSourceFieldCall(f))
	}
	for _, w := range c.writes {
		p.writes = append(p.writes, sourceValueWrite{value: sourceValue{node: w.value.node, path: append([]string(nil), w.value.path...)}, operation: w.operation})
	}
	return p
}
func hasCandidatePublisherPayload(p accessorCandidates) bool {
	return p.opaque || p.thenIncomplete || p.receiverIncomplete || p.valueIncomplete || p.fieldReceiverIncomplete || len(p.environmentEffects)+len(p.contextEffects)+len(p.callOutcomes)+len(p.effects)+len(p.declarations)+len(p.accessorMutations)+len(p.nativeDescriptorEffects)+len(p.fieldFallbacks)+len(p.callFallbacks)+len(p.descriptorFallbacks)+len(p.owned)+len(p.thenReferences)+len(p.fieldCalls)+len(p.writes)+len(p.ownedLocalCauses) > 0
}

// candidateEvidence is nonexecuting detached evidence. In particular then scopes
// are never reconstructed or promoted to a callable capability from this view.
func candidateEvidence(payload accessorCandidates) *ownedGetContribution {
	p := candidatePublisherPayload(payload)
	for i := range p.thenReferences {
		p.thenReferences[i].scope = acquiredCallableScope{}
	}
	return &ownedGetContribution{delta: p}
}
func candidateComponentView(c accessorCandidates) *sourceCandidateComponents {
	if c.ownedComponents != nil {
		return c.ownedComponents
	}
	view := &sourceCandidateComponents{}
	payload := candidatePublisherPayload(c)
	if hasCandidatePublisherPayload(payload) {
		entry := &sourceLegacyPublication{payload: &payload, evidence: candidateEvidence(payload)}
		view.pending = append(view.pending, entry)
	}
	return view
}
func appendContributionRefs(dst *[]*ownedGetContribution, src []*ownedGetContribution) {
	for _, p := range src {
		if p == nil {
			continue
		}
		found := false
		for _, old := range *dst {
			found = found || old == p
		}
		if !found {
			*dst = append(*dst, p)
		}
	}
}
func mergeCandidateComponentViews(left, right *sourceCandidateComponents) *sourceCandidateComponents {
	out := &sourceCandidateComponents{}
	for _, v := range []*sourceCandidateComponents{left, right} {
		if v == nil {
			continue
		}
		appendContributionRefs(&out.references, v.references)
		for _, p := range v.pending {
			found := false
			for _, old := range out.pending {
				found = found || old == p
			}
			if !found {
				out.pending = append(out.pending, p)
			}
		}
	}
	return out
}

// mergeCandidateComponents runs before the ordinary effective join. Unmanaged
// legacy operands are promoted at this cut, never classified from merged bits.
func mergeCandidateComponents(result *accessorCandidates, other accessorCandidates) {
	if result.ownedComponents == nil && other.ownedComponents == nil {
		return
	}
	result.ownedComponents = mergeCandidateComponentViews(candidateComponentView(*result), candidateComponentView(other))
}
func ownedPopulationContributions(populations []*ownedGetPopulation) []*ownedGetContribution {
	var refs []*ownedGetContribution
	for _, p := range populations {
		for p != nil {
			appendContributionRefs(&refs, p.components)
			p = p.prefix
		}
	}
	return refs
}

// importCandidateReferences preserves prior legacy work before importing a
// reference-only view. It does not create a destination or publication claim.
func importCandidateReferences(result *accessorCandidates, refs []*ownedGetContribution) {
	if len(refs) == 0 {
		return
	}
	view := candidateComponentView(*result)
	result.ownedComponents = mergeCandidateComponentViews(view, &sourceCandidateComponents{references: refs})
}
func candidateContributionReferences(c accessorCandidates) []*ownedGetContribution {
	refs := ownedPopulationContributions(c.ownedGets)
	if c.ownedComponents != nil {
		appendContributionRefs(&refs, c.ownedComponents.references)
		for _, p := range c.ownedComponents.pending {
			appendContributionRefs(&refs, []*ownedGetContribution{p.evidence})
		}
	}
	return refs
}

// recordCandidateLocalCause is called at the originating setter, including
// same-bit and deferred setters. A sealed prefix does not absorb this new work.
func recordCandidateLocalCause(result *accessorCandidates, node *ast.Node, reason string) {
	if result.ownedComponents == nil {
		return
	}
	payload := accessorCandidates{opaque: true, cause: node, ownedLocalCauses: []string{reason}}
	entry := &sourceLegacyPublication{payload: &payload, evidence: candidateEvidence(payload)}
	result.ownedComponents = mergeCandidateComponentViews(result.ownedComponents, &sourceCandidateComponents{pending: []*sourceLegacyPublication{entry}})
}

// publishLegacyComponent binds only the first actual fact consumer. Published
// or foreign observations cannot steal/repeat that right. Live graphs are dropped
// after the three existing appenders complete; evidence remains detached.
func publishLegacyComponent(fact *callableFacts, p *sourceLegacyPublication, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker) {
	if p == nil || p.state != ownedUnpublished {
		return
	}
	if p.destination == nil {
		p.destination = fact
		fact.ownedLegacyPending = append(fact.ownedLegacyPending, p)
	}
	if p.destination != fact {
		return
	}
	p.state = ownedPublishing
	payload := *p.payload
	appendOpaqueAccessorEffect(fact, payload)
	appendSourceValueWrites(fact, payload, c)
	appendAccessorTargets(fact, node, payload, targets, source)
	p.state = ownedPublished
	publishDescriptorEffectOutcomes(fact, p)
	p.payload = nil
}

func candidateReferenceView(c accessorCandidates) *sourceCandidateComponents {
	if c.ownedComponents == nil && len(c.ownedGets) == 0 {
		return nil
	}
	return &sourceCandidateComponents{references: candidateContributionReferences(c)}
}

// ownedCurrentScalarUncertain inspects completion evidence only. Explicit prefix
// links determine evidence roles; array order and successful value counts do not.
// A historical Return is not a terminal scalar projection for module policy.
func ownedCurrentScalarUncertain(populations []*ownedGetPopulation) bool {
	for _, p := range populations {
		if p == nil || p.receipt == nil {
			return true
		}
		prefixOnly := false
		for _, other := range populations {
			if other == nil {
				continue
			}
			for prefix := other.prefix; prefix != nil; prefix = prefix.prefix {
				if prefix == p {
					prefixOnly = true
					break
				}
			}
		}
		if prefixOnly {
			continue
		}
		rows, ok := p.receipt.project()
		if !ok || len(rows) == 0 {
			return true
		}
		for _, row := range rows {
			if row.completion != languageNormal || row.value.object != nil {
				return true
			}
		}
	}
	return false
}

// retainCandidateReferenceFlags restores effective uncertainty from explicit
// evidence references. This never grants pending ownership or a fact right.
func retainCandidateReferenceFlags(result *accessorCandidates) {
	if result.ownedComponents == nil {
		return
	}
	for _, component := range result.ownedComponents.references {
		d := component.delta
		result.opaque = result.opaque || d.opaque
		result.thenIncomplete = result.thenIncomplete || d.thenIncomplete
		result.receiverIncomplete = result.receiverIncomplete || d.receiverIncomplete
		result.valueIncomplete = result.valueIncomplete || d.valueIncomplete
		result.fieldReceiverIncomplete = result.fieldReceiverIncomplete || d.fieldReceiverIncomplete
	}
}
