package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"math"
	"strconv"
)

// allocateArray publishes identity and its invariant length descriptor together.
func (o *languageOwner) allocateArray(b languageBranch, origin *ast.Node, w *languageCopyWork) languageAlternative {
	if !o.canAdvance(b, 3) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !o.live(b) {
		return storageResidual(b, "Array ownership")
	}
	if !w.spend(o.numericArtifactCost() + 8) {
		return storageResidual(b, "Array allocation budget")
	}
	object := &languageObject{id: o.identity(), unique: true, ownComplete: true, array: true, origin: origin}
	v := o.numericUint32Artifact(0, origin)
	b = o.storageStep(b, languageStorage{object: object})
	b = o.storageStep(b, languageStorage{object: object, key: languageStringKey("length"), initialized: true, descriptor: languageDescriptor{value: v, writable: true}})
	return languageAlternative{branch: b, value: languageValue{object: object}}
}

// arrayNumberLength implements the Number equality law independently of source
// spelling and ToLength. Negative zero is accepted and canonicalized to zero.
func arrayNumberLength(n float64) (uint32, bool) {
	if math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 4294967295 || math.Trunc(n) != n {
		return 0, false
	}
	return uint32(n), true
}

// setArrayLength scans and reserves before mutation. Sparse growth never visits
// holes. Deletion order is descending index order from the paid key snapshot.
// A cut retains B_in. The schedule retains the acquired RHS and unapplied PC.
func (o *languageOwner) setArrayLength(b languageBranch, object *languageObject, n float64, origin *ast.Node, w *languageCopyWork) languageAlternative {
	length, valid := arrayNumberLength(n)
	if !valid {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "RangeError"}}
	}
	if !o.live(b) || object == nil || !object.array || object.id.owner != o {
		return storageResidual(b, "Array length ownership")
	}
	d, present, complete, fuel := o.readOwnCopy(b, object, languageStringKey("length"), w)
	if !fuel || !complete || !present || !d.writable || d.enumerable || d.configurable || d.accessor {
		return storageResidual(b, "Array length descriptor/work")
	}
	if d.value.node == nil || !w.spend(12) {
		return storageResidual(b, "Array prior length scalar/work")
	}
	old, err := strconv.ParseUint(d.value.node.Text(), 10, 32)
	if err != nil {
		return storageResidual(b, "Array prior length scalar")
	}
	c := &languageCopyProgress{source: languageValue{object: object}}
	// Growth only replaces length. Only shrink needs the represented own-key
	// population, descriptor scans and deletion order. Neither visits holes.
	if uint64(length) < old && !o.ownPropertyKeys(b, c, w) {
		return storageResidual(b, "Array length scan budget")
	}
	count := 0
	for _, k := range c.keys {
		if !w.spend(1) {
			return storageResidual(b, "Array deletion scan budget")
		}
		if i, ok := k.key.arrayIndex(); ok && i >= uint64(length) {
			slot, p, c, f := o.readOwnCopy(b, object, k.key, w)
			if !f || !c || !p || !slot.configurable {
				return storageResidual(b, "Array deletion descriptor/work")
			}
			count++
		}
	}
	if !w.spend(o.numericArtifactCost() + count*4 + len(c.keys) + 4) {
		return storageResidual(b, "Array transition reservation")
	}
	if !o.canAdvance(b, uint64(count)+1) {
		return storageResidual(b, "Array identity/cursor capacity")
	}
	value := o.numericUint32Artifact(length, origin)
	if object.origin != nil && origin != object.origin {
		value.trace = &languageSourceTrace{node: object.origin, previous: value.trace}
	}
	for i := len(c.keys) - 1; i >= 0; i-- {
		k := c.keys[i]
		if n, ok := k.key.arrayIndex(); ok && n >= uint64(length) {
			b = o.storageStep(b, languageStorage{object: object, key: k.key, initialized: true, deleted: true})
		}
	}
	d.value = value
	b = o.storageStep(b, languageStorage{object: object, key: languageStringKey("length"), descriptor: d, initialized: true})
	return languageAlternative{branch: b, value: value}
}

// defineArrayData uses fresh Define semantics, never missing ordinary Set. The
// index and length writes are reserved and applied without an observable cut.
func (o *languageOwner) defineArrayData(b languageBranch, object *languageObject, key languagePropertyKey, v languageValue, origin *ast.Node, w *languageCopyWork) languageAlternative {
	if !o.canAdvance(b, 2) {
		return storageResidual(b, "identity/cursor capacity")
	}
	if !key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if !o.live(b) || object == nil || !object.array || object.id.owner != o {
		return storageResidual(b, "Array define ownership")
	}
	_, present, complete, fuel := o.readOwnCopy(b, object, key, w)
	if !fuel || !complete || present || key.isString("length") {
		return storageResidual(b, "Array define population/work")
	}
	d, p, c, f := o.readOwnCopy(b, object, languageStringKey("length"), w)
	if !f || !p || !c || !d.writable || d.value.node == nil {
		return storageResidual(b, "Array length unavailable")
	}
	old, err := strconv.ParseUint(d.value.node.Text(), 10, 32)
	if err != nil {
		return storageResidual(b, "Array length scalar")
	}
	index, isIndex := key.arrayIndex()
	grow := isIndex && index >= old
	cost := 8
	if grow {
		cost += o.numericArtifactCost()
	}
	if !w.spend(cost) {
		return storageResidual(b, "Array index reservation")
	}
	if grow {
		d.value = o.numericUint32Artifact(uint32(index+1), origin)
		if object.origin != nil && origin != object.origin {
			d.value.trace = &languageSourceTrace{node: object.origin, previous: d.value.trace}
		}
	}
	b = o.storageStep(b, languageStorage{object: object, key: key, descriptor: languageDescriptor{value: v, writable: true, enumerable: true, configurable: true}, initialized: true})
	if grow {
		b = o.storageStep(b, languageStorage{object: object, key: languageStringKey("length"), descriptor: d, initialized: true})
	}
	return languageAlternative{branch: b, value: v}
}
