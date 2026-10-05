package exactcompiler

import (
	"strings"
	"testing"
)

// Real component producers exercise formatter families and their conservative scalar boundary.
func TestIntlFormatterSourceBoundaries(t *testing.T) {
	for _, c := range []struct{ expression, kind string }{
		{`Intl.NumberFormat('en-US').format(value)`, "number"},
		{`new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',currencyDisplay:'code'}).format(value)`, "currency"},
		{`new Intl.NumberFormat('en-US',{style:'unit',unit:'mile'}).format(value)`, "unit"},
		{`new Intl.NumberFormat('en-US').formatRange(value,value)`, "number"},
		{`new Intl.DateTimeFormat('en-US').formatRange(date,date)`, "date-time"},
		{`new Intl.RelativeTimeFormat('en-US',{numeric:'auto'}).format(value,'day')`, "relative-time"},
		{`new Intl.DisplayNames('en-US',{type:'language',style:'short'}).of('fr')`, "display-name"},
		{`new Intl.ListFormat('en-US',{style:'short',type:'disjunction'}).format(labels)`, "list"},
		{`new Intl.DurationFormat('en-US',{style:'long'}).format(duration)`, "duration"},
		{`date.toLocaleDateString('en-US')`, "date-time"},
		{`date.toLocaleTimeString('en-US')`, "date-time"},
		{`duration.toLocaleString('en-US')`, "duration"},
		{`published.toLocaleString('en-US',{dateStyle:'long'})`, "date-time"},
		{`duration`, "duration"},
		{`new Intl.NumberFormat(locale).format(value)`, ""},
		{`new Intl.RelativeTimeFormat(locale).format(value,'day')`, ""},
		{`new Intl.DisplayNames(locale,{type:'language'}).of('fr')`, ""},
		{`date.toLocaleDateString(locale)`, ""},
		{`duration.toLocaleString(locale)`, ""},
	} {
		t.Run(c.expression, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(value:number,date:Date,labels:string[],duration:Temporal.Duration,published:Temporal.ZonedDateTime,locale:string){return()=> <p intl:message>{`+c.expression+`}</p>;}`)
			if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
				t.Fatalf("lost supported formatter/scalar: %#v", result)
			}
			node := result.Descriptors[0].Source[0]
			if c.kind == "" {
				if node.Kind != "value" {
					t.Fatalf("unproven source rewritten: %#v", node)
				}
			} else if node.Kind != "format" || node.Formatter["kind"] != c.kind {
				t.Fatalf("lost native format: %#v", node)
			}
		})
	}
}

// Relative duration compaction is allowed only for the unchanged canonical past-tense branches.
func TestIntlRelativeDurationSourceBoundaries(t *testing.T) {
	canonical := "Math.abs(duration.hours)>0 ? `${Math.abs(duration.hours)} hour${Math.abs(duration.hours)===1?'':'s'} ago` : Math.abs(duration.minutes)>0 ? `${Math.abs(duration.minutes)} minute${Math.abs(duration.minutes)===1?'':'s'} ago` : 'now'"
	for _, c := range []struct {
		name, expression string
		compact          bool
	}{
		{"canonical", canonical, true},
		{"different root", strings.Replace(canonical, "Math.abs(duration.minutes)>0", "Math.abs(other.minutes)>0", 1), false},
		{"complete different root", strings.ReplaceAll(canonical, "duration.minutes", "other.minutes"), false},
		{"duplicate field", strings.ReplaceAll(canonical, "minutes", "hours"), false},
		{"complete duplicate field", strings.ReplaceAll(strings.ReplaceAll(canonical, "minutes", "hours"), "minute", "hour"), false},
		{"future prose", strings.ReplaceAll(canonical, " ago", " from now"), false},
		{"arithmetic", strings.Replace(canonical, "${Math.abs(duration.hours)}", "${Math.abs(duration.hours)+1}", 1), false},
		{"plural equality", strings.Replace(canonical, "===1", "==1", 1), false},
		{"changed threshold", strings.Replace(canonical, ">0", ">1", 1), false},
		{"nonliteral zero", strings.Replace(canonical, " : 'now'", " : label", 1), false},
	} {
		t.Run(c.name, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(duration:Temporal.Duration,other:Temporal.Duration,label:string){return()=> <p intl:message>{`+c.expression+`}</p>;}`)
			compact := false
			if len(result.Descriptors) > 0 {
				node := result.Descriptors[0].Source[0]
				compact = node.Kind == "format" && node.Formatter["kind"] == "relative-duration"
			}
			if compact != c.compact {
				t.Fatalf("relative duration proof changed: %#v", result)
			}
		})
	}
}

