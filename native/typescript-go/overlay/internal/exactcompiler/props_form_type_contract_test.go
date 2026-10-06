package exactcompiler

import (
	"strings"
	"testing"
)

// Typed string options must retain literal unions across scalar and collection control projections.
func TestStringUnionFormOptionTypes(t *testing.T) {
	for _, control := range []struct{ name, state, element string }{
		{"group", "Choice[]", `<input type="checkbox" value={choice} checked:onChange={this.state.selected}/>`},
		{"radio", "Choice", `<input type="radio" value={choice} checked:onChange={this.state.selected}/>`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(control.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';type Choice='a'|'b';export function Page(this:Component<{selected:` + control.state + `}>,props:{choices:Choice[]}){return()=> <main>{props.choices.map(choice=>` + control.element + `)}</main>;}`
				response := NewSession().Execute(Request{ID: "union-option.tsx", Kind: "compile", Target: target, Source: source})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("valid option rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if strings.Contains(response.Code, "String(choice)") {
					t.Fatalf("finite string type widened:\n%s", response.Code)
				}
				if control.name == "group" && !strings.Contains(response.Code, ".includes(choice)") {
					t.Fatalf("missing typed membership projection:\n%s", response.Code)
				}
			})
		}
	}
}
