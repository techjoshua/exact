package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/sourcemap"
)

type diagnosticSourcePosition struct{ generated, source int }

// mapGeneratedDiagnostics projects checked artifact tokens through the emitter's source map and
// normalization edits. Unmapped synthetic failures retain their generated filename for debugging;
// diagnostics in imported files must never be attributed to the current authored module.
func mapGeneratedDiagnostics(diagnostics []Diagnostic, code, fileName string, mapping *sourcemap.RawSourceMap, source normalizedSource) {
	if mapping == nil {
		return
	}
	generatedLines := diagnosticLineStarts(code)
	sourceLines := diagnosticLineStarts(source.text)
	positions := []diagnosticSourcePosition{}
	decoder := sourcemap.DecodeMappings(mapping.Mappings)
	for entry := range decoder.Values() {
		generated, valid := diagnosticMappingOffset(code, generatedLines, entry.GeneratedLine, int(entry.GeneratedCharacter))
		if !valid {
			continue
		}
		original := -1
		if entry.IsSourceMapping() && entry.SourceIndex == 0 {
			if offset, ok := diagnosticMappingOffset(source.text, sourceLines, entry.SourceLine, int(entry.SourceCharacter)); ok {
				original = offset
			}
		}
		positions = append(positions, diagnosticSourcePosition{generated, original})
	}
	if decoder.Error() != nil || len(positions) == 0 {
		return
	}
	find := func(offset int) (int, bool) {
		index := sort.Search(len(positions), func(index int) bool { return positions[index].generated > offset }) - 1
		if index < 0 {
			return 0, false
		}
		return positions[index].source, positions[index].source >= 0
	}
	for index := range diagnostics {
		diagnostic := &diagnostics[index]
		if diagnostic.FileName != fileName+".exact.generated.ts" {
			continue
		}
		start, valid := find(diagnostic.Start)
		if !valid {
			continue
		}
		end, _ := find(diagnostic.Start + diagnostic.Length)
		if end <= start {
			end = start + 1
		}
		diagnostic.Start, diagnostic.Length = source.authoredSpan(start, end-start)
		diagnostic.FileName = fileName
	}
}

func diagnosticLineStarts(text string) []int {
	starts := []int{0}
	for index := range text {
		if text[index] == '\n' {
			starts = append(starts, index+1)
		}
	}
	return starts
}

func diagnosticMappingOffset(text string, starts []int, line, column int) (int, bool) {
	if line < 0 || line >= len(starts) {
		return 0, false
	}
	start := starts[line]
	lineText := text[start:]
	if end := strings.IndexByte(lineText, '\n'); end >= 0 {
		lineText = lineText[:end]
	}
	offset, valid := utf16OffsetToByteOffset(lineText, column)
	return start + offset, valid
}
