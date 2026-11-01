package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// languageCallEntryInput is immutable activation context. Parameter cells belong
// only to the common schedule's single vector, not to this header or prefix
// lexicals. Receipt references do not grant historical execution authority.
type languageCallEntryInput struct {
	proof       *closedCallableProof
	acquisition *languageReceipt
	inputs      *languageCallInputs
	callable    *languageCallable
	boundary    languageID
	caller      *languageEnvironment
	activation  languageBranch
}

func copyLanguageCallEntry(e *languageCallEntryInput) *languageCallEntryInput {
	if e == nil {
		return nil
	}
	out := *e
	return &out
}
func (e *languageCallEntryInput) valid(o *languageOwner, b languageBranch) bool {
	if e == nil || o == nil || !o.live(b) || b != e.activation || e.boundary.owner != o || e.boundary.serial == 0 || e.callable == nil || e.callable.id.owner != o || e.callable.proof == nil || e.proof != e.callable.proof || !e.callable.proof.finalizedBodyProof(o) || e.callable.proof.entry == nil || !e.callable.proof.entry.callBody || e.callable.proof.entry.prefix || e.callable.proof.entry.body != e.callable.proof.arrow {
		return false
	}
	if plan := e.callable.proof.entry.finally; plan != nil && !plan.valid(e.callable.proof.entry) {
		return false
	}
	if e.caller == nil || b.env.outer != e.callable.captures || e.callable.captures == nil || !o.callableCaptureState(e.activation, e.callable) || e.callable.captures.id.owner != o || e.acquisition == nil || !o.live(e.acquisition.input) || len(e.acquisition.alternatives) != 1 {
		return false
	}
	a := e.acquisition.alternatives[0]
	prior, acquired := callAcquisitionEndpoint(o, e.acquisition.input, a)
	if !acquired || a.callInputs != e.inputs || e.inputs == nil || !e.inputs.complete || !e.inputs.calleeReady || e.inputs.callee.callable != e.callable || e.inputs.call == nil || a.branch.env != e.caller {
		return false
	}
	return a.branch == prior && b.state == prior.state && b.owner == prior.owner && b.generation == prior.generation && b.guard == prior.guard && b.cursor == prior.cursor+1
}

// callAcquisitionValid authenticates correlation without issuing identities.
// It is shared by pre-activation validation and detached entry association.
func callAcquisitionValid(o *languageOwner, input languageBranch, a languageAlternative) bool {
	_, ok := callAcquisitionEndpoint(o, input, a)
	return ok
}

// callAcquisitionEndpoint is the canonical acquired-row endpoint used both by
// preactivation and entry association. Ordinary argument chains stay exact.
func callAcquisitionEndpoint(o *languageOwner, input languageBranch, a languageAlternative) (languageBranch, bool) {
	if o == nil || !o.live(input) || !o.live(a.branch) || a.completion != languageNormal || a.returnBoundary != (languageID{}) {
		return languageBranch{}, false
	}
	inputs := a.callInputs
	if inputs == nil || !inputs.complete || !inputs.calleeReady || inputs.call == nil || inputs.callee.callable == nil {
		return languageBranch{}, false
	}
	if !validCallTarget(o, inputs) {
		return languageBranch{}, false
	}
	f := inputs.callee.callable
	if f.id.owner != o || f.proof == nil || !f.proof.captureLayoutValid() || f.captures == nil || f.captures.id.owner != o || !o.callableCaptureState(a.branch, f) {
		return languageBranch{}, false
	}
	prior := inputs.calleeBranch
	if !o.live(prior) || prior.env != a.branch.env || prior.guard != a.branch.guard {
		return languageBranch{}, false
	}
	if inputs.bindingSite != nil {
		if d := bindingStepDescriptor(inputs.bindingSite.plan, inputs.bindingSite); d != nil && d.index > 0 {
			var ok bool
			prior, ok = retainedBindingNextAcquisition(o, a, inputs)
			if !ok {
				return languageBranch{}, false
			}
		}
	}
	for _, argument := range inputs.arguments {
		if argument.input != prior || !o.live(argument.output) || argument.output.env != a.branch.env || argument.output.guard != a.branch.guard {
			return languageBranch{}, false
		}
		prior = argument.output
	}
	return prior, prior == a.branch
}

