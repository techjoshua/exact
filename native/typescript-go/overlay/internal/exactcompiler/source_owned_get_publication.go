package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type ownedGetPublicationState uint8

const (
	ownedUnpublished ownedGetPublicationState = iota
	ownedPublishing
	ownedPublished
	ownedAbandoned
)

// ownedGetContribution is sealed evidence. It retains no frame/query or mutable
// request. Publication rights live separately on the original fact obligation.
type ownedGetContribution struct{ delta accessorCandidates }

// ownedGetFactObligation is issued only by the live original fact driver. A
// candidate transports this right without claiming it. Cache copies omit it.
type ownedGetFactObligation struct {
	component *ownedGetContribution
	state     ownedGetPublicationState
}

// sealOwnedGetContribution detaches append-only payload slices from the active
// result. Its original fact retains the obligation independently of caches.
func sealOwnedGetContribution(fact *callableFacts, result *accessorCandidates) {
	sealOwnedGetDelta(fact, result, result)
}

// sealOwnedGetDelta keeps effective result flags separate from the original
// publisher's pending work. Referenced prefix uncertainty never becomes a delta.
func sealOwnedGetDelta(fact *callableFacts, result, pending *accessorCandidates) {
	if fact == nil {
		return
	}
	delta := accessorCandidates{opaque: pending.opaque, valueIncomplete: pending.valueIncomplete, receiverIncomplete: pending.receiverIncomplete, thenIncomplete: pending.thenIncomplete, cause: pending.cause}
	delta.ownedClaims = nil
	delta.effects = append([]sourceCallableEffect(nil), pending.effects...)
	delta.declarations = append([]*ast.Node(nil), pending.declarations...)
	delta.accessorMutations = append([]sourceAccessorMutation(nil), pending.accessorMutations...)
	// Payload intentionally excludes values, populations, scopes and input frames.
	delta.ownedLocalCauses = append([]string(nil), pending.ownedLocalCauses...)
	claim := &ownedGetFactObligation{component: &ownedGetContribution{delta: delta}}
	fact.ownedGetPending = append(fact.ownedGetPending, claim)
	for _, population := range result.ownedGets {
		population.components = append(population.components, claim.component)
	}
	// Effective flags remain monotone. Their pending component is now sealed.
	result.ownedClaims = append(result.ownedClaims, claim)
	result.ownedLocalCauses = nil
	result.ownedSealed = true
	if result.ownedComponents == nil {
		result.ownedComponents = &sourceCandidateComponents{}
	}
	result.ownedComponents = mergeCandidateComponentViews(result.ownedComponents, &sourceCandidateComponents{references: []*ownedGetContribution{claim.component}})
}

// publishOwnedGetFactBatch claims exactly one original three-appender batch.
// Publishing fences reentrancy. Evidence readers cannot invoke this right.
func publishOwnedGetFactBatch(fact *callableFacts, claim *ownedGetFactObligation, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker) {
	if claim == nil || claim.state != ownedUnpublished {
		return
	}
	authorized := false
	for _, pending := range fact.ownedGetPending {
		authorized = authorized || pending == claim
	}
	if !authorized {
		return
	}
	claim.state = ownedPublishing
	delta := claim.component.delta
	appendOpaqueAccessorEffect(fact, delta)
	appendSourceValueWrites(fact, delta, c)
	appendAccessorTargets(fact, source.AsNode(), delta, targets, source)
	claim.state = ownedPublished
}

// appendOwnedGetFact preserves the ordinary synchronous driver order. Caches
// contain only population references. Late local refusals remain a new batch.
func appendOwnedGetFact(fact *callableFacts, node *ast.Node, candidates accessorCandidates, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker) {
	for _, claim := range candidates.ownedClaims {
		publishOwnedGetFactBatch(fact, claim, targets, source, c)
	}

	mergeOwnedGets(&fact.ownedGetResults, candidates.ownedGets)
	if candidates.ownedComponents != nil {
		for _, component := range candidates.ownedComponents.pending {
			publishLegacyComponent(fact, component, node, targets, source, c)
		}
		return
	}

	appendOpaqueAccessorEffect(fact, candidates)
	appendSourceValueWrites(fact, candidates, c)
	appendAccessorTargets(fact, node, candidates, targets, source)
}

// drainOwnedGetFact performs no analysis or replay. Abandonment claims no
// external publication. Sealed deltas remain readable as immutable evidence.
func drainOwnedGetFact(fact *callableFacts, abandon bool, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker) {
	for _, claim := range fact.ownedGetPending {
		if claim.state != ownedUnpublished {
			continue
		}
		if abandon {
			claim.state = ownedAbandoned
		} else {
			publishOwnedGetFactBatch(fact, claim, targets, source, c)
		}
	}
}
