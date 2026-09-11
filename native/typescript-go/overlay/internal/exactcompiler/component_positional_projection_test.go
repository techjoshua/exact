package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionEmitsStructuralAncestryProjectorContract(t *testing.T) {
	response := NewSession().Execute(Request{ID: "projection.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Rows(props: { rows: { id: string; name: string; count: number; ready: boolean }[] }) { return () => <main>{props.rows.map(row => <p key={row.id}>{row.name}: {row.count}</p>)}</main>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "registerPositionalProjector") || !strings.Contains(response.Code, "], 1, (value, depth, state, schema, Object, Array)") {
		t.Fatalf("compiler lost the structural ancestry projector contract: %s", response.Code)
	}
}
