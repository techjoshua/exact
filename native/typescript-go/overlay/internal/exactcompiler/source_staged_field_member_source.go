package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedFieldMemberRequest keeps the original field and map-entry association
// while separating its Has and Get source observations. It describes a finite
// source context, not another runtime Call or a normal property observation.
func stagedFieldMemberRequest(field sourceStagedOperationRequest, phase sourceStagedFieldObservationPhase) (sourceStagedOperationRequest, bool) {
	if field.producer.kind != relativeDemandEffects || stagedDescriptorFieldIndex(field.producer.selector.field) < 0 || field.producer.selector.occurrence == nil || phase != stagedFieldObservationHas && phase != stagedFieldObservationGet {
		return sourceStagedOperationRequest{}, false
	}
	name := "has"
	if phase == stagedFieldObservationGet {
		name = "get"
	}
	request := field
	request.producer.selector.field = "field-member:" + name + ":" + field.producer.selector.field
	request.edge += ":member-source:" + name
	return request, true
}

func stagedFieldMemberParent(request sourceStagedOperationRequest) (sourceStagedOperationRequest, sourceStagedFieldObservationPhase, bool) {
	for _, phase := range []sourceStagedFieldObservationPhase{stagedFieldObservationHas, stagedFieldObservationGet} {
		for _, field := range reflectiveDescriptorKeys {
			parent := request
			parent.producer.selector.field = field
			name := "has"
			if phase == stagedFieldObservationGet {
				name = "get"
			}
			suffix := ":member-source:" + name
			if !strings.HasSuffix(parent.edge, suffix) {
				continue
			}
			parent.edge = strings.TrimSuffix(parent.edge, suffix)
			if expected, valid := stagedFieldMemberRequest(parent, phase); valid && sameOperationRequest(expected, request) {
				return parent, phase, true
			}
		}
	}
	return sourceStagedOperationRequest{}, stagedFieldObservationUnstarted, false
}

// Generic source keys retain their old shape. A field context additionally
// carries its fixed role, phase and original entry association, so shared
// descriptor expressions cannot alias another entry or Has/Get observation.
func stagedMemberContextField(parent sourceStagedOperationRequest, name string) string {
	_, _, field := stagedFieldMemberParent(parent)
	if field || stagedMapEntryMemberParent(parent) || assignmentSourceMemberParent(parent) {
		return fmt.Sprintf("%s:%s:%p:%p", name, parent.producer.selector.field, parent.producer.selector.occurrence, parent.producer.selector.association)
	}
	return name
}

func stagedMapEntryMemberParent(request sourceStagedOperationRequest) bool {
	member, call := request.producer.selector.occurrence, request.producer.operation
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	return request.producer.selector.field == "descriptor-entry-get" && request.producer.selector.association == nil && member != nil && member.Parent != nil && ast.IsObjectLiteralExpression(member.Parent) && len(actuals) == 2 && actuals[1] == member.Parent
}

func (query *sourceValueQuery) liveStagedMapEntryMemberSource(get *sourceGetInputs) bool {
	if query.stagedMap == nil || query.stagedMember == nil || !query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
		return false
	}
	mapBorrow := query.stagedMap
	event, read := mapBorrow.noUserPublication, mapBorrow.currentRead
	return mapBorrow.reading && (query.originalMapEntryCoverageOwned(query.stagedMember.request) || event != nil && event.get == get && event.law == stagedMapOwnDataGetNoUserEntry) && read != nil && sameOperationRequest(query.stagedMember.request, read.request) && stagedMapEntryMemberParent(read.request)
}

func (query *sourceValueQuery) liveStagedFieldMemberSource(get *sourceGetInputs) bool {
	if !query.liveStagedFieldGet(get) || query.stagedMember == nil || get.stagedEffects.observation == nil {
		return false
	}
	borrow := get.stagedEffects
	parent, valid := stagedFieldMemberRequest(borrow.request, borrow.observation.phase)
	return valid && sameOperationRequest(query.stagedMember.request, parent) && get.hasOnly == (borrow.observation.phase == stagedFieldObservationHas)
}

// Stored descriptor bodies already have an original field producer. Reuse that
// source relationship instead of issuing an executed Get/Call for each dormant
// operation in the body. Actual getter selection and later invocation retain
// their existing binder and canonical summary consumers.
func (work *callableEffectWork) transferStagedFieldBodySource(facts []callableFacts, query *sourceValueQuery, candidate sourceStagedMemberCandidate) bool {
	member := query.stagedMember
	if member == nil || !query.liveStagedFieldMemberSource(member.get) {
		return false
	}
	borrow := member.get.stagedEffects
	id, issued := work.operationIDs[borrow.request.producer]
	if !issued || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].effectsDemand == nil {
		return false
	}
	demand := *work.operations[id.index].effectsDemand
	transfer, represented := work.stagedFieldBodyRequest(demand, candidate.operation, candidate.region, query.executable)
	request := transfer.request
	if !represented || !validNativeGetRequest(work.operationRecipes[request.producer], request) {
		return false
	}
	description := work.describeStagedMemberFieldBody(query, transfer)
	if !validStagedMemberFieldBody(description, member.request, member.observation, member.generation) {
		return false
	}
	for _, prior := range member.fieldBodies {
		if sameStagedMemberFieldBody(prior, description) {
			return true
		}
	}
	// An already sealed canonical prefix cannot acquire a new purpose or debt.
	if member.coverage != nil {
		if member.coverage.extracted {
			known := false
			for _, issued := range member.coverage.fieldBodies {
				known = known || sameStagedMemberFieldBody(issued, description)
			}
			if !known || !operationContainsRequest(member.coverage.required, request) {
				return false
			}
		}
		if prior, exists := work.operationRecipes[member.coverage.request.producer]; exists && prior.memberSource != nil && prior.memberSource.coverage != nil && prior.delta.extracted {
			known := false
			for _, issued := range prior.memberSource.coverage.fieldBodies {
				known = known || sameStagedMemberFieldBody(issued, description)
			}
			if !known || !operationContainsRequest(prior.delta.required, request) {
				return false
			}
		}
	}
	// Purpose and required membership are one source-owner transaction, before
	// any early coverage/SOURCE can publish the request as a contributor.
	member.fieldBodies = append(member.fieldBodies, description)
	member.required = appendEntryLawRequirement(member.required, request)
	if member.coverage != nil {
		member.coverage.fieldBodies = appendStagedMemberFieldBody(member.coverage.fieldBodies, description)
		member.coverage.required = appendEntryLawRequirement(member.coverage.required, request)
	}
	return true
}

