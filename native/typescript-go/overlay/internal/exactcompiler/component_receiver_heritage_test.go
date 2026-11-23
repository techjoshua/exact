package exactcompiler

import (
	"strings"
	"testing"
)

// Interface inheritance carries declaration identity into canonical return
// normalization. Structural lookalikes and lexical shadows keep ordinary calls.
func TestComponentReceiverHeritageNormalization(t *testing.T) {
	for _, row := range []struct {
		name, setup string
		component   bool
	}{
		{"import-control", `import type {Component} from '@exactjs/core'; type Receiver=Component<{}>;`, true},
		{"direct", `import type {Component} from '@exactjs/core'; interface Receiver extends Component<{}>{}`, true},
		{"renamed", `import type {Component as Instance} from '@exactjs/core'; interface Receiver extends Instance<{}>{}`, true},
		{"alias", `import type {Component} from '@exactjs/core'; type Base=Component<{}>; interface Receiver extends Base{}`, true},
		{"multilevel", `import type {Component} from '@exactjs/core'; interface Base extends Component<{}>{} interface Receiver extends Base{}`, true},
		{"namespace", `import type * as Core from '@exactjs/core'; interface Receiver extends Core.Component<{}>{}`, true},
		{"multiple-bases", `import type {Component} from '@exactjs/core'; interface Other{label:string} interface Receiver extends Other, Component<{}>{}`, true},
		{"custom", `interface Component<S>{state:S} interface Receiver extends Component<{}>{}`, false},
		{"structural", `interface Base{state:{}} interface Receiver extends Base{}`, false},
		{"shadow", `import type {Component} from '@exactjs/core'; export namespace Local {interface Component<S>{state:S} interface Receiver extends Component<{}>{}`, false},
		{"generic-shadow", `import type {Component} from '@exactjs/core';`, false},
		{"cycle", `interface A extends B{} interface B extends A{} type Receiver=A;`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			generic, receiver := "", "Receiver"
			if row.name == "generic-shadow" {
				generic, receiver = "<Component>", "Component"
			}
			source := row.setup + ` export function Probe` + generic + `(this:` + receiver + `){return 'value';}`
			if row.name == "shadow" {
				source += "}"
			}
			normalized, err := normalizeAuthoredSource(normalizationTestFile(t, "heritage.ts"), source)
			if err != nil {
				t.Fatal(err)
			}
			check := `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};const helpers=new Proxy({attachCompiledComponentContract:f=>f},{get:(o,k)=>o[k]??(()=>{})});vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,require:()=>helpers});const result=out.Probe.call({});`
			if row.name == "shadow" {
				check = strings.Replace(check, "out.Probe.call", "out.Local.Probe.call", 1)
			}
			if row.component {
				check += `assert.equal(typeof result,'function');assert.equal(result(),'value');`
			} else {
				check += `assert.equal(result,'value');`
			}
			sourceNodeScript(t, normalized.text, check)
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "heritage.ts", Source: source})
				if response.Error != "" || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				found := false
				for _, component := range response.Analysis.Components {
					found = found || component.Name == "Probe"
				}
				if found != row.component {
					t.Fatalf("%s component=%v want %v", target, found, row.component)
				}
				if !row.component {
					sourceNodeScript(t, response.Code, check)
				}
			}
		})
	}
}
