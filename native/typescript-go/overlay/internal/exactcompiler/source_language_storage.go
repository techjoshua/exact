package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

const numericLiteralKind = ast.KindNumericLiteral

// languageObject identifies one actual allocation, never an allocation syntax site.
// Prototype contents remain unknown for source literals in this first slice.
type languageObject struct {
	id                                 languageID
	unique, ownComplete, prototypeNull bool
	array                              bool
	origin                             *ast.Node
}
type languageDescriptor struct {
	value                              languageValue
	writable, enumerable, configurable bool
	accessor                           bool
}

// languageStorage is a persistent typed write chain. It holds no activation maps.
// The first matching record is the current descriptor or initialized cell state.
type languageStorage struct {
	previous    *languageStorage
	cell        languageCell
	object      *languageObject
	key         languagePropertyKey
	descriptor  languageDescriptor
	value       languageValue
	initialized bool
	deleted     bool
}
type languageReference struct {
	id       languageID
	receiver languageValue
	key      languagePropertyKey
	strict   bool
	cell     languageCell // a resolved lexical reference, never a name lookup
}

func (o *languageOwner) storageStep(b languageBranch, row languageStorage) languageBranch {
	row.previous = b.state.storage
	b.state = &languageState{id: o.identity(), previous: b.state, index: b.state.index, storage: &row}
	b.cursor++
	return b
}
func (o *languageOwner) allocateObject(b languageBranch) (languageBranch, languageValue) {
	if !o.canAdvance(b, 2) {
		return b, languageValue{}
	}
	object := &languageObject{id: o.identity(), unique: true, ownComplete: true}
	return o.storageStep(b, languageStorage{object: object}), languageValue{object: object}
}
func (o *languageOwner) initializeLocal(b languageBranch, c languageCell, v languageValue) languageAlternative {
	if !o.canAdvance(b, 1) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !o.live(b) || c.id.owner != o || c.summary || c.environment != b.env.id {
		return storageResidual(b, "InitializeCell ownership")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == c {
			return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "ReferenceError"}}
		}
	}
	return languageAlternative{branch: o.storageStep(b, languageStorage{cell: c, value: v, initialized: true}), value: v}
}
func (o *languageOwner) readLocal(b languageBranch, c languageCell) languageAlternative {
	if !o.live(b) || c.id.owner != o || c.summary || c.environment != b.env.id {
		return storageResidual(b, "ReadCell ownership")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == c && row.initialized {
			return languageAlternative{branch: b, value: row.value}
		}
	}
	return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "ReferenceError"}}
}

// readOwn distinguishes complete own absence from missing population coverage.
func (o *languageOwner) readOwnRecord(b languageBranch, object *languageObject, key languagePropertyKey) (languageDescriptor, bool, bool, *languageStorage) {
	if !key.valid() {
		return languageDescriptor{}, false, false, nil
	}
	if !o.live(b) || object == nil || object.id.owner != o {
		return languageDescriptor{}, false, false, nil
	}
	allocated := false
	for row := b.state.storage; row != nil; row = row.previous {
		if row.object == object {
			allocated = true
			if row.initialized && row.key == key {
				return row.descriptor, !row.deleted, true, row
			}
		}
	}
	return languageDescriptor{}, false, allocated && object.ownComplete, nil
}

func (o *languageOwner) readOwn(b languageBranch, object *languageObject, key languagePropertyKey) (languageDescriptor, bool, bool) {
	d, p, c, _ := o.readOwnRecord(b, object, key)
	return d, p, c
}

// defineData admits fresh literal data creation only. Redefinition compatibility
// remains residual until the general descriptor algorithm is migrated.
func (o *languageOwner) defineData(b languageBranch, object *languageObject, key languagePropertyKey, v languageValue) languageAlternative {
	if !key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if !o.live(b) || object == nil || object.id.owner != o || !object.unique {
		return storageResidual(b, "DefineSlot ownership/cardinality")
	}
	if object.array {
		return o.defineArrayData(b, object, key, v, nil, nil)
	}
	_, present, complete := o.readOwn(b, object, key)
	return o.createOwnData(b, object, key, v, present, complete)
}

