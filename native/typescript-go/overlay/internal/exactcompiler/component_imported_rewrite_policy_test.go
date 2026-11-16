package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Public helper rewrites need no secret-consumption certificate. A retained
// direct secret consumer cannot disappear from audit through callee replacement.
func TestPublicImportedHelperRewritePolicyRefusal(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dep := filepath.Join(root, "rewrite-policy-page.tsx"), filepath.Join(root, "rewrite-policy-helper.ts")
	const source = `import{TaskContext,type Component}from'@exactjs/core';import*as helper from'./rewrite-policy-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{void task;this.state.result=helper.read()};
return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`
	for _, secret := range []bool{false, true} {
		helper := `export function read(){void document.title;return 1;}`
		if secret {
			helper = `import{consume}from'@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){void document.title;void consume(credential);return 1;}`
		}
		session := NewSession()
		setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dep, Source: helper}, {ID: entry, Source: source}}})
		if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
			t.Fatal("rewrite setup", setup.Error, setup.Diagnostics)
		}
		r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic", ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{{SourceModule: "./rewrite-policy-helper.js", SourceExport: "read", TargetModule: "./rewrite-policy-helper.js", TargetExport: "read"}}}})
		if secret {
			if !strings.Contains(r.Error, "retained imported policy callee identity changed") || r.Code != "" || r.SourceMap != nil {
				t.Fatal("identity-losing rewrite bypassed policy refusal", r.Error, r.Diagnostics)
			}
		} else {
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].BrowserEffects {
				t.Fatal("ordinary public rewrite rejected or lost effects", r.Error, r.Diagnostics, r.Analysis.Tasks)
			}
		}
	}
}
