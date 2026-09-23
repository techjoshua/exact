package exactcompiler

import (
	"fmt"
	"testing"
)

func TestExplicitTaskReadinessSurvivesAwaitAndContinuationProjection(t *testing.T) {
	for _, readiness := range []string{"blocking", "nonblocking"} {
		for _, awaited := range []bool{false, true} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(fmt.Sprintf("%s/%t/%s", readiness, awaited, target), func(t *testing.T) {
					invocation := "void load()"
					if awaited {
						invocation = "await load()"
					}
					response := NewSession().Execute(Request{
						ID: "readiness.tsx", Kind: "compile", Target: target, ServerComponents: true,
						Source: `import {TaskContext, type Component} from '@exactjs/core';
       export function Page(this: Component<{value: string}>) {
        this.state.value = '';
        async function load(task: TaskContext = TaskContext.server().` + readiness + `()) { return 'done'; }
        return () => <button onClick={async () => { ` + invocation + `; this.state.value = 'clicked'; }}>{this.state.value}</button>;
       }`,
					})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					found := false
					for _, task := range response.Analysis.Tasks {
						if task.RequestedPlacement == "server" {
							found = true
							if task.Readiness != readiness {
								t.Fatalf("task readiness %s, expected %s", task.Readiness, readiness)
							}
							matched := false
							for _, continuation := range response.Analysis.Continuations {
								if continuation.TaskID == task.ID {
									matched = true
									if continuation.Readiness != readiness {
										t.Fatalf("continuation readiness %s, expected %s", continuation.Readiness, readiness)
									}
								}
							}
							if !matched {
								t.Fatal("missing task continuation")
							}
						}
					}
					if !found {
						t.Fatal("missing server task")
					}
				})
			}
		}
	}
}
