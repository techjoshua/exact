package exactcompiler

// languageCopyWork records occurrence-local estimated work. It never refuses
// analysis because a reporting threshold was crossed. Actual identity, shape,
// lifetime and semantic-domain checks remain in their owning operations.
type languageCopyWork struct{ remaining, used int }

func (w *languageCopyWork) spend(n int) bool {
	if w == nil {
		return true
	}
	if n < 0 {
		return false
	}
	w.used = estimatedCostSum(w.used, n)
	return true
}

type languageOwnKey struct {
	key               languagePropertyKey
	creation          int
	deleted, boundary bool
}

// languageCopyProgress contains only acquired identities and immutable storage
// history. Partial enumeration is not a closed key population. No general Resume
// entry is supplied. A saved Define phase already owns its acquired Get value.
type languageCopyProgress struct {
	source, target            languageValue
	excluded                  []languagePropertyKey
	keys                      []languageOwnKey
	index, comparison, nextPC int
	phase                     string
	history                   *languageStorage
	reference                 languageReference
	pending                   languageValue
}

func cloneLanguageCopy(c *languageCopyProgress) *languageCopyProgress {
	if c == nil {
		return nil
	}
	out := *c
	out.keys = append([]languageOwnKey(nil), c.keys...)
	out.excluded = append([]languagePropertyKey(nil), c.excluded...)
	return &out
}
func (o *languageOwner) requireObjectCoercible(b languageBranch, v languageValue) languageAlternative {
	if !o.live(b) {
		return storageResidual(b, "RequireObjectCoercible ownership")
	}
	if storageNullish(v) {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
	}
	return languageAlternative{branch: b, value: v}
}

// arrayIndex recognizes canonical array-index strings, not all integer strings.
func arrayIndex(key string) (uint64, bool) {
	// Canonical indices have at most ten ASCII digits. Reject arbitrary named
	// strings in O(1), without parsing errors or formatting allocations.
	if len(key) == 0 || len(key) > 10 || len(key) > 1 && key[0] == '0' {
		return 0, false
	}
	var n uint64
	for i := 0; i < len(key); i++ {
		c := key[i]
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + uint64(c-'0')
	}
	return n, n < 4294967295
}

func ownKeyBefore(a, b languageOwnKey) bool {
	if a.key.kind != b.key.kind {
		return a.key.kind == languageStringKeyKind
	}
	x, xi := a.key.arrayIndex()
	y, yi := b.key.arrayIndex()
	if xi != yi {
		return xi
	}
	if xi {
		return x < y
	}
	return a.creation > b.creation
}

// ownPropertyKeys snapshots the supported String/WellKnownIterator domain.
// Unknown keys or incomplete populations cannot become a closed partial copy.
func (o *languageOwner) ownPropertyKeys(b languageBranch, c *languageCopyProgress, w *languageCopyWork) bool {
	object := c.source.object
	c.phase = "OwnKeysHistory"
	if !o.live(b) || object == nil || object.id.owner != o || !object.ownComplete {
		return false
	}
	allocated := false
	serial := 0
	for row := b.state.storage; row != nil; row = row.previous {
		c.history = row
		if !w.spend(1) {
			return false
		}
		serial++
		if row.object != object {
			continue
		}
		allocated = true
		if !row.initialized {
			continue
		}
		if !row.key.valid() {
			c.phase = "OwnKeysKeyDomain"
			return false
		}
		found := false
		for i := range c.keys {
			c.phase = "OwnKeysDedup"
			c.comparison = i
			if !w.spend(1) {
				return false
			}
			if c.keys[i].key == row.key {
				if !c.keys[i].boundary {
					if row.deleted {
						c.keys[i].boundary = true
					} else {
						c.keys[i].creation = serial
					}
				}
				found = true
				break
			}
		}
		if !found {
			if !w.spend(3) {
				return false
			}
			c.keys = append(c.keys, languageOwnKey{key: row.key, creation: serial, deleted: row.deleted, boundary: row.deleted})
		}
		c.phase = "OwnKeysHistory"
	}
	// Compact only after the entire paid history scan. Tombstones remain seen
	// through deduplication and stop older incarnations from affecting creation.
	live := c.keys[:0]
	for _, k := range c.keys {
		if !w.spend(1) {
			return false
		}
		if !k.deleted {
			live = append(live, k)
		}
	}
	c.keys = live
	c.history = nil
	if !allocated {
		return false
	}
	c.phase = "OwnKeysOrder"
	// Insertion sort makes every ordering comparison and movement explicit fuel.
	for i := 1; i < len(c.keys); i++ {
		for j := i; j > 0; j-- {
			c.index = i
			c.comparison = j
			if !w.spend(1) {
				return false
			}
			if !ownKeyBefore(c.keys[j], c.keys[j-1]) {
				break
			}
			if !w.spend(1) {
				return false
			}
			c.keys[j], c.keys[j-1] = c.keys[j-1], c.keys[j]
		}
	}
	c.index = 0
	c.phase = "Descriptor"
	return true
}

