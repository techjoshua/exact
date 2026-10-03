package exactcompiler

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

// Extension requests bypass normal lowering. Protect the analyzer protocol at its real session
// boundary, including payload bounds that downstream locale-profile generation normally satisfies.
func TestIntlExtensionPayloadContracts(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	execute := func(namespace string, payload any) Response {
		return session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Report.tsx"), Root: root,
			Source:    `export function Report(value:number){return()=> <p intl:message>Hello {value}</p>;}`,
			Extension: &ExtensionRequest{Namespace: namespace, Payload: payload}})
	}
	valid := func() map[string]any { return map[string]any{"owner": "example", "sourceLocale": "en-US"} }
	cases := []struct {
		name    string
		payload any
		message string
	}{
		{"missing owner", map[string]any{"sourceLocale": "en-US"}, "requires owner"},
		{"missing locale", map[string]any{"owner": "example"}, "requires owner and sourceLocale"},
		{"wrong payload shape", []string{"invalid"}, "could not decode"},
		{"empty unit label", map[string]any{"unitLabels": map[string]string{"": "meter"}}, "unit profile contains"},
		{"long unit label", map[string]any{"unitLabels": map[string]string{strings.Repeat("u", 129): "meter"}}, "unit profile contains"},
		{"unknown unit", map[string]any{"unitLabels": map[string]string{"length": "unsupported"}}, "unsupported unit"},
		{"invalid currency", map[string]any{"currencyLabels": map[string]any{"dollars": map[string]string{"currency": "usd", "display": "name"}}}, "three uppercase"},
		{"invalid display", map[string]any{"currencyLabels": map[string]any{"dollars": map[string]string{"currency": "USD", "display": "code"}}}, "display symbol or name"},
		{"empty currency label", map[string]any{"currencyLabels": map[string]any{"": map[string]string{"currency": "USD", "display": "symbol"}}}, "nonempty labels"},
		{"long currency label", map[string]any{"currencyLabels": map[string]any{strings.Repeat("c", 257): map[string]string{"currency": "USD", "display": "symbol"}}}, "256 bytes"},
		{"empty default label", map[string]any{"defaultCurrencyLabels": []string{""}}, "default-currency profile requires"},
		{"long default label", map[string]any{"defaultCurrencyLabels": []string{strings.Repeat("c", 65)}}, "64 bytes"},
		{"empty ordinal", map[string]any{"ordinalMarkers": []string{""}}, "ordinal profile requires"},
		{"long ordinal", map[string]any{"ordinalMarkers": []string{strings.Repeat("o", 129)}}, "128 bytes"},
		{"empty wrapper", map[string]any{"ordinalWrappers": []map[string]string{{"prefix": "", "suffix": ""}}}, "nonempty prefix or suffix"},
		{"long wrapper", map[string]any{"ordinalWrappers": []map[string]string{{"prefix": strings.Repeat("o", 65)}}}, "64 bytes"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			payload := valid()
			if additions, ok := test.payload.(map[string]any); ok {
				for key, value := range additions {
					payload[key] = value
				}
				if test.name == "missing owner" {
					delete(payload, "owner")
				}
				if test.name == "missing locale" {
					delete(payload, "sourceLocale")
				}
			}
			var input any = payload
			if test.name == "wrong payload shape" {
				input = test.payload
			}
			response := execute(intlAnalyzeNamespace, input)
			if !strings.Contains(response.Error, test.message) {
				t.Fatalf("missing causal error %q: %s", test.message, response.Error)
			}
			control := execute(intlAnalyzeNamespace, valid())
			if control.Error != "" {
				t.Fatalf("valid control rejected after invalid request: %s", control.Error)
			}
		})
	}
	for _, profile := range []struct {
		name  string
		limit int
	}{{"unitLabels", 512}, {"currencyLabels", 1024}, {"defaultCurrencyLabels", 32}, {"ordinalMarkers", 64}, {"ordinalWrappers", 32}} {
		t.Run(profile.name, func(t *testing.T) {
			for _, count := range []int{profile.limit, profile.limit + 1} {
				payload := valid()
				entries := map[string]any{}
				labels := []string{}
				wrappers := []map[string]string{}
				for i := 0; i < count; i++ {
					key := fmt.Sprintf("label%d", i)
					entries[key] = "meter"
					if profile.name == "currencyLabels" {
						entries[key] = map[string]string{"currency": "USD", "display": "symbol"}
					}
					labels = append(labels, key)
					wrappers = append(wrappers, map[string]string{"prefix": key})
				}
				switch profile.name {
				case "unitLabels", "currencyLabels":
					payload[profile.name] = entries
				case "ordinalWrappers":
					payload[profile.name] = wrappers
				default:
					payload[profile.name] = labels
				}
				response := execute(intlAnalyzeNamespace, payload)
				if count == profile.limit && response.Error != "" {
					t.Fatalf("valid boundary rejected: %s", response.Error)
				}
				if count > profile.limit && !strings.Contains(response.Error, "exceeds") {
					t.Fatalf("oversized profile accepted: %#v", response)
				}
			}
		})
	}
	if response := execute("unsupported", valid()); !strings.Contains(response.Error, "unsupported native extension namespace") {
		t.Fatalf("unknown namespace accepted: %#v", response)
	}
}

