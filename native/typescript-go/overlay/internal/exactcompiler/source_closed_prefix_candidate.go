package exactcompiler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

type closedPrefixState uint8

const (
	prefixReserved closedPrefixState = iota
	prefixQualified
	prefixEntered
	prefixTerminal
	prefixReleased
	prefixRefused
)

// closedPrefixHistory is generation-owned routing and detached immutable result
// history. It never retains a traversal frame, checker lease or mutable symbol
// map. Released requests leave this fence in place, so absent history cannot
// authorize a legacy replay. Only before-entry refusal can relinquish routing.
type closedPrefixHistory struct {
	callReceipts        []*languageReceipt // sealed per original ordinary site, inspection-only
	source              *ast.SourceFile
	authority           sourceNormalAuthority
	call, statement     *ast.Node
	runtime             map[*ast.Node]bool // frozen source identity membership, not an evaluator
	recipe              *storageRecipe
	mode                [32]byte
	state               closedPrefixState
	receipt             *languageReceipt
	reason              string
	roots, publications int
	published           bool
}

// closedPrefixCandidate borrows request capabilities from source-start through
// actual authentication. Semantic history remains detached on the source owner.
type closedPrefixCandidate struct {
	continuation            *closedPrefixContinuation // live next-site issuance, never cached
	source                  *ast.SourceFile
	program                 *compiler.Program
	checker                 *checker.Checker
	generation              *projectGeneration
	owner                   *sourceValueOwner
	executable              *executableBodyOwner
	call, statement         *ast.Node
	entry                   *sourceNormalOccurrence
	frame                   *sourceValueInputs
	slot                    *sourceNormalOperation
	history                 *closedPrefixHistory
	authenticated, released bool
	retryLegacy             bool
	bindingSite             *bindingCallSite
	bindingPhase            int                 // next authenticated protocol-site ordinal, not a semantic role
	entryInputs             *languageCallInputs // transient exact Getter or default-Call inputs, consumed before allocation
	bodyClaimed             bool                // consumed only at live activation, never a proof-qualification flag
}

// Reservation performs complete metered source/symbol proof before collectors.
// It allocates recipes only, never cells, callable values or a semantic root.
func reserveClosedPrefixCandidate(source *ast.SourceFile, program *compiler.Program, c *checker.Checker, generation *projectGeneration, request Request) *closedPrefixCandidate {
	if source == nil || program == nil || c == nil || generation == nil || !generation.active || len(source.Text()) > 65536 || source.AsNode().SubtreeFacts()&ast.SubtreeContainsJsx != 0 {
		return nil
	}
	discoveryOwner := &sourceValueOwner{checker: c}
	q := &sourceValueQuery{owner: discoveryOwner, remaining: 4096}
	recipe, runtime, statement, ok := qualifyClosedPrefix(q, source, 4096)
	if !ok {
		if sourceSymbolFirstLoss != nil {
			sourceSymbolFirstLoss("source discovery refused")
		}
		return nil
	}
	// TypeScript-invalid cardinality is not an admitted successful source
	// consumer. Keep its accepted acquisition/diagnostics path, but grant no body
	// entry proof. This cached checker query performs no language execution.
	if len(source.Diagnostics()) != 0 || len(source.BindDiagnostics()) != 0 || len(c.GetDiagnostics(context.Background(), source)) != 0 {
		for i := range recipe.events {
			if recipe.events[i].callable != nil {
				recipe.events[i].callable.entry = nil
			}
		}
	}
	// The normalized request and concrete program/source identity conservatively
	// fence all mode/config changes. Cache summaries cannot supply prior execution.
	modeRequest := request
	modeRequest.Source = ""
	modeRequest.Sources = nil
	modeRequest.Analysis = AnalysisOptions{}
	modeRequest.TraceAnalysisCost = false
	encoded, err := json.Marshal(modeRequest)
	if err != nil {
		return nil
	}
	mode := sha256.Sum256(append([]byte(descriptorEffectMode+"\n"), encoded...))

	h := &closedPrefixHistory{source: source, call: prefixEntryNode(recipe), statement: statement, runtime: runtime, recipe: recipe, mode: mode, state: prefixReserved, reason: "closed prefix acquisition pending"}
	p := &closedPrefixCandidate{source: source, program: program, checker: c, generation: generation, call: h.call, statement: statement, history: h}
	return p
}

