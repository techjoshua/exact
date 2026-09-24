package exactcompiler

import (
	"strings"
	"testing"
)

func TestResumableOwnerKeepsElementCallbacksLexical(t *testing.T) {
	response := NewSession().Execute(Request{ID: "owned-elements.tsx", Kind: "compile", Target: TargetClient,
		ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `import { TaskContext, type Component } from '@exactjs/core';
export function Workspace(this: Component<{items: string[]; value: string}>) {
 this.state.items = ['one'];
 this.state.value = '';
 function save(value: string, task: TaskContext = TaskContext.server()) { return value; }
 const choose = async (value: string) => { this.state.value = await save(value); };
 return () => <section>{this.state.items.map(item => <button key={item} onClick={() => choose(item)}>{item}</button>)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if len(response.Analysis.Continuations) == 0 {
		t.Fatal("fixture must retain its server invocation")
	}
	if strings.Contains(response.Code, "Workspace_ExactClient_") {
		t.Fatalf("owner-local callback escaped into an independent island:\n%s", response.Code)
	}
	for _, symbol := range response.Analysis.Symbols {
		if symbol.Role == "client-island" {
			t.Fatalf("metadata advertised an unused element export: %#v", symbol)
		}
	}
}
