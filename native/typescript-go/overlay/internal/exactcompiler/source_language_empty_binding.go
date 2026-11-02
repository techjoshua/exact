package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// A binding site is an immutable recipe role on the actual declaration, never an
// authored Call substitute. Only the live installed binding can lend its permit.
type bindingCallSite struct {
	plan                                   *storageBindingRecipe
	role                                   int
	member, get, acquire, finalize, invoke int
}

// Each actual element owns one immutable group in the common recipe. Statement
// ordinal, element index and lexical cell slot are authenticated separately.
type bindingElementRecipe struct {
	plan                                                   *storageBindingRecipe
	node                                                   *ast.Node
	index                                                  int
	step                                                   bindingCallSite
	doneGet, doneSelect, valueGet, selectValue, initialize int
}
type storageBindingRecipe struct {
	declaration                         *ast.Node
	recipe                              *storageRecipe
	elements                            []bindingElementRecipe
	iterator, next, record, park, route int
	first, close                        bindingCallSite
}

// The H owner shares complete selected rows and child receipts. It never clones
// parent contexts recursively and is independent of expression pendingValue.
type languageBindingContext struct {
	// Actual sealed noncallable acquisition only, never a completed Call.
	firstMethod                                      *languageCallInputs
	plan                                             *storageBindingRecipe
	elementIndex                                     int
	completed                                        *bindingElementCompletion
	first, step, close                               *languageCallHistory
	result                                           languageValue
	doneReceipt, valueReceipt, selected, interrupted *languageReceipt
	target                                           languageCell
	doneKnown                                        bool
	iterator, next                                   languageValue
	nextReference                                    languageReference
	nextBranch                                       languageBranch
	nextReceipt                                      *languageReceipt
	initialization                                   *languageReceipt // immutable actual pre-Initialize result, not selected Get
	origin                                           *languageReceipt
	returnGet                                        *languageCallTargetOrigin // immutable completed DATA Get, not Call permission
	parent                                           *languageBindingContext
	done, routed                                     bool
}

// bindingAbsentValue checks the two canonical absence carriers, not source
// or Get authority. Both roles still require their exact parent and target.
// Live issuance keeps acquiredNullish and the current descriptor/origin.
// Detached inspection uses immutable paid metadata without renewing authority.
func bindingAbsentValue(p *storageBindingRecipe, v languageValue) bool {
	if p == nil || v.text != "" || v.number != (numberPayload{}) || v.object != nil || v.callable != nil {
		return false
	}
	if v.undefined {
		return v.node == nil || ast.IsIdentifier(v.node)
	}
	return v.node != nil && v.node.Kind == ast.KindNullKeyword
}

// bindingReturnGetPlan bounds all labels before the existing plan validator can
// index them. Only an authenticated binding close Get can lend this forward edge.
func bindingReturnGetPlan(r *storageRecipe, pc int) bool {
	if r == nil || r.binding == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	p := r.binding
	for _, site := range p.sites() {
		for _, label := range []int{site.member, site.get, site.acquire, site.finalize, site.invoke} {
			if label < 0 || label >= len(r.events) {
				return false
			}
		}
	}
	for _, label := range []int{p.iterator, p.next, p.record, p.park, p.route} {
		if label < 0 || label >= len(r.events) {
			return false
		}
	}
	for i := range p.elements {
		d := &p.elements[i]
		for _, label := range []int{d.doneGet, d.doneSelect, d.valueGet, d.selectValue, d.initialize} {
			if label < 0 || label >= len(r.events) {
				return false
			}
		}
		if d.doneGet == 0 || d.valueGet == 0 {
			return false
		}
	}
	if !p.valid(r) || pc != p.close.get && pc != p.route {
		return false
	}
	source := ast.GetSourceFileOfNode(p.declaration)
	if source == nil || r.body != source.AsNode() {
		return false
	}
	member, route := r.events[p.close.member], r.events[p.route]
	return member.a == p.iterator && member.key == languageStringKey("return") && member.keyProducerPC == -1 && route.kind == "RouteIteratorClose" && route.node == p.declaration && route.a == p.close.invoke
}

// bindingNormalUnusedMetadata checks sealed completion data only. Unlike the
// ordinary sequence gate, detached history cannot require a still-live owner.
func bindingNormalUnusedMetadata(a languageAlternative) bool {
	return a.branch.owner != nil && a.completion == languageNormal && a.value == (languageValue{}) && a.remaining == "" && a.pending == languageNormal && a.pendingValue == (languageValue{}) && a.returnBoundary == (languageID{}) && a.pendingReturnBoundary == (languageID{})
}

// bindingReturnGetParent checks the installed H source parent. Normal-unused
// retains the initialized lineage. Default Throw uses its distinct origin and
// actual uninitialized target. Empty binding keeps its zero-target law.
func bindingReturnGetParent(c *languageBindingContext, a languageAlternative) bool {
	if a.branch.owner == nil || c == nil || c.plan == nil || c.first == nil || c.first.entry == nil || c.first.entry.inputs == nil || c.first.entry.inputs.bindingSite != &c.plan.first || c.first.entry.inputs.call != c.plan.declaration || c.first.entry.boundary.owner != a.branch.owner || c.first.id.owner != a.branch.owner || c.first.id.serial == 0 || c.first.id.serial > a.branch.owner.next || !c.first.converted || c.first.completion != languageNormal || c.first.value != c.iterator || c.iterator.object == nil || c.nextReceipt == nil || len(c.nextReceipt.alternatives) != 1 || c.origin == nil || len(c.origin.alternatives) != 1 || c.close != nil || c.done || c.interrupted != nil {
		return false
	}
	if c.origin.occurrence.owner != a.branch.owner || c.origin.occurrence.serial == 0 || c.origin.occurrence.serial > a.branch.owner.next || c.nextReceipt.occurrence.owner != a.branch.owner || c.nextReceipt.occurrence.serial == 0 || c.nextReceipt.occurrence.serial > a.branch.owner.next {
		return false
	}
	pending, next := c.origin.alternatives[0], c.nextReceipt.alternatives[0]
	prior := pending.binding
	if bindingDefaultOrigin(c, a) {
		return a.callHistory == pending.callHistory && c.close == nil
	}
	// The new result occurrence already owns the shared Normal Next/source
	// lineage. Preserve the role-specific current-history and Get wrapper guards.
	if c.completed != nil {
		return bindingNormalUnusedMetadata(pending) && c.origin.input == pending.branch && pending.binding != nil && a.callHistory == pending.callHistory && bindingDescendant(pending.branch, a.branch) && sameLanguageFinallyContext(a.finally, pending.finally) && c.elementIndex == len(c.plan.elements)-1 && completedElements(c, a, len(c.plan.elements)) && pending.binding.completed == c.completed
	}
	if c.initialization != nil {
		return a.callHistory == c.step && c.normalDefaultInitialized(a)
	}
	if !bindingNormalUnusedMetadata(pending) || c.origin.input != pending.branch || prior == nil || prior.plan != c.plan || prior.first != c.first || prior.iterator != c.iterator || prior.nextReceipt != c.nextReceipt || prior.next != c.next || prior.nextReference != c.nextReference || prior.nextBranch != c.nextBranch || prior.parent != c.parent || prior.initialization != c.initialization || prior.elementIndex != c.elementIndex || prior.completed != c.completed || prior.origin != nil || prior.returnGet != nil || c.nextReceipt.input != c.nextBranch || next.branch != c.nextBranch || next.completion != languageNormal || next.value != c.next || a.branch.owner != pending.branch.owner || a.branch.guard != pending.branch.guard || a.branch.generation != pending.branch.generation || a.branch.env != pending.branch.env || !sameLanguageFinallyContext(a.finally, pending.finally) {
		return false
	}
	if c.elementNode() == nil {
		return c.step == nil && !c.doneKnown && c.doneReceipt == nil && c.valueReceipt == nil && c.selected == nil && c.target == (languageCell{}) && a.callHistory == c.first
	}
	h := c.step
	if h == nil || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next || h.entry == nil || h.entry.inputs == nil || h.entry.caller == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 || h.raw == nil || len(h.raw.alternatives) != 1 || !h.converted || h.completion != languageNormal || h.value != c.result || c.result.object == nil || a.callHistory != h || !c.doneKnown || c.doneReceipt == nil || c.valueReceipt != c.selected || c.selected == nil || prior.step != h || prior.result != c.result || prior.doneKnown != c.doneKnown || prior.done != c.done || prior.doneReceipt != c.doneReceipt || prior.valueReceipt != c.valueReceipt || prior.selected != c.selected || prior.target != (languageCell{}) {
		return false
	}
	e, raw := h.entry, h.raw.alternatives[0]
	in := e.inputs
	acquired := e.acquisition.alternatives[0].binding
	if in.bindingSite != c.elementStep() || in.call != c.plan.declaration || in.callee != c.next || in.reference != c.nextReference || in.receiver != c.iterator || len(in.arguments) != 0 || acquired == nil || acquired.plan != c.plan || acquired.first != c.first || acquired.iterator != c.iterator || acquired.nextReceipt != c.nextReceipt || acquired.step != nil || acquired.origin != nil || acquired.parent != c.parent || raw.completion != languageReturn || raw.value != c.result || raw.returnBoundary != e.boundary || h.raw.input != e.activation || raw.branch.env != e.activation.env || e.caller != a.branch.env {
		return false
	}
	return bindingInitializedTarget(c, a, in.lexicals, e.caller)
}

// bindingReturnGetNumberError recognizes only the existing certified Number
// category at an authenticated Normal-unused lookup. It grants no Call authority.
func bindingReturnGetNumberError(c *languageBindingContext, v languageValue) bool {
	if c == nil || c.plan == nil {
		return false
	}
	_, known := numericNumberPayload(v)
	return known
}

// bindingDataGetCharge shares actual fixed context/receipt and
// H+1 observation allocations. It is advisory, with checked layout/headroom.
func (o *languageOwner) bindingDataGetCharge(a languageAlternative) (int, bool) {
	count, ok := o.completedGetCapacity(len(a.objects))
	if !ok {
		return 0, false
	}
	payload, ok := budgetProduct(0, count, int(unsafe.Sizeof(storageObjectObservation{})))
	if !ok {
		return 0, false
	}
	bytes, ok := budgetSum(0, payload, int(unsafe.Sizeof(languageBindingContext{})), int(unsafe.Sizeof(languageReceipt{})), int(unsafe.Sizeof(languageAlternative{})), 31)
	return bytes / 32, ok
}

// finishBindingReturnGet installs the actual immutable method-lookup origin and bare Get
// observation. No header, child Call or Return result is fabricated here.
func (o *languageOwner) finishBindingReturnGet(a languageAlternative, r *storageRecipe, pc int, t *languageCallTargetOrigin) (languageAlternative, bool) {
	if !bindingReturnGetPlan(r, pc) || pc != r.binding.close.get || a.completion != languageNormal || !shortCircuitCanonical(a) || !bindingReturnGetParent(a.binding, a) || a.binding.plan != r.binding || a.binding.returnGet != nil || a.binding.routed || a.storage != nil || a.callInputs != nil || t == nil || t.getterInstall != nil || t.recipe != r || t.referencePC != r.binding.close.member || t.getPC != pc || t.acquirePC != r.binding.close.acquire || t.output != a.branch || t.value != a.value || t.input.state != t.output.state || t.input.env != t.output.env || t.input.owner != o || !o.live(t.input) || !o.live(t.output) || !bindingAbsentValue(r.binding, a.value) && !bindingReturnGetNumberError(a.binding, a.value) {
		return a, false
	}
	if a.binding.elementNode() != nil {
		// This is a live conversion check. Detached history uses the installed
		// known-false fact and immutable receipts, never this live predicate.
		done, known := acquiredBoolean(a.branch, a.binding.doneReceipt.alternatives[0].value)
		if !known || done {
			return a, false
		}
	}
	known := bindingReturnGetNumberError(a.binding, a.value)
	if bindingAbsentValue(a.binding.plan, a.value) {
		nullish, available := acquiredNullish(a.branch, a.value)
		known = available && nullish
	}
	ref := t.reference
	if !known || ref.id.owner != o || ref.id.serial == 0 || ref.id.serial > o.next || ref.cell.id.owner != nil || ref.receiver != a.binding.iterator || ref.key != languageStringKey("return") {
		return a, false
	}
	d, present, _, record := o.readOwnRecord(t.input, ref.receiver.object, ref.key)
	if !present || record == nil || record.deleted || !record.initialized || d.accessor || d.value != a.value {
		return a, false
	}
	for _, observation := range a.objects {
		if observation.recipe == r && observation.pc == pc {
			return a, false
		}
	}
	if _, ok := o.bindingDataGetCharge(a); !ok {
		return a, false
	}
	context := *a.binding
	context.returnGet = t
	bare := languageAlternative{branch: a.branch, completion: languageNormal, value: a.value, binding: &context, finally: a.finally}
	out, ok := o.appendCompletedGet(a, t.input, bare, r, pc, ref)
	if !ok {
		return a, false
	}
	out.binding = &context
	return out, true
}

