package exactcompiler

// Disposable observational state. Analysis never reads these counters, serials,
// records or comparisons. Root serials identify constructor lineages, not frames.
import (
	"bytes"
	"encoding/binary"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"
)

const (
	tRootOpened = iota
	tRootClosed
	tBodyAttempts
	tActiveWithoutEntry
	tEntryOpened
	tEntryClosed
	tFirstAlternative
	tNewAlternative
	tExistingBlocked
	tAdmittedFactOccurrences
	tWriterEntries
	tCollect
	tPrepare
	tScopeAcquired
	tFallbackEntries
	tFallbackGuardRefused
	tFallbackFinished
	tFallbackScopes
	tFallbackNone
	tOuterFallbackFinished
	tOuterFallbackWork
	tCount
)

var progressNames = [...]string{"rootOpened", "rootClosed", "bodyAttempts", "activeWithoutEntryBlocked", "entryOpened", "entryClosed", "firstAlternative", "newAlternativeWithinInterval", "existingAlternativeBlocked", "admittedFactOccurrencesNotUnique", "writerEntries", "collectedCalls", "prepareInvocation", "scopeAcquired", "fallbackEntries", "fallbackGuardRefused", "fallbackFinished", "fallbackMatchingScopes", "fallbackZeroYield", "outerFallbackFinished", "outerFallbackOwnerWork"}

type progressRoot struct {
	state          *progressState
	id, use, owner uint64
	counts         [tCount]atomic.Uint64
	fallbackDepth  atomic.Int64
	callDepth      atomic.Int64
	maxCallDepth   atomic.Uint64
	closed         atomic.Bool
}
type progressSample struct {
	Kind                               string
	Anchor, Root, Interval, Use, Owner uint64
	Cuts                               [4]uint64
	Capabilities                       uint64
	TraversalMode                      uint64
	TraversalModeKnown                 bool
	ActiveEntries, ActiveNodes         int
	Admitted, Saturated                bool
	NewAtoms                           int
	PreviousAlternatives               int
	encoded                            progressEncoded
}
type progressRecurrence struct {
	Kind                                                   string
	Root, PreviousRoot, Interval, PreviousInterval, Anchor uint64
	CrossRoot, CrossInterval                               bool
}
type progressFrontierSlot struct {
	key   atomic.Uint64
	kinds atomic.Uint64
}
type progressIntervalRecord struct {
	Serial, Root, Declaration uint64
	Closed                    bool
}
type progressSourceSpan struct {
	Tag            uint64
	File           uint16
	Pos, End, Kind int
}
type progressState struct {
	writerInput writerInputProgress

	route                                                                    [routeCount]atomic.Uint64
	routeSerial                                                              atomic.Uint64
	endpoints                                                                [128]atomic.Pointer[progressEndpointRecord]
	endpointDropped                                                          atomic.Uint64
	sourceIndexHits, sourceIndexHitSamples, sourceIndexHitSamplesWithoutWalk atomic.Uint64
	sourceFiles                                                              [32]string
	sourceFileCount                                                          int
	sourceSpans                                                              [8192]progressSourceSpan
	sourceSpanDropped, sourceSpanUnsupported                                 uint64
	intervals                                                                [128]progressIntervalRecord
	intervalOverwrites, intervalCloseUnretained                              uint64
	factSamples, sampledNewAtoms, sampledNewCombinations                     uint64
	frontier                                                                 [512]progressFrontierSlot
	frontierDropped                                                          atomic.Uint64
	closed                                                                   atomic.Bool
	nextRoot, nextInterval                                                   atomic.Uint64
	counters                                                                 [tCount]atomic.Uint64
	rootless                                                                 atomic.Uint64
	rootlessByEvent                                                          [tCount]atomic.Uint64
	staleRootEvents                                                          atomic.Uint64
	skippedPeriodicSnapshots                                                 atomic.Uint64
	descendants                                                              [4]atomic.Uint64
	maxCallDepth                                                             atomic.Uint64
	scopeEvents, factEvents                                                  atomic.Uint64
	mu                                                                       sync.Mutex
	roots                                                                    [64]*progressRoot // observer scalars only, no query/scope pointers
	rootOverflow                                                             uint64
	samples                                                                  [128]progressSample
	sampleCount                                                              int
	replacement                                                              uint64
	recurrences                                                              [64]progressRecurrence
	recurrenceCount                                                          int
	recurrenceTotal, incomparable, oversize, observerNanos                   uint64
}

var progressActive atomic.Pointer[progressState]

func progressMax(v *atomic.Uint64, n uint64) {
	for old := v.Load(); n > old; old = v.Load() {
		if v.CompareAndSwap(old, n) {
			return
		}
	}
}

