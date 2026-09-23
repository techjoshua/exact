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
