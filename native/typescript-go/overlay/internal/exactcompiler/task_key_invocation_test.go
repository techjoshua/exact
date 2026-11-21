package exactcompiler

import (
	"strings"
	"testing"
)

// Client reachability selects the facade diagnostic. A server executor may
// still use process.cwd(), and retaining a task alone never runs its key.
func TestServerTaskKeyAtClientInvocation(t *testing.T) {
	const clientConflict = "key uses a server-only resource"
	const serverConflict = "key uses a browser-only resource"
	for _, c := range []struct {
		name, key, setup, event, body, conflict string
	}{
		{"browser-key-server-body", "location.pathname", "", "run('a')", "return process.cwd();", ""},
		{"browser-body-and-key", "location.pathname", "", "run('a')", "return location.href;", "task requests server placement"},
		{"helper", "lane()", "function lane(){return location.pathname}", "run('a')", "return process.cwd();", ""},
		{"mixed", "location.pathname + process.cwd()", "", "run('a')", "", clientConflict},
		{"server-browser", "location.pathname", "async function submit(t:TaskContext=TaskContext.server()){return run('a')}", "submit()", "", serverConflict},
		{"node", "process.cwd()", "", "run('a')", "", clientConflict},
		{"alias", "process.cwd()", "const invoke=run;", "invoke('a')", "", clientConflict},
		{"server-caller", "process.cwd()", "async function submit(t:TaskContext=TaskContext.server()){return run('a')}", "submit()", "", ""},
		{"dormant", "process.cwd()", "", "void run", "", ""},
		{"portable", "label", "", "run('a')", "", ""},
		{"literal", "'lane'", "", "run('a')", "", ""},
		{"probe", "typeof process", "", "run('a')", "", ""},
		{"probe-call", "typeof process.cwd()", "", "run('a')", "", clientConflict},
		{"shadow", "process.cwd()", "const process={cwd:()=> 'local'};", "run('a')", "", ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			body := c.body
			if body == "" {
				body = "return label;"
			}
			source := "import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){async function run(label:string,task:TaskContext=TaskContext.server().latest().key(" + c.key + ")){" + body + "}" + c.setup + "return()=> <button onClick={()=>" + c.event + "}>Run</button>;}"
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-key-invocation.tsx", Source: source, Target: target})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				count := 0
				for _, d := range r.Diagnostics {
					if d.Severity == "error" {
						if d.Code != "EXACT2001" || (c.conflict == "" || !strings.Contains(d.Message, c.conflict)) {
							t.Fatalf("%s: %#v", target, d)
						}
						if (c.conflict == clientConflict || c.conflict == serverConflict) && (d.Start != strings.Index(source, c.key) || d.Length != len(c.key)) {
							t.Fatalf("%s: key span differs: %#v", target, d)
						}
						count++
					}
				}
				if (count == 1) != (c.conflict != "") || count > 1 || (r.Code == "") != (c.conflict != "") {
					t.Fatalf("%s: %#v", target, r.Diagnostics)
				}
			}
		})
	}
}
