package exactcompiler

import "testing"

// Receiver authority follows the imported framework declaration, never a type's
// display spelling or a structurally similar application interface.
func TestComponentReceiverIdentity(t *testing.T) {
	for _, row := range []struct {
		name, setup, receiver string
		component             bool
	}{
		{"substring", `interface ComponentInputInvarianceProps{label:string}`, "ComponentInputInvarianceProps", false},
		{"custom-name", `interface Component{label:string}`, "Component", false},
		{"custom-alias", `interface ComponentInputInvarianceProps{label:string}type ReadReceiver=ComponentInputInvarianceProps;`, "ReadReceiver", false},
		{"structural", "", "{label:string}", false},
		{"structural-protocol", "", "{map():string}", false},
		{"parenthesized", `import type{Component as Instance}from'@exactjs/core';`, "(Instance<{}>)", true},
		{"core", `import type{Component}from'@exactjs/core';`, "Component<{}>", true},
		{"renamed", `import type{Component as Instance}from'@exactjs/core';`, "Instance<{}>", true},
		{"alias", `import type{Component}from'@exactjs/core';type Instance=Component<{}>;`, "Instance", true},
		{"generic-alias", `import type{Component}from'@exactjs/core';type Instance<S extends object>=Component<S>;`, "Instance<{}>", true},
		{"namespace", `import type*as Core from'@exactjs/core';`, "Core.Component<{}>", true},
		{"shadow", `import type{Component}from'@exactjs/core';`, "Component", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			generic := ""
			if row.name == "shadow" {
				generic = "<Component>"
			}
			body := "return 'value';"
			if row.name == "structural-protocol" {
				body = "return this.map();"
			}
			source := row.setup + `export function probe` + generic + `(this:` + row.receiver + `){` + body + `}`
			for _, kind := range []string{"analyze", "compile"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					response := NewSession().Execute(Request{Kind: kind, Target: target, ID: "receiver-identity.tsx", Source: source})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					found := false
					for _, component := range response.Analysis.Components {
						found = found || component.Name == "probe"
					}
					if found != row.component {
						t.Fatalf("%s/%s component=%v want %v", kind, target, found, row.component)
					}
					if !row.component && kind == "compile" {
						sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.equal(out.probe.call({label:'original',map(){return 'value'}}),'value');`)
					}
				}
			}
		})
	}
}
