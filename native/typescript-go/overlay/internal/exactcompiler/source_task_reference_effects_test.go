package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const taskReferenceEffectsSource = `import{TaskContext,type Component}from'@exactjs/core';
declare function foreign():void;
export function Probe(this:Component<{value:number}>,props:{initial:number}){
 this.state.value=0;
 const prepare=(_task:TaskContext=TaskContext.client().latest())=>{window.name;foreign();this.state.value=props.initial};
 prepare();
 return()=> <p>{this.state.value}</p>;
}`

// This public entry retains the task's body/capture MAY obligations instead of
// completing closure DATA to reach task planning. Repeated requests use the
// same production graph reconstruction; no cached fact is resolved by the test.
func TestTaskReferenceEffectsConsumers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			request := Request{Kind: "compile", ID: "task-reference-effects.tsx", Source: taskReferenceEffectsSource, Target: target, Diagnostics: "semantic"}
			var oldFact *callableFacts
			var oldReference sourceTaskEffectsReference
			for attempt := 0; attempt < 2; attempt++ {
				response := session.Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal("original task Effects consumer", attempt, response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
				}
				summary := executableSummary(t, response, "prepare")
				known, unknown, capture := false, false, false
				for _, effect := range summary.EffectSources {
					known = known || effect.Environment == "browser"
					unknown = unknown || effect.Environment == "unknown" && !effect.provenanceIncomplete
					if origin := effect.fieldOrigin; origin != nil && origin.operation != nil {
						capture = capture || strings.TrimSpace(sourceText(ast.GetSourceFileOfNode(origin.operation), origin.operation)) == "props.initial"
					}
				}
				write := false
				for _, effect := range summary.StateWrites {
					write = write || effect.Path == "value"
				}
				if !known || !unknown || !capture || !write {
					t.Fatal("task body/capture source was discarded", known, unknown, capture, write, summary)
				}
				if len(response.Analysis.Tasks) != 1 || response.Analysis.Tasks[0].Placement != "client" || response.Analysis.Tasks[0].Concurrency != "latest" {
					t.Fatal("task owner/policy changed", response.Analysis.Tasks)
				}
				oldFact, oldReference = assertTaskReferenceEffectsDescription(t, session)
			}
			request.Source = strings.Replace(taskReferenceEffectsSource, "TaskContext.client()", "TaskContext.server()", 1)
			denied := session.Execute(request)
			if denied.Error != "" || !containsDiagnosticCode(denied.Diagnostics, "EXACT2001") || denied.Code != "" {
				t.Fatal("body browser effect lost policy authority", denied.Error, frameworkConsumerDiagnostics(denied.Diagnostics))
			}
			for _, project := range session.projects {
				if project.callableCache != nil {
					if _, valid := describeTaskEffectsReference(oldFact, oldReference.call, project.callableCache.owner); valid {
						t.Fatal("old program description survived actual source replacement")
					}
				}
			}
		})
	}
}

func assertTaskReferenceEffectsDescription(t *testing.T, session *Session) (*callableFacts, sourceTaskEffectsReference) {
	t.Helper()
	found := false
	var originalFact *callableFacts
	var originalReference sourceTaskEffectsReference
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for caller := range facts {
			fact := &facts[caller]
			for _, edge := range fact.summary.Calls {
				if !strings.HasPrefix(edge.ID, fact.summary.ID+":task-effects:") {
					continue
				}
				call := fact.fieldEdgeOperations[edge.ID]
				reference, valid := describeTaskEffectsReference(fact, call, project.callableCache.owner)
				if !valid || !edge.Resolved {
					t.Fatal("original immutable task description lost", edge)
				}
				found = true
				originalFact, originalReference = fact, reference
				for _, use := range fact.staged.operationUses {
					if use.request.producer.operation == reference.read {
						t.Fatal("Effects-only decision acquired closure DATA")
					}
				}
				// A retained description cannot revive the original collector publisher.
				work := callableEffectWork{extracting: caller}
				if work.ownTaskReferenceEffects(facts, caller, reference, project.callableCache.owner) != sourceTaskEffectsUnowned {
					t.Fatal("expired publisher accepted a task Effects decision")
				}
			}
		}
	}
	if !found {
		t.Fatal("original task reference Effects edge missing")
	}
	return originalFact, originalReference
}

// Scope decisions are checked from original compiler-owned nodes after a normal
// public request. Description inspection supplies no current graph authority.
func TestTaskReferenceEffectsBoundaries(t *testing.T) {
	for _, row := range []struct{ name, definition, call string }{
		{"ordinary", `const prepare=()=>{this.state.value=props.initial};`, `prepare();`},
		{"ordinary-default", `const prepare=(value=props.initial,_task:TaskContext=TaskContext.client())=>{this.state.value=value};`, `prepare();`},
		{"argument", `const prepare=(_task:TaskContext=TaskContext.client())=>{};`, `prepare(undefined);`},
		{"result", `const prepare=(_task:TaskContext=TaskContext.client())=>props.initial;`, `const result=prepare();void result;`},
		{"alias", `const original=(_task:TaskContext=TaskContext.client())=>{};const prepare=original;`, `prepare();`},
		{"written", `let prepare=(_task:TaskContext=TaskContext.client())=>{};prepare=()=>{};`, `prepare();`},
		{"mixed", `const prepare=props.flag?((_task:TaskContext=TaskContext.client())=>{}):(()=>{});`, `prepare();`},
		{"policy-argument", `const prepare=(_task:TaskContext=TaskContext.client(1))=>{};`, `prepare();`},
		{"shadow", `const TaskContext={client:()=>({})};const prepare=(_task:unknown=TaskContext.client())=>{};`, `prepare();`},
		{"event", `const prepare=(_task:TaskContext=TaskContext.client())=>{};`, `return()=> <button onClick={()=>prepare()}>go</button>;`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import{TaskContext,type Component}from'@exactjs/core';export function Probe(this:Component<{value:number}>,props:{initial:number;flag:boolean}){this.state.value=0;` + row.definition + row.call + `return()=> <p/>;}`
			session := NewSession()
			session.Execute(Request{Kind: "analyze", ID: "task-reference-" + row.name + ".tsx", Source: source, Diagnostics: "syntax"})
			calls := 0
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					if !ast.IsFunctionLike(fact.node) || fact.node.Body() == nil {
						continue
					}
					walkNode(fact.node.Body(), func(node *ast.Node) bool {
						if node != fact.node.Body() && ast.IsFunctionLike(node) {
							return false
						}
						if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "prepare" {
							calls++
							if _, valid := describeTaskEffectsReference(&fact, node, project.callableCache.owner); valid {
								t.Fatal("excluded call acquired task Effects ownership", row.name)
							}
						}
						return true
					})
				}
			}
			if calls == 0 {
				t.Fatal("original boundary Call not inspected", row.name)
			}
		})
	}
}