// languageCallHistory is the one immutable acquisition/body/result association.
// Successful conversion itself issues its certificate fields. No JS value is
// branded and no extra certificate wrapper or live activation registry exists.
type languageCallHistory struct {
	id         languageID
	entry      *languageCallEntryInput
	raw        *languageReceipt
	outward    languageBranch
	completion languageCompletion
	value      languageValue
	converted  bool
}

// callBodySnapshot binds the represented result to its one formal namespace.
// Return permission is separate and stays in normalize's Return branch.
func callBodySnapshot(e *languageCallEntryInput, row languageAlternative) bool {
	if e == nil || e.activation.env == nil || e.activation.env.id.owner == nil || e.activation.env.id.serial == 0 || e.callable == nil || e.callable.proof == nil || row.storage == nil || row.storage.entry == nil || *row.storage.entry != *e || row.storage.recipe != e.callable.proof.entry || row.storage.childBranch != row.branch || len(row.storage.cells) != e.callable.proof.parameters {
		return false
	}
	return callFormalCellsMatch(e, row.storage.cells)
}

// callFormalCellsMatch is the shared original issuance law for both an entered
// creator and its later immutable raw body snapshot. It grants no entry itself.
func callFormalCellsMatch(e *languageCallEntryInput, cells []languageCell) bool {
	if e == nil || e.activation.env == nil || e.activation.env.id.owner == nil || e.activation.env.id.serial == 0 || e.callable == nil || e.callable.proof == nil || len(cells) != e.callable.proof.parameters {
		return false
	}
	// The common body schedule issues the formal vector in declaration order,
	// immediately after its fresh activation environment, before any body event.
	// Bind each original slot to that issuance, not just to a shared environment.
	// This is detached structure only. It does not renew the owner's lifetime.
	serial := e.activation.env.id.serial
	for _, cell := range cells {
		if serial == ^uint64(0) {
			return false
		}
		serial++
		if cell.environment != e.activation.env.id || cell.id.owner != e.activation.env.id.owner || cell.id.serial != serial || cell.summary {
			return false
		}
	}
	return true
}

// The first completed-Throw producer is the existing closed narrow-F route.
// Other abrupt observations are inspectable but do not earn this authority.
func callThrowProducer(e *languageCallEntryInput, row languageAlternative) bool {
	if !callBodySnapshot(e, row) || row.completion != languageThrow || row.returnBoundary != (languageID{}) || e.proof == nil || e.proof.entry == nil {
		return false
	}
	r := e.proof.entry
	return r.finally != nil && r.finally.valid(r) && row.storage.pc == r.finally.route+1 && len(row.storage.choices) == 0 && row.storage.copy == nil && sameLanguageFinallyContext(row.storage.finally, row.finally) && row.finally.completeFor(e, row)
}

