package exactcompiler

// languagePropertyKey is the constructor-only supported key domain. It does not
// represent a Symbol languageValue or authorize any source intrinsic acquisition.
type languagePropertyKey struct {
	kind languagePropertyKeyKind
	text string
}
type languagePropertyKeyKind uint8

const (
	languageStringKeyKind languagePropertyKeyKind = iota
	languageIteratorKeyKind
)

func languageStringKey(text string) languagePropertyKey { return languagePropertyKey{text: text} }
func languageIteratorKey() languagePropertyKey {
	return languagePropertyKey{kind: languageIteratorKeyKind}
}

// valid enforces one iterator representation and keeps zero as String("").
func (k languagePropertyKey) valid() bool {
	return k.kind == languageStringKeyKind || k.kind == languageIteratorKeyKind && k.text == ""
}
func (k languagePropertyKey) isString(text string) bool {
	return k.kind == languageStringKeyKind && k.text == text
}

// arrayIndex delegates only String keys to the existing bounded parser.
func (k languagePropertyKey) arrayIndex() (uint64, bool) {
	if k.kind != languageStringKeyKind {
		return 0, false
	}
	return arrayIndex(k.text)
}