// attach installs the one routing disposition before the shared index can cause
// any transitive value query. Compatible cached history is projection-only.
func (p *closedPrefixCandidate) attach(owner *sourceValueOwner, executable *executableBodyOwner) {
	if p == nil || p.released || p.owner != nil || owner == nil || owner.program != p.program || owner.checker != p.checker || owner.generation != p.generation || owner.closedPrefixCandidate != nil {
		return
	}
	p.owner, p.executable = owner, executable
	if owner.closedPrefixes == nil {
		owner.closedPrefixes = make(map[*ast.SourceFile]*closedPrefixHistory)
	}
	if old := owner.closedPrefixes[p.source]; old != nil {
		if !old.cacheCompatible(owner, executable, p.source, p.history.mode) {
			if sourceSymbolFirstLoss != nil {
				sourceSymbolFirstLoss(p.history.reason)
			}
			p.history.state = prefixRefused
			return
		}
		p.history = old
	} else {
		if owner.language == nil || owner.language.disposed {
			owner.language = p.generation.acquireLanguageOwner()
		}
		owner.closedPrefixes[p.source] = p.history
	}
	owner.closedPrefixCandidate = p
}

// qualifyIndex binds the complete early recipe to the shared owner's completed
// index. No statement ordinal or source spelling is execution authority.
func (p *closedPrefixCandidate) qualifyIndex() {
	if p == nil || p.owner == nil || p.released || p.history == nil || p.history.state != prefixReserved {
		return
	}
	if p.source == nil || p.generation == nil || !p.generation.active || p.owner.generation != p.generation || p.owner.program != p.program || p.owner.checker != p.checker || p.owner.language == nil || p.owner.language.disposed {
		p.refuse()
		return
	}
	index, ok := p.owner.indexes[p.source]
	if !ok || index.incomplete || index.normalDynamicScope || index.normalExportUnknown {
		p.refuse()
		return
	}
	work := shortCircuitPopulationProof{candidate: p, index: index, remaining: 4096}
	if plan := p.history.recipe.binding; plan != nil && plan.elementNode(0) != nil && !plan.indexedElement(p, &work) {
		p.refuse()
		return
	}
	if !work.moduleFunctionPrelude() || !work.prefixAssignmentStatements() {
		p.refuse()
		return
	}
	logicalOwned := false
	if p.history.recipe.choiceSlots > 0 {
		logicalOwned = qualifyPrefixPopulation(p, index, &work)
		if !logicalOwned {
			p.refuse()
			return
		}
		// owned population proof observation
	}
	for n := range p.history.runtime {
		if ast.IsBinaryExpression(n) && numberBinaryKind(n.AsBinaryExpression().OperatorToken.Kind) != "" {
			work.recipe, work.runtime, work.body = p.history.recipe, p.history.runtime, nil
			if !work.numericBinaryOccurrence(n) {
				p.refuse()
				return
			}
		}
		if ast.IsPrefixUnaryExpression(n) && n.AsPrefixUnaryExpression().Operator == ast.KindMinusToken {
			work.recipe, work.runtime, work.body = p.history.recipe, p.history.runtime, nil
			if !work.numericNegateOccurrence(n) {
				p.refuse()
				return
			}
		}
		if ast.IsTypeOfExpression(n) {
			work.recipe, work.runtime, work.body = p.history.recipe, p.history.runtime, nil
			if !work.typeofOccurrence(n) {
				p.refuse()
				return
			}
		}
		e := index.normalOccurrences[n]
		if e == nil || e.node != n || (!e.once && !logicalOwned) || e.region != nil {
			p.refuse()
			return
		}
	}
	if !work.prefixUndefinedLiterals() {
		p.refuse()
		return
	}
	for i := range p.history.recipe.callSites {
		site := &p.history.recipe.callSites[i]
		site.entry = index.normalOccurrences[site.call]
		if site.entry == nil || site.entry.statement != site.statement || site.entry.region != nil || !site.entry.once {
			p.refuse()
			return
		}
	}
	if len(p.history.recipe.callSites) != 0 && !p.twoCallLayout() {
		p.refuse()
		return
	}
	e := index.normalOccurrences[p.call]
	if e == nil || e.statement != p.statement || e.region != nil || !e.once {
		p.refuse()
		return
	}
	// Prepare every finalized replacement before changing any event pointer.
	replacements := make(map[*closedCallableProof]*closedCallableProof)
	for _, event := range p.history.recipe.events {
		f := event.callable
		if f == nil || f.entry == nil {
			continue
		}
		if _, ok := replacements[f]; ok {
			continue
		}
		if !work.spend() || !work.qualifyBody(f) || !work.spend() {
			p.refuse()
			return
		}
		final := *f
		final.namespace = p.owner.language
		final.generation = p.owner.language.generation
		final.source = p.source
		final.mapping = f.plan.parameters
		finalizeActivationCreation(&final)
		replacements[f] = &final
	}
	for i, event := range p.history.recipe.events {
		if final := replacements[event.callable]; final != nil {
			p.history.recipe.events[i].callable = final
		}
	}
	if len(p.history.recipe.callSites) == 2 && !p.activationCallLayout() {
		symbol := p.checker.GetSymbolAtLocation(p.call.Expression())
		found := false
		for _, event := range p.history.recipe.events {
			f := event.callable
			if f != nil && (f.arrow.Parent == symbol.ValueDeclaration || moduleFunctionDeclaration(f.arrow) && f.arrow == symbol.ValueDeclaration) && !f.empty && f.captureLayoutValid() && f.parameters == 0 {
				found = true
			}
		}
		if !found {
			p.refuse()
			return
		}
	}
	p.history.authority = sourceNormalAuthority{owner: p.owner, program: p.program, checker: p.checker, generation: p.generation, executable: p.executable}
	p.entry = e
	p.history.state = prefixQualified
}