// returnGetAssociation inspects a successful Normal lookup without renewing live entry
// or replaying Get. The bare Get row links the exact immutable origin pointer.
func (c *languageBindingContext) returnGetAssociation(a languageAlternative) bool {
	if !bindingReturnGetParent(c, a) || a.binding != c || !bindingReturnGetPlan(c.plan.recipe, c.plan.route) || c.returnGet == nil || a.storage != nil || a.callInputs != nil {
		return false
	}
	t, p := c.returnGet, c.plan
	if t.getterInstall != nil || t.recipe != p.recipe || t.referencePC != p.close.member || t.getPC != p.close.get || t.acquirePC != p.close.acquire || t.output != a.branch || t.input.state != t.output.state || t.input.owner != a.branch.owner || t.input.env != a.branch.env || t.reference.id.owner != a.branch.owner || t.reference.id.serial == 0 || t.reference.cell.id.owner != nil || t.reference.receiver != c.iterator || t.reference.key != languageStringKey("return") || !bindingAbsentValue(p, t.value) && !bindingReturnGetNumberError(c, t.value) {
		return false
	}
	found := false
	for _, observation := range a.objects {
		if observation.recipe != p.recipe || observation.pc != p.close.get {
			continue
		}
		if found || observation.node != p.declaration || observation.reference != t.reference.id || observation.receipt == nil || observation.receipt.occurrence.owner != a.branch.owner || observation.receipt.occurrence.serial <= t.reference.id.serial || observation.receipt.occurrence.serial > a.branch.owner.next || observation.receipt.input != t.input || len(observation.receipt.alternatives) != 1 {
			return false
		}
		get := observation.receipt.alternatives[0]
		parent := get.binding
		if get.completion != languageNormal || get.branch != t.output || get.value != t.value || get.callHistory != nil || get.callInputs != nil || get.storage != nil || len(get.objects) != 0 || len(get.effects) != 0 || len(get.obligations) != 0 || parent == nil || parent.returnGet != t || parent.plan != p || parent.origin != c.origin || parent.first != c.first || parent.nextReceipt != c.nextReceipt || parent.step != c.step || parent.result != c.result || parent.doneKnown != c.doneKnown || parent.done != c.done || parent.doneReceipt != c.doneReceipt || parent.valueReceipt != c.valueReceipt || parent.selected != c.selected || parent.initialization != c.initialization || parent.elementIndex != c.elementIndex || parent.completed != c.completed || parent.target != c.target || parent.parent != c.parent || parent.close != nil || parent.routed || !sameLanguageFinallyContext(get.finally, a.finally) {
			return false
		}
		found = true
	}
	return found
}

func (c *languageBindingContext) absentReturnOutput(a languageAlternative) bool {
	return c != nil && c.origin != nil && len(c.origin.alternatives) == 1 && bindingNormalUnusedMetadata(c.origin.alternatives[0]) && c.routed && c.returnGet != nil && bindingAbsentValue(c.plan, c.returnGet.value) && c.returnGetAssociation(a) && bindingNormalUnusedMetadata(a)
}

// returnGetNumberErrorOutput is a protocol-owned error after a successful
// Normal Get. It consumes no child Call. Incoming-Throw precedence is handled
// by the default-origin winner, separately from this Normal-origin error.
func (c *languageBindingContext) returnGetNumberErrorOutput(a languageAlternative) bool {
	return c != nil && c.origin != nil && len(c.origin.alternatives) == 1 && bindingNormalUnusedMetadata(c.origin.alternatives[0]) && c.routed && c.returnGet != nil && bindingReturnGetNumberError(c, c.returnGet.value) && c.returnGetAssociation(a) && a.completion == languageThrow && a.value == (languageValue{text: "TypeError"}) && a.remaining == "" && a.returnBoundary == (languageID{}) && a.pending == languageNormal && a.pendingValue == (languageValue{}) && a.pendingReturnBoundary == (languageID{})
}

func emptyBindingDeclaration(n *ast.Node) bool {
	nodes, ok := bindingElements(n)
	return ok && len(nodes) == 0
}

// The shape predicate is shared by reservation and initializer routing. Only
// completed-index attachment grants execution authority to the actual element.
func supportedBindingDeclaration(n *ast.Node) bool { _, ok := bindingElements(n); return ok }

func prefixEntryNode(r *storageRecipe) *ast.Node {
	if r.binding != nil {
		return r.binding.declaration
	}
	return r.call
}

func (p *storageBindingRecipe) sites() []*bindingCallSite {
	if p == nil {
		return nil
	}
	sites := []*bindingCallSite{&p.first}
	for i := range p.elements {
		sites = append(sites, &p.elements[i].step)
	}
	return append(sites, &p.close)
}
func (p *storageBindingRecipe) site(pc int) *bindingCallSite {
	for _, s := range p.sites() {
		if s.invoke == pc {
			return s
		}
	}
	return nil
}
func (p *storageBindingRecipe) valid(r *storageRecipe) bool {
	if p == nil || r == nil || p.recipe != r || r.binding != p || !r.prefix || r.callBody || r.call != nil {
		return false
	}
	nodes, ok := bindingElements(p.declaration)
	if !ok || len(nodes) != len(p.elements) {
		return false
	}
	for i := range p.elements {
		if p.elements[i].plan != p || p.elements[i].index != i || p.elements[i].node != bindingElementSource(p.declaration, i) {
			return false
		}
	}
	for _, site := range p.sites() {
		role := 0
		if site == &p.close {
			role = 1
			if len(nodes) > 0 {
				role = 2
			}
		} else if bindingStepDescriptor(p, site) != nil {
			role = 1
		}
		if site.plan != p || site.role != role || site.member < 0 || site.get != site.member+1 || site.get >= len(r.events) || site.acquire < 0 || site.acquire >= len(r.events) || site.finalize < 0 || site.invoke != site.finalize+1 || site.invoke >= len(r.events) {
			return false
		}
		d := bindingStepDescriptor(p, site)
		if d == nil || d.index == 0 {
			if site.acquire != site.get+1 {
				return false
			}
		}
		expected := site.acquire + 1
		if d != nil && d.index == 0 {
			expected++
		}
		if site.finalize != expected {
			return false
		}
		for _, pc := range []int{site.member, site.get, site.acquire, site.finalize, site.invoke} {
			if r.events[pc].node != p.declaration {
				return false
			}
		}
		ref, get, acquire, finalize, invoke := r.events[site.member], r.events[site.get], r.events[site.acquire], r.events[site.finalize], r.events[site.invoke]
		if ref.kind != "Member" || get.kind != "GetValue" || get.a != site.member || acquire.kind != "AcquireCallCallee" || acquire.a != site.get || acquire.b != site.member || finalize.kind != "FinalizeCallInputs" || finalize.a != site.get || finalize.cell != 0 || invoke.kind != "InvokeAcquiredCall" || invoke.a != site.get || invoke.cell != role {
			return false
		}
	}
	if p.iterator != p.first.invoke || p.next <= p.iterator || p.close.member != p.park+1 || p.route != p.close.invoke+1 || p.route != len(r.events)-1 {
		return false
	}
	if len(nodes) == 0 {
		return p.record == p.next+1 && p.park == p.record+1
	}
	if p.next != p.elements[0].step.get || p.elements[0].step.member != p.iterator+1 || p.record != p.elements[0].step.acquire+1 {
		return false
	}
	for i := range p.elements {
		d := &p.elements[i]
		if i > 0 && (d.step.acquire != p.elements[i-1].initialize+1 || d.step.get != p.next || d.step.member != p.elements[0].step.member) {
			return false
		}
		if d.doneGet != d.step.invoke+2 || d.doneSelect != d.doneGet+1 || d.valueGet != d.doneSelect+2 || d.selectValue != d.valueGet+1 || d.node.Initializer() == nil && d.initialize != d.selectValue+1 {
			return false
		}
		for _, pc := range []int{d.doneGet - 1, d.doneGet, d.doneSelect, d.valueGet - 1, d.valueGet, d.selectValue, d.initialize} {
			if pc < 0 || pc >= len(r.events) {
				return false
			}
		}
		if d.node.Initializer() != nil {
			_, producer, ok := bindingDefaultLayout(r, p)
			if !ok {
				return false
			}
			if r.events[producer].kind == "InvokeAcquiredCall" || ast.IsCallExpression(r.events[producer].node) {
				if _, _, ok := bindingDefaultCallLayout(r, p); !ok {
					return false
				}
			}
		}
		init := r.events[d.initialize]
		if init.kind != "InitializeCell" || init.node != d.node || init.a != bindingInitializeInput(d) || init.cell < 0 || init.cell >= len(r.declarations) || r.declarations[init.cell] != d.node {
			return false
		}
		if r.events[d.doneGet-1].kind != "Member" || r.events[d.doneGet-1].a != d.step.invoke || r.events[d.doneGet-1].key != languageStringKey("done") || r.events[d.doneGet].kind != "GetValue" || r.events[d.doneGet].a != d.doneGet-1 || r.events[d.doneSelect].kind != "SelectIteratorDone" || r.events[d.doneSelect].a != d.doneGet || r.events[d.valueGet-1].kind != "Member" || r.events[d.valueGet-1].a != d.step.invoke || r.events[d.valueGet-1].key != languageStringKey("value") || r.events[d.valueGet].kind != "GetValue" || r.events[d.valueGet].a != d.valueGet-1 || r.events[d.selectValue].kind != "SelectBindingValue" || r.events[d.selectValue].a != d.valueGet {
			return false
		}
	}
	return p.park == p.elements[len(nodes)-1].initialize+1 && r.events[p.record].kind == "InstallIteratorRecord" && r.events[p.record].a == p.iterator && r.events[p.record].b == p.next
}

// bindingCloseRole names the one exact declaration-backed Close site. It is
// shared by child admission and historical routing, never general abrupt dispatch.
func bindingCloseRole(p *storageBindingRecipe, s *bindingCallSite) bool {
	return p != nil && p.recipe != nil && p.valid(p.recipe) && s == &p.close && s.plan == p && p.site(s.invoke) == s
}

// bindingFirstRole is the selected source-owned pre-record site, not Call authority.
func bindingFirstRole(p *storageBindingRecipe, site *bindingCallSite) bool {
	return p != nil && p.recipe != nil && p.valid(p.recipe) && site == &p.first && site.role == 0
}

// bindingFirstMethodNumber names only the selected canonical numeric9 domain.
// Header completeness and a reference target alone never prove noncallability.
func bindingFirstMethodNumber(v languageValue) bool {
	n, known := numericNumberPayload(v)
	return known && n == 9 && !v.undefined && v.object == nil && v.callable == nil
}

// bindingFirstMethodOrigin is immutable recipe/reference geometry. It cannot
// issue a Get, validate a live namespace or activate the acquired value.
func bindingFirstMethodOrigin(r *storageRecipe, t *languageCallTargetOrigin) bool {
	if r == nil || r.binding == nil || len(r.binding.elements) > 1 || !r.binding.valid(r) || t == nil || t.getterInstall != nil {
		return false
	}
	p := r.binding
	return t.recipe == r && t.referencePC == p.first.member && t.getPC == p.first.get && t.acquirePC == p.first.acquire &&
		t.reference.id.owner != nil && t.reference.id.serial != 0 && t.reference.cell == (languageCell{}) &&
		t.reference.receiver.object != nil && t.reference.receiver.object.id.owner == t.reference.id.owner &&
		t.reference.key == languageIteratorKey() && bindingFirstMethodNumber(t.value) &&
		t.input == t.output && t.output.owner == t.reference.id.owner
}

// bindingFirstMethodReady consumes only the existing actual register vector.
// It cannot substitute header completeness for the paid Get/acquire stages.
func bindingFirstMethodReady(r *storageRecipe, pc int, ready []bool) bool {
	if r == nil || r.binding == nil || len(r.binding.elements) > 1 || !r.binding.valid(r) || r.symbolCase == nil || len(ready) != r.registers {
		return false
	}
	p, source := r.binding, r.symbolCase
	for _, keyPC := range []int{source.firstPC, source.lastPC, r.events[p.first.member].keyProducerPC, p.first.member, p.first.get} {
		if keyPC < 0 || keyPC >= len(ready) || !ready[keyPC] {
			return false
		}
	}
	if ready[p.first.finalize] || ready[p.first.invoke] {
		return false
	}
	for _, later := range []int{p.record, p.next, p.park, p.close.member, p.close.get, p.close.acquire, p.close.finalize, p.close.invoke, p.route} {
		if later < 0 || later >= len(ready) || ready[later] {
			return false
		}
	}
	if d := p.elementAt(0); d != nil {
		for _, later := range []int{d.step.invoke, d.doneGet, d.doneSelect, d.valueGet, d.selectValue, d.initialize} {
			if later < 0 || later >= len(ready) || ready[later] {
				return false
			}
		}
	}
	if pc == p.first.get {
		return !ready[p.first.acquire]
	}
	return pc == p.first.finalize && ready[p.first.acquire]
}

