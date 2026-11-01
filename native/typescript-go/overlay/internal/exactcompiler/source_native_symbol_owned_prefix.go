package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// sourceSymbolCase preserves one native MAY hypothesis across exact key roles.
// Source facts and recipe are immutable at entry. input is installed once before
// any semantic event. No active query, frame, evaluator or KEY vector is retained.
type sourceSymbolCase struct {
	authority                    sourceNormalAuthority
	recipe                       *storageRecipe
	facts                        sourceSymbolNativeFacts
	firstPC, lastPC              int
	input                        languageBranch
	proofUsed, allocationReserve int
}

// sourceSymbolBindingDefaultShape is a recipe relation, not Symbol or Call
// authority. The caller already requires current authenticated prefixQualified
// source population. No alternative selector or later KEY is admitted here.
func sourceSymbolBindingDefaultShape(r *storageRecipe) (storageEvent, bool) {
	if r == nil || r.choiceSlots != 1 || r.binding == nil || !r.binding.valid(r) {
		return storageEvent{}, false
	}
	p := r.binding
	d, producer, ok := bindingDefaultLayout(r, p)
	if !ok || p.elementNode(0) == nil || p.elementNode(0).Initializer() != d.node ||
		producer <= p.elementLabels(0).valueGet ||
		!(p.first.invoke < p.record && p.record < p.elementLabels(0).step.invoke &&
			p.elementLabels(0).step.invoke < p.elementLabels(0).doneGet && p.elementLabels(0).doneGet < p.elementLabels(0).doneSelect &&
			p.elementLabels(0).doneSelect < p.elementLabels(0).valueGet && p.elementLabels(0).valueGet < p.elementLabels(0).selectValue &&
			p.elementLabels(0).selectValue < d.out && d.out < d.entry && d.entry <= producer &&
			producer < d.merge && d.merge < d.end && d.end == p.elementLabels(0).initialize &&
			p.elementLabels(0).initialize < p.park && p.park < p.close.member) {
		return storageEvent{}, false
	}
	return d, true
}

// bindingSymbolWrite recognizes only the complete immutable two-KEY binding
// shape. It grants no alias purity, native identity or execution authority.
// Both preparation and source inventory classification consume this same tuple.
func bindingSymbolWrite(r *storageRecipe) (first, last, put int, ok bool) {
	first, last, put = -1, -1, -1
	if r == nil || r.binding == nil || !r.binding.valid(r) || r.choiceSlots != 0 || r.registers != len(r.events) {
		return
	}
	for pc, e := range r.events {
		if e.out != pc || e.node == nil {
			return first, last, put, false
		}
		if e.kind == "SourceWellKnownIteratorKey" {
			if first < 0 {
				first = pc
			} else if last < 0 {
				last = pc
			} else {
				return first, last, put, false
			}
		}
		if e.kind == "PutValue" {
			if put >= 0 {
				return first, last, put, false
			}
			put = pc
		}
	}
	if first < 0 || last <= first || put != last+3 || put >= r.binding.first.member || !ast.IsComputedPropertyName(r.events[first].node.Parent) || last+2 >= len(r.events) {
		return first, last, put, false
	}
	write := r.events[put]
	if !ast.IsBinaryExpression(write.node) || write.node.Parent == nil || !closedPrefixAssignmentStatement(write.node.Parent) {
		return first, last, put, false
	}
	b := write.node.AsBinaryExpression()
	if !ast.IsElementAccessExpression(b.Left) || b.Left.AsElementAccessExpression().ArgumentExpression != r.events[last].node || write.a != last+1 || write.b != last+2 {
		return first, last, put, false
	}
	member, rhs := r.events[last+1], r.events[last+2]
	if member.kind != "Member" || member.node != b.Left || member.key != languageIteratorKey() || member.keyProducerPC != last || member.a != last-1 || last < 2 || r.events[last-1].kind != "GetValue" || r.events[last-2].kind != "ResolveLexicalReference" || r.events[last-1].a != last-2 {
		return first, last, put, false
	}
	if rhs.node != b.Right || !(rhs.kind == "Literal" && b.Right.Kind == ast.KindNumericLiteral || rhs.kind == "CreateClosedCallable" && ast.IsFunctionExpression(b.Right)) {
		return first, last, put, false
	}
	return first, last, put, true
}

