package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedPrefixCallSite is one immutable indexed original source acquisition.
// The first recipe owns module initialization. Successors contain acquisition
// events only and cannot allocate replacement module lexical cells.
type closedPrefixCallSite struct {
	statement, call *ast.Node
	entry           *sourceNormalOccurrence
	acquisition     *storageRecipe
}

// closedPrefixContinuation borrows a generation-owned actual output, never the
// prior query, operation slot or frame. Only the original next dispatcher slot
// can resume it. Historical/cached receipts alone cannot issue an activation.
type closedPrefixContinuation struct {
	next  int
	prior *languageReceipt
}

func (p *closedPrefixCandidate) twoCallLayout() bool {
	if p == nil || p.history == nil || p.history.recipe == nil {
		return false
	}
	r := p.history.recipe
	if p.activationCallLayout() {
		return true
	}
	if !r.prefix || r.binding != nil || len(r.callSites) != 2 {
		return false
	}
	for i, site := range r.callSites {
		if site.call == nil || site.statement == nil || !ast.IsExpressionStatement(site.statement) || site.statement.Expression() != site.call || site.statement.Parent != p.source.AsNode() || site.entry == nil || site.entry.node != site.call || site.entry.statement != site.statement || !site.entry.once || site.entry.region != nil || site.acquisition == nil || !site.acquisition.prefix || site.acquisition.binding != nil || site.acquisition.call != site.call || site.acquisition.body != p.source.AsNode() || !ast.IsIdentifier(site.call.Expression()) || site.call.AsCallExpression().Arguments != nil && len(site.call.AsCallExpression().Arguments.Nodes) != 0 {
			return false
		}
		if i == 0 && site.acquisition != r || i == 1 && (site.statement.Pos() < r.callSites[0].statement.End() || site.acquisition == r) {
			return false
		}
	}
	return true
}

func (p *closedPrefixCandidate) currentSourceRecipe() *storageRecipe {
	if p == nil || p.history == nil {
		return nil
	}
	if p.continuation != nil {
		if !p.twoCallLayout() || p.continuation.next != 1 {
			return nil
		}
		return p.history.recipe.callSites[1].acquisition
	}
	return p.history.recipe
}
func (p *closedPrefixCandidate) currentRecipeCall() *ast.Node {
	r := p.currentSourceRecipe()
	if r == nil {
		return nil
	}
	return r.call
}

// priorContinuationValid combines immutable original receipt correlation with
// current generation/candidate identity. It does not validate an expired normal
// frame or let a copied prior receipt replace the actually issued one.
func (p *closedPrefixCandidate) priorContinuationValid() bool {
	if p == nil || p.released || p.history == nil {
		return false
	}
	h := p.history
	if p.owner == nil || p.owner.closedPrefixes[p.source] != h || p.owner.closedPrefixCandidate != p {
		return false
	}
	if p.continuation == nil {
		return h.state == prefixQualified && len(h.callReceipts) == 0
	}
	c := p.continuation
	if !p.twoCallLayout() || c.next != 1 || h.state != prefixEntered || len(h.callReceipts) != 1 || c.prior == nil || (!p.activationCallLayout() && c.prior != h.callReceipts[0]) || len(c.prior.alternatives) != 1 || h.roots != 1 || h.publications != 1 || p.owner == nil || p.owner.closedPrefixCandidate != p || p.generation == nil || !p.generation.active || p.owner.generation != p.generation || h.authority.generation != p.generation || !h.cacheEnteredCompatible(p) {
		return false
	}
	a := c.prior.alternatives[0]
	ch := a.callHistory
	if p.activationCallLayout() {
		return c.prior == h.receipt && h.initializerBindingResult(a) && activationCapturedReturn(h.callReceipts[0].alternatives[0], &languageCopyWork{}) && a.branch.owner == p.owner.language && p.call == h.recipe.callSites[1].call && p.statement == h.recipe.callSites[1].statement && p.entry == h.recipe.callSites[1].entry
	}
	return ch != nil && ch.validResult(a) && ch.entry.inputs.call == h.recipe.callSites[0].call && ch.entry.callable != nil && !ch.entry.callable.proof.empty && a.branch.owner == p.owner.language && a.branch.env == ch.entry.caller && p.call == h.recipe.callSites[1].call && p.statement == h.recipe.callSites[1].statement && p.entry == h.recipe.callSites[1].entry
}
func (p *closedPrefixCandidate) awaitingSourceCall() bool {
	return p != nil && !p.released && !p.authenticated && p.history != nil && p.priorContinuationValid()
}

