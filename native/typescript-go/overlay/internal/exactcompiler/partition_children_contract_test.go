package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionChildrenKeepRenderedAndInspectedValuesDistinct(t *testing.T) {
	for _, expression := range []string{
		`props.children`, `props["children"]`, `props[String("children")]`, `props?.[String("children")]`,
		`(props.children as unknown)`, `props.children!`, `props.children satisfies unknown`,
		`props.children===null ? null : props.children`, `props.children ?? null`, `props.children || null`,
		`props.children && props.children`, `[props.children]`, `forward(props.children)`,
	} {
		source := `import {type Component} from '@exactjs/core';function forward(value:unknown){return value;}export function Probe(this:Component<{count:number}>,props:{children?:unknown,title:string}){this.state.count=0;return()=> <section title={String(props.children)}><button onClick={()=>this.state.count++}>{props[String("title")]} {this.state.count}</button><div>{` + expression + `}</div></section>;}`
		for _, target := range []Target{TargetServer, TargetClient} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/children.tsx", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("%s/%s rejected: %s %#v", target, expression, response.Error, response.Diagnostics)
			}
			if !strings.Contains(response.Code, "title") || !strings.Contains(response.Code, "children") {
				t.Fatalf("%s lost data inspection or child forwarding:\n%s", expression, response.Code)
			}
			if len(response.Analysis.PartitionPlan.Nodes) == 0 {
				t.Fatal("compiled children lost their ownership plan")
			}
		}
	}
}

func TestPartitionDormantBrowserCallbacksStayOutsideServerExecution(t *testing.T) {
	for _, c := range []struct {
		name, definition, render string
		invalid                  bool
	}{
		{"function declaration", `function browser(){return window.innerWidth}`, `<button onClick={browser}>Open</button>`, false},
		{"function expression", `const browser=function(){return window.innerWidth}`, `<button onClick={browser}>Open</button>`, false},
		{"function alias", `function browser(){return window.innerWidth}const alias=browser;`, `<button onClick={alias}>Open</button>`, false},
		{"render invoked", `function browser(){return window.innerWidth}`, `<span>{browser()}</span>`, true},
		{"render alias invoked", `function browser(){return window.innerWidth}const alias=browser;`, `<span>{alias()}</span>`, true},
		{"shadowed browser name", `const window={innerWidth:10};`, `<span>{window.innerWidth}</span>`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/dormant.tsx", Target: TargetServer, Source: `export function Probe(){` + c.definition + `;return()=> ` + c.render + `;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			found := false
			for _, d := range response.Diagnostics {
				if d.Code == "EXACT2211" {
					found = true
				}
			}
			client := len(response.Analysis.Components) != 0 && response.Analysis.Components[0].Placement == "client"
			if (found || client) != c.invalid {
				t.Fatalf("server execution eligibility=%v, want %v: %#v", found, c.invalid, response.Diagnostics)
			}
		})
	}
}
