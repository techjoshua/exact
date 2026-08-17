package exactcompiler

import (
	"fmt"
	"sort"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/parser"
	"github.com/microsoft/typescript-go/internal/scanner"
	"github.com/microsoft/typescript-go/internal/tspath"
)

// sourceEdit describes one replacement against the current normalized text.
// Edits are applied from the end of the source so authored offsets stay stable.
type sourceEdit struct {
	start int
	end   int
	text  string
	order int
}

// normalizedSource retains the authored-position projection while compiler
// conveniences are rewritten before TypeScript binding.
type normalizedSource struct {
	text            string
	authored        string
	authoredOffsets []int
}

func newNormalizedSource(source string) normalizedSource {
	offsets := make([]int, len(source)+1)
	for index := range offsets {
		offsets[index] = index
	}
	return normalizedSource{text: source, authored: source, authoredOffsets: offsets}
}

func (source *normalizedSource) apply(edits []sourceEdit) {
	sortSourceEdits(edits)
	for _, edit := range edits {
		if edit.start < 0 || edit.end < edit.start || edit.end > len(source.text) {
			continue
		}
		nextOffsets := make([]int, 0, len(source.text)-edit.end+edit.start+len(edit.text)+1)
		nextOffsets = append(nextOffsets, source.authoredOffsets[:edit.start+1]...)
		for index := 1; index <= len(edit.text); index++ {
			offset := source.authoredOffsets[edit.start]
			if index == len(edit.text) {
				offset = source.authoredOffsets[edit.end]
			}
			nextOffsets = append(nextOffsets, offset)
		}
		nextOffsets = append(nextOffsets, source.authoredOffsets[edit.end+1:]...)
		source.text = source.text[:edit.start] + edit.text + source.text[edit.end:]
		source.authoredOffsets = nextOffsets
	}
}

func (source normalizedSource) authoredOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	if offset >= len(source.authoredOffsets) {
		return len(source.authored)
	}
	return source.authoredOffsets[offset]
}

func (source normalizedSource) authoredSpan(start int, length int) (int, int) {
	authoredStart := source.authoredOffset(start)
	authoredEnd := source.authoredOffset(start + length)
	if authoredEnd < authoredStart {
		authoredEnd = authoredStart
	}
	return authoredStart, authoredEnd - authoredStart
}

func parseNormalizationSource(fileName string, source string) *ast.SourceFile {
	return parser.ParseSourceFile(ast.SourceFileParseOptions{
		FileName: fileName,
		Path:     tspath.ToPath(fileName, tspath.GetDirectoryPath(fileName), true),
	}, source, core.ScriptKindTSX)
}

func applySourceEdits(source string, edits []sourceEdit) string {
	sortSourceEdits(edits)
	for _, edit := range edits {
		if edit.start < 0 || edit.end < edit.start || edit.end > len(source) {
			continue
		}
		source = source[:edit.start] + edit.text + source[edit.end:]
	}
	return source
}

func sortSourceEdits(edits []sourceEdit) {
	sort.SliceStable(edits, func(left int, right int) bool {
		if edits[left].start != edits[right].start {
			return edits[left].start > edits[right].start
		}
		if edits[left].end != edits[right].end {
			return edits[left].end > edits[right].end
		}
		return edits[left].order > edits[right].order
	})
}

func nodeTokenStart(sourceFile *ast.SourceFile, node *ast.Node) int {
	return scanner.GetTokenPosOfNode(node, sourceFile, false)
}

func normalizationNodeText(sourceFile *ast.SourceFile, node *ast.Node) string {
	if node == nil {
		return ""
	}
	start := nodeTokenStart(sourceFile, node)
	if start < 0 || node.End() < start || node.End() > len(sourceFile.Text()) {
		return ""
	}
	return sourceFile.Text()[start:node.End()]
}

func componentComputationError(sourceFile *ast.SourceFile, node *ast.Node, message string) error {
	line, column := sourceLineAndColumn(sourceFile.Text(), nodeTokenStart(sourceFile, node))
	return fmt.Errorf("%s:%d:%d - %s", sourceFile.FileName(), line, column, message)
}

func sourceLineAndColumn(source string, position int) (int, int) {
	if position < 0 {
		position = 0
	}
	if position > len(source) {
		position = len(source)
	}
	line, column := 1, 1
	for index := 0; index < position; {
		r, size := utf8.DecodeRuneInString(source[index:])
		if r == '\n' {
			line, column = line+1, 1
		} else {
			column++
		}
		index += size
	}
	return line, column
}