// progressForQuery never lets a copied query from an expired observation
// contribute semantic-event counts or interval closure to a later observation.
func progressForQuery(q *sourceValueQuery) *progressState {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return nil
	}
	if q.traceRoot != nil && q.traceRoot.state != s {
		s.staleRootEvents.Add(1)
		return nil
	}
	return s
}

// progressIndexSpan receives metadata from the existing index walk. It never
// dereferences an AST parent, reads source text or invokes the checker.
func progressIndexSpan(file string, tag uint64, pos, end, kind int) {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	if len(file) > 256 {
		s.sourceSpanUnsupported++
		return
	}
	f := -1
	for i := 0; i < s.sourceFileCount; i++ {
		if s.sourceFiles[i] == file {
			f = i
			break
		}
	}
	if f < 0 {
		if s.sourceFileCount == len(s.sourceFiles) {
			s.sourceSpanUnsupported++
			return
		}
		f = s.sourceFileCount
		s.sourceFiles[f] = strings.Clone(file)
		s.sourceFileCount++
	}
	start := int((tag >> 4) % uint64(len(s.sourceSpans)))
	for i := 0; i < 8; i++ {
		slot := &s.sourceSpans[(start+i)%len(s.sourceSpans)]
		if slot.Tag == 0 || slot.Tag == tag {
			*slot = progressSourceSpan{Tag: tag, File: uint16(f), Pos: pos, End: end, Kind: kind}
			return
		}
	}
	s.sourceSpanDropped++
}
func (s *progressState) sourceSpan(tag uint64) any {
	start := int((tag >> 4) % uint64(len(s.sourceSpans)))
	for i := 0; i < 8; i++ {
		p := s.sourceSpans[(start+i)%len(s.sourceSpans)]
		if p.Tag == tag && tag != 0 {
			return map[string]any{"tag": tag, "file": s.sourceFiles[p.File], "pos": p.Pos, "end": p.End, "kind": p.Kind}
		}
	}
	return nil
}
func progressCount(q *sourceValueQuery, event int, n uint64) {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return
	}
	s.counters[event].Add(n)
	r := q.traceRoot
	if r == nil || r.state != s {
		s.rootless.Add(n)
		s.rootlessByEvent[event].Add(n)
		return
	}
	r.counts[event].Add(n)
	if r.fallbackDepth.Load() > 0 {
		switch event {
		case tWriterEntries:
			s.descendants[0].Add(n)
		case tCollect:
			s.descendants[1].Add(n)
		case tPrepare:
			s.descendants[2].Add(n)
		case tScopeAcquired:
			s.descendants[3].Add(n)
		}
	}
}
func progressFrontier(q *sourceValueQuery, node *ast.Node, kind uint64) {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() || node == nil {
		return
	}
	key := progressPointer(node)
	start := int((key >> 4) % uint64(len(s.frontier)))
	for probe := 0; probe < 4; probe++ {
		slot := &s.frontier[(start+probe)%len(s.frontier)]
		old := slot.key.Load()
		if old == key || (old == 0 && slot.key.CompareAndSwap(0, key)) {
			slot.kinds.Or(1 << kind)
			return
		}
	}
	s.frontierDropped.Add(1)
}
func progressOpenRoot(q *sourceValueQuery) {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return
	}
	r := &progressRoot{state: s, id: s.nextRoot.Add(1), use: progressPointer(q.dependencyUse), owner: progressPointer(q.effectOwner)}
	q.traceRoot = r
	progressCount(q, tRootOpened, 1)
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, p := range s.roots {
		if p == nil || p.closed.Load() {
			s.roots[i] = r
			return
		}
	}
	s.rootOverflow++
}
func progressCloseRoot(q *sourceValueQuery) {
	if r := q.traceRoot; r != nil && r.closed.CompareAndSwap(false, true) {
		progressCount(q, tRootClosed, 1)
	}
}
func progressNewInterval(q *sourceValueQuery, declaration *ast.Node) uint64 {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return 0
	}
	progressCount(q, tEntryOpened, 1)
	id := s.nextInterval.Add(1)
	root := uint64(0)
	if q.traceRoot != nil {
		root = q.traceRoot.id
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	slot := &s.intervals[id%uint64(len(s.intervals))]
	if slot.Serial != 0 {
		s.intervalOverwrites++
	}
	*slot = progressIntervalRecord{Serial: id, Root: root, Declaration: progressPointer(declaration)}
	return id
}
func progressCloseInterval(q *sourceValueQuery, id uint64) {
	if id == 0 {
		return
	}
	progressCount(q, tEntryClosed, 1)
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	slot := &s.intervals[id%uint64(len(s.intervals))]
	if slot.Serial == id {
		slot.Closed = true
	} else {
		s.intervalCloseUnretained++
	}
}
func progressActiveCall(q *sourceValueQuery, node *ast.Node, previous bool) func() {
	r := q.traceRoot
	if r == nil || r.state.closed.Load() || progressActive.Load() != r.state || previous || node == nil || !ast.IsCallExpression(node) {
		return func() {}
	}
	depth := r.callDepth.Add(1)
	progressMax(&r.maxCallDepth, uint64(depth))
	progressMax(&r.state.maxCallDepth, uint64(depth))
	return func() { r.callDepth.Add(-1) }
}
func progressFallback(q *sourceValueQuery, writer, call *ast.Node) func(uint64) {
	if progressForQuery(q) == nil {
		return func(uint64) {}
	}
	priorEndpoint := q.traceFallbackEndpoint
	q.traceFallbackEndpoint = progressEndpoint(q, writer, call)
	r := q.traceRoot
	outer := false
	before := q.owner.work
	if r != nil {
		outer = r.fallbackDepth.Add(1) == 1
	}
	return func(yield uint64) {
		progressEndpointFinish(q, q.traceFallbackEndpoint, yield)
		q.traceFallbackEndpoint = priorEndpoint
		progressCount(q, tFallbackFinished, 1)
		progressCount(q, tFallbackScopes, yield)
		if yield == 0 {
			progressCount(q, tFallbackNone, 1)
		}
		if r != nil {
			r.fallbackDepth.Add(-1)
		}
		if outer {
			progressCount(q, tOuterFallbackFinished, 1)
			progressCount(q, tOuterFallbackWork, uint64(q.owner.work-before))
		}
	}
}
func progressCapabilities(q *sourceValueQuery) uint64 {
	flags := [...]bool{q.inputs != nil, q.operation != nil, q.sourceReceiver != nil, q.pendingCallee != nil, q.pendingWriterInput != nil, q.argumentPrefix != nil, q.returnObservation != nil, q.callerInputs != nil, q.constructionMay != nil, q.receiverInspection != nil, len(q.dependencyEntries) > 0, len(q.workLedgers) > 0, q.installedReceiverCall != nil, q.deferredRead != nil, q.initializerSelection != nil, q.normalBindingCall != nil, q.calleeWriteInventory != nil, q.calleeWriteUse != nil, q.calleeWriteWork != nil, q.setterInput != nil, q.provingConstructionCompletion, q.constructionFieldRead != nil}
	var bits uint64
	for i, v := range flags {
		if v {
			bits |= 1 << i
		}
	}
	if q.dependenciesOnly {
		bits |= 1 << 30
	}
	return bits
}
func progressHeader(q *sourceValueQuery, kind string, anchor *ast.Node) progressSample {
	p := progressSample{Kind: kind, Anchor: progressPointer(anchor), Interval: q.traceInterval, Use: progressPointer(q.dependencyUse), Owner: progressPointer(q.effectOwner), Capabilities: progressCapabilities(q), TraversalMode: uint64(q.traceMode), TraversalModeKnown: q.traceModeKnown, ActiveEntries: len(q.dependencyEntries), ActiveNodes: len(q.active)}
	if q.traceRoot != nil {
		p.Root = q.traceRoot.id
	}
	for i, n := range [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking} {
		p.Cuts[i] = progressPointer(n)
	}
	return p
}
func progressRetain(s *progressState, p progressSample) {
	// All retained comparison bytes are bounded observations of existing immutable
	// descriptions. Active sets, frames and capabilities are never serialized.
	for i := 0; i < s.sampleCount; i++ {
		old := &s.samples[i]
		if old.Kind == p.Kind && old.Anchor == p.Anchor && old.Use == p.Use && old.Owner == p.Owner && old.Cuts == p.Cuts && old.Capabilities == p.Capabilities && old.TraversalMode == p.TraversalMode && old.TraversalModeKnown == p.TraversalModeKnown && old.ActiveEntries == p.ActiveEntries && old.ActiveNodes == p.ActiveNodes && bytes.Equal(old.encoded.data[:old.encoded.n], p.encoded.data[:p.encoded.n]) {
			s.recurrenceTotal++
			if s.recurrenceCount < len(s.recurrences) {
				s.recurrences[s.recurrenceCount] = progressRecurrence{Kind: p.Kind, Root: p.Root, PreviousRoot: old.Root, Interval: p.Interval, PreviousInterval: old.Interval, Anchor: p.Anchor, CrossRoot: p.Root != 0 && old.Root != 0 && p.Root != old.Root, CrossInterval: p.Interval != 0 && old.Interval != 0 && p.Interval != old.Interval}
				s.recurrenceCount++
			}
			// Keep latest lifetime metadata so repeated zero-interval observations cannot
			// masquerade as cross-interval recurrence.
			*old = p
			return
		}
	}
	slot := s.sampleCount
	if slot == len(s.samples) {
		slot = int(s.replacement % uint64(len(s.samples)))
		s.replacement++
	} else {
		s.sampleCount++
	}
	s.samples[slot] = p
}
func progressObserveScope(q *sourceValueQuery, call *ast.Node, scope sourceCalleeScope) {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return
	}
	n := s.scopeEvents.Add(1)
	if n != 1 && n%1024 != 0 {
		return
	}
	started := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() { s.observerNanos += uint64(time.Since(started)) }()
	if s.closed.Load() {
		return
	}
	p := progressHeader(q, "existingCalleeScope", call)
	if !p.encoded.scope(scope, 1, 0) {
		s.incomparable++
		return
	}
	progressRetain(s, p)
}
func progressFactLess(a, b sourceDependencyFact) bool {
	av := [...]uint64{progressPointer(a.owner), progressPointer(a.node), progressPointer(a.site), uint64(a.symbol), uint64(a.root), uint64(a.kind)}
	bv := [...]uint64{progressPointer(b.owner), progressPointer(b.node), progressPointer(b.site), uint64(b.symbol), uint64(b.root), uint64(b.kind)}
	for i, x := range av {
		if x != bv[i] {
			return x < bv[i]
		}
	}
	if a.key != b.key {
		return a.key < b.key
	}
	if a.previous != b.previous {
		return a.previous < b.previous
	}
	return !a.undefined && b.undefined
}
func progressObserveFacts(q *sourceValueQuery, declaration *ast.Node, entry *sourceDependencyEntry, facts map[sourceDependencyFact]bool, admitted, saturated bool) {
	s := progressForQuery(q)
	if s == nil || s.closed.Load() {
		return
	}
	n := s.factEvents.Add(1)
	if n != 1 && n%64 != 0 {
		return
	}
	started := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() { s.observerNanos += uint64(time.Since(started)) }()
	if s.closed.Load() {
		return
	}
	if len(facts) > 16 || len(entry.alternatives) > 8 {
		s.oversize++
		return
	}
	var ordered [16]sourceDependencyFact
	i := 0
	for f := range facts {
		ordered[i] = f
		for j := i; j > 0 && progressFactLess(ordered[j], ordered[j-1]); j-- {
			ordered[j], ordered[j-1] = ordered[j-1], ordered[j]
		}
		i++
	}
	p := progressHeader(q, "existingDependencyFacts", declaration)
	p.Admitted, p.Saturated = admitted, saturated
	p.PreviousAlternatives = len(entry.alternatives)
	for f := range facts {
		known := false
		for _, old := range entry.alternatives {
			known = known || old[f]
		}
		if !known {
			p.NewAtoms++
		}
	}
	for _, f := range ordered[:i] {
		for _, v := range []uint64{progressPointer(f.owner), progressPointer(f.node), progressPointer(f.site), uint64(f.symbol), uint64(f.root), uint64(f.kind)} {
			if !p.encoded.scalar(v, 0) {
				s.oversize++
				return
			}
		}
		if !p.encoded.text(f.key) || !p.encoded.text(f.previous) {
			s.oversize++
			return
		}
		v := uint64(0)
		if f.undefined {
			v = 1
		}
		if !p.encoded.scalar(v, 0) {
			s.oversize++
			return
		}
	}
	s.factSamples++
	s.sampledNewAtoms += uint64(p.NewAtoms)
	if p.Admitted && p.PreviousAlternatives > 0 && p.NewAtoms == 0 {
		s.sampledNewCombinations++
	}
	progressRetain(s, p)
}
func (e *progressEncoded) text(s string) bool {
	if !e.scalar(uint64(len(s)), 0) {
		return false
	}
	for i := range len(s) {
		if !e.scalar(uint64(s[i]), 0) {
			return false
		}
	}
	return true
}

