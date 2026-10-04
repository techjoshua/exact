package exactcompiler

import (
	"testing"
)

// A task-table candidate must have a final, statically selected callable owner.
func TestSetupTaskCallableTableOwnership(t *testing.T) {
	for _, c := range []struct{ name, locals, call, expected string }{
		{"shorthand", "const actions={run};", "actions.run", "run"},
		{"literal-key", "const actions={['run']:run};", "actions['run']", "run"},
		{"destructured", "const actions={run};const {run:activate}=actions;", "activate", "run"},
		{"computed-binding", "const actions={run};const {['run']:activate}=actions;", "activate", "run"},
		{"nested-binding", "const actions={nested:{run}};const {nested:{run:activate}}=actions;", "activate", "run"},
		{"array-binding", "const actions=[run];const [activate]=actions;", "activate", "run"},
		{"array-prefix-spread", "const actions=[...other,run];const [,activate]=actions;", "activate", ""},
		{"array-later-spread", "const actions=[run,...other];const [activate]=actions;", "activate", "run"},
		{"array-hole", "const [,activate]=[,run];", "activate", "run"},
		{"omitted-member", "const [activate]=[,run];", "activate", ""},
		{"default-binding", "const {run:activate=plain}={run};", "activate", ""},
		{"rest-binding", "const {...actions}={run};", "actions.run", ""},
		{"alias", "const actions={run};const alias=actions;", "alias.run", "run"},
		{"last-owner", "const actions={run,run:plain};", "actions.run", "plain"},
		{"later-spread", "const actions={run,...other};", "actions.run", ""},
		{"earlier-spread", "const actions={...other,run};", "actions.run", "run"},
		{"unknown-key", "const actions={run,[key]:plain};", "actions.run", ""},
		{"accessor", "const actions={run,get run(){return plain}};", "actions.run", ""},
		{"alias-cycle", "const a=b;const b=a;", "a.run", ""},
		{"table-cycle", "const actions={run:actions.run};", "actions.run", ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := parseNormalizationSource(normalizationTestFile(t, "task-table.ts"), `function run(){return 1}function plain(){return 2}`+c.locals+`const selected=`+c.call+`;`)
			locals := setupTaskLocalAliases(source.Statements.Nodes)
			selected := resolveSetupTaskCallable(locals["selected"], locals, map[string]bool{})
			if c.expected == "" {
				if selected != nil {
					t.Fatal("uncertain callable selected")
				}
			} else if selected != locals[c.expected] {
				t.Fatalf("selected the wrong callable, expected %s", c.expected)
			}
		})
	}
}

// Ordinary helpers and shadowed policy providers keep native value semantics.
func TestSetupTaskResultCandidateControls(t *testing.T) {
	for _, c := range []struct {
		name, imports, parameters, body string
		expected                        bool
	}{
		{"explicit-task", `import {TaskContext} from '@exactjs/core';`, "", `function run(value:number,task:TaskContext=TaskContext.client()){return value}this.state.value=run(props.input);`, true},
		{"ordinary-helper", `import {TaskContext} from '@exactjs/core';`, "", `function run(value:number){return value}this.state.value=run(props.input);`, false},
		{"missing-provider", "", "", `function run(value:number){return value}this.state.value=run(props.input);`, false},
		{"shadowed-provider", `import {TaskContext} from '@exactjs/core';`, ",TaskContext:unknown", `function run(value:number){return value}this.state.value=run(props.input);`, false},
		{"root-replacement", `import {TaskContext} from '@exactjs/core';`, "", `function run(value:number,task:TaskContext=TaskContext.client()){return {value}}this.state=run(props.input);`, false},
		{"last-ordinary-owner", `import {TaskContext} from '@exactjs/core';`, "", `function run(value:number,task:TaskContext=TaskContext.client()){return value}function plain(value:number){return value}const actions={run,run:plain};this.state.value=actions.run(props.input);`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := parseNormalizationSource(normalizationTestFile(t, "task-result-candidate.ts"), c.imports+`export function Page(props:{input:number}`+c.parameters+`){`+c.body+`}`)
			component := source.Statements.Nodes[len(source.Statements.Nodes)-1]
			statements := component.Body().AsBlock().Statements.Nodes
			selected := setupTaskResultAssignments(source, component, statements)
			if selected[statements[len(statements)-1]] != c.expected {
				t.Fatal("task result candidate changed ordinary helper or policy ownership")
			}
		})
	}
}
