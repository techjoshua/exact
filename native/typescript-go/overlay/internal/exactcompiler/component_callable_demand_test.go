package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Ordinary exports do not create framework execution roots. This includes the
// original setter journey and an identical, unused helper; neither needs staged
// value/Call closure merely to preserve its ordinary TypeScript implementation.
func TestPublicOrdinaryCallablePassThrough(t *testing.T) {
	source := nestedReceiverOriginalSource + "\n" + strings.Replace(nestedReceiverOriginalSource, "export function run(", "export function neverCalled(", 1)
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/ordinary-callables.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("ordinary module rejected: %s %#v", r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Components) != 0 || len(r.Analysis.Tasks) != 0 {
				t.Fatal("ordinary declarations became framework work", r.Analysis.Components, r.Analysis.Tasks)
			}
			getters, setters := 0, 0
			file := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/ordinary-output.ts", Path: tspath.Path("/ordinary-output.ts")}, r.Code, core.ScriptKindTS)
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsGetAccessorDeclaration(n) {
					getters++
				}
				if ast.IsSetAccessorDeclaration(n) {
					setters++
				}
				return true
			})
			if getters != 4 || setters != 2 {
				t.Fatalf("ordinary accessor bodies changed: getters=%d setters=%d", getters, setters)
			}
		})
	}
}

// The SAME helper becomes demanded when a real client task invokes it. The
// browser helper is an independently observable transitive donor: dropping all
// helpers cannot pass just because the caller syntactically writes result.
func TestPublicComponentDemandsOrdinaryHelper(t *testing.T) {
	testRoot, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	testID := filepath.Join(testRoot, "component-helper.tsx")
	source := `import{TaskContext,type Component}from'@exactjs/core';` + nestedReceiverOriginalSource + `
 function browserDonor(){void document.title}
 ` + strings.Replace(nestedReceiverOriginalSource, "export function run(", "export function neverCalled(", 1) + `
 export function Page(this:Component<{fail:boolean;result:number}>){
  this.state.fail=false;this.state.result=0;const dormant=neverCalled;void dormant;
  const invoke=(task:TaskContext=TaskContext.client().latest().blocking())=>{
   void task;browserDonor();const out=run(this.state.fail);
   this.state.result=('value'in out?out.value:-1)??-1;
  };
  return()=> <button onClick={()=>invoke()}>{this.state.result}</button>;
 }`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			// Reuse the public Session after a no-consumer inventory. A later
			// component use must not reuse an unextracted/neutral helper summary.
			warmup := session.Execute(Request{Kind: "compile", ID: testID, Source: nestedReceiverOriginalSource, Target: target, Diagnostics: "semantic"})
			if warmup.Error != "" || hasErrorDiagnostic(warmup.Diagnostics) {
				t.Fatalf("ordinary inventory warmup failed: %s %#v", warmup.Error, warmup.Diagnostics)
			}
			r := session.Execute(Request{Kind: "compile", ID: testID, Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("demanded helper rejected: %s %#v", r.Error, r.Diagnostics)
			}
			var work *Task
			for i := range r.Analysis.Tasks {
				if r.Analysis.Tasks[i].Component == "Page" && r.Analysis.Tasks[i].RequestedPlacement == "client" {
					work = &r.Analysis.Tasks[i]
				}
			}
			if work == nil || work.Placement != "client" || work.Concurrency != "latest" || work.Readiness != "blocking" || !work.BrowserEffects {
				t.Fatal("task policy or transitive browser donor missing", r.Analysis.Tasks)
			}
			read, write := false, false
			for _, e := range work.Reads {
				read = read || e.Path == "fail" || e.Path == "*"
			}
			for _, e := range work.Writes {
				write = write || e.Path == "result" || e.Path == "*"
			}
			if !read || !write || len(r.Analysis.Components) != 1 || len(r.Analysis.Continuations) != 0 {
				t.Fatal("task dependency/ownership contract lost", work, r.Analysis.Components, r.Analysis.Continuations)
			}
			renderRead := false
			render := strings.Index(source, "return()=> <button")
			for _, e := range r.Analysis.StateReads {
				renderRead = renderRead || e.Component == "Page" && e.Start >= render && len(e.Path) > 0 && e.Path[0] == "result"
			}
			if !renderRead {
				t.Fatal("render result consumer lost", r.Analysis.StateReads)
			}
			// Inspect the actual public collection, never install a synthetic graph or
			// receipt. Referenced helpers must be analyzed; unused copies must not be.
			called, unused := false, false
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					if fact.node.Name() == nil {
						continue
					}
					if fact.node.Name().Text() == "run" {
						called = called || fact.staged.ready
					}
					if fact.node.Name().Text() == "neverCalled" {
						unused = unused || fact.staged.ready || fact.staged.settled
					}
				}
			}
			if !called || unused {
				t.Fatalf("public demand routing: calledReady=%t unusedReady=%t", called, unused)
			}
		})
	}
}
