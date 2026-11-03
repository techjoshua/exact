package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCalleeWriteWork settles receiver-write dependencies synchronously inside
// the original selection interval. Rows denote source member/use endpoints, not
// activations or exclusion sets. Unknown discovery takes the original path.
type sourceCalleeWriteWork struct {
	owner    *sourceValueQuery
	rows     map[sourceCalleeWriteSite]*sourceCalleeWriteRow
	queue    []*sourceCalleeWriteRow
	root     *sourceCalleeWriteRow
	unknown  bool
	fallback bool
}

type sourceCalleeWriteSite struct {
	member, origin *ast.Node
	key            string
}

type sourceCalleeWriteRow struct {
	site   sourceCalleeWriteSite
	demand sourceMemberWriteDemand
}

func calleeWriteSite(demand sourceMemberWriteDemand) (sourceCalleeWriteSite, bool) {
	member := demand.member
	if member == nil || member.Parent == nil || !ast.IsCallExpression(member.Parent) || unwrapSourceCallableReference(member.Parent.Expression()) != member || demand.mode != accessorAcquire || len(demand.projection) != 1 || demand.name != "" || demand.projection[0] == "" || demand.projection[0] == "*" {
		return sourceCalleeWriteSite{}, false
	}
	return sourceCalleeWriteSite{member: member, origin: demand.origin, key: demand.projection[0]}, true
}

func (work *sourceCalleeWriteWork) add(query *sourceValueQuery, demand sourceMemberWriteDemand) {
	query.recordEstimatedCost(1)
	if work.owner != query {
		work.unknown = true
		return
	}
	site, ok := calleeWriteSite(demand)
	if !ok || !demand.live(query) || demand.cut == nil || len(demand.scope.creators) != 0 || len(demand.cut.scope.creators) != 0 {
		work.unknown = true
		return
	}
	for _, excluded := range demand.excludedCalls {
		query.recordEstimatedCost(1)
		if excluded != site.member.Parent && (work.root == nil || excluded != work.root.site.member.Parent) {
			work.unknown = true
			return
		}
	}
	for _, terms := range demand.scope.bindings {
		query.recordEstimatedCost(1)
		for _, term := range terms {
			query.recordEstimatedCost(1)
			if !inventorySourceValue(term) || term.rest != nil || term.copied != nil || term.capture != nil && (len(term.capture.bindings) != 0 || len(term.capture.creators) != 0) {
				work.unknown = true
				return
			}
		}
	}
	row := work.rows[site]
	if row == nil {
		row = &sourceCalleeWriteRow{site: site, demand: demand}
		work.rows[site] = row
		work.queue = append(work.queue, row)
		if work.root == nil {
			work.root = row
		}
		return
	}
	// Multiple independent source-input mappings cannot be collapsed into a
	// unique receiver by matching abstract facts. Keep the existing resolver.
	if len(row.demand.scope.bindings) != 0 || len(demand.scope.bindings) != 0 || len(row.demand.cut.scope.bindings) != 0 || len(demand.cut.scope.bindings) != 0 {
		work.unknown = true
		return
	}
	prior := row.demand
	if prior.reading != demand.reading || prior.initializing != demand.initializing || prior.returning != demand.returning || prior.invoking != demand.invoking || prior.effectOwner != demand.effectOwner || prior.bindingCall != demand.bindingCall || prior.cut.operation != demand.cut.operation || prior.cut.use != demand.cut.use || len(prior.sources) != len(demand.sources) {
		work.unknown = true
		return
	}
	for i, source := range prior.sources {
		query.recordEstimatedCost(1)
		if source != demand.sources[i] {
			work.unknown = true
		}
	}
}

// inspectBody preserves each represented candidate's captured mapping while
// delegating all body-write interpretation to the existing consumer.
func (work *sourceCalleeWriteWork) inspectBody(query *sourceValueQuery, candidates accessorCandidates, index int, value sourceValue, call *ast.Node, demanded sourceValue, result *accessorCandidates) {
	scope, found := candidates.callableScopes[index]
	if value.capture != nil {
		scope, found = *value.capture, true
	}
	if !found {
		work.unknown = true
		return
	}
	previous := query.creators
	query.creators = scope.creators
	defer func() { query.creators = previous }()
	query.receiverInterference(value.node, call, demanded, scope.bindings, result, make(map[*ast.Node]bool))
}

