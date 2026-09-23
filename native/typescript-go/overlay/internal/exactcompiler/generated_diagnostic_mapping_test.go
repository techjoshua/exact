package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/sourcemap"
)

func TestGeneratedDiagnosticMappingRetainsAuthoredAndUnmappedBoundaries(t *testing.T) {
	authored := "// source\nconst label = '💫'; bad.value;"
	source := newNormalizedSource(authored)
	code := "// generated\nconst label = '💫'; bad.value; synthetic;"
	column := len("const label = '") + 2 + len("'; ")
	generatedStart := strings.Index(code, "bad")
	sourceStart := strings.Index(authored, "bad")
	mapping := &sourcemap.RawSourceMap{Mappings: ";" + encodeSourceMapSegment([]int{column, 0, 1, column}) + "," + encodeSourceMapSegment([]int{9, 0, 0, 9}) + "," + encodeSourceMapSegment([]int{2})}
	diagnostics := []Diagnostic{
		{FileName: "page.tsx.exact.generated.ts", Start: generatedStart, Length: len("bad.value")},
		{FileName: "page.tsx.exact.generated.ts", Start: strings.Index(code, "synthetic"), Length: 9},
		{FileName: "dependency.ts", Start: 5, Length: 2},
	}
	mapGeneratedDiagnostics(diagnostics, code, "page.tsx", mapping, source)
	if diagnostics[0].FileName != "page.tsx" || diagnostics[0].Start != sourceStart || diagnostics[0].Length != len("bad.value") {
		t.Fatalf("authored UTF-16 mapping lost its token: %#v", diagnostics[0])
	}
	if diagnostics[1].FileName != "page.tsx.exact.generated.ts" || diagnostics[2].FileName != "dependency.ts" || diagnostics[2].Start != 5 {
		t.Fatalf("unmapped diagnostic was attributed to authored source: %#v", diagnostics)
	}
}
