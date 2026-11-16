package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// An authored map which ignores its argument and a merely stored mapper do not
// acquire the standard Array.map callback Effects association.
func TestPublicImportedMapPolicyNoninvocation(t *testing.T) {
	config := timeSemanticConfig(t)
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	entry, dep := filepath.Join(root, "map-refuser-page.tsx"), filepath.Join(root, "map-refuser-helper.ts")
	const source = `import{TaskContext,type Component}from'@exactjs/core';import{read}from'./map-refuser-helper.js';
export function Page(this:Component<{result:number}>){this.state.result=0;
const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{void task;this.state.result=read()};
return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`
	for _, example := range []struct{ name, body string }{
		{"authored-map", `const receiver={map(_callback:()=>number){return 1}};receiver.map(()=>{void consume(credential);return 1});`},
		{"stored-mapper", `const mapper=()=>{void consume(credential);return 1};void mapper;void [1].map;`},
	} {
		helper := `import{consume}from'@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;
export function read(){void document.title;` + example.body + `return 1;}`
		session := NewSession()
		setup := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dep, Source: helper}, {ID: entry, Source: source}}})
		if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
			t.Fatalf("ENTRY %s setup: %s %#v", example.name, setup.Error, setup.Diagnostics)
		}
		r := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("ENTRY %s public component failed: %s %#v", example.name, r.Error, r.Diagnostics)
		}
		if len(r.Analysis.Components) != 1 || len(r.Analysis.Tasks) != 1 || r.Analysis.Tasks[0].Placement != "client" || !r.Analysis.Tasks[0].BrowserEffects {
			t.Fatal("actual public component/browser task missing", example.name, r.Analysis.Tasks)
		}
		if len(r.Analysis.Policy.SecretConsumers) != 0 {
			t.Fatal("uninvoked/authored callback received native policy authority", example.name, r.Analysis.Policy.SecretConsumers)
		}
	}
}
