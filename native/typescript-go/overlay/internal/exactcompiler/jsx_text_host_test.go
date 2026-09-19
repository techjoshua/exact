package exactcompiler

import (
	"strings"
	"testing"
)

func TestTextHostCapabilityFollowsAuthoredHost(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, tag := range []string{"title", "textarea", "div"} {
			response := NewSession().Execute(Request{ID: "text-host.tsx", Kind: "compile", Target: target,
				Source: `function Child() { return () => "text"; }
				export function Host() { return () => <` + tag + `><Child /></` + tag + `>; }`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			selected := target == TargetClient && tag != "div"
			if strings.Contains(response.Code, "@exactjs/dom/runtime/text-host") != selected {
				t.Fatalf("unexpected text capability for %s/%s: %s", target, tag, response.Code)
			}
		}
	}
}