// createOwnData centralizes fresh own data creation, bypassing inherited setters.
func (o *languageOwner) createOwnData(b languageBranch, object *languageObject, key languagePropertyKey, v languageValue, present, complete bool) languageAlternative {
	if !o.canAdvance(b, 1) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if object.array {
		return storageResidual(b, "Array creation requires length reservation")
	}
	if !complete || present {
		return storageResidual(b, "DefineSlot creation/population")
	}
	return languageAlternative{branch: o.storageStep(b, languageStorage{object: object, key: key, descriptor: languageDescriptor{value: v, writable: true, enumerable: true, configurable: true}, initialized: true}), value: v}
}
func (o *languageOwner) member(b languageBranch, receiver languageValue, key languagePropertyKey) languageReference {
	if !key.valid() {
		return languageReference{}
	}
	return languageReference{id: o.identity(), receiver: receiver, key: key, strict: true}
}
func storageNullish(v languageValue) bool {
	return v.undefined || v.node != nil && v.node.Kind == storageNullKind
}
func storageResidual(b languageBranch, pc string) languageAlternative {
	return languageAlternative{branch: b, completion: languageResidual, remaining: pc, obligations: []string{pc}}
}
func (o *languageOwner) getReference(b languageBranch, r languageReference) languageAlternative {
	out, _ := o.selectGetReference(b, r)
	return out
}

func (o *languageOwner) selectGetReference(b languageBranch, r languageReference) (languageAlternative, *languageStorage) {
	if r.cell.id.owner != nil {
		if r.id.owner != o {
			return storageResidual(b, "GetValue lexical ownership"), nil
		}
		return o.readLocal(b, r.cell), nil
	}
	if !r.key.valid() {
		return storageResidual(b, "Property key unavailable"), nil
	}
	if !o.live(b) || r.id.owner != o {
		return storageResidual(b, "GetValue ownership"), nil
	}
	if storageNullish(r.receiver) {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}, nil
	}
	d, present, complete, record := o.readOwnRecord(b, r.receiver.object, r.key)
	if present && d.accessor {
		return storageResidual(b, "Get accessor Call"), record
	}
	return o.ownGetResult(b, r, d, present, complete), nil
}

// ownGetResult preserves own undefined, unknown prototypes and accessor Call refusal.
func (o *languageOwner) ownGetResult(b languageBranch, r languageReference, d languageDescriptor, present, complete bool) languageAlternative {
	if !r.key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if present {
		if d.accessor {
			return storageResidual(b, "Get accessor Call")
		}
		return languageAlternative{branch: b, value: d.value}
	}
	if complete && r.receiver.object.prototypeNull {
		return languageAlternative{branch: b, value: languageValue{undefined: true}}
	}
	return storageResidual(b, "Get prototype/own population")
}
func (o *languageOwner) putReference(b languageBranch, r languageReference, v languageValue) languageAlternative {
	if !o.canAdvance(b, 1) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if r.cell.id.owner != nil {
		if r.id.owner != o {
			return storageResidual(b, "PutValue lexical ownership")
		}
		return o.putLocal(b, r.cell, v)
	}
	if !r.key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if !o.live(b) || r.id.owner != o {
		return storageResidual(b, "PutValue ownership")
	}
	if storageNullish(r.receiver) {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
	}
	d, present, complete := o.readOwn(b, r.receiver.object, r.key)
	if !complete || !present || !r.receiver.object.unique {
		return storageResidual(b, "Put population/cardinality/prototype")
	}
	if d.accessor {
		return storageResidual(b, "Set accessor Call")
	}
	if !d.writable {
		if r.strict {
			return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
		}
		return languageAlternative{branch: b, value: v}
	}
	if r.receiver.object.array && r.key.isString("length") {
		n, known := numericNumberPayload(v)
		if !known {
			return storageResidual(b, "Array length Number unavailable")
		}
		out := o.setArrayLength(b, r.receiver.object, float64(n), nil, nil)
		if out.completion == languageNormal {
			out.value = v
		}
		return out
	}
	d.value = v
	return languageAlternative{branch: o.storageStep(b, languageStorage{object: r.receiver.object, key: r.key, descriptor: d, initialized: true}), value: v}
}

