package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

type languageCompletion uint8

const (
	languageNormal languageCompletion = iota
	languageThrow
	languageResidual
	languageReturn
)

// languageAlternative is a correlated result. Residual obligations and known
// contributions remain independent of successful acquired values.
type languageAlternative struct {
	binding               *languageBindingContext // immutable H owner, independent of expression pending metadata
	objects               []storageObjectObservation
	storage               *storageContinuation
	callInputs            *languageCallInputs
	callHistory           *languageCallHistory
	finally               *languageFinallyContext // immutable family owner, not expression pending data
	returnBoundary        languageID              // producer of active Return only
	pendingReturnBoundary languageID              // producer of a parked pending Return only
	branch                languageBranch
	completion            languageCompletion
	value                 languageValue
	effects               []languageID
	obligations           []string
	// Residual cuts retain their remaining PC and pending completion at branch.
	remaining    string
	pending      languageCompletion
	pendingValue languageValue
}

func languageCopy(a languageAlternative) languageAlternative {
	a.callInputs = copyLanguageCallInputs(a.callInputs)
	a.objects = copyStorageObjectHistory(a.objects)
	a.storage = copyStorageContinuation(a.storage)
	a.effects = append([]languageID(nil), a.effects...)
	a.obligations = append([]string(nil), a.obligations...)
	return a
}

// languageJoin retains a semantic disjunction, never a Cartesian product of
// values and environments. Stable input identities make duplicate rows identical.
func languageJoin(a, b []languageAlternative) []languageAlternative {
	var out []languageAlternative
	for _, group := range [][]languageAlternative{a, b} {
		for _, v := range group {
			found := false
			for _, old := range out {
				found = found || old.binding == v.binding && old.branch == v.branch && old.completion == v.completion && old.value == v.value && old.remaining == v.remaining && sameStorageContinuation(old.storage, v.storage) && sameLanguageCallInputs(old.callInputs, v.callInputs) && old.callHistory == v.callHistory && sameLanguageFinallyContext(old.finally, v.finally) && old.returnBoundary == v.returnBoundary && old.pendingReturnBoundary == v.pendingReturnBoundary && old.pending == v.pending && old.pendingValue == v.pendingValue && sameStorageObjectHistory(old.objects, v.objects) && slices.Equal(old.effects, v.effects) && slices.Equal(old.obligations, v.obligations)
			}
			if !found {
				out = append(out, languageCopy(v))
			}
		}
	}
	return out
}

// languageSequence enters only Normal successors using their actual B_out.
// Prefix contributions are conserved even when the successor refuses or throws.
// An empty successor population supplies no terminal accounting. Preserve the
// paid prefix as a precision residual, never a successful or divergent result.
func languageSequence(in []languageAlternative, next func(languageAlternative) []languageAlternative) []languageAlternative {
	var out []languageAlternative
	for _, a := range in {
		if a.completion != languageNormal {
			out = append(out, languageCopy(a))
			continue
		}
		successors := next(languageCopy(a))
		if len(successors) == 0 {
			missing := languageCopy(a)
			missing.completion = languageResidual
			missing.pending = languageNormal
			missing.pendingValue = a.value
			missing.pendingReturnBoundary = languageID{}
			missing.returnBoundary = languageID{}
			missing.value = languageValue{}
			missing.remaining = "unavailable sequence successor"
			missing.obligations = append(missing.obligations, missing.remaining)
			out = append(out, missing)
			continue
		}
		for _, b := range successors {
			// Ordinary successors retain the waiting immutable family association.
			// Explicit family routing supplies its own replacement association.
			if b.binding == nil {
				b.binding = a.binding
			}
			if b.finally == nil {
				b.finally = a.finally
			}
			objects := storageObjectHistory(a.objects, b.objects)
			// History adoption already detached this slice. Copy the other payloads.
			b.objects = nil
			b = languageCopy(b)
			b.objects = objects
			b.effects = languageContributions(a.effects, b.effects)
			b.obligations = append(append([]string(nil), a.obligations...), b.obligations...)
			out = append(out, b)
		}
	}
	return out
}

// languageReceipt is immutable history owned by one generation. Projection only
// copies payload. It cannot apply writes or call an evaluator.
type languageReceipt struct {
	input        languageBranch
	alternatives []languageAlternative
	occurrence   languageID
}

