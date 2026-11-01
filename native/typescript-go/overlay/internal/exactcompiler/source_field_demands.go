package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceFieldDemand identifies a declaration-local field operation on one input
// slot. Identity associates admitted facts, never proves an activation or value.
type sourceFieldDemand struct {
	declaration, operation, slot *ast.Node
	key                          string
	use, consumer                *ast.Node
}

func (d sourceFieldDemand) identity() string {
	if d.declaration == nil || d.operation == nil || d.slot == nil {
		return ""
	}
	source := ast.GetSourceFileOfNode(d.declaration)
	return fmt.Sprintf("%s:%d:field:%d:slot:%d:%s", source.FileName(), d.declaration.Pos(), d.operation.Pos(), d.slot.Pos(), d.key) + fmt.Sprintf(":%p:%p", d.use, d.consumer)
}

type sourceFieldOutcome struct {
	demand    sourceFieldDemand
	fulfilled bool
}

// sourceFieldCall is a construction result, with no input frame or query retained.
// The invocation consumer sets coverage only after the complete selection closes.
type sourceFieldCall struct {
	// dependencies identifies effect coverage from per-use source substitution.
	// It supplies no normal output, descriptor or execution authority.
	dependencies         bool
	operation, target    *ast.Node
	calls                []sourceCallOutcome
	outcomes             []sourceFieldOutcome
	complete             bool
	descriptorOccurrence *sourceDescriptorEffectOccurrence
	descriptorEffects    []sourceDescriptorEffectOutcome
}

func (query *sourceValueQuery) fieldDemand(operation, receiver *ast.Node, key string) (sourceFieldDemand, *ast.Symbol) {
	if operation == nil || receiver == nil || key == "" {
		return sourceFieldDemand{}, nil
	}
	receiver = unwrapSourceCallableReference(receiver)
	root := receiver
	// Source obligations name the exact Get even when its receiver is a
	// projection of an input. Exact descriptor coverage keeps its direct-slot law.
	if query.dependenciesOnly {
		for ast.IsPropertyAccessExpression(root) || ast.IsElementAccessExpression(root) {
			root = unwrapSourceCallableReference(root.Expression())
		}
	}
	if !ast.IsIdentifier(root) {
		return sourceFieldDemand{}, nil
	}
	symbol := query.owner.checker.GetSymbolAtLocation(root)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return sourceFieldDemand{}, nil
	}
	declaration := enclosingCallableNode(operation)
	slotOwner := enclosingCallableNode(symbol.ValueDeclaration)
	if declaration == nil || slotOwner == nil {
		return sourceFieldDemand{}, nil
	}
	if ast.IsParameterDeclaration(symbol.ValueDeclaration) {
		// Naming a bound lexical read is not an activation/descriptor proof.
		// Exact coverage remains the responsibility of its separate consumer.
		if !ast.IsIdentifier(symbol.ValueDeclaration.Name()) || !ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation) {
			return sourceFieldDemand{}, nil
		}

		actual, selected := accessorReceiver(operation)
		if actual != receiver || selected != key {
			return sourceFieldDemand{}, nil
		}
	} else if (!ast.IsVariableDeclaration(symbol.ValueDeclaration) && !ast.IsBindingElement(symbol.ValueDeclaration)) || declaration == slotOwner {
		return sourceFieldDemand{}, nil
	}
	return sourceFieldDemand{declaration: declaration, operation: operation, slot: symbol.ValueDeclaration, key: key, use: query.effectUse(), consumer: query.effectOwner}, symbol
}

// operationFieldDemand names the authored receiver before alias projection.
// A traversal through an alias initializer must not change the obligation's slot.
func (query *sourceValueQuery) operationFieldDemand(operation *ast.Node, key string) sourceFieldDemand {
	if operation == nil || (!ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation)) {
		return sourceFieldDemand{}
	}
	receiver, selected := accessorReceiver(operation)
	if selected != key {
		return sourceFieldDemand{}
	}
	demand, _ := query.fieldDemand(operation, receiver, key)
	return demand
}

// missingNormalInput identifies an uninstalled normal-operand slot from the
// existing declaration summary. It does not infer a value from its initializer.
func (query *sourceValueQuery) missingNormalInput(symbol *ast.Symbol, read *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	owner := enclosingCallableNode(symbol.ValueDeclaration)
	consumer := enclosingCallableNode(read)
	// Local writer resolution can reach an initializer in its lexical owner.
	// The unavailable input belongs to the original member demand, not that
	// intermediate source occurrence. This classifies absence, never activation.
	if query.protectedMember != nil {
		consumer = enclosingCallableNode(query.protectedMember)
	}
	if owner == nil || consumer == nil || owner == consumer {
		return false
	}
	if _, installed := bindings[ast.GetSymbolId(symbol)]; installed {
		return false
	}
	if query.creators[owner].invocation != nil {
		return false
	}
	if !query.charge(result, read) {
		return false
	}
	_, described := query.owner.summary(owner).normalSlots[symbol.ValueDeclaration]
	return described
}

