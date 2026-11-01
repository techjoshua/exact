package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// languageOwner is one selected checker/source generation's identity namespace.
// It retains no traversal inputs. Immutable roots and receipts keep it alive.
// Replacing the checker creates another owner. Disposal fences publication.
type languageOwner struct {
	generation, next uint64
	disposed         bool
	numericFactory   *ast.NodeFactory
}
type languageID struct {
	owner  *languageOwner
	serial uint64
}
type languageEnvironment struct {
	id    languageID
	outer *languageEnvironment
}
type languageCell struct {
	environment languageID
	id          languageID
	summary     bool
	immutable   bool // lexical const, enforced only for these owned language cells
}

// languageSourceTrace is immutable provenance detached from activation inputs.
type languageSourceTrace struct {
	node     *ast.Node
	previous *languageSourceTrace
}

// languageValue is an acquired primitive or owned object identity. Source handles are generation-owned,
// never instructions to evaluate. Empty environments represent no captures.
type languageValue struct {
	number    numberPayload // inert semantic content, never AST evaluation authority
	callable  *languageCallable
	object    *languageObject
	trace     *languageSourceTrace
	text      string
	node      *ast.Node
	undefined bool
}

// languageIndex is a persistent binary identity index. Updates copy 65 nodes at
// most. This fixed key width is unrelated to public source nesting depth.
type languageIndex struct {
	children [2]*languageIndex
	values   []languageValue
}
type languageState struct {
	storage  *languageStorage
	id       languageID
	previous *languageState
	index    *languageIndex
}

// languageBranch transports state and environment under one opaque guard.
// Guards are owned predicates, not expressions evaluated by this foundation.
type languageBranch struct {
	owner      *languageOwner
	generation uint64
	guard      string
	state      *languageState
	env        *languageEnvironment
	cursor     uint64
}
type languageDelta struct {
	base  languageBranch
	cell  languageCell
	value languageValue
}

func newLanguageOwner() *languageOwner { return &languageOwner{generation: 1} }

// Identity issuance is checked before mutation, independently of advisory cost.
func (o *languageOwner) canIssue(n uint64) bool {
	return o != nil && !o.disposed && n <= ^uint64(0)-o.next
}
func (o *languageOwner) identity() languageID {
	if !o.canIssue(1) {
		return languageID{}
	}
	o.next++
	return languageID{o, o.next}
}
func (o *languageOwner) environment(outer *languageEnvironment) *languageEnvironment {
	if !o.canIssue(1) {
		return nil
	}
	return &languageEnvironment{o.identity(), outer}
}

// cell allocates a stable identity in its actual lexical environment. Distinct
// activations never share a cell solely because they have the same source site.
func (o *languageOwner) cell(env *languageEnvironment, summary bool) languageCell {
	if env == nil || env.id.owner != o || !o.canIssue(1) {
		return languageCell{}
	}
	return languageCell{environment: env.id, id: o.identity(), summary: summary}
}
func (o *languageOwner) root() languageBranch {
	if !o.canIssue(10) {
		return languageBranch{}
	}
	return languageBranch{owner: o, generation: o.generation, guard: "true", state: &languageState{id: o.identity()}, env: o.environment(nil)}
}
func (o *languageOwner) live(b languageBranch) bool {
	return !o.disposed && b.owner == o && b.generation == o.generation && b.state != nil && b.state.id.owner == o && b.env != nil && b.env.id.owner == o
}
func (o *languageOwner) dispose() { o.disposed = true; o.generation++ }
func languageLookup(n *languageIndex, key uint64, bit int) []languageValue {
	if n == nil {
		return nil
	}
	if bit < 0 {
		return n.values
	}
	return languageLookup(n.children[(key>>uint(bit))&1], key, bit-1)
}
func languageInsert(n *languageIndex, key uint64, bit int, v []languageValue) *languageIndex {
	out := &languageIndex{}
	if n != nil {
		*out = *n
	}
	if bit < 0 {
		out.values = append([]languageValue(nil), v...)
	} else {
		side := (key >> uint(bit)) & 1
		out.children[side] = languageInsert(out.children[side], key, bit-1, v)
	}
	return out
}
func (o *languageOwner) read(b languageBranch, c languageCell) []languageValue {
	if !o.live(b) || c.id.owner != o || c.environment.owner != o {
		return nil
	}
	return append([]languageValue(nil), languageLookup(b.state.index, c.id.serial, 63)...)
}

// apply advances the indexed cell state while preserving storage. A caller must continue from returned B_out.
// An exact input snapshot may be reused for an independent derivation, but the
// advanced output cannot consume its predecessor's delta a second time.
func (o *languageOwner) apply(b languageBranch, d languageDelta) (languageBranch, bool) {
	if !o.canAdvance(b, 1) || !o.live(b) || b != d.base || d.cell.id.owner != o || d.cell.environment.owner != o {
		return b, false
	}
	values := []languageValue{d.value}
	if d.cell.summary {
		values = o.read(b, d.cell)
		found := false
		for _, v := range values {
			found = found || v == d.value
		}
		if !found {
			values = append(values, d.value)
		}
	}
	b.state = &languageState{id: o.identity(), previous: b.state, storage: b.state.storage, index: languageInsert(b.state.index, d.cell.id.serial, 63, values)}
	b.cursor++
	return b, true
}

// canAdvance protects actual uint64 identities and cursor progress. Eight IDs
// retain the current finite cut/raw/history/source-seal tail (at most two local
// snapshots, two family seals, raw seal, Call history and source seal). This is
// independent of estimated work and is not a renewable execution allowance.
func (o *languageOwner) canAdvance(b languageBranch, n uint64) bool {
	return o != nil && o.live(b) && n <= ^uint64(0)-8 && o.canIssue(n+8) && n <= ^uint64(0)-2 && b.cursor <= ^uint64(0)-n-2
}