// BeginProgressObservation starts one disposable request observation.
func BeginProgressObservation() {
	if !progressActive.CompareAndSwap(nil, &progressState{}) {
		panic("overlapping progress observations")
	}
}

// ProgressObservationSnapshot returns bounded scalar progress without changing analysis.
func ProgressObservationSnapshot() any {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return nil
	}
	if !s.mu.TryLock() {
		s.skippedPeriodicSnapshots.Add(1)
		return nil
	}
	defer s.mu.Unlock()
	if s.closed.Load() {
		return nil
	}
	return s.snapshot(false)
}

// countersOnly never waits for the detailed snapshot mutex. Final flush can
// always retain global progress even if another bounded encoder is in flight.
func (s *progressState) countersOnly() any {
	counts := map[string]uint64{}
	rootless := map[string]uint64{}
	for i, n := range progressNames {
		counts[n] = s.counters[i].Load()
		rootless[n] = s.rootlessByEvent[i].Load()
	}
	return map[string]any{"writerInputComponents": s.writerInput.countersOnly(), "final": true, "detailedSnapshotSkipped": true, "reason": "detailed observer mutex busy at cutoff", "counters": counts, "rootlessByEvent": rootless, "staleRootEvents": s.staleRootEvents.Load(), "maxActiveCallDepth": s.maxCallDepth.Load(), "descendantEventsInsideFallbackSameRoot": map[string]uint64{"writerEntries": s.descendants[0].Load(), "collect": s.descendants[1].Load(), "prepare": s.descendants[2].Load(), "scope": s.descendants[3].Load()}}
}
func (s *progressState) snapshot(final bool) any {
	counts := map[string]uint64{}
	rootlessCounts := map[string]uint64{}
	for i, n := range progressNames {
		counts[n] = s.counters[i].Load()
		rootlessCounts[n] = s.rootlessByEvent[i].Load()
	}
	roots := make([]map[string]any, 0, len(s.roots))
	for _, r := range s.roots {
		if r == nil {
			continue
		}
		c := map[string]uint64{}
		for i, n := range progressNames {
			c[n] = r.counts[i].Load()
		}
		roots = append(roots, map[string]any{"serial": r.id, "constructorReadingEndpoint": r.use, "constructorReadingSpan": s.sourceSpan(r.use), "effectOwnerSpan": s.sourceSpan(r.owner), "effectOwner": r.owner, "closed": r.closed.Load(), "activeCallDepth": r.callDepth.Load(), "maxActiveCallDepth": r.maxCallDepth.Load(), "fallbackDepth": r.fallbackDepth.Load(), "counters": c})
	}
	observations := make([]map[string]any, 0, s.sampleCount)
	for i := 0; final && i < s.sampleCount; i++ {
		p := &s.samples[i]
		observations = append(observations, map[string]any{"kind": p.Kind, "anchor": p.Anchor, "anchorSpan": s.sourceSpan(p.Anchor), "dependencyUseSpan": s.sourceSpan(p.Use), "root": p.Root, "interval": p.Interval, "dependencyUse": p.Use, "effectOwner": p.Owner, "cuts": p.Cuts, "capabilities": p.Capabilities, "traversalMode": p.TraversalMode, "traversalModeKnown": p.TraversalModeKnown, "activeEntries": p.ActiveEntries, "activeNodes": p.ActiveNodes, "encodedBytes": p.encoded.n, "descriptionBytes": p.encoded.data[:p.encoded.n], "admitted": p.Admitted, "saturated": p.Saturated, "newAtomsRelativeToInterval": p.NewAtoms, "previousAlternatives": p.PreviousAlternatives})
	}
	frontier := map[string]uint64{"droppedEvents": s.frontierDropped.Load()}
	labels := [...]string{"rootDemand", "entryDeclaration", "writerDemand", "preparedCall", "fallbackCall"}
	for i := range s.frontier {
		bits := s.frontier[i].kinds.Load()
		for k, label := range labels {
			if bits&(1<<k) != 0 {
				frontier[label]++
			}
		}
	}
	var intervals []progressIntervalRecord
	if final {
		intervals = append(intervals, s.intervals[:]...)
	}
	return map[string]any{"writerInputComponents": s.writerInput.snapshot(), "componentRoutes": s.routeSnapshot(), "fallbackEndpoints": s.endpointSnapshot(), "endpointLabelCoverage": s.endpointCoverage(), "sourceIndexHits": s.sourceIndexHits.Load(), "sourceIndexHitSamples": s.sourceIndexHitSamples.Load(), "sourceIndexHitSamplesWithoutWalk": s.sourceIndexHitSamplesWithoutWalk.Load(), "sourceSpanDropped": s.sourceSpanDropped, "sourceSpanUnsupported": s.sourceSpanUnsupported, "sourceFiles": s.sourceFiles[:s.sourceFileCount], "intervalRecords": intervals, "intervalRecordOverwrites": s.intervalOverwrites, "intervalCloseUnretained": s.intervalCloseUnretained, "factSamples": s.factSamples, "sampledNewAtomsRelativeToInterval": s.sampledNewAtoms, "sampledNewCombinationsWithoutNewAtoms": s.sampledNewCombinations, "frontierRetainedDistinct": frontier, "final": final, "counters": counts, "roots": roots, "rootTrackingOverflow": s.rootOverflow, "maxActiveCallDepth": s.maxCallDepth.Load(), "staleRootEvents": s.staleRootEvents.Load(), "skippedPeriodicSnapshots": s.skippedPeriodicSnapshots.Load(), "rootlessEventOccurrences": s.rootless.Load(), "rootlessByEvent": rootlessCounts, "descendantEventsInsideFallbackSameRoot": map[string]uint64{"writerEntries": s.descendants[0].Load(), "collect": s.descendants[1].Load(), "prepare": s.descendants[2].Load(), "scope": s.descendants[3].Load()}, "scopeEvents": s.scopeEvents.Load(), "factEvents": s.factEvents.Load(), "sampleRecords": observations, "boundedExactRecurrences": s.recurrences[:s.recurrenceCount], "recurrencesTotal": s.recurrenceTotal, "incomparableScopes": s.incomparable, "oversizeFacts": s.oversize, "sampleReplacements": s.replacement, "observerNanoseconds": s.observerNanos, "boundedSampleStorageBytes": unsafe.Sizeof(s.samples), "limitations": "Root serial is constructor lineage, copied queries share it. Exact recurrence covers observed finite bytes/cuts/modes/presence only. Capability contents and active membership are not compared. Existing dependency facts erase some ordering and are not exact binding equality. Zero interval means no observed body-entry interval. No cache keys, convergence or completed-output proof."}
}

