package exactcompiler

import "testing"

func TestParameterDefaultNullGetSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, argument := range []string{"", "undefined", "5"} {
			t.Run(string(target)+"/"+argument, func(t *testing.T) {
				const id = "/virtual/parameter-default-null-get.ts"
				session := NewSession()
				r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=(null as any).value)=>x;read(` + argument + `);`, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
					t.Fatal("unchanged source qualification", r.Error, r.Diagnostics)
				}
				h := bindingCloseHistory(session, id)
				if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 || h.receipt.alternatives[0].callHistory == nil {
					t.Fatal("actual parameter default Get Call absent")
				}
				row := h.receipt.alternatives[0]
				call := row.callHistory
				entry := call.entry
				raw := call.raw.alternatives[0]
				snapshot := raw.storage
				recipe := entry.proof.entry
				if snapshot == nil || len(snapshot.cells) != 1 || !entry.inputs.complete || row.branch.env != entry.caller || raw.branch.env != entry.activation.env || row.branch.state != raw.branch.state || row.branch.cursor != raw.branch.cursor+1 {
					t.Fatal("actual Call snapshot/checked exit")
				}
				get := -1
				selectPC := -1
				for pc, e := range recipe.events {
					if e.kind == "GetValue" {
						get = pc
					}
					if e.kind == "SelectDefault" {
						selectPC = pc
					}
				}
				if get < 0 || selectPC < 0 {
					t.Fatal("original initializer Get recipe absent")
				}
				choice, _, ok := defaultChoiceLayout(recipe, selectPC)
				if !ok {
					t.Fatal("original default layout")
				}
				observations := 0
				for _, observation := range raw.objects {
					if observation.recipe == recipe && observation.pc == get {
						observations++
						if observation.reference != snapshot.references[recipe.events[get].a].id || observation.receipt == nil || len(observation.receipt.alternatives) != 1 || observation.receipt.alternatives[0].completion != languageThrow || observation.receipt.alternatives[0].value != raw.value {
							t.Fatal("actual completed Get tuple")
						}
					}
				}
				if argument != "5" {
					if row.completion != languageThrow || raw.completion != languageThrow || row.value != (languageValue{text: "TypeError"}) || raw.value != row.value || call.converted || row.returnBoundary != (languageID{}) || len(entry.inputs.arguments) != map[string]int{"": 0, "undefined": 1}[argument] || snapshot.pc != get || observations != 1 || len(snapshot.choices) != 1 || snapshot.choices[0] != (storageChoice{destination: choice.out, merge: choice.merge, end: choice.end}) {
						t.Fatal("actual default Get Throw incomplete", row.remaining)
					}
					for pc := get; pc < len(snapshot.ready); pc++ {
						if snapshot.ready[pc] {
							t.Fatal("abrupt initializer issued later value", pc)
						}
					}
					for state := raw.branch.state; state != nil && state != entry.activation.state; state = state.previous {
						if state.storage != nil && state.storage.cell == snapshot.cells[0] && state.storage.initialized {
							t.Fatal("abrupt formal initialized")
						}
					}
				} else {
					n, known := numericNumberPayload(row.value)
					if row.completion != languageNormal || raw.completion != languageReturn || !known || int(n) != 5 || len(entry.inputs.arguments) != 1 || observations != 0 || len(snapshot.choices) != 0 {
						t.Fatal("supplied bypass result")
					}
					for pc := choice.entry; pc <= choice.merge; pc++ {
						if snapshot.ready[pc] {
							t.Fatal("bypass executed initializer", pc)
						}
					}
				}
				script := `const fs=require('node:fs'),vm=require('node:vm');let result;try{result={kind:'Normal',value:vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})}}catch(e){result={kind:'Throw',name:e.name}}const expected=process.argv[2]==='throw'?{kind:'Throw',name:'TypeError'}:{kind:'Normal',value:5};if(JSON.stringify(result)!==JSON.stringify(expected))throw Error(JSON.stringify(result));`
				want := "normal"
				if argument != "5" {
					want = "throw"
				}
				sourceNodeScript(t, r.Code, script, want)

			})
		}
	}
}
