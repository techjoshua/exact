package exactcompiler

import (
	"strings"
	"testing"
)

// Native source witnesses select both the closed class concatenation and the
// supported object-normalization routes. Observable equivalence lives in the
// paired SSR/client/hydration regression tests.
func TestServerClassValueProofBoundaries(t *testing.T) {
	for _, c := range []struct{ name, setup, value string }{
		{"empty-array", "", `[]`},
		{"empty-head", "", `['',{active:props.active}]`},
		{"dynamic-head", "", `[props.label,{active:props.active}]`},
		{"empty-tail", "", `['base','',{active:props.active}]`},
		{"literal-tail", "", `['base','tail']`},
		{"boolean", "", `['base',{active:props.active}]`},
		{"computed-key", "", `['base',{['active']:props.active}]`},
		{"empty-key", "", `['base',{'':props.active}]`},
		{"shorthand", `const active=props.active;`, `['base',{active}]`},
		{"method", "", `['base',{active(){return true}}]`},
		{"getter", "", `['base',{get active(){return props.active}}]`},
		{"object-spread", "", `['base',{...{active:props.active}}]`},
		{"array-spread", "", `['base',...['tail']]`},
		{"nested-array", "", `['base',['tail']]`},
		{"truthy-number", "", `['base',{active:props.active?1:0}]`},
		{"overwritten-key", "", `['base',{active:props.active,active:!props.active}]`},
		{"canonical-index", "", `['base',{'2':props.active,'1':props.active}]`},
		{"zero-index", "", `['base',{'0':props.active}]`},
		{"last-index", "", `['base',{'4294967294':props.active}]`},
		{"not-index", "", `['base',{'4294967295':props.active}]`},
		{"noncanonical-index", "", `['base',{'01':props.active}]`},
		{"prototype-setter", "", `['base',{'__proto__':props.active}]`},
		{"prototype-computed", "", `['base',{['__proto__']:props.active}]`},
		{"comparison", "", `['base',{active:props.label==='active'}]`},
		{"negation", "", `['base',{active:!props.active}]`},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "ssr-class-proof.tsx", Target: TargetServer, Source: `export function Page(props:{active:boolean;label:string;extra?:{title?:string}}){` + c.setup + `return()=> <main><span {...props.extra} className={` + c.value + `}>Class</span></main>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 {
				t.Fatalf("supported class value rejected: %s %#v", r.Error, r.Diagnostics)
			}
			if !strings.Contains(r.Code, "__exactPreparedServerRenderProgram") {
				t.Fatal("class witness lost its compiler-owned SSR writer")
			}
		})
	}
}
