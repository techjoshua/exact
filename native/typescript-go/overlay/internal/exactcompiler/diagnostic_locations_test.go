package exactcompiler

import (
	"strings"
	"testing"
)

func TestDiagnosticLocationsPreserveImportedSourcesAndUnicode(t *testing.T) {
	authored := "// 😀\nconst value = bad();"
	source := newNormalizedSource(authored)
	source.apply([]sourceEdit{{start: 0, end: 0, text: "// generated\n"}})
	imported := "// café 😀\nexport const other = fail();"
	diagnostics := []Diagnostic{{Start: strings.Index(source.text, "bad"), Length: 5, Related: []DiagnosticLocation{
		{FileName: "page.ts", Start: strings.Index(source.text, "bad"), Length: 5, source: source.text},
		{FileName: "helper.ts", Start: strings.Index(imported, "fail"), Length: 6, source: imported},
	}}, {FileName: "helper.ts", Start: strings.Index(imported, "fail"), Length: 6, source: imported}}
	remapDiagnosticLocations(diagnostics, "page.ts", source, len(diagnostics))
	expected := utf16Length(authored[:strings.Index(authored, "bad")])
	if diagnostics[0].Start != expected || diagnostics[0].Related[0].Start != expected {
		t.Fatalf("local normalization lost: %#v", diagnostics)
	}
	expected = utf16Length(imported[:strings.Index(imported, "fail")])
	if diagnostics[1].Start != expected || diagnostics[0].Related[1].Start != expected {
		t.Fatalf("imported source remapped as caller: %#v", diagnostics)
	}
	if diagnostics[0].Line != 2 || diagnostics[1].Line != 2 {
		t.Fatalf("wrong authored lines: %#v", diagnostics)
	}
}
