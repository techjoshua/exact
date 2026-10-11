package exactcompiler

import (
	"strings"

	"golang.org/x/text/unicode/norm"
)

// Inference compares normalized labels, while editor evidence must point into
// authored bytes. Each normalization segment retains its original source span,
// including compatibility glyphs and case mappings that change byte length.
func intlTextEvidenceSpan(text string, label string) (int, int, bool) {
	needle := strings.ToLower(norm.NFKC.String(label))
	if needle == "" {
		return 0, 0, false
	}
	var iterator norm.Iter
	iterator.InitString(norm.NFKC, text)
	var normalized strings.Builder
	starts, ends := []int{}, []int{}
	for !iterator.Done() {
		start := iterator.Pos()
		segment := strings.ToLower(string(iterator.Next()))
		end := iterator.Pos()
		normalized.WriteString(segment)
		for range len(segment) {
			starts = append(starts, start)
			ends = append(ends, end)
		}
	}
	offset := strings.LastIndex(normalized.String(), needle)
	if offset < 0 {
		return 0, 0, false
	}
	start := starts[offset]
	return start, ends[offset+len(needle)-1] - start, true
}