func (o *languageOwner) receipt(input languageBranch, values []languageAlternative) *languageReceipt {
	if !o.canIssue(1) {
		return nil
	}
	r := &languageReceipt{input: input, occurrence: o.identity()}
	for _, a := range values {
		r.alternatives = append(r.alternatives, languageCopy(a))
	}
	return r
}
func (r *languageReceipt) project() ([]languageAlternative, bool) {
	if r == nil || r.input.owner == nil || !r.input.owner.live(r.input) {
		return nil, false
	}
	out := make([]languageAlternative, 0, len(r.alternatives))
	for _, a := range r.alternatives {
		if !r.input.owner.live(a.branch) {
			return nil, false
		}
		out = append(out, languageCopy(a))
	}
	return out, true
}

// languageQuery deliberately uses the encompassing immutable state root as its
// conservative dependency population version. Missing coverage forbids reuse.
// Historical receipts never consult this freshness guard.
type languageQuery struct {
	input    languageBranch
	complete bool
}

func (q languageQuery) reusable(b languageBranch) bool {
	return q.complete && q.input.owner != nil && q.input.owner.live(b) && q.input == b
}

// Contribution identities are opaque to this algebra. Repeated imported prefix
// identities are already paid and cannot become duplicate contributions.
func languageContributions(a, b []languageID) []languageID {
	out := append([]languageID(nil), a...)
	for _, id := range b {
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

// storageObjectObservation identifies one completed source event. Its receipt
// retains only the acquired value and immutable branch at that event, independently
// of later writes and execution registers. The owning execution path publishes
// the observation, including getter execution and the owned prefix schedule.
// Issuance fixes one payload per occurrence. Every transport copies this
// record without editing it. Adoption uses occurrence alone, not Reference ID.
type storageObjectObservation struct {
	reference languageID // nonzero only for an actual completed owned Get
	recipe    *storageRecipe
	node      *ast.Node
	pc        int
	receipt   *languageReceipt
}

// storageObjectHistoryKey uses the paid producing occurrence, not a receipt
// wrapper address. Unissued records retain their structural identity without
// inventing an occurrence or merging unknown producers.
type storageObjectHistoryKey struct {
	occurrence languageID
	unissued   storageObjectObservation
}

func (h storageObjectObservation) historyKey() storageObjectHistoryKey {
	if h.receipt != nil && h.receipt.occurrence.owner != nil && h.receipt.occurrence.serial != 0 {
		return storageObjectHistoryKey{occurrence: h.receipt.occurrence}
	}
	return storageObjectHistoryKey{unissued: h}
}

// storageObjectHistory adopts each producing occurrence once in prefix/suffix
// order. A successor may carry its input history or only newly acquired events.
// Copying and lookup are linear in the supplied history lengths.
func storageObjectHistory(prefix, suffix []storageObjectObservation) []storageObjectObservation {
	if len(prefix)+len(suffix) == 0 {
		return nil
	}
	out := make([]storageObjectObservation, 0, len(prefix)+len(suffix))
	seen := make(map[storageObjectHistoryKey]struct{}, len(prefix)+len(suffix))
	for _, group := range [][]storageObjectObservation{prefix, suffix} {
		for _, h := range group {
			key := h.historyKey()
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, h)
		}
	}
	return out
}

func sameStorageObjectHistory(a, b []storageObjectObservation) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].recipe != b[i].recipe || a[i].historyKey() != b[i].historyKey() || a[i].reference != b[i].reference {
			return false
		}
		if a[i].reference != (languageID{}) && !sameBodyGetObservation(a[i], b[i]) {
			return false
		}
	}
	return true
}

// project validates the requested producer occurrence and owner before lending
// detached historical alternatives. It never acquires a property or advances state.
func (h storageObjectObservation) project(owner *languageOwner, occurrence languageID) ([]languageAlternative, bool) {
	if h.receipt == nil || owner == nil || h.receipt.input.owner != owner || h.receipt.occurrence != occurrence {
		return nil, false
	}
	return h.receipt.project()
}

// Exact capacity makes the widened observation-copy population explicit.
func copyStorageObjectHistory(in []storageObjectObservation) []storageObjectObservation {
	if len(in) == 0 {
		return nil
	}
	out := make([]storageObjectObservation, len(in))
	copy(out, in)
	return out
}
func sameBodyGetObservation(a, b storageObjectObservation) bool {
	if a.recipe != b.recipe || a.reference != b.reference || a.historyKey() != b.historyKey() || a.node != b.node || a.pc != b.pc || a.receipt == nil || b.receipt == nil || a.receipt.input != b.receipt.input || len(a.receipt.alternatives) != 1 || len(b.receipt.alternatives) != 1 {
		return false
	}
	x, y := a.receipt.alternatives[0], b.receipt.alternatives[0]
	return x.branch == y.branch && x.completion == y.completion && x.value == y.value && x.returnBoundary == y.returnBoundary
}