// bindingFirstMethodInputs inspects the sealed acquired header and caller
// lexicals historically. It does not require a callable proof or live lease.
func bindingFirstMethodInputs(r *storageRecipe, in *languageCallInputs, branch languageBranch) bool {
	if r == nil || r.binding == nil || in == nil || branch.owner == nil || branch.env == nil || branch.state == nil ||
		!bindingFirstRole(r.binding, in.bindingSite) || in.call != r.binding.declaration ||
		in.category != callReferenceTarget || in.valueOrigin != nil || !in.calleeReady || !in.complete || len(in.arguments) != 0 ||
		!bindingFirstMethodOrigin(r, in.targetOrigin) || in.callee != in.targetOrigin.value || in.reference != in.targetOrigin.reference ||
		in.receiver != in.reference.receiver || in.calleeBranch != in.targetOrigin.output || branch != in.calleeBranch ||
		len(in.lexicals) != len(r.declarations) {
		return false
	}
	for i, lexical := range in.lexicals {
		if lexical.declaration != r.declarations[i] {
			return false
		}
	}
	if r.binding.elementNode(0) != nil {
		_, ok := bindingUninitializedTarget(r.binding.elementAt(0), branch, in.lexicals)
		return ok
	}
	return true
}

// bindingFirstMethodReceipt binds the one issued Normal Get to this header.
// The enclosing TypeError is separate. No disposed live validator is used.
func bindingFirstMethodReceipt(a languageAlternative, r *storageRecipe, in *languageCallInputs) bool {
	if !bindingFirstMethodInputs(r, in, a.branch) {
		return false
	}
	t := in.targetOrigin
	found := false
	for _, record := range a.objects {
		if record.recipe != r || record.pc != r.binding.first.get {
			continue
		}
		receipt := record.receipt
		if found || record.node != r.binding.declaration || record.reference != in.reference.id || receipt == nil ||
			receipt.input != t.input || receipt.occurrence.owner != a.branch.owner || receipt.occurrence.serial == 0 ||
			receipt.occurrence.serial > a.branch.owner.next || len(receipt.alternatives) != 1 {
			return false
		}
		bare := receipt.alternatives[0]
		if bare.branch != t.output || bare.completion != languageNormal || bare.value != in.callee || bare.remaining != "" ||
			bare.pending != languageNormal || bare.pendingValue != (languageValue{}) || bare.pendingReturnBoundary != (languageID{}) ||
			bare.returnBoundary != (languageID{}) || bare.binding != nil || bare.storage != nil || bare.callInputs != nil || bare.callHistory != nil ||
			len(bare.objects) != 0 || len(bare.effects) != 0 || len(bare.obligations) != 0 || !sameLanguageFinallyContext(bare.finally, a.finally) {
			return false
		}
		found = true
	}
	return found
}

// firstMethodNumberErrorOutput is a detached source terminal, not activation
// permission. Its parent is the genuine pre-record nil binding context and the
// Normal Get's exact branch/F context. Later protocol fields remain untouched.
func (c *languageBindingContext) firstMethodNumberErrorOutput(a languageAlternative) bool {
	if c == nil || c.firstMethod == nil || c.plan == nil || len(c.plan.elements) > 1 || c.elementIndex != 0 || c.completed != nil || a.binding != c || c.parent != nil ||
		a.completion != languageThrow || a.value != (languageValue{text: "TypeError"}) || a.remaining != "" ||
		a.pending != languageNormal || a.pendingValue != (languageValue{}) || a.pendingReturnBoundary != (languageID{}) || a.returnBoundary != (languageID{}) ||
		a.storage != nil || a.callInputs != nil || a.callHistory != nil || c.first != nil || c.step != nil || c.close != nil ||
		c.iterator != (languageValue{}) || c.result != (languageValue{}) || c.next != (languageValue{}) ||
		c.nextReference != (languageReference{}) || c.nextBranch != (languageBranch{}) || c.nextReceipt != nil ||
		c.done || c.doneKnown || c.doneReceipt != nil || c.valueReceipt != nil || c.selected != nil || c.target != (languageCell{}) ||
		c.origin != nil || c.initialization != nil || c.returnGet != nil || c.interrupted != nil || c.routed {
		return false
	}
	return bindingFirstMethodReceipt(a, c.plan.recipe, c.firstMethod)
}

// bindingFirstNumberResult recognizes the one selected pre-record role, not
// authority to adopt a row. The live installed Call is validated separately.
func bindingFirstNumberResult(a languageAlternative, p *storageBindingRecipe, s *bindingCallSite) bool {
	if !bindingFirstRole(p, s) || a.completion != languageNormal {
		return false
	}
	_, known := numericNumberPayload(a.value)
	return known
}

// bindingFirstParentAssociation binds only the common immutable acquisition,
// raw namespace and checked caller exit. Completion-specific callers preserve
// their Normal-number or completed-Throw laws and live validation before install.
func bindingFirstParentAssociation(h *languageCallHistory, p *storageBindingRecipe, a languageAlternative) bool {
	if a.branch.owner == nil || p == nil || p.recipe == nil || !p.valid(p.recipe) || h == nil || h.entry == nil || h.raw == nil || len(h.raw.alternatives) != 1 || h.outward != a.branch || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next || h.entry.inputs == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 {
		return false
	}
	e, in := h.entry, h.entry.inputs
	parent := e.acquisition.alternatives[0]
	raw := h.raw.alternatives[0]
	if a.remaining != "" || a.pending != languageNormal || a.pendingValue != (languageValue{}) || a.pendingReturnBoundary != (languageID{}) || a.returnBoundary != (languageID{}) || h.raw.input != e.activation || raw.branch.state != a.branch.state || raw.branch.env != e.activation.env || a.branch.env != e.caller || raw.branch.cursor == ^uint64(0) || raw.branch.cursor+1 != a.branch.cursor {
		return false
	}
	if e.proof == nil || e.callable == nil || e.callable.proof != e.proof || e.proof.entry == nil || e.proof.source == nil || e.proof.source.AsNode() != p.recipe.body || e.proof.namespace != a.branch.owner || e.proof.generation != a.branch.generation || e.boundary.owner != a.branch.owner || e.boundary.serial == 0 || e.boundary.serial > a.branch.owner.next || e.caller == nil || e.activation.env == nil || !callBodySnapshot(e, raw) || !sameLanguageCallInputs(raw.callInputs, in) || raw.callInputs.bindingSite != &p.first || raw.callInputs.targetOrigin != in.targetOrigin || e.proof.entry.body != e.proof.arrow || h.raw.occurrence.owner != a.branch.owner || h.raw.occurrence.serial == 0 || h.raw.occurrence.serial > a.branch.owner.next || e.acquisition.occurrence.owner != a.branch.owner || e.acquisition.occurrence.serial == 0 || e.acquisition.occurrence.serial > a.branch.owner.next {
		return false
	}
	if in.bindingSite != &p.first || in.call != p.declaration || in.category != callReferenceTarget || in.valueOrigin != nil || !in.complete || !in.calleeReady || in.callee.callable != e.callable || in.targetOrigin == nil || len(in.arguments) != 0 || parent.completion != languageNormal || parent.returnBoundary != (languageID{}) || parent.binding != nil || parent.callInputs != in || parent.branch != in.calleeBranch || parent.branch.env != e.caller || parent.branch.owner != a.branch.owner || parent.branch.guard != a.branch.guard || parent.branch.generation != a.branch.generation || parent.branch.state != e.activation.state || parent.branch.cursor == ^uint64(0) || e.activation.cursor != parent.branch.cursor+1 || e.activation.owner != a.branch.owner || e.activation.guard != a.branch.guard || e.activation.generation != a.branch.generation || raw.branch.guard != a.branch.guard || raw.branch.generation != a.branch.generation || !sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	t := in.targetOrigin
	if !(t.getterInstall == nil && t.recipe == p.recipe && t.referencePC == p.first.member && t.getPC == p.first.get && t.acquirePC == p.first.acquire && t.reference == in.reference && t.value == in.callee && t.output == in.calleeBranch && t.input.owner == a.branch.owner && t.input.guard == a.branch.guard && t.input.generation == a.branch.generation && t.input.env == e.caller && in.reference.id.owner == a.branch.owner && in.reference.id.serial != 0 && in.reference.id.serial <= a.branch.owner.next && in.reference.cell == (languageCell{}) && in.reference.receiver == in.receiver && in.receiver.object != nil && in.receiver.object.id.owner == a.branch.owner && in.reference.key == languageIteratorKey()) {
		return false
	}
	if p.elementNode(0) != nil {
		// The Call already checked scope exit. This genuine entry's source
		// lexicals identify the still-uninitialized caller binding, not a formal.
		for i := range p.elements {
			if _, ok := bindingUninitializedTarget(&p.elements[i], a.branch, in.lexicals); !ok {
				return false
			}
		}
		return true
	}
	return true
}

// firstTerminalAssociation authenticates an installed pre-record first outcome.
// c.target stays zero even for ONE. Its genuine entry proves the source cell,
// without borrowing Next/Done or Initialize/Park authority.
// It does not classify a result or grant live Call/receipt authority.
func (c *languageBindingContext) firstTerminalAssociation(a languageAlternative) bool {
	if c != nil && c.initialization != nil {
		return false
	}
	if c == nil || c.completed != nil || c.elementIndex != 0 || c.parent != nil || a.binding != c || a.remaining != "" || a.pending != languageNormal || a.pendingValue != (languageValue{}) || a.pendingReturnBoundary != (languageID{}) || a.completion != languageThrow || a.returnBoundary != (languageID{}) || a.storage != nil || a.callInputs != nil || a.callHistory != c.first || c.iterator != (languageValue{}) || c.result != (languageValue{}) || c.next != (languageValue{}) || c.nextReference != (languageReference{}) || c.nextBranch != (languageBranch{}) || c.nextReceipt != nil || c.step != nil || c.done || c.doneKnown || c.doneReceipt != nil || c.valueReceipt != nil || c.selected != nil || c.target != (languageCell{}) || c.origin != nil || c.returnGet != nil || c.close != nil || c.interrupted != nil || c.routed {
		return false
	}
	return bindingFirstParentAssociation(c.first, c.plan, a)
}

// firstNumberErrorOutput keeps the converted Normal/raw Return/numeric law.
func (c *languageBindingContext) firstNumberErrorOutput(a languageAlternative) bool {
	return c.firstTerminalAssociation(a) && a.value == (languageValue{text: "TypeError"}) && bindingNormalNumberChild(c.first, a.branch)
}

// firstThrowOutput inspects the installed genuine Throw after live validation.
// F receipt routing is not replayed after disposal. Raw history and its issued
// routed snapshot remain the source, while outward value/state stay unchanged.
func (c *languageBindingContext) firstThrowOutput(a languageAlternative) bool {
	if !c.firstTerminalAssociation(a) || c.first.converted || c.first.completion != languageThrow || a.value != c.first.value {
		return false
	}
	h := c.first
	raw, recipe := h.raw.alternatives[0], h.entry.proof.entry
	return raw.completion == languageThrow && raw.value == h.value && raw.returnBoundary == (languageID{}) && recipe.finally != nil && recipe.finally.valid(recipe) && raw.storage.pc == recipe.finally.route+1 && len(raw.storage.choices) == 0 && raw.storage.copy == nil && raw.finally != nil && raw.finally.routed && raw.finally.origin != nil && raw.finally.finalizer != nil && sameLanguageFinallyContext(raw.storage.finally, raw.finally)
}

