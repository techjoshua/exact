package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

func TestPartitionSharedDependencyGraphRemainsBounded(t *testing.T) {
	for _, leaf := range []struct{ source, placement string }{
		{"window.innerWidth", "client"},
		{"process.cwd()", "server"},
		{"typeof window==='undefined'?1:window.innerWidth", "isomorphic"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := "function h0(){return " + leaf.source + ";}"
			for depth := 1; depth <= 28; depth++ {
				source += fmt.Sprintf("function h%d(){return h%d()+h%d();}", depth, depth-1, depth-1)
			}
			source += "export const width=h28;export const stable=1;"
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/dependency-diamond.ts", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("dependency graph rejected: %s %#v", response.Error, response.Diagnostics)
			}
			retained := leaf.placement == "isomorphic" || leaf.placement == string(target)
			if strings.Contains(response.Code, "width =") != retained || !strings.Contains(response.Code, "stable = 1") {
				t.Fatalf("%s %s lost dependency placement:\n%s", target, leaf.placement, response.Code)
			}
		}
	}
}

func TestPartitionDependencyCyclesRetainEveryReachableEffect(t *testing.T) {
	for _, control := range []struct{ source, placement string }{
		{"window.innerWidth", "client"},
		{"process.cwd()", "server"},
		{"typeof window==='undefined'?1:window.innerWidth", "isomorphic"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := "function a(){return b();}function b(){return a()+(" + control.source + ");}export{a,b};export const stable=1;"
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/dependency-cycle.ts", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("cycle rejected: %s %#v", response.Error, response.Diagnostics)
			}
			retained := control.placement == "isomorphic" || control.placement == string(target)
			for _, name := range []string{"a", "b"} {
				if strings.Contains(response.Code, "function "+name+"(") != retained {
					t.Fatalf("%s %s lost cycle owner %s:\n%s", target, control.placement, name, response.Code)
				}
			}
		}
	}
}

func TestPartitionSuppliedHelperDependencyGraphProofs(t *testing.T) {
	for _, leaf := range []struct {
		expression  string
		transparent bool
	}{
		{`inputs.children`, true}, {`"replacement"`, false},
	} {
		source := `import {createCompiledTargetReceipt} from "@exactjs/core/runtime/component-abi";function p0(inputs:{children?:unknown}){return createCompiledTargetReceipt({},` + leaf.expression + `);}`
		for depth := 1; depth <= 28; depth++ {
			source += fmt.Sprintf(`function p%d(inputs:{children?:unknown}){if(Math.random())return p%d(inputs);return p%d(inputs);}`, depth, depth-1, depth-1)
		}
		source += `export function Contribution(props:{children?:unknown}){return()=>p28(props);}`
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/supplied-diamond.tsx", Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("supplied graph rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "transparentTarget: true") != leaf.transparent {
				t.Fatalf("%s lost supplied target proof %t:\n%s", target, leaf.transparent, response.Code)
			}
		}
	}
}

func TestPartitionSuppliedHelperProofsRetainReceiverAndCycleBoundaries(t *testing.T) {
	for _, body := range []string{
		`function choose(first:{children?:unknown},second:{children?:unknown}){return first.children;}function project(inputs:{children?:unknown;active?:boolean}){if(inputs.active)return choose(inputs,inputs);return choose({children:"replacement"},inputs);}`,
		`function project(inputs:{children?:unknown;active?:boolean}){if(inputs.active)return createCompiledTargetReceipt({},inputs.children);return project(inputs);}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/supplied-owners.tsx", Target: target, Source: `import {createCompiledTargetReceipt} from "@exactjs/core/runtime/component-abi";` + body + `export function Contribution(props:{children?:unknown}){return()=>project(props);}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("supplied control rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "transparentTarget: true") {
				t.Fatalf("%s authorized opaque ownership:\n%s", target, response.Code)
			}
		}
	}
}
