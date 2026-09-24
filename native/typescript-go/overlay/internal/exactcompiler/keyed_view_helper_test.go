package exactcompiler

import (
	"strings"
	"testing"
)

func TestKeyedViewHelperDoesNotInventComponentReceiver(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "keyed-view.tsx", Kind: "compile", Target: target,
				Source: `function Row(props: {id: string}) { return () => <span>{props.id}</span>; }
export function view(items: {id: string}[]) { return <section>{items.map(item => <Row key={item.id} {...item} />)}</section>; }`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "this.map(") {
				t.Fatalf("view helper has no component receiver:\n%s", response.Code)
			}
			if !strings.Contains(response.Code, "item.id") {
				t.Fatalf("lost keyed identity:\n%s", response.Code)
			}
		})
	}
}
