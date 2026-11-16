package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Computed method names execute during construction. Dormant method bodies do
// not, and neither case needs a separate callback-execution analysis.
func TestPublicImportedHelperComputedNamePolicy(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dep := filepath.Join(root, "eager-policy-page.tsx"), filepath.Join(root, "eager-policy-helper.ts")
	const source = `import{TaskContext,type Component}from'@exactjs/core';import{read}from'./eager-policy-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{void task;this.state.result=read()};
return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`
	for _, eager := range []bool{false, true} {
		record := `{method(){void consume(credential);return 1}}`
		if eager {
			record = `{[consume(credential)](){return 1}}`
		}
		helper := `import{consume}from'@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){void document.title;const record=` + record + `;void record;return 1;}`
		session := NewSession()
		setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dep, Source: helper}, {ID: entry, Source: source}}})
		if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
			t.Fatal("eager policy setup", setup.Error, setup.Diagnostics)
		}
		r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" {
			t.Fatal("ENTRY eager helper did not reach policy", r.Error, r.Diagnostics)
		}
		if len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].BrowserEffects {
			t.Fatal("ENTRY imported helper missing", r.Analysis.Tasks)
		}
		if eager {
			if !hasDiagnosticCode(r.Diagnostics, "EXACT3004") || r.Code != "" || r.SourceMap != nil || len(r.Analysis.Policy.SecretConsumers) != 1 || r.Analysis.Policy.SecretConsumers[0].Authorization != "denied" {
				t.Fatal("computed method name consume missed", r.Diagnostics, r.Analysis.Policy.SecretConsumers)
			}
		} else if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Policy.SecretConsumers) != 0 {
			t.Fatal("dormant method body was executed by audit", r.Diagnostics, r.Analysis.Policy.SecretConsumers)
		}
	}
}
