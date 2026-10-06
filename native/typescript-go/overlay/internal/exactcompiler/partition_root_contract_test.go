package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionRootEntriesRespectCompiledValueAndCapabilityOwnership(t *testing.T) {
	for _, c := range []struct{ name, imports, call, helper string }{
		{"component mount", `import {render} from '@exactjs/dom';`, `render(<App/>,document.body);`, `renderCompiledComponentRoot as`},
		{"intrinsic mount", `import {render} from '@exactjs/dom/root';`, `render(<p>Ready</p>,document.body);`, `renderCompiledProgramRoot as`},
		{"aliased operation", `import {render as mount} from '@exactjs/dom';`, `const root=<App/>;const alias=root;mount(alias,document.body);`, `renderCompiledComponentRoot as`},
		{"namespace mount", `import * as dom from '@exactjs/dom';`, `dom.render(<App/>,document.body);`, `renderCompiledComponentRoot as`},
		{"hydrate component", `import {hydrate} from '@exactjs/hydrate/root';`, `hydrate(<App/>,document.body);`, `hydrateCompiledComponentRoot as`},
		{"deferred expression", `import {hydrateAfterNavigation} from '@exactjs/hydrate/root';`, `hydrateAfterNavigation(()=> <App/>,document.body);`, `hydrateCompiledComponentRootAfterNavigation as`},
		{"deferred function", `import {hydrateAfterNavigation} from '@exactjs/hydrate/root';`, `hydrateAfterNavigation(function(){const value=1;return <App/>},document.body);`, `hydrateCompiledComponentRootAfterNavigation as`},
		{"generic hydrate capability", `import {hydrate} from '@exactjs/hydrate';`, `hydrate(<App/>,document.body);`, ``},
		{"noncomponent hydrate", `import {hydrate} from '@exactjs/hydrate/root';`, `hydrate(<p>Ready</p>,document.body);`, ``},
		{"opaque mount", `import {render} from '@exactjs/dom';`, `render('Ready',document.body);`, ``},
		{"async deferred", `import {hydrateAfterNavigation} from '@exactjs/hydrate/root';`, `hydrateAfterNavigation(async()=> <App/>,document.body);`, ``},
		{"branched deferred", `import {hydrateAfterNavigation} from '@exactjs/hydrate/root';`, `hydrateAfterNavigation(()=> {if(true)return <App/>;return <App/>},document.body);`, ``},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/root.tsx", Target: TargetClient, ComponentContractProjection: ComponentContractProjectionHydrate, Source: c.imports + `export function App(){return()=> <p>Ready</p>;}` + c.call})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid root rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if c.helper != "" && !strings.Contains(response.Code, c.helper) {
				t.Fatalf("compiled root lost its entry %q:\n%s", c.helper, response.Code)
			}
			if c.helper == "" && strings.Contains(response.Code, "hydrateCompiledComponentRoot as") {
				t.Fatalf("unproven root lost public capability ownership:\n%s", response.Code)
			}
		})
	}
}
