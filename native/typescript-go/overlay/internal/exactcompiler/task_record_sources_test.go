package exactcompiler

import (
	"strings"
	"testing"
)

// Lexically identical authored names must not merge durable task definitions.
// Anonymous setup work also exercises the source-producible unnamed index path.
func TestTaskRecordSourceInvariants(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		source := `import {TaskContext} from '@exactjs/core';`
		for _, component := range []string{"First", "Second", "Third"} {
			source += `export function ` + component + `(){function run(value:number,task:TaskContext=TaskContext.client()){return value;}run(1);return()=> <button onClick={()=>run(2)}>Run</button>;}`
		}
		r := NewSession().Execute(Request{Kind: "compile", ID: "record-names.tsx", Target: target, Diagnostics: "semantic", Source: source})
		if r.Error != "" || len(r.Diagnostics) != 0 {
			t.Fatalf("lexical task names rejected: %s %#v", r.Error, r.Diagnostics)
		}
		definitions := map[int]string{}
		ids := map[string]bool{}
		for _, task := range r.Analysis.Tasks {
			if previous, present := definitions[task.WorkStart]; present && previous != task.Component {
				t.Fatal("work identity crossed component ownership")
			}
			definitions[task.WorkStart] = task.Component
			ids[task.ID] = true
		}
		if len(definitions) != 3 || len(ids) != len(r.Analysis.Tasks) {
			t.Fatalf("task definitions merged: %#v", r.Analysis.Tasks)
		}
		anonymous := NewSession().Execute(Request{Kind: "compile", ID: "record-anonymous.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext} from '@exactjs/core';export function Page(){((task:TaskContext=TaskContext.client())=>{void task.signal;})();return()=> <output/>;}`})
		if anonymous.Error != "" || len(anonymous.Diagnostics) != 0 || len(anonymous.Analysis.Tasks) != 1 {
			t.Fatalf("anonymous setup task lost ownership: %s %#v", anonymous.Error, anonymous.Diagnostics)
		}
		if strings.Contains(anonymous.Code, "TaskContext.client()") {
			t.Fatal("declarative policy reached runtime execution")
		}
	}
}
