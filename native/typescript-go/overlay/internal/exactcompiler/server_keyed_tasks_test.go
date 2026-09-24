package exactcompiler

import (
	"strings"
	"testing"
)

func TestServerKeyedBranchReadsPlainDerivedValues(t *testing.T) {
	response := NewSession().Execute(Request{ID: "keyed-derived.tsx", Kind: "compile", Target: TargetServer,
		Source: `/** @exact pure */
function project(items: {id: string}[]) { return {legend: items}; }
export function Plot(props: {items: {id: string}[]}) {
 const presentation = project(props.items);
 return () => <section>{presentation.legend.length > 0 && <ul>{presentation.legend.map(item => <li key={item.id}>{item.id}</li>)}</ul>}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, "presentation.get(") {
		t.Fatalf("direct server derived values are ordinary values, including materialized branches:\n%s", response.Code)
	}
}

func TestServerKeyedInteractionUsesRequestLocalTasks(t *testing.T) {
	response := NewSession().Execute(Request{ID: "keyed-tasks.tsx", Kind: "compile", Target: TargetServer,
		Source: `import { TaskContext, type Component } from '@exactjs/core';
export function Workspace(this: Component<{revision: number; items: string[]}>) {
 this.state.revision = 0;
 this.state.items = [];
 function save(value: number, task: TaskContext = TaskContext.server()) { return Promise.resolve([String(value)]); }
 const refresh = async (revision: number) => { if (revision) this.state.items = await save(revision); };
 void refresh(this.state.revision);
 return () => <section>{this.state.items.map(item => <button key={item} onClick={() => this.state.revision++}>{item}</button>)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	for _, forbidden := range []string{"bindTaskForHost as", "activateTaskForHost as", "this.map("} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf("request-local server frame requires no durable task or list owner (%s):\n%s", forbidden, response.Code)
		}
	}
}
