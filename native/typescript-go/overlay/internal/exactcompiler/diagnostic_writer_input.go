package exactcompiler

// Disposable component adapter for the existing progress owner. Every identity
// is a scalar diagnostic label. No request, query, binding or scope is retained.
import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"sync/atomic"
	"time"
	"unsafe"
)

type writerInputLocation struct {
	File           string
	Pos, End, Kind int
}
type writerInputTraceRecord struct {
	PendingStats sourcePendingMemberStats
	PendingPhase int

	GraphNodes, GraphEdges, GraphFacts, GraphCollections, GraphDiscoveryRetired, GraphRecoveryRetired uint64

	Root, InputDeclaration, InputInvocation uint64
	InputBindingCount                       int
	Recovery                                bool

	Serial, Parent, Query, Call, Writer uint64
	Event, Reason                       string
	Position, RecipeKind, Values        int
	Location                            writerInputLocation
	Cuts                                [4]uint64
	Consumer, Use                       uint64
	Capabilities                        uint64
	ElapsedWallNS, SelfWallNS           int64
}
type writerInputActive struct {
	Serial, Query, Parent uint64
	ChildrenNS            int64
}
type writerInputLabel struct {
	Call     uint64
	Location writerInputLocation
}
type writerInputProgress struct {
	PendingCosts [10]atomic.Uint64

	PendingCounts                                                      [35]atomic.Uint64
	DescentLabels, DescentLabelDrops, DescentLabelRepeats, IndexMisses atomic.Uint64
	PendingNeverNeeded                                                 atomic.Uint64
	PendingRelationships, PendingWorkDirty                             atomic.Uint64

	Rejections                                                                             [35]atomic.Uint64
	Attempts, Components, Covered, Uncovered, Fallbacks, Yields, DiscoverySkipped          atomic.Uint64
	Next, Recorded, Overwritten, LockDrops, Unmapped, SourceInspections, SourceBudgetDrops atomic.Uint64
	TimingDrops, ObserverNS, Active, MaxActive                                             atomic.Uint64
	Records                                                                                [256]writerInputTraceRecord
	Frames                                                                                 [128]writerInputActive
	Labels                                                                                 [128]writerInputLabel
	LabelCount                                                                             int
}
type writerInputTraceFrame struct {
	state         *progressState
	serial, prior uint64
	priorState    *progressState
	start         time.Time
}

