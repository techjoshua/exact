package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

const storageNullKind = ast.KindNullKeyword

// storageEvent is a nonexecuting operation recipe. Register numbers refer only to
// acquired operands in this occurrence. Nodes are provenance, not evaluators.
type storageEvent struct {
	keyProducerPC     int
	kind              string
	node              *ast.Node
	out, a, b, cell   int
	key               languagePropertyKey
	length            uint32
	value             languageValue
	callable          *closedCallableProof
	excluded          []languagePropertyKey
	entry, merge, end int
}
type storageRecipe struct {
	callSites    []closedPrefixCallSite // immutable ordinary source sequence, separate from binding roles
	binding      *storageBindingRecipe
	sourceSymbol bool              // discovery demand marker, never admission authority
	symbolCase   *sourceSymbolCase // immutable shared native S association, no VALUE

	choiceSlots  int // prepaid discovered expression-choice capacity
	body         *ast.Node
	events       []storageEvent
	locals       int
	registers    int
	hasArray     bool
	prefix       bool
	callBody     bool
	finally      *storageFinallyRecipe
	constants    []bool
	call         *ast.Node
	declarations []*ast.Node
}
type storageOperand struct {
	register    int
	domain      storageDomain
	arrayLength *storageShape
}
type storageBinding struct {
	cell   int
	domain storageDomain
}
type storageBuilder struct {
	query         *sourceValueQuery
	recipe        storageRecipe
	locals        map[ast.SymbolId]storageBinding
	discovery     int
	exhausted     bool
	hasAllocation bool
	ownedArray    bool
}
type storageOwnedBody struct {
	body    *ast.Node
	receipt *languageReceipt
}

// storageContinuation preserves paid operands at a budget cut. It owns detached
// immutable vectors, not the adapter's symbol map or installed activation.
type storageContinuation struct {
	id         languageID
	recipe     *storageRecipe
	pc         int
	cells      []languageCell
	values     []languageValue
	references []languageReference
	copy       *languageCopyProgress
	ready      []bool
	choices    []storageChoice
	callInputs *languageCallInputs
	// The successful Get origin is paid before callee acquisition. Cuts retain
	// that immutable association even while callInputs is still unacquired.
	targetOrigin *languageCallTargetOrigin
	entry        *languageCallEntryInput
	childBranch  languageBranch
	finally      *languageFinallyContext
}

func copyStorageContinuation(c *storageContinuation) *storageContinuation {
	if c == nil {
		return nil
	}
	out := *c
	if c.entry != nil {
		entry := *c.entry
		out.entry = &entry
	}
	out.callInputs = copyLanguageCallInputs(c.callInputs)
	out.copy = cloneLanguageCopy(c.copy)
	out.ready = append([]bool(nil), c.ready...)
	out.choices = copyStorageChoices(c.choices)
	out.cells = append([]languageCell(nil), c.cells...)
	out.values = append([]languageValue(nil), c.values...)
	out.references = append([]languageReference(nil), c.references...)
	return &out
}

// discover charges representation work before descent or allocation. Exhaustion is
// sticky so an interrupted expression cannot publish registers from a partial plan.
// This private allowance never pays semantic events or changes query.remaining.
func (p *storageBuilder) discover() bool {
	if p.exhausted {
		p.exhausted = true
		return false
	}
	p.discovery--
	return true
}

func (p *storageBuilder) event(e storageEvent) int {
	if !p.discover() {
		return -1
	}
	p.hasAllocation = p.hasAllocation || (e.kind == "AllocateObject" || e.kind == "AllocateArray")
	e.keyProducerPC = -1
	e.out = p.recipe.registers
	p.recipe.registers++
	p.recipe.events = append(p.recipe.events, e)
	return e.out
}
func (p *storageBuilder) member(node *ast.Node) (storageOperand, bool) {
	if !p.discover() {
		return storageOperand{}, false
	}
	// Do not use mutationPlan.reference's unwrapping until transform authority is
	// implemented. Only exact member syntax is admitted here.
	var receiver, keyNode *ast.Node
	key := ""
	if ast.IsPropertyAccessExpression(node) {
		m := node.AsPropertyAccessExpression()
		receiver, keyNode = m.Expression, m.Name()
		if !ast.IsIdentifier(keyNode) {
			return storageOperand{}, false
		}
		key = keyNode.Text()
	} else if ast.IsElementAccessExpression(node) {
		m := node.AsElementAccessExpression()
		receiver, keyNode = m.Expression, m.ArgumentExpression
		if keyNode == nil || keyNode.Kind != ast.KindStringLiteral {
			return storageOperand{}, false
		}
		key = keyNode.Text()
	} else {
		return storageOperand{}, false
	}
	v, ok := p.expression(receiver)
	domain, present := p.fieldDomain(v.domain, key)
	if !ok || !present {
		return storageOperand{}, false
	}
	operand := storageOperand{register: p.event(storageEvent{kind: "Member", node: node, a: v.register, key: languageStringKey(key), keyProducerPC: -1}), domain: domain}
	if v.domain.object != nil && v.domain.object.array && key == "length" {
		operand.arrayLength = v.domain.object
	}
	return operand, !p.exhausted
}
func (p *storageBuilder) expression(node *ast.Node) (storageOperand, bool) {
	if !p.discover() || node == nil {
		return storageOperand{}, false
	}
	switch node.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return storageOperand{register: p.event(storageEvent{kind: "Literal", node: node, value: languageValue{node: node}}), domain: p.primitiveDomain()}, true
	}
	if ast.IsIdentifier(node) {
		if !p.discover() {
			return storageOperand{}, false
		}
		symbol := p.query.owner.checker.GetSymbolAtLocation(node)
		if symbol != nil {
			if !p.discover() {
				return storageOperand{}, false
			}
			if binding, ok := p.locals[ast.GetSymbolId(symbol)]; ok {
				if !p.validDomain(binding.domain) {
					return storageOperand{}, false
				}
				return storageOperand{register: p.event(storageEvent{kind: "ReadCell", node: node, cell: binding.cell}), domain: binding.domain}, true
			}
		}
		// Undefined is admitted only through the checker's standard undefined symbol.
		if standardUndefinedSymbol(p.query.owner.checker, node, symbol) {
			return storageOperand{register: p.event(storageEvent{kind: "Literal", node: node, value: languageValue{undefined: true, node: node}}), domain: p.primitiveDomain()}, true
		}
		return storageOperand{}, false
	}
	if node.Kind == ast.KindArrayLiteralExpression {
		return p.arrayExpression(node)
	}
	if ast.IsObjectLiteralExpression(node) {
		domain := p.objectDomain()
		if !p.validDomain(domain) {
			return storageOperand{}, false
		}
		reg := p.event(storageEvent{kind: "AllocateObject", node: node})
		for _, field := range node.AsObjectLiteralExpression().Properties.Nodes {
			if !p.discover() {
				return storageOperand{}, false
			}
			if !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) {
				return storageOperand{}, false
			}
			name := field.Name()
			if !ast.IsIdentifier(name) && name.Kind != ast.KindStringLiteral {
				return storageOperand{}, false
			}
			key := name.Text()
			if !p.discover() {
				return storageOperand{}, false
			}
			if _, exists := domain.object.fields[key]; key == "__proto__" || exists {
				return storageOperand{}, false
			}
			v, ok := p.expression(field.Initializer())
			if !ok || !p.validDomain(v.domain) {
				return storageOperand{}, false
			}
			if !p.insertDomain(domain, key, v.domain) {
				return storageOperand{}, false
			}
			p.event(storageEvent{kind: "DefineSlot", node: field, a: reg, b: v.register, key: languageStringKey(key), keyProducerPC: -1})
		}
		p.event(storageEvent{kind: "ObjectComplete", node: node, a: reg})
		return storageOperand{register: reg, domain: domain}, true
	}
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		r, ok := p.member(node)
		if !ok {
			return storageOperand{}, false
		}
		return storageOperand{register: p.event(storageEvent{kind: "GetValue", node: node, a: r.register}), domain: r.domain}, true
	}
	return storageOperand{}, false
}