// Only completed child histories are installed. The caller supplies the exact
// converted row before clearing child active storage or resuming parent buffers.
func bindingAdoptChild(a languageAlternative, plan *storageBindingRecipe, s *bindingCallSite, parents ...languageAlternative) (languageAlternative, bool) {
	if plan == nil || a.callHistory == nil || s == nil || s.plan != plan {
		return a, false
	}
	throwingClose := bindingCloseRole(plan, s) && a.completion == languageThrow
	throwingNext := bindingStepDescriptor(plan, s) != nil && a.completion == languageThrow
	throwingFirst := bindingFirstRole(plan, s) && a.completion == languageThrow
	numberNext := bindingNextNumberResult(a, plan, s)
	numberFirst := bindingFirstNumberResult(a, plan, s)
	normalClose := bindingCloseRole(plan, s) && a.completion == languageNormal
	var nextTarget languageCell
	if throwingNext || numberNext {
		var ok bool
		nextTarget, ok = bindingNextThrowTarget(plan, a)
		if !ok {
			return a, false
		}
	}
	if throwingClose || throwingNext || throwingFirst {
		if !a.callHistory.validCompletion(a) || a.callHistory.entry.inputs.bindingSite != s {
			return a, false
		}
	} else if !a.callHistory.validResult(a) || a.callHistory.entry.inputs.bindingSite != s || a.value.object == nil && !numberNext && !numberFirst && !normalClose {
		return a, false
	}
	// Authenticate the child above, then restore only the parent's active
	// family owners. Current state/cursor and child history remain the output.
	if len(parents) > 1 {
		return a, false
	}
	// The selected pre-record failure has no installed binding parent. Check
	// the actual loop row against the sealed acquisition before allocation.
	if numberFirst || throwingFirst {
		if len(parents) != 1 || parents[0].binding != nil || a.binding != nil || a.callInputs == nil || a.callInputs.bindingSite != s || a.callInputs.targetOrigin != a.callHistory.entry.inputs.targetOrigin || parents[0].callInputs == nil || parents[0].callInputs.bindingSite != s || parents[0].callInputs.targetOrigin != a.callHistory.entry.inputs.targetOrigin || a.callHistory.entry.acquisition == nil || len(a.callHistory.entry.acquisition.alternatives) != 1 {
			return a, false
		}
		sealed := a.callHistory.entry.acquisition.alternatives[0]
		view := a
		view.finally = parents[0].finally
		if sealed.binding != parents[0].binding || sealed.branch != parents[0].branch || sealed.completion != parents[0].completion || sealed.value != parents[0].value || !sameLanguageCallInputs(parents[0].callInputs, a.callHistory.entry.inputs) || !sameLanguageFinallyContext(parents[0].finally, sealed.finally) || !sameLanguageFinallyContext(a.finally, a.callHistory.raw.alternatives[0].finally) || !bindingFirstParentAssociation(a.callHistory, plan, view) || numberFirst && !bindingNormalNumberChild(a.callHistory, a.branch) {
			return a, false
		}
	}
	parentBinding, parentFinally := a.binding, a.finally
	if len(parents) == 1 {
		parentBinding, parentFinally = parents[0].binding, parents[0].finally
	}
	c := languageBindingContext{plan: plan, parent: parentBinding}
	if parentBinding != nil && parentBinding.plan == plan {
		c = *parentBinding
	}
	if s.role == 0 {
		c.first = a.callHistory
		if throwingFirst {
			// Preserve the actual Throw. No iterator result was produced.
		} else if numberFirst {
			// There is no IteratorRecord and no Done state to update.
			a.completion, a.value = languageThrow, languageValue{text: "TypeError"}
		} else {
			c.iterator = a.value
		}
	} else if bindingStepDescriptor(plan, s) != nil {
		if c.first == nil || c.nextReceipt == nil || c.step != nil || c.currentElement() != bindingStepDescriptor(plan, s) || !bindingCompletedParent(c, a, parentFinally, c.elementIndex) || a.callHistory.entry.inputs.callee != c.next || a.callHistory.entry.inputs.reference != c.nextReference || a.callHistory.entry.inputs.receiver != c.iterator {
			return a, false
		}
		c.step = a.callHistory
		if throwingNext {
			c.done, c.target = true, nextTarget
		} else {
			c.result = a.value
			if numberNext {
				c.done, c.target = true, nextTarget
				a.completion, a.value = languageThrow, languageValue{text: "TypeError"}
			}
		}
	} else {
		if c.origin == nil || c.first == nil || c.close != nil || c.routed {
			return a, false
		}
		if throwingClose && (c.done || c.nextReceipt == nil || c.interrupted != nil || len(c.origin.alternatives) != 1) {
			return a, false
		}
		c.close = a.callHistory
		if normalClose || throwingClose && plan.elementNode(0) != nil {
			// Validate the installed parent/target association while the actual
			// child header still belongs to the live Call handoff. This local
			// view grants no clearing or publication before validation succeeds.
			view := a
			view.binding = &c
			view.finally = parentFinally
			view.storage = nil
			view.callInputs = nil
			if normalClose && !c.closeNormalAssociation(view) || throwingClose && !c.closeThrowOutput(view) {
				return a, false
			}
		}
	}
	a.binding, a.finally = &c, parentFinally
	return a, true
}

// bindingNextThrowTarget authenticates the actual source lexical cell. An
// absent storage write means this issued cell is still uninitialized, never
// an implicitly initialized undefined. Formal cells belong to another env.
func bindingNextThrowTarget(p *storageBindingRecipe, a languageAlternative, expected ...languageCell) (languageCell, bool) {
	if p == nil || a.callInputs == nil || bindingStepDescriptor(p, a.callInputs.bindingSite) == nil {
		return languageCell{}, false
	}
	return bindingUninitializedTarget(bindingStepDescriptor(p, a.callInputs.bindingSite), a.branch, a.callInputs.lexicals, expected...)
}

// bindingSourceTarget owns the complete source declaration/slot/cell/env
// mapping shared by pre-initialization and initialized binding consumers.
// It is metadata only and never creates a cell or grants a protocol role.
func bindingSourceTarget(d *bindingElementRecipe, branch languageBranch, lexicals []languageLexical, expected ...languageCell) (languageCell, bool) {
	if d == nil || d.plan == nil || d.node == nil || d.plan.elementAt(d.index) != d || !d.plan.valid(d.plan.recipe) || branch.env == nil || branch.state == nil || len(expected) > 1 {
		return languageCell{}, false
	}
	initialize := d.plan.recipe.events[d.initialize]
	slot := initialize.cell
	if initialize.kind != "InitializeCell" || initialize.node != d.node || initialize.a != bindingInitializeInput(d) || slot < 0 || slot >= len(lexicals) || lexicals[slot].declaration != d.node {
		return languageCell{}, false
	}
	target := lexicals[slot].cell
	found := false
	for _, lexical := range lexicals {
		if lexical.declaration != d.node {
			continue
		}
		if found || lexical.cell != target {
			return languageCell{}, false
		}
		found = true
	}
	if !found || target.id.owner != branch.owner || target.id.serial == 0 || target.environment != branch.env.id || len(expected) == 1 && expected[0] != target {
		return languageCell{}, false
	}
	return target, true
}

func bindingUninitializedTarget(d *bindingElementRecipe, branch languageBranch, lexicals []languageLexical, expected ...languageCell) (languageCell, bool) {
	target, ok := bindingSourceTarget(d, branch, lexicals, expected...)
	if !ok {
		return languageCell{}, false
	}
	for state := branch.state.storage; state != nil; state = state.previous {
		if state.cell == target {
			return target, !state.initialized
		}
	}
	return target, true
}

// bindingNextNumberResult is intentionally a Number-only protocol refinement.
// Missing or contradictory payloads never become errors merely because object=nil.
func bindingNextNumberResult(a languageAlternative, p *storageBindingRecipe, site *bindingCallSite) bool {
	if p == nil || bindingStepDescriptor(p, site) == nil || a.completion != languageNormal {
		return false
	}
	_, known := numericNumberPayload(a.value)
	return known
}

// nextTerminalAssociation shares the exact completed-Next lineage and target
// guards. Call Throw and binding-owned result TypeError retain distinct producers.
// This inspects installed history, never renews a disposed Call capability.
func (c *languageBindingContext) nextTerminalAssociation(a languageAlternative) bool {
	if c == nil || c.plan == nil || c.elementNode() == nil || !c.plan.valid(c.plan.recipe) || c.first == nil || c.nextReceipt == nil || c.step == nil || c.step.entry == nil || c.step.entry.inputs == nil || c.step.entry.acquisition == nil || len(c.step.entry.acquisition.alternatives) != 1 || c.step.raw == nil || len(c.step.raw.alternatives) != 1 || a.completion != languageThrow || a.returnBoundary != (languageID{}) || a.callHistory != c.step || a.branch != c.step.outward || !c.done || c.doneKnown || c.doneReceipt != nil || c.valueReceipt != nil || c.selected != nil || c.origin != nil || c.initialization != nil || c.interrupted != nil || c.close != nil || c.routed || a.storage != nil || a.callInputs != nil {
		return false
	}
	in := c.step.entry.inputs
	parent := c.step.entry.acquisition.alternatives[0]
	prior := parent.binding
	if in.bindingSite != c.elementStep() || in.call != c.plan.declaration || len(in.arguments) != 0 || in.callee != c.next || in.reference != c.nextReference || in.receiver != c.iterator || in.calleeBranch != c.nextBranch || prior == nil || prior.plan != c.plan || prior.step != nil || prior.first != c.first || prior.nextReceipt != c.nextReceipt || prior.parent != c.parent || prior.initialization != c.initialization || prior.elementIndex != c.elementIndex || prior.completed != c.completed || prior.origin != nil || prior.done || !sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	header := a
	header.callInputs = in
	target, ok := bindingNextThrowTarget(c.plan, header, c.target)
	return ok && target == c.target
}

// NextThrow comes from the actual completed child, with no result conversion.
func (c *languageBindingContext) nextThrowOutput(a languageAlternative) bool {
	return c.nextTerminalAssociation(a) && !c.step.converted && c.step.completion == languageThrow && a.value == c.step.value && c.result == (languageValue{})
}

// nextNumberErrorOutput belongs to binding, while its child stays Normal and its
// raw producer stays Return. No general Error object or other primitive is issued.
func (c *languageBindingContext) nextNumberErrorOutput(a languageAlternative) bool {
	if !c.nextTerminalAssociation(a) || !c.step.converted || c.step.completion != languageNormal || c.result != c.step.value || a.value != (languageValue{text: "TypeError"}) {
		return false
	}
	return bindingNormalNumberChild(c.step, a.branch)
}

// bindingNormalNumberChild validates only the common immutable Normal-number
// history suffix. Callers retain distinct Next/Close role and publication laws.
func bindingNormalNumberChild(h *languageCallHistory, outward languageBranch) bool {
	if h == nil || h.entry == nil || h.raw == nil || len(h.raw.alternatives) != 1 || !h.converted || h.completion != languageNormal || h.outward != outward {
		return false
	}
	raw, entry := h.raw.alternatives[0], h.entry
	_, known := numericNumberPayload(h.value)
	return known && raw.completion == languageReturn && raw.value == h.value && raw.returnBoundary == entry.boundary && h.raw.input == entry.activation && raw.branch.state == outward.state && raw.branch.env == entry.activation.env && outward.env == entry.caller && raw.branch.cursor != ^uint64(0) && raw.branch.cursor+1 == outward.cursor
}

// closeParentAssociation consumes installed, live-authenticated completion facts.
// It proves the Close parent/role independently of the result-kind query, so an
// incoming Throw can win after required work without numeric admission first.
func (c *languageBindingContext) closeParentAssociation(a languageAlternative) bool {
	if c == nil || c.plan == nil || !c.plan.valid(c.plan.recipe) || c.close == nil || c.close.entry == nil || c.close.entry.inputs == nil || c.close.entry.acquisition == nil || len(c.close.entry.acquisition.alternatives) != 1 || c.close.raw == nil || len(c.close.raw.alternatives) != 1 || c.origin == nil || len(c.origin.alternatives) != 1 || c.first == nil || c.iterator.object == nil || c.nextReceipt == nil || c.done || c.interrupted != nil || a.callHistory != c.close || a.branch != c.close.outward || a.returnBoundary != (languageID{}) || a.callInputs != nil || a.storage != nil {
		return false
	}
	h := c.close
	in := h.entry.inputs
	parent := h.entry.acquisition.alternatives[0]
	prior := parent.binding
	pending := c.origin.alternatives[0]
	return bindingCloseRole(c.plan, in.bindingSite) && in.call == c.plan.declaration && len(in.arguments) == 0 && in.receiver == c.iterator && in.reference.receiver == c.iterator && prior != nil && prior.plan == c.plan && prior.first == c.first && prior.iterator == c.iterator && prior.nextReceipt == c.nextReceipt && prior.elementIndex == c.elementIndex && prior.completed == c.completed && prior.origin == c.origin && prior.parent == c.parent && prior.close == nil && !prior.routed && c.origin.input == pending.branch && pending.branch.owner == a.branch.owner && pending.branch.guard == a.branch.guard && pending.branch.generation == a.branch.generation && pending.branch.env == a.branch.env && sameLanguageFinallyContext(a.finally, parent.finally)
}

func (c *languageBindingContext) closeNormalParentAssociation(a languageAlternative) bool {
	if !c.closeParentAssociation(a) || !c.close.converted || c.close.completion != languageNormal {
		return false
	}
	raw := c.close.raw.alternatives[0]
	return raw.completion == languageReturn && raw.returnBoundary == c.close.entry.boundary && raw.value == c.close.value
}

// bindingInitializedRecord is the current-value scan owned by Park. Role
// callers separately authenticate the source cell mapping and selected receipt.
func bindingInitializedRecord(b languageBranch, target languageCell, value languageValue) *languageStorage {
	if b.state == nil {
		return nil
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == target {
			if row.initialized && row.value == value {
				return row
			}
			return nil
		}
	}
	return nil
}

func (c *languageBindingContext) closeNormalAssociation(a languageAlternative) bool {
	if !c.closeNormalParentAssociation(a) {
		return false
	}
	if c.elementNode() == nil {
		return !c.doneKnown && c.step == nil && c.doneReceipt == nil && c.valueReceipt == nil && c.selected == nil && c.target == (languageCell{})
	}
	return bindingCloseTarget(c, a)
}

// closeInitializedTarget retains the actual Close child and acquired parent.
// The shared target core does not supply or replace that Call authority.
func (c *languageBindingContext) closeInitializedTarget(a languageAlternative) bool {
	if c == nil || c.close == nil || c.close.entry == nil || c.close.entry.inputs == nil || c.close.entry.caller == nil || c.close.entry.acquisition == nil || len(c.close.entry.acquisition.alternatives) != 1 {
		return false
	}
	parent := c.close.entry.acquisition.alternatives[0].binding
	if parent == nil || parent.step != c.step || parent.result != c.result || parent.doneKnown != c.doneKnown || parent.doneReceipt != c.doneReceipt || parent.valueReceipt != c.valueReceipt || parent.selected != c.selected || parent.initialization != c.initialization || parent.elementIndex != c.elementIndex || parent.completed != c.completed || parent.target != c.target {
		return false
	}
	return bindingInitializedTarget(c, a, c.close.entry.inputs.lexicals, c.close.entry.caller)
}

