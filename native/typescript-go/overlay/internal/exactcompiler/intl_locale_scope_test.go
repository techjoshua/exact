package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

// Locale diagnostics and inherited exclusions must remain source-linked while other text stays discoverable.
func TestIntlLocaleAndUntranslatedSourceScopes(t *testing.T) {
	for _, c := range []struct {
		name, content, locale     string
		diagnostics, untranslated int
	}{
		{"unmarked text", `<p>Hello</p>`, "en-US", 0, 1},
		{"unmarked properties", `<input title="Search" placeholder={label} alt="123" aria-label=""/>`, "en-US", 0, 2},
		{"boolean property", `<input title/>`, "en-US", 0, 0},
		{"property and unmarked text", `<p title="Hint" intl:title>Outside</p>`, "en-US", 0, 1},
		{"inherited no", `<div translate="NO"><p title="Hint">Outside</p></div>`, "en-US", 0, 0},
		{"yes override", `<div translate="no"><p translate="yes">Outside</p></div>`, "en-US", 0, 1},
		{"empty override", `<div translate="no"><p translate="">Outside</p></div>`, "en-US", 0, 1},
		{"boolean override", `<div translate="no"><p translate>Outside</p></div>`, "en-US", 0, 1},
		{"dynamic exclusion", `<div translate="no"><p translate={label}>Outside</p></div>`, "en-US", 0, 0},
		{"invalid inherited", `<div translate="no"><p translate="invalid">Outside</p></div>`, "en-US", 0, 0},
		{"locale invalid", `<p intl:locale="bad_tag">Outside</p>`, "en-US", 1, 1},
		{"locale expression", `<p intl:locale={'bad_tag'}>Outside</p>`, "en-US", 1, 1},
		{"locale valid", `<p intl:locale={'en-US'}>Outside</p>`, "en-US", 0, 1},
		{"locale dynamic", `<p intl:locale={label}>Outside</p>`, "en-US", 0, 1},
		{"locale boolean", `<p intl:locale>Outside</p>`, "en-US", 0, 1},
		{"locale comment", `<p intl:locale={/* comment */}>Outside</p>`, "en-US", 0, 1},
		{"conflicting language", `<p intl:message>{new Intl.NumberFormat('fr-FR').format(count)}</p>`, "en-US", 1, 0},
		{"conflicting region", `<p intl:message>{new Intl.NumberFormat('en-GB').format(count)}</p>`, "en-US", 1, 0},
		{"compatible base", `<p intl:message>{new Intl.NumberFormat('en').format(count)}</p>`, "en-US", 0, 0},
		{"conflicting script", `<p intl:message>{new Intl.NumberFormat('zh-Hans').format(count)}</p>`, "zh-Hant", 1, 0},
		{"invalid locale", `<p intl:message>{new Intl.NumberFormat('bad_tag').format(count)}</p>`, "en-US", 1, 0},
		{"duplicate nested locale", `<p intl:message><b>{new Intl.NumberFormat('fr-FR').format(count)}</b><span intl:locale="en-US"/></p>`, "en-US", 2, 0},
		{"component property", `<Widget intl:title title="Hint"/>`, "en-US", 1, 0},
		{"self closing explicit", `<IntlMessage/>`, "en-US", 0, 0},
		{"empty explicit", `<IntlMessage></IntlMessage>`, "en-US", 1, 0},
		{"ambiguous roles", `<p intl:unit="length/road" intl:currency="USD">{count}</p>`, "en-US", 1, 0},
		{"unsupported selector", `<p intl:plural>Many</p>`, "en-US", 1, 1},
		{"unsupported exact", `<p intl:select>Many</p>`, "en-US", 1, 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export function Page(count:number,label:string){return()=> ` + c.content + `;}`
			r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": c.locale}}})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			result := r.Extension.(intlAnalysis)
			if len(result.Diagnostics) != c.diagnostics || len(result.Untranslated) != c.untranslated {
				t.Fatalf("diagnostics=%d untranslated=%d: %#v", len(result.Diagnostics), len(result.Untranslated), result)
			}
			for _, d := range result.Diagnostics {
				if d.Start < 0 || d.Length <= 0 || d.Start+d.Length > len(source) {
					t.Fatalf("lost diagnostic source: %#v", d)
				}
			}
			if strings.Contains(c.name, "conflicting") && !strings.Contains(result.Diagnostics[0].Message, "conflicts") {
				t.Fatal("lost locale guidance")
			}
		})
	}
}

// Property naming must follow lexical message ownership without merging distinct content boundaries.
func TestIntlPropertyLexicalNames(t *testing.T) {
	for _, c := range []struct{ content, name string }{
		{`<p intl:message="outer"><b title="Hint" intl:title>Text</b></p>`, "outer_title"},
		{`<IntlMessage name="explicit"><b title="Hint" intl:title>Text</b></IntlMessage>`, "explicit_title"},
		{`<IntlMessage><b title="Hint" intl:title>Text</b></IntlMessage>`, ""},
		{`<p intl:message="outer"><b title="Hint" intl:title={{name:'own'}}>Text</b></p>`, "own"},
		{`<p><b title="Hint" intl:title={{name:label}}>Text</b></p>`, ""},
	} {
		result := intlExpressionContract(t, `export function Page(label:string){return()=> `+c.content+`;}`)
		found := false
		for _, d := range result.Descriptors {
			if d.Target.Kind == "property" {
				found = true
				if d.Name != c.name {
					t.Fatalf("name=%s expected=%s", d.Name, c.name)
				}
			}
		}
		if !found || len(result.Diagnostics) != 0 {
			t.Fatalf("lost property: %#v", result)
		}
	}
}
