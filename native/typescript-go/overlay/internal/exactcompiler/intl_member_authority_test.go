package exactcompiler

import (
	"strings"
	"testing"
)

// An unrelated Intl augmentation cannot remove a standard method's placement,
// and its own opaque method cannot borrow the namespace's execution authority.
func TestIntlSelectedMemberAuthority(t *testing.T) {
	for _, formatter := range []struct{ name, call string }{
		{"NumberFormat", "format(1)"},
		{"DateTimeFormat", "format(0)"},
		{"PluralRules", "select(1)"},
		{"RelativeTimeFormat", "format(1,'day')"},
		{"DisplayNames", "of('US')"},
		{"ListFormat", "format(['one'])"},
		{"Collator", "compare('a','b')"},
	} {
		for _, augmented := range []bool{false, true} {
			prefix := ""
			if augmented {
				prefix = `export {};declare global{namespace Intl{interface ` + formatter.name + `{custom():number;}}}`
			}
			for _, call := range []string{formatter.call, "custom()"} {
				if call == "custom()" && !augmented {
					continue
				}
				placement := "isomorphic"
				if call == "custom()" {
					placement = "unknown"
				}
				for _, target := range []Target{TargetClient, TargetServer} {
					source := prefix + `import{peek}from'@exactjs/core';export function Page(props:{value:Intl.` + formatter.name + `}){const selected=peek(()=>props.value.` + call + `);return()=> <p>{String(selected)}</p>;}`
					r := NewSession().Execute(Request{Kind: "compile", ID: "intl-member-authority.tsx", Source: source, Target: target})
					if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != placement {
						t.Fatalf("%s.%s augmented=%v target=%s: %#v %#v", formatter.name, call, augmented, target, r.Analysis.Components, r.Diagnostics)
					}
					if placement == "isomorphic" && !strings.Contains(r.Code, "."+strings.Split(call, "(")[0]+"(") {
						t.Fatalf("selected standard method was lost during lowering: %s", r.Code)
					}
				}
			}
		}
	}
}

// Namespaced lookalikes remain opaque. A read-only mapped view of the real
// receiver keeps its selected method contract after an unrelated augmentation.
func TestIntlMemberAliasesAndLookalikes(t *testing.T) {
	for _, fixture := range []struct{ prefix, view, placement string }{
		{`export {};declare global{namespace Intl{interface NumberFormat{custom():number;}}}type View=Intl.NumberFormat;`, "View", "isomorphic"},
		{`export {};declare global{namespace Intl{interface NumberFormat{custom():number;}}}type View=Readonly<Intl.NumberFormat>;`, "View", "isomorphic"},
		{`declare namespace Shadow{namespace Intl{interface NumberFormat{format(value:number):string;}}}`, "Shadow.Intl.NumberFormat", "unknown"},
		{`declare namespace Intl{interface Formatter{format(value:number):string;}}`, "Intl.Formatter", "unknown"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := fixture.prefix + `import{peek}from'@exactjs/core';export function Page(props:{value:` + fixture.view + `}){const selected=peek(()=>props.value.format(1));return()=> <p>{selected}</p>;}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "intl-member-alias.tsx", Source: source, Target: target})
			if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != fixture.placement {
				t.Fatalf("%s target=%s acquired incorrect authority: %#v %#v", fixture.view, target, r.Analysis.Components, r.Diagnostics)
			}
			if fixture.placement == "isomorphic" && !strings.Contains(r.Code, ".format(") {
				t.Fatalf("mapped formatter method was lost during lowering: %s", r.Code)
			}
		}
	}
}