// bindingInitializedTarget owns source-slot/cell/environment and the exact
// selected -> Initialize -> Park -> current record relation. Call and absence
// wrappers independently authenticate the entry lending lexicals and caller.
func bindingInitializedTarget(c *languageBindingContext, a languageAlternative, lexicals []languageLexical, caller *languageEnvironment) bool {
	if c != nil && c.completed != nil {
		if caller == nil || a.branch.env != caller || c.origin == nil || len(c.origin.alternatives) != 1 || c.origin.alternatives[0].binding == nil || c.origin.alternatives[0].binding.completed != c.completed || c.elementIndex != len(c.plan.elements)-1 || !completedElements(c, a, len(c.plan.elements)) {
			return false
		}
		for n := c.completed; n != nil; n = n.previous {
			if _, ok := bindingSourceTarget(n.descriptor, a.branch, lexicals, n.target); !ok {
				return false
			}
		}
		return c.target == c.completed.target
	}

	if c != nil && c.initialization != nil {
		if caller == nil || a.branch.env != caller || !c.normalDefaultInitialized(a) {
			return false
		}
		_, ok := bindingSourceTarget(c.currentElement(), a.branch, lexicals, c.target)
		return ok
	}
	if c == nil || c.plan == nil || c.elementNode() == nil || caller == nil || c.origin == nil || len(c.origin.alternatives) != 1 || c.step == nil || !c.step.converted || c.step.completion != languageNormal || c.result.object == nil || c.step.value != c.result || !c.doneKnown || c.done || c.doneReceipt == nil || len(c.doneReceipt.alternatives) != 1 || c.doneReceipt.alternatives[0].completion != languageNormal || c.valueReceipt == nil || c.selected != c.valueReceipt || len(c.selected.alternatives) != 1 || c.selected.alternatives[0].completion != languageNormal {
		return false
	}
	if a.branch.env != caller {
		return false
	}
	if _, ok := bindingSourceTarget(c.currentElement(), a.branch, lexicals, c.target); !ok {
		return false
	}
	selected, pending := c.selected.alternatives[0], c.origin.alternatives[0]
	if selected.branch.owner != pending.branch.owner || selected.branch.guard != pending.branch.guard || selected.branch.generation != pending.branch.generation || selected.branch.env != pending.branch.env || pending.branch.env != a.branch.env {
		return false
	}
	originRecord := bindingInitializedRecord(pending.branch, c.target, selected.value)
	currentRecord := bindingInitializedRecord(a.branch, c.target, selected.value)
	return originRecord != nil && currentRecord == originRecord && pending.branch.state.storage == originRecord && selected.branch.state != nil && originRecord.previous == selected.branch.state.storage
}

func (c *languageBindingContext) closeNumberErrorOutput(a languageAlternative) bool {
	return c.closeNormalAssociation(a) && c.routed && a.completion == languageThrow && a.value == (languageValue{text: "TypeError"}) && c.origin.alternatives[0].completion == languageNormal && c.origin.alternatives[0].value == (languageValue{}) && bindingNormalNumberChild(c.close, a.branch)
}

// closeThrowOutput is the installed immutable child association, not a fresh
// Call capability. It is safe for detached historical completion inspection.
func (c *languageBindingContext) closeThrowOutput(a languageAlternative) bool {
	if c == nil || c.plan == nil || c.close == nil || c.close.entry == nil || c.close.entry.inputs == nil || c.close.raw == nil || len(c.close.raw.alternatives) != 1 || c.origin == nil || len(c.origin.alternatives) != 1 || c.first == nil || c.iterator.object == nil || c.nextReceipt == nil || c.done || c.interrupted != nil || a.completion != languageThrow || a.returnBoundary != (languageID{}) || a.callHistory != c.close || c.close.converted || c.close.completion != languageThrow || c.close.value != a.value || c.close.outward != a.branch {
		return false
	}
	p, h := c.plan, c.close
	if !bindingCloseRole(p, h.entry.inputs.bindingSite) {
		return false
	}
	if p.elementNode(0) != nil {
		if !c.closeParentAssociation(a) || !bindingCloseTarget(c, a) {
			return false
		}
		raw, entry := h.raw.alternatives[0], h.entry
		return raw.completion == languageThrow && raw.returnBoundary == (languageID{}) && raw.value == h.value && h.raw.input == entry.activation && raw.branch.state == a.branch.state && raw.branch.env == entry.activation.env && a.branch.env == entry.caller && raw.branch.cursor != ^uint64(0) && raw.branch.cursor+1 == a.branch.cursor && c.origin.alternatives[0].returnBoundary == (languageID{}) && (c.origin.alternatives[0].completion == languageThrow || c.origin.alternatives[0].completion == languageNormal && c.origin.alternatives[0].value == (languageValue{}))
	}
	pending := c.origin.alternatives[0]
	return h.entry.inputs.bindingSite == &p.close && h.entry.inputs.call == p.declaration && h.entry.inputs.receiver == c.iterator && c.origin.input == pending.branch && c.origin.input.owner == a.branch.owner && c.origin.input.guard == a.branch.guard && c.origin.input.generation == a.branch.generation && pending.branch.env == a.branch.env && pending.returnBoundary == (languageID{}) && sameLanguageFinallyContext(a.finally, pending.finally) && (pending.completion == languageThrow || pending.completion == languageNormal && pending.value == (languageValue{}))
}

// Only this exact H route can borrow non-Normal dispatch. The common consumer
// validated the live header before installation. Never rebuild it or normalize
// again here, and never treat this predicate as authority to execute a Call.
func bindingCloseThrowRouteReady(r *storageRecipe, pc int, a languageAlternative) bool {
	c := a.binding
	if r == nil || r.binding == nil || c == nil || c.plan != r.binding || c.plan.recipe != r || !c.plan.valid(r) || pc != c.plan.route || pc < 0 || pc >= len(r.events) || r.events[pc].kind != "RouteIteratorClose" || c.routed || a.storage != nil || a.callInputs != nil || a.branch.owner == nil || !a.branch.owner.live(a.branch) || !c.closeThrowOutput(a) {
		return false
	}
	return a.branch.owner.live(c.origin.input)
}

// Binding completion has its own selected-row authority. B2's object result
// certificate never authorizes the parent's Normal-unused result.
func (c *languageBindingContext) complete(a languageAlternative) bool {
	if c != nil && c.firstGetterThrowOutput(a) {
		return true
	}
	if c != nil && c.firstMethod != nil {
		return c.firstMethodNumberErrorOutput(a)
	}
	if c == nil || c.plan == nil {
		return false
	}
	if c != nil && c.plan != nil && len(c.plan.elements) > 0 && c.origin != nil && len(c.origin.alternatives) == 1 && c.origin.alternatives[0].completion == languageNormal {
		if c.completed == nil || c.elementIndex != len(c.plan.elements)-1 || c.origin.alternatives[0].binding == nil || c.origin.alternatives[0].binding.completed != c.completed {
			return false
		}
	}

	if c != nil && c.completed != nil {
		count := c.elementIndex
		if c.completed.descriptor == c.currentElement() {
			count++
		}
		if c.origin != nil {
			count = len(c.plan.elements)
		}
		if !completedElements(c, a, count) {
			return false
		}
	}

	// A new Normal-default result must retain its actual initialization
	// witness. Existing abrupt defaults and all nondefault roles stay distinct.
	if c != nil && c.initialization != nil && !c.normalDefaultInitialized(a) {
		return false
	}
	if c != nil && c.plan != nil && c.elementNode() != nil && c.plan.valid(c.plan.recipe) && c.elementNode().Initializer() != nil && c.origin != nil && len(c.origin.alternatives) == 1 && c.origin.alternatives[0].completion == languageNormal && c.initialization == nil {
		return false
	}
	if c != nil && c.defaultWinner(a) {
		return true
	}
	if c != nil && c.closeGetterThrowOutput(a) {
		return true
	}
	if a.completion == languageThrow {
		if c != nil && (c.firstNumberErrorOutput(a) || c.firstThrowOutput(a)) {
			return true
		}
		if c != nil && c.returnGet != nil {
			return c.returnGetNumberErrorOutput(a)
		}
		if c != nil && c.plan != nil && c.elementNode() != nil {
			return c.nextThrowOutput(a) || c.nextNumberErrorOutput(a) || c.getThrowOutput(a) || c.closeNumberErrorOutput(a) || c.routed && c.closeThrowOutput(a) && c.origin.alternatives[0].completion == languageNormal && c.origin.alternatives[0].value == (languageValue{})
		}
		// Constructor pending Throw can route but does not grant authored
		// publication. The source adapter only parks Normal-unused here.
		return c != nil && (c.closeNumberErrorOutput(a) || c.routed && c.closeThrowOutput(a) && c.origin.alternatives[0].completion == languageNormal && c.origin.alternatives[0].value == (languageValue{}) && a.storage == nil && a.callInputs == nil)
	}
	if c != nil && c.returnGet != nil {
		return c.absentReturnOutput(a)
	}
	if c == nil || c.plan == nil || !c.routed || c.origin == nil || len(c.origin.alternatives) != 1 || c.first == nil || c.iterator.object == nil || a.completion != languageNormal || a.value != (languageValue{}) || a.returnBoundary != (languageID{}) || c.origin.alternatives[0].completion != languageNormal || c.origin.alternatives[0].value != (languageValue{}) || a.branch.owner != c.origin.input.owner || a.branch.guard != c.origin.input.guard {
		return false
	}
	if c.elementNode() == nil {
		return c.close != nil && !c.done && a.branch == c.close.outward
	}
	if c.interrupted != nil || c.step == nil && (c.completed == nil || c.completed.sticky == nil) || !c.doneKnown || c.doneReceipt == nil || c.selected == nil || c.target.id.owner != a.branch.owner {
		return false
	}
	if c.done {
		return c.close == nil && c.valueReceipt == nil && a.branch == c.origin.input && a.callHistory == c.origin.alternatives[0].callHistory
	}
	return c.valueReceipt != nil && c.close != nil && a.branch == c.close.outward
}

// Artifact fees reserve only new immutable binding records/receipts. Current
// history/vector copies remain under the existing per-event overlap allowance.
func eBindingFee(kind string) int {
	switch kind {
	case "AcquireCallCallee":
		return 8
	case "InvokeAcquiredCall":
		return 4
	case "InstallIteratorRecord", "SelectIteratorDone", "SelectBindingValue", "ParkBindingCompletion", "RouteIteratorClose":
		return 8
	}
	return 0
}

var emptyBindingObserve func(*storageRecipe, int, languageAlternative, int)

// Pure record/pending adapters retain the current full row once. Unlike ordinary
// expression steps, they perform no sequence adoption and no repeated history
// merges. Their actual receipt/vector allocation is paid at this owning seam.
func bindingFamilyEvent(kind string) bool {
	return kind == "InstallIteratorRecord" || kind == "SelectIteratorDone" || kind == "SelectBindingValue" || kind == "ParkBindingCompletion" || kind == "RouteIteratorClose"
}
func bindingArtifactCharge(kind string, a languageAlternative, limit int, positions ...int) (int, bool) {
	pc := -1
	if len(positions) == 1 {
		pc = positions[0]
	}
	fee := eBindingFee(kind)
	if !bindingFamilyEvent(kind) {
		return budgetSum(limit, fee)
	}
	if a.completion != languageNormal {
		if a.binding == nil || a.binding.plan == nil || !(kind == "ParkBindingCompletion" && bindingDefaultParkReady(a.binding.plan.recipe, pc, a) || kind == "RouteIteratorClose" && (bindingCloseThrowRouteReady(a.binding.plan.recipe, pc, a) || bindingDefaultGetterRoute(a.binding.plan.recipe, pc, a))) {
			return 0, false
		}
	}
	if a.storage != nil || a.callInputs != nil && !bindingStagedRecord(kind, a, pc) {
		return 0, false
	}
	estimate, ok := bindingReceiptCopyCharge(a)
	if !ok {
		return 0, false
	}
	return budgetSum(limit, max(fee, estimate))
}

// bindingReceiptCopyCharge owns the existing checked H context/receipt and
// actual vector-copy layout. Event guards and their fixed fees stay with callers.
func bindingReceiptCopyCharge(a languageAlternative) (int, bool) {
	payload, ok := budgetProduct(int(^uint(0)>>1), len(a.objects), int(unsafe.Sizeof(storageObjectObservation{})))
	if !ok {
		return 0, false
	}
	n, nok := budgetSum(int(^uint(0)>>1), len(a.effects), len(a.obligations))
	if !nok {
		return 0, false
	}
	vectors, vok := budgetProduct(int(^uint(0)>>1), n, 32)
	if !vok {
		return 0, false
	}
	bytes, ok := budgetSum(int(^uint(0)>>1), int(unsafe.Sizeof(languageBindingContext{})), 2*int(unsafe.Sizeof(languageAlternative{})), int(unsafe.Sizeof(languageReceipt{})), payload, vectors, 255)
	if !ok {
		return 0, false
	}
	return bytes / 256, true
}

