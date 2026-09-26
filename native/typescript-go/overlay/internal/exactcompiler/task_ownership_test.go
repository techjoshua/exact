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
