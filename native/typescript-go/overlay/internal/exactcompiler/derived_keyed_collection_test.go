package exactcompiler

import (
	"strings"
	"testing"
)

func TestDerivedKeyedProjectionWithoutCollectionProvenance(t *testing.T) {
	response := NewSession().Execute(Request{ID: "derived-keyed.tsx", Kind: "compile", Target: TargetClient,
		Source: `
/** @exact pure */
function project(items: {id: string; label: string}[]) { return items.map(item => ({...item})); }
function Row(props: {id: string; label: string}) { return () => <span>{props.label}</span>; }
export function Report(props: {items: {id: string; label: string}[]}) {
 const rows = project(props.items);
 return () => <section><p>{rows.length}</p>{rows.map(row => <Row key={row.id} {...row} />)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "undefined, \"member:id\"") {
		t.Fatalf("missing optional provenance argument before key identity:\n%s", response.Code)
	}
}