// Both family gates use this exact exception. The header is merely acquired,
// not finalized or callable-checked, and belongs to this record installation.
func bindingStagedRecord(kind string, a languageAlternative, pc int) bool {
	c, in := a.binding, a.callInputs
	if kind != "InstallIteratorRecord" || c == nil || c.plan == nil || c.elementNode() == nil || c.first == nil || c.nextReceipt != nil || in == nil || in.complete || !in.calleeReady || len(in.arguments) != 0 || in.bindingSite != c.elementStep() || in.call != c.plan.declaration || in.receiver != c.iterator || in.category != callReferenceTarget || in.targetOrigin == nil {
		return false
	}
	p, t := c.plan, in.targetOrigin
	if pc != p.record {
		return false
	}
	return p.valid(p.recipe) && t.recipe == p.recipe && t.referencePC == p.elementLabels(0).step.member && t.getPC == p.next && t.acquirePC == p.elementLabels(0).step.acquire && t.value == in.callee && t.reference == in.reference && t.output == a.branch && in.calleeBranch == a.branch && validCallTarget(a.branch.owner, in)
}

// Unsupported outcomes retain the actual row before the residual wrapper. This
// does not grant a completed-abrupt Call certificate or set iterator Done.
func (o *languageOwner) bindingResidual(a languageAlternative, reason string, plans ...*storageBindingRecipe) languageAlternative {
	// Retention itself cannot issue beyond the actual identity capacity. The
	// existing pending fields carry the actual outcome if no receipt can be born.
	if !o.canAdvance(a.branch, 1) {
		if a.completion != languageResidual {
			a.pending, a.pendingValue, a.pendingReturnBoundary = a.completion, a.value, a.returnBoundary
		}
		return callEntryRefusal(a, "Binding retention identity capacity")
	}
	c := a.binding
	if c == nil && len(plans) == 1 && plans[0] != nil {
		c = &languageBindingContext{plan: plans[0]}
	}
	if c != nil && c.plan != nil && c.interrupted == nil {
		copy := *c
		copy.interrupted = o.receipt(a.branch, []languageAlternative{a})
		a.binding = &copy
	}
	return callEntryRefusal(a, reason)
}

func (o *languageOwner) bindingFamilyStep(a languageAlternative, r *storageRecipe, pc int, values []languageValue, refs []languageReference, ready []bool, liveCells ...[]languageCell) (languageAlternative, bool) {
	if r == nil {
		return a, false
	}
	p, c := r.binding, a.binding
	if c != nil && c.returnGet != nil && (!o.live(a.branch) || !bindingReturnGetPlan(r, pc)) {
		return a, false
	}
	if c == nil || c.plan != p || !p.valid(r) || a.completion != languageNormal && !bindingCloseThrowRouteReady(r, pc, a) && !bindingDefaultParkReady(r, pc, a) && !bindingDefaultGetterRoute(r, pc, a) || a.storage != nil || pc < 0 || pc >= len(r.events) {
		return a, false
	}
	e := r.events[pc]
	if a.callInputs != nil && !bindingStagedRecord(e.kind, a, pc) {
		return a, false
	}
	copy := *c
	switch e.kind {
	case "InstallIteratorRecord":
		if pc != p.record || c.first == nil || e.a != p.iterator || e.b != p.next || !ready[e.a] || !ready[e.b] || c.iterator != values[e.a] || c.nextReceipt != nil || c.elementNode() != nil && (a.callInputs == nil || a.callInputs.callee != values[e.b] || a.callInputs.reference != refs[r.events[e.b].a]) {
			return a, false
		}
		copy.next, copy.nextBranch, copy.nextReference = values[e.b], a.branch, refs[r.events[e.b].a]
		copy.nextReceipt = o.receipt(a.branch, []languageAlternative{{branch: a.branch, value: copy.next}})
		a.value = languageValue{}
	case "SelectIteratorDone":
		if pc != c.elementLabels().doneSelect || c.elementNode() == nil || c.step == nil || c.doneReceipt != nil || !ready[c.elementLabels().doneGet] || a.value != values[c.elementLabels().doneGet] {
			return a, false
		}
		copy.doneReceipt = nil
		for _, record := range a.objects {
			if record.recipe == r && record.pc == c.elementLabels().doneGet && record.receipt != nil && len(record.receipt.alternatives) == 1 && record.receipt.alternatives[0].branch == a.branch && record.receipt.alternatives[0].completion == languageNormal && record.receipt.alternatives[0].value == a.value {
				copy.doneReceipt = record.receipt
			}
		}
		if copy.doneReceipt == nil {
			copy.doneReceipt = o.receipt(a.branch, []languageAlternative{a})
		}
		copy.done, copy.doneKnown = acquiredBoolean(a.branch, values[c.elementLabels().doneGet])
		a.binding = &copy
		if !copy.doneKnown {
			return o.bindingResidual(a, "Iterator done conversion unavailable"), true
		}
	case "SelectBindingValue":
		if pc != c.elementLabels().selectValue || !c.doneKnown || c.doneReceipt == nil || c.selected != nil {
			return a, false
		}
		if c.done {
			if ready[c.elementLabels().valueGet] || ready[c.elementLabels().valueGet-1] {
				return a, false
			}
			a.value = languageValue{undefined: true}
		} else {
			if !ready[c.elementLabels().valueGet] || a.value != values[c.elementLabels().valueGet] {
				return a, false
			}
			copy.valueReceipt = o.receipt(a.branch, []languageAlternative{a})
		}
		if copy.valueReceipt != nil {
			copy.selected = copy.valueReceipt
		} else {
			copy.selected = o.receipt(a.branch, []languageAlternative{a})
		}
	case "ParkBindingCompletion":
		if a.completion == languageThrow {
			if !bindingDefaultParkReady(r, pc, a) || ready[c.elementLabels().initialize] || ready[bindingInitializeInput(c.currentElement())] {
				return a, false
			}
			cell, ok := bindingUninitializedTarget(c.currentElement(), a.branch, a.callHistory.entry.inputs.lexicals)
			if !ok {
				return a, false
			}
			copy.target = cell
			copy.origin = o.receipt(a.branch, []languageAlternative{a})
			a.completion, a.value, a.returnBoundary = languageNormal, languageValue{}, languageID{}
			a.pending, a.pendingValue, a.pendingReturnBoundary = languageNormal, languageValue{}, languageID{}
			break
		}
		if pc != p.park || c.nextReceipt == nil || c.origin != nil {
			return a, false
		}
		if c.elementNode() != nil {
			if !completedElements(c, a, len(p.elements)) || c.elementIndex != len(p.elements)-1 || c.selected == nil || len(c.selected.alternatives) != 1 || len(liveCells) != 1 || r.events[c.elementLabels().initialize].cell < 0 || r.events[c.elementLabels().initialize].cell >= len(liveCells[0]) {
				return a, false
			}
			copy.target = liveCells[0][r.events[c.elementLabels().initialize].cell]
			if c.elementNode().Initializer() != nil {
				if c.initialization == nil || len(c.initialization.alternatives) != 1 || a.value != c.initialization.alternatives[0].value || !ready[bindingInitializeInput(c.currentElement())] || !ready[c.elementLabels().initialize] || values[bindingInitializeInput(c.currentElement())] != a.value {
					return a, false
				}
				if _, ok := bindingInitializationRecord(c, a, copy.target); !ok {
					return a, false
				}
			} else if c.initialization != nil || a.value != c.selected.alternatives[0].value || bindingInitializedRecord(a.branch, copy.target, a.value) == nil {
				return a, false
			}
		} else if a.value != (languageValue{}) {
			return a, false
		}
		a.value = languageValue{}
		copy.origin = o.receipt(a.branch, []languageAlternative{a})
	case "RouteIteratorClose":
		if bindingDefaultGetterRoute(r, pc, a) {
			pending := c.origin.alternatives[0]
			a.completion, a.value, a.returnBoundary = pending.completion, pending.value, pending.returnBoundary
			a.pending, a.pendingValue, a.pendingReturnBoundary = pending.pending, pending.pendingValue, pending.pendingReturnBoundary
			copy.routed = true
			a.binding = &copy
			return a, true
		}
		if c.returnGet != nil {
			if pc != p.route || c.routed || a.completion != languageNormal || !c.returnGetAssociation(a) || p.close.invoke >= len(ready) || !ready[p.close.get] || ready[p.close.acquire] || ready[p.close.finalize] || ready[p.close.invoke] {
				return a, false
			}
			pending := c.origin.alternatives[0]
			copy.routed = true
			if pending.completion == languageThrow {
				a.completion, a.value, a.returnBoundary = pending.completion, pending.value, pending.returnBoundary
				a.pending, a.pendingValue, a.pendingReturnBoundary = pending.pending, pending.pendingValue, pending.pendingReturnBoundary
				a.binding = &copy
				return a, true
			}
			if bindingReturnGetNumberError(c, c.returnGet.value) {
				// GetMethod failure is captured by IteratorClose. Incoming Throw
				// wins first, including before this finite noncallable error.
				a.completion, a.value, a.returnBoundary = languageThrow, languageValue{text: "TypeError"}, languageID{}
				a.binding = &copy
				return a, true
			}
			a.completion, a.value, a.returnBoundary = pending.completion, pending.value, pending.returnBoundary
			a.pending, a.pendingValue, a.pendingReturnBoundary = pending.pending, pending.pendingValue, pending.pendingReturnBoundary
			a.binding = &copy
			return a, true
		}
		if a.completion == languageThrow {
			if !bindingCloseThrowRouteReady(r, pc, a) {
				return a, false
			}
			pending := c.origin.alternatives[0]
			if pending.completion == languageThrow {
				// Select completion fields only. Current branch/vectors already
				// include child work once. Raw history still describes Throw9.
				a.completion, a.value, a.returnBoundary = pending.completion, pending.value, pending.returnBoundary
				a.pending, a.pendingValue, a.pendingReturnBoundary = pending.pending, pending.pendingValue, pending.pendingReturnBoundary
			}
			copy.routed = true
			a.binding = &copy
			return a, true
		}
		if pc == p.route && c.close != nil {
			if c.routed || !c.closeNormalAssociation(a) || a.value != c.close.value {
				return a, false
			}
			pending := c.origin.alternatives[0]
			// H precedence is deliberate. A genuine completed child is required
			// above, but its numeric result is queried only after incoming Throw.
			if pending.completion == languageThrow {
				a.completion, a.value, a.returnBoundary = pending.completion, pending.value, pending.returnBoundary
				a.pending, a.pendingValue, a.pendingReturnBoundary = pending.pending, pending.pendingValue, pending.pendingReturnBoundary
				copy.routed = true
				a.binding = &copy
				return a, true
			}
			if pending.completion != languageNormal || pending.value != (languageValue{}) {
				return a, false
			}
			if _, known := numericNumberPayload(c.close.value); known {
				a.completion, a.value = languageThrow, languageValue{text: "TypeError"}
				copy.routed = true
				a.binding = &copy
				return a, true
			}
			if c.close.value.object == nil {
				return o.bindingResidual(a, "Close result kind unavailable"), true
			}
		}
		if pc != p.route || c.origin == nil || len(c.origin.alternatives) != 1 || c.routed || c.origin.alternatives[0].completion != languageNormal {
			return a, false
		}
		if c.done {
			if c.elementNode() == nil || !c.doneKnown || c.close != nil || c.valueReceipt != nil || a.branch != c.origin.input || ready[p.close.member] || ready[p.close.invoke] {
				return a, false
			}
		} else if c.close == nil || c.close.outward != a.branch {
			return a, false
		}
		copy.routed = true
		a.value = languageValue{}
	default:
		return a, false
	}
	a.binding = &copy
	return a, true
}

// These forward edges name authenticated protocol phases. They never replay
// Get or adopt a child twice.
func bindingSuccessor(r *storageRecipe, pc int, a languageAlternative) int {
	if r == nil || r.binding == nil {
		return pc + 1
	}
	p := r.binding
	c := a.binding
	if pc == p.close.get && c != nil && c.returnGet != nil && bindingReturnGetPlan(r, pc) && c.returnGetAssociation(a) {
		return p.route
	}
	if c != nil && c.currentElement() != nil && c.doneKnown && c.done {
		d := c.currentElement()
		if pc == d.doneSelect {
			return d.selectValue
		}
		if pc == p.park {
			return p.route
		}
		// Rotation just sealed the previous actual Initialize. No later Call is executed.
		if c.elementIndex > 0 && pc == p.elements[c.elementIndex-1].initialize && completedElements(c, a, c.elementIndex) {
			return d.selectValue
		}
	}
	return pc + 1
}

const bindingCloseGetterRole = 3
const bindingFirstGetterRole = 4

