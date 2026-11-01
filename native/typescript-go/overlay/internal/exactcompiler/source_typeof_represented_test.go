package exactcompiler

import (
	"encoding/json"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"path/filepath"
	"testing"
)

func TestTypeofRepresentedSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, tc := range []struct{ arg, want string }{
			{"3", "number"}, {"0", "number"}, {"-0", "number"}, {"0/0", "number"}, {"1/0", "number"},
			{"true", "boolean"}, {"false", "boolean"}, {`"hello"`, "string"}, {`""`, "string"},
			{"null", "object"}, {"undefined", "undefined"}, {"{}", "object"}, {"{value:7}", "object"}, {`{get value():number{try{throw 9}finally{}}}`, "object"}, {"()=>3", "function"},
		} {
			t.Run(string(target)+"/"+tc.arg, func(t *testing.T) {
				const id = "/virtual/typeof-represented.ts"
				source := `export {};const read=(value:unknown)=>typeof value;read(` + tc.arg + `);`
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal("source qualification", response.Error, response.Diagnostics)
				}
				h := bindingCloseHistory(session, id)
				if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
					t.Fatal("actual typeof Call missing", response.Diagnostics)
				}
				row := h.receipt.alternatives[0]
				if row.completion != languageNormal || row.callHistory == nil || row.value.node == nil || row.value.node.Kind != ast.KindStringLiteral || row.value.node.Text() != tc.want {
					t.Fatal("actual typeof result", row.completion, row.remaining, row.value)
				}
				e := row.callHistory.entry
				raw := row.callHistory.raw.alternatives[0]
				r := e.proof.entry
				if !callBodySnapshot(e, raw) || len(e.inputs.arguments) != 1 || raw.completion != languageReturn || raw.returnBoundary != e.boundary {
					t.Fatal("actual argument/formal/Return association")
				}
				pc := -1
				for i, event := range r.events {
					if event.kind == "Typeof" {
						if pc != -1 {
							t.Fatal("duplicate typeof")
						}
						pc = i
					}
				}
				if pc < 0 || !typeofReady(r, pc, raw.storage.ready) || r.events[r.events[pc].a].kind != "ReadCell" || raw.storage.values[r.events[pc].a] != e.inputs.arguments[0].value || raw.storage.values[pc] != raw.value {
					t.Fatal("exact paid operand/result association")
				}
				encoded, _ := json.Marshal(response)
				var fields map[string]json.RawMessage
				_ = json.Unmarshal(encoded, &fields)
				delete(fields, "timings")
				encoded, _ = json.Marshal(fields)
				t.Log("TYPEOFRESPONSE", string(encoded))
				script := `const fs=require('node:fs'),vm=require('node:vm');const value=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}});if(value!==process.argv[2])throw Error(JSON.stringify({value}));`
				sourceNodeScript(t, source, script, tc.want)
				sourceNodeScript(t, response.Code, script, tc.want)
			})
		}
	}
}

func TestTypeofOperandWriteOnce(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		cwd, err := os.Getwd()
		if err != nil {
			t.Fatal(err)
		}
		id := filepath.Join(cwd, "typeof-write.ts")
		const source = `export {};const read=(value:number)=>typeof (value=value+1);read(3);`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		h := bindingCloseHistory(session, id)
		if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
			t.Fatal("actual write Call missing")
		}
		row := h.receipt.alternatives[0]
		if row.callHistory == nil || row.completion != languageNormal || row.value.node.Text() != "number" {
			t.Fatal("actual typeof write result")
		}
		raw := row.callHistory.raw.alternatives[0]
		r := row.callHistory.entry.proof.entry
		puts := 0
		for _, event := range r.events {
			if event.kind == "PutValue" {
				puts++
				n, ok := numericNumberPayload(raw.storage.values[event.out])
				if !ok || n != 4 {
					t.Fatal("write result", n)
				}
			}
		}
		if puts != 1 {
			t.Fatal("source Put count", puts)
		}
		initialized := 0
		written := 0
		for s := raw.branch.state.storage; s != nil; s = s.previous {
			if s.cell == raw.storage.cells[0] {
				if n, ok := numericNumberPayload(s.value); s.initialized && ok && n == 3 {
					initialized++
				}
				n, ok := numericNumberPayload(s.value)
				if ok && n == 4 {
					written++
				}
			}
		}
		if initialized != 1 || written != 1 {
			t.Fatal("actual cell initialization/write counts", initialized, written)
		}
		script := `const fs=require('node:fs'),vm=require('node:vm');if(vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{},require})!=='number')throw Error('result');`
		sourceNodeScript(t, source, script)
		sourceNodeScript(t, response.Code, script)
		t.Log(fmt.Sprint(target, " actual Put once"))
	}
}

