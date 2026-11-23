package exactcompiler

import "testing"

// Component placement must account for the descriptor trap even when the
// boolean result is discarded and only the trap's local write reaches render.
func TestHasOwnLocalProxyPlacement(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, tc := range []struct {
		name, target, body, methodPrefix, returnType, call string
		client                                             bool
	}{
		{"immutable object", "{x:1}", "box.value = document.title.length;", "", "PropertyDescriptor | undefined", "Object.hasOwn(input, 'x');", true},
		{"immutable array", "[1]", "box.value = document.title.length;", "", "PropertyDescriptor | undefined", "Object.hasOwn(input, 'x');", true},
		{"dormant replacement", "{x:1}", "this.getOwnPropertyDescriptor = () => {box.value = document.title.length; return undefined};", "", "PropertyDescriptor | undefined", "Object.hasOwn(input, 'x');", false},
		{"generator body stays dormant", "{x:1}", "box.value = document.title.length;", "*", "any", "try { Object.hasOwn(input, 'x'); } catch {}", false},
		{"unreachable call", "{x:1}", "box.value = document.title.length;", "", "PropertyDescriptor | undefined", "if (false) Object.hasOwn(input, 'x');", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';
export function Page(this: Component<{}>) {
 const box = {value: 0};
 const input = new Proxy(` + tc.target + `, {
   ` + tc.methodPrefix + `getOwnPropertyDescriptor(target, key): ` + tc.returnType + ` {
     ` + tc.body + `
     return Reflect.getOwnPropertyDescriptor(target, key);
   }
 });
 ` + tc.call + `
 const hit = box.value;
 return () => <output>{String(hit)}</output>;
}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "has-own.tsx", ConfigFile: config, Source: source, Target: TargetServer, Diagnostics: "semantic", ServerComponents: true})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 || (response.Analysis.Components[0].Placement == "client") != tc.client {
				t.Fatalf("unexpected placement: %s %#v %#v", response.Error, response.Diagnostics, response.Analysis.Components)
			}
		})
	}
}
