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
		{"duplicate field", strings.ReplaceAll(canonical, "minutes", "hours"), false},
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
