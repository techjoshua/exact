package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The original render Get can invoke a descriptor installed on its component's local allocation.
func TestComponentSetupDescriptorRenderPlacement(t *testing.T) {
	const install = "Object.defineProperty(alias,'value',{get(){return document.title.length}});"
	for _, row := range []struct {
		name, setup, read string
		browser           bool
	}{
		{"installed", install, "box.value", true},
		{"immediate reader", install, "(()=>box.value)()", true},
		{"conditional", "if(props.install){" + install + "}", "box.value", true},
		{"unreachable", "if(false){" + install + "}", "box.value", false},
		{"rebound", "alias={value:0};" + install, "box.value", false},
		{"unread", install, "0", false},
		{"dormant installer", "const unused=()=>{" + install + "};", "box.value", false},
		{"unrelated reader", install + "const unused=()=>box.value;", "0", false},
		{"split return", "if(props.install){" + install + "return ()=> <output>{1}</output>;}", "box.value", false},
		{"opposite branch", "if(props.install){" + install + "return ()=> <output>{1}</output>;} else {return ()=> <output>{box.value}</output>;}", "0", false},
		{"selected branch reader", "if(props.install){" + install + "return ()=> <output>{box.value}</output>;}", "0", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			const prefix = "import type {Component} from '@exactjs/core';"
			page := prefix + "export function Page(this:Component<{}>,props:{install:boolean}){const box={value:0};let alias=box;" + row.setup + "return ()=> <output>{" + row.read + "}</output>;}"
			fixture := newPublicAwaitRequiredFixture(t, page)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.ServerComponents = target, true
				response := NewSession().Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Components) != 1 {
					t.Fatalf("%s compile failed: %s %#v", target, response.Error, response.Diagnostics)
				}
				component := response.Analysis.Components[0]
				if browser := component.EnvironmentEffect == "browser"; browser != row.browser || (component.Placement == "client") != row.browser {
					t.Fatalf("%s placement %s, effect %s, expected browser dependency %v", target, component.Placement, component.EnvironmentEffect, row.browser)
				}
				if row.browser && target == TargetServer && strings.Contains(response.Code, "document.title") {
					t.Fatalf("server artifact retained a browser-only getter implementation")
				}
				if row.name == "split return" && target == TargetServer && !strings.Contains(response.Code, "Object.defineProperty") {
					t.Fatalf("server artifact lost the authored setup work")
				}
			}
			if row.name != "installed" && row.name != "immediate reader" {
				return
			}
			if err := os.WriteFile(filepath.Join(fixture.root, "child.tsx"), []byte(page), 0600); err != nil {
				t.Fatal(err)
			}
			request := fixture.request("compile", "entry.tsx")
			request.Source = prefix + "import {Page} from './child';export function Parent(this:Component<{}>){return ()=> <Page install={true}/>;}"
			request.Target, request.ServerComponents = TargetServer, true
			response := NewSession().Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 || len(response.Analysis.Components[0].RenderEdges) != 1 || response.Analysis.Components[0].RenderEdges[0].Placement != "client" {
				t.Fatalf("imported child lost placement: %s %#v %#v", response.Error, response.Diagnostics, response.Analysis.Components)
			}
		})
	}
}
