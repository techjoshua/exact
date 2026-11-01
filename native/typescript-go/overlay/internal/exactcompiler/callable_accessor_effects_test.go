package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

func TestAccessorEffectOwnership(t *testing.T) {
	cases := []struct{ name, body, placement string }{
		{"aliased class constructor", `class Holder{get value(){return window.location.href;}}const First=Holder;const Second=First;const holder:{value:string}=new Second();const value=holder.value;`, "client"},
		{"constructor carrier", `class Holder{get value(){return window.location.href;}}function create(Ctor:{new():{value:string}}):{value:string}{return new Ctor();}const holder=create(Holder);const value=holder.value;`, "client"},

		{"prototype getter result is not serialized", `class Holder{get nested(){return {get value(){return window.location.href;}};}}const value=JSON.stringify(new Holder());`, "isomorphic"},
		{"owned class field getter is serialized", `class Holder{nested={get value(){return window.location.href;}};}const value=JSON.stringify(new Holder());`, "client"},
		{"static and instance accessor ownership", `class Holder{static get value(){return 'safe';}get value(){return window.location.href;}}const value=Holder.value;`, "isomorphic"},

		{"overridden inherited getter", `class Base{get value(){return window.location.href;}}class Holder extends Base{get value(){return 'safe';}}const holder:{value:string}=new Holder();const value=holder.value;`, "isomorphic"},
		{"prototype getter is not spread", `class Holder{get value(){return window.location.href;}}const holder:{value:string}=new Holder();const value={...holder};`, "isomorphic"},
		{"prototype getter is not enumerated", `class Holder{get value(){return window.location.href;}}const holder:{value:string}=new Holder();const value=Object.values(holder);`, "isomorphic"},
		{"prototype getter is not serialized", `class Holder{get value(){return window.location.href;}}const holder:{value:string}=new Holder();const value=JSON.stringify(holder);`, "isomorphic"},
		{"prototype getter is destructured", `class Holder{get value(){return window.location.href;}}const holder:{value:string}=new Holder();const {value}=holder;`, "client"},

		{"parameter read", `function make():{value:string}{return {get value(){return window.location.href;}};}function read(holder:{value:string}){return holder.value;}const value=read(make());`, "client"},
		{"parameter remains unread", `function make():{value:string}{return {get value(){return window.location.href;}};}function read(holder:{value:string}){return 'safe';}const value=read(make());`, "isomorphic"},
		{"forwarded parameter read", `function make():{value:string}{return {get value(){return window.location.href;}};}function read(holder:{value:string}){return holder.value;}function forward(holder:{value:string}){return read(holder);}const value=forward(make());`, "client"},
		{"parameter implicit read", `function make():{value:string}{return {get value(){return window.location.href;}};}function read(holder:{value:string}){return {...holder};}const value=read(make());`, "client"},

		{"getter returned projection", `function make():{nested:{value:string}}{return {get nested(){return {get value(){return window.location.href;}};}};}const value=make().nested.value;`, "client"},
		{"shorthand projection", `function make():{nested:{value:string}}{const nested={get value(){return window.location.href;}};return {nested};}const value=make().nested.value;`, "client"},
		{"spread projection", `function make():{nested:{value:string}}{const nested={get value(){return window.location.href;}};return {...{nested}};}const value=make().nested.value;`, "client"},
		{"logical return", `function make(flag:boolean):{value:string}{return flag&&{get value(){return window.location.href;}}||{value:'safe'};}const value=make(true).value;`, "client"},
		{"nested JSON getter", `function make():{nested:{value:string}}{return {nested:{get value(){return window.location.href;}}};}const value=JSON.stringify(make());`, "client"},

		{"delete does not read", `const holder={get value(){return window.location.href;}};delete holder.value;`, "isomorphic"},
		{"wrapped setter write", `const holder:{value:string}={set value(value:string){window.document.title=value;}};(holder.value as string)='title';`, "client"},
		{"frozen accessor", `const holder:{value:string}=Object.freeze({get value(){return window.location.href;}});const value=holder.value;`, "client"},
		{"Object entries", `const holder={get value(){return window.location.href;}};const values=Object.entries(holder);`, "client"},
		{"JSON getter", `const holder={get value(){return window.location.href;}};const json=JSON.stringify(holder);`, "client"},

		{"conditional return", `function make(flag:boolean):{value:string}{return flag?{get value(){return window.location.href;}}:{value:'safe'};}const holder=make(true);const value=holder.value;`, "client"},
		{"nested projection", `function make():{nested:{value:string}}{return {nested:{get value(){return window.location.href;}}};}const holder=make();const value=holder.nested.value;`, "client"},
		{"reassigned binding", `let holder:{value:string}={value:'safe'};holder={get value(){return window.location.href;}};const value=holder.value;`, "client"},
		{"inherited accessor", `class Base{get value(){return window.location.href;}}class Holder extends Base{}const holder:{value:string}=new Holder();const value=holder.value;`, "client"},
		{"unread destructured sibling", `const holder={safe:'safe',get value(){return window.location.href;}};const {safe}=holder;`, "isomorphic"},
		{"nested destructure", `function make():{nested:{value:string}}{return {nested:{get value(){return window.location.href;}}};}const {nested:{value}}=make();`, "client"},

		{"object spread", `const holder={get value(){return window.location.href;}};const copy={...holder};`, "client"},
		{"destructure", `const holder={get value(){return window.location.href;}};const {value}=holder;`, "client"},
		{"Object values", `const holder={get value(){return window.location.href;}};const values=Object.values(holder);`, "client"},
		{"Object keys", `const holder={get value(){return window.location.href;}};const keys=Object.keys(holder);`, "isomorphic"},
		{"Object assign", `const holder={get value(){return window.location.href;}};const copy=Object.assign({},holder);`, "client"},
		{"typed factory", `function make():{value:string}{return {get value(){return window.location.href;}};}const holder=make();const value=holder.value;`, "client"},
		{"dynamic key", `const holder={get value(){return window.location.href;}};const key:string="value";const value=holder[key];`, "client"},
		{"identity carrier", `function identity(value:{value:string}):{value:string}{return value;}const holder=identity({get value(){return window.location.href;}});const value=holder.value;`, "client"},
		{"unread getter", `function make(){return {get value(){return window.location.href;}};}const holder=make();`, "isomorphic"},
		{"unread setter", `function make(){return {set value(value:string){window.document.title=value;}};}const holder=make();`, "isomorphic"},
		{"read getter", `const holder={get value(){return window.location.href;}};const value=holder.value;`, "client"},
		{"literal indexed getter", `const holder={get value(){return window.location.href;}};const value=holder['value'];`, "client"},
		{"annotated getter", `const holder:{readonly value:string}={get value(){return window.location.href;}};const value=holder.value;`, "client"},
		{"write setter", `const holder={set value(value:string){window.document.title=value;}};holder.value='title';`, "client"},
		{"write without reading", `const holder={get value(){return window.location.href;},set value(value:string){}};holder.value='title';`, "isomorphic"},
		{"read without writing", `const holder={get value(){return 1;},set value(value:number){window.document.title=String(value);}};const value=holder.value;`, "isomorphic"},
		{"compound", `const holder={get value(){return 1;},set value(value:number){window.document.title=String(value);}};holder.value+=1;`, "client"},
		{"prefix", `const holder={get value(){return 1;},set value(value:number){window.document.title=String(value);}};++holder.value;`, "client"},
		{"postfix", `const holder={get value(){return 1;},set value(value:number){window.document.title=String(value);}};holder.value++;`, "client"},
		{"unary read", `const holder={get value(){return Number(window.location.port);}};const value=-holder.value;`, "client"},
		{"computed getter name", `const holder={get [window.location.href](){return 'value';}};`, "client"},
		{"computed method name", `const holder={[window.location.href](){return 'value';}};`, "client"},
	}
	for _, scenario := range cases {
		t.Run(scenario.name, func(t *testing.T) {
			source := `export function Page(){` + scenario.body + `return()=> <p>ready</p>;}`
			response := NewSession().Execute(Request{ID: "accessor-effects.tsx", Kind: "analyze", Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != scenario.placement {
				t.Fatalf("want %s: %#v", scenario.placement, response.Analysis.Components)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "accessor-effects.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
}

func TestAccessorProvenanceLimits(t *testing.T) {
	for _, mode := range []string{"depth", "shared paths"} {
		t.Run(mode, func(t *testing.T) {
			var body strings.Builder
			body.WriteString(`const v0:{value:string}={get value(){return window.location.href;}};`)
			count := 140
			if mode == "shared paths" {
				// Advisory cost cannot erase the browser getter shared by both arms.
				count = 14
			}
			for index := 1; index <= count; index++ {
				if mode == "depth" {
					fmt.Fprintf(&body, "const v%d:{value:string}=v%d;", index, index-1)
				} else {
					fmt.Fprintf(&body, "const v%d:{value:string}=Boolean(Date.now())?v%d:v%d;", index, index-1, index-1)
				}
			}
			fmt.Fprintf(&body, "const value=v%d.value;", count)
			source := `export function Page(){` + body.String() + `return()=> <p>ready</p>;}`
			response := NewSession().Execute(Request{ID: "bounded-accessors.tsx", Kind: "analyze", Source: source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect == "neutral" {
				t.Fatalf("bounded provenance lost execution requirements: %#v", response)
			}
			found := false
			for _, callable := range response.Analysis.Callables {
				for _, effect := range callable.DirectEffectSources {
					if effect.Opaque && strings.Contains(effect.Description, "accessor provenance") {
						found = true
					}
				}
			}
			if mode == "shared paths" {
				if response.Analysis.Components[0].EnvironmentEffect != "browser" || response.Analysis.Components[0].Placement != "client" {
					t.Fatalf("shared source paths lost their browser getter: %#v", response.Analysis.Components)
				}
			} else if !found {
				t.Fatal("expected bounded opaque accessor proof")
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "bounded-accessors.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
}
