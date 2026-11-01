package exactcompiler

import "testing"

// Primitive value aliases cannot change the environments of selected standard methods.
func TestPrimitiveAliasReceiverPlacement(t *testing.T) {
	for _, test := range []struct{ view, call string }{
		{`'temporal-date'|'temporal-time'`, `startsWith('temporal-')`},
		{`1|2`, `toFixed(1)`},
		{`1n|2n`, `toString()`},
		{`true|false`, `toString()`},
		{`symbol`, `toString()`},
		{`string|String`, `startsWith('temporal-')`},
		{`number|Number`, `toFixed(1)`},
		{`boolean|Boolean`, `valueOf()`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `type Record={readonly value:` + test.view + `};type View=Record['value'];function read(value:View){return value.` + test.call + `;}export function Page(props:{value:View}){return()=> <p>{String(read(props.value))}</p>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "primitive-alias.tsx", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("%s.%s target=%s lost primitive placement: %s %#v %#v", test.view, test.call, target, response.Error, response.Diagnostics, response.Analysis.Components)
			}
		}
	}
}

// A native-looking method on an application union retains its own effect authority.
func TestPrimitiveAliasReceiverAuthorityControls(t *testing.T) {
	for _, source := range []string{
		`type View={startsWith(value:string):boolean}|{startsWith(value:string):boolean};export function Page(props:{value:View}){const selected=props.value.startsWith('x');return()=> <p>{String(selected)}</p>;}`,
		`declare global{interface String{custom():boolean;}}export function Page(props:{value:'x'|'y'}){const selected=props.value.custom();return()=> <p>{String(selected)}</p>;}`,
		`type View=string|{startsWith(value:string):boolean};export function Page(props:{value:View}){const selected=props.value.startsWith('x');return()=> <p>{String(selected)}</p>;}`,
	} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "primitive-authority.tsx", Target: TargetServer, Source: `export {};` + source})
		if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("application method acquired primitive authority: %s %#v %#v", response.Error, response.Diagnostics, response.Analysis.Components)
		}
	}
}