// Plural range and option extraction must retain selector arity and authored fallback calls.
func TestIntlPluralRangeAndOptionBoundaries(t *testing.T) {
	for _, c := range []struct {
		name, setup, lookup, selection string
		selectors                      int
	}{
		{"cardinal", `const rules=new Intl.PluralRules('en-US',{type:'cardinal'});`, `forms[rules.select(value)]`, "plural-cardinal", 1},
		{"ordinal", `const rules=new Intl.PluralRules('en-US',{type:'ordinal'});`, `forms[rules.select(value)]`, "plural-ordinal", 1},
		{"optional selection", `const rules=new Intl.PluralRules('en-US');`, `forms[rules.select?.(value)]`, "", 0},
		{"cardinal range", `const rules=new Intl.PluralRules('en-US');`, `forms[rules.selectRange(value,end)]`, "plural-range-cardinal", 2},
		{"ordinal range", `const rules=new Intl.PluralRules('en-US',{type:'ordinal'});`, `forms[rules.selectRange(value,end)]`, "plural-range-ordinal", 2},
		{"inline range", ``, `forms[new Intl.PluralRules('en-US').selectRange(value,end)]`, "plural-range-cardinal", 2},
		{"scalar call fallback", `const rules=new Intl.PluralRules('en-US');`, `forms[rules.select(Math.abs(value))]`, "", 0},
		{"non-selector method", `const rules=new Intl.PluralRules('en-US');`, `forms[rules.resolvedOptions().type]`, "", 0},
		{"dynamic locale", `const rules=new Intl.PluralRules(locale);`, `forms[rules.select(value)]`, "", 0},
		{"opaque options", `const rules=new Intl.PluralRules('en-US',options);`, `forms[rules.select(value)]`, "", 0},
		{"rounding changes selection", `const rules=new Intl.PluralRules('en-US',{minimumFractionDigits:2});`, `forms[rules.select(value)]`, "", 0},
		{"mutated rule", `const rules=new Intl.PluralRules('en-US');rules.selectRange=()=> 'other';`, `forms[rules.selectRange(value,end)]`, "", 0},
		{"escaped rule", `const rules=new Intl.PluralRules('en-US');change(rules);`, `forms[rules.selectRange(value,end)]`, "", 0},
		{"mutable declaration", `let rules=new Intl.PluralRules('en-US');`, `forms[rules.select(value)]`, "", 0},
		{"numeric map case", `const rules=new Intl.PluralRules('en-US');`, `({one:1,other:'other'})[rules.select(value)]`, "", 0},
		{"extra map case", `const rules=new Intl.PluralRules('en-US');`, `({one:'one',other:'other',extra:'extra'})[rules.select(value)]`, "", 0},
		{"missing fallback", `const rules=new Intl.PluralRules('en-US');`, `({one:'one'})[rules.select(value)]`, "", 0},
	} {
		t.Run(c.name, func(t *testing.T) {
			result := intlExpressionContract(t, `declare function change(rules:Intl.PluralRules):void;export function Page(value:number,end:number,locale:string,options:Intl.PluralRulesOptions){const forms={one:'one',other:'other'};`+c.setup+`return()=> <p intl:message>{`+c.lookup+`}</p>;}`)
			if len(result.Diagnostics) != 0 || len(result.Descriptors) != 1 {
				t.Fatalf("lost supported lookup: %#v", result)
			}
			node := result.Descriptors[0].Source[0]
			if node.Selection != c.selection {
				t.Fatalf("unproven plural semantics: %#v", node)
			}
			if c.selectors > 0 && (len(result.Descriptors[0].Bindings) != c.selectors || (node.RangeBinding != nil) != (c.selectors == 2)) {
				t.Fatalf("range lost independent selector: %#v", node)
			}
		})
	}
}

// Boolean options and range projections are protocol contracts, not printer snapshots.
func TestIntlFormatterRangeAndFallbackOptions(t *testing.T) {
	for _, c := range []struct {
		expression, kind string
		ranged           bool
	}{
		{`new Intl.NumberFormat('en-US',{useGrouping:true}).format(value)`, "number", false},
		{`new Intl.NumberFormat('en-US',{useGrouping:false}).formatRange(value,end)`, "number", true},
		{`new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',currencyDisplay:'code'}).formatRange(value,end)`, "currency", true},
		{`new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'UTC'}).formatRange(date,other)`, "date-time", true},
		{`new Intl.NumberFormat('en-US',options).format(value)`, "", false},
		{`new Intl.NumberFormat('en-US',{...options}).format(value)`, "", false},
		{`new Intl.NumberFormat('en-US',{get useGrouping(){return true}}).format(value)`, "", false},
		{`new Intl.DisplayNames('en-US',{type:'language',languageDisplay:'dialect'}).of('en-US')`, "display-name", false},
		{`new Intl.DisplayNames('en-US',{type:'language',languageDisplay:label}).of('en-US')`, "", false},
	} {
		t.Run(c.expression, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(value:number,end:number,date:Date,other:Date,options:Intl.NumberFormatOptions,label:string){return()=> <p intl:message>{`+c.expression+`}</p>;}`)
			if len(result.Diagnostics) != 0 || len(result.Descriptors) != 1 {
				t.Fatalf("lost formatter fallback: %#v", result)
			}
			node := result.Descriptors[0].Source[0]
			if c.kind == "" {
				if node.Kind != "value" {
					t.Fatalf("unproven formatter extracted: %#v", node)
				}
				return
			}
			if node.Kind != "format" || node.Formatter["kind"] != c.kind || (len(node.Bindings) == 2) != c.ranged {
				t.Fatalf("formatter arguments changed: %#v", node)
			}
		})
	}
}

func TestIntlOptionalFormatterRetainsAuthoredScalar(t *testing.T) {
	for _, expression := range []string{
		`date?.toLocaleString('en-US')`, `date?.toLocaleDateString('en-US')`, `date?.toLocaleTimeString('en-US')`,
		`date.toLocaleString?.('en-US')`, `nested?.date.toLocaleString('en-US')`,
		`new Intl.NumberFormat('en-US').format?.(value)`,
		`new Intl.RelativeTimeFormat('en-US').format?.(value,'day')`,
		`new Intl.DisplayNames('en-US',{type:'language'}).of?.('en-US')`,
		`Intl.NumberFormat?.('en-US').format(value)`,
	} {
		t.Run(expression, func(t *testing.T) {
			result := intlExpressionContract(t, `export function Page(date:Date|null,nested:{date:Date}|null,value:number){return()=> <output intl:message>{`+expression+`}</output>;}`)
			if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 || result.Descriptors[0].Source[0].Kind != "value" {
				t.Fatalf("optional formatter lost native short-circuit semantics: %#v", result)
			}
		})
	}
}
