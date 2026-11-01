package exactcompiler

import (
	"reflect"
	"testing"
)

// Internal identity graphs are not response locations. Following their pointers
// can cycle through compiler nodes even though JSON correctly omits the fields.
func TestLocationProjectionSkipsPrivateProofs(t *testing.T) {
	type proof struct {
		Start, Length int
		Next          *proof
	}
	private := &proof{Start: 3, Length: 1}
	private.Next = private
	value := struct {
		Visible struct{ Start, Length int }
		hidden  *proof
		Ignored *proof `json:"-"`
	}{hidden: private, Ignored: private}
	value.Visible.Start, value.Visible.Length = 3, 1
	source := newNormalizedSource("abc")
	source.apply([]sourceEdit{{start: 0, end: 0, text: "xx"}})
	remapLocationValue(reflect.ValueOf(&value), source)
	if value.Visible.Start != 1 || value.Visible.Length != 1 || private.Start != 3 || private.Length != 1 || private.Next != private {
		t.Fatal("public location or private evidence changed", value.Visible, private.Start)
	}
}