// proveSourceSymbolPrefix owns the pure recipe/provenance proof used before
// case installation. It consumes existing checked scratch and actual source
// identities, never issuing a semantic ID or activation. A true result is not
// entry authority: prepareSourceSymbol still authenticates the live candidate,
// completed native selection and source facts before installing its one case.
func (p *closedPrefixCandidate) proveSourceSymbolPrefix(probe *sourceValueQuery, result *accessorCandidates, origins, cells []int, initialized []bool, defaultEvent storageEvent) (first, last int, ok bool) {
	first, last = -1, -1
	if p == nil || p.owner == nil || p.history == nil || p.source == nil || probe == nil || probe.owner != p.owner {
		return first, last, false
	}
	r := p.history.recipe
	if r == nil || len(origins) != r.registers || len(cells) != r.locals || len(initialized) != r.locals {
		return first, last, false
	}
	q := probe
	// Current prepare owner validates the exact sole-post-KEY default before scratch allocation.
	// This pure helper consumes that existing immutable event, never a new role.
	defaultChoice := r.choiceSlots != 0
	if defaultChoice && (defaultEvent.node == nil || defaultEvent.kind != "SelectDefault") {
		return first, last, false
	}
	// Count actual runtime KEY events once, before choosing a proof branch.
	// Old single-binding and ordinary Call modes retain their original walk.
	keyCount := 0
	for _, e := range r.events {
		if !probe.charge(result, e.node) {
			return first, last, false
		}
		if e.kind == "SourceWellKnownIteratorKey" {
			keyCount++
		}
	}
	twoBinding := r.binding != nil && keyCount == 2
	shapeFirst, shapeLast, shapePut, shapeOK := bindingSymbolWrite(r)
	if r.binding != nil && keyCount != 1 && !twoBinding || twoBinding && !shapeOK || r.binding == nil && keyCount != 2 {
		p.history.reason = "source Symbol finite KEY mode"
		return first, last, false
	}
	first, last = -1, -1
	definedObject, objectCell, aliasCell := 0, -1, -1
	objectComplete, wrote := false, false
	selectors, merges, keys := 0, 0, 0
	// One ordered walk. Prior event producers and exact AST/reference ownership
	// supply local/fresh-data laws. No source evaluation or second index exists.
	for pc, e := range r.events {
		if !probe.charge(result, e.node) || e.out != pc || pc >= r.registers || e.node == nil || !p.history.runtime[e.node] || ast.GetSourceFileOfNode(e.node) != p.source {
			p.history.reason = "source Symbol recipe membership"
			return first, last, false
		}
		if defaultChoice {
			if prefixChoiceSelector(e.kind) {
				if pc != defaultEvent.out || e.kind != "SelectDefault" {
					p.history.reason = "source Symbol foreign choice"
					return first, last, false
				}
				selectors++
			}
			if e.kind == "MergeDefault" || e.kind == "MergeShortCircuit" || e.kind == "MergeConditional" {
				if pc != defaultEvent.merge || e.kind != "MergeDefault" {
					p.history.reason = "source Symbol foreign merge"
					return first, last, false
				}
				merges++
			}
		}
		if e.kind == "SourceWellKnownIteratorKey" {
			keys++
			if first < 0 {
				first = pc
				if r.binding != nil && !twoBinding {
					last = pc
				}
			} else if last < 0 {
				last = pc
			} else {
				return first, last, false
			}
			if e.key != languageIteratorKey() || e.keyProducerPC != -1 {
				return first, last, false
			}
			// Single-KEY mode ends its prefix walk at this read. Validate the
			// exact deferred Getter construction/install suffix before that cut.
			if e.node.Parent != nil && ast.IsComputedPropertyName(e.node.Parent) && e.node.Parent.Parent != nil && ast.IsGetAccessorDeclaration(e.node.Parent.Parent) {
				if twoBinding || r.binding == nil || !storageComputedGetterDefinition(r, pc+2) {
					return first, last, false
				}
				birth := r.events[pc+1]
				if !birth.callable.empty || birth.callable.entry == nil || !birth.callable.finalizedBodyProof(q.owner.language) {
					return first, last, false
				}
			}
			continue
		}
		if !twoBinding && last >= 0 {
			continue
		}
		if twoBinding && pc >= r.binding.first.member {
			if pc == r.binding.first.member {
				e := r.events[pc]
				if !wrote || !objectComplete || objectCell < 0 || aliasCell < 0 || e.a < 0 || e.a >= pc || origins[e.a] != definedObject || r.events[e.a].kind != "GetValue" || r.events[e.a].node != r.binding.declaration.Initializer() || r.events[e.a].a < 0 || r.events[e.a].a >= e.a || r.events[r.events[e.a].a].cell != objectCell {
					return first, last, false
				}
			}
			continue
		}
		prior := func(reg int) bool { return reg >= 0 && reg < pc && !storageKeyRegister(r, reg) }
		switch e.kind {
		case "StaticWellKnownIteratorKey":
			// The real binding emitter places this intrinsic key immediately
			// before GetIterator Member. It is not an authored Symbol read.
			if !twoBinding || pc+1 != r.binding.first.member || e.node != r.binding.declaration || e.key != languageIteratorKey() || e.keyProducerPC != -1 || !wrote {
				return first, last, false
			}
			member := r.events[r.binding.first.member]
			if member.kind != "Member" || member.node != r.binding.declaration || member.key != languageIteratorKey() || member.keyProducerPC != pc {
				return first, last, false
			}
		case "Literal":
			if e.value.node != e.node {
				return first, last, false
			}
		case "CreateClosedCallable":
			if e.callable == nil || e.callable.arrow != e.node || !e.callable.empty || e.callable.entry != nil && !e.callable.finalizedBodyProof(q.owner.language) {
				return first, last, false
			}
			if twoBinding && pc > shapeFirst && (e.callable.entry == nil || !e.callable.finalizedBodyProof(q.owner.language)) {
				return first, last, false
			}
		case "AllocateObject":
			if !ast.IsObjectLiteralExpression(e.node) {
				return first, last, false
			}
			origins[pc] = pc + 1
		case "InitializeCell":
			if !prior(e.a) || e.cell < 0 || e.cell >= len(cells) || initialized[e.cell] || e.cell >= len(r.declarations) || r.declarations[e.cell] != e.node {
				return first, last, false
			}
			if twoBinding && pc > shapeFirst {
				if definedObject == 0 || origins[e.a] != definedObject || !objectComplete {
					return first, last, false
				}
				if objectCell < 0 {
					allocation := r.events[definedObject-1].node
					if e.node.Initializer() != allocation {
						return first, last, false
					}
					objectCell = e.cell
				} else {
					if aliasCell >= 0 || wrote || r.events[e.a].kind != "GetValue" || r.events[e.a].a < 0 || r.events[e.a].a >= e.a || r.events[r.events[e.a].a].cell != objectCell {
						return first, last, false
					}
					aliasCell = e.cell
				}
			}
			initialized[e.cell] = true
			cells[e.cell] = origins[e.a]
		case "ResolveLexicalReference":
			if !ast.IsIdentifier(e.node) || e.cell < 0 || e.cell >= len(cells) || !initialized[e.cell] {
				return first, last, false
			}
			sym := q.owner.checker.GetSymbolAtLocation(e.node)
			if !probe.charge(result, e.node) || sym == nil || sym.ValueDeclaration != r.declarations[e.cell] {
				return first, last, false
			}
			origins[pc] = -e.cell - 1
		case "GetValue":
			if !prior(e.a) || r.events[e.a].kind != "ResolveLexicalReference" || r.events[e.a].node != e.node || origins[e.a] >= 0 {
				return first, last, false
			}
			slot := -origins[e.a] - 1
			if slot >= len(cells) || !initialized[slot] {
				return first, last, false
			}
			origins[pc] = cells[slot]
		case "Member":
			if !twoBinding || pc != shapeLast+1 || !prior(e.a) || aliasCell < 0 || origins[e.a] != definedObject || e.key != languageIteratorKey() || e.keyProducerPC != shapeLast || r.events[e.a].kind != "GetValue" || r.events[e.a].a < 0 || r.events[e.a].a >= e.a || r.events[r.events[e.a].a].cell != aliasCell {
				return first, last, false
			}
		case "PutValue":
			if !twoBinding || pc != shapePut || wrote || definedObject == 0 || !objectComplete || aliasCell < 0 || e.a != shapeLast+1 || e.b != shapeLast+2 {
				return first, last, false
			}
			wrote = true
		case "DefineAccessorSlot":
			if twoBinding && pc > shapeFirst {
				return first, last, false
			}
			if !prior(e.a) || !prior(e.b) || origins[e.a] <= 0 || origins[e.a]-1 >= pc || !ast.IsGetAccessorDeclaration(e.node) || e.node.Parent != r.events[origins[e.a]-1].node || e.node.Name() == nil {
				return first, last, false
			}
			if ast.IsComputedPropertyName(e.node.Name()) {
				if !storageComputedGetterDefinition(r, pc) || e.keyProducerPC != first {
					return first, last, false
				}
			} else if e.keyProducerPC != -1 || e.key != languageStringKey(e.node.Name().Text()) {
				return first, last, false
			}
			birth := r.events[e.b]
			if birth.kind != "CreateClosedCallable" || birth.node != e.node || birth.callable == nil || birth.callable.arrow != e.node || !birth.callable.empty || birth.callable.entry != nil && !birth.callable.finalizedBodyProof(q.owner.language) {
				return first, last, false
			}
		case "DefineSlot":
			if !prior(e.a) || !prior(e.b) || origins[e.a] <= 0 || origins[e.a]-1 >= pc || !ast.IsPropertyAssignment(e.node) || e.node.Parent != r.events[origins[e.a]-1].node {
				return first, last, false
			}
			if e.keyProducerPC == -1 {
				if e.key.kind != languageStringKeyKind || ast.IsComputedPropertyName(e.node.Name()) || e.key != languageStringKey(e.node.Name().Text()) {
					return first, last, false
				}
			} else {
				k := e.keyProducerPC
				if first < 0 || k != first || k >= pc || e.key != languageIteratorKey() || !ast.IsComputedPropertyName(e.node.Name()) || e.node.Name().AsComputedPropertyName().Expression != r.events[k].node {
					return first, last, false
				}
				if twoBinding {
					if definedObject != 0 || k != shapeFirst || objectCell >= 0 {
						return first, last, false
					}
					definedObject = origins[e.a]
				}
			}
		case "ObjectComplete":
			if !prior(e.a) || origins[e.a] <= 0 || r.events[origins[e.a]-1].node != e.node {
				return first, last, false
			}
			origins[pc] = origins[e.a]
			if twoBinding && origins[e.a] == definedObject {
				objectComplete = true
			}
		default:
			p.history.reason = "source Symbol unsupported predecessor role " + e.kind
			return first, last, false
		}
	}
	if twoBinding && (first != shapeFirst || last != shapeLast || !wrote || !objectComplete || objectCell < 0 || aliasCell < 0) {
		return first, last, false
	}
	if first < 0 || last < first || last == first && (r.binding == nil || !r.binding.valid(r)) {
		return first, last, false
	}
	if defaultChoice && (keys != 1 || selectors != 1 || merges != 1 ||
		first != last || first < 0 || first >= r.binding.first.member ||
		last >= r.binding.first.invoke || last >= defaultEvent.out) {
		p.history.reason = "source Symbol default is not after sole binding KEY"
		return first, last, false
	}
	return first, last, true
}