// refuse is legal only while no semantic entry has occurred.
func (p *closedPrefixCandidate) refuse() {
	if p == nil || p.history == nil || p.history.state >= prefixEntered && p.history.state <= prefixTerminal {
		return
	}
	p.detachPrefixRefusalCoverage()
	if sourceSymbolFirstLoss != nil {
		sourceSymbolFirstLoss(fmt.Sprintf("refuse state=%d reason=%s authenticated=%t", p.history.state, p.history.reason, p.authenticated))
	}
	p.history.state = prefixRefused
	p.frame = nil
	p.slot = nil
	if p.owner != nil {
		delete(p.owner.closedPrefixes, p.source)
		if p.owner.closedPrefixCandidate == p {
			p.owner.closedPrefixCandidate = nil
		}
	}
}
func (p *closedPrefixCandidate) matches(q *sourceValueQuery, node *ast.Node, s *sourceNormalOperation) bool {
	if p == nil || p.released || q == nil || !p.awaitingSourceCall() || q.owner != p.owner || q.executable != p.executable || node != p.call || s == nil || !p.generation.active {
		return false
	}
	f := q.inputs
	_, _, arrayInitializer := sourceArrayInitializerCallLayout(p.history.recipe)
	if (p.activationCallLayout() || arrayInitializer) && (f == nil || f.ownedFact == nil || f.ownedFact.descriptorMode != p.history.mode) {
		return false
	}
	if f == nil || f.declaration != p.statement || f.operationLifetime == nil || f.dispatcher == nil || f.operations[node] != s || f.population == nil || s.population != f.population || s.population.root != p.statement {
		return false
	}
	e := s.entry
	if e == nil || e != p.entry || !e.once || e.node != node || e.statement != p.statement || s.population.entries[node] != e || ast.GetSourceFileOfNode(node) != p.source {
		return false
	}
	op := q.operation
	if op == nil || op.inputs != f || op.node != node || op.outputOnly || !s.authority.valid(q) || s.authority.program != p.program || s.authority.checker != p.checker || s.authority.generation != p.generation {
		return false
	}
	return s.state == sourceOperationPending && s.selected == nil && len(s.actuals) == 0 && p.priorContinuationValid()
}