// EndProgressObservation detaches the observer before independent timer flushing.
func EndProgressObservation() any {
	s := progressActive.Swap(nil)
	if s == nil {
		return nil
	}
	s.closed.Store(true)
	if !s.mu.TryLock() {
		return s.countersOnly()
	}
	defer s.mu.Unlock()
	return s.snapshot(true)
}

type progressEncoded struct {
	data      [1536]byte
	n, leaves int
	hash      [4]uint64
}

func (e *progressEncoded) scalar(n uint64, group int) bool {
	if e.leaves >= 256 || e.n+8 > len(e.data) {
		return false
	}
	binary.LittleEndian.PutUint64(e.data[e.n:], n)
	e.n += 8
	e.leaves++
	e.hash[group] = (e.hash[group] ^ n) * 1099511628211
	return true
}
func progressPointer(n *ast.Node) uint64 { return uint64(uintptr(unsafe.Pointer(n))) }
func (e *progressEncoded) scope(s sourceCalleeScope, group, depth int) bool {
	if depth > 8 || len(s.bindings) > 64 || len(s.creators) > 64 {
		return false
	}
	if !e.scalar(uint64(len(s.bindings)), group) {
		return false
	}
	var order [64]int
	for i := range s.bindings {
		order[i] = i
		for j := i; j > 0 && s.bindings[order[j]].symbol < s.bindings[order[j-1]].symbol; j-- {
			order[j], order[j-1] = order[j-1], order[j]
		}
	}
	for i := range s.bindings {
		b := s.bindings[order[i]]
		if !e.scalar(uint64(b.symbol), group) || !e.terms(b.values, group, depth+1) {
			return false
		}
	}
	g := 3
	if group == 2 {
		g = 2
	}
	if !e.scalar(uint64(len(s.creators)), g) {
		return false
	}
	for i := range s.creators {
		order[i] = i
		for j := i; j > 0 && progressPointer(s.creators[order[j]].body) < progressPointer(s.creators[order[j-1]].body); j-- {
			order[j], order[j-1] = order[j-1], order[j]
		}
	}
	for i := range s.creators {
		c := s.creators[order[i]]
		if !e.scalar(progressPointer(c.body), g) || !e.scalar(progressPointer(c.creation.invocation), g) || !e.scalar(progressPointer(c.creation.returning), g) {
			return false
		}
	}
	return true
}
func (e *progressEncoded) terms(values []sourceCalleeTerm, group, depth int) bool {
	if depth > 8 {
		return false
	}
	nilTag := uint64(0)
	if values != nil {
		nilTag = 1
	}
	if !e.scalar(nilTag, group) || !e.scalar(uint64(len(values)), group) {
		return false
	}
	for _, v := range values {
		u := uint64(0)
		if v.undefined {
			u = 1
		}
		if !e.scalar(progressPointer(v.node), group) || !e.scalar(u, group) || !e.scalar(uint64(len(v.path)), group) {
			return false
		}
		for _, p := range v.path {
			if !e.scalar(uint64(len(p)), group) {
				return false
			}
			for i := 0; i < len(p); i++ {
				if !e.scalar(uint64(p[i]), group) {
					return false
				}
			}
		}
		// Copied maps and rest containers are deliberately incomparable in this small
		// observer. Do not invent another general source serializer.
		if v.rest != nil || v.copied != nil {
			return false
		}
		c := uint64(0)
		if v.capture != nil {
			c = 1
		}
		if !e.scalar(c, 2) {
			return false
		}
		if v.capture != nil && !e.scope(*v.capture, 2, depth+1) {
			return false
		}
	}
	return true
}