// receiverCandidates inventories the same canonical source alternatives. A
// nonempty conditional library/body basis is required before pending edges can
// participate in closure. Lookup/foreign uncertainty remains independently Top.
func (work *sourceCalleeWriteWork) receiverCandidates(query *sourceValueQuery, call *ast.Node, bindings sourceValueBindings) accessorCandidates {
	query.recordEstimatedCost(1)
	if work.owner != query {
		work.unknown = true
		return accessorCandidates{opaque: true}
	}
	view := query.receiverWriteCandidates(call, bindings)
	if view.unknown || len(view.candidates.values) == 0 {
		work.unknown = true
		return view.candidates
	}
	for _, demand := range view.dependencies {
		query.recordEstimatedCost(1)
		work.add(query, demand)
	}
	return view.candidates
}

// tryCalleeWriteInterference returns true only after all represented write
// demands close without unknown. Failure reruns the unchanged synchronous
// consumer, including all original scope/cut and negative availability owners.
func (query *sourceValueQuery) tryCalleeWriteInterference(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, sources []*ast.SourceFile, cut *sourceMemberWriterReadCut, boundary sourceMemberOperationProof) bool {
	view := sourceCalleeWriteView{}
	previousInventory, previousWork := query.calleeWriteInventory, query.calleeWriteWork
	defer func() {
		query.calleeWriteInventory, query.calleeWriteWork = previousInventory, previousWork
	}()
	query.calleeWriteInventory = &view
	query.inventoryMemberWrites(origin, projection, name, mode, bindings, result, sources, cut)
	query.calleeWriteInventory = previousInventory
	work := &sourceCalleeWriteWork{owner: query, rows: make(map[sourceCalleeWriteSite]*sourceCalleeWriteRow)}
	for _, demand := range view.dependencies {
		query.recordEstimatedCost(1)
		work.add(query, demand)
	}
	if work.unknown {
		return false
	}
	query.calleeWriteWork = work
	for next := 0; next < len(work.queue) && !work.unknown; next++ {
		query.recordEstimatedCost(1)
		row := work.queue[next]
		if !row.demand.live(query) {
			work.unknown = true
			break
		}
		query.inspectCalleeWriteRow(row, work)
	}
	if work.unknown {
		work.fallback = true
		query.scanInterferenceInSources(origin, projection, name, mode, bindings, result, sources, boundary, nil)
	}
	return true
}

// inspectCalleeWriteRow restores source data only. No normal frame, receipt or
// pending header is copied or reinstalled. Every borrowed header stays live in
// its original outer interval throughout this synchronous settlement.
func (query *sourceValueQuery) inspectCalleeWriteRow(row *sourceCalleeWriteRow, work *sourceCalleeWriteWork) {
	d := row.demand
	reading, initializing, returning, invoking := query.reading, query.initializing, query.returning, query.invoking
	member, owner, binding, creators := query.protectedMember, query.effectOwner, query.normalBindingCall, query.creators
	defer func() {
		query.reading, query.initializing, query.returning, query.invoking = reading, initializing, returning, invoking
		query.protectedMember, query.effectOwner, query.normalBindingCall, query.creators = member, owner, binding, creators
	}()
	query.reading, query.initializing, query.returning, query.invoking = d.reading, d.initializing, d.returning, d.invoking
	query.protectedMember, query.effectOwner, query.normalBindingCall, query.creators = d.member, d.effectOwner, d.bindingCall, d.scope.creators
	part := accessorCandidates{}
	query.scanInterferenceInSources(d.origin, d.projection, d.name, d.mode, d.scope.bindings, &part, d.sources, sourceMemberOperationProof{}, nil)
	work.unknown = work.unknown || part.opaque || !d.live(query)
}