// Getter descriptors reuse the accessor tag and exact construction payload.
// A nil callable is unavailable, never proof of a known absent [[Get]].
func getterDescriptorPayload(d languageDescriptor) bool {
	f := d.value.callable
	return d.accessor && !d.writable && d.enumerable && d.configurable && f != nil && f.proof != nil && ast.IsGetAccessorDeclaration(f.proof.arrow) && d.value == (languageValue{callable: f, node: f.proof.arrow})
}
func (o *languageOwner) defineGetter(b languageBranch, object *languageObject, v languageValue, r *storageRecipe, pc int) languageAlternative {
	if !o.canAdvance(b, 1) {
		return storageResidual(b, "Getter installation identity/cursor capacity")
	}
	if r == nil || pc < 0 || pc >= len(r.events) {
		return storageResidual(b, "Getter definition event unavailable")
	}
	e := r.events[pc]
	key, valid := storageKeyOperand(r, pc, e)
	if !valid || e.kind != "DefineAccessorSlot" || e.node == nil || !ast.IsGetAccessorDeclaration(e.node) || e.node.Name() == nil {
		return storageResidual(b, "Getter key role unavailable")
	}
	if ast.IsComputedPropertyName(e.node.Name()) || key != languageStringKey(e.node.Name().Text()) {
		return storageResidual(b, "Getter definition key association")
	}
	d := languageDescriptor{accessor: true, value: v, enumerable: true, configurable: true}
	if !getterDescriptorPayload(d) || !o.live(b) || object == nil || object.id.owner != o || !object.unique || object.array || !key.valid() || v.callable.id.owner != o || v.callable.proof.arrow != e.node {
		return storageResidual(b, "Getter descriptor association")
	}
	_, present, complete := o.readOwn(b, object, key)
	if present || !complete {
		return storageResidual(b, "Getter fresh own population")
	}
	return languageAlternative{branch: o.storageStep(b, languageStorage{object: object, key: key, descriptor: d, initialized: true}), value: v}
}

// completedGetCapacity is shared allocation/headroom checking, not Get
// authority. Each producer validates its own reference and completed result.
func (o *languageOwner) completedGetCapacity(population int) (int, bool) {
	if population < 0 || !o.canIssue(2) {
		return 0, false
	}
	count, ok := budgetSum(0, population, 1)
	if !ok {
		return 0, false
	}
	_, ok = budgetProduct(0, count, int(unsafe.Sizeof(storageObjectObservation{})))
	return count, ok
}

// appendCompletedGet seals a bare immutable Get row and appends one observation.
// It never constructs a Call, normalizes Return, or re-adopts prefix effects.
func (o *languageOwner) appendCompletedGet(row languageAlternative, input languageBranch, bare languageAlternative, r *storageRecipe, pc int, reference languageReference) (languageAlternative, bool) {
	count, ok := o.completedGetCapacity(len(row.objects))
	if !ok || r == nil || pc < 0 || pc >= len(r.events) || r.events[pc].kind != "GetValue" || !o.live(input) || !o.live(bare.branch) || bare.branch != row.branch || bare.value != row.value || bare.completion != row.completion || reference.id.owner != o || reference.id.serial == 0 || bare.storage != nil || bare.callInputs != nil || len(bare.objects) != 0 || len(bare.effects) != 0 || len(bare.obligations) != 0 {
		return row, false
	}
	receipt := o.receipt(input, []languageAlternative{bare})
	if receipt == nil {
		return row, false
	}
	history := make([]storageObjectObservation, count)
	copy(history, row.objects)
	history[count-1] = storageObjectObservation{reference: reference.id, recipe: r, node: r.events[pc].node, pc: pc, receipt: receipt}
	row.objects = history
	return row, true
}

