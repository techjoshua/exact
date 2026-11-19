package exactcompiler

import (
	"strings"
	"testing"
)

// This is the existing native component/task model: durable state, a derived
// input and an ordinary event callback. The task policy consumes stabilized
// callable effects rather than erasing a known donor beside runtime uncertainty.
const stagedFrameworkConsumerSource = `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign():void;
function observe(){window.name;foreign()}
export function Probe(this:Component<{value:number}>){
 this.state.value=0;
 const label=this.state.value+'!';
 const run=(task:TaskContext=TaskContext.client().latest())=>{observe();this.state.value+=1;return label};
 return()=> <button onClick={()=>run()}>{this.state.value}</button>;
}`

func TestStagedFrameworkSummaryConsumers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		if !t.Run(string(target), func(t *testing.T) {
			request := Request{Kind: "compile", ID: "staged-framework-consumer.tsx", Source: stagedFrameworkConsumerSource, Target: target, Diagnostics: "semantic"}
			response := NewSession().Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("public consumer compile", response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
			}
			known, unknown := false, false
			for _, source := range executableSummary(t, response, "observe").EffectSources {
				known = known || source.Environment == "browser"
				unknown = unknown || source.Environment == "unknown"
				if source.provenanceIncomplete {
					t.Fatal("supported runtime effect became compiler coverage debt", source)
				}
			}
			if !known || !unknown {
				t.Fatal("stabilized source summary lost a donor", known, unknown)
			}
			var selected *Task
			for i := range response.Analysis.Tasks {
				if !response.Analysis.Tasks[i].CompilerComputation {
					if selected != nil {
						t.Fatal("unexpected additional authored task")
					}
					selected = &response.Analysis.Tasks[i]
				}
			}
			if selected == nil || selected.Placement != "client" || selected.RequestedPlacement != "client" || selected.Concurrency != "latest" || !selected.BrowserEffects {
				t.Fatal("stabilized summary did not reach placement/policy", selected)
			}
			known, unknown = false, false
			for _, source := range selected.EffectSources {
				known = known || source.Environment == "browser"
				unknown = unknown || source.Environment == "unknown"
				if source.provenanceIncomplete {
					t.Fatal("task published unfinished compiler work", source)
				}
			}
			dependency, read, write := false, false, false
			for _, input := range selected.Dependencies {
				dependency = dependency || input.Source == "derived" && strings.TrimSpace(input.Path) == "label"
			}
			for _, effect := range selected.Reads {
				read = read || effect.Path == "value"
			}
			for _, effect := range selected.Writes {
				write = write || effect.Path == "value"
			}
			if !known || !unknown || !dependency || !containsString(selected.ReactiveDependencies, "label") || !read || !write || len(response.Analysis.Continuations) != 0 {
				t.Fatalf("lost independent effects/state/dependency or transported client task: known=%t unknown=%t dependency=%t read=%t write=%t task=%#v", known, unknown, dependency, read, write, selected)
			}

			// Policy denial still consumes the known browser donor even though
			// a separate runtime-unknown effect is represented in the summary.
			request.Source = strings.Replace(stagedFrameworkConsumerSource, "TaskContext.client()", "TaskContext.server()", 1)
			denied := NewSession().Execute(request)
			if denied.Error != "" || !containsDiagnosticCode(denied.Diagnostics, "EXACT2001") || denied.Code != "" {
				t.Fatal("browser donor failed to constrain server policy", denied.Error, frameworkConsumerDiagnostics(denied.Diagnostics))
			}

		}) {
			return
		}
	}
}

func frameworkConsumerDiagnostics(diagnostics []Diagnostic) []string {
	messages := make([]string, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		messages = append(messages, diagnostic.Code+": "+diagnostic.Message)
	}
	return messages
}
