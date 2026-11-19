package exactcompiler

// storageKeyOperand verifies the event association before using its string key.
func storageKeyOperand(r *storageRecipe, pc int, e storageEvent) (languagePropertyKey, bool) {
	if r == nil || pc < 0 || pc >= len(r.events) || e.out != pc || e.key.kind != languageStringKeyKind || !e.key.valid() {
		return languagePropertyKey{}, false
	}
	current := r.events[pc]
	if current.node != e.node || current.kind != e.kind || current.out != e.out || current.a != e.a || current.b != e.b || current.key != e.key {
		return languagePropertyKey{}, false
	}
	return e.key, true
}

// typedStringKeys preserves the old discovery domain and reserves conversion
// allocation/writes before creating the semantic exclusion vector.
func (p *storageBuilder) typedStringKeys(in []string) ([]languagePropertyKey, bool) {
	if !p.discover() {
		return nil, false
	}
	for range in {
		if !p.discover() || !p.discover() {
			return nil, false
		}
	}
	out := make([]languagePropertyKey, len(in))
	for i, key := range in {
		out[i] = languageStringKey(key)
	}
	return out, true
}
