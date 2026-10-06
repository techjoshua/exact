package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Compatibility normalization may infer a label without changing the original source span.
func TestIntlNormalizedTextEvidenceUsesAuthoredSpans(t *testing.T) {
	for _, c := range []struct{ role, text, label string }{
		{`unit="length/road"`, "㎞", "km"},
		{`unit="length/road"`, "km", "km"},
		{`currency`, "＄", "$"},
		{`currency`, "$", "$"},
		{`currency`, "ＤＯＬＬＡＲＳ", "ＤＯＬＬＡＲＳ"},
	} {
		source := `export function Page(value:number){return()=> <p intl:` + c.role + `>{value} ` + c.text + `</p>;}`
		r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US", "unitLabels": map[string]string{"km": "kilometer"}, "currencyLabels": map[string]intlCurrencyLabel{c.label: {Currency: "USD", Display: "symbol"}}}}})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		result := r.Extension.(intlAnalysis)
		if len(result.Regions) != 1 || len(result.Regions[0].Evidence) != 1 {
			t.Fatalf("lost normalized evidence for %s: %#v", c.text, result)
		}
		span := result.Regions[0].Evidence[0]
		if source[span.Start:span.Start+span.Length] != c.text {
			t.Fatalf("evidence no longer points to authored label: %#v", span)
		}
	}
}