// This pre-record role has no iterator record or parked binding completion.
// The scheduler checks the actual pre-loan header and source register separately.
func bindingFirstGetterContext(r *storageRecipe, pc int, a languageAlternative) bool {
	return r != nil && r.binding != nil && len(r.binding.elements) <= 1 && r.binding.valid(r) && pc == r.binding.first.get && r.symbolCase != nil && a.branch.owner != nil && a.branch.env != nil && a.completion == languageNormal && a.remaining == "" && a.binding == nil && a.callHistory == nil && a.returnBoundary == (languageID{}) && a.pending == languageNormal && a.pendingValue == (languageValue{}) && a.pendingReturnBoundary == (languageID{})
}

// bindingGetterRole is a finite source role, never permission for arbitrary
// declaration-shaped Get. The real binding plan owns each implicit read site.
func bindingGetterRole(r *storageRecipe, pc int) int {
	if r == nil || r.binding == nil {
		return 0
	}
	if len(r.binding.elements) <= 1 && r.binding.valid(r) && pc == r.binding.first.get {
		return bindingFirstGetterRole
	}
	if pc == r.binding.close.get && bindingReturnGetPlan(r, pc) {
		return bindingCloseGetterRole
	}
	if r.binding.elementNode(0) == nil || !r.binding.valid(r) {
		return 0
	}
	if d := r.binding.elementAtPC(pc); d != nil && pc == d.doneGet {
		return 1
	}
	if d := r.binding.elementAtPC(pc); d != nil && pc == d.valueGet {
		return 2
	}
	return 0
}
func bindingGetterContext(r *storageRecipe, pc int, a languageAlternative) bool {
	role := bindingGetterRole(r, pc)
	if role == bindingFirstGetterRole {
		return bindingFirstGetterContext(r, pc, a) && a.branch.owner.live(a.branch)
	}
	c := a.binding
	if role == bindingCloseGetterRole {
		return c != nil && c.plan == r.binding && c.returnGet == nil && !c.routed && bindingReturnGetParent(c, a)
	}
	if role == 0 || c == nil || c.plan != r.binding || c.currentElement() != r.binding.elementAtPC(pc) || !completedElements(c, a, c.elementIndex) || c.first == nil || c.nextReceipt == nil || c.step == nil || !c.step.converted || c.step.completion != languageNormal || c.result.object == nil || c.step.value != c.result || c.step.outward.owner != a.branch.owner || c.step.outward.guard != a.branch.guard || c.step.outward.generation != a.branch.generation || c.done || c.origin != nil || c.initialization != nil || c.close != nil || c.routed || c.selected != nil || c.valueReceipt != nil || c.interrupted != nil {
		return false
	}
	if role == 1 {
		return !c.doneKnown && c.doneReceipt == nil && a.branch == c.step.outward
	}
	return c.doneKnown && c.doneReceipt != nil && len(c.doneReceipt.alternatives) == 1 && c.doneReceipt.alternatives[0].completion == languageNormal && c.doneReceipt.alternatives[0].branch == a.branch
}

// bindingGetterSourceRegister is the validated reference producer shared by
// static target correspondence and dynamic register/receiver admission.
func bindingGetterSourceRegister(r *storageRecipe, pc int) (int, bool) {
	role := bindingGetterRole(r, pc)
	if role == 0 {
		return 0, false
	}
	if role == bindingFirstGetterRole {
		return r.events[r.binding.first.member].a, true
	}
	if role == bindingCloseGetterRole {
		return r.binding.iterator, true
	}
	d := r.binding.elementAtPC(pc)
	if d == nil {
		return 0, false
	}
	return d.step.invoke, true
}
func bindingGetterReceiver(r *storageRecipe, pc int, a languageAlternative) (int, languageValue, bool) {
	reg, ok := bindingGetterSourceRegister(r, pc)
	if !ok || !bindingGetterContext(r, pc, a) {
		return 0, languageValue{}, false
	}
	if bindingGetterRole(r, pc) == bindingFirstGetterRole {
		return reg, a.value, a.value.object != nil && a.value.object.id.owner == a.branch.owner
	}
	if bindingGetterRole(r, pc) == bindingCloseGetterRole {
		return reg, a.binding.iterator, true
	}
	return reg, a.binding.result, true
}
func bindingGetterInputs(r *storageRecipe, a languageAlternative, in *languageCallInputs) bool {
	if in == nil || in.targetOrigin == nil || a.callInputs != in {
		return false
	}
	t := in.targetOrigin
	reg, receiver, ok := bindingGetterReceiver(r, t.getPC, a)
	if !ok || in.call != r.binding.declaration || in.bindingSite != nil || in.receiver != receiver || t.referencePC != r.events[t.getPC].a || r.events[t.referencePC].a != reg {
		return false
	}
	if bindingGetterRole(r, t.getPC) == bindingFirstGetterRole && r.binding.elementNode(0) != nil {
		// This is the source caller's frame before Getter activation, not its scope.
		_, mapped := bindingUninitializedTarget(r.binding.elementAt(0), a.branch, in.lexicals)
		return mapped
	}
	return true
}

// Validate source target before the completed child header is cleared. Only
// source lexicals and the actual frame ordinal can identify this target.
func bindingGetThrowTarget(r *storageRecipe, pc int, child languageAlternative, cells []languageCell) (languageCell, bool) {
	if bindingGetterRole(r, pc) == 0 || child.callInputs == nil || child.callInputs.targetOrigin == nil || child.callInputs.targetOrigin.getPC != pc || child.callInputs.bindingSite != nil {
		return languageCell{}, false
	}
	descriptor := r.binding.elementAtPC(pc)
	if bindingGetterRole(r, pc) == bindingFirstGetterRole {
		if len(r.binding.elements) == 0 {
			return languageCell{}, true
		}
		if len(r.binding.elements) != 1 {
			return languageCell{}, false
		}
		descriptor = r.binding.elementAt(0)
	}
	if descriptor == nil {
		return languageCell{}, false
	}
	slot := r.events[descriptor.initialize].cell
	if slot < 0 || slot >= len(cells) {
		return languageCell{}, false
	}
	return bindingUninitializedTarget(descriptor, child.branch, child.callInputs.lexicals, cells[slot])
}

// adoptBindingGetThrow consumes the same actual Get receipt, not a recreated
// child outcome. c.step remains Normal Next/R, independent of Getter history.
func adoptBindingGetThrow(parent, a languageAlternative, r *storageRecipe, pc int, target languageCell) (languageAlternative, bool) {
	if !bindingGetterContext(r, pc, parent) || a.completion != languageThrow || a.callHistory == nil || len(a.objects) == 0 {
		return a, false
	}
	if bindingGetterRole(r, pc) == bindingFirstGetterRole {
		if a.binding != nil {
			return a, false
		}
		if r.binding.elementNode(0) == nil {
			if target != (languageCell{}) {
				return a, false
			}
		} else {
			if a.callHistory.entry == nil || a.callHistory.entry.inputs == nil {
				return a, false
			}
			if _, ok := bindingUninitializedTarget(r.binding.elementAt(0), a.branch, a.callHistory.entry.inputs.lexicals, target); !ok {
				return a, false
			}
		}
		// The source target is authenticated but not installed as a selected binding.
		a.binding = &languageBindingContext{plan: r.binding}
		return a, a.binding.firstGetterThrowOutput(a)
	}
	if bindingGetterRole(r, pc) == bindingCloseGetterRole {
		return a, target == (languageCell{}) && a.binding == parent.binding && a.binding.closeGetterInnerOutput(a)
	}
	record := a.objects[len(a.objects)-1]
	h := a.callHistory
	if record.recipe != r || record.pc != pc || record.receipt == nil || len(record.receipt.alternatives) != 1 || record.receipt.alternatives[0].callHistory != h || record.receipt.alternatives[0].completion != languageThrow || record.receipt.alternatives[0].branch != a.branch || h.entry == nil || record.reference != h.entry.inputs.reference.id {
		return a, false
	}
	copy := *parent.binding
	copy.done, copy.target = true, target
	if bindingGetterRole(r, pc) == 1 {
		copy.doneReceipt = record.receipt
	} else {
		copy.valueReceipt = record.receipt
	}
	a.binding = &copy
	return a, true
}

// This immutable terminal is property Get failure, not c.step's Call failure.
func (c *languageBindingContext) getThrowOutput(a languageAlternative) bool {
	if c == nil || c.plan == nil || c.elementNode() == nil || !c.done || c.selected != nil || c.origin != nil || c.initialization != nil || c.close != nil || c.routed || c.interrupted != nil || a.completion != languageThrow || a.returnBoundary != (languageID{}) || a.storage != nil || a.callInputs != nil || a.callHistory == nil || a.callHistory == c.step {
		return false
	}
	h := a.callHistory
	if h.entry == nil || h.entry.inputs == nil || h.entry.inputs.targetOrigin == nil || h.raw == nil || len(h.raw.alternatives) != 1 || h.converted || h.completion != languageThrow || h.value != a.value || h.outward != a.branch || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 {
		return false
	}
	in := h.entry.inputs
	t := in.targetOrigin
	r := c.plan.recipe
	role := bindingGetterRole(r, t.getPC)
	prior := h.entry.acquisition.alternatives[0]
	if role == 0 || !bindingGetterContext(r, t.getPC, prior) || prior.binding.plan != c.plan || prior.binding.first != c.first || prior.binding.iterator != c.iterator || prior.binding.nextReceipt != c.nextReceipt || prior.binding.step != c.step || prior.binding.result != c.result || prior.binding.parent != c.parent || in.receiver != c.result || in.bindingSite != nil || t.recipe != r || t.getterInstall == nil || !sameLanguageFinallyContext(a.finally, prior.finally) {
		return false
	}
	receipt := c.doneReceipt
	if role == 1 {
		if c.doneKnown || c.valueReceipt != nil {
			return false
		}
	} else {
		if !c.doneKnown || c.doneReceipt != prior.binding.doneReceipt {
			return false
		}
		receipt = c.valueReceipt
	}
	if receipt == nil || len(receipt.alternatives) != 1 || receipt.input != t.input {
		return false
	}
	row := receipt.alternatives[0]
	if row.callHistory != h || row.completion != languageThrow || row.value != a.value || row.branch != a.branch {
		return false
	}
	found := false
	for _, record := range a.objects {
		if record.recipe == r && record.pc == t.getPC && record.reference == in.reference.id && record.receipt == receipt {
			found = true
		}
	}
	_, targetOK := bindingUninitializedTarget(c.currentElement(), a.branch, in.lexicals, c.target)
	return found && targetOK
}

// closeGetterThrowOutput is detached completion metadata for the exact
// return Get. The actual Getter stays in a.callHistory, never c.close. The
// initialized-target owner authenticates one-element output independently.
func (c *languageBindingContext) closeGetterInnerOutput(a languageAlternative) bool {
	if c == nil || c.plan == nil || a.branch.owner == nil || a.binding != c || a.completion != languageThrow || a.returnBoundary != (languageID{}) || a.storage != nil || a.callInputs != nil || c.returnGet != nil || c.close != nil || c.routed || a.callHistory == nil || a.callHistory == c.first || a.callHistory == c.step {
		return false
	}
	h := a.callHistory
	if h.entry == nil || h.entry.inputs == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 || h.raw == nil || len(h.raw.alternatives) != 1 || h.converted || h.completion != languageThrow || h.value != a.value || h.outward != a.branch || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next {
		return false
	}
	e, in := h.entry, h.entry.inputs
	t := in.targetOrigin
	parent := e.acquisition.alternatives[0]
	p := c.plan
	if t == nil || t.getterInstall == nil || bindingGetterRole(p.recipe, t.getPC) != bindingCloseGetterRole || t.recipe != p.recipe || t.referencePC != p.close.member || t.acquirePC != -1 || t.input != t.output || t.input != parent.branch || parent.binding != c || parent.callInputs != in || !bindingGetterContext(p.recipe, t.getPC, parent) || in.call != p.declaration || in.bindingSite != nil || len(in.arguments) != 0 || in.receiver != c.iterator || in.reference != t.reference || in.reference.receiver != c.iterator || in.reference.key != languageStringKey("return") || in.callee != t.getterInstall.descriptor.value || t.getterInstall.object != c.iterator.object || t.getterInstall.key != in.reference.key || !getterDescriptorPayload(t.getterInstall.descriptor) || !sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	raw := h.raw.alternatives[0]
	if h.raw.input != e.activation || raw.completion != languageThrow || raw.returnBoundary != (languageID{}) || raw.value != h.value || raw.branch.state != a.branch.state || raw.branch.env != e.activation.env || a.branch.env != e.caller || e.caller != parent.branch.env || raw.branch.cursor == ^uint64(0) || raw.branch.cursor+1 != a.branch.cursor {
		return false
	}
	found := false
	for _, record := range a.objects {
		if record.recipe != p.recipe || record.pc != p.close.get {
			continue
		}
		if found || record.node != p.declaration || record.reference != in.reference.id || record.receipt == nil || record.receipt.input != t.input || record.receipt.occurrence.owner != a.branch.owner || record.receipt.occurrence.serial <= in.reference.id.serial || record.receipt.occurrence.serial > a.branch.owner.next || len(record.receipt.alternatives) != 1 {
			return false
		}
		row := record.receipt.alternatives[0]
		if row.branch != a.branch || row.completion != languageThrow || row.value != a.value || row.callHistory != h || row.binding != c || row.callInputs != nil || row.storage != nil || !sameLanguageFinallyContext(row.finally, parent.finally) {
			return false
		}
		found = true
	}
	return found && (p.elementNode(0) == nil || bindingDefaultOrigin(c, a) || bindingInitializedTarget(c, a, in.lexicals, e.caller))
}