// storageBodyRecipe validates the complete closed interval before any payment.
// Parent MAY analysis still owns callable discovery. This adapter neither consults
// paid old outputs nor executes the summary.normal effect-demand stream.
// Discovery borrows a private allowance from the current query work balance. It
// bounds representation work per attempt without debiting semantic execution.
// Exhaustion discards this occurrence and leaves the complete body to legacy.
func (q *sourceValueQuery) storageBodyRecipe(body *ast.Node, inputs *sourceValueInputs) (*storageRecipe, bool) {
	if q.owner == nil || q.owner.language == nil || q.owner.generation == nil || inputs == nil || inputs.get == nil || inputs.get.operation == nil || inputs.declaration != body || !ast.IsGetAccessorDeclaration(body) || body.Body() == nil || !ast.IsBlock(body.Body()) || len(body.Parameters()) != 0 || !ast.IsExternalModule(ast.GetSourceFileOfNode(body)) {
		return nil, false
	}
	p := storageBuilder{query: q, recipe: storageRecipe{body: body}, discovery: q.remaining, ownedArray: inputs.get.ownedRequest != nil && !inputs.get.ownedRequest.released}
	if !p.discover() {
		return nil, false
	}
	p.locals = make(map[ast.SymbolId]storageBinding)
	statements := body.Body().AsBlock().Statements.Nodes
	if len(statements) == 0 || !ast.IsReturnStatement(statements[len(statements)-1]) {
		return nil, false
	}
	// All local cells exist before initialization. This also prevents a forward
	// read from being accidentally resolved as a global or a copied parameter.
	for _, s := range statements {
		if !p.discover() {
			return nil, false
		}
		if !ast.IsVariableStatement(s) {
			continue
		}
		list := s.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
		if list.Flags&ast.NodeFlagsConst == 0 {
			return nil, false
		}
		for _, d := range list.Declarations.Nodes {
			if !p.discover() {
				return nil, false
			}
			if d.Initializer() == nil || d.Type() != nil || !p.declareBinding(d.Name()) {
				return nil, false
			}
		}
	}
	for i, s := range statements {
		if !p.discover() {
			return nil, false
		}
		switch {
		case ast.IsVariableStatement(s):
			for _, d := range s.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if !p.discover() {
					return nil, false
				}
				v, ok := p.expression(d.Initializer())
				if !ok {
					return nil, false
				}
				if !p.initializeBinding(d.Name(), v) {
					return nil, false
				}
			}
		case ast.IsExpressionStatement(s):
			operation := s.AsExpressionStatement().Expression
			plan := planMutationOperation(operation)
			if plan.kind != mutationAssign {
				return nil, false
			}
			r, ok := p.member(plan.target)
			if !ok || !p.isPrimitive(r.domain) {
				return nil, false
			}
			v, ok := p.expression(plan.value)
			if !ok || !p.isPrimitive(v.domain) {
				return nil, false
			}
			if r.arrayLength != nil {
				n, ok := p.authoredArrayLength(plan.value)
				if !ok || !p.planArrayLength(r.arrayLength, n) {
					return nil, false
				}
				p.event(storageEvent{kind: "PutArrayLength", node: operation, a: r.register, b: v.register, length: n})
			} else {
				p.event(storageEvent{kind: "PutValue", node: operation, a: r.register, b: v.register})
			}
		case ast.IsReturnStatement(s) && i == len(statements)-1:
			v, ok := p.expression(s.AsReturnStatement().Expression)
			if !ok || !p.isPrimitive(v.domain) && (inputs.get.ownedRequest == nil || inputs.get.ownedRequest.released) {
				return nil, false
			}
			p.event(storageEvent{kind: "Return", node: s, a: v.register})
		default:
			return nil, false
		}
	}
	if p.exhausted || !p.hasAllocation {
		return nil, false
	}
	// Detach the published record from the builder allocation. An interior pointer
	// would keep its query, checker and mutable admission maps alive.
	recipe := p.recipe
	return &recipe, true
}

// executeStorageRecipe owns every post-entry exit, including budget residuals.
// Execution registers and local-cell correspondence die here. Receipts retain
// only immutable semantic state, acquired values and source provenance.
func (o *languageOwner) executeStorageRecipe(recipe *storageRecipe, budget int) (*languageReceipt, int) {
	if recipe == nil || recipe.callBody {
		return nil, 0
	}
	input := o.root()
	a, used := o.executeStorageSchedule(recipe, budget, languageAlternative{branch: input})
	return o.receipt(input, []languageAlternative{a}), used
}

// executeStorageSchedule enters an already acquired branch, never another root.
// This source subset has single-alternative children. Every event uses the shared
// sequence algebra rather than resetting prefix contributions. Conditional child
// completion is merged only on Normal, with explicit register readiness.
// executeStorageSchedule is the existing adapter. Only a completed live prefix
// hands inputs to Call entry, before terminal publication. Historical projection
// never reaches this execution adapter.
func (o *languageOwner) executeStorageSchedule(recipe *storageRecipe, budget int, a languageAlternative, candidates ...*closedPrefixCandidate) (languageAlternative, int) {
	input := a.branch
	out, used := o.executeStorageScheduleEntry(recipe, budget, a, nil, candidates...)
	if _, _, initializer := sourceInitializerCallLayout(recipe); !initializer && recipe != nil && recipe.prefix && out.completion == languageNormal && out.callInputs != nil && out.callInputs.complete {
		if len(candidates) == 1 && candidates[0].continuation != nil && !candidates[0].successorCallee(out) {
			return callEntryRefusal(out, "source successor callable identity"), used
		}
		result, spent := o.consumeClosedCallInputs(input, out, budget-used, candidates...)
		return result, used + spent
	}
	return out, used
}

