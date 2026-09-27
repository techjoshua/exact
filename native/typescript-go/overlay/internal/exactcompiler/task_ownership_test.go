package exactcompiler

import (
	"strings"
	"testing"
)

func TestModuleTaskInvocationReportsMissingComponentOwnership(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "ownerless.tsx", Kind: "compile", Target: TargetClient,
		Source: `import {TaskContext, type Component} from '@exactjs/core';
   async function shared(task: TaskContext = TaskContext.server()) { return 'ready'; }
   export function Page(this: Component<{value: string}>) {
    this.state.value = '';
    return () => <button onClick={async () => { this.state.value = await shared(); }}>{this.state.value}</button>;
   }`,
	})
	found := strings.Contains(response.Error, "inside their owning component")
	for _, diagnostic := range response.Diagnostics {
		found = found || strings.Contains(diagnostic.Message, "inside their owning component")
	}
	if !found {
		t.Fatalf("expected component ownership diagnostic, got %#v", response)
	}
}

func TestObservedTaskKeepsReactiveSetupActivation(t *testing.T) {
	for _, placement := range []string{"client", "server"} {
		t.Run(placement, func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID: "observed-task.tsx", Kind: "compile", Target: TargetClient,
				Source: `import {TaskContext, taskStatus, type Component} from '@exactjs/core';
export function Search(this: Component<{query: string; result: string}>) {
 this.state.query = '';
 this.state.result = '';
 const search = async (query: string, task: TaskContext = TaskContext.` + placement + `()) => {
  this.state.result = await Promise.resolve(query);
 };
 void search(this.state.query);
 const status = taskStatus(search);
 return () => <button onClick={() => search('manual')}>{status.pending}:{this.state.result}</button>;
}`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if !strings.Contains(response.Code, "__exactActivateTask(this, search,") {
				t.Fatalf("status observation discarded the setup subscription:\n%s", response.Code)
			}
			if strings.Count(response.Code, `label: "search"`) != 1 {
				t.Fatalf("setup and event calls must share one task definition:\n%s", response.Code)
			}
		})
	}
}

func TestServerClientTaskStatusUsesIdleProjection(t *testing.T) {
	for _, source := range []struct{ imports, status string }{
		{`import { taskStatus as observe } from '@exactjs/core';`, "observe(load)"},
		{`import * as tasks from '@exactjs/core/tasks';`, "tasks.taskStatus(load, { key: recordKey() })"},
	} {
		response := NewSession().Execute(Request{
			ID: "server-client-status.tsx", Kind: "compile", Target: TargetServer,
			Source: `import {TaskContext, type Component} from '@exactjs/core';
` + source.imports + `
function recordKey() { return 'key'; }
export function Search(this: Component<{}>) {
 const load = async (task: TaskContext = TaskContext.client()) => { await Promise.resolve(); };
 const status = ` + source.status + `;
 return () => <span>{status.pendingCount}:{status.pending ? 'busy' : 'idle'}</span>;
}`,
		})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "pending: false") || !strings.Contains(response.Code, "pendingCount: 0") {
			t.Fatalf("client task status needs an idle server projection:\n%s", response.Code)
		}
		if strings.Contains(source.status, "recordKey") && !strings.Contains(response.Code, "key: recordKey()") {
			t.Fatalf("status options lost their evaluation:\n%s", response.Code)
		}
		if strings.Contains(response.Code, "bindTaskForHost") {
			t.Fatalf("idle server status must not create a client task owner:\n%s", response.Code)
		}
	}
}