// prepareSourceSymbol is called only after actual matching and before entry.
// Its clean query consumes the same remaining balance, never active read context.
// Existing source selection owns dependency identities. The exact owned-prefix
// lemma below preserves a possible native premise, not global startup integrity.
func (p *closedPrefixCandidate) prepareSourceSymbol(q *sourceValueQuery) (*sourceSymbolCase, bool) {
	if p == nil || q == nil || !p.authenticated || p.released || p.owner != q.owner || p.history == nil || p.history.state != prefixQualified || !p.history.authority.valid(q) {
		return nil, false
	}
	r := p.history.recipe
	index, ok := q.owner.indexes[p.source]
	if !ok || index.incomplete || r == nil || r.symbolCase != nil {
		p.history.reason = "source Symbol index/recipe"
		return nil, false
	}
	// Only the one already-population-qualified binding default may use a
	// choice frame. Its KEY and full interval order are verified in the same
	// existing event walk below, before issuing sourceSymbolCase.
	defaultChoice := r.choiceSlots != 0
	var defaultEvent storageEvent
	if defaultChoice {
		var admitted bool
		defaultEvent, admitted = sourceSymbolBindingDefaultShape(r)
		if !admitted || r.binding.declaration != p.call || !p.history.runtime[defaultEvent.node] {
			p.history.reason = "source Symbol unsupported choice recipe"
			return nil, false
		}
	}
	// Source dependencies remain explicit. This first experiment cannot certify
	// a reached dependency initializer or an unavailable/opaque selected edge.
	probe := sourceValueQuery{owner: q.owner, executable: q.executable, remaining: q.remaining}
	result := accessorCandidates{}
	defer func() { q.remaining = probe.remaining }()
	for _, edge := range index.runtimeImports {
		_, state := probe.operationDependencyState(edge, &result)
		if state != sourceDependencyErased {
			p.history.reason = "source Symbol dependency unavailable for owned prefix"
			return nil, false
		}
	}
	// The live source collector must have completed this existing summary. Do not
	// synthesize a completed selection or invoke an evaluator to recover one.
	if _, cached := q.owner.summaries[p.source.AsNode()]; !cached {
		p.history.reason = "source Symbol completed source summary missing"
		return nil, false
	}
	// Checked capacity reservation precedes proof scratch and selection allocation.
	// Three one-entry maps (seen, normalSources, domains) each reserve a256-byte
	// normalized map/header bucket. Pointer stack growth and receipt/group objects
	// are counted separately. The existing population borrows the completed index.
	bytes := int(unsafe.Sizeof(sourcePropertyReferenceView{})) + int(unsafe.Sizeof(sourceNormalSourceIdentity{})) + int(unsafe.Sizeof(sourceNormalPopulation{})) + int(unsafe.Sizeof(sourceSymbolCase{})) + 3*256 + 2*int(unsafe.Sizeof(languageAlternative{})) + 3*int(unsafe.Sizeof("")) + 2*int(unsafe.Sizeof((*ast.SourceFile)(nil)))
	capacity, ok := budgetSum(probe.remaining, r.registers, r.locals, r.locals)
	if !ok {
		p.history.reason = "source Symbol proof capacity"
		return nil, false
	}
	scratch, ok := budgetProduct(probe.remaining, capacity, int(unsafe.Sizeof(int(0))))
	if !ok {
		p.history.reason = "source Symbol proof capacity"
		return nil, false
	}
	// Counts in bytes are converted only after checked arithmetic, not compared
	// to the semantic unit balance as byte units.
	totalBytes, ok := budgetSum(int(^uint(0)>>1), bytes, scratch, 255)
	if !ok {
		return nil, false
	}
	reserve := totalBytes / 256
	for i := 0; i < reserve; i++ {
		if !probe.charge(&result, p.call) {
			return nil, false
		}
	}
	start := q.remaining
	origins := make([]int, r.registers)
	cells := make([]int, r.locals)
	initialized := make([]bool, r.locals)
	first, last, proved := p.proveSourceSymbolPrefix(&probe, &result, origins, cells, initialized, defaultEvent)
	if !proved {
		return nil, false
	}
	// The real source selection builder completes synchronously on a frame-free
	// view. Its internal early normalSelectionDone flag is not the caller proof.
	v := sourcePropertyReferenceView{owner: q.owner, program: q.owner.program, checker: q.owner.checker, generation: q.owner.generation, executable: q.executable, source: p.source, root: p.source.AsNode()}
	probe.ensureNormalSourceSelection(&v, &result)
	facts, ok := probe.nativeSymbolSourceFacts(p.source, r.events[first].node, r.events[last].node, p.call, &v, &result, r)
	if !ok || facts.computedName == nil {
		p.history.reason = "source Symbol finite facts unavailable"
		return nil, false
	}
	// Six concrete association comparisons, separate from the shared walk.
	check := func(ok bool) bool { return probe.charge(&result, p.call) && ok }
	if !check(facts.computedName != nil) || !check(facts.computedName == r.events[first].node.Parent) || !check(facts.source == p.source) || !check(facts.first == index.normalOccurrences[r.events[first].node]) || !check(facts.last == index.normalOccurrences[r.events[last].node]) || !check(facts.call == p.entry) {
		return nil, false
	}
	return &sourceSymbolCase{authority: p.history.authority, recipe: r, facts: facts, firstPC: first, lastPC: last, proofUsed: start - probe.remaining, allocationReserve: reserve}, true
}