// missingFieldGet is shared by explicit member and pattern value consumers.
// The term is unknown, with an exact unavailable input cause. Residual unknown
// from any other alternative remains independent and is never relabeled.
func (query *sourceValueQuery) missingFieldGet(value sourceValue, key string, operation *ast.Node, result *accessorCandidates) bool {
	if value.entrySlot == nil {
		return false
	}
	// An intermediate acquisition may have no actual member operation. It
	// cannot publish a field demand and must retain ordinary uncertainty.
	if operation == nil {
		result.opaque = true
		result.valueIncomplete = true
		return true
	}
	declaration := enclosingCallableNode(operation)
	if query.dependenciesOnly {
		if demand := query.operationFieldDemand(operation, key); demand.declaration != nil {
			result.fieldFallbacks = append(result.fieldFallbacks, demand)
			result.valueIncomplete = true
			return true
		}
	}
	if declaration == nil || key == "" || len(value.path) != 0 || declaration == enclosingCallableNode(value.entrySlot) {
		result.opaque = true
	} else {
		demand := sourceFieldDemand{declaration: declaration, operation: operation, slot: value.entrySlot, key: key, use: query.effectUse(), consumer: query.effectOwner}
		if ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) {
			receiver, selectedKey := accessorReceiver(operation)
			if selectedKey == key {
				if requested, _ := query.fieldDemand(operation, receiver, key); requested.declaration != nil {
					// Preserve the actual demanded input slot across local writer
					// resolution. entrySlot remains the separate unavailable value
					// origin. Only this exact Get's complete actual outcome can match.
					demand = requested
				}
			}
		}
		result.fieldFallbacks = append(result.fieldFallbacks, demand)
	}
	result.valueIncomplete = true
	return true
}

// conditionalFieldCall projects only a live original schedule's finite field
// coverage. It issues no value/receipt and cannot be reconstructed after release.
func (h *closedPrefixHistory) conditionalFieldCall(row languageAlternative) (sourceFieldCall, bool) {
	if h == nil || h.authority.owner == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 || row.callHistory == nil || !row.callHistory.validResult(row) {
		return sourceFieldCall{}, false
	}
	owner := h.authority.owner
	candidate := owner.closedPrefixCandidate
	e := row.callHistory.entry
	if candidate == nil || candidate.history != h || candidate.slot == nil || candidate.slot.closedPrefix != h || candidate.call != h.call || !candidate.enteredCallable(owner.language, e.proof) || e.inputs.call != h.call || e.proof.source != h.source || h.authority.checker != owner.checker || h.authority.program != owner.program || h.authority.generation != owner.generation {
		return sourceFieldCall{}, false
	}
	raw := row.callHistory.raw.alternatives[0]
	r := e.proof.entry
	mapping := e.proof.mapping
	if mapping == nil || !e.proof.empty || r.finally != nil || raw.completion != languageReturn || raw.returnBoundary != e.boundary || !callBodySnapshot(e, raw) || raw.storage.pc != len(r.events) || len(raw.storage.choices) != 0 || raw.storage.copy != nil || len(raw.storage.ready) != r.registers || len(raw.storage.values) != r.registers || len(raw.storage.references) != r.registers {
		return sourceFieldCall{}, false
	}
	if mapping.objectDefaultMember() != nil {
		return h.objectDefaultFieldCall(row)
	}
	if len(e.inputs.arguments) != 2 {
		return sourceFieldCall{}, false
	}
	predicate := e.inputs.arguments[0].value
	if predicate.node == nil || predicate.node.Kind != ast.KindTrueKeyword && predicate.node.Kind != ast.KindFalseKeyword || predicate != (languageValue{node: predicate.node}) {
		return sourceFieldCall{}, false
	}
	take := predicate.node.Kind == ast.KindTrueKeyword
	body := unwrapSourceCallableReference(e.proof.arrow.Body())
	if body == nil || !ast.IsConditionalExpression(body) {
		return sourceFieldCall{}, false
	}
	member := body.AsConditionalExpression().WhenTrue
	if !mapping.conditionalMember(member) {
		return sourceFieldCall{}, false
	}
	selectPC, getPC := -1, -1
	for pc, event := range r.events {
		if event.kind == "SelectConditional" {
			if selectPC >= 0 {
				return sourceFieldCall{}, false
			}
			selectPC = pc
		}
		if event.kind == "GetValue" && event.node == member {
			if getPC >= 0 {
				return sourceFieldCall{}, false
			}
			getPC = pc
		}
	}
	choice, ok := conditionalLayout(r, selectPC)
	if !ok || getPC < 0 || choice.a < 0 || !raw.storage.ready[choice.a] || raw.storage.values[choice.a] != predicate || !raw.storage.ready[choice.out] || r.events[len(r.events)-1].kind != "Return" || r.events[len(r.events)-1].a != choice.out || raw.value != raw.storage.values[choice.out] {
		return sourceFieldCall{}, false
	}
	if raw.storage.ready[choice.merge] != take || raw.storage.ready[choice.end-1] == take {
		return sourceFieldCall{}, false
	}
	receiver := e.inputs.arguments[1].value
	key := languageStringKey(member.Name().Text())
	descriptor, present, complete, _ := owner.language.readOwnRecord(raw.branch, receiver.object, key)
	if receiver.object == nil || receiver.object.array || !present || !complete || descriptor.accessor {
		return sourceFieldCall{}, false
	}
	m := r.events[getPC].a
	if m < 0 || m >= getPC || r.events[m].kind != "Member" || r.events[m].node != member || r.events[m].key != key {
		return sourceFieldCall{}, false
	}
	t := r.events[m].a
	if t < 0 || t >= m || r.events[t].kind != "ReadCell" || r.events[t].cell != 1 {
		return sourceFieldCall{}, false
	}
	if take {
		ref := raw.storage.references[m]
		if !raw.storage.ready[t] || !raw.storage.ready[m] || !raw.storage.ready[getPC] || raw.storage.values[t] != receiver || ref.id.owner != owner.language || ref.id.serial == 0 || ref.cell != (languageCell{}) || ref.receiver != receiver || ref.key != key || raw.storage.values[getPC] != descriptor.value || raw.value != descriptor.value {
			return sourceFieldCall{}, false
		}
	} else if raw.storage.ready[t] || raw.storage.ready[m] || raw.storage.ready[getPC] || raw.storage.references[m] != (languageReference{}) {
		return sourceFieldCall{}, false
	}
	demand := sourceFieldDemand{declaration: e.proof.arrow, operation: member, slot: mapping.declarations[1], key: member.Name().Text()}
	return sourceFieldCall{operation: h.call, target: e.proof.arrow, complete: true, outcomes: []sourceFieldOutcome{{demand: demand, fulfilled: true}}}, true
}