// normalize checks producer metadata, never value equality as Return authority.
// Untagged getter Returns cannot satisfy this converter. All nonnormal child
// history remains inspectable, with no resume or fallback execution.
func (h *languageCallHistory) normalize(work ...*languageCopyWork) languageAlternative {
	e := h.entry
	if h.raw == nil || len(h.raw.alternatives) != 1 {
		if e != nil {
			return storageResidual(e.activation, "Call body association")
		}
		return storageResidual(languageBranch{}, "Call body association")
	}
	row := languageCopy(h.raw.alternatives[0])
	if e == nil || !e.valid(e.boundary.owner, e.activation) || h.raw.input != e.activation || h.raw.occurrence.owner != e.boundary.owner || !e.boundary.owner.live(row.branch) || row.branch.env != e.activation.env || row.branch.guard != e.activation.guard || row.branch.generation != e.activation.generation {
		return callBoundaryResidual(row, "Call body association")
	}
	if e.callable.proof.entry.finally != nil && row.completion != languageResidual && !row.finally.completeFor(e, row) {
		return callBoundaryResidual(row, "Finally routing incomplete")
	}
	if row.completion == languageReturn {
		if row.returnBoundary != e.boundary {
			return callBoundaryResidual(row, "Call Return boundary mismatch")
		}
		if !callBodySnapshot(e, row) {
			return callBoundaryResidual(row, "Call formal namespace association")
		}
		if ast.IsGetAccessorDeclaration(e.proof.arrow) && !strictFunctionScalar(row.value) {
			return callBoundaryResidual(row, "Getter scalar output")
		}
		if ast.IsFunctionExpression(e.proof.arrow) && !strictFunctionScalar(row.value) {
			if row.value.object == nil || bodyObjectGetPC(e.proof.entry) < 0 {
				return callBoundaryResidual(row, "Strict function scalar output")
			}
			// spend(nil) is permissive elsewhere. New output authority requires one
			// explicit local work owner, settled once by the consumer below.
			if len(work) != 1 || work[0] == nil || !validBodyGetObjectReturn(e, row, work[0]) {
				return callBoundaryResidual(row, "Body Get object Return provenance")
			}
		}
		row.completion = languageNormal
		row.returnBoundary = languageID{}
		return row
	}
	if row.completion == languageThrow && e.proof.mapping.nullDefaultMember() != nil && !h.parameterDefaultGetThrowProducer() {
		return callBoundaryResidual(row, "Parameter default Get Throw association")
	}
	if row.completion == languageThrow && e.proof.entry.finally != nil && !callThrowProducer(e, row) {
		return callBoundaryResidual(row, "Call Throw producer association")
	}
	if row.returnBoundary != (languageID{}) {
		return callBoundaryResidual(row, "Call completion boundary invalid")
	}
	if row.completion == languageNormal {
		return callBoundaryResidual(row, "Call body missing Return")
	}
	return row
}

func callBoundaryResidual(row languageAlternative, reason string) languageAlternative {
	if row.completion == languageReturn {
		row.pending = languageReturn
		row.pendingValue = row.value
		row.pendingReturnBoundary = row.returnBoundary
	}
	row.completion = languageResidual
	row.returnBoundary = languageID{}
	row.value = languageValue{}
	row.remaining = reason
	row.obligations = append(row.obligations, reason)
	return row
}

// validCompletion authenticates a live issued outcome before typed handoff.
// converted remains Return-to-Normal only. Throw has no fabricated Return tag.
// No new certificate flag, caller reconstruction or normalization is needed.
func (h *languageCallHistory) validCompletion(row languageAlternative) bool {
	if h == nil || h.entry == nil || h.raw == nil || len(h.raw.alternatives) != 1 || row.branch.owner == nil || !row.branch.owner.live(row.branch) || h.id.owner != row.branch.owner || h.id.serial == 0 || h.id.serial > row.branch.owner.next || h.outward != row.branch || h.completion != row.completion || h.value != row.value || row.returnBoundary != (languageID{}) {
		return false
	}
	e, raw := h.entry, h.raw.alternatives[0]
	o := row.branch.owner
	if !e.valid(o, e.activation) || h.raw.input != e.activation || h.raw.occurrence.owner != o || h.raw.occurrence.serial == 0 || h.raw.occurrence.serial > o.next || !sameLanguageCallInputs(row.callInputs, e.inputs) || !sameLanguageCallInputs(raw.callInputs, e.inputs) || !callBodySnapshot(e, raw) || !o.live(raw.branch) || raw.branch.env != e.activation.env || raw.branch.guard != e.activation.guard || raw.branch.generation != e.activation.generation || raw.value != row.value || raw.branch.state != row.branch.state || raw.branch.cursor == ^uint64(0) || raw.branch.cursor+1 != row.branch.cursor || row.branch.env != e.caller {
		return false
	}
	switch row.completion {
	case languageNormal:
		return h.converted && raw.completion == languageReturn && raw.returnBoundary == e.boundary && (e.proof.entry.finally == nil || raw.finally.completeFor(e, raw))
	case languageThrow:
		return !h.converted && (callThrowProducer(e, raw) || h.parameterDefaultGetThrowProducer())
	}
	return false
}