// sourceSymbolKeyReady pays all live validation and two standard data reads
// before setting KEY ready. This is conditional on S, not a current-global probe.
func sourceSymbolKeyReady(r *storageRecipe, pc int, b languageBranch, work *languageCopyWork) bool {
	if work == nil {
		return false
	}
	check := func(ok bool) bool { return work.spend(1) && ok }
	if !check(r != nil) || !check(r.symbolCase != nil) || !check(pc >= 0) || !check(pc < len(r.events)) {
		return false
	}
	s := r.symbolCase
	if !check(r.sourceSymbol) || !check(s.facts.first != nil) || !check(s.facts.last != nil) || !check(s.facts.source != nil) || !check(r.events[pc].kind == "SourceWellKnownIteratorKey") || !check(r.events[pc].node != nil) || !check(ast.GetSourceFileOfNode(r.events[pc].node) == s.facts.source) {
		return false
	}
	if !check(s.recipe == r) || !check(b.owner != nil) || !check(s.authority.owner != nil) || !check(s.authority.owner.language == b.owner) || !check(b.owner.live(b)) || !check(b.owner.live(s.input)) || !check(b.generation == s.input.generation) || !check(b.guard == "native Symbol standard") || !check(b.env == s.input.env) || !check(b.cursor >= s.input.cursor) || !check(s.authority.owner.program == s.authority.program) || !check(s.authority.owner.checker == s.authority.checker) || !check(s.authority.generation != nil) || !check(s.authority.generation.active) || !check(s.authority.owner.generation == s.authority.generation) {
		return false
	}
	// Persistent-state ancestry associates this paid read with the issued source
	// origin. Equal guards in another root are not execution authority.
	state := b.state
	for state != nil && state != s.input.state {
		if !work.spend(1) {
			return false
		}
		state = state.previous
	}
	if !check(state == s.input.state) {
		return false
	}
	if pc == s.firstPC {
		if !check(r.events[pc].node == s.facts.first.node) || !check(s.facts.computedName == r.events[pc].node.Parent) {
			return false
		}
	} else {
		if !check(pc == s.lastPC) || !check(s.firstPC < pc) || !check(r.events[pc].node == s.facts.last.node) {
			return false
		}
	}
	// The selected standard global read and the iterator own-data read are two
	// semantic acquisitions, paid separately from all validation comparisons.
	return work.spend(1) && work.spend(1)
}

// Diagnostic observer is nil in normal operation and cannot grant authority.
var sourceSymbolFirstLoss func(string)

// Optional private observers cannot grant native authority or increase fuel.
var sourceSymbolExecutionLimit func(int) int
var sourceSymbolObserve func(*storageRecipe, int, int, languageAlternative, []bool, int, *languageCallTargetOrigin)
