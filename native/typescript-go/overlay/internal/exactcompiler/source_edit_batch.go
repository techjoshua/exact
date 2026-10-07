package exactcompiler

import "strings"

// batchSourceEdits applies disjoint, already sorted edits in one text/offset allocation.
// Overlap and invalid ranges retain the sequential recovery path. Equal-position insertions
// are consumed in reverse application order, preserving their authored ordering.
func batchSourceEdits(source string, offsets []int, edits []sourceEdit) (string, []int, bool) {
	size, previous := len(source), len(source)
	for _, edit := range edits {
		if edit.start < 0 || edit.end < edit.start || edit.end > len(source) || edit.end > previous {
			return "", nil, false
		}
		previous = edit.start
		size += len(edit.text) - (edit.end - edit.start)
	}
	var text strings.Builder
	text.Grow(size)
	var mapped []int
	if offsets != nil {
		mapped = make([]int, 1, size+1)
		mapped[0] = offsets[0]
	}
	cursor := 0
	for i := len(edits) - 1; i >= 0; i-- {
		edit := edits[i]
		text.WriteString(source[cursor:edit.start])
		text.WriteString(edit.text)
		if offsets != nil {
			mapped = append(mapped, offsets[cursor+1:edit.start+1]...)
			for j := 1; j <= len(edit.text); j++ {
				position := offsets[edit.start]
				if j == len(edit.text) {
					position = offsets[edit.end]
				}
				mapped = append(mapped, position)
			}
		}
		cursor = edit.end
	}
	text.WriteString(source[cursor:])
	if offsets != nil {
		mapped = append(mapped, offsets[cursor+1:]...)
	}
	return text.String(), mapped, true
}