// bindingReturnGetterSuspended fences transport only. An entered child's
// actual acquisition row authenticates its loaned header. Before entry, the
// retained row still has its real source-parent history (factory or Next).
// Neither route grants entry or completion.
func bindingReturnGetterSuspended(r *storageRecipe, pc int, a languageAlternative) bool {
	c, s, in := a.binding, a.storage, a.callInputs
	if a.branch.owner == nil || bindingGetterRole(r, pc) != bindingCloseGetterRole || c == nil || s == nil || in == nil || in.targetOrigin == nil || s.callInputs != nil || s.targetOrigin != nil {
		return false
	}
	t := in.targetOrigin
	parentHistory := c.first
	if r.binding.elementNode(0) != nil {
		parentHistory = c.step
	}
	if c.completed != nil {
		if c.origin == nil || len(c.origin.alternatives) != 1 || !bindingNormalUnusedMetadata(c.origin.alternatives[0]) || c.origin.alternatives[0].binding == nil || c.origin.alternatives[0].binding.completed != c.completed || !completedElements(c, c.origin.alternatives[0], len(c.plan.elements)) {
			return false
		}
		parentHistory = c.origin.alternatives[0].callHistory
	}
	if bindingDefaultOrigin(c, a) {
		parentHistory = c.origin.alternatives[0].callHistory
	}
	parent := a
	if h := a.callHistory; h != nil && h != parentHistory {
		if h.entry == nil || h.entry.inputs == nil || h.entry.inputs.targetOrigin != t || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 {
			return false
		}
		parent = h.entry.acquisition.alternatives[0]
		if parent.callInputs != h.entry.inputs || !sameLanguageCallInputs(in, h.entry.inputs) {
			return false
		}
	} else {
		if a.callHistory != parentHistory {
			return false
		}
		parent.branch = t.input
	}
	if parent.branch != t.input || parent.binding != c || !bindingGetterContext(r, pc, parent) || in.bindingSite != nil || in.call != r.binding.declaration || in.receiver != c.iterator || t.reference.receiver != c.iterator || t.reference.key != languageStringKey("return") || t.getterInstall == nil || t.getterInstall.object != c.iterator.object || t.getterInstall.key != t.reference.key || !sameLanguageFinallyContext(s.finally, parent.finally) {
		return false
	}
	// Active callee origin is cleared by the preceding protocol Invoke.
	// Empty next->record cannot issue one. One-element done/value reads follow
	// selectors, not Acquire. The historical Next input origin stays in c.step.
	p := r.binding
	nextRef := r.events[p.next].a
	if r.events[p.record].kind != "InstallIteratorRecord" || nextRef < 0 || nextRef >= len(s.references) || p.next >= len(s.values) || p.next >= len(s.ready) || !s.ready[p.next] || s.values[p.next] != c.next || s.references[nextRef] != c.nextReference || p.iterator < 0 || p.iterator >= len(s.values) || p.iterator >= len(s.ready) || !s.ready[p.iterator] || s.values[p.iterator] != c.iterator {
		return false
	}
	if p.elementNode(0) == nil {
		if p.record != p.next+1 || t.input.state != c.nextBranch.state {
			return false
		}
	} else {
		// Initialization adds a real source cell record after Next. Authenticate
		// that state with Park's owner instead of equating it to pre-Next state.
		slot := r.events[c.elementLabels().initialize].cell
		if p.record != p.next+2 || p.elementLabels(0).step.acquire != p.next+1 || r.events[p.elementLabels(0).step.acquire].kind != "AcquireCallCallee" || r.events[c.elementLabels().doneGet+1].kind != "SelectIteratorDone" || r.events[c.elementLabels().valueGet+1].kind != "SelectBindingValue" || c.elementLabels().step.invoke < 0 || c.elementLabels().step.invoke >= len(s.values) || c.elementLabels().step.invoke >= len(s.ready) || !s.ready[c.elementLabels().step.invoke] || s.values[c.elementLabels().step.invoke] != c.result || slot < 0 || slot >= len(s.cells) || s.cells[slot] != c.target || !(bindingDefaultOrigin(c, parent) || bindingInitializedTarget(c, parent, in.lexicals, parent.branch.env)) {
			return false
		}
	}
	d, present, _, record := a.branch.owner.readOwnRecord(t.input, c.iterator.object, languageStringKey("next"))
	return present && record != nil && record.initialized && !record.deleted && !d.accessor && d.value == c.next
}

// firstGetterThrowOutput inspects an already issued finished Get. It never
// validates disposed live authority or invents a factory Call/iterator record.
func (c *languageBindingContext) firstGetterThrowOutput(a languageAlternative) bool {
	if c == nil || c.plan == nil || len(c.plan.elements) > 1 || c.elementIndex != 0 || c.completed != nil || a.binding != c || c.parent != nil || c.firstMethod != nil || c.first != nil || c.step != nil || c.close != nil || c.iterator != (languageValue{}) || c.result != (languageValue{}) || c.next != (languageValue{}) || c.nextReference != (languageReference{}) || c.nextBranch != (languageBranch{}) || c.nextReceipt != nil || c.origin != nil || c.initialization != nil || c.returnGet != nil || c.done || c.doneKnown || c.doneReceipt != nil || c.valueReceipt != nil || c.selected != nil || c.interrupted != nil || c.routed || c.target != (languageCell{}) || a.completion != languageThrow || a.remaining != "" || a.storage != nil || a.callInputs != nil || a.returnBoundary != (languageID{}) || a.callHistory == nil || a.branch.owner == nil {
		return false
	}
	h := a.callHistory
	if h.entry == nil || h.entry.inputs == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 || h.raw == nil || len(h.raw.alternatives) != 1 || h.converted || h.completion != languageThrow || h.value != a.value || h.outward != a.branch || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next {
		return false
	}
	e, in := h.entry, h.entry.inputs
	t := in.targetOrigin
	parent := e.acquisition.alternatives[0]
	r := c.plan.recipe
	if t == nil || t.recipe != r || bindingGetterRole(r, t.getPC) != bindingFirstGetterRole || t.referencePC != c.plan.first.member || t.acquirePC != -1 || t.input != t.output || t.input != parent.branch || !bindingFirstGetterContext(r, t.getPC, parent) || parent.callInputs != in || in.call != c.plan.declaration || in.bindingSite != nil || in.category != callReferenceTarget || in.valueOrigin != nil || !in.complete || !in.calleeReady || len(in.arguments) != 0 || in.reference != t.reference || in.receiver != parent.value || in.receiver != t.reference.receiver || in.receiver.object == nil || in.reference.cell != (languageCell{}) || in.reference.key != languageIteratorKey() || t.getterInstall == nil || t.getterInstall.object != in.receiver.object || t.getterInstall.key != in.reference.key || in.callee != t.getterInstall.descriptor.value || !getterDescriptorPayload(t.getterInstall.descriptor) || !ownGetterInstallationKey(r, t.getterInstall) || e.callable != in.callee.callable || e.proof != e.callable.proof || e.proof.parameters != 0 || e.proof.namespace != a.branch.owner || e.proof.generation != a.branch.generation || e.proof.source == nil || e.proof.source.AsNode() != r.body || e.proof.entry == nil || e.proof.entry.body != e.proof.arrow || e.boundary.owner != a.branch.owner || e.boundary.serial == 0 || e.boundary.serial > a.branch.owner.next || h.raw.occurrence.owner != a.branch.owner || h.raw.occurrence.serial == 0 || h.raw.occurrence.serial > a.branch.owner.next || e.acquisition.occurrence.owner != a.branch.owner || e.acquisition.occurrence.serial == 0 || e.acquisition.occurrence.serial > a.branch.owner.next || !sameLanguageFinallyContext(a.finally, parent.finally) || a.pending != parent.pending || a.pendingValue != parent.pendingValue || a.pendingReturnBoundary != parent.pendingReturnBoundary {
		return false
	}
	raw := h.raw.alternatives[0]
	if h.raw.input != e.activation || raw.completion != languageThrow || raw.returnBoundary != (languageID{}) || raw.value != h.value || raw.branch.state != a.branch.state || raw.branch.env != e.activation.env || e.activation.state != parent.branch.state || e.activation.env == nil || parent.branch.cursor == ^uint64(0) || e.activation.cursor != parent.branch.cursor+1 || a.branch.env != e.caller || e.caller != parent.branch.env || raw.branch.cursor == ^uint64(0) || raw.branch.cursor+1 != a.branch.cursor || !callBodySnapshot(e, raw) || !sameLanguageCallInputs(raw.callInputs, in) || raw.finally == nil || !raw.finally.routed {
		return false
	}
	found := false
	for _, record := range a.objects {
		if record.recipe != r || record.pc != c.plan.first.get {
			continue
		}
		if found || record.node != c.plan.declaration || record.reference != in.reference.id || record.receipt == nil || record.receipt.input != t.input || record.receipt.occurrence.owner != a.branch.owner || record.receipt.occurrence.serial <= in.reference.id.serial || record.receipt.occurrence.serial > a.branch.owner.next || len(record.receipt.alternatives) != 1 {
			return false
		}
		row := record.receipt.alternatives[0]
		if row.branch != a.branch || row.completion != languageThrow || row.value != a.value || row.callHistory != h || row.binding != nil || row.callInputs != nil || row.storage != nil || !sameLanguageFinallyContext(row.finally, parent.finally) {
			return false
		}
		found = true
	}
	if !found {
		return false
	}
	if c.plan.elementNode(0) != nil {
		// The checked exit restored e.caller. Never inspect a Getter formal as x.
		_, ok := bindingUninitializedTarget(c.plan.elementAt(0), a.branch, in.lexicals)
		return ok
	}
	return true
}

// This fence recognizes the suspended first Get's actual loaned header and
// source buffers. It grants neither activation nor finished-Get permission.
func bindingFirstGetterSuspended(r *storageRecipe, pc int, a languageAlternative) bool {
	s, in := a.storage, a.callInputs
	if bindingGetterRole(r, pc) != bindingFirstGetterRole || a.branch.owner == nil || s == nil || s.recipe != r || s.pc != pc || in == nil || in.targetOrigin == nil || s.callInputs != nil || s.targetOrigin != nil || a.binding != nil {
		return false
	}
	t := in.targetOrigin
	reg := r.events[r.binding.first.member].a
	if t.recipe != r || t.getPC != pc || t.referencePC != r.binding.first.member || t.acquirePC != -1 || t.input != t.output || in.call != r.binding.declaration || in.bindingSite != nil || in.reference != t.reference || in.receiver != t.reference.receiver || in.reference.key != languageIteratorKey() || t.getterInstall == nil || t.getterInstall.object != in.receiver.object || t.getterInstall.key != in.reference.key || in.callee != t.getterInstall.descriptor.value || !getterDescriptorPayload(t.getterInstall.descriptor) || reg < 0 || reg >= len(s.values) || reg >= len(s.ready) || !s.ready[reg] || s.values[reg] != in.receiver || t.referencePC >= len(s.references) || s.references[t.referencePC] != in.reference {
		return false
	}
	parent := a
	if a.callHistory != nil {
		h := a.callHistory
		if h.entry == nil || h.entry.inputs == nil || h.entry.inputs.targetOrigin != t || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 || !sameLanguageCallInputs(in, h.entry.inputs) {
			return false
		}
		parent = h.entry.acquisition.alternatives[0]
		if parent.callInputs != h.entry.inputs {
			return false
		}
	} else {
		parent.branch = t.input
	}
	if parent.branch != t.input || !bindingFirstGetterContext(r, pc, parent) || !sameLanguageFinallyContext(s.finally, parent.finally) {
		return false
	}
	if r.binding.elementNode(0) != nil {
		slot := r.events[r.binding.elementLabels(0).initialize].cell
		if slot < 0 || slot >= len(s.cells) {
			return false
		}
		caller := a.branch
		// Transport may still carry an unfinished Getter activation. Select only
		// the real caller authenticated by its acquisition, retaining actual state.
		if a.callHistory != nil {
			entry := a.callHistory.entry
			if entry.caller != parent.branch.env || (a.branch.env != entry.caller && a.branch.env != entry.activation.env) {
				return false
			}
			caller.env = entry.caller
		} else if a.branch.env != parent.branch.env {
			return false
		}
		if _, ok := bindingUninitializedTarget(r.binding.elementAt(0), caller, in.lexicals, s.cells[slot]); !ok {
			return false
		}
	}
	d, present, _, record := a.branch.owner.readOwnRecord(t.input, in.receiver.object, in.reference.key)
	return present && record == t.getterInstall && d.value == in.callee
}
