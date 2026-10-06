package exactcompiler

import "testing"

// A specialized scalar range must reject structure it cannot retain, rather than discard it.
func TestIntlSpecializedRangesRetainAllChildren(t *testing.T) {
	for _, role := range []string{`currency="USD"`, `unit="distance-road"`} {
		for _, child := range []string{`<b>extra</b>`, `<br/>`, `<>{label}</>`, `<Widget/>`} {
			result := intlExpressionContract(t, `export function Page(value:number,label:string){return()=> <p intl:`+role+`>{value} `+child+`</p>;}`)
			if len(result.Descriptors) != 0 || len(result.Diagnostics) == 0 {
				t.Fatalf("specialized range discarded %s: %#v", child, result)
			}
		}
	}
}

// Native lists accept arbitrary iterables. Only string arrays fit the prepared list projection.
func TestIntlListProjectionRequiresStringArray(t *testing.T) {
	for _, c := range []struct {
		input     string
		projected bool
	}{
		{"string[]", true}, {"readonly string[]", true}, {"[string,string]", true},
		{"string", false}, {"Set<string>", false}, {"Iterable<string>", false},
		{"number[]", false}, {"unknown", false}, {"string[]|Set<string>", false},
	} {
		result := intlExpressionContract(t, `export function Page(value:`+c.input+`){return()=> <p intl:message>{new Intl.ListFormat('en-US').format(value)}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost native list fallback: %#v", result)
		}
		if (result.Descriptors[0].Source[0].Kind == "format") != c.projected {
			t.Fatalf("list projection changed iterable semantics for %s: %#v", c.input, result)
		}
	}
}

// Date prototype methods have different default-field and style rules from DateTimeFormat.
func TestIntlDateProjectionDefaults(t *testing.T) {
	for _, c := range []struct {
		method, options, field string
		projected              bool
	}{
		{"toLocaleString", `{timeZone:'UTC'}`, "hour", true},
		{"toLocaleString", `{timeZoneName:'short'}`, "hour", true},
		{"toLocaleDateString", `{hour:'numeric'}`, "year", true},
		{"toLocaleTimeString", `{year:'numeric'}`, "hour", true},
		{"toLocaleDateString", `{timeStyle:'short'}`, "", false},
		{"toLocaleTimeString", `{dateStyle:'short'}`, "", false},
	} {
		result := intlExpressionContract(t, `export function Page(value:Date){return()=> <p intl:message>{value.`+c.method+`('en-US',`+c.options+`)}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost date fallback: %#v", result)
		}
		node := result.Descriptors[0].Source[0]
		if (node.Kind == "format") != c.projected {
			t.Fatalf("lost prototype style restriction: %#v", node)
		}
		if c.projected && node.Formatter["options"].(map[string]any)[c.field] != "numeric" {
			t.Fatalf("lost default %s: %#v", c.field, node)
		}
	}
}

// Textual ordinal evidence cannot turn a nonnumeric value into a numeric runtime selector.
func TestIntlOrdinalWrapperRequiresNumericValue(t *testing.T) {
	for _, input := range []string{"number", "string", "number|string"} {
		generation := intlCacheGeneration(t, `export function Page(value:`+input+`){return()=> <p intl:message>第{value}位</p>;}`)
		request := Request{ID: generation.sourceFile.FileName(), Source: generation.sourceFile.Text(), Extension: &ExtensionRequest{Payload: map[string]any{"owner": "fixture", "sourceLocale": "ja-JP", "ordinalWrappers": []intlOrdinalWrapper{{Prefix: "第", Suffix: "位"}}}}}
		result, err := analyzeIntlSourceNative(request, generation.sourceFile, generation.checker)
		if err != nil || len(result.Descriptors) != 1 {
			t.Fatalf("lost lexical fallback: %v %#v", err, result)
		}
		ordinal := result.Descriptors[0].Source[0].Selection == "plural-ordinal"
		if ordinal != (input == "number") {
			t.Fatalf("unproven ordinal for %s: %#v", input, result.Descriptors[0].Source)
		}
	}
}

func TestIntlNativePluralRequiresNumericValue(t *testing.T) {
	for _, input := range []string{"number", "string", "number|string"} {
		result := intlExpressionContract(t, `export function Page(value:`+input+`){const rules=new Intl.PluralRules('en-US');const forms={one:'one',other:'other'};return()=> <p intl:message>{forms[rules.select(value)]}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost plural fallback: %#v", result)
		}
		if (result.Descriptors[0].Source[0].Selection == "plural-cardinal") != (input == "number") {
			t.Fatalf("unproven plural operand for %s", input)
		}
	}
}

// Unproven authored options cannot be treated as absent and replaced with locale defaults.
func TestIntlSpecializedOptionProofs(t *testing.T) {
	for _, role := range []string{`currency={label}`, `currency={{currency:'USD',...options}}`, `currency={{...options}}`, `currency="USD" intl:display={label}`, `unit="length/road" intl:source-unit={label}`, `unit="length/road" intl:convert-to={label}`} {
		result := intlExpressionContract(t, `export function Page(value:number,label:string,options:{}){return()=> <p intl:`+role+`>{value}</p>;}`)
		if len(result.Descriptors) != 0 || len(result.Diagnostics) == 0 {
			t.Fatalf("unproven option became locale default: %s", role)
		}
	}
}

func TestIntlSpecializedLiteralControls(t *testing.T) {
	for _, role := range []string{`currency={true}`, `currency={'USD'}`, `currency={{...options,currency:'USD',display:'code'}}`, `unit={'length/road'}`, `unit="length/road" intl:source-unit={'mile'} intl:convert-to={'kilometer'}`} {
		result := intlExpressionContract(t, `export function Page(value:number,options:{}){return()=> <p intl:`+role+`>{value}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("valid static activation rejected: %s %#v", role, result)
		}
	}
}

// Native unit formatting retains NumberFormat semantics rather than semantic measurement conversion.
func TestIntlNativeUnitContracts(t *testing.T) {
	for _, input := range []string{"number", "bigint", "number|bigint", "unknown"} {
		for _, unit := range []string{"mile", "degree", "percent", "meter-per-second"} {
			result := intlExpressionContract(t, `export function Page(value:`+input+`){return()=> <p intl:message>{new Intl.NumberFormat('en-US',{style:'unit',unit:'`+unit+`'}).format(value)}</p>;}`)
			if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 || result.Descriptors[0].Source[0].Formatter["quantity"] != "unit" {
				t.Fatalf("lost native unit contract for %s/%s: %#v", input, unit, result)
			}
		}
	}
	for _, unit := range []string{"square-meter", "hectopascal", "kilowatt-hour", "meter-per-second-per-hour", "meter-per-unknown", "unknown-per-second", "meter-per-", "unknown"} {
		result := intlExpressionContract(t, `export function Page(value:number){return()=> <p intl:message>{new Intl.NumberFormat('en-US',{style:'unit',unit:'`+unit+`'}).format(value)}</p>;}`)
		if len(result.Descriptors) != 1 || result.Descriptors[0].Source[0].Kind != "value" {
			t.Fatalf("erased native constructor error for %s", unit)
		}
	}
}

// Calendar and numbering extensions are authored formatter policy, not disposable locale spelling.
func TestIntlLocaleExtensionsRetainNativeCalls(t *testing.T) {
	for _, expression := range []string{`new Intl.NumberFormat('en-US-u-nu-arab').format(value)`, `date.toLocaleDateString('en-US-u-ca-islamic')`, `new Intl.DateTimeFormat('en-US-u-ca-islamic').format(date)`, `new Intl.ListFormat('en-US-u-nu-arab').format(labels)`, `new Intl.RelativeTimeFormat('en-US-u-nu-arab').format(value,'day')`, `forms[rules.select(value)]`} {
		result := intlExpressionContract(t, `export function Page(value:number,date:Date,labels:string[]){const forms={one:'one',other:'other'};const rules=new Intl.PluralRules('en-US-u-nu-arab');return()=> <p intl:message>{`+expression+`}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 || result.Descriptors[0].Source[0].Kind != "value" {
			t.Fatalf("authored locale policy erased: %s %#v", expression, result)
		}
	}
}
