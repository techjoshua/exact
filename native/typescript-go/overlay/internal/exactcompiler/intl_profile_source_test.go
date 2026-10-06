package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Unit aliases and localized fallback labels must preserve dimensions, conversion and source evidence.
func TestIntlLocalizedUnitSourceProfiles(t *testing.T) {
	for _, role := range []string{"length/road", "length/person-height", "temperature/weather", "area/land", "area/floor", "mass/person", "volume/liquid", "speed/road", "pressure/weather", "energy/food", "energy/electricity", "power/engine", "fuel-economy/road", "digital/storage", "area", "mass", "volume", "speed", "pressure", "energy", "power", "fuel-economy", "digital"} {
		result := intlExpressionContract(t, `export function Page(value:number){return()=> <p intl:unit="`+role+`">{value}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost semantic unit %s: %#v", role, result)
		}
		f := result.Descriptors[0].Source[0].Formatter
		if !intlCompatibleUnit(f["quantity"].(string), f["sourceUnit"].(string)) {
			t.Fatalf("dimension mismatch: %#v", f)
		}
	}
	for _, c := range []struct {
		content, unit string
		valid         bool
	}{
		{`{value} miles`, "mile", true}, {`{value} MILES`, "mile", true},
		{`{value} km`, "kilometer", true}, {`{value} fakekm`, "mile", true},
		{`{value} 2km`, "mile", true}, {`{value} ㎞`, "kilometer", true},
		{`{value} m`, "meter", true}, {`{value} Mi`, "mile", true},
		{`{value}-{end} miles`, "mile", true}, {`{value} {end} miles`, "", false},
		{`{value}{end}{value} miles`, "", false}, {`miles`, "", false},
	} {
		source := `export function Page(value:number,end:number){return()=> <p intl:unit="length/road">` + c.content + `</p>;}`
		r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US", "unitLabels": map[string]string{"miles": "mile", "km": "kilometer", "m": "meter", "Mi": "mile"}}}})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		result := r.Extension.(intlAnalysis)
		if (len(result.Descriptors) > 0) != c.valid {
			t.Fatalf("profile changed %s: %#v", c.content, result)
		}
		if c.valid && result.Descriptors[0].Source[0].Formatter["sourceUnit"] != c.unit {
			t.Fatalf("wrong source unit %s: %#v", c.content, result)
		}
	}
}

func TestIntlCurrencySourceProfiles(t *testing.T) {
	for _, c := range []struct {
		role, text, currency, display string
		valid                         bool
	}{
		{`currency`, "USD", "USD", "code", true},
		{`currency`, "dollars", "USD", "name", true},
		{`currency`, "$", "USD", "symbol", true},
		{`currency`, "＄", "USD", "symbol", true},
		{`currency`, "xdollars dollars", "USD", "name", true},
		{`currency`, "dollarsx", "USD", "symbol", true},
		{`currency="EUR"`, "USD", "", "", false},
		{`currency="bad"`, "", "", "", false},
		{`currency="USD" intl:display="symbol"`, "USD", "", "", false},
		{`currency="USD" intl:display="code"`, "", "USD", "code", true},
		{`currency={{currency:'USD',display:'name'}}`, "", "USD", "name", true},
	} {
		source := `export function Page(value:number){return()=> <p intl:` + c.role + `>{value} ` + c.text + `</p>;}`
		r := NewSession().Execute(Request{Kind: "extension", ID: filepath.Join(t.TempDir(), "page.tsx"), Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US", "currencyLabels": map[string]intlCurrencyLabel{"dollars": {Currency: "USD", Display: "name"}, "$": {Currency: "USD", Display: "symbol"}}, "defaultCurrencyLabels": []string{"$"}}}})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		result := r.Extension.(intlAnalysis)
		if (len(result.Descriptors) > 0) != c.valid {
			t.Fatalf("currency changed %s %s: %#v", c.role, c.text, result)
		}
		if c.valid {
			f := result.Descriptors[0].Source[0].Formatter
			if f["currency"] != c.currency || f["display"] != c.display {
				t.Fatalf("wrong currency: %#v", f)
			}
		}
	}
}