// continuationOutput checks incoming state correlation only. It grants no
// current operation authority, even while the original generation remains live.
func (p *closedPrefixCandidate) continuationOutput(a languageAlternative) bool {
	if !p.priorContinuationValid() || p.continuation == nil {
		return false
	}
	prior := p.continuation.prior.alternatives[0]
	return a.branch == prior.branch && a.callHistory == prior.callHistory && sameLanguageCallInputs(a.callInputs, prior.callInputs)
}

// resumeInputs additionally requires the freshly authenticated second slot.
// Original lexical cells are borrowed only after both independent gates pass.
func (p *closedPrefixCandidate) resumeInputs(r *storageRecipe, a languageAlternative) bool {
	if !p.continuationOutput(a) || r != p.currentSourceRecipe() || !p.enteredCallable(p.owner.language, p.successorCallable().proof) {
		return false
	}
	if a.callInputs == nil || len(a.callInputs.lexicals) != r.locals || len(r.declarations) != r.locals {
		return false
	}
	for i, v := range a.callInputs.lexicals {
		if v.declaration != r.declarations[i] || v.cell.id.owner != p.owner.language || v.cell.environment != a.branch.env.id {
			return false
		}
	}
	return true
}
func (p *closedPrefixCandidate) successorCallee(a languageAlternative) bool {
	if !p.priorContinuationValid() || !p.authenticated || p.bodyClaimed || a.callInputs == nil || !a.callInputs.complete || a.callInputs.call != p.call {
		return false
	}
	return a.callInputs.callee.callable == p.successorCallable() && len(a.callInputs.arguments) == 0
}

// refuseSourceContinuation cannot fall back to prefix replay after actual entry.
// The first immutable receipt remains available for inspection, not resumption.
func (p *closedPrefixCandidate) refuseSourceContinuation() {
	p.continuation = nil
	p.frame, p.slot, p.entryInputs = nil, nil, nil
	p.authenticated = false
	p.history.state = prefixTerminal
	p.history.reason = "source successor installed operation unavailable"
	p.history.published = true
}

// activationCallLayout is the finite mixed creator-initializer/returned-callable
// sequence. It never substitutes source callee syntax for the actual Cell read.
func (p *closedPrefixCandidate) activationCallLayout() bool {
	if p == nil || p.history == nil || p.history.recipe == nil || p.checker == nil {
		return false
	}
	r := p.history.recipe
	d, _, ok := sourceInitializerCallLayout(r)
	if !ok || len(r.callSites) != 2 {
		return false
	}
	first, next := r.callSites[0], r.callSites[1]
	if first.acquisition != r || first.call != r.call || first.statement != d.Parent.Parent || first.statement.Parent != p.source.AsNode() || first.entry == nil || first.entry.node != first.call || first.entry.statement != first.statement || !first.entry.once || first.entry.region != nil || next.statement == nil || !ast.IsExpressionStatement(next.statement) || next.statement.Expression() != next.call || next.statement.Parent != p.source.AsNode() || next.statement.Pos() < first.statement.End() || next.entry == nil || next.entry.node != next.call || next.entry.statement != next.statement || !next.entry.once || next.entry.region != nil || next.acquisition == nil || next.acquisition == r || !next.acquisition.prefix || next.acquisition.call != next.call || next.acquisition.body != r.body || next.acquisition.binding != nil || next.acquisition.locals != r.locals || !ast.IsIdentifier(next.call.Expression()) || next.call.AsCallExpression().Arguments != nil && len(next.call.AsCallExpression().Arguments.Nodes) != 0 {
		return false
	}
	symbol := p.checker.GetSymbolAtLocation(next.call.Expression())
	creator := p.checker.GetSymbolAtLocation(first.call.Expression())
	return symbol != nil && symbol.ValueDeclaration == d && len(symbol.Declarations) == 1 && creator != nil && moduleActivationCaptureCreator(creator.ValueDeclaration) && first.call.AsCallExpression().Arguments != nil && len(first.call.AsCallExpression().Arguments.Nodes) == 1
}

// successorCallable selects from the authenticated live prior publication.
// The mixed creator path uses the post-InitializeCell returned callable. The
// ordinary two-Call path retains the prior entry's callable. This lookup neither
// acquires a callee again nor authorizes a Call after the continuation expires.
func (p *closedPrefixCandidate) successorCallable() *languageCallable {
	if p == nil || p.continuation == nil || p.continuation.prior == nil || len(p.continuation.prior.alternatives) != 1 {
		return nil
	}
	a := p.continuation.prior.alternatives[0]
	if p.activationCallLayout() {
		return a.value.callable
	}
	if a.callHistory == nil || a.callHistory.entry == nil {
		return nil
	}
	return a.callHistory.entry.callable
}
