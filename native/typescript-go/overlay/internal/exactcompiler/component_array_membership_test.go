package exactcompiler

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// A component can run an ordinary membership check on the server. Browser
// work performed while evaluating its elements, arguments or index conversion
// belongs to the server task even though the array itself is freshly created.
func TestComponentArrayMembershipPlacement(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		name, expression string
		browser          bool
	}{
		{"hex-length", "[3,4,6,8].includes(value.length)", false},
		{"array-element", "[3,window.innerWidth].includes(value.length)", true},
		{"needle", "[3,4].includes(document.title.length)", true},
		{"index-conversion", "[3,4].includes(value.length,{valueOf(){return window.innerWidth}} as unknown as number)", true},
		{"empty-skips-index-conversion", "[].includes(value.length as never,{valueOf(){return window.innerWidth}} as unknown as number)", false},
		{"custom-method", "({includes(n:number){return n===window.innerWidth}}).includes(value.length)", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import { TaskContext, type Component } from "@exactjs/core";
function accepts(value:string){return ` + row.expression + `;}
export function Page(this:Component<{value:string,accepted:boolean}>,props:{value:string}){
	this.state.value=props.value; this.state.accepted=false;
	const check=(task:TaskContext=TaskContext.server())=>{this.state.accepted=accepts(this.state.value);};
	return ()=> <button onClick={()=>check()}>{String(this.state.accepted)}</button>;
}`
			result := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "membership-page.tsx"), ConfigFile: timeSemanticConfig(t), Source: source, Target: TargetServer, Diagnostics: "semantic"})
			index := slices.IndexFunc(result.Analysis.Tasks, func(task Task) bool { return task.RequestedPlacement == "server" })
			if result.Error != "" || index < 0 || result.Analysis.Tasks[index].BrowserEffects != row.browser {
				t.Fatalf("membership task: %s %#v %#v", result.Error, result.Analysis.Tasks, result.Diagnostics)
			}
			if row.browser {
				for _, d := range result.Diagnostics {
					if d.Code == "EXACT2001" && result.Code == "" && result.SourceMap == nil {
						return
					}
				}
				t.Fatalf("expected server placement refusal: %#v", result.Diagnostics)
			}
			if result.Code == "" || hasErrorDiagnostic(result.Diagnostics) || result.Analysis.Tasks[index].Placement != "server" {
				t.Fatalf("expected usable server task: %#v", result.Diagnostics)
			}
		})
	}
}