func TestTypeofPrefixCurrentDataAndResidual(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, tc := range []struct{ setup, expression, want string }{
			{`const box={value:3};`, `typeof box.value`, "number"},
			{`const box={value:3};box.value=7;`, `typeof box.value`, "number"},
			{`const box={value:3};`, `typeof (box.value=box.value+1)`, "number"},
		} {
			source := `export {};` + tc.setup + `const keep=(v:unknown)=>v;keep(` + tc.expression + `);`
			const id = "/virtual/typeof-prefix.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("prefix actual source", response.Error, response.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 || h.receipt.alternatives[0].callHistory == nil || h.receipt.alternatives[0].value.node == nil || h.receipt.alternatives[0].value.node.Text() != tc.want {
				t.Fatal("actual prefix typeof result")
			}
			sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');if(vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})!=='number')throw Error('typeof result');`)
		}
		const source = `export {};const box={get value():number{try{throw 9}finally{}}};const read=()=>typeof box.value;read();`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-residual.ts", Source: source, Target: target, Diagnostics: "semantic"})
		for _, d := range response.Diagnostics {
			if d.Severity == "error" && d.Code != "EXACT2101" {
				t.Fatal("unqualified residual source", d)
			}
		}
		h := bindingCloseHistory(session, "/virtual/typeof-residual.ts")
		if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
			t.Fatal("source residual did not retain owned history", response.Diagnostics)
		}
		row := h.receipt.alternatives[0]
		if row.completion != languageResidual || row.callHistory == nil || row.callHistory.raw == nil {
			t.Fatal("unknown Getter did not remain actual residual", row.completion, row.remaining)
		}
		raw := row.callHistory.raw.alternatives[0]
		if raw.storage == nil || raw.storage.recipe != row.callHistory.entry.proof.entry {
			t.Fatal("residual lost actual Call/continuation")
		}
		for _, event := range raw.storage.recipe.events {
			if event.kind == "Typeof" && raw.storage.ready[event.out] {
				t.Fatal("residual operand fabricated typeof result")
			}
		}
		sourceNodeScript(t, source, `const fs=require('node:fs'),vm=require('node:vm');let caught=false;try{vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})}catch(e){if(e!==9)throw e;caught=true}if(!caught)throw Error('original getter Throw');`)
	}
}

func TestTypeofCallableInstancesAndOpenIngress(t *testing.T) {
	for _, tc := range []struct{ prefix, arg string }{
		{`const box={value:3};const f=()=>box.value;`, "f"},
		{``, `function(this:unknown){return this}`},
	} {
		source := `export {};` + tc.prefix + `const read=(v:unknown)=>typeof v;read(` + tc.arg + `);`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-callable.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal("represented callable source", response.Error, response.Diagnostics)
		}
		h := bindingCloseHistory(session, "/virtual/typeof-callable.ts")
		if h == nil || h.receipt == nil || h.receipt.alternatives[0].value.node == nil || h.receipt.alternatives[0].value.node.Text() != "function" {
			if h == nil {
				t.Fatal("represented callable no source history", tc.prefix, tc.arg)
			}
			if h.receipt == nil {
				t.Fatal("represented callable no owned receipt", tc.prefix, tc.arg, h.state, h.reason)
			}
			for _, row := range h.receipt.alternatives {
				t.Log("CALLABLEFACT", row.completion, row.remaining, row.value, row.callHistory != nil)
			}
			t.Fatal("represented callable did not classify", tc.prefix, tc.arg, h.state, h.reason)
		}
		sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');if(vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})!=='function')throw Error('typeof function');`)
	}
	for _, prefix := range []string{`function f(){return 3}`, `const box={value:3};function f(){return box.value}`} {
		source := `export {};` + prefix + `const read=(v:unknown)=>typeof v;read(f);`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-hoisted-input.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal("ordinary hoisted source qualification", response.Error, response.Diagnostics)
		}
		if h := bindingCloseHistory(session, "/virtual/typeof-hoisted-input.ts"); h != nil && h.receipt != nil {
			for _, row := range h.receipt.alternatives {
				if row.completion == languageNormal && row.callHistory != nil {
					t.Fatal("hoisted input population newly admitted, qualify native result")
				}
			}
		}
		t.Log("OPEN_TYPEOF_INGRESS hoisted declaration passed as input to unrelated arrow, no source history", prefix)
	}

	// These genuine TS7 sources document earlier missing VALUE ingress. Their
	// ordinary JavaScript results are not substituted into the acquired schedule.
	for _, tc := range []struct{ arg, want string }{{"1n", "bigint"}, {"Symbol.iterator", "symbol"}, {"Object.freeze", "function"}, {"Promise.resolve", "function"}, {"[]", "object"}} {
		source := `export {};const read=(v:unknown)=>typeof v;read(` + tc.arg + `);`
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-open-ingress.ts", Source: source, Diagnostics: "semantic"})
		for _, d := range response.Diagnostics {
			if d.Severity == "error" && d.Code != "EXACT2101" {
				t.Fatal("open ingress source was not TS7 qualified", tc.arg, d)
			}
		}
		h := bindingCloseHistory(session, "/virtual/typeof-open-ingress.ts")
		if h != nil && h.receipt != nil {
			for _, row := range h.receipt.alternatives {
				if row.completion == languageNormal && row.callHistory != nil {
					t.Fatal("ingress unexpectedly admitted, reassess boundary", tc.arg)
				}
			}
		}
		sourceNodeScript(t, source, `const fs=require('node:fs'),vm=require('node:vm');const v=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}});if(v!==process.argv[2])throw Error('ordinary typeof');`, tc.want)
		t.Log("OPEN_TYPEOF_INGRESS", tc.arg, "native source admission before acquired typeof")
	}
}

func TestTypeofOperandBrowserEffect(t *testing.T) {
	const source = `export {};const box={get value(){return window.innerWidth}};const read=()=>typeof box.value;read();`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-browser-effect.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		browser := false
		for _, fact := range r.Analysis.Callables {
			for _, effect := range fact.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
		}
		if !browser {
			t.Fatal("typeof erased actual operand browser getter effect", r.Diagnostics)
		}
		if h := bindingCloseHistory(session, "/virtual/typeof-browser-effect.ts"); h != nil && h.receipt != nil {
			for _, row := range h.receipt.alternatives {
				if row.completion == languageNormal && row.callHistory != nil {
					t.Fatal("unsupported getter operand acquired unauthorized coverage")
				}
			}
		}
		sourceNodeScript(t, source, `const fs=require('node:fs'),vm=require('node:vm');let reads=0;const window={get innerWidth(){reads++;return 42}};const v=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{},window});if(v!=='number'||reads!==1)throw Error(JSON.stringify({v,reads}));`)
	}
}