// objectDefaultFieldCall consumes the live original default schedule. A skipped
// initializer covers only this default read after its actual selector and Return.
// No type annotation or complete header supplies property/branch authority.
func (h *closedPrefixHistory) objectDefaultFieldCall(row languageAlternative) (sourceFieldCall, bool) {
	e := row.callHistory.entry
	raw := row.callHistory.raw.alternatives[0]
	r, m := e.proof.entry, e.proof.mapping
	member := m.objectDefaultMember()
	if member == nil || len(e.inputs.arguments) < 1 || len(e.inputs.arguments) > 2 {
		return sourceFieldCall{}, false
	}
	initializer := m.declarations[1].Initializer()
	nullish := initializer != member
	receiver := e.inputs.arguments[0].value
	key := languageStringKey(member.Name().Text())
	descriptor, present, complete, _ := h.authority.owner.language.readOwnRecord(raw.branch, receiver.object, key)
	if receiver.object == nil || receiver.object.array || !present || !complete || descriptor.accessor {
		return sourceFieldCall{}, false
	}
	if _, number := numericNumberPayload(descriptor.value); !number {
		isNullish, known := acquiredNullish(raw.branch, descriptor.value)
		if !nullish || !known || !isNullish {
			return sourceFieldCall{}, false
		}
	}
	selector, getPC := -1, -1
	for pc, event := range r.events {
		if event.kind == "SelectDefault" {
			if selector >= 0 {
				return sourceFieldCall{}, false
			}
			selector = pc
		}
		if event.kind == "GetValue" && event.node == member {
			if getPC >= 0 {
				return sourceFieldCall{}, false
			}
			getPC = pc
		}
	}
	choice, producer, ok := defaultChoiceLayout(r, selector)
	if !ok || choice.end >= len(r.events) || getPC < 0 || choice.node != initializer || choice.a < 0 || r.events[choice.a].kind != "ReadAcquiredArgument" || r.events[choice.a].cell != 1 || r.events[choice.end].kind != "InitializeCell" || r.events[choice.end].cell != 1 || r.events[choice.end].a != choice.out || !raw.storage.ready[choice.a] || !raw.storage.ready[choice.out] {
		return sourceFieldCall{}, false
	}
	actual := languageValue{undefined: true}
	if len(e.inputs.arguments) == 2 {
		actual = e.inputs.arguments[1].value
	}
	selected, known := acquiredUndefined(raw.branch, actual)
	if !known || raw.storage.values[choice.a] != actual || raw.storage.ready[choice.merge] != selected {
		return sourceFieldCall{}, false
	}
	// The selector's destination, formal initialization and direct body read
	// must be the same actual result, not independent copied buffer payloads.
	bodyPC := len(r.events) - 2
	if bodyPC <= choice.end || r.events[bodyPC].kind != "ReadCell" || r.events[bodyPC].cell != 1 || r.events[bodyPC+1].kind != "Return" || r.events[bodyPC+1].a != bodyPC || !raw.storage.ready[choice.end] || !raw.storage.ready[bodyPC] || raw.storage.values[choice.out] != raw.value || raw.storage.values[choice.end] != raw.value || raw.storage.values[bodyPC] != raw.value {
		return sourceFieldCall{}, false
	}
	if nullish {
		// The Get is the selected left value, not the default's final result.
		// Validate the existing inner selector and merge inside the outer default.
		selectNull := r.events[producer]
		if r.choiceSlots != 2 || selectNull.kind != "SelectNullish" || selectNull.node != initializer || selectNull.a != getPC || producer != getPC+1 || selectNull.entry != producer+1 || selectNull.merge != selectNull.entry+1 || selectNull.end != selectNull.merge+1 || selectNull.end != choice.merge {
			return sourceFieldCall{}, false
		}
		literal, merge := r.events[selectNull.entry], r.events[selectNull.merge]
		right := initializer.AsBinaryExpression().Right
		if literal.kind != "Literal" || literal.node != right || literal.value != (languageValue{node: right}) || merge.kind != "MergeShortCircuit" || merge.node != initializer || merge.a != selectNull.entry || merge.b != producer {
			return sourceFieldCall{}, false
		}
		if selected {
			take, known := acquiredNullish(raw.branch, raw.storage.values[getPC])
			if !known || !raw.storage.ready[producer] || raw.storage.values[producer] != raw.value || raw.storage.ready[selectNull.entry] != take || raw.storage.ready[selectNull.merge] != take {
				return sourceFieldCall{}, false
			}
			if take {
				rightValue := raw.storage.values[selectNull.entry]
				number, canonical := numericNumberPayload(rightValue)
				if !canonical || number != 7 || rightValue.node != right || raw.storage.values[selectNull.merge] != rightValue || raw.value != rightValue {
					return sourceFieldCall{}, false
				}
			} else if raw.value != raw.storage.values[getPC] {
				return sourceFieldCall{}, false
			}
		} else {
			for pc := producer; pc < selectNull.end; pc++ {
				if raw.storage.ready[pc] {
					return sourceFieldCall{}, false
				}
			}
		}
	} else if getPC != producer || selected && raw.value != descriptor.value {
		return sourceFieldCall{}, false
	}
	refPC := r.events[getPC].a
	if refPC < choice.entry || refPC >= getPC || r.events[refPC].kind != "Member" || r.events[refPC].node != member || r.events[refPC].key != key {
		return sourceFieldCall{}, false
	}
	readPC := r.events[refPC].a
	if readPC < choice.entry || readPC >= refPC || r.events[readPC].kind != "ReadCell" || r.events[readPC].cell != 0 || r.events[readPC].node != member.Expression() {
		return sourceFieldCall{}, false
	}
	if selected {
		ref := raw.storage.references[refPC]
		if !raw.storage.ready[readPC] || !raw.storage.ready[refPC] || !raw.storage.ready[getPC] || raw.storage.values[readPC] != receiver || ref.id.owner != raw.branch.owner || ref.id.serial == 0 || ref.id.serial > raw.branch.owner.next || !ref.strict || ref.cell != (languageCell{}) || ref.receiver != receiver || ref.key != key || raw.storage.values[getPC] != descriptor.value {
			return sourceFieldCall{}, false
		}
	} else if raw.storage.ready[readPC] || raw.storage.ready[refPC] || raw.storage.ready[getPC] || raw.storage.references[refPC] != (languageReference{}) || raw.value != actual {
		return sourceFieldCall{}, false
	}
	demand := sourceFieldDemand{declaration: e.proof.arrow, operation: member, slot: m.declarations[0], key: member.Name().Text()}
	return sourceFieldCall{operation: h.call, target: e.proof.arrow, complete: true, outcomes: []sourceFieldOutcome{{demand: demand, fulfilled: true}}}, true
}