// Existing consumers retain their converted-Normal contract and header relation.
func (h *languageCallHistory) validResult(row languageAlternative) bool {
	return row.completion == languageNormal && h != nil && h.converted && h.validCompletion(row)
}

// budgetSum and budgetProduct refuse before overflow or allocation. Limits are
// the shared remaining work balance, not a new or replenished child budget.
func budgetSum(_ int, values ...int) (int, bool) {
	limit := int(^uint(0) >> 1)
	total := 0
	for _, v := range values {
		if v < 0 || limit < 0 || v > limit-total {
			return 0, false
		}
		total += v
	}
	return total, true
}
func budgetProduct(_ int, a, b int) (int, bool) {
	limit := int(^uint(0) >> 1)
	if limit < 0 || a < 0 || b < 0 || b != 0 && a > limit/b {
		return 0, false
	}
	return a * b, true
}

// callCopyCharge covers up to 24 fixed vector/header/receipt-copy passes and
// four conservative quadratic history/contribution merge passes. N/R activation
// arrays, A/L acquired headers and inherited H/C payloads are all represented.
// Scope entry/exit and detached cut sealing are reserved before activation.
func callCopyCharge(recipe *storageRecipe, a languageAlternative, inputs *languageCallInputs, limit int, objectHorizon ...int) (int, bool) {
	c, ok := budgetSum(limit, len(a.effects), len(a.obligations))
	if !ok {
		return 0, false
	}
	h := len(a.objects)
	issuance := 0
	if len(objectHorizon) == 1 {
		if objectHorizon[0] < h {
			return 0, false
		}
		h = objectHorizon[0]
	} else if bodyObjectGetPC(recipe) >= 0 {
		var more bool
		h, more = budgetSum(limit, h, 1)
		if !more {
			return 0, false
		}
		issuance = 8
	}
	wide, wideOK := historyObservationVectorUnits(h, limit)
	if !wideOK {
		return 0, false
	}
	size, ok := budgetSum(limit, recipe.locals, recipe.registers, len(inputs.arguments), len(inputs.lexicals), wide, c, 1)
	if !ok {
		return 0, false
	}
	fixed, ok := budgetProduct(limit, 24, size)
	if !ok {
		return 0, false
	}
	histories, ok := budgetSum(limit, h, c, 1)
	if !ok {
		return 0, false
	}
	quadratic, ok := budgetProduct(limit, histories, histories)
	if !ok {
		return 0, false
	}
	quadratic, ok = budgetProduct(limit, 4, quadratic)
	if !ok {
		return 0, false
	}
	family, familyOK := finallyCopyReserve(recipe, a, inputs, limit)
	if !familyOK {
		return 0, false
	}
	captureScans := 0
	if inputs.callee.callable != nil && len(inputs.callee.callable.capturedLexicals) > 0 {
		// Reserve repeated capture/entry/history validation over actual storage.
		for row := a.branch.state.storage; row != nil; row = row.previous {
			captureScans = estimatedCostSum(captureScans, 17)
		}
	}
	return budgetSum(limit, fixed, quadratic, family, issuance, captureScans, 2)
}
func callEventCharge(a languageAlternative, inputs *languageCallInputs, limit int, objectHorizon ...int) (int, bool) {
	empty := storageRecipe{}
	cost, ok := callCopyCharge(&empty, a, inputs, limit, objectHorizon...)
	return cost, ok
}
func callSetupFloor(recipe *storageRecipe, limit int) (int, bool) {
	if recipe.choiceSlots > 0 {
		return shortCircuitSetup(recipe, limit)
	}
	n, ok := budgetProduct(limit, recipe.locals, 3)
	if !ok {
		return 0, false
	}
	r, ok := budgetProduct(limit, recipe.registers, 5)
	if !ok {
		return 0, false
	}
	return budgetSum(limit, n, r, 16)
}

