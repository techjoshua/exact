package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// frameworkViewWriterSources consumes only a current staged view at the original
// member-writer recovery. Its input is a possible donor, not the returned object.
// The normal return/receiver remains unavailable, and transformed alternatives
// remain opaque. Original Call Effects stay at the Call; only represented writer
// values/captures go to the existing exact-writer retain callback.
func (q *sourceValueQuery) frameworkViewWriterSources(view sourceFrameworkStorageView, bindings sourceValueBindings, result *accessorCandidates, retain func(accessorCandidates)) bool {
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || q.stagedMember == nil || view.generation != q.owner.generation || reactiveObjectsViewDeclaration(view.call, []*ast.Node{view.declaration}, q.executable) != view.declaration {
		result.valueIncomplete = true
		return false
	}
	// This is the existing original input relationship query under the actual
	// caller bindings/creator chain. No endpoint syntax is promoted to a value.
	part := accessorCandidates{}
	values := q.originsAt(view.argument, q.boundInputAcquisition(view.argument, view.call), bindings, &part)
	part.values = values
	retain(part)
	projected := projectFrameworkStorageView(view, nil)
	result.values = append(result.values, sourceValue{frameworkView: &projected})
	result.valueIncomplete = true
	// The original Get's explicit runtime residual is published separately after
	// restoration. This value marker itself supplies no empty-writer proof.
	// Preserve source-query uncertainty without moving argument evaluation Effects
	// to this later Get. The exact applied DATA/Effects reading remains required.
	result.opaque = result.opaque || part.opaque
	result.thenIncomplete = result.thenIncomplete || part.thenIncomplete
	result.receiverIncomplete = result.receiverIncomplete || part.receiverIncomplete
	result.fieldReceiverIncomplete = result.fieldReceiverIncomplete || part.fieldReceiverIncomplete
	result.callFallbacks = append(result.callFallbacks, part.callFallbacks...)
	result.fieldFallbacks = append(result.fieldFallbacks, part.fieldFallbacks...)
	result.descriptorFallbacks = append(result.descriptorFallbacks, part.descriptorFallbacks...)
	result.owned = append(result.owned, part.owned...)
	result.ownedLocalCauses = append(result.ownedLocalCauses, part.ownedLocalCauses...)
	result.ownedGets = append(result.ownedGets, part.ownedGets...)
	result.thenReferences = append(result.thenReferences, part.thenReferences...)
	return !frameworkEffectsCompilerPending(part)
}

// observeFrameworkViewRuntime is the original restored member owner's runtime
// alternative. A ready conditional view can contain transformed sources even
// beside known input donors. Its explicit residual is not pending compiler work,
// a NoUser claim or a synthetic empty writer row.
func (q *sourceValueQuery) observeFrameworkViewRuntime(view sourceFrameworkStorageView, result *accessorCandidates) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		result.valueIncomplete = true
		return
	}
	cut := q.relativeInputCut(b.get.operation)
	projected := projectFrameworkStorageView(view, nil)
	candidate := sourceStagedMemberCandidate{request: b.request, operation: b.get.operation, origin: view.call, runtimeUnknown: true, cut: cut}
	candidate.target = sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: cut, frameworkView: &projected}
	if !q.publishStagedMemberCandidate(b.get, b.read, candidate) {
		result.valueIncomplete = true
		result.opaque = true
	}
}