// observeSlot borrows only the actual installed table member, before admission.
func (p *closedPrefixCandidate) observeSlot(q *sourceValueQuery, n *ast.Node, s *sourceNormalOperation) {
	if p.matches(q, n, s) {
		p.frame, p.slot = q.inputs, s
	}
}
func (p *closedPrefixCandidate) authenticate(q *sourceValueQuery, n *ast.Node, s *sourceNormalOperation) bool {
	if !p.matches(q, n, s) || p.slot != s || p.frame != q.inputs || p.authenticated {
		return false
	}
	p.authenticated = true
	return true
}

// enter requires the original installed Call. First entry alone starts the
// source root. The next authenticated site borrows only the prior actual output
// branch. Neither entry imports legacy history or delegates to prefix replay.
func (p *closedPrefixCandidate) enter(q *sourceValueQuery, s *sourceNormalOperation) {
	h := p.history
	var activationField sourceFieldCall
	activationFieldComplete := false
	var symbol *sourceSymbolCase
	if h.recipe.sourceSymbol {
		var ok bool
		symbol, ok = p.prepareSourceSymbol(q)
		if !ok {
			p.refuse()
			return
		}
	}
	h.state = prefixEntered
	s.closedPrefix = h
	budget := q.remaining
	if symbol != nil && sourceSymbolExecutionLimit != nil {
		budget = max(0, min(budget, sourceSymbolExecutionLimit(budget)))
	}
	scSetupOK := true
	if h.recipe.choiceSlots > 0 {
		_, scSetupOK = shortCircuitSetup(h.recipe, budget)
	}
	// prefix budget selection
	if q.owner.language == nil || !scSetupOK {
		if p.continuation != nil {
			// No current execution result exists. Preserve the original prior
			// as history without relabelling or publishing it as this site.
			p.refuseSourceContinuation()
			h.reason = "closed prefix buffers budget"
			s.state = sourceOperationRefused
			appendOpaqueAccessorEffect(q.inputs.ownedFact, accessorCandidates{opaque: true, valueIncomplete: true, cause: p.call, closedPrefixReason: h.reason})
			return
		}
		h.reason = "closed prefix buffers budget"
	} else {
		o := q.owner.language
		var input languageBranch
		seed := languageAlternative{}
		recipe := h.recipe
		if p.continuation != nil {
			seed = shortCircuitHeader(p.continuation.prior.alternatives[0])
			input = seed.branch
			recipe = h.recipe.callSites[p.continuation.next].acquisition
		} else {
			input = o.root()
			h.roots++
		}
		standard := input
		if symbol != nil {
			symbol.input = input
			standard.guard = "native Symbol standard"
			h.recipe.symbolCase = symbol
		}
		seed.branch = standard
		a, used := o.executeStorageSchedule(recipe, budget, seed, p)
		q.remaining -= used
		q.recordEstimatedCost(used)
		// The original post-Init receipt is still installed here. Projection
		// consumes that identity before replacing it with this second result.
		activationField, activationFieldComplete = p.activationCapturedFieldCall(a, q.inputs.ownedFact)
		if symbol == nil {
			h.receipt = o.receipt(input, []languageAlternative{a})
		} else {
			unknown := input
			unknown.guard = "native Symbol unresolved"
			u := languageAlternative{branch: unknown, completion: languageResidual, pending: languageNormal, remaining: "unresolved native Symbol entry", obligations: []string{"unresolved native Symbol entry"}}
			h.receipt = o.receipt(input, []languageAlternative{a, u})
		}
		h.reason = a.remaining
		if symbol != nil && h.reason == "" {
			h.reason = "unresolved native Symbol entry"
		}
		if a.completion == languageThrow {
			h.reason = a.value.text
		}
	}
	s.state = sourceOperationConsumed
	s.invocationOwned = true
	h.publish(q.inputs.ownedFact)
	if activationFieldComplete && h.published && h.publications == 2 && h.receipt != nil && len(h.receipt.alternatives) == 1 {
		row := h.receipt.alternatives[0]
		if row.callHistory != nil && row.callHistory.validResult(row) && row.callInputs.call == activationField.operation && row.callHistory.entry.proof.arrow == activationField.target {
			q.inputs.ownedFact.fieldCalls = append(q.inputs.ownedFact.fieldCalls, activationField)
		}
	}
	if len(h.recipe.callSites) == 2 {
		p.finishSourceCall()
	} else {
		h.state = prefixTerminal
	}
}