// executeStorageCallBody uses the same loop and one formal-cell namespace. The
// caller has reserved scope exit and detached cut storage before activating.
func (o *languageOwner) executeStorageCallBody(recipe *storageRecipe, budget int, a languageAlternative, entry *languageCallEntryInput) (languageAlternative, int) {
	if a.completion != languageNormal {
		return a, 0
	}
	if recipe == nil || !recipe.callBody || recipe.prefix {
		return callEntryRefusal(a, "Call body entry association"), 0
	}
	return o.executeStorageScheduleEntry(recipe, budget, a, entry)
}
func (o *languageOwner) executeStorageScheduleEntry(recipe *storageRecipe, budget int, a languageAlternative, entry *languageCallEntryInput, candidates ...*closedPrefixCandidate) (languageAlternative, int) {
	// Entry eligibility is checked before setup arrays, cell identities or any
	// acquired-header access. A vetoed predecessor remains inert and unchanged.
	if a.completion != languageNormal {
		return a, 0
	}
	if recipe == nil || recipe.callBody != (entry != nil) || entry != nil && (recipe.prefix || !entry.valid(o, a.branch) || recipe != entry.callable.proof.entry) {
		return callEntryRefusal(a, "Call body mode/context association"), 0
	}

	if _, _, initializer := sourceInitializerCallLayout(recipe); initializer && (len(candidates) != 1 || candidates[0] == nil) {
		return callEntryRefusal(a, "initializer source candidate unavailable"), 0
	}
	if recipe.binding != nil && (!recipe.binding.valid(recipe) || len(candidates) != 1) {
		return callEntryRefusal(a, "Binding recipe/context association"), 0
	}
	if recipe.finally != nil && !recipe.finally.valid(recipe) {
		return callEntryRefusal(a, "Finally recipe association"), 0
	}

	if recipe.choiceSlots > 0 && (o == nil || !o.live(a.branch)) {
		return callEntryRefusal(a, "Expression choice ownership"), 0
	}
	if recipe.choiceSlots > 0 && !shortCircuitCanonical(a) {
		a.completion, a.value, a.remaining = languageResidual, languageValue{}, "Expression choice Normal metadata"
		return a, 0
	}
	if !storageBuffersAddressable(recipe) {
		return callEntryRefusal(a, "storage buffer addressability"), 0
	}
	// Buffer estimates are reporting only. Actual shape checks precede allocation.
	setup := 0
	if recipe.hasArray || recipe.prefix || recipe.callBody {
		setup = storageScheduleSetup(recipe)
	}
	if recipe.choiceSlots > 0 {
		n, ok := shortCircuitSetup(recipe, budget)
		if !ok {
			n = estimatedCostSum(-1, 0)
		}
		setup = n
	}

	if recipe.locals < 0 || recipe.registers < 0 || !o.canIssue(uint64(recipe.locals)+8) {
		return callEntryRefusal(a, "storage identity capacity"), 0
	}
	parentInput := a.branch
	baseSetup := setup
	budget -= setup
	// call body activation observation
	cells := make([]languageCell, recipe.locals)
	successor := len(candidates) == 1 && candidates[0].continuation != nil && recipe == candidates[0].currentSourceRecipe()
	if successor {
		p := candidates[0]
		if !p.resumeInputs(recipe, a) {
			return callEntryRefusal(a, "source caller continuation inputs"), 0
		}
		for i, v := range a.callInputs.lexicals {
			cells[i] = v.cell
		}
	} else {
		for i := range cells {
			cells[i] = o.cell(a.branch.env, false)
			if recipe.prefix {
				cells[i].immutable = recipe.constants[i]
			}
		}
	}
	values := make([]languageValue, recipe.registers)
	references := make([]languageReference, recipe.registers)
	ready := make([]bool, recipe.registers)
	var choices []storageChoice
	if recipe.choiceSlots > 0 {
		choices = make([]storageChoice, 0, recipe.choiceSlots)
	}
	// short circuit allocation observation
	var targetOrigin *languageCallTargetOrigin
	var callInputs *languageCallInputs
	activeFinally := a.finally
	if entry != nil {
		callInputs = entry.inputs
	}
	if recipe.prefix && recipe.binding == nil {
		callInputs = &languageCallInputs{call: recipe.call}
		for i, c := range cells {
			callInputs.lexicals = append(callInputs.lexicals, languageLexical{declaration: recipe.declarations[i], cell: c})
		}
	}
	snapshot := func(pc int, progress *languageCopyProgress) *storageContinuation {
		return &storageContinuation{id: o.identity(), recipe: recipe, pc: pc, cells: append([]languageCell(nil), cells...), values: append([]languageValue(nil), values...), references: append([]languageReference(nil), references...), ready: append([]bool(nil), ready...), choices: copyStorageChoices(choices), copy: progress, callInputs: copyLanguageCallInputs(callInputs), targetOrigin: targetOrigin, entry: copyLanguageCallEntry(entry), childBranch: a.branch, finally: activeFinally}
	}
	cutAt := func(reason string, pc int) languageAlternative {
		if recipe.finally != nil {
			current := a
			if current.storage == nil || current.storage.recipe != recipe || current.storage.pc != pc || current.storage.childBranch != current.branch || current.storage.finally != activeFinally {
				current.storage = snapshot(pc, nil)
			}
			cut := o.finallyCut(current, activeFinally, entry, reason)
			activeFinally = cut.finally
			if current.storage.finally != activeFinally {
				cut.storage = snapshot(pc, nil)
			}
			return cut
		}
		cut := storageScheduleCut(a, reason)
		// Adopt predecessor history before creating the local open-stack cut.
		// Otherwise sequence clones a just-created body snapshot once more,
		// exceeding the four detached-copy routes reserved by body setup.
		// Inherited input clones remain paid by event or inherited-cut credit.
		if recipe.callBody && recipe.choiceSlots > 0 {
			cut = languageSequence([]languageAlternative{a}, func(languageAlternative) []languageAlternative { return []languageAlternative{cut} })[0]
			cut.storage = snapshot(pc, nil)
			return cut
		}
		cut.storage = snapshot(pc, nil)
		return languageSequence([]languageAlternative{a}, func(languageAlternative) []languageAlternative { return []languageAlternative{cut} })[0]
	}
	acquired := func(reg int) bool { return reg >= 0 && reg < len(ready) && ready[reg] }
	used := 0
	for pc := 0; pc < len(recipe.events) && (a.completion == languageNormal || finallyDispatchable(recipe, pc, a) || bindingCloseThrowRouteReady(recipe, pc, a) || bindingDefaultParkReady(recipe, pc, a) || bindingDefaultGetterRoute(recipe, pc, a)); {
		if !o.canAdvance(a.branch, 3) {
			a = cutAt("storage identity/cursor capacity", pc)
			break
		}

		// Invoke directly adopts the common consumer output. It does not execute
		// the ordinary sequence-copy block. Child fixed preflight pays its copies,
		// while parent setup reserves the one suspension snapshot on a cut.
		if (recipe.hasArray || recipe.prefix || recipe.callBody || recipe.choiceSlots > 0) && (recipe.binding == nil || recipe.events[pc].kind != "InvokeAcquiredCall" && !bindingFamilyEvent(recipe.events[pc].kind)) {
			// Sequence/history defensive copies scale with the retained completed prefix.
			horizon := len(a.objects)
			// The event pays its possible post-step population before sequence or a
			// cut can allocate it. Storage/Call allowances overlap and pay max once.
			if bodyObjectGetPC(recipe) == pc || entry != nil && recipe.events[pc].kind == "GetValue" && entry.proof.mapping.nullDefaultMember() != nil || recipe.events[pc].kind == "ObjectComplete" || recipe.events[pc].kind == "ArrayComplete" {
				var ok bool
				horizon, ok = budgetSum(budget-used, horizon, 1)
				if !ok {
					a = cutAt("object history horizon budget", pc)
					break
				}
			}
			extra, paid := storageEventCopyCharge(a, callInputs, budget-used, horizon)
			if !paid {
				extra = estimatedCostSum(-1, 0)
			}
			if recipe.callBody {
				charge, ok := callEventCharge(a, callInputs, budget-used, horizon)
				if !ok {
					charge = estimatedCostSum(-1, 0)
				}
				if !ok {
					charge = estimatedCostSum(-1, 0)
				}
				extra = max(extra, charge)
			}

			used = estimatedCostSum(used, extra)
		}

		if recipe.binding != nil && eBindingFee(recipe.events[pc].kind) > 0 {
			fee, ok := bindingArtifactCharge(recipe.events[pc].kind, a, budget-used, pc)
			if recipe.events[pc].kind == "AcquireCallCallee" {
				vector, vok := budgetProduct(budget-used, 8, len(cells))
				ok = ok && vok
				fee, ok = budgetSum(budget-used, fee, vector, 16)
				ok = ok && vok
			}
			if !ok {
				fee = estimatedCostSum(-1, 0)
			}
			used = estimatedCostSum(used, fee)
		}
		if recipe.events[pc].kind == "GetValue" && pc+1 < len(recipe.events) && recipe.events[pc+1].kind == "AcquireCallCallee" {

			used = estimatedCostSum(used, 8)
		}
		if recipe.events[pc].kind == "AcquireValueCallCallee" {

			used = estimatedCostSum(used, 8)
		}
		used = estimatedCostSum(used, 1)
		e := recipe.events[pc]
		// Prepay scans performed by legacy local/Get/Put helpers. Array and copy
		// helpers meter their own reads. A scan cut leaves this event unapplied.
		if (recipe.hasArray || recipe.prefix || recipe.callBody) && (e.kind == "ReadCell" || e.kind == "ReadCapturedCell" || e.kind == "InstantiateModuleFunction" || (e.kind == "CreateClosedCallable" && e.callable != nil && len(e.callable.captureDeclarations) == 1) || e.kind == "InitializeCell" || e.kind == "GetValue" || e.kind == "PutValue" || (e.kind == "DefineSlot" || e.kind == "DefineAccessorSlot")) {
			enough := true
			for row := a.branch.state.storage; row != nil; row = row.previous {

				cost := 1
				if e.kind == "ReadCapturedCell" || e.kind == "CreateClosedCallable" || e.kind == "InstantiateModuleFunction" {
					cost = 6
				}
				used = estimatedCostSum(used, cost)
			}
			if !enough {
				a = cutAt("storage scan budget", pc)
				break
			}
		}
		if recipe.binding != nil && a.binding != nil && a.binding.elementNode() != nil && a.binding.elementNode().Initializer() != nil && pc == a.binding.elementLabels().initialize {
			prepared, estimate, ok := o.prepareBindingInitialization(a, recipe, pc, values, ready, cells, choices)
			if !ok {
				a = cutAt("Binding initialization result association", pc)
				break
			}
			a = prepared
			used = estimatedCostSum(used, estimate)
		}
		if recipe.binding != nil && e.kind == "InitializeCell" && recipe.binding.elementAtPC(pc) != nil && !bindingElementInitializeReady(a, recipe, pc, values, ready, cells) {
			a = cutAt("Binding element pre-Initialize association/headroom", pc)
			break
		}
		if len(choices) > 0 && (e.kind == "Return" || e.kind == "Throw" || e.kind == "FinallyPark" || e.kind == "FinallyRoute") {
			a = cutAt("Call terminal expression stack", pc)
			break
		}
		if recipe.finally != nil && (e.kind == "FinallyPark" || e.kind == "FinallyRoute") {
			if e.kind == "FinallyPark" {
				frame, ok := o.parkFinally(a, entry, activeFinally)
				if !ok {
					a = cutAt("Finally park association", pc)
					break
				}
				activeFinally = frame
				a.finally = frame
				// The parked origin owns the detached try snapshot. The live loop
				// retains current buffers and captures them again only on a cut.
				a.storage = nil
				a.completion, a.value, a.returnBoundary = languageNormal, languageValue{}, languageID{}
			} else {
				a.storage = snapshot(pc, nil)
				a = o.routeFinally(a, activeFinally, entry)
				activeFinally = a.finally
				if a.completion != languageResidual {
					a.storage = snapshot(pc+1, nil)
				}
			}
			pc++
			continue
		}

		if recipe.binding != nil && bindingFamilyEvent(e.kind) {
			var ok bool
			a, ok = o.bindingFamilyStep(a, recipe, pc, values, references, ready, cells)
			if !ok {
				a = cutAt("Binding family association", pc)
				break
			}
			// A certified H route is a completed statement, not an unfinished
			// child. It needs no open parent snapshot or ready VALUE result.
			finishedThrow := a.completion == languageThrow && pc == recipe.binding.route && a.binding != nil && a.binding.routed
			if a.completion == languageNormal {
				values[e.out], ready[e.out] = a.value, true
			} else if !finishedThrow {
				a.storage = snapshot(pc, nil)
			}
			if emptyBindingObserve != nil {
				emptyBindingObserve(recipe, pc, a, used+baseSetup)
			}
			if finishedThrow {
				pc++
				continue
			}
			if a.completion != languageNormal {
				break
			}
			pc = bindingSuccessor(recipe, pc, a)
			continue
		}

		if _, invoke, initializer := sourceInitializerCallLayout(recipe); initializer && pc == invoke {
			p := candidates[0]
			if conditionalFieldObserve != nil {
				// Validation borrows current buffers before the consumer. This
				// zero-ID view is not an issued or resumable continuation.
				observed := a
				observed.storage = &storageContinuation{recipe: recipe, pc: pc, cells: cells, values: values, ready: ready, callInputs: a.callInputs, childBranch: a.branch}
				conditionalFieldObserve(p.history, observed)
			}
			work := languageCopyWork{remaining: budget - used}
			readyCall := p.initializerCallReady(recipe, a, cells, values, ready, &work)
			used = estimatedCostSum(used, work.used)
			if !readyCall {
				a = cutAt("initializer original Call association", pc)
				break
			}
			out, spent := o.consumeClosedCallInputs(parentInput, a, budget-used, p)
			used = estimatedCostSum(used, spent)
			a = out
			returnWork := languageCopyWork{remaining: budget - used}
			supported := initializerReturnSupported(a, &returnWork)
			used = estimatedCostSum(used, returnWork.used)
			if a.callHistory == nil || !a.callHistory.validResult(a) || !supported {
				if a.completion == languageNormal {
					a = cutAt("initializer scalar Return unavailable", pc)
				}
				break
			}
			// Retain the actual issued result before caller initialization changes
			// state. It is history, never another activation or publication right.
			copyWork, addressable := storageEventCopyCharge(a, a.callInputs, int(^uint(0)>>1))
			if !addressable {
				a = cutAt("initializer receipt storage addressability", pc)
				break
			}
			used = estimatedCostSum(used, estimatedCostSum(copyWork, int(unsafe.Sizeof(languageReceipt{}))+int(unsafe.Sizeof(languageAlternative{}))))
			receipt := o.receipt(parentInput, []languageAlternative{a})
			if receipt == nil {
				a = cutAt("initializer receipt capacity", pc)
				break
			}
			p.history.callReceipts = []*languageReceipt{receipt}
			values[e.out], ready[e.out] = a.value, true
			a.storage = nil
			pc++
			continue
		}

		if recipe.binding != nil && e.kind == "InvokeAcquiredCall" {
			d, invoke, isDefault := bindingDefaultCallLayout(recipe, recipe.binding)
			if isDefault && pc == invoke {
				p := candidates[0]
				if p.entryInputs != nil || callInputs == nil || a.callInputs == nil || !sameLanguageCallInputs(callInputs, a.callInputs) || !acquired(e.a) || ready[e.out] || len(choices) != 1 || choices[0] != (storageChoice{destination: d.out, merge: d.merge, end: d.end}) {
					a = cutAt("Default Invoke association", pc)
					break
				}
				parent := a
				a.storage = snapshot(pc, nil)
				p.entryInputs = a.callInputs
				out, spent := o.consumeClosedCallInputs(a.callInputs.targetOrigin.input, a, budget-used, p)
				p.entryInputs = nil
				used = estimatedCostSum(used, spent)
				a = out
				if a.callHistory == nil || !a.callHistory.validCompletion(a) || a.completion != languageThrow {
					a = cutAt("Default Call incomplete", pc)
					break
				}
				a.binding, a.finally = parent.binding, parent.finally
				a.storage, a.callInputs = nil, nil
				callInputs, targetOrigin = nil, nil
				if !bindingDefaultChild(a.binding, a) {
					a = cutAt("Default completed child association", pc)
					break
				}
				choices = choices[:len(choices)-1]
				pc = recipe.binding.park
				continue
			}
		}
		if recipe.binding != nil && e.kind == "InvokeAcquiredCall" {
			site := recipe.binding.site(pc)
			p := candidates[0]
			if site == nil || p.history.recipe != recipe || p.bindingPhase != recipe.binding.siteOrdinal(site) || callInputs == nil || callInputs.bindingSite != site || !callInputs.complete || !acquired(e.a) {
				a = cutAt("Binding invocation site association", pc)
				break
			}
			// The child retains its own immutable family history. Its active
			// context cannot replace the parent's context when buffers resume.
			parent := a
			p.bindingSite = site
			out, spent := o.consumeClosedCallInputs(parentInput, a, budget-used, p)
			p.bindingSite = nil
			used = estimatedCostSum(used, spent)
			a = out
			throwingClose := bindingCloseRole(recipe.binding, site) && a.completion == languageThrow
			throwingNext := bindingStepDescriptor(recipe.binding, site) != nil && a.completion == languageThrow
			throwingFirst := bindingFirstRole(recipe.binding, site) && a.completion == languageThrow
			numberNext := bindingNextNumberResult(a, recipe.binding, site)
			numberFirst := bindingFirstNumberResult(a, recipe.binding, site)
			throwingProtocol := throwingClose || throwingNext || throwingFirst
			if a.completion != languageNormal && !throwingProtocol {
				a = o.bindingResidual(a, "Binding protocol outcome unsupported", recipe.binding)
				a.finally = parent.finally
				a.storage = snapshot(pc, nil)
				break
			}
			if throwingNext || numberNext {
				descriptor := bindingStepDescriptor(recipe.binding, site)
				ordinal := recipe.events[descriptor.initialize].cell
				if ordinal < 0 || ordinal >= len(cells) {
					a = cutAt("Binding Next target ordinal", pc)
					break
				}
				if _, ok := bindingNextThrowTarget(recipe.binding, a, cells[ordinal]); !ok {
					a = o.bindingResidual(a, "Binding Next target association", recipe.binding)
					a.finally = parent.finally
					a.storage = snapshot(pc, nil)
					break
				}
			}
			var ok bool
			a, ok = bindingAdoptChild(a, recipe.binding, site, parent)
			if !ok {
				if throwingProtocol {
					reason := "Binding Close completion association"
					if throwingFirst {
						reason = "Binding first completion association"
					}
					a = o.bindingResidual(a, reason, recipe.binding)
					a.finally = parent.finally
					a.storage = snapshot(pc, nil)
				} else {
					a = cutAt("Binding child object association", pc)
				}
				break
			}
			if a.completion == languageNormal {
				values[e.out], ready[e.out] = a.value, true
			}
			// Validation-only observation of the new typed handoff. The live
			// header is still present here, before it is cleared below.
			if throwingProtocol && emptyBindingObserve != nil {
				emptyBindingObserve(recipe, pc, a, used+baseSetup)
			}
			// Child raw/history own their immutable snapshots. The parent still owns
			// these live buffers, and never copies a child recipe as its own active PC.
			a.storage = nil
			a.callInputs = nil
			callInputs = nil
			targetOrigin = nil
			if !throwingProtocol && emptyBindingObserve != nil {
				emptyBindingObserve(recipe, pc, a, used+baseSetup)
			}
			// Next failures set Done. First-site failures have no iterator record.
			// Both stop before any later protocol Get, initialization or Close.
			if throwingNext || numberNext || numberFirst || throwingFirst {
				break
			}
			pc++
			continue
		}
		// Select an actual own descriptor once. The data path still uses the
		// ordinary sequence owner. Only prefix getter roles enter this adapter.
		var selectedGet languageAlternative
		var getterInstall *languageStorage
		if e.kind == "GetValue" {
			if e.a < 0 || e.a >= len(references) || !acquired(e.a) {
				a = cutAt("Get reference unavailable", pc)
				break
			}
			selectedGet, getterInstall = o.selectGetReference(a.branch, references[e.a])
		}
		if e.kind == "GetValue" && recipe.prefix && getterInstall != nil && (recipe.binding == nil || bindingGetterRole(recipe, pc) != 0) {
			parent := a
			reference := references[e.a]
			if !getterDescriptorPayload(getterInstall.descriptor) || !shortCircuitCanonical(parent) || len(candidates) != 1 || candidates[0].entryInputs != nil {
				a = cutAt("Own getter descriptor/admission unavailable", pc)
				break
			}
			if recipe.binding != nil {
				receiverPC, receiver, valid := bindingGetterReceiver(recipe, pc, parent)
				if !valid || !acquired(receiverPC) || values[receiverPC] != receiver || reference.receiver != receiver || bindingGetterRole(recipe, pc) == bindingCloseGetterRole && parent.callInputs != nil || bindingGetterRole(recipe, pc) == bindingFirstGetterRole && (parent.callInputs != nil || callInputs != nil || targetOrigin != nil) {
					a = cutAt("Binding getter source/read context unavailable", pc)
					break
				}
			}
			// H+1 is an actual finished-Get observation, not an object result.
			// Charge only the extra conservative copy population above H.
			horizon, hok := budgetSum(budget-used, len(parent.objects), 1)
			if !hok {
				a = cutAt("Getter history addressability", pc)
				break
			}
			if _, ok := budgetProduct(budget-used, len(cells), int(unsafe.Sizeof(languageLexical{}))); !ok {
				a = cutAt("Getter lexical header addressability", pc)
				break
			}
			before, bok := storageEventCopyCharge(parent, callInputs, budget-used, len(parent.objects))
			after, aok := storageEventCopyCharge(parent, callInputs, budget-used, horizon)
			if !bok || !aok {
				a = cutAt("Getter history addressability", pc)
				break
			}
			used = estimatedCostSum(estimatedCostSum(used, max(0, after-before)), 8)
			origin := &languageCallTargetOrigin{getterInstall: getterInstall, recipe: recipe, referencePC: e.a, getPC: pc, acquirePC: -1, reference: reference, input: parent.branch, output: parent.branch, value: getterInstall.descriptor.value}
			header := &languageCallInputs{targetOrigin: origin, category: callReferenceTarget, call: e.node, callee: origin.value, calleeBranch: parent.branch, reference: reference, receiver: reference.receiver, calleeReady: true, complete: true}
			// Lexicals describe the source frame, never getter captures.
			header.lexicals = make([]languageLexical, len(cells))
			for i, cell := range cells {
				header.lexicals[i] = languageLexical{declaration: recipe.declarations[i], cell: cell}
			}
			child := parent
			child.callInputs = header
			candidates[0].entryInputs = header
			out, spent := o.consumeClosedCallInputs(parentInput, child, budget-used, candidates[0])
			candidates[0].entryInputs = nil
			used = estimatedCostSum(used, spent)
			if out.completion != languageNormal && out.completion != languageThrow || (bindingGetterRole(recipe, pc) == bindingCloseGetterRole || bindingGetterRole(recipe, pc) == bindingFirstGetterRole) && out.completion != languageThrow {
				a = out
				if a.completion == languageNormal {
					a = shortCircuitCut(a, "Own getter completion association", a.value)
				}

				// Row retains the child header/pending raw outcome. Snapshot
				// retains the independent parent header and original buffers.
				a.finally, a.binding = parent.finally, parent.binding
				a.storage = snapshot(pc, nil)
				break
			}
			var getterTarget languageCell
			if recipe.binding != nil && out.completion == languageThrow && bindingGetterRole(recipe, pc) != bindingCloseGetterRole {
				var targetOK bool
				getterTarget, targetOK = bindingGetThrowTarget(recipe, pc, out, cells)
				if !targetOK {
					a = shortCircuitCut(out, "Binding getter target unavailable", out.value)
					a.finally, a.binding = parent.finally, parent.binding
					a.storage = snapshot(pc, nil)
					break
				}
			}
			finished, ok := o.finishOwnGetterGet(parent, out, recipe, pc, reference)
			if !ok {
				a = shortCircuitCut(out, "Getter finished Get association/capacity", out.value)
				a.finally, a.binding = parent.finally, parent.binding
				a.storage = snapshot(pc, nil)
				break
			}
			if recipe.binding != nil && finished.completion == languageThrow {
				var adopted bool
				finished, adopted = adoptBindingGetThrow(parent, finished, recipe, pc, getterTarget)
				if !adopted {
					a = shortCircuitCut(out, "Binding getter Throw adoption unavailable", out.value)
					a.finally, a.binding = parent.finally, parent.binding
					a.storage = snapshot(pc, nil)
					break
				}
			}
			a = finished
			if recipe.binding != nil && emptyBindingObserve != nil {
				emptyBindingObserve(recipe, pc, a, used)
			}
			if a.completion == languageThrow {
				if recipe.binding != nil && bindingDefaultGetterRoute(recipe, recipe.binding.route, a) {
					pc = recipe.binding.route
					continue
				}
				break
			}
			values[e.out], ready[e.out] = a.value, true
			// Explicit adoption replaces the ordinary sequence at this Get.
			pc++
			continue
		}
		nextPC := pc + 1
		var progress *languageCopyProgress
		expressionDisposition := expressionSelectionOrdinary
		step := func(prior languageAlternative) []languageAlternative {
			b := prior.branch
			out := languageAlternative{branch: b}
			needA := e.kind != "SourceWellKnownIteratorKey" && e.kind != "StaticWellKnownIteratorKey" && e.kind != "Literal" && e.kind != "AllocateObject" && e.kind != "AllocateArray"
			needB := numberBinaryOperator(e.kind) != ast.KindUnknown || e.kind == "InstallIteratorRecord" || e.kind == "AcquireCallCallee" || e.kind == "DefineSlot" || e.kind == "DefineAccessorSlot" || e.kind == "DefineArraySlot" || e.kind == "PutArrayLength" || e.kind == "PutValue" || e.kind == "CopyDataProperties"
			// Cells use a separate preallocated namespace, not an operand register.
			if e.kind == "ReadThisValue" || e.kind == "ReadCell" || e.kind == "ReadCapturedCell" || e.kind == "ResolveLexicalReference" || e.kind == "CreateClosedCallable" || e.kind == "InstantiateModuleFunction" || e.kind == "ReadAcquiredArgument" {
				needA = false
			}
			if e.out < 0 || e.out >= len(values) || (needA && !acquired(e.a)) || (needB && !acquired(e.b)) {
				return []languageAlternative{storageResidual(b, "storage operand unavailable")}
			}
			if needA && storageKeyRegister(recipe, e.a) || needB && storageKeyRegister(recipe, e.b) {
				return []languageAlternative{storageResidual(b, "KEY used as VALUE or Reference")}
			}
			switch e.kind {
			case "ReadAcquiredArgument":
				if entry == nil || !entry.inputs.complete || e.cell < 0 {
					return []languageAlternative{storageResidual(b, "acquired argument unavailable")}
				}
				if e.cell < len(entry.inputs.arguments) {
					out.value = entry.inputs.arguments[e.cell].value
				} else {
					out.value = languageValue{undefined: true}
				}
			case "NumberNegate":
				if !numericNegateReady(recipe, pc, ready) {
					return []languageAlternative{shortCircuitCut(prior, "NumberNegate operand association/role", languageValue{})}
				}
				work := languageCopyWork{remaining: budget - used}
				out = negateSuccessor(prior, values[e.a], e.node, &work, &expressionDisposition)
				used = estimatedCostSum(used, work.used)
			case "NumberAdd", "NumberSubtract", "NumberMultiply", "NumberDivide", "NumberRemainder":
				if !numericBinaryReady(recipe, pc, ready) {
					return []languageAlternative{shortCircuitCut(prior, numberArithmeticName(numberBinaryOperator(e.kind))+" operand association/role", languageValue{})}
				}
				work := languageCopyWork{remaining: budget - used}
				out = arithmeticSuccessor(prior, values[e.a], values[e.b], e.node, &work, &expressionDisposition, numberBinaryOperator(e.kind))
				used = estimatedCostSum(used, work.used)
			case "NumberLessThan", "NumberStrictEqual", "NumberGreaterThan", "NumberLessThanOrEqual", "NumberGreaterThanOrEqual", "NumberStrictNotEqual":
				if !numericBinaryReady(recipe, pc, ready) {
					return []languageAlternative{shortCircuitCut(prior, "Comparison operand association/role", languageValue{})}
				}
				work := languageCopyWork{remaining: budget - used}
				out = comparisonSuccessor(prior, values[e.a], values[e.b], e.node, numberBinaryOperator(e.kind), &work, &expressionDisposition)
				used = estimatedCostSum(used, work.used)
			case "Typeof":
				if !typeofReady(recipe, pc, ready) {
					return []languageAlternative{shortCircuitCut(prior, "typeof operand association/role", languageValue{})}
				}
				work := languageCopyWork{remaining: budget - used}
				out = typeofSuccessor(prior, values[e.a], e.node, &work, &expressionDisposition)
				used = estimatedCostSum(used, work.used)
			case "LogicalNot":
				work := languageCopyWork{remaining: budget - used}
				out = booleanSuccessor(prior, values[e.a], e.node, &work)
				used = estimatedCostSum(used, work.used)
			case "MergeConditional":
				out, nextPC = conditionalMerge(prior, recipe, pc, values, ready, &choices)
				// conditional merge observation
			case "MergeShortCircuit":
				out = shortCircuitMerge(prior, e, pc, values, ready, &choices)
			case "Literal":
				value, known := acquireLiteralValue(e.value)
				if !known {
					expressionDisposition = expressionPredicateUnavailable
					return []languageAlternative{shortCircuitCut(prior, "Literal Number unavailable", e.value)}
				}
				out.value = value
			case "CreateClosedCallable", "InstantiateModuleFunction":
				if e.kind == "CreateClosedCallable" && entry != nil && moduleActivationCaptureCreator(entry.proof.arrow) {
					used = estimatedCostSum(used, len(cells)+4)
					out = o.createActivationCapturedCallable(b, e.callable, cells, entry)
					break
				}
				if e.callable != nil && len(e.callable.captureDeclarations) == 1 {
					// Acquire only the selected actual cell, without copying a prefix vector.
					used = estimatedCostSum(used, len(recipe.declarations)+1)
					var selected languageLexical
					count := 0
					for i, declaration := range recipe.declarations {
						if declaration == e.callable.captureDeclarations[0] && i < len(cells) {
							selected = languageLexical{declaration: declaration, cell: cells[i]}
							count++
						}
					}
					var lexicals []languageLexical
					if count == 1 {
						lexicals = []languageLexical{selected}
					}
					var candidate *closedPrefixCandidate
					if len(candidates) == 1 {
						candidate = candidates[0]
					}
					if e.kind == "InstantiateModuleFunction" {
						if e.cell < 0 || e.cell >= len(cells) || recipe.declarations[e.cell] != e.node {
							return []languageAlternative{storageResidual(b, "module function binding layout")}
						}
						out = o.instantiateModuleFunction(b, e.callable, callInputs.lexicals, cells[e.cell], candidate)
					} else {
						out = o.createModuleCapturedCallable(b, e.callable, lexicals, candidate)
					}
				} else if e.kind == "InstantiateModuleFunction" {
					if e.callable != nil && moduleActivationCaptureCreator(e.callable.arrow) && e.cell >= 0 && e.cell < len(cells) {
						out = o.instantiateModuleFunction(b, e.callable, callInputs.lexicals, cells[e.cell], candidates[0])
					} else {
						out = storageResidual(b, "module function capture layout")
					}
				} else {
					out = o.createClosedCallable(b, e.callable)
				}
			case "ResolveLexicalReference":
				if e.cell < 0 || e.cell >= len(cells) {
					return []languageAlternative{storageResidual(b, "lexical cell unavailable")}
				}
				references[e.out] = languageReference{id: o.identity(), cell: cells[e.cell], strict: true}
			case "AcquireCallCallee":
				if recipe.binding != nil && callInputs == nil {
					_, invoke, isDefault := bindingDefaultCallLayout(recipe, recipe.binding)
					if isDefault && pc == invoke-2 {
						callInputs = &languageCallInputs{call: e.node}
						for i, c := range cells {
							callInputs.lexicals = append(callInputs.lexicals, languageLexical{declaration: recipe.declarations[i], cell: c})
						}
					}
				}
				if recipe.binding != nil && callInputs == nil {
					var site *bindingCallSite
					for _, s := range recipe.binding.sites() {
						if s.acquire == pc {
							site = s
						}
					}
					if site == nil {
						return []languageAlternative{storageResidual(b, "Binding header site")}
					}
					callInputs = &languageCallInputs{call: recipe.binding.declaration, bindingSite: site}
					for i, c := range cells {
						callInputs.lexicals = append(callInputs.lexicals, languageLexical{declaration: recipe.declarations[i], cell: c})
					}
				}
				if callInputs == nil {
					return []languageAlternative{storageResidual(b, "Call inputs unavailable")}
				}
				callInputs.callee = values[e.a]
				callInputs.reference = references[e.b]
				callInputs.category = callReferenceTarget
				callInputs.targetOrigin = targetOrigin
				if recipe.binding != nil && bindingStepDescriptor(recipe.binding, callInputs.bindingSite) != nil && bindingStepDescriptor(recipe.binding, callInputs.bindingSite).index > 0 {
					targetOrigin = bindingRetainedNextOrigin(prior, callInputs.bindingSite)
					if targetOrigin == nil {
						return []languageAlternative{storageResidual(b, "Retained Next source prefix unavailable")}
					}
					callInputs.targetOrigin = targetOrigin
				}
				callInputs.receiver = languageValue{undefined: true}
				if references[e.b].cell.id.owner == nil {
					callInputs.receiver = references[e.b].receiver
				}

				callInputs.calleeBranch = b
				if recipe.binding != nil && bindingStepDescriptor(recipe.binding, callInputs.bindingSite) != nil && bindingStepDescriptor(recipe.binding, callInputs.bindingSite).index > 0 {
					callInputs.calleeBranch = targetOrigin.output
				}
				callInputs.calleeReady = true
				if !validCallTarget(o, callInputs) {
					return []languageAlternative{storageResidual(b, "Call target origin association")}
				}
				out.value = values[e.a]
			case "AcquireValueCallCallee":
				// This semantic event is constructor-only. No source adapter emits it.
				if callInputs == nil || !valueTargetProducer(recipe, pc, e.a) {
					return []languageAlternative{storageResidual(b, "Value target producer unavailable")}
				}
				callInputs.category = callValueTarget
				callInputs.reference = languageReference{}
				callInputs.receiver = languageValue{undefined: true}
				callInputs.targetOrigin = nil
				callInputs.valueOrigin = &languageCallValueOrigin{recipe: recipe, valuePC: e.a, acquirePC: pc, input: b, output: b, value: values[e.a]}
				callInputs.callee = values[e.a]
				callInputs.calleeBranch = b
				callInputs.calleeReady = true
				if !validCallTarget(o, callInputs) {
					return []languageAlternative{storageResidual(b, "Value target origin association")}
				}
				out.value = values[e.a]
			case "AcquireCallArgument":
				if callInputs == nil || !callInputs.calleeReady || e.cell != len(callInputs.arguments) {
					return []languageAlternative{storageResidual(b, "Call argument order")}
				}
				input := callInputs.calleeBranch
				if len(callInputs.arguments) > 0 {
					input = callInputs.arguments[len(callInputs.arguments)-1].output
				}
				callInputs.arguments = append(callInputs.arguments, languageCallArgument{value: values[e.a], input: input, output: b})
				out.value = values[e.a]
			case "FinalizeCallInputs":
				if callInputs == nil || !callInputs.calleeReady || len(callInputs.arguments) != e.cell {
					return []languageAlternative{storageResidual(b, "Call inputs incomplete")}
				}
				callInputs.complete = true
				if callInputs.callee.callable == nil {
					out = languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
				} else {
					out = languageAlternative{branch: b}
				}
				out.callInputs = copyLanguageCallInputs(callInputs)

			case "AllocateObject":
				out.branch, out.value = o.allocateObject(b)
			case "AllocateArray", "DefineArraySlot", "ArrayLength", "PutArrayLength":
				work := languageCopyWork{remaining: budget - used}
				switch e.kind {
				case "AllocateArray":
					out = o.allocateArray(b, e.node, &work)
				case "DefineArraySlot":
					key, valid := storageKeyOperand(recipe, pc, e, ready)
					if !valid {
						return []languageAlternative{storageResidual(b, "Array define key role unavailable")}
					}
					out = o.defineArrayData(b, values[e.a].object, key, values[e.b], e.node, &work)
				case "ArrayLength":
					out = o.setArrayLength(b, values[e.a].object, float64(e.length), e.node, &work)
				case "PutArrayLength":
					out = o.setArrayLength(b, references[e.a].receiver.object, float64(e.length), e.node, &work)
				}
				used = estimatedCostSum(used, work.used)
			case "DefineAccessorSlot":
				out = o.defineGetter(b, values[e.a].object, values[e.b], recipe, pc, ready)
			case "DefineSlot":
				key, valid := storageKeyOperand(recipe, pc, e, ready)
				if !valid {
					return []languageAlternative{storageResidual(b, "Define key role unavailable")}
				}
				out = o.defineData(b, values[e.a].object, key, values[e.b])
			case "ObjectComplete", "ArrayComplete":
				out.value = values[e.a]
				out.objects = []storageObjectObservation{{recipe: recipe, node: e.node, pc: pc, receipt: o.receipt(b, []languageAlternative{{branch: b, value: out.value}})}}
			case "InitializeCell":
				if e.cell < 0 || e.cell >= len(cells) {
					return []languageAlternative{storageResidual(b, "storage cell unavailable")}
				}
				out = o.initializeLocal(b, cells[e.cell], values[e.a])
			// The loop preflight authenticated this immutable entry and exact recipe.
			// VALUE receiver transport shares the acquired header and allocates no cell.
			case "ReadThisValue":
				if entry == nil || (!ast.IsFunctionExpression(entry.proof.arrow) && !ast.IsGetAccessorDeclaration(entry.proof.arrow)) {
					return []languageAlternative{storageResidual(b, "this entry association")}
				}
				out.value = entry.inputs.receiver
			case "ReadCapturedCell":
				if entry != nil && activationParameterProof(entry.proof) {
					out = o.readActivationCapturedCell(b, entry, e.cell)
				} else {
					out = o.readModuleCapturedCell(b, entry, e.cell)
				}
			case "ReadCell":
				if e.cell < 0 || e.cell >= len(cells) {
					return []languageAlternative{storageResidual(b, "storage cell unavailable")}
				}
				out = o.readLocal(b, cells[e.cell])
			case "Member":
				key, valid := storageKeyOperand(recipe, pc, e, ready)
				if !valid {
					return []languageAlternative{storageResidual(b, "Member key role unavailable")}
				}
				references[e.out] = o.member(b, values[e.a], key)
				out.value = values[e.a]
			case "GetValue":
				out = selectedGet
				if out.completion == languageNormal && out.value.object != nil && entry != nil && bodyObjectGetPC(recipe) == pc {
					// Fixed preactivation payment covers this one bare receipt. No parent
					// history, entry or storage snapshot is recursively embedded in it.
					out.objects = []storageObjectObservation{{reference: references[e.a].id, recipe: recipe, node: e.node, pc: pc, receipt: o.receipt(b, []languageAlternative{{branch: out.branch, value: out.value}})}}
				}
				if out.completion == languageNormal && pc+1 < len(recipe.events) && recipe.events[pc+1].kind == "AcquireCallCallee" {
					targetOrigin = &languageCallTargetOrigin{recipe: recipe, referencePC: e.a, getPC: pc, acquirePC: pc + 1, reference: references[e.a], input: b, output: out.branch, value: out.value}
				}
			case "PutValue":
				out = o.putReference(b, references[e.a], values[e.b])
			case "RequireObjectCoercible":
				out = o.requireObjectCoercible(b, values[e.a])
			case "CopyDataProperties":
				work := languageCopyWork{remaining: budget - used}
				out, progress = o.copyDataProperties(b, values[e.a], values[e.b], e.excluded, &work)
				used = estimatedCostSum(used, work.used)
				if progress != nil {
					progress.nextPC = pc
				}
			case "MergeDefault":
				out = defaultMerge(prior, recipe, pc, values, ready, &choices)
			case "Throw":
				out.completion = languageThrow
				out.value = values[e.a]
			case "Return":
				out.completion = languageReturn
				if entry != nil {
					out.returnBoundary = entry.boundary
				}
				out.value = values[e.a]
			default:
				out = storageResidual(b, "unknown storage event")
			}
			return []languageAlternative{out}
		}
		if (prefixChoiceSelector(e.kind) || e.kind == "SelectDefault") && storageKeyRegister(recipe, e.a) {
			a = cutAt("KEY used as predicate VALUE", pc)
			break
		}
		if e.kind == "SourceWellKnownIteratorKey" {
			work := languageCopyWork{remaining: budget - used}
			if !sourceSymbolKeyReady(recipe, pc, a.branch, &work) {
				used = estimatedCostSum(used, work.used)
				a = cutAt("source KEY association/read budget", pc)
				break
			}
			used = estimatedCostSum(used, work.used)
		}
		if e.kind == "StaticWellKnownIteratorKey" || e.kind == "SourceWellKnownIteratorKey" {
			a = languageSequence([]languageAlternative{a}, func(prior languageAlternative) []languageAlternative {
				if e.out != pc || e.out < 0 || e.out >= len(ready) || ready[e.out] || e.keyProducerPC != -1 || !e.key.valid() || e.key != languageIteratorKey() || e.node == nil {
					return []languageAlternative{storageResidual(prior.branch, "KEY issuer unavailable")}
				}
				ready[e.out] = true
				return []languageAlternative{shortCircuitHeader(prior)}
			})[0]
		} else if e.kind == "SelectConditional" {
			a = languageSequence([]languageAlternative{a}, func(prior languageAlternative) []languageAlternative {
				out, next := conditionalSelect(prior, recipe, pc, values, ready, &choices, &expressionDisposition)
				nextPC = next
				return []languageAlternative{out}
			})[0]
		} else if shortCircuitOperator(e.kind) != ast.KindUnknown {
			a = languageSequence([]languageAlternative{a}, func(prior languageAlternative) []languageAlternative {
				out, next := shortCircuitSelect(prior, e, pc, len(recipe.events), values, ready, &choices, recipe.choiceSlots, &expressionDisposition)
				nextPC = next
				return []languageAlternative{out}
			})[0]
		} else if e.kind == "SelectDefault" {
			a = languageSequence([]languageAlternative{a}, func(prior languageAlternative) []languageAlternative {
				out, next := defaultSelect(prior, recipe, pc, values, ready, &choices, &expressionDisposition)
				nextPC = next
				return []languageAlternative{out}
			})[0]
		} else {
			if recipe.choiceSlots > 0 || recipe.prefix || recipe.callBody {
				a = languageSequence([]languageAlternative{a}, func(prior languageAlternative) []languageAlternative {
					if !shortCircuitCanonical(prior) {
						return []languageAlternative{shortCircuitCut(prior, "ShortCircuit invalid Normal pending metadata", languageValue{})}
					}
					rows := step(prior)
					for i := range rows {
						rows[i] = shortCircuitCarry(prior, rows[i])
					}
					return rows
				})[0]
			} else {
				a = languageSequence([]languageAlternative{a}, step)[0]
			}
			if a.completion == languageNormal || a.completion == languageReturn {
				values[e.out] = a.value
				ready[e.out] = true
			}
		}
		a.finally = activeFinally
		if recipe.binding != nil && e.kind == "InitializeCell" && a.binding != nil && pc == a.binding.elementLabels().initialize && a.completion == languageNormal {
			completed, estimate, ok := o.finishBindingElement(a, recipe, pc, values, ready, cells)
			if !ok {
				a = cutAt("Binding completed element association", pc)
				break
			}
			a = completed
			used = estimatedCostSum(used, estimate)
			nextPC = bindingSuccessor(recipe, pc, a)
		}
		if recipe.binding != nil && pc == recipe.binding.first.get && a.completion == languageNormal && bindingFirstMethodNumber(a.value) {
			estimate, capacityOK := o.bindingDataGetCharge(a)
			if !capacityOK {
				a = cutAt("First method Get capacity", pc)
				break
			}
			var sealed bool
			a, sealed = o.finishBindingFirstMethodGet(a, recipe, pc, targetOrigin, ready)
			if !sealed {
				a = cutAt("First method Get association", pc)
				break
			}
			used = estimatedCostSum(used, estimate)
		}
		if recipe.binding != nil && pc == recipe.binding.first.finalize && a.completion == languageThrow && a.callInputs != nil && bindingFirstMethodNumber(a.callInputs.callee) {
			var adopted bool
			a, adopted = o.finishBindingFirstMethodError(a, recipe, pc, ready)
			if !adopted {
				a = cutAt("First method error association", pc)
				break
			}
			callInputs, targetOrigin = nil, nil
			break
		}
		if recipe.binding != nil && pc == recipe.binding.close.get && a.completion == languageNormal && (bindingAbsentValue(recipe.binding, a.value) || bindingReturnGetNumberError(a.binding, a.value)) {
			estimate, chargeOK := o.bindingDataGetCharge(a)
			if !chargeOK || !bindingReturnGetPlan(recipe, pc) || pc < 0 || pc >= len(ready) || !ready[pc] || recipe.binding.close.invoke >= len(ready) || ready[recipe.binding.close.acquire] || ready[recipe.binding.close.finalize] || ready[recipe.binding.close.invoke] {
				a = cutAt("Return Get association/capacity", pc)
				break
			}
			var sealed bool
			a, sealed = o.finishBindingReturnGet(a, recipe, pc, targetOrigin)
			if !sealed {
				a = cutAt("Return Get producer unavailable", pc)
				break
			}
			used = estimatedCostSum(used, estimate)
			nextPC = bindingSuccessor(recipe, pc, a)
		} else if recipe.binding != nil && recipe.binding.elementNode(0) == nil && pc == recipe.binding.close.get && a.completion == languageNormal {
			// Unknown categories cannot become a generic noncallable TypeError.
			// Admitted callable payloads still use the existing target/Call proof.
			truth, known := acquiredBoolean(a.branch, a.value)
			if a.value.callable == nil || !known || !truth {
				a = cutAt("GetMethod return category unavailable", pc)
				break
			}
		}
		if recipe.finally != nil && a.completion == languageResidual {
			if expressionDisposition != expressionPredicateUnavailable {
				a = o.retainFinallyPending(a, activeFinally, entry)
			}
		}
		if recipe.binding != nil && recipe.binding.elementNode(0) != nil && a.completion != languageNormal {
			a = o.bindingResidual(a, "Binding protocol outcome unsupported", recipe.binding)
		}
		parameterGetSealed := false
		if entry != nil && e.kind == "GetValue" && a.completion == languageThrow && entry.proof.mapping.nullDefaultMember() != nil {
			if !o.canIssue(3) {
				a = cutAt("Parameter Get receipt capacity", pc)
				break
			}
			a.storage = snapshot(pc, nil)
			var ok bool
			a, ok = o.finishParameterDefaultGet(entry, a, selectedGet, recipe, pc)
			if !ok {
				a = cutAt("Parameter Get completion association", pc)
				break
			}
			parameterGetSealed = true
		}
		if !parameterGetSealed && (a.completion != languageNormal && a.completion != languageReturn || recipe.callBody && a.completion == languageReturn) {
			snapshotPC := pc
			if recipe.callBody && a.completion == languageReturn {
				snapshotPC = nextPC
			}
			if recipe.finally != nil && (a.completion == languageReturn || a.completion == languageThrow) {
				snapshotPC = nextPC
			}
			a.storage = snapshot(snapshotPC, progress)
		}
		if recipe.prefix || recipe.callBody {
			a.callInputs = copyLanguageCallInputs(callInputs)
		}
		// short circuit event observation
		// conditional event observation
		if recipe.symbolCase != nil && sourceSymbolObserve != nil {
			sourceSymbolObserve(recipe, pc, nextPC, a, ready, used+baseSetup, targetOrigin)
		}
		if recipe.binding != nil && emptyBindingObserve != nil {
			emptyBindingObserve(recipe, pc, a, used+baseSetup)
		}
		// storage event observation
		pc = nextPC
	}
	if _, _, initializer := sourceInitializerCallLayout(recipe); initializer && a.completion == languageNormal {
		// The extra sealed caller snapshot owns another register/cell vector.
		// Reuse the existing conservative storage allocation quotation.
		used = estimatedCostSum(used, storageScheduleSetup(recipe))
		a.storage = snapshot(len(recipe.events), nil)
	}
	if (recipe.prefix || recipe.callBody) && !suspendedOwnGetterInputs(recipe, a) {
		a.callInputs = copyLanguageCallInputs(callInputs)
	}
	return a, estimatedCostSum(used, baseSetup)
}

