package exactcompiler

import "testing"

// Native lexical disposal must not acquire a second automatic generation owner.
func TestTaskNativeLexicalDisposal(t *testing.T) {
	for _, declaration := range []string{"using resource=new Resource();", "await using resource=new Resource();"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "lexical-disposal.tsx", Target: TargetClient, Source: `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';class Resource {[Symbol.dispose](){}async [Symbol.asyncDispose](){}}
export function Page(){async function run(task:TaskContext=TaskContext.client()){` + declaration + `void resource;}run();return()=> <output/>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || len(r.Analysis.Tasks) != 1 || r.Code == "" {
			t.Fatalf("native disposal rejected: %s %#v", r.Error, r.Diagnostics)
		}
		if len(r.Analysis.Tasks[0].Resources) != 0 {
			t.Fatalf("native lexical resource also generation-owned: %#v", r.Analysis.Tasks[0].Resources)
		}
	}
}
