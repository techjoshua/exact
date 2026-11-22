package exactcompiler

import (
	"strings"
	"testing"
)

func TestBorrowedComponentInvocation(t *testing.T) {
	const header = `import type {Component} from '@exactjs/core';
type State = {count: number; alternate?: boolean};
type Props = {value: string};

export function Setup(this: Component<State>, props: Props) {
	this.state.count = 1;
	this.onMount(() => { this.state.count++; });
	return () => <label>{props.value}:{this.state.count}</label>;
}

function prepare(this: Component<State>, props: Props, count: number) {
	this.state.count = count;
	this.onMount(() => { this.state.count++; });
	return () => <label>{props.value}:{this.state.count}</label>;
}

const authored = {
	call(_owner: Component<State>, props: Props) { return props.value; },
	apply(_owner: Component<State>, [props]: [Props]) { return props.value; }
};
`
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, packageType := range []string{"application", "library"} {
			for _, example := range []struct {
				name, view string
				rejected bool
			}{
				{"jsx", `return () => <Setup value={props.value}/>;`, false},
				{"helper-call", `return prepare.call(this, props, 1);`, false},
				{"helper-apply", `return prepare.apply(this, [props, 1]);`, false},
				{"authored-methods", `const first = authored.call(this, props); const second = authored.apply(this, [props]); return () => <label>{first}:{second}</label>;`, false},
				{"borrowed-call", `return Setup.call(this, props);`, true},
				{"borrowed-apply", `return Setup.apply(this, [props]);`, true},
			} {
				t.Run(string(target)+"/"+packageType+"/"+example.name, func(t *testing.T) {
					// The functions have the same TypeScript receiver shape but own
					// different state layouts and lifecycle registrations.
					source := header + `
export function Page(this: Component<State>, props: Props) {
	this.state.alternate = true;
	this.onMount(() => { this.state.alternate = false; });
	` + example.view + `
}
`
					response := NewSession().Execute(Request{
						Kind: "compile", ID: "borrowed-component.tsx", Target: target,
						PackageType: packageType, Diagnostics: "semantic", Source: source,
					})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					if !example.rejected {
						if response.Code == "" || hasErrorDiagnostic(response.Diagnostics) {
							t.Fatalf("supported composition failed: %#v", response.Diagnostics)
						}
						return
					}
					if response.Code != "" || !hasDiagnosticCode(response.Diagnostics, "EXACT_BORROWED_COMPONENT") {
						t.Fatalf("expected authored error and no artifact: %#v", response.Diagnostics)
					}
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Code == "EXACT_BORROWED_COMPONENT" &&
							(diagnostic.Severity != "error" || diagnostic.Start != strings.Index(source, "Setup.") ||
								diagnostic.Length != len(strings.TrimSuffix(strings.TrimPrefix(example.view, "return "), ";")) ||
								!strings.Contains(diagnostic.Message, "Use JSX") || !strings.Contains(diagnostic.Message, "setup helper")) {
							t.Fatalf("unexpected borrowed component guidance: %#v", diagnostic)
						}
					}
				})
			}
		}
	}
}
