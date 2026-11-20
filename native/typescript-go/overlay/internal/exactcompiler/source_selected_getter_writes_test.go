package exactcompiler

import (
	"strings"
	"testing"
)

func TestComponentSelectedGetterDescriptorWrite(t *testing.T) {
	const component = `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign():void;
type Metadata={readKey?:()=>string,domain:string};
function configure(_target:object){
 Object.defineProperty(Object.prototype,'readKey',{configurable:true,get:function(this:object){
  Object.defineProperty(this,'domain',{configurable:true,get(){return DONOR}});
  return undefined;
 }});
}
function put(target:object){
 Object.defineProperty(target,'domain',{configurable:true,get(){return DONOR}});
}
export function Page(this:Component<{label:string}>){
 this.state.label='start';
 const run=(task:TaskContext=TaskContext.server())=>{
  const metadata:Metadata={domain:'safe' SHADOW};
  const other:Metadata={domain:'other'};
  configure(other);
  foreign();
  STEPS
 };
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	const inline = "void metadata.readKey; this.state.label=metadata.domain;"
	const domain = "this.state.label=metadata.domain;"
	for _, test := range []struct {
		name, steps, shadow string
		browser             bool
	}{
		{"selected", inline, "", true},
		{"no-read", domain, "", false},
		{"own-shadow", inline, ",readKey:undefined", false},
		{"different-receiver", "void other.readKey; " + domain, "", false},
		{"too-late", domain + " void metadata.readKey;", "", false},
		{"explicit-helper", "put(metadata); " + domain, "", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			template := strings.NewReplacer("STEPS", test.steps, "SHADOW", test.shadow).Replace(component)
			check := func(donor string, browser bool) {
				t.Helper()
				source := strings.ReplaceAll(template, "DONOR", donor)
				result := session.Execute(Request{Kind: "compile", ID: "selected-getter-write.tsx", LanguageOverlay: true, Source: source, Target: TargetServer, Diagnostics: "semantic"})
				if result.Error != "" || len(result.Analysis.Tasks) != 1 {
					t.Fatal(result.Error, result.Diagnostics)
				}
				document, foreign := false, false
				for _, effect := range result.Analysis.Tasks[0].EffectSources {
					document = document || effect.Description == "document"
					foreign = foreign || effect.Description == "unresolved call foreign"
				}
				if document != browser || !foreign {
					t.Fatal("expected receiver-relative browser effect and independent foreign effect", result.Analysis.Tasks[0].EffectSources)
				}
				denied := false
				for _, diagnostic := range result.Diagnostics {
					if diagnostic.Severity != "error" {
						continue
					}
					if diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, "document") || !strings.Contains(diagnostic.Message, "unresolved call foreign") {
						t.Fatal(diagnostic.Code, diagnostic.Message)
					}
					denied = true
				}
				if denied != browser || (result.Code == "") != browser {
					t.Fatal("unexpected server artifact disposition", result.Diagnostics)
				}
			}
			check("document.title", test.browser)
			if test.name == "selected" {
				check("'neutral'", false)
				check("document.title", true)
			}
		})
	}
}
