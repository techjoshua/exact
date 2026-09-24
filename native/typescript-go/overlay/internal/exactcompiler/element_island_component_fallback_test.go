package exactcompiler

import (
	"strings"
	"testing"
)

func TestNativeComponentIslandRetainsServerFallbackAndLocalCallbacks(t *testing.T) {
	response := NewSession().Execute(Request{ID: "component-island-fallback.tsx", Kind: "compile", Target: TargetServer, ServerComponents: true,
		Source: `function Row(props: {id: string; onEnter: () => void}) { return () => <button onMouseEnter={props.onEnter}>{props.id}</button>; }
export function Report(props: {rows: {id: string}[]; enter: () => void}) {
 return () => <section>{props.rows.map(row => <Row key={row.id} {...row} onEnter={props.enter} />)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "__exactHydrationFallback: __exactComponentReceipt(Row") || !strings.Contains(response.Code, "onEnter: props.enter") {
		t.Fatalf("native island lost its SSR component or local callback inputs:\n%s", response.Code)
	}
}
