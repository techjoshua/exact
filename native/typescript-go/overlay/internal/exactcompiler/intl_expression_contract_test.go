package exactcompiler

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

// Mixed primitive equality cannot be represented by a string-keyed or numeric selector.
// Keep the authored Boolean comparison when its native semantics are not proven equivalent.
func TestIntlEqualityRetainsUnprovenComparison(t *testing.T) {
	for _, c := range []struct{ name, input, condition, selection string }{
		{"numeric", "number", "value === 1", "plural-cardinal"},
		{"string", "string", "value === 'one'", "exact"},
		{"boolean", "boolean", "value === false", "exact"},
		{"strict mixed number", "number | string", "value === 1", "boolean"},
		{"strict mixed string", "number | string", "value === '1'", "boolean"},
		{"loose mixed number", "number | string", "value == 1", "boolean"},
		{"loose nullish string", "string | null", "value == ''", "boolean"},
		{"loose Boolean", "boolean | number", "value == false", "boolean"},
		{"unknown", "unknown", "value === 'one'", "boolean"},
	} {
		t.Run(c.name, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(value:`+c.input+`){return()=> <p intl:message>{`+c.condition+`?'yes':'no'}</p>;}`)
			if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
				t.Fatalf("lost valid native comparison: %#v", result)
			}
			node := result.Descriptors[0].Source[0]
			if node.Selection != c.selection {
				t.Fatalf("comparison semantics changed: %#v", node)
			}
		})
	}
}

// Native inference must use the selected native method, not a user type's display name.
func TestIntlFormatterIdentityAndOptions(t *testing.T) {
	for _, c := range []struct{ name, prelude, expression, kind string }{
		{"native date", "", `date.toLocaleString('en-US')`, "date-time"},
		{"custom Date", `class Date {toLocaleString(){return 'custom'}}`, `new Date().toLocaleString()`, ""},
		{"custom Duration", `class Duration {toLocaleString(){return 'custom'}}`, `new Duration().toLocaleString()`, ""},
		{"native number", "", `new Intl.NumberFormat('en-US',{useGrouping:false}).format(value)`, "number"},
		{"proto options", "", `new Intl.NumberFormat('en-US',{__proto__:{minimumFractionDigits:2}}).format(value)`, ""},
		{"indexed options", "", `new Intl.NumberFormat('en-US',{['minimumFractionDigits']:2}).format(value)`, "number"},
		{"dynamic options", "", `new Intl.NumberFormat('en-US',{minimumFractionDigits:value}).format(value)`, ""},
		{"effectful locale", `function locale(){return 'en-US'}`, `new Intl.NumberFormat(locale()).format(value)`, ""},
		{"dynamic locale", "", `new Intl.NumberFormat(label).format(value)`, ""},
		{"custom date override", `class CustomDate extends Date {override toLocaleString(){return 'custom'}}`, `new CustomDate().toLocaleString()`, ""},
		{"native date alias", `type NativeDate = Date;`, `(date as NativeDate).toLocaleString('en-US')`, "date-time"},
		{"custom Instant", `class Instant {toLocaleString(){return 'custom'}}`, `new Instant().toLocaleString()`, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			result := intlExpressionContract(t, c.prelude+` export function Page(value:number,date:Date,label:string){return()=> <p intl:message>{`+c.expression+`}</p>;}`)
			if len(result.Diagnostics) != 0 || len(result.Descriptors) != 1 {
				t.Fatalf("lost prepared scalar fallback: %#v", result)
			}
			data, err := json.Marshal(result.Descriptors[0].Source)
			if err != nil {
				t.Fatal(err)
			}
			if c.kind == "" {
				if strings.Contains(string(data), `"kind":"format"`) {
					t.Fatalf("unproven formatter rewritten: %s", data)
				}
			} else if !strings.Contains(string(data), `"kind":"`+c.kind+`"`) {
				t.Fatalf("native formatter lost: %s", data)
			}
		})
	}
}

func intlExpressionContract(t *testing.T, source string) intlAnalysis {
	t.Helper()
	r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US", "ordinalMarkers": []string{"st", "nd", "rd", "th"}}}})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	return r.Extension.(intlAnalysis)
}

// Native plural inference cannot replace a mutable map or overridden selected method.
func TestIntlPluralLookupRequiresStableValues(t *testing.T) {
	for _, c := range []struct {
		name, setup string
		inferred    bool
	}{
		{"static", "", true},
		{"direct write", `forms.one='changed';`, false},
		{"alias write", `const alias=forms;alias.one='changed';`, false},
		{"passed helper", `function change(map:typeof forms){map.one='changed'}change(forms);`, false},
		{"rule override", `rules.select=()=> 'other';`, false},
		{"unrelated write", `const other={one:'else'};other.one='changed';`, true},
		{"destructured write", `({one:forms.one}={one:'changed'});`, false},
		{"loop write", `for(forms.one of ['changed']){}`, false},
		{"type reference", `type Forms=typeof forms;`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(value:number){const rules=new Intl.PluralRules('en-US');const forms={one:'one',other:'other'};`+c.setup+`return()=> <p intl:message>{forms[rules.select(value)]}</p>;}`)
			if len(result.Diagnostics) != 0 || len(result.Descriptors) != 1 {
				t.Fatalf("lost scalar fallback: %#v", result)
			}
			if (result.Descriptors[0].Source[0].Selection == "plural-cardinal") != c.inferred {
				t.Fatalf("mutable authored lookup replaced: %#v", result.Descriptors[0].Source)
			}
		})
	}
}

func TestIntlOrdinalDuplicateCasesStayNative(t *testing.T) {
	result := intlExpressionContract(t, `export function Page(value:number){return()=> <p intl:message>{value===1?'st':value===1?'nd':'th'}</p>;}`)
	if len(result.Diagnostics) != 0 || len(result.Descriptors) != 1 || result.Descriptors[0].Source[0].Selection == "plural-ordinal" {
		t.Fatalf("duplicate native cases cannot become duplicate protocol keys: %#v", result)
	}
}

func TestIntlOrdinalMixedTypesRetainAuthoredComparison(t *testing.T) {
	for _, input := range []string{"number", "number|string", "unknown"} {
		result := intlExpressionContract(t, `export function Page(value:`+input+`){return()=> <p intl:message>{value===1?'st':value===2?'nd':'th'}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost ordinal fallback: %#v", result)
		}
		if (result.Descriptors[0].Source[0].Selection == "plural-ordinal") != (input == "number") {
			t.Fatalf("unproven ordinal converted: %#v", result.Descriptors[0].Source)
		}
	}
}
