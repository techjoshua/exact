package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// paidMayAlternative is a detached conservative contribution, never an executable
// callable. The source locus has summary-many cardinality. Unresolved domains
// belong to this alternative and cannot be paired with a sibling's facts.
type paidMayAlternative struct {
	category, capture, receiver, guard, outputState, completion, creator, occurrence string
	provenance, returned, donor                                                      *ast.Node
}

// paidMayReceipt fences a legacy import observation, not an actual producer
// branch. Its ID grants no concrete function equality, inequality or authority.
// Source nodes are provenance and existing MAY donors owned by this generation.
// No activation, input graph, copied bindings or traversal owner escapes import.
type paidMayReceipt struct {
	owner                   *languageOwner
	generation, observation uint64
	alternatives            []paidMayAlternative
	incomplete              bool
	accounting              sourceEffectAccounting
}

// paidMayPopulation partitions only imported getter values out of the final
// legacy donor scan. Raw descriptor values and noncallability remain legacy.
type paidMayPopulation struct {
	start, end int
	// indices associates unchanged own-Get outputs in its immediate request.
	indices []int
	receipt paidMayReceipt
}

// ownsDonors records successful namespace adoption, independently of later
// liveness. A population without adoption stays on the legacy MAY publisher.
// A namespace closed after adoption cannot fall back and publish again.
func (p paidMayPopulation) ownsDonors() bool {
	return p.receipt.owner != nil && p.receipt.observation != 0
}

// importPaidGetterMayObservation copies the entire paid population before donor
// filtering. Unsupported encodings retain provenance and residuals beside known
// donors. It performs no evaluation or new query and never claims empty captures.
func importPaidGetterMayObservation(owner *languageOwner, observed sourceResultObservation) paidMayReceipt {
	r := paidMayReceipt{owner: owner, incomplete: observed.incomplete, accounting: observed.effects}
	if owner != nil {
		r.generation = owner.generation
		if !owner.disposed {
			r.observation = owner.identity().serial
		}
	}
	for _, term := range observed.values {
		v := term.value
		a := paidMayAlternative{category: "unsupported", provenance: v.node, returned: term.returned, capture: "unresolved", receiver: "unresolved", guard: "unresolved", outputState: "unresolved", completion: "successful-return-family", creator: "unresolved", occurrence: "unresolved"}
		switch {
		case v.awaited != nil:
			a.category = "awaited"
		case v.native != nil:
			a.category = "native"
			if v.native.kind == sourceNativePromiseFacade || v.native.kind == sourceNativeAsyncFacade {
				a.category = "raw-facade"
			}
		case v.bound != nil:
			a.category = "bound"
		case v.copied != nil || v.rest != nil:
			a.category = "copied"
		case v.undefined:
			a.category = "noncallable"
		case v.node != nil && len(v.path) == 0 && ast.IsFunctionLike(v.node) && v.node.Body() != nil:
			a.category = "authored"
			a.creator = "source-locus-summary-many"
		case v.node != nil && len(v.path) == 0 && sourcePrimitiveValue(v.node):
			a.category = "noncallable"
		}
		// This is exactly the preexisting MAY eligibility ceiling, independent of
		// representational classification. It grants no execution/capture authority.
		if v.node != nil && len(v.path) == 0 && ast.IsFunctionLike(v.node) && v.node.Body() != nil {
			a.donor = v.node
		}
		if v.node != nil {
			if sf := ast.GetSourceFileOfNode(v.node); sf != nil && sf.IsDeclarationFile {
				a.category = "foreign"
			}
		}
		r.alternatives = append(r.alternatives, a)
	}
	return r
}

// projectPaidMayDonors returns detached donor references only while the selected
// generation is live. Refusal cannot undo paid effects or restart a producer.
// Repeated projection allocates a result slice but changes no semantic state.
func projectPaidMayDonors(owner *languageOwner, r paidMayReceipt) ([]*ast.Node, bool) {
	if !r.live(owner) {
		return nil, false
	}
	var donors []*ast.Node
	for _, a := range r.alternatives {
		if a.donor != nil {
			donors = append(donors, a.donor)
		}
	}
	return donors, true
}

// live validates projection without releasing an adopted population to legacy replay.
func (r paidMayReceipt) live(owner *languageOwner) bool {
	return owner != nil && owner == r.owner && !owner.disposed && owner.generation == r.generation && r.observation != 0
}

// sourceOwnEffectSummary is borrowed only during one settlement Get request.
// It contains detached summaries and output positions, never installed frames.
type sourceOwnEffectSummary struct{ populations []paidMayPopulation }

// alternativeIndex preserves the unfiltered alternative position for a terminal value.
func (p paidMayPopulation) alternativeIndex(index int) (int, bool) {
	if p.indices != nil {
		for ordinal, selected := range p.indices {
			if selected == index {
				return ordinal, true
			}
		}
		return 0, false
	}
	return index - p.start, index >= p.start && index < p.end
}

// contains selects explicit own-Get outputs or an inherited contiguous range.
func (p paidMayPopulation) contains(index int) bool {
	_, ok := p.alternativeIndex(index)
	return ok
}

// donorAt keeps publication in terminal order. An adopted but unavailable output
// remains claimed, so disposal or missing data cannot restart legacy publication.
func (p paidMayPopulation) donorAt(index int) (*ast.Node, bool) {
	if !p.ownsDonors() {
		return nil, false
	}
	ordinal, claimed := p.alternativeIndex(index)
	if !claimed {
		return nil, false
	}
	if !p.receipt.live(p.receipt.owner) || ordinal < 0 || ordinal >= len(p.receipt.alternatives) {
		return nil, true
	}
	return p.receipt.alternatives[ordinal].donor, true
}
