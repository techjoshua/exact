package exactcompiler

import (
	"strings"
	"testing"
)

// The ordinary public component owns the selected output. No caller identity or staged flag
// participates in choosing its finite DOM region.
func TestDirectCompiledComponentRegion(t *testing.T) {
	source := `import type {Component} from '@exactjs/core';
 export function Counter(this:Component<{count:number}>) {
  this.state.count=0;
  return () => (<button title={String(this.state.count)} onClick={()=>{this.state.count++}}>{this.state.count}</button>);
 }`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "direct-counter.tsx", Kind: "compile", Target: target, Source: source})
			if response.Error != "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			if response.Code == "" {
				t.Fatal("public component compile emitted no artifact")
			}
			if target == TargetClient {
				if !strings.Contains(response.Code, "attachExactCompiledDirectProgramComponent") || !strings.Contains(response.Code, "propertyWriter:") {
					t.Fatalf("fixed component did not select direct owned attachment and property updates:\n%s", response.Code)
				}
				for _, forbidden := range []string{"createPreparedRenderProgram", "createCompiledIntrinsicReceipt", "executeOpaqueOperation"} {
					if strings.Contains(response.Code, forbidden) {
						t.Errorf("selected fixed region retains %s", forbidden)
					}
				}
			} else if !strings.Contains(response.Code, "createPreparedServerRenderProgram") || strings.Contains(response.Code, "attachExactCompiledDirectProgramComponent") {
				t.Fatalf("paired SSR writer selection changed:\n%s", response.Code)
			}
		})
	}
}

// Saving a JSX value is an actual escape boundary. Its eager inputs and occurrence identity
// must not be replaced by a late direct-root construction merely because it is rendered once.
func TestSavedComponentRegionKeepsExistingComposition(t *testing.T) {
	response := NewSession().Execute(Request{ID: "saved-counter.tsx", Kind: "compile", Target: TargetClient, Source: `
 import type {Component} from '@exactjs/core';
 export function Saved(this:Component<{count:number}>) {
  this.state.count=0;
  const saved=<button title={String(this.state.count)}>{this.state.count}</button>;
  return()=>saved;
 }`})
	if response.Error != "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, "attachExactCompiledDirectProgramComponent") {
		t.Fatal("saved child acquired direct root authority")
	}
	if !strings.Contains(response.Code, "attachCompiled") && !strings.Contains(response.Code, "attachExactCompiledClientComponent") {
		t.Fatalf("saved component lost its original artifact:\n%s", response.Code)
	}
}
