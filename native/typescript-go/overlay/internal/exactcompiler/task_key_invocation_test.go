package exactcompiler

import (
	"strings"
	"testing"
)

// Client reachability selects the facade diagnostic. A server executor may
// still use process.cwd(), and retaining a task alone never runs its key.
func TestServerTaskKeyAtClientInvocation(t *testing.T) {
	for _, c := range []struct {
		name, key, setup, event string
		reject                  bool
	}{
		{"node", "process.cwd()", "", "run('a')", true},
		{"alias", "process.cwd()", "const invoke=run;", "invoke('a')", true},
		{"server-caller", "process.cwd()", "async function submit(t:TaskContext=TaskContext.server()){return run('a')}", "submit()", false},
		{"dormant", "process.cwd()", "", "void run", false},
		{"portable", "label", "", "run('a')", false},
		{"literal", "'lane'", "", "run('a')", false},
		{"probe", "typeof process", "", "run('a')", false},
		{"shadow", "process.cwd()", "const process={cwd:()=> 'local'};", "run('a')", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := "import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){async function run(label:string,task:TaskContext=TaskContext.server().latest().key(" + c.key + ")){return label;}" + c.setup + "return()=> <button onClick={()=>" + c.event + "}>Run</button>;}"
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-key-invocation.tsx", Source: source, Target: target})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				count := 0
				for _, d := range r.Diagnostics {
					if d.Severity == "error" {
						if d.Code != "EXACT2001" || !strings.Contains(d.Message, "key uses a server-only resource") || d.Start != strings.Index(source, c.key) || d.Length != len(c.key) {
							t.Fatalf("%s: %#v", target, d)
						}
						count++
					}
				}
				if (count == 1) != c.reject || count > 1 || (r.Code == "") != c.reject {
					t.Fatalf("%s: %#v", target, r.Diagnostics)
				}
			}
		})
	}
}
