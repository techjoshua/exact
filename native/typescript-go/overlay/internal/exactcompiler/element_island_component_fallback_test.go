package exactcompiler

import (
	"strings"
	"testing"
)

func TestNativeComponentIslandRetainsServerFallbackAndLocalCallbacks(t *testing.T) {
	response := NewSession().Execute(Request{ID: "component-island-fallback.tsx", Kind: "compile", Target: TargetServer, ServerComponents: true,
		Source: `function Row(props: {id: string; onEnter: () => void}) { return () => <button onMouseEnter={props.onEnter}>{props.id}</button>; }
export function Report(props: {rows: {id: string}[]; enter: () => void}) {
 return () => <section>{props.rows.map(row => <Row key={row.id} {...row} onEnter={props.enter} />)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, "__exactHydrationFallback:") || !strings.Contains(response.Code, "__exactComponentReceipt(Row") || !strings.Contains(response.Code, "onEnter: props.enter") {
		t.Fatalf("native island lost its SSR component or local callback inputs:\n%s", response.Code)
	}
}

func TestNativeComponentIslandRetainsIndexedSupplierContract(t *testing.T) {
	source := `import type {Component} from "@exactjs/core";import {createCompiledComponentInputReceipt} from "@exactjs/core/runtime/component-operations";
 function Contribution(props:{count:number}) {return()=> <_target title={props.count}/>;}
 export function Page(this:Component<{count:number}>){this.state.count=0;return()=> <section><button onClick={()=>this.state.count++}>Next</button><Contribution count={this.state.count}><button className="authored" style={{border:"1px solid black"}}>Child</button></Contribution></section>;}
 export function root(){return createCompiledComponentInputReceipt(Page,{});}`
	response := NewSession().Execute(Request{ID: "island-supplier.tsx", Kind: "compile", Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	start := strings.Index(response.Code, "export const Page_ExactClient_")
	if start < 0 {
		t.Fatalf("missing island:\n%s", response.Code)
	}
	end := strings.Index(response.Code[start:], "})();")
	if end < 0 {
		t.Fatal("missing island attachment")
	}
	island := response.Code[start : start+end]
	if !strings.Contains(island, "__exactComponentReceiptUpdate(") || !strings.Contains(island, "updates: __exact_component_updates_") {
		t.Fatalf("island supplier lost its exact update contract:\n%s", island)
	}
}