// callEntryRefusal is a header-only pre-entry cut. It issues no identity,
// activation or variable allocation when setup reservation cannot be paid.
func callEntryRefusal(a languageAlternative, reason string) languageAlternative {
	a.completion = languageResidual
	a.returnBoundary = languageID{}
	a.value = languageValue{}
	a.remaining = reason
	return a
}

// consumeClosedCallInputs is called once at the live completed acquisition cut.
// It creates no root. Acquired state enters one activation and returns with the
// latest child state, while only the environment changes on paid scope exit.
func (o *languageOwner) consumeClosedCallInputs(input languageBranch, a languageAlternative, budget int, candidates ...*closedPrefixCandidate) (languageAlternative, int) {
	if a.completion != languageNormal {
		return a, 0
	}
	inputs := a.callInputs
	if inputs == nil || !inputs.complete || !inputs.calleeReady || inputs.callee.callable == nil {
		return callEntryRefusal(a, "Call acquisition incomplete"), 0
	}
	f := inputs.callee.callable
	if f.proof == nil || f.proof.entry == nil {
		return callEntryRefusal(a, "Call entry unimplemented"), 0
	}
	implicit := inputs.targetOrigin != nil && inputs.targetOrigin.getterInstall != nil
	admitted := false
	if len(candidates) == 1 {
		if implicit {
			admitted = candidates[0].admitsOwnGetter(o, f.proof, inputs, a)
		} else {
			admitted = candidates[0].admits(o, f.proof, a)
		}
	}
	if !admitted {
		return callEntryRefusal(a, "Call finalized source authority"), 0
	}
	if !implicit && candidates[0].history.recipe.binding != nil && !bindingInputsMatchSite(candidates[0], inputs, a) {
		return callEntryRefusal(a, "Binding acquired site association"), 0
	}
	recipe := f.proof.entry
	if recipe.finally != nil && !recipe.finally.valid(recipe) {
		return callEntryRefusal(a, "Finally recipe association"), 0
	}
	if !o.live(input) || !o.live(a.branch) || f.id.owner != o || !f.proof.captureLayoutValid() || !o.callableCaptureState(a.branch, f) || recipe.body != f.proof.arrow || !recipe.callBody || recipe.prefix || recipe.locals != f.proof.parameters || recipe.locals != len(recipe.declarations) {
		return callEntryRefusal(a, "Call entry proof association"), 0
	}
	fixed, ok := callCopyCharge(recipe, a, inputs, budget)
	if !ok {
		fixed = estimatedCostSum(-1, 0)
	}
	// Three activation identities, one per formal cell and the finite raw/cut
	// tail are actual issuance counts, not the advisory work quotation.
	if !storageBuffersAddressable(recipe) || recipe.locals < 0 || !o.canIssue(uint64(recipe.locals)+11) || a.branch.cursor > ^uint64(0)-2 {
		return callEntryRefusal(a, "Call identity/cursor capacity"), 0
	}

	if !callAcquisitionValid(o, input, a) {
		return callEntryRefusal(a, "Call acquired context association"), 0
	}
	if f.proof.mapping.scalarDefaultParameter(0) != nil {
		for i := 0; i < len(recipe.declarations) && i < len(inputs.arguments); i++ {
			value := inputs.arguments[i].value
			undefined, known := acquiredUndefined(a.branch, value)
			_, canonical := acquiredBoolean(a.branch, value)
			if _, number := numericNumberPayload(value); !known || !canonical || !undefined && !number {
				return callEntryRefusal(a, "Scalar default actual argument unavailable"), 0
			}
		}
	}
	if f.proof.mapping.objectDefaultMember() != nil {
		if len(inputs.arguments) < 1 || len(inputs.arguments) > 2 || inputs.arguments[0].value.object == nil {
			return callEntryRefusal(a, "Object default actual input unavailable"), 0
		}
		if len(inputs.arguments) == 2 {
			value := inputs.arguments[1].value
			undefined, known := acquiredUndefined(a.branch, value)
			_, canonical := acquiredBoolean(a.branch, value)
			if _, number := numericNumberPayload(value); !known || !canonical || !undefined && !number {
				return callEntryRefusal(a, "Object default actual argument unavailable"), 0
			}
		}
	}
	// Claim the authenticated source consumer only after every no-allocation preflight.
	if inputs.bindingSite != nil {
		candidates[0].bindingPhase++
	} else if implicit {
		candidates[0].entryInputs = nil
	} else {
		candidates[0].entryInputs = nil
		candidates[0].bodyClaimed = true
	}
	acquisition := o.receipt(input, []languageAlternative{a})
	frozen := acquisition.alternatives[0].callInputs
	entry := &languageCallEntryInput{proof: f.proof, acquisition: acquisition, inputs: frozen, callable: f, boundary: o.identity(), caller: a.branch.env, activation: a.branch}
	entry.activation.env = o.environment(f.captures)
	entry.activation.cursor++
	// The sealed acquisition owns this read-only history during internal child
	// execution. All other payloads retain their existing defensive copies.
	seed := a
	seed.objects = nil
	child := languageCopy(seed)
	sealedObjects := acquisition.alternatives[0].objects
	child.objects = sealedObjects[:len(sealedObjects):len(sealedObjects)]
	child.branch = entry.activation
	child.callInputs = frozen
	raw, spent := o.executeStorageCallBody(recipe, budget-fixed, child, entry)
	used := estimatedCostSum(fixed, spent)
	body := o.receipt(entry.activation, []languageAlternative{raw})
	history := &languageCallHistory{id: o.identity(), entry: entry, raw: body}
	out := raw
	// Buffer/cut/exit copies were reserved. Boundary execution itself must still
	// pay one unit after the body, so a cut can retain a tagged pending Return.
	{
		if raw.completion == languageReturn {
			used = estimatedCostSum(used, 1)
		}
		if raw.value.object != nil && raw.completion == languageReturn && !ast.IsFunctionExpression(entry.proof.arrow) && !ast.IsGetAccessorDeclaration(entry.proof.arrow) {
			work := languageCopyWork{remaining: budget - used}
			valid := validObjectCallReturn(entry, raw, &work)
			used = estimatedCostSum(used, work.used)
			if !valid {
				out = callBoundaryResidual(raw, "Object Return provenance")
			} else {
				out = history.normalize()
			}
		} else if raw.completion == languageReturn && raw.value.object != nil && ast.IsFunctionExpression(entry.proof.arrow) {
			work := languageCopyWork{remaining: budget - used}
			out = history.normalize(&work)
			used = estimatedCostSum(used, work.used)
		} else {
			out = history.normalize()
		}
		history.converted = raw.completion == languageReturn && out.completion == languageNormal
	}
	out.branch.env = entry.caller
	if out.branch.cursor == ^uint64(0) {
		// Raw completion remains inspectable. Outward fields have not been
		// issued, so neither completion validator can grant handoff authority.
		out = callBoundaryResidual(out, "Call cursor capacity")
		out.callHistory = history
		return out, used
	}
	out.branch.cursor++
	history.outward, history.completion, history.value = out.branch, out.completion, out.value
	out.callHistory = history
	return out, used
}

// strictFunctionScalar is output admission, not coercion. Receiver identity and
// body Get authority do not extend the arrow actual/formal object-return law.
func strictFunctionScalar(v languageValue) bool {
	if v.object != nil || v.callable != nil || v.text != "" {
		return false
	}
	if v.number != (numberPayload{}) {
		_, known := numericNumberPayload(v)
		return known
	}
	if v.undefined {
		return v.node == nil || ast.IsIdentifier(v.node) && v.node.Text() == "undefined"
	}
	return v.node != nil && v.node.Kind != ast.KindNumericLiteral && expressionLiteralNode(v.node)
}
