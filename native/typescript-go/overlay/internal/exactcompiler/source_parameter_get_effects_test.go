package exactcompiler

import "testing"

// Actual own-data arguments must preserve local/direct Get behavior. An authored
// accessor or proxy remains a separate nonportable alternative. No type-only or
// synthetic normal-slot authority can discharge either read.
func TestParameterActualOwnDataInputs(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, reader, input string
		portable            bool
	}{
		{"local-data", `const rows=input.rows;return rows`, `{rows:[{id:'a',label:'A'}]}`, true},
		{"direct-data", `return input.rows`, `{rows:[{id:'a',label:'A'}]}`, true},
		{"local-getter", `const rows=input.rows;return rows`, `{get rows(){document.title;return [{id:'a',label:'A'}]}}`, false},
		{"local-proxy", `const rows=input.rows;return rows`, `new Proxy({rows:[{id:'a',label:'A'}]},{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}})`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';interface Row{id:string;label:string}function readRows(input:{rows:Row[]}){` + c.reader + `}export function Lists(this:Component<{}>){const rows=readRows(` + c.input + `);return()=> <ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>}`
			response := collectionCompileSource(t, root, config, source, TargetClient)
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if len(diagnostic.Code) >= 2 && diagnostic.Code[:2] == "TS" {
					t.Fatalf("invalid ordinary source: %#v", response.Diagnostics)
				}
			}
			if len(response.Analysis.Components) != 1 {
				t.Fatal("component missing")
			}
			if (response.Analysis.Components[0].Placement == "isomorphic") != c.portable {
				t.Fatalf("supplied input contract mismatch: %#v\ncallables:%#v", response.Analysis.Components, response.Analysis.Callables)
			}
		})
	}
}
