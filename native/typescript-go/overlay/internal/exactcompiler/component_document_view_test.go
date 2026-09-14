package exactcompiler

import (
	"strings"
	"testing"
)

func TestServerDocumentViewMetadata(t *testing.T) {
	for _, test := range []struct {
		name, view string
		document   bool
	}{
		{"document", `() => <html><head/><body/></html>`, true},
		{"fragment", `() => <main/>`, false},
		{"conditional", `() => flag ? <html><head/><body/></html> : <main/>`, false},
		{"wrapped", `() => <><html><head/><body/></html></>`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "document-view.tsx", Kind: "compile", Target: TargetServer, Source: `declare const flag: boolean; export function View() { return ` + test.view + `; }`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "documentRoot: true") != test.document {
				t.Fatalf("unexpected document proof: %s", response.Code)
			}
		})
	}
}