// Original descent already owns the source file and span. Labels copy only
// bounded immutable scalars. A failed lock/cap never blocks or alters admission.
// No parent walk, checker call, summary construction or value query occurs here.
func progressWriterInputSource(owner *executableBodyOwner, source *ast.SourceFile, node *ast.Node) {
	if owner == nil || source == nil || node == nil || !ast.IsCallExpression(node) && !ast.IsNewExpression(node) {
		return
	}
	s := progressForQuery(&sourceValueQuery{owner: owner.values, executable: owner})
	if s == nil {
		return
	}
	w := &s.writerInput
	start := time.Now()
	if !s.mu.TryLock() {
		w.LockDrops.Add(1)
		w.DescentLabelDrops.Add(1)
		return
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	tag := progressPointer(node)
	for i := 0; i < w.LabelCount; i++ {
		if w.Labels[i].Call == tag {
			w.DescentLabelRepeats.Add(1)
			w.ObserverNS.Add(uint64(time.Since(start)))
			return
		}
	}
	name := source.FileName()
	if w.LabelCount == len(w.Labels) || len(name) > 512 {
		w.DescentLabelDrops.Add(1)
		w.ObserverNS.Add(uint64(time.Since(start)))
		return
	}
	w.Labels[w.LabelCount] = writerInputLabel{Call: tag, Location: writerInputLocation{strings.Clone(name), node.Pos(), node.End(), int(node.Kind)}}
	w.LabelCount++
	w.DescentLabels.Add(1)
	w.ObserverNS.Add(uint64(time.Since(start)))
}

// locate reads only already-built index call inventories, never AST parents,
// source text, checker state or a value producer. A fixed whole-observation scan
// budget prevents missing labels from creating unbounded observer work.
func (w *writerInputProgress) locate(q *sourceValueQuery, call *ast.Node) (writerInputLocation, bool) {
	tag := progressPointer(call)
	for i := 0; i < w.LabelCount; i++ {
		if w.Labels[i].Call == tag {
			return w.Labels[i].Location, true
		}
	}
	if q == nil || q.owner == nil || call == nil {
		return writerInputLocation{}, false
	}
	for source, index := range q.owner.indexes {
		if source == nil {
			continue
		}
		for _, candidate := range index.calls {
			if w.SourceInspections.Load() >= 262144 {
				w.SourceBudgetDrops.Add(1)
				return writerInputLocation{}, false
			}
			w.SourceInspections.Add(1)
			if candidate != call {
				continue
			}
			name := source.FileName()
			if len(name) > 512 {
				return writerInputLocation{}, false
			}
			location := writerInputLocation{strings.Clone(name), call.Pos(), call.End(), int(call.Kind)}
			if w.LabelCount < len(w.Labels) {
				w.Labels[w.LabelCount] = writerInputLabel{tag, location}
				w.LabelCount++
			}
			return location, true
		}
	}
	w.IndexMisses.Add(1)
	return writerInputLocation{}, false
}
func (w *writerInputProgress) retain(record writerInputTraceRecord) {
	n := w.Recorded.Add(1)
	if n > uint64(len(w.Records)) {
		w.Overwritten.Add(1)
	}
	w.Records[(n-1)%uint64(len(w.Records))] = record
}
func writerInputQueryTag(q *sourceValueQuery) uint64 { return uint64(uintptr(unsafe.Pointer(q))) }

// Begin/end assign all requests serials, with bounded active timing slots.
// Serial validation drops closed/replaced parent slots, including copied-query
// lineage whose parent request has already ended. End checks its own exact query tag.
func progressWriterBegin(q *sourceValueQuery, call, writer *ast.Node) writerInputTraceFrame {
	s := progressForQuery(q)
	if s == nil {
		return writerInputTraceFrame{}
	}
	started := time.Now()
	w := &s.writerInput
	w.Attempts.Add(1)
	serial := w.Next.Add(1)
	prior := q.writerTraceSerial
	frame := writerInputTraceFrame{s, serial, prior, q.writerTraceState, started}
	if q.writerTraceState != s {
		prior = 0
	}
	q.writerTraceState, q.writerTraceSerial = s, serial
	depth := w.Active.Add(1)
	progressMax(&w.MaxActive, depth)
	if !s.mu.TryLock() {
		w.LockDrops.Add(1)
		return frame
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return frame
	}
	query := writerInputQueryTag(q)
	parent := &w.Frames[prior%uint64(len(w.Frames))]
	if prior == 0 || parent.Serial != prior {
		prior = 0
	}
	slot := &w.Frames[serial%uint64(len(w.Frames))]
	if slot.Serial != 0 {
		w.TimingDrops.Add(1)
	}
	*slot = writerInputActive{Serial: serial, Query: query, Parent: prior}
	if serial <= 64 || serial%1024 == 0 {
		if location, ok := w.locate(q, call); ok {
			w.retain(writerInputTraceRecord{Serial: serial, Parent: prior, Query: query, Reason: "writer-selection", Call: progressPointer(call), Writer: progressPointer(writer), Event: "request", Location: location, Cuts: [4]uint64{progressPointer(q.reading), progressPointer(q.initializing), progressPointer(q.returning), progressPointer(q.invoking)}, Consumer: progressPointer(q.effectOwner), Use: progressPointer(q.effectUse()), Capabilities: progressCapabilities(q)})
		} else {
			w.Unmapped.Add(1)
		}
	}
	w.ObserverNS.Add(uint64(time.Since(started)))
	return frame
}
func progressWriterEnd(q *sourceValueQuery, frame writerInputTraceFrame) {
	s := frame.state
	if s == nil {
		return
	}
	w := &s.writerInput
	finished := time.Now()
	elapsed := finished.Sub(frame.start).Nanoseconds()
	observer := time.Now()
	w.Active.Add(^uint64(0))
	if q.writerTraceState == s && q.writerTraceSerial == frame.serial {
		q.writerTraceState, q.writerTraceSerial = frame.priorState, frame.prior
	}
	if !s.mu.TryLock() {
		w.LockDrops.Add(1)
		return
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	slot := &w.Frames[frame.serial%uint64(len(w.Frames))]
	if slot.Serial != frame.serial || slot.Query != writerInputQueryTag(q) {
		w.TimingDrops.Add(1)
		return
	}
	parent := &w.Frames[slot.Parent%uint64(len(w.Frames))]
	if slot.Parent != 0 && parent.Serial == slot.Parent {
		parent.ChildrenNS += elapsed
	}
	// Only update an already-labelled sampled request. Never publish an unlabelled endpoint.
	for i := range w.Records {
		r := &w.Records[i]
		if r.Event == "request" && r.Serial == frame.serial {
			r.Event = "request-finished"
			r.ElapsedWallNS = elapsed
			r.SelfWallNS = elapsed - slot.ChildrenNS
			break
		}
	}
	*slot = writerInputActive{}
	w.ObserverNS.Add(uint64(time.Since(observer)))
}
func progressWriterComponent(q *sourceValueQuery, r *sourceWriterInputRequest, position int, n *sourceWriterInputNode, covered bool, values int, reason string) {
	s := progressForQuery(q)
	if s == nil {
		return
	}
	start := time.Now()
	w := &s.writerInput
	number := w.Components.Add(1)
	if covered {
		w.Covered.Add(1)
		reason = "covered"
	} else {
		w.Uncovered.Add(1)
		w.Rejections[writerInputReasonSlot(reason)].Add(1)
	}
	if number > 64 && number%1024 != 0 {
		return
	}
	if !s.mu.TryLock() {
		w.LockDrops.Add(1)
		return
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	if r == nil || r.call == nil {
		w.Unmapped.Add(1)
		return
	}
	location, ok := w.locate(q, r.call)
	if !ok {
		w.Unmapped.Add(1)
		return
	}
	record := writerInputTraceRecord{Serial: q.writerTraceSerial, Event: "component", Position: position, Reason: reason, Values: values, Location: location, Call: progressPointer(r.call)}
	record.Cuts = [4]uint64{progressPointer(q.reading), progressPointer(q.initializing), progressPointer(q.returning), progressPointer(q.invoking)}
	record.Consumer, record.Use, record.Capabilities = progressPointer(q.effectOwner), progressPointer(q.effectUse()), progressCapabilities(q)
	record.Recovery = q.reading == r.call && q.initializing == r.call
	if r.graph != nil {
		stats := r.graph.stats
		record.GraphNodes, record.GraphEdges, record.GraphFacts, record.GraphCollections, record.GraphDiscoveryRetired, record.GraphRecoveryRetired = stats.NewNodes, stats.NewEdges, stats.NewFacts, stats.Collections, stats.DiscoveryRetired, stats.RecoveryRetired
	}
	if q.traceRoot != nil {
		record.Root = q.traceRoot.id
	}
	if q.inputs != nil {
		record.InputDeclaration, record.InputInvocation, record.InputBindingCount = progressPointer(q.inputs.declaration), progressPointer(q.inputs.invocation), len(q.inputs.bindings)
	}
	if n != nil {
		record.RecipeKind = int(n.kind)
		if n.expression != nil {
			record.Location.Pos, record.Location.End, record.Location.Kind = n.expression.Pos(), n.expression.End(), int(n.expression.Kind)
		}
	}
	slot := &w.Frames[q.writerTraceSerial%uint64(len(w.Frames))]
	if slot.Serial == q.writerTraceSerial && slot.Query == writerInputQueryTag(q) {
		record.Parent = slot.Parent
	}
	w.retain(record)
	w.ObserverNS.Add(uint64(time.Since(start)))
}
func progressWriterFallback(q *sourceValueQuery, r *sourceWriterInputRequest, call *ast.Node, position int) {
	s := progressForQuery(q)
	if s == nil {
		return
	}
	s.writerInput.Fallbacks.Add(1)
	if r == nil { // This is the actual old-path branch, not a speculative component check.
		temporary := sourceWriterInputRequest{call: call}
		expression := call.Expression()
		if position >= 0 {
			if args := call.AsCallExpression().Arguments; args != nil && position < len(args.Nodes) {
				expression = args.Nodes[position]
			}
		}
		syntax := sourceWriterInputNode{expression: expression}
		progressWriterComponent(q, &temporary, position, &syntax, false, 0, "request-unavailable-at-recovery")
	}
}
func progressWriterEvent(q *sourceValueQuery, event string, values int) {
	s := progressForQuery(q)
	if s == nil {
		return
	}
	if event == "discovery-retired" {
		s.writerInput.DiscoverySkipped.Add(1)
	}
	if event == "recovery-result" {
		s.writerInput.Yields.Add(uint64(values))
	}
}
func (w *writerInputProgress) countersOnly() any {
	reasons := map[string]uint64{}
	for i, name := range writerInputReasonNames {
		reasons[name] = w.Rejections[i].Load()
	}
	costs := map[string]uint64{}
	for i, name := range progressPendingCostNames {
		costs[name] = w.PendingCosts[i].Load()
	}
	pending := map[string]uint64{}
	for i, name := range progressPendingNames {
		pending[name] = w.PendingCounts[i].Load()
	}
	return map[string]any{"pendingMemberCosts": costs, "pendingMember": pending, "pendingNewRelationships": w.PendingRelationships.Load(), "pendingNeverNeededAtCollectorExit": w.PendingNeverNeeded.Load(), "pendingWorkDirty": w.PendingWorkDirty.Load(), "rejectionReasons": reasons, "attempts": w.Attempts.Load(), "components": w.Components.Load(), "covered": w.Covered.Load(), "uncovered": w.Uncovered.Load(), "originalFallbackComponents": w.Fallbacks.Load(), "matchingScopes": w.Yields.Load(), "discoverySkipped": w.DiscoverySkipped.Load(), "records": w.Recorded.Load(), "overwritten": w.Overwritten.Load(), "lockDrops": w.LockDrops.Load(), "unmappedSamplesNotRetained": w.Unmapped.Load(), "descentLabels": w.DescentLabels.Load(), "descentLabelDrops": w.DescentLabelDrops.Load(), "descentLabelRepeats": w.DescentLabelRepeats.Load(), "cachedIndexMisses": w.IndexMisses.Load(), "sourceInventoryInspections": w.SourceInspections.Load(), "sourceScanBudgetDrops": w.SourceBudgetDrops.Load(), "timingSlotDrops": w.TimingDrops.Load(), "observerNanosecondsLowerBound": w.ObserverNS.Load(), "active": w.Active.Load(), "maxActive": w.MaxActive.Load()}
}
func (w *writerInputProgress) snapshot() any {
	records := make([]writerInputTraceRecord, 0, len(w.Records))
	for _, r := range w.Records {
		if r.Event != "" {
			records = append(records, r)
		}
	}
	return map[string]any{"counters": w.countersOnly(), "sampledRecords": records, "limits": "256 ring records, 128 active timing slots, 128 source labels, 262144 total cached-index call inspections, 512-byte filenames. First 64 then 1/1024 component/request samples. Records always have filename/span or are dropped and counted. Original descent labels are best effort under the same fixed label cap and TryLock. Cached-index fallback misses are explicit. Timing is nested wall time, never CPU. Missing/overwritten timing children make self wall an upper bound. Active records are unfinished at cutoff. Query tag and source tags are process-local diagnostic labels, never context/cache keys. No query, AST, binding or scope retained."}
}

var writerInputReasonNames = [...]string{"unsupported", "request-authority", "request-unavailable-at-recovery", "missing-recipe", "binding-cycle", "receiver-owner", "written-binding", "absent-binding", "absent-or-empty-rest-alternatives", "empty-alternatives", "unsupported-carrier-projection-copy", "capture-admission", "indirect-distinct-capture", "recipe-kind-unknown", "syntax-outside-recipe-vocabulary", "identifier-declaration-or-alias-gate", "incomplete-dynamic-index-or-written-binding", "ordered-rest-private-proof-refused"}

func writerInputReasonSlot(reason string) int {
	for i, name := range writerInputReasonNames {
		if name == reason {
			return i
		}
	}
	return 0
}

var progressPendingNames = [...]string{"registered", "replay", "delivered", "acknowledged", "declined", "callee-skipped", "relative-formal", "revoked", "requested", "consumed", "restarted", "subscribed", "construction-published", "get-transferred", "construction-subscribed", "construction-delivered", "writer-input-registered", "writer-input-published", "writer-input-consumed", "writer-admission-retired", "descriptor-required", "descriptor-recovery-deferred", "descriptor-writer-delivered", "descriptor-value-delivered", "descriptor-settled", "descriptor-unresolved", "formal-projection-registered", "formal-projection-replay", "formal-projection-retired", "formal-projection-delivered", "formal-projection-overflow", "direct-exposure-registered", "direct-exposure-consumed", "direct-exposure-settled", "direct-exposure-unresolved"}

// These counters observe only actual lifecycle transitions. They never ask an
// admission predicate or retain the request, query, publisher or ledger.
func progressPendingMember(q *sourceValueQuery, r *sourceWriterInputRequest, event string, position int, stats sourcePendingMemberStats) {
	s := progressForQuery(q)
	if s == nil {
		return
	}
	w := &s.writerInput
	slot := -1
	for i, name := range progressPendingNames {
		if name == event {
			slot = i
			break
		}
	}
	if slot < 0 {
		return
	}
	n := w.PendingCounts[slot].Add(1)
	if n > 8 && n%1024 != 0 {
		return
	}
	start := time.Now()
	if !s.mu.TryLock() {
		w.LockDrops.Add(1)
		return
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	if r == nil || r.call == nil {
		w.Unmapped.Add(1)
		return
	}
	location, ok := w.locate(q, r.call)
	if !ok {
		w.Unmapped.Add(1)
		return
	}
	record := writerInputTraceRecord{Serial: q.writerTraceSerial, Event: "pending-member", Reason: event, Position: position, Call: progressPointer(r.call), Location: location, PendingStats: stats, Cuts: [4]uint64{progressPointer(q.reading), progressPointer(q.initializing), progressPointer(q.returning), progressPointer(q.invoking)}, Consumer: progressPointer(q.effectOwner), Use: progressPointer(q.effectUse()), Capabilities: progressCapabilities(q)}
	if r.member != nil {
		record.PendingPhase = int(r.member.phase)
	}
	frame := &w.Frames[q.writerTraceSerial%uint64(len(w.Frames))]
	if frame.Serial == q.writerTraceSerial && frame.Query == writerInputQueryTag(q) {
		record.Parent = frame.Parent
	}
	w.retain(record)
	w.ObserverNS.Add(uint64(time.Since(start)))
}
func progressPendingMemberRelationships(n uint64) {
	s := progressActive.Load()
	if s != nil && !s.closed.Load() {
		s.writerInput.PendingRelationships.Add(n)
	}
}
func progressPendingMemberDirty() {
	s := progressActive.Load()
	if s != nil && !s.closed.Load() {
		s.writerInput.PendingWorkDirty.Add(1)
	}
}

func progressPendingMemberDeclaration(q *sourceValueQuery, call *ast.Node, event string, stats sourcePendingMemberStats) {
	if q == nil {
		return
	}
	label := sourceWriterInputRequest{call: call, consumer: q.effectOwner}
	progressPendingMember(q, &label, event, -1, stats)
}
func progressPendingNeverNeeded(n uint64) {
	s := progressActive.Load()
	if s != nil && !s.closed.Load() {
		s.writerInput.PendingNeverNeeded.Add(n)
	}
}

// Diagnostic totals count actual source-edge operations, not current contexts.
// They do not deduplicate or alter any semantic work.
var progressPendingCostNames = [...]string{"donor-comparisons", "donor-insertions", "subscriber-comparisons", "subscriber-insertions", "refreshes", "unchanged-revision-noops", "new-donor-deliveries", "caller-comparisons", "caller-insertions", "revisions"}

func progressPendingCost(slot int, n uint64) {
	s := progressActive.Load()
	if s != nil && !s.closed.Load() {
		s.writerInput.PendingCosts[slot].Add(n)
	}
}

// progressDescriptorDisposition counts the final work-owner disposition without
// synthesizing a query or retaining a source producer after collector exit.
func progressDescriptorDisposition(settled bool) {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return
	}
	slot := 25
	if settled {
		slot = 24
	}
	s.writerInput.PendingCounts[slot].Add(1)
}

// This observes original producer publication without creating a query or label.
func progressFormalProjectionDelivered() {
	s := progressActive.Load()
	if s != nil && !s.closed.Load() {
		s.writerInput.PendingCounts[29].Add(1)
	}
}

func progressDirectExposureDisposition(settled bool) {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return
	}
	slot := 34
	if settled {
		slot = 33
	}
	s.writerInput.PendingCounts[slot].Add(1)
}
