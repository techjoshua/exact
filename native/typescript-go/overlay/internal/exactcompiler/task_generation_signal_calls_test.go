package exactcompiler

import (
	"strings"
	"testing"
)

// Publication and continuation frame identity survives signal inference, while ordinary
// cancellation-aware APIs still receive resource cleanup tied to the task's settlement.
func TestTaskGenerationSignals(t *testing.T) {
	for _, c := range []struct {
		name, imports, declarations, body string
		managed                           bool
	}{
		{"publication", `import {stageTaskMutation} from '@exactjs/core';`, "", `stageTaskMutation(task.signal,()=>{});`, false},
		{"publication-alias", `import {stageTaskMutation as stage} from '@exactjs/core';`, "", `stage(task.signal,()=>{});`, false},
		{"publication-namespace", `import * as core from '@exactjs/core';`, "", `core.stageTaskMutation(task.signal,()=>{});`, false},
		{"continuation", `import {dispatchComponentContinuation} from '@exactjs/core';`, "", `await dispatchComponentContinuation(this as never,'load',[],task.signal);`, false},
		{"await-frame", `import {taskAwait} from '@exactjs/core';`, "", `await taskAwait(task.signal,Promise.resolve(1));`, false},
		{"publication-finish", `import {publishTaskMutations,discardTaskMutations,takeTaskCollectionMutations} from '@exactjs/core';`, "", `publishTaskMutations(task.signal);discardTaskMutations(task.signal);takeTaskCollectionMutations(task.signal);`, false},
		{"ordinary-signal", "", `declare function consume(signal:AbortSignal):void;`, `consume(task.signal);`, true},
		{"same-spelling-control", "", `declare function stageTaskMutation(signal:AbortSignal,write:()=>void):void;`, `stageTaskMutation(task.signal,()=>{});`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "generation-signal.tsx", Target: target, Source: `import {TaskContext} from '@exactjs/core';` + c.imports + c.declarations + `export function Page(){const run=async(task:TaskContext=TaskContext.client().blocking())=>{` + c.body + `};run();return()=> <output/>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 || len(r.Analysis.Tasks) != 1 {
					t.Fatalf("source failed: %s %+v", r.Error, r.Diagnostics)
				}
				inferred := len(r.Analysis.Tasks[0].SignalCalls) > 0
				if inferred != c.managed {
					t.Fatalf("managed=%t want=%t: %+v\n%s", inferred, c.managed, r.Analysis.Tasks[0].SignalCalls, r.Code)
				}
				if !c.managed && strings.Contains(r.Code, "combineTaskSignal as") {
					t.Fatalf("generation signal replaced:\n%s", r.Code)
				}
			})
		}
	}
}