// Passive route metadata. No producer predicate is invoked here. Every event is
// emitted only by an already evaluated branch or original acquisition boundary.
const (
	routeReceiver = iota
	routeArgument
	routeRawCallComponent
	routeOtherComponent
	routePendingTrue
	routePendingTrueExposure
	routePendingTrueDirectWhole
	routePendingTrueProjected
	routePendingTrueOther
	routeMemberRecovery
	routeMemberRecoveryExposure
	routeMemberRecoveryAfterOwnReturnWithheld
	routeMemberRecoveryAfterOwnReturnWithheldExposure
	routeCount
)

var routeNames = [...]string{"receiverComponents", "argumentComponents", "rawCallComponents", "otherComponents", "actualPendingCalleeOutputTrue", "pendingTrueInsideExposure", "pendingTrueDirectWholeComponent", "pendingTrueProjectedComponent", "pendingTrueOtherOrUnmatched", "projectedMemberRecovery", "projectedMemberRecoveryInsideExposure", "memberRecoveryAfterSameCallReturnWithheld", "memberRecoveryAfterSameCallReturnWithheldInsideExposure"}

type progressExposure struct {
	Owner, Node                   uint64
	Role, Ordinal, Kind, Endpoint int
}
type progressProjection struct {
	Owner, Call, Serial uint64
	Exposure            progressExposure
	Depth               int
	Named               bool
	Mode                accessorTraversal
	Withheld            bool
	Key                 [64]byte
	KeyLen              int
	KeyTruncated        bool
}
type progressEndpointRecord struct {
	Call, Writer, FirstRoot        uint64
	lastRoot                       atomic.Uint64
	started, finished, zero, yield atomic.Uint64
	routes                         [routeCount]atomic.Uint64
}

