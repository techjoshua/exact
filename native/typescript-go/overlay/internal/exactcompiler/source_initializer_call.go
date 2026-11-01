package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInitializerCallLayout identifies the one final, original const binding.
// Existing event registers and lexical cells carry its result. There is no
// detached Call value or resumable historical entry in this source subset.
func sourceInitializerCallLayout(r *storageRecipe) (*ast.Node, int, bool) {
	if d, pc, ok := sourceArrayInitializerCallLayout(r); ok {
		return d, pc, true
	}
	if r == nil || !r.prefix || r.callBody || r.binding != nil || r.call == nil || !ast.IsCallExpression(r.call) || ast.IsOptionalChain(r.call) || r.call.Parent == nil || !ast.IsVariableDeclaration(r.call.Parent) || len(r.events) < 3 || r.registers != len(r.events) {
		return nil, 0, false
	}
	d := r.call.Parent
	if d.Initializer() != r.call || !ast.IsIdentifier(d.Name()) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 || d.Parent.Parent == nil || !ast.IsVariableStatement(d.Parent.Parent) || d.Parent.Parent.Parent != r.body || r.locals != len(r.declarations) || len(d.Parent.AsVariableDeclarationList().Declarations.Nodes) != 1 {
		return nil, 0, false
	}
	argumentCount := 0
	if r.call.AsCallExpression().Arguments != nil {
		argumentCount = len(r.call.AsCallExpression().Arguments.Nodes)
	}
	if argumentCount > 1 {
		return nil, 0, false
	}
	pc := len(r.events) - 2
	invoke, init, finish := r.events[pc], r.events[pc+1], r.events[pc-1]
	if invoke.kind != "InvokeAcquiredCall" || invoke.node != r.call || invoke.out != pc || init.kind != "InitializeCell" || init.node != d || init.out != pc+1 || init.a != pc || init.cell < 0 || init.cell >= len(r.declarations) || r.declarations[init.cell] != d || finish.kind != "FinalizeCallInputs" || finish.node != r.call || finish.cell != argumentCount || invoke.a != finish.a || invoke.a < 0 || invoke.a >= pc {
		return nil, 0, false
	}
	return d, pc, true
}

// initializerCallReady consumes only the installed original Call's acquired
// input and an uninitialized destination in its original module lexical vector.
func (p *closedPrefixCandidate) initializerCallReady(r *storageRecipe, a languageAlternative, cells []languageCell, values []languageValue, ready []bool, work *languageCopyWork) bool {
	d, pc, ok := sourceInitializerCallLayout(r)
	if !ok || p == nil || p.released || p.owner == nil || p.history == nil || p.history.recipe != r || p.continuation != nil || len(p.history.callReceipts) != 0 || p.call != r.call || p.statement != d.Parent.Parent || p.entry == nil || p.entry.node != r.call || p.entry.statement != p.statement || !p.entry.once || p.entry.region != nil || !shortCircuitCanonical(a) || a.callInputs == nil || !a.callInputs.complete || a.callInputs.call != r.call || a.callInputs.callee.callable == nil || a.callInputs.callee.callable.proof == nil || !p.enteredCallable(p.owner.language, a.callInputs.callee.callable.proof) || !p.authoredEntry() || !p.sourceConstructs(a.callInputs.callee.callable.proof) || len(cells) != r.locals || len(a.callInputs.lexicals) != r.locals || len(ready) != r.registers || len(values) != r.registers || ready[pc] || !ready[r.events[pc].a] || values[r.events[pc].a] != a.callInputs.callee {
		return false
	}
	if a.callInputs.callee.callable.proof.parameters != 0 || len(a.callInputs.arguments) != 0 {
		if !p.activationCreatorInputs(a, work) {
			return false
		}
	}
	for i, c := range cells {
		work.spend(1)
		if a.callInputs.lexicals[i] != (languageLexical{declaration: r.declarations[i], cell: c}) || c.id.owner != p.owner.language || c.environment != a.branch.env.id {
			return false
		}
	}
	c := cells[r.events[len(r.events)-1].cell]
	if !c.immutable || c.summary {
		return false
	}
	for row := a.branch.state.storage; row != nil; row = row.previous {
		work.spend(1)
		if row.cell == c {
			return false
		}
	}
	if _, _, array := sourceArrayInitializerCallLayout(r); array {
		return arrayInitializerReady(r, pc, a, values, ready, work)
	}
	return true
}

// initializerBindingResult preserves the original Call certificate as history.
// The final caller row is a different operation, exactly one InitializeCell
// after that B_out. It is not passed off as the original Call completion.
func (h *closedPrefixHistory) initializerBindingResult(a languageAlternative, works ...*languageCopyWork) bool {
	work := &languageCopyWork{}
	if len(works) == 1 && works[0] != nil {
		work = works[0]
	}
	if h == nil || h.authority.owner == nil {
		return false
	}
	owner := h.authority.owner
	p := owner.closedPrefixCandidate
	if owner.closedPrefixes[h.source] != h || p == nil || p.history != h || p.released || p.generation == nil || !p.generation.active || p.generation != owner.generation || h.authority.generation != p.generation || !h.cacheEnteredCompatible(p) {
		return false
	}
	d, pc, ok := sourceInitializerCallLayout(h.recipe)
	if !ok || len(h.callReceipts) != 1 || h.callReceipts[0] == nil || len(h.callReceipts[0].alternatives) != 1 || !shortCircuitCanonical(a) || a.storage == nil {
		return false
	}
	call := h.callReceipts[0].alternatives[0]
	if call.callHistory == nil || !call.callHistory.validResult(call) || !initializerReturnSupported(call, work) || call.callInputs == nil || call.callInputs.call != h.call || h.call != h.recipe.call || h.statement != d.Parent.Parent || a.callHistory != call.callHistory || !sameLanguageCallInputs(a.callInputs, call.callInputs) {
		return false
	}
	if _, _, array := sourceArrayInitializerCallLayout(h.recipe); array {
		return h.arrayInitializerBindingResult(a, call, d, pc, work)
	}
	if a.value != call.value {
		return false
	}
	s := a.storage
	if s.recipe != h.recipe || s.pc != len(h.recipe.events) || s.entry != nil || s.childBranch != a.branch || len(s.cells) != h.recipe.locals || len(s.ready) != h.recipe.registers || len(s.values) != h.recipe.registers || !s.ready[pc] || !s.ready[pc+1] || s.values[pc] != call.value || s.values[pc+1] != call.value || len(call.callInputs.lexicals) != len(s.cells) {
		return false
	}
	ordinal := h.recipe.events[pc+1].cell
	c := s.cells[ordinal]
	if call.callInputs.lexicals[ordinal] != (languageLexical{declaration: d, cell: c}) || c.environment != call.branch.env.id || !c.immutable || a.branch.owner != call.branch.owner || a.branch.env != call.branch.env || a.branch.generation != call.branch.generation || a.branch.guard != call.branch.guard || a.branch.cursor != call.branch.cursor+1 || a.branch.state == nil || a.branch.state.previous != call.branch.state {
		return false
	}
	row := a.branch.state.storage
	return row != nil && row.previous == call.branch.state.storage && row.cell == c && row.initialized && row.object == nil && row.value == call.value
}
