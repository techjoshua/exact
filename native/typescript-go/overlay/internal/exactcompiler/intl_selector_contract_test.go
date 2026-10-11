package exactcompiler

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

// Extraction must retain independent selector inputs and exact native formatter options.
func TestIntlNestedSelectorsAndFormatterOptions(t *testing.T) {
	cases := []struct {
		name, content string
		required      []string
	}{
		{"nested selectors", `<p intl:message>{count===1?(hours===1?'one day / one hour':'one day / many hours'):(hours===1?'many days / one hour':'many days / many hours')}</p>`, []string{`"kind":"select"`, `one day / one hour`, `one day / many hours`, `many days / one hour`, `many days / many hours`}},
		{"number options", `<p intl:message>{new Intl.NumberFormat('en-US',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'always'}).format(count)}</p>`, []string{`"useGrouping":false`, `"minimumFractionDigits":2`, `"maximumFractionDigits":2`, `"signDisplay":"always"`}},
		{"date options", `<p intl:message>{new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',timeZone:'UTC'}).format(date)}</p>`, []string{`"timeZone":"UTC"`, `"month":"long"`, `"year":"numeric"`}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			source := `export function Page(count:number,hours:number,date:Date){return()=> ` + c.content + `;}`
			response := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US"}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			result := response.Extension.(intlAnalysis)
			if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
				t.Fatalf("valid extraction lost: %#v", result)
			}
			data, err := json.Marshal(result.Descriptors[0].Source)
			if err != nil {
				t.Fatal(err)
			}
			for _, required := range c.required {
				if !strings.Contains(string(data), required) {
					t.Fatalf("lost semantics %s: %s", required, data)
				}
			}
		})
	}
}
