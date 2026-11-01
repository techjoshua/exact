package exactcompiler

import (
	"strings"
	"testing"
)

func TestDetachedServerDefinitionAdvisory(t *testing.T) {
	for _, row := range []struct {
		name, imports, before, setup, render string
		count                                int
	}{
		{"unused", "", "", `async function run(task:TaskContext=TaskContext.server().detached()){return 1;}`, `<p>ready</p>`, 1},
		{"arrow", "", "", `const run=async(task:TaskContext=TaskContext.server().detached())=>1;`, `<p>ready</p>`, 1},
		{"repeated", "", "", `async function run(task:TaskContext=TaskContext.server().detached()){return 1;}run();run();`, `<button onClick={()=>run()}>run</button>`, 1},
		{"referenced", "", "", `async function run(task:TaskContext=TaskContext.server().detached()){return 1;}`, `<button onClick={run}>run</button>`, 1},
		{"nested", "", "", `async function outer(task:TaskContext=TaskContext.server().detached()){async function inner(task:TaskContext=TaskContext.server().detached()){return 1;}return 2;}`, `<p>ready</p>`, 2},
		{"alias", `import {TaskContext as Policy,type Component} from '@exactjs/core';`, "", `const run=async(task:Policy=Policy.server().detached())=>1;`, `<p>ready</p>`, 1},
		{"namespace", `import * as core from '@exactjs/core';import type {Component} from '@exactjs/core';`, "", `const run=async(task:core.TaskContext=core.TaskContext.server().detached())=>1;`, `<p>ready</p>`, 1},
		{"client", "", "", `async function run(task:TaskContext=TaskContext.client().detached()){return 1;}`, `<p>ready</p>`, 0},
		{"attached", "", "", `async function run(task:TaskContext=TaskContext.server()){return 1;}`, `<p>ready</p>`, 0},
		{"inferred", "", "", `async function run(){return 1;}`, `<p>ready</p>`, 0},
		{"module", "", `async function outside(task:TaskContext=TaskContext.server().detached()){return 1;}`, "", `<p>ready</p>`, 0},
		{"ambient", "", `declare function outside(task:TaskContext):void;`, "", `<p>ready</p>`, 0},
		{"shadow", "", "", `const TaskContext={server:()=>({detached:()=>0})};const run=(task=TaskContext.server().detached())=>1;`, `<p>ready</p>`, 0},
		{"lookalike", "", "", `const Policy={server:()=>({detached:()=>0})};const run=(task=Policy.server().detached())=>1;`, `<p>ready</p>`, 0},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				imports := row.imports
				if imports == "" {
					imports = `import {TaskContext,type Component} from '@exactjs/core';`
				}
				source := imports + row.before + `export function Page(this:Component<{}>){` + row.setup + `return()=>` + row.render + `;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "detached-advisory.tsx", Source: source, Target: target})
				count := 0
				for _, d := range response.Diagnostics {
					if d.Code == "EXACT2004" {
						count++
						if d.Severity != "warning" || d.Length <= 0 || !strings.Contains(source[d.Start:d.Start+d.Length], "detached()") {
							t.Fatalf("bad authored diagnostic: %#v", d)
						}
					} else if d.Severity == "error" {
						t.Fatalf("unexpected error: %#v", d)
					}
				}
				if (row.name == "unused" || row.name == "arrow") && len(response.Analysis.Tasks) != 0 {
					t.Fatalf("advisory registered unused work: %#v", response.Analysis.Tasks)
				}
				if response.Error != "" || count != row.count {
					t.Fatalf("expected %d advisories got %d: %s %#v", row.count, count, response.Error, response.Diagnostics)
				}
			})
		}
	}
}

func TestDetachedServerAdvisoryAcknowledgment(t *testing.T) {
	for _, row := range []struct {
		name, comment     string
		warnings, invalid int
	}{
		{"bare", `/** @exact ignore=EXACT2004 */`, 0, 0},
		{"double", `/** @exact ignore="EXACT2004" */`, 0, 0},
		{"single", `// @exact ignore='EXACT2004'` + "\n", 0, 0},
		{"wrong", `/** @exact ignore=EXACT9999 */`, 1, 0},
		{"error-code", `/** @exact ignore=EXACT2001 */`, 1, 0},
		{"missing", `/** @exact ignore */`, 1, 1},
		{"empty", `/** @exact ignore= */`, 1, 1},
		{"wildcard", `/** @exact ignore=* */`, 1, 1},
		{"list", `/** @exact ignore=EXACT2004,EXACT2001 */`, 1, 1},
		{"suffix", `/** @exact ignore=EXACT2004-invalid */`, 1, 1},
		{"quoted-suffix", `/** @exact ignore="EXACT2004"suffix */`, 1, 1},
		{"single-quoted-suffix", `/** @exact ignore='EXACT2004'suffix */`, 1, 1},
		{"letter-suffix", `/** @exact ignore=EXACT2004A */`, 1, 1},
		{"quoted-empty", `/** @exact ignore='' */`, 1, 1},
		{"namespaced", `/** @exact custom.ignore=EXACT2004 */`, 1, 1},
		{"other-directive", `/** @exact pure */`, 1, 0},
		{"no-digits", `/** @exact ignore=EXACT */`, 1, 1},
		{"other-code", `/** @exact ignore=TS1234 */`, 1, 1},
	} {
		for _, arrow := range []bool{false, true} {
			t.Run(row.name+map[bool]string{true: "/arrow", false: "/declaration"}[arrow], func(t *testing.T) {
				work := `async function run(task:TaskContext=TaskContext.server().detached()){return 1;}`
				if arrow {
					work = `const run=async(task:TaskContext=TaskContext.server().detached())=>1;`
				}
				source := `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){` + row.comment + work + `return()=> <p>ready</p>;}`
				response := NewSession().Execute(Request{Kind: "analyze", ID: "acknowledgment.tsx", Source: source})
				warnings, invalid := 0, 0
				for _, d := range response.Diagnostics {
					if d.Code == "EXACT2004" {
						warnings++
					}
					if d.Code == "EXACT1001" {
						invalid++
					}
				}
				if warnings != row.warnings || invalid != row.invalid {
					t.Fatalf("expected %d/%d got %d/%d: %#v", row.warnings, row.invalid, warnings, invalid, response.Diagnostics)
				}
			})
		}
	}
	for _, setup := range []string{
		`/** @exact ignore=EXACT2004 */ const other=1; async function run(task:TaskContext=TaskContext.server().detached()){return 1;}`,
		`async function run(task:TaskContext=TaskContext.server().detached()){/** @exact ignore=EXACT2004 */ return 1;}`,
		`async function run(task:TaskContext=TaskContext.server().detached()){return 1;} /** @exact ignore=EXACT2004 */ run();`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "unrelated.tsx", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){` + setup + `return()=> <p>ready</p>;}`})
		count := 0
		for _, d := range response.Diagnostics {
			if d.Code == "EXACT2004" {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("unrelated comment hid definition: %#v", response.Diagnostics)
		}
	}
}

func TestDetachedServerAdvisoryErrorsAndParentAttachment(t *testing.T) {
	for _, body := range []string{`document.title='unsafe';`, `return 1;`} {
		policy := `TaskContext.server().detached()`
		if body == `return 1;` {
			policy = `TaskContext.server().client().detached()`
		}
		source := `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{}>){/** @exact ignore=EXACT2004 */ async function run(task:TaskContext=` + policy + `){` + body + `}run();return()=> <p>ready</p>;}`
		response := NewSession().Execute(Request{Kind: "compile", ID: "unsafe-detached.tsx", Source: source, Target: TargetServer})
		errors := 0
		for _, d := range response.Diagnostics {
			if d.Severity == "error" {
				errors++
			}
			if d.Code == "EXACT2004" {
				t.Fatal("valid acknowledgment failed")
			}
		}
		if errors == 0 {
			t.Fatalf("advisory acknowledgment hid error: %#v", response)
		}
	}
	source := `import {TaskContext,type Component} from '@exactjs/core';/** @exact ignore=EXACT2004 */ export function Page(this:Component<{}>){async function run(task:TaskContext=TaskContext.server().detached()){return 1;}return()=> <p>ready</p>;}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "parent-comment.tsx", Source: source})
	count := 0
	for _, d := range response.Diagnostics {
		if d.Code == "EXACT2004" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("parent comment hid nested advisory: %#v", response.Diagnostics)
	}
}