func (query *sourceValueQuery) stagedFieldBodySource(request sourceStagedOperationRequest) bool {
	member := query.stagedMember
	if member == nil || !query.liveStagedFieldMemberSource(member.get) || !query.liveStagedMemberSource(member, member.get, member.read) {
		return false
	}
	for _, issued := range member.fieldBodies {
		if sameOperationRequest(issued.request, request) {
			return true
		}
	}
	return false
}

// The actual Has/Get owner can yield Effects discovery before legacy recovery.
// Every semantic source child remains required. Neither this transfer nor its
// intentionally withheld output selects a property, invokes it or proves absence.
func (query *sourceValueQuery) transferStagedFieldMemberEffects(origin *ast.Node, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, result *accessorCandidates) bool {
	if !query.liveStagedFieldMemberSource(get) || !query.liveStagedMemberSource(query.stagedMember, get, cut) || origin != get.receiver.node || !ast.IsObjectLiteralExpression(origin) || query.stagedMember.coverage == nil || query.stagedMember.coverage.origin != origin || mode != accessorNoGet && mode != accessorAcquire {
		return false
	}
	if scope := query.stagedFieldGet.memberRequest; scope != nil {
		if !scope.request(get, cut) {
			return false
		}
	} else if !query.publishStagedMemberDisposition(get, cut, false) {
		return false
	}
	if !query.liveStagedFieldMemberSource(get) || !query.liveStagedMemberSource(query.stagedMember, get, cut) {
		return false
	}
	result.valueIncomplete = true
	return true
}

// admitStagedFieldMemberSources consumes the original live field interval into
// its already-issued source roles. Existing prefixes and required relationships
// survive. Prototype baseline and all child closure stay independent of finite
// local extraction, including in a graph rebuilt from immutable descriptions.
func (work *callableEffectWork) admitStagedFieldMemberSources(facts []callableFacts, query *sourceValueQuery) bool {
	return work.publishStagedFieldMemberSources(facts, query, stagedMemberFinalObservation)
}

// An early request enrolls the already-issued field source roles only. Final
// original observation separately owns extraction and prototype accounting.
func (work *callableEffectWork) publishStagedFieldMemberSources(facts []callableFacts, query *sourceValueQuery, publication sourceStagedMemberPublication) bool {
	member := query.stagedMember
	if member == nil || !query.liveStagedFieldMemberSource(member.get) || !query.liveStagedMemberSource(member, member.get, member.read) || member.disposition == nil || member.coverage == nil {
		return false
	}
	get, coverage := member.get, member.coverage
	borrow := get.stagedEffects
	if coverage.generation != work.operationGeneration || coverage.cut != borrow.cut || !sameOperationRequest(coverage.request, stagedMemberCoverageRequest(member.request, get.receiver.node, borrow.cut)) || publication == stagedMemberFinalObservation && work.memberCoverageObserved[coverage.request.producer] != work.operationGeneration {
		return false
	}
	producer, issued := work.operationIDs[borrow.request.producer]
	if !issued || producer.epoch != work.operationEpoch || producer.index == 0 || int(producer.index) >= len(work.operations) || work.operations[producer.index].effectsDemand == nil {
		return false
	}
	demand := *work.operations[producer.index].effectsDemand
	roles, valid := fieldSourceRequests(demand.request)
	if !valid || !sameOperationRequest(demand.request, borrow.request) {
		return false
	}
	for _, request := range []sourceStagedOperationRequest{roles.ownWriters, roles.prototype} {
		prior := work.operationRecipes[request.producer]
		delta := cloneOperationDelta(prior.delta)
		found := false
		for _, child := range delta.required {
			found = found || sameOperationRequest(child, coverage.request)
		}
		if !found {
			delta.required = append(delta.required, coverage.request)
		}
		complete := publication == stagedMemberFinalObservation && coverage.extracted
		if complete && sameOperationRequest(request, roles.prototype) {
			complete = complete && work.stagedFieldStandardPrototype(facts, demand, query, get, query.executable)
		}
		delta.extracted = delta.extracted || complete
		if publication == stagedMemberSourceRequest {
			if _, registered := work.registerFieldSourceDiscovery(facts, demand, query, get, request, delta); !registered {
				return false
			}
		} else if !work.publishFieldSourceDiscovery(facts, demand, query, get, request, delta) {
			return false
		}
	}
	if publication == stagedMemberFinalObservation && runtimeModuleEvaluation(demand.request.consumer) {
		work.attachFieldEntryLawPrefix(facts, demand, query, get, coverage.request)
	}
	if publication == stagedMemberFinalObservation {
		work.recordImplicitFieldCoverage(facts, query, get)
	}
	// The same live phase may describe its mutation SOURCE. Failure leaves that
	// separate output pending; it cannot revoke or settle Effects publication.
	work.publishOriginalNativeFieldMutationSource(facts, query, get, member.read, publication)
	return query.liveStagedFieldMemberSource(get)
}
