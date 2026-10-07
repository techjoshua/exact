package exactcompiler

import "testing"

func TestPartitionCallbackConstructionDoesNotExecuteStoredWork(t *testing.T) {
	for _, c := range []struct {
		name, initializer string
		invalid           bool
	}{
		{"stored arrow", `({flag:props.flag,run:()=>this.state.count++})`, false},
		{"stored method", `({flag:props.flag,run(){this.state.count++}})`, false},
		{"stored async", `({flag:props.flag,run:async()=>{await Promise.resolve();this.state.count++}})`, false},
		{"invoked mapper", `[props.flag].map(()=>this.state.count++)`, true},
		{"computed key mutation", `({[String(external++)]:()=>props.flag})`, true},
		{"eager property mutation", `({flag:props.flag,count:external++})`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/callback.tsx", Target: TargetClient, Source: `import {type Component} from '@exactjs/core';let external=0;export function Probe(this:Component<{count:number}>,props:{flag:boolean}){this.state.count=0;const value=` + c.initializer + `;return()=> <output>{String(value)}</output>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			found := false
			for _, d := range response.Diagnostics {
				if d.Code == "EXACT2202" {
					found = true
				}
			}
			if found != c.invalid {
				t.Fatalf("callback construction validation=%v, want %v: %#v", found, c.invalid, response.Diagnostics)
			}
		})
	}
}