func progressEndpoint(q *sourceValueQuery, writer, call *ast.Node) int {
	s := progressForQuery(q)
	if s == nil {
		return 0
	}
	ct, wt := progressPointer(call), progressPointer(writer)
	start := int(((ct >> 4) ^ (wt >> 4)) % uint64(len(s.endpoints)))
	for probe := 0; probe < 8; probe++ {
		i := (start + probe) % len(s.endpoints)
		p := s.endpoints[i].Load()
		if p == nil {
			r := uint64(0)
			if q.traceRoot != nil {
				r = q.traceRoot.id
			}
			candidate := &progressEndpointRecord{Call: ct, Writer: wt, FirstRoot: r}
			if s.endpoints[i].CompareAndSwap(nil, candidate) {
				p = candidate
			} else {
				p = s.endpoints[i].Load()
			}
		}
		if p.Call == ct && p.Writer == wt {
			p.started.Add(1)
			if q.traceRoot != nil {
				p.lastRoot.Store(q.traceRoot.id)
			}
			return i + 1
		}
	}
	s.endpointDropped.Add(1)
	return 0
}
func progressEndpointFinish(q *sourceValueQuery, slot int, yield uint64) {
	s := progressForQuery(q)
	if s == nil || slot < 1 || slot > len(s.endpoints) {
		return
	}
	if p := s.endpoints[slot-1].Load(); p != nil {
		p.finished.Add(1)
		p.yield.Add(yield)
		if yield == 0 {
			p.zero.Add(1)
		}
	}
}
func progressRouteCount(q *sourceValueQuery, event, slot int) {
	s := progressForQuery(q)
	if s == nil {
		return
	}
	s.route[event].Add(1)
	if slot > 0 && slot <= len(s.endpoints) {
		if p := s.endpoints[slot-1].Load(); p != nil {
			p.routes[event].Add(1)
		}
	}
}
func progressComponent(q *sourceValueQuery, node *ast.Node, role, ordinal int) func() {
	if progressForQuery(q) == nil {
		return func() {}
	}
	prior := q.traceExposure
	c := progressExposure{Owner: uint64(uintptr(unsafe.Pointer(q))), Node: progressPointer(node), Role: role, Ordinal: ordinal, Endpoint: q.traceFallbackEndpoint}
	if node != nil {
		c.Kind = int(node.Kind)
	}
	q.traceExposure = c
	if role == 1 {
		progressRouteCount(q, routeReceiver, c.Endpoint)
	} else {
		progressRouteCount(q, routeArgument, c.Endpoint)
	}
	if node != nil && ast.IsCallExpression(node) {
		progressRouteCount(q, routeRawCallComponent, c.Endpoint)
	} else {
		progressRouteCount(q, routeOtherComponent, c.Endpoint)
	}
	return func() { q.traceExposure = prior }
}
func progressBeginProjection(q *sourceValueQuery, call *ast.Node, path []string, name string, mode accessorTraversal) progressProjection {
	s := progressForQuery(q)
	if s == nil {
		return progressProjection{}
	}
	p := progressProjection{Owner: uint64(uintptr(unsafe.Pointer(q))), Call: progressPointer(call), Serial: s.routeSerial.Add(1), Exposure: q.traceExposure, Depth: len(path), Named: name != "", Mode: mode}
	key := name
	if len(path) > 0 {
		key = path[0]
	}
	p.KeyLen = len(key)
	if p.KeyLen > len(p.Key) {
		p.KeyLen = len(p.Key)
		p.KeyTruncated = true
	}
	copy(p.Key[:p.KeyLen], key[:p.KeyLen])
	return p
}
func progressPendingTrue(q *sourceValueQuery, call *ast.Node) {
	if progressForQuery(q) == nil {
		return
	}
	owner := uint64(uintptr(unsafe.Pointer(q)))
	p := &q.traceProjection
	slot := 0
	exposure := q.traceExposure.Owner == owner && q.traceExposure.Role != 0
	if exposure {
		slot = q.traceExposure.Endpoint
	}
	progressRouteCount(q, routePendingTrue, slot)
	if exposure {
		progressRouteCount(q, routePendingTrueExposure, slot)
	}
	if p.Owner != owner || p.Call != progressPointer(call) {
		progressRouteCount(q, routePendingTrueOther, slot)
		return
	}
	p.Withheld = true
	if exposure && p.Exposure.Owner == owner && p.Exposure.Node == p.Call && p.Depth == 0 && !p.Named && p.Mode == accessorAcquire {
		progressRouteCount(q, routePendingTrueDirectWhole, slot)
	} else if exposure && (p.Depth > 0 || p.Named) {
		progressRouteCount(q, routePendingTrueProjected, slot)
	} else {
		progressRouteCount(q, routePendingTrueOther, slot)
	}
}
func progressMemberRecovery(q *sourceValueQuery, p progressProjection) {
	if progressForQuery(q) == nil {
		return
	}
	owner := uint64(uintptr(unsafe.Pointer(q)))
	slot := 0
	exposure := p.Owner == owner && p.Exposure.Owner == owner && p.Exposure.Role != 0
	if exposure {
		slot = p.Exposure.Endpoint
	}
	progressRouteCount(q, routeMemberRecovery, slot)
	if exposure {
		progressRouteCount(q, routeMemberRecoveryExposure, slot)
	}
	if p.Owner == owner && p.Withheld {
		progressRouteCount(q, routeMemberRecoveryAfterOwnReturnWithheld, slot)
		if exposure {
			progressRouteCount(q, routeMemberRecoveryAfterOwnReturnWithheldExposure, slot)
		}
	}
}
func progressCachedIndexHit(file string) {
	s := progressActive.Load()
	if s == nil || s.closed.Load() {
		return
	}
	n := s.sourceIndexHits.Add(1)
	// Observe the first eight and then every 4096th existing hit. No index is
	// rebuilt or walked to label a cache hit. Unwalked counts are sampled events.
	if n > 8 && n%4096 != 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed.Load() {
		return
	}
	s.sourceIndexHitSamples.Add(1)
	found := false
	for i := 0; i < s.sourceFileCount; i++ {
		found = found || s.sourceFiles[i] == file
	}
	if !found {
		s.sourceIndexHitSamplesWithoutWalk.Add(1)
	}
}
func (s *progressState) routeSnapshot() any {
	values := map[string]uint64{}
	for i, n := range routeNames {
		values[n] = s.route[i].Load()
	}
	return values
}
func (s *progressState) endpointSnapshot() any {
	rows := make([]map[string]any, 0, len(s.endpoints))
	for i := range s.endpoints {
		p := s.endpoints[i].Load()
		if p == nil {
			continue
		}
		v := map[string]uint64{}
		for j, n := range routeNames {
			v[n] = p.routes[j].Load()
		}
		rows = append(rows, map[string]any{"call": p.Call, "writer": p.Writer, "callSpan": s.sourceSpan(p.Call), "writerSpan": s.sourceSpan(p.Writer), "firstRoot": p.FirstRoot, "lastRoot": p.lastRoot.Load(), "started": p.started.Load(), "finished": p.finished.Load(), "zero": p.zero.Load(), "yield": p.yield.Load(), "routes": v})
	}
	return rows
}
func (s *progressState) endpointCoverage() any {
	roots, rootUse, rootOwner, endpoints, call, writer := 0, 0, 0, 0, 0, 0
	for _, r := range s.roots {
		if r == nil {
			continue
		}
		roots++
		if s.sourceSpan(r.use) != nil {
			rootUse++
		}
		if s.sourceSpan(r.owner) != nil {
			rootOwner++
		}
	}
	var completed, callCompleted, writerCompleted uint64
	for i := range s.endpoints {
		p := s.endpoints[i].Load()
		if p == nil {
			continue
		}
		endpoints++
		n := p.finished.Load()
		completed += n
		if s.sourceSpan(p.Call) != nil {
			call++
			callCompleted += n
		}
		if s.sourceSpan(p.Writer) != nil {
			writer++
			writerCompleted += n
		}
	}
	return map[string]any{"retainedRoots": roots, "rootUsesLabelled": rootUse, "rootOwnersLabelled": rootOwner, "retainedEndpoints": endpoints, "callsLabelled": call, "writersLabelled": writer, "completedEndpointEvents": completed, "completedEventsWithCallLabel": callCompleted, "completedEventsWithWriterLabel": writerCompleted, "endpointDrops": s.endpointDropped.Load()}
}
