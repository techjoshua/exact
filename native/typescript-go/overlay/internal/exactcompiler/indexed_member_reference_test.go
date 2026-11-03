package exactcompiler

import (
	"encoding/json"
	"strings"
	"testing"
)

// Numeric reads may replace values, but Calls and tags consume a Reference.
// Exercise the emitted expression without coupling the check to helper spelling.
func TestIndexedMemberReceiverEmission(t *testing.T) {
	for _, root := range []string{"props", "state"} {
		for _, row := range []struct{ name, expression string }{
			{"direct", `props.read(props.label)`},
			{"literal", `props['read'](props.label)`},
			{"parenthesized", `(props.read)(props.label)`},
			{"asserted", `(props.read as typeof props.read)(props.label)`},
			{"nonnull", `props.read!(props.label)`},
			{"optional", `props.read?.(props.label)`},
			{"tag", "props.read`value`"},
		} {
			t.Run(root+"/"+row.name, func(t *testing.T) {
				source := `export function View(props:{label:string;read(this:{label:string},value:unknown):string}){return()=> <output>{` + row.expression + `}</output>}`
				if root == "state" {
					source = strings.ReplaceAll(source, "props.", "this.state.")
					source = strings.ReplaceAll(source, "props[", "this.state[")
					source = strings.Replace(source, "View(props:", "View(this:{state:", 1)
					source = strings.Replace(source, "value:unknown):string})", "value:unknown):string}})", 1)
				}
				response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "indexed-call.tsx", Source: source})
				if response.Error != "" || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				component := findComponent(t, response.Analysis.Components, "View")
				keys := component.PropsSlots
				if root == "state" {
					keys = component.StateSlots
				}
				slots, _ := json.Marshal(keys)
				sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};const keys=`+string(slots)+`;const helpers=new Proxy({attachCompiledComponentContract:f=>f,prepareCompiledRenderProgram:p=>p,createPreparedRenderProgram:(_p,slots)=>slots[0](),readIndexedReactiveSlot:(bag,index)=>bag[keys[index]]},{get:(o,k)=>o[k]??(()=>{})});vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,require:()=>helpers});const bag={label:'receiver',read(value){assert.equal(this,bag);assert.ok(value!==undefined);return this.label;}};assert.equal(out.View.call({state:bag},bag)(),'receiver');`)
			})
		}
	}

}
