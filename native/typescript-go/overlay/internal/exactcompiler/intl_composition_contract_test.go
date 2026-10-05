package exactcompiler

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

// These session witnesses preserve content/property ownership, nested structure,
// explicit roles and selector binding reuse at the native extraction boundary.
func TestIntlCompositionSourceContracts(t *testing.T) {
	for _, c := range []struct {
		name, content, required string
		valid                   bool
	}{
		{"property-expression", `<button aria-label={label} intl:aria-label/>`, `"kind":"value"`, true},
		{"property-empty", `<button aria-label="" intl:aria-label/>`, "", false},
		{"property-missing", `<button intl:aria-label/>`, "", false},
		{"property-boolean", `<button aria-label intl:aria-label/>`, "", false},
		{"language-domain", `<button aria-label={label} intl:aria-label="display-name:languageCode"/>`, `"domain":"language"`, true},
		{"region-domain", `<button aria-label={label} intl:aria-label="display-name:regionCode"/>`, `"domain":"region"`, true},
		{"script-domain", `<button aria-label={label} intl:aria-label="display-name:script"/>`, `"domain":"script"`, true},
		{"currency-domain", `<button aria-label={label} intl:aria-label="display-name:currencyCode"/>`, `"domain":"currency"`, true},
		{"calendar-domain", `<button aria-label={label} intl:aria-label="display-name:calendar"/>`, `"domain":"calendar"`, true},
		{"field-domain", `<button aria-label={label} intl:aria-label="display-name:dateTimeField"/>`, `"domain":"dateTimeField"`, true},
		{"invalid-domain", `<button aria-label={label} intl:aria-label="display-name:unknown"/>`, "", false},
		{"intrinsic-structure", `<p intl:message>Read <a href="/terms" intl:fragment="terms">terms</a>.</p>`, `"kind":"element"`, true},
		{"opaque-structure", `<p intl:message>Hello <_ intl:fragment="badge"><Badge/></_>.</p>`, `"kind":"opaque"`, true},
		{"invalid-fragment", `<p intl:message>Hello <_ intl:fragment="1invalid"><Badge/></_>.</p>`, "", false},
		{"unowned-component", `<p intl:message>Hello <Badge/>.</p>`, "", false},
		{"nested-message", `<p intl:message>Hello <span intl:message>again</span>.</p>`, "", false},
		{"nested-plural", `<p intl:message><span intl:plural={count}>{count===1?'one':'many'}</span></p>`, `"selection":"plural-cardinal"`, true},
		{"nested-empty-options", `<p intl:message><span intl:plural={{}}>text</span></p>`, "", false},
		{"nested-unrelated-options", `<p intl:message><span intl:plural={{name:'count'}}>text</span></p>`, "", false},
		{"nested-object-plural", `<p intl:message><span intl:plural={{value:count}}>{count===1?'one':'many'}</span></p>`, `"selection":"plural-cardinal"`, true},
		{"nested-computed-plural", `<p intl:message><span intl:plural={{['value']:count}}>{count===1?'one':'many'}</span></p>`, `"selection":"plural-cardinal"`, true},
		{"nested-select", `<p intl:message><span intl:select={label}>{label==='a'?'A':'Other'}</span></p>`, `"selection":"exact"`, true},
		{"ambiguous-role", `<p intl:message><span intl:plural={count} intl:select={label}>text</span></p>`, "", false},
		{"missing-selector", `<p intl:message><span intl:plural>text</span></p>`, "", false},
		{"fragment-multiple", `<p intl:message><_>first {label}</_></p>`, "", false},
		{"template", "<p intl:message>{`Hello ${label}!`}</p>", `"value":"Hello "`, true},
		{"explicit-message", `<IntlMessage name="greeting">Hello {label}</IntlMessage>`, `Hello `, true},
		{"explicit-plural", `<IntlPlural plural={count}>{count===1?'one':'many'}</IntlPlural>`, `"kind":"select"`, true},
		{"explicit-select", `<IntlSelect select={label}>{label==='a'?'A':'Other'}</IntlSelect>`, `"kind":"select"`, true},
		{"explicit-currency", `<IntlCurrency>{count} US dollars</IntlCurrency>`, `"kind":"currency"`, true},
		{"explicit-unit", `<IntlUnit unit="distance-road">{count} miles</IntlUnit>`, `"kind":"unit"`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import {IntlMessage,IntlPlural,IntlSelect,IntlCurrency,IntlUnit} from '@exactjs/intl';export function Page(count:number,label:string){return()=> ` + c.content + `;}`
			r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US"}}})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			result := r.Extension.(intlAnalysis)
			if (len(result.Descriptors) > 0) != c.valid || (c.valid && len(result.Diagnostics) > 0) {
				t.Fatalf("composition recognition changed: %#v", result)
			}
			if c.valid {
				data, err := json.Marshal(result.Descriptors)
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(string(data), c.required) {
					t.Fatalf("lost semantic contract %s: %s", c.required, data)
				}
			}
		})
	}
}
