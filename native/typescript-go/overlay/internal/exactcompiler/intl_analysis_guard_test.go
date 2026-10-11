package exactcompiler

import (
	"strings"
	"testing"
)

// Alternative duration branches must retain authored selectors instead of acquiring fixed prose.
func TestIntlRelativeDurationAdjacentProofs(t *testing.T) {
	canonical := "Math.abs(duration.hours)>0 ? `${Math.abs(duration.hours)} hour${Math.abs(duration.hours)===1?'':'s'} ago` : Math.abs(duration.minutes)>0 ? `${Math.abs(duration.minutes)} minute${Math.abs(duration.minutes)===1?'':'s'} ago` : 'now'"
	for _, replacement := range []struct{ from, to string }{
		{"Math.abs(duration.hours)>0", "ready"},
		{"Math.abs(duration.hours)>0", "duration.hours>0"},
		{"Math.abs(duration.hours)>0", "Math.abs(duration.hours,1)>0"},
		{"Math.abs(duration.hours)>0", "custom.abs(duration.hours)>0"},
		{"Math.abs(duration.hours)>0", "Math.floor(duration.hours)>0"},
		{"duration.hours", "duration.nanoseconds"},
		{"`${Math.abs(duration.hours)} hour${Math.abs(duration.hours)===1?'':'s'} ago`", "'hours'"},
		{"`${Math.abs(duration.hours)}", "`About ${Math.abs(duration.hours)}"},
		{"${Math.abs(duration.hours)===1?'':'s'}", "${suffix}"},
		{"Math.abs(duration.hours)===1", "ready"},
		{"duration.hours", "duration['hours']"},
	} {
		source := `export function Page(duration:Temporal.Duration,ready:boolean,suffix:string,custom:{abs(n:number):number}){return()=> <p intl:message>{` + strings.Replace(canonical, replacement.from, replacement.to, 1) + `}</p>;}`
		result := intlExpressionContract(t, source)
		for _, d := range result.Descriptors {
			for _, n := range d.Source {
				if n.Kind == "format" && n.Formatter["kind"] == "relative-duration" {
					t.Fatalf("unproven duration projection: %s", source)
				}
			}
		}
	}
}

func TestIntlOrdinalAdjacentProofs(t *testing.T) {
	for _, expression := range []string{
		`1===value?'st':2===value?'nd':'th'`,
		`ready?'st':value===2?'nd':'th'`,
		`value===other?'st':value===2?'nd':'th'`,
		`value===1?'st':other===2?'nd':'th'`,
		`value===1?'first':value===2?'second':'other'`,
	} {
		result := intlExpressionContract(t, `export function Page(value:number,other:number,ready:boolean){return()=> <p intl:message>{`+expression+`}</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost native selector: %#v", result)
		}
		ordinal := result.Descriptors[0].Source[0].Selection == "plural-ordinal"
		if ordinal != strings.HasPrefix(expression, "1===") {
			t.Fatalf("ordinal proof changed %s", expression)
		}
	}
}

func TestIntlStaticObjectOptionsSourceControls(t *testing.T) {
	for _, c := range []struct {
		role  string
		valid bool
	}{
		{`currency={{currency:'USD'}}`, true},
		{`currency={{currency:'USD',name:'total'}}`, true},
		{`currency={{currency:'USD',name:label}}`, true},
		{`currency={{currency:'USD',get name(){return 'total'}}}`, true},
		{`currency={{currency:'USD',...options}}`, false},
		{`select={{value:label}}`, true},
		{`select={{name:'label'}}`, false},
		{`unit={{unit:'length/road',sourceUnit:'mile',convertTo:'kilometer'}}`, true},
	} {
		result := intlExpressionContract(t, `export function Page(value:number,label:string,options:{}){return()=> <p intl:`+c.role+`>{value}</p>;}`)
		if (len(result.Descriptors) > 0) != c.valid {
			t.Fatalf("lost option ownership %s: %#v", c.role, result)
		}
	}
}