func TestIntlExtensionSemanticPatterns(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	for _, test := range []struct{ name, content, kind string }{
		{"message", `<p intl:message>Hello {value}</p>`, "value"},
		{"currency", `<output intl:currency="USD">{value}</output>`, "format"},
		{"unit", `<output intl:unit="distance-road">{value} miles</output>`, "format"},
		{"plural", `<p intl:message>{value===1?'item':'items'}</p>`, "select"},
		{"property", `<img alt="Hello" intl:alt />`, "text"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export function Report(value:number){return()=> ` + test.content + `;}`
			response := session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Report.tsx"), Root: root, Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "example", "sourceLocale": "en-US"}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			analysis, ok := response.Extension.(intlAnalysis)
			if !ok || len(analysis.Descriptors) != 1 || len(analysis.Diagnostics) != 0 {
				t.Fatalf("expected one valid descriptor: %#v", response.Extension)
			}
			descriptor := analysis.Descriptors[0]
			if descriptor.Owner != "example" || descriptor.OwnerComponentID == "" || descriptor.SourceRange.Start < 0 || descriptor.SourceRange.Start+descriptor.SourceRange.Length > len(source) {
				t.Fatalf("lost owner or source range: %#v", descriptor)
			}
			encoded, err := json.Marshal(analysis)
			if err != nil || !strings.Contains(string(encoded), `"kind":"`+test.kind+`"`) {
				t.Fatalf("missing semantic pattern %s: %s (%v)", test.kind, encoded, err)
			}
		})
	}
}

// Source units are protocol facts. Locale defaults and explicit overrides must stay dimensionally valid.
func TestIntlExtensionSemanticUnitBoundaries(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	execute := func(locale, attributes string) intlAnalysis {
		response := session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Units.tsx"), Root: root,
			Source:    `export function Unit(value:number){return()=> <output ` + attributes + `>{value}</output>;}`,
			Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "example", "sourceLocale": locale}}})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		return response.Extension.(intlAnalysis)
	}
	for _, example := range []struct{ semantic, us, gb, other string }{
		{"distance-road", "mile", "mile", "kilometer"},
		{"length-person-height", "inch", "centimeter", "centimeter"},
		{"temperature-weather", "fahrenheit", "celsius", "celsius"},
		{"area-land", "acre", "hectare", "hectare"},
		{"area-floor", "square-foot", "square-meter", "square-meter"},
		{"mass-person", "pound", "stone", "kilogram"},
		{"volume-liquid", "gallon", "liter", "liter"},
		{"speed-road", "mile-per-hour", "mile-per-hour", "kilometer-per-hour"},
		{"pressure-weather", "inch-of-mercury", "hectopascal", "hectopascal"},
		{"energy-food", "kilocalorie", "kilojoule", "kilojoule"},
		{"energy-electricity", "kilowatt-hour", "kilowatt-hour", "kilowatt-hour"},
		{"power-engine", "horsepower", "horsepower", "kilowatt"},
		{"fuel-economy-road", "mile-per-gallon", "mile-per-gallon-imperial", "liter-per-100-kilometer"},
		{"digital-storage", "gigabyte", "gigabyte", "gigabyte"},
	} {
		for _, locale := range []struct{ name, unit string }{{"en-US", example.us}, {"en-GB", example.gb}, {"fr-FR", example.other}} {
			t.Run(example.semantic+"/"+locale.name, func(t *testing.T) {
				analysis := execute(locale.name, `intl:unit="`+example.semantic+`"`)
				if len(analysis.Diagnostics) != 0 || len(analysis.Descriptors) != 1 {
					t.Fatalf("default rejected: %#v", analysis)
				}
				formatter := analysis.Descriptors[0].Source[0].Formatter
				if formatter["sourceUnit"] != locale.unit {
					t.Fatalf("wrong default: %#v", formatter)
				}
			})
		}
	}
	for _, attributes := range []string{
		`intl:unit="distance-road" intl:source-unit="kilogram"`,
		`intl:unit="distance-road" intl:source-unit="unsupported"`,
		`intl:unit="unsupported"`,
		`intl:unit={{unit:"distance-road",sourceUnit:"kilogram"}}`,
		`intl:unit="distance-road" intl:convert-to="kilogram"`,
	} {
		t.Run(attributes, func(t *testing.T) {
			analysis := execute("en-US", attributes)
			if len(analysis.Descriptors) != 0 || len(analysis.Diagnostics) == 0 {
				t.Fatalf("invalid unit accepted: %#v", analysis)
			}
			control := execute("fr-FR", `intl:unit="distance-road" intl:source-unit="mile" intl:convert-to="kilometer"`)
			if len(control.Diagnostics) != 0 || len(control.Descriptors) != 1 || control.Descriptors[0].Source[0].Formatter["sourceUnit"] != "mile" {
				t.Fatalf("valid override rejected: %#v", control)
			}
		})
	}
}

// Analyzer inference must not replace opaque helpers or custom builtin-named values.
func TestIntlExtensionPreservesCallableSemantics(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	for _, example := range []struct{ name, source string }{
		{"changed helper", `function age(duration:{days:number;hours:number}){const units=[{value:duration.days,unit:'day'},{value:duration.hours,unit:'hour'}] as const;const match=units.find(candidate=>candidate.value>5);if(!match)return 'just now';return new Intl.RelativeTimeFormat('en-US').format(Math.abs(match.value),match.unit);}export function View(duration:{days:number;hours:number}){return()=> <p intl:message>{age(duration)}</p>;}`},
		{"shadowed Intl", `export function View(Intl:{NumberFormat:new(locale:string)=>{format(value:number):string}},value:number){return()=> <p intl:message>{new Intl.NumberFormat('fr-FR').format(value)}</p>;}`},
		{"direct native select", `export function View(value:number){return()=> <p intl:message>{new Intl.PluralRules('en-US').select(value)}</p>;}`},
		{"custom select", `export function View(value:number){return()=> <p intl:message>{({select:(n:number)=>String(n)}).select(value)}</p>;}`},
	} {
		t.Run(example.name, func(t *testing.T) {
			response := session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Calls.tsx"), Root: root, Source: example.source,
				Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "example", "sourceLocale": "en-US"}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			analysis := response.Extension.(intlAnalysis)
			if len(analysis.Diagnostics) != 0 || len(analysis.Descriptors) != 1 {
				t.Fatalf("valid call rejected: %#v", analysis)
			}
			pattern := analysis.Descriptors[0].Source
			if len(pattern) != 1 || pattern[0].Kind != "value" {
				t.Fatalf("call changed semantics: %#v", pattern)
			}
		})
	}
}

// A helper's primitive result may cross a scalar binding, but promises and opaque values may not.
func TestIntlExtensionScalarCallableBoundaries(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	for _, enhancement := range []string{`intl:message`, `intl:currency`, `intl:unit="distance-road"`} {
		for _, example := range []struct {
			name, declaration string
			valid             bool
		}{
			{"number", `function helper(value:number){return Math.round(value);}`, true},
			{"object", `function helper(value:number){return {value};}`, false},
			{"unknown", `declare function helper(value:number):unknown;`, false},
			{"any", `declare function helper(value:number):any;`, false},
			{"promise", `async function helper(value:number){return value;}`, false},
		} {
			t.Run(enhancement+"/"+example.name, func(t *testing.T) {
				response := session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Scalar.tsx"), Root: root,
					Source:    example.declaration + `export function View(value:number){return()=> <p ` + enhancement + `>{helper(value)}</p>;}`,
					Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "example", "sourceLocale": "en-US"}}})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				analysis := response.Extension.(intlAnalysis)
				if example.valid {
					if len(analysis.Diagnostics) != 0 || len(analysis.Descriptors) != 1 {
						t.Fatalf("valid scalar rejected: %#v", analysis)
					}
				} else if len(analysis.Diagnostics) == 0 || len(analysis.Descriptors) != 0 {
					t.Fatalf("opaque result admitted: %#v", analysis)
				}
			})
		}
	}
}
