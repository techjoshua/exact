package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The role keeps the original preparation parent distinct from the physical
// receiver acquisition. Neither role is a completed property Get or a C loan.
type sourceStagedGetPreparationAcquisitionKind uint8

const (
	getPreparationSameGet sourceStagedGetPreparationAcquisitionKind = iota + 1
	getPreparationNestedReceiver
)

// This pure description never converts an Identifier acquisition into a
// property Get. Only the original PropertyAccess's exact receiver is supported;
// other implicit, native and dynamic acquisitions retain their own owners.
func validGetPreparationAcquisition(parent sourceStagedOperationRequest, kind sourceStagedGetPreparationAcquisitionKind, cut sourceRelativeCut) bool {
	root := parent.producer.operation
	if !validStagedMemberParent(parent) || cut.operation == nil || cut.reading != cut.operation {
		return false
	}
	switch kind {
	case getPreparationSameGet:
		return cut.operation == root && validStagedMemberObservation(parent, cut)
	case getPreparationNestedReceiver:
		return ast.IsPropertyAccessExpression(root) && ast.IsIdentifier(root.Expression()) && cut.operation == root.Expression()
	}
	return false
}

// stagedGetPreparationTargetRequest distinguishes immutable acquisition contexts
// within this graph generation. The outer request keeps its logical cut; only
// this preparation role's producer and subscriber namespaces carry the complete
// physical cut and ordered projection. AST pointers are compiler identities,
// never observations or selected-source authority.
func stagedGetPreparationTargetRequest(parent sourceStagedOperationRequest, operation, origin *ast.Node, kind sourceStagedGetPreparationAcquisitionKind, cut sourceRelativeCut, projection []string) sourceStagedOperationRequest {
	request := stagedMemberCandidateRequest(parent, sourceStagedMemberCandidate{operation: operation, origin: origin, cut: cut})
	suffix := fmt.Sprintf(":target-preparation:%d:%p:%p:%p:%p:%p:%p:%q", kind, cut.operation, cut.use, cut.reading, cut.initializing, cut.returning, cut.invoking, projection)
	request.producer.selector.field += suffix
	request.edge += suffix
	return request
}

// The canonical endpoint has only an expression, its actual acquisition cut
// and ordered projection. Other endpoint roles cannot share this namespace.
func validGetPreparationReceiver(parent sourceStagedOperationRequest, kind sourceStagedGetPreparationAcquisitionKind, cut sourceRelativeCut, receiver sourceRelativeEndpoint) bool {
	return validGetPreparationAcquisition(parent, kind, cut) && receiver.expression != nil && sameOperationEndpoint(receiver, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: receiver.expression, producer: cut.operation, cut: cut, projection: receiver.projection})
}

// The common original Get interval owns these pointers and revokes them before
// it leaves. Recipes receive only a tagged operation/cut/endpoint description.
type sourceStagedGetPreparationAcquisitionBorrow struct {
	self        *sourceStagedGetPreparationAcquisitionBorrow
	preparation *sourceStagedGetPreparationBorrow
	kind        sourceStagedGetPreparationAcquisitionKind
	get         *sourceGetInputs
	read        *sourceMemberWriterReadCut
	cut         sourceRelativeCut
	data        []sourceStagedGetPreparationData
}

func (q *sourceValueQuery) beginGetPreparationAcquisition(member *sourceStagedMemberBorrow, get *sourceGetInputs, read *sourceMemberWriterReadCut) func() {
	noop := func() {}
	if q == nil || member == nil || member.getPreparation == nil {
		return noop
	}
	p := member.getPreparation
	if !p.live(q) || p.member != member || p.acquisition != nil || get == nil || read == nil || get.operation != read.operation || read.use != q.reading || member.get != get || member.read != read || !q.memberSourceObservationOwned(member, get.operation) {
		return noop
	}
	kind := getPreparationSameGet
	if get.operation != p.request.producer.operation {
		kind = getPreparationNestedReceiver
	}
	cut := member.observation
	if !validGetPreparationAcquisition(p.request, kind, cut) || get.receiver.node == nil {
		return noop
	}
	a := &sourceStagedGetPreparationAcquisitionBorrow{preparation: p, kind: kind, get: get, read: read, cut: cut}
	a.self = a
	p.acquisition = a
	return func() {
		if p.acquisition == a {
			p.acquisition = nil
		}
		a.data = nil
		a.self, a.preparation, a.get, a.read = nil, nil, nil, nil
	}
}

func (a *sourceStagedGetPreparationAcquisitionBorrow) live(q *sourceValueQuery, p *sourceStagedGetPreparationBorrow) bool {
	if a == nil || a.self != a || p == nil || !p.live(q) || p.acquisition != a || a.preparation != p || p.member == nil || p.member.get != a.get || p.member.read != a.read || a.get == nil || a.read == nil || a.get.operation != a.cut.operation || a.read.operation != a.get.operation || a.read.use != q.reading || q.reading != a.get.operation || p.member.observation != a.cut || a.get.receiver.node == nil {
		return false
	}
	return validGetPreparationAcquisition(p.request, a.kind, a.cut)
}

// sourceStagedGetPreparationContext describes an original preparation reader
// before its C is available. The receiver is a source endpoint, not an acquired
// object or an exhaustive receiver population.
type sourceStagedGetPreparationContext struct {
	parent, request sourceStagedOperationRequest
	acquisition     sourceStagedGetPreparationAcquisitionKind
	cut             sourceRelativeCut
	receiver        sourceRelativeEndpoint
}

// getPreparationContext is lent synchronously by the existing Get owner.
// It supplies only registration context. Selected provenance and exact
// subscriber delivery remain obligations of the existing target producer.
func (work *callableEffectWork) getPreparationContext(facts []callableFacts, q *sourceValueQuery) (sourceStagedGetPreparationContext, bool) {
	if q == nil || q.stagedMember == nil {
		return sourceStagedGetPreparationContext{}, false
	}
	b := q.stagedMember
	p := b.getPreparation
	if !p.live(q) || p.work != work || !p.acquisition.live(q, p) {
		return sourceStagedGetPreparationContext{}, false
	}
	caller, known := work.memberNodes[p.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || &facts[caller] != p.fact {
		return sourceStagedGetPreparationContext{}, false
	}
	if !work.adoptPlainGetPreparation(facts, q, p) {
		return sourceStagedGetPreparationContext{}, false
	}
	request := stagedGetPreparationRequest(p.request)
	recipe := work.operationRecipes[request.producer]
	if !validStagedGetPreparationRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.parent, p.request) || p.id.epoch != work.operationEpoch || p.id.index == 0 || int(p.id.index) >= len(work.operations) || work.operations[p.id.index].invalid {
		return sourceStagedGetPreparationContext{}, false
	}
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: b.get.receiver.node, projection: append([]string(nil), b.get.receiver.path...), producer: b.get.operation, cut: b.observation}
	return sourceStagedGetPreparationContext{parent: p.request, request: request, acquisition: p.acquisition.kind, cut: b.observation, receiver: receiver}, true
}
