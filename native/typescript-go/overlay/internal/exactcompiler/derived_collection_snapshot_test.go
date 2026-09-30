package exactcompiler

import "testing"

func TestDerivedCollectionSnapshotsRequireFreshNativeIterators(t *testing.T) {
	cases := []struct {
		declaration, expression string
		safe                    bool
	}{
		{`rows: Map<string, string>`, `Array.from(props.rows.values())`, true},
		{`rows: ReadonlyMap<string, string>`, `Array.from(props.rows.entries()).map(([key, value]) => key + value)`, true},
		{`rows: Set<string>`, `Array.from(props.rows.keys(), value => value.trim())`, true},
		{`rows: ReadonlySet<string>`, `Array.from(props.rows.values())`, true},
		{`rows: IterableIterator<string>`, `Array.from(props.rows)`, false},
		{`rows: {values(): IterableIterator<string>}`, `Array.from(props.rows.values())`, false},
		{`rows: Map<string, string>`, `Array.from(props.rows.values(), value => { shared.push(value); return value; })`, false},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{ID: "snapshot.tsx", Kind: "compile", Target: target, Source: `
const shared: string[] = [];
export function Probe(props: {` + test.declaration + `}) {
 const rows = ` + test.expression + `;
 return () => <ul>{rows.map(row => <li>{row}</li>)}</ul>;
}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT2202" {
					rejected = true
				}
			}
			if rejected == test.safe {
				t.Fatalf("%s (%s), expected safe=%v: %#v", test.expression, test.declaration, test.safe, response.Diagnostics)
			}
		}
	}
}
