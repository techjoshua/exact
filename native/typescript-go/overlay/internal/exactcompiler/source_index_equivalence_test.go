package exactcompiler

import (
	"math/rand"
	"reflect"
	"strings"
	"testing"
)

func TestSourceLocationIndexMatchesScanner(t *testing.T) {
	for _, source := range []string{"", "abc", "a\r\nb\rc\nd\u2028e\u2029f", "a😀é\n界z", "\n\r\n😀", strings.Repeat("a😀é", 80) + "\r\n" + strings.Repeat("界", 70)} {
		index := indexSourceLocations(source)
		for offset := -1; offset <= len(source)+1; offset++ {
			line, column := index.lineColumn(offset)
			wantLine, wantColumn := sourceUTF16LineColumn(source, offset)
			if line != wantLine || column != wantColumn {
				t.Fatalf("coordinate mismatch %q/%d", source, offset)
			}
		}
		for line := -1; line <= len(source)+1; line++ {
			for column := -1; column <= len(source)+2; column++ {
				if index.offset(line, column) != sourceOffsetForUTF16LineColumn(source, line, column) {
					t.Fatalf("offset mismatch %q/%d/%d", source, line, column)
				}
			}
		}
	}
}

func TestBatchedSourceEditsPreserveTextAndEveryAuthoredOffset(t *testing.T) {
	random := rand.New(rand.NewSource(17))
	for trial := 0; trial < 400; trial++ {
		original := newNormalizedSource("alpha😀beta\r\ngamma")
		edits := make([]sourceEdit, random.Intn(9))
		for i := range edits {
			start := random.Intn(len(original.text)+3) - 1
			end := start + random.Intn(4)
			edits[i] = sourceEdit{start: start, end: end, text: []string{"", "x", "😀", "longer"}[random.Intn(4)], order: i}
		}
		expected := original
		expected.authoredOffsets = append([]int(nil), original.authoredOffsets...)
		sortSourceEdits(edits)
		for _, edit := range edits {
			if edit.start < 0 || edit.end < edit.start || edit.end > len(expected.text) {
				continue
			}
			next := append([]int(nil), expected.authoredOffsets[:edit.start+1]...)
			for j := 1; j <= len(edit.text); j++ {
				position := expected.authoredOffsets[edit.start]
				if j == len(edit.text) {
					position = expected.authoredOffsets[edit.end]
				}
				next = append(next, position)
			}
			next = append(next, expected.authoredOffsets[edit.end+1:]...)
			expected.text = expected.text[:edit.start] + edit.text + expected.text[edit.end:]
			expected.authoredOffsets = next
		}
		original.apply(edits)
		if !reflect.DeepEqual(original, expected) {
			t.Fatalf("edit semantics changed: %#v", edits)
		}
	}
}