// publish is the terminal fact's only execution publisher. Local lexical writes
// have no external effect donors. Residual opacity is appended through existing
// owned-fact integration and never clears independently discovered MAY opacity.
func (h *closedPrefixHistory) publish(f *callableFacts) {
	if h == nil || h.published || f == nil {
		return
	}
	h.publications++
	h.published = len(h.recipe.callSites) != 2 || h.publications == 2
	if h.receipt != nil && len(h.receipt.alternatives) == 1 {
		row := h.receipt.alternatives[0]
		if row.binding.complete(row) {
			return
		}
		if _, _, initializer := sourceInitializerCallLayout(h.recipe); initializer && len(h.callReceipts) == 1 && (h.authority.owner.closedPrefixCandidate == nil || h.authority.owner.closedPrefixCandidate.continuation == nil) {
			if conditionalFieldObserve != nil {
				conditionalFieldObserve(h, row)
			}
			work := languageCopyWork{}
			valid := h.initializerBindingResult(row, &work)
			h.authority.owner.indexWork += work.used
			if valid {
				return
			}
		}
		if h.parameterDefaultGetTerminal(row) {
			if conditionalFieldObserve != nil {
				conditionalFieldObserve(h, row)
			}
			return
		}
		if row.callHistory != nil && row.callHistory.validResult(row) {
			if conditionalFieldObserve != nil {
				conditionalFieldObserve(h, row)
			}
			if outcome, ok := h.conditionalFieldCall(row); ok {
				f.fieldCalls = append(f.fieldCalls, outcome)
			}
			return
		}
	}
	reason := h.reason
	if reason == "" {
		reason = "Call terminal result unavailable"
	}
	appendOpaqueAccessorEffect(f, accessorCandidates{opaque: true, cause: h.call, closedPrefixReason: reason})
}
func (p *closedPrefixCandidate) release() {
	if p == nil || p.released {
		return
	}
	if p.owner != nil && p.owner.closedPrefixCandidate == p {
		p.owner.closedPrefixCandidate = nil
	}
	// Unentered failed authentication cannot strand a reservation after request
	// return. Entered/terminal history remains an exclusive projection fence.
	if p.history != nil && p.history.state < prefixEntered {
		p.refuse()
	}
	p.source = nil
	p.program = nil
	p.checker = nil
	p.generation = nil
	p.owner = nil
	p.executable = nil
	p.call = nil
	p.statement = nil
	p.entry = nil
	p.frame = nil
	p.slot = nil
	p.continuation = nil
	p.released = true
}

// prefixHistory is the single lookup used by all acquisition/publication routes.
// Runtime membership comes from complete early qualification. Definition bodies
// remain independent MAY domains and are not members of this interval.
func (o *sourceValueOwner) prefixHistory(n *ast.Node) *closedPrefixHistory {
	if o == nil || n == nil {
		return nil
	}
	h := o.closedPrefixes[ast.GetSourceFileOfNode(n)]
	if h == nil || h.state == prefixRefused || !h.runtime[n] {
		return nil
	}
	return h
}
func (q *sourceValueQuery) holdClosedPrefix(n *ast.Node, r *accessorCandidates) bool {
	if q == nil || q.owner == nil || q.dependenciesOnly {
		return false
	}
	if n == q.effectOwner && ast.IsFunctionLike(n) {
		return false
	}
	h := q.owner.prefixHistory(n)
	if h == nil {
		return false
	}
	r.valueIncomplete = true
	r.closedPrefixReason = h.reason
	if h.reason == "" {
		r.closedPrefixReason = "owned Call result"
	}
	if h.state == prefixTerminal && (h.receipt != nil && (h.receipt.input.owner == nil || !h.receipt.input.owner.live(h.receipt.input))) {
		r.closedPrefixReason = "closed prefix history unavailable"
	}
	return true
}