func (q *sourceValueQuery) executeOwnedStorageBody(body *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) bool {
	var recipe *storageRecipe
	var ok bool
	if inputs != nil && inputs.get != nil && inputs.get.ownedRequest != nil && inputs.get.ownedRequest.entered {
		recipe = inputs.get.ownedRequest.recipe
		ok = recipe != nil
	} else {
		recipe, ok = q.storageBodyRecipe(body, inputs)
	}
	if !ok {
		return false
	}
	budget := q.remaining
	// storage budget selection
	receipt, used := q.owner.language.executeStorageRecipe(recipe, budget)
	q.remaining -= used
	q.recordEstimatedCost(used)
	inputs.storage = &storageOwnedBody{body: body, receipt: receipt}
	// The closed recipe contains no external calls, this/capture writes or implicit
	// coercion. Its local writes cannot add caller effect donors. Existing callers'
	// independent unknowns are conserved rather than cleared by this result.
	alternatives, live := receipt.project()
	if !live {
		result.valueIncomplete = true
		return true
	}
	for _, a := range alternatives {
		if a.completion == languageResidual {
			result.valueIncomplete = true
			result.opaque = true
			result.thenIncomplete = true
		}
	}
	return true
}

// observeOwnedStorage consumes Return at precisely its installed callable boundary.
// Handled projection refusal never falls back to legacy return reconstruction.
func observeOwnedStorage(body *ast.Node, inputs *sourceValueInputs, observed *sourceResultObservation) bool {
	if inputs == nil || inputs.storage == nil {
		return false
	}
	owned := inputs.storage
	observed.owned = owned.receipt
	if request := inputs.get.ownedRequest; request != nil {
		population := &ownedGetPopulation{association: request.association, receipt: owned.receipt, boundary: body}
		*observed = projectOwnedGet(population)
		return true
	}
	if owned.body != body {
		observed.incomplete = true
		return true
	}
	alternatives, ok := owned.receipt.project()
	if !ok || len(alternatives) == 0 {
		observed.incomplete = true
		return true
	}
	for _, a := range alternatives {
		if a.completion == languageReturn && a.value.object == nil {
			observed.values = append(observed.values, sourceObservedValue{value: sourceValue{number: a.value.number, node: a.value.node, undefined: a.value.undefined, forwarded: languagePrimitiveForwarding(a.value)}})
		} else if a.completion != languageThrow {
			observed.incomplete = true
		}
	}
	// storage publication observation
	return true
}

// Continuation IDs denote immutable saved operand populations across defensive copies.
func sameStorageContinuation(a, b *storageContinuation) bool {
	return a == nil && b == nil || a != nil && b != nil && a.id == b.id
}

// storageBuffersAddressable checks actual dimensions and machine-size products.
// It is not an estimated-cost threshold or a global resident-memory guarantee.
func storageBuffersAddressable(r *storageRecipe) bool {
	if r == nil || r.locals < 0 || r.registers < 0 || r.choiceSlots < 0 || r.choiceSlots > r.registers || r.choiceSlots > len(r.events) {
		return false
	}
	for _, p := range []struct {
		count int
		size  uintptr
	}{{r.locals, unsafe.Sizeof(languageCell{})}, {r.registers, unsafe.Sizeof(languageValue{})}, {r.registers, unsafe.Sizeof(languageReference{})}, {r.registers, unsafe.Sizeof(false)}, {r.choiceSlots, unsafe.Sizeof(storageChoice{})}, {len(r.callSites), unsafe.Sizeof(closedPrefixCallSite{})}} {
		if p.size != 0 && uint64(p.count) > uint64(^uint(0)>>1)/uint64(p.size) {
			return false
		}
	}
	return true
}