// readOwnCopy meters the actual descriptor-history walk. Its last result is fuel
// availability, separate from own absence and incomplete population.
func (o *languageOwner) readOwnCopy(b languageBranch, object *languageObject, key languagePropertyKey, w *languageCopyWork) (languageDescriptor, bool, bool, bool) {
	if !key.valid() {
		return languageDescriptor{}, false, false, true
	}
	if !o.live(b) || object == nil || object.id.owner != o {
		return languageDescriptor{}, false, false, true
	}
	allocated := false
	for row := b.state.storage; row != nil; row = row.previous {
		if !w.spend(1) {
			return languageDescriptor{}, false, false, false
		}
		if row.object == object {
			allocated = true
			if row.initialized && row.key == key {
				return row.descriptor, !row.deleted, true, true
			}
		}
	}
	return languageDescriptor{}, false, allocated && object.ownComplete, true
}

// getCopyReference shares the ordinary Get contract with getReference. Its own
// descriptor is observed now, never reused from the enumeration snapshot.
func (o *languageOwner) getCopyReference(b languageBranch, r languageReference, w *languageCopyWork) languageAlternative {
	if !r.key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if !o.live(b) || r.id.owner != o {
		return storageResidual(b, "GetValue ownership")
	}
	if storageNullish(r.receiver) {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "TypeError"}}
	}
	d, present, complete, fuel := o.readOwnCopy(b, r.receiver.object, r.key, w)
	if !fuel {
		return storageResidual(b, "Get history budget")
	}
	return o.ownGetResult(b, r, d, present, complete)
}

// defineCopyData uses the same fresh-slot authority as defineData. No prototype
// setter lookup is part of CreateDataProperty on the fresh copy target.
func (o *languageOwner) defineCopyData(b languageBranch, object *languageObject, key languagePropertyKey, v languageValue, w *languageCopyWork) languageAlternative {
	if !key.valid() {
		return storageResidual(b, "Property key unavailable")
	}
	if !o.live(b) || object == nil || object.id.owner != o || !object.unique {
		return storageResidual(b, "DefineSlot ownership/cardinality")
	}
	_, present, complete, fuel := o.readOwnCopy(b, object, key, w)
	if !fuel {
		return storageResidual(b, "Define history budget")
	}
	return o.createOwnData(b, object, key, v, present, complete)
}

// copyDataProperties receives values rather than source syntax. It snapshots keys
// but observes each descriptor and Get in order. Every paid exit keeps its branch
// and a detached remainder. The caller initializes the rest cell only on success.
func (o *languageOwner) copyDataProperties(b languageBranch, target, source languageValue, excluded []languagePropertyKey, w *languageCopyWork) (languageAlternative, *languageCopyProgress) {
	c := &languageCopyProgress{source: source, target: target, phase: "ToObject"}
	residual := func(reason string) (languageAlternative, *languageCopyProgress) { return storageResidual(b, reason), c }
	if !o.live(b) {
		return residual("Copy ownership")
	}
	if storageNullish(source) {
		return languageAlternative{branch: b, value: target}, nil
	}
	if source.object == nil {
		return residual("Copy ToObject/symbol domain")
	}
	for _, key := range excluded {
		if !key.valid() {
			return residual("Copy exclusion key unavailable")
		}
		if !w.spend(3) {
			return residual("Copy exclusions budget")
		}
		c.excluded = append(c.excluded, key)
	}
	if !o.ownPropertyKeys(b, c, w) {
		return residual("Copy key population/work")
	}
	for c.index < len(c.keys) {
		key := c.keys[c.index].key
		c.phase = "Exclusion"
		skip := false
		for i, x := range c.excluded {
			c.comparison = i
			if !w.spend(1) {
				return residual("Copy exclusion budget")
			}
			if key == x {
				skip = true
				break
			}
		}
		if skip {
			c.index++
			continue
		}
		c.phase = "Descriptor"
		if !w.spend(1) {
			return residual("Copy descriptor budget")
		}
		d, present, complete, fuel := o.readOwnCopy(b, source.object, key, w)
		if !fuel || !complete {
			return residual("Copy descriptor population/work")
		}
		if !present || !d.enumerable {
			c.index++
			continue
		}
		c.phase = "Get"
		c.reference = o.member(b, source, key)
		if !w.spend(1) {
			return residual("Copy Get budget")
		}
		a := o.getCopyReference(b, c.reference, w)
		if a.completion != languageNormal {
			return a, c
		}
		c.pending = a.value
		b = a.branch
		c.phase = "Define"
		// copy child observation
		if !w.spend(1) {
			return residual("Copy Define budget")
		}
		a = o.defineCopyData(b, target.object, key, c.pending, w)
		b = a.branch
		if a.completion != languageNormal {
			return a, c
		}
		c.phase = "Next"
		c.index++
	}
	return languageAlternative{branch: b, value: target}, nil
}