// cacheCompatible authenticates settled analysis facts, not a live entry lease.
// Request-generation replacement alone does not invalidate immutable facts.
func (h *closedPrefixHistory) cacheCompatible(o *sourceValueOwner, x *executableBodyOwner, source *ast.SourceFile, mode [32]byte) bool {
	return h != nil && h.state == prefixTerminal && h.source == source && h.mode == mode && h.authority.owner == o && h.authority.program == o.program && h.authority.checker == o.checker && h.authority.executable == x
}

// enteredCallable owns the shared live-entry gate. Role-specific callers below
// add their actual source site, without turning construction into entry proof.
func (p *closedPrefixCandidate) enteredCallable(o *languageOwner, f *closedCallableProof) bool {
	return p != nil && p.authenticated && !p.released && p.history != nil && p.history.state == prefixEntered && p.history.recipe != nil && p.generation != nil && p.owner != nil && p.owner.language == o && p.owner.closedPrefixCandidate == p && p.frame != nil && p.slot != nil && p.frame.operations[p.call] == p.slot && p.slot.closedPrefix == p.history && p.generation == p.owner.generation && p.generation.active && p.history.authority.generation == p.generation && p.history.cacheEnteredCompatible(p) && f.finalizedBodyProof(o)
}
func (p *closedPrefixCandidate) sourceConstructs(f *closedCallableProof) bool {
	if p.activationCallLayout() && p.continuation != nil {
		return p.priorContinuationValid() && p.successorCallable() != nil && p.successorCallable().proof == f
	}
	for _, event := range p.history.recipe.events {
		if (event.kind == "CreateClosedCallable" || event.kind == "InstantiateModuleFunction" && moduleFunctionDeclaration(f.arrow)) && event.callable == f && event.node == f.arrow {
			return true
		}
	}
	return false
}
func (p *closedPrefixCandidate) authoredEntry() bool {
	return !p.bodyClaimed && p.slot.population == p.frame.population && p.history.source == p.source && p.currentRecipeCall() == p.call && p.program == p.owner.program && p.checker == p.owner.checker
}

// admits is a transient source handoff. No candidate is retained in receipts.
func (p *closedPrefixCandidate) admits(o *languageOwner, f *closedCallableProof, rows ...languageAlternative) bool {
	if p != nil && p.history != nil && p.history.recipe != nil && p.history.recipe.binding != nil {
		return p.admitsBinding(o, f, rows...)
	}
	return p.enteredCallable(o, f) && p.authoredEntry() && p.sourceConstructs(f)
}
func (h *closedPrefixHistory) cacheEnteredCompatible(p *closedPrefixCandidate) bool {
	return h.authority.owner == p.owner && h.authority.program == p.program && h.authority.checker == p.checker && h.authority.executable == p.executable
}

// admitsOwnGetter is one transient implicit site on the existing prefix owner.
// It never survives in a receipt and cannot consume the outer authored Call.
func (p *closedPrefixCandidate) admitsOwnGetter(o *languageOwner, f *closedCallableProof, in *languageCallInputs, a languageAlternative) bool {
	if !p.enteredCallable(o, f) || p.entryInputs != in || in == nil || in.targetOrigin == nil || in.targetOrigin.getterInstall == nil || in.targetOrigin.recipe != p.history.recipe || !ast.IsGetAccessorDeclaration(f.arrow) || !validOwnGetterTarget(o, in) || !p.sourceConstructs(f) {
		return false
	}
	if p.history.recipe.binding != nil {
		return p.bindingSite == nil && bindingGetterInputs(p.history.recipe, a, in)
	}
	return p.authoredEntry()
}

// conditionalFieldObserve is a validation-only publication observation. It is
// absent in production use and supplies no selection or execution authority.
var conditionalFieldObserve func(*closedPrefixHistory, languageAlternative)