// finishOwnGetterGet owns the completed Normal or Throw property-Get handoff.
// The shared Call completion owner authenticates its child while live. Its Call
// is authenticated while live, before restoring the separate parent header.
// The bare receipt records Get input/output, not another body or sequence.
func (o *languageOwner) finishOwnGetterGet(parent, child languageAlternative, r *storageRecipe, pc int, reference languageReference) (languageAlternative, bool) {
	h := child.callHistory
	if parent.completion != languageNormal || !shortCircuitCanonical(parent) || (child.completion != languageNormal && child.completion != languageThrow) || h == nil || !h.validCompletion(child) || child.callInputs == nil || child.callInputs.targetOrigin == nil || child.callInputs.targetOrigin.getterInstall == nil || r == nil || pc < 0 || pc >= len(r.events) || r.events[pc].kind != "GetValue" {
		return child, false
	}
	t := child.callInputs.targetOrigin
	if t.recipe != r || t.getPC != pc || t.reference != reference || t.input != parent.branch || child.branch.env != parent.branch.env {
		return child, false
	}
	bare := languageAlternative{branch: child.branch, completion: child.completion, value: child.value, callHistory: h, finally: parent.finally, binding: parent.binding}
	var ok bool
	child, ok = o.appendCompletedGet(child, parent.branch, bare, r, pc, reference)
	if !ok {
		return child, false
	}
	child.callInputs = parent.callInputs
	child.finally, child.binding = parent.finally, parent.binding
	child.pending, child.pendingValue, child.pendingReturnBoundary = parent.pending, parent.pendingValue, parent.pendingReturnBoundary
	child.storage = nil
	return child, true
}

// A cut at an entered implicit Get owns two distinct headers: the row keeps
// the selected getter, while the continuation keeps the suspended outer Call
// or binding frame whose parent header is legitimately nil.
// This is transport fencing only, never an entry or completed-Get capability.
func suspendedOwnGetterInputs(r *storageRecipe, a languageAlternative) bool {
	if r == nil || !r.prefix || a.completion != languageResidual || a.storage == nil || a.storage.recipe != r || a.callInputs == nil || a.callInputs.targetOrigin == nil || a.callInputs.targetOrigin.getterInstall == nil {
		return false
	}
	t := a.callInputs.targetOrigin
	if t.recipe != r || a.storage.pc != t.getPC || t.getPC < 0 || t.getPC >= len(r.events) || r.events[t.getPC].kind != "GetValue" || r.events[t.getPC].node != a.callInputs.call {
		return false
	}
	if r.binding != nil {
		if bindingGetterRole(r, t.getPC) == bindingCloseGetterRole {
			return bindingReturnGetterSuspended(r, t.getPC, a)
		}
		return bindingGetterContext(r, t.getPC, languageAlternative{branch: t.input, binding: a.binding}) && a.storage.callInputs == nil && a.storage.targetOrigin == nil
	}
	return a.storage.callInputs != nil && a.storage.callInputs.call == r.call && !a.storage.callInputs.complete && a.storage.callInputs.targetOrigin != nil && a.storage.callInputs.targetOrigin.getterInstall == nil
}

// allocatedLanguageObject shares the exact immutable allocation-marker scan.
// Callers supply their live source/branch/uniqueness policy. Return callers keep
// their stronger producing receipt and ancestry checks outside this helper.
func allocatedLanguageObject(b languageBranch, object *languageObject, work *languageCopyWork) bool {
	if b.state == nil || object == nil || work == nil {
		return false
	}
	for s := b.state.storage; s != nil; s = s.previous {
		if !work.spend(1) {
			return false
		}
		if s.object == object && s.cell == (languageCell{}) && !s.initialized && !s.deleted && s.key == (languagePropertyKey{}) && s.descriptor == (languageDescriptor{}) && s.value == (languageValue{}) {
			return true
		}
	}
	return false
}
