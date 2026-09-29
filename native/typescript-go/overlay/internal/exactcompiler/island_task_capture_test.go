package exactcompiler

import (
	"strings"
	"testing"
)

func TestIslandTaskCapturePreservesEveryFunctionForm(t *testing.T) {
	for _, declaration := range []string{
		`async function save(value: string, task: TaskContext = TaskContext.client().latest()) { BODY }`,
		`const save = async (value: string, task: TaskContext = TaskContext.client().latest()) => { BODY };`,
		`const save = async function(value: string, task: TaskContext = TaskContext.client().latest()) { BODY };`,
	} {
		declaration = strings.ReplaceAll(declaration, "BODY", `task.optimistic(() => { this.state.value = value; }); try { await navigator.clipboard.writeText(value); } catch { this.state.value = ""; }`)
		response := NewSession().Execute(Request{ID: "capture.tsx", Kind: "compile", Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: `
import {TaskContext, type Component} from '@exactjs/core';
export function Probe(this: Component<{value:string}>) {
 this.state.value = '';
 ` + declaration + `
 return () => <section><button onClick={() => save('next')}>Save</button><output>{this.state.value}</output></section>;
}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("%s: %s %#v", declaration, response.Error, response.Diagnostics)
		}
		if strings.Contains(response.Code, "TaskContext.client()") || !strings.Contains(response.Code, `concurrency: "latest"`) || !strings.Contains(response.Code, "__exactTaskMutation") {
			t.Fatalf("Captured task lost its compiled policy or mutation fence: %s\n%s", declaration, response.Code)
		}
	}
}
