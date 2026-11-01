package exactcompiler

import "testing"

func TestOptionalNativeReceiverEffects(t *testing.T) {
	cases := []struct{ name, body, environment string }{
		{"optional string", `function read(value?:string){return value?.includes('x');}const value=read('x');`, "neutral"},
		{"optional number", `function read(value?:number){return value?.toFixed(2);}const value=read(1);`, "neutral"},
		{"optional boolean", `function read(value?:boolean){return value?.toString();}const value=read(true);`, "neutral"},
		{"optional date", `function read(value?:Date){return value?.getTime();}const value=read(new Date(0));`, "neutral"},
		{"optional URL", `function read(value?:URL){return value?.toString();}const value=read(new URL('https://example.test'));`, "neutral"},
		{"optional map", `function read(map?:Map<string,string>){return map?.get('key');}const value=read();`, "neutral"},
		{"optional portable event", `function read(target?:EventTarget){return target?.dispatchEvent(new Event('ready'));}const value=read();`, "neutral"},
		{"native authored union", `function read(items?:number[]|{some:(test:(value:number)=>boolean)=>boolean}){return items?.some(value=>value>0);}const value=read();`, "unknown"},
		{"optional array", `function hasWork(route:{children?:number[]}):boolean{return !!route.children?.some(value=>value>0);}const value=hasWork({});`, "neutral"},
		{"nullable array", `function hasWork(items:number[]|null):boolean{return !!items?.some(value=>value>0);}const value=hasWork(null);`, "neutral"},
		{"optional browser callback", `function hasWork(items?:number[]):boolean{return !!items?.some(value=>window.location.href.length>value);}const value=hasWork([1]);`, "browser"},
		{"authored optional member", `function hasWork(items?:{some:(test:(value:number)=>boolean)=>boolean}):boolean{return !!items?.some(value=>value>0);}const value=hasWork();`, "unknown"},
	}
	for _, scenario := range cases {
		t.Run(scenario.name, func(t *testing.T) {
			source := `export function Page(){` + scenario.body + `return()=> <p>{String(value)}</p>;}`
			response := NewSession().Execute(Request{ID: "optional-native-receiver.tsx", Kind: "analyze", Source: source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != scenario.environment {
				t.Fatalf("want %s: %#v", scenario.environment, response.Analysis.Components)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "optional-native-receiver.tsx", Kind: "compile", Source: source, Target: target})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
}
