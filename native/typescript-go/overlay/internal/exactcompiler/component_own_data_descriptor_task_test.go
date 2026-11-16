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

// Exercise an ordinary descriptor installation inside a real public component
// task. Conservative MAY dependencies suffice; no staged closure is inspected.
func TestPublicComponentOwnDataDescriptorTask(t *testing.T) {
	testRoot, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	testID := filepath.Join(testRoot, "own-data-descriptor-task.tsx")
	for _, c := range []struct {
		name, descriptor string
		getter           bool
	}{
		{"data", "{value:1,enumerable:true}", false},
		{"getter", "{get(){void document.title;return 1},enumerable:true}", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{count:number;result:number}>){
 this.state.count=0;this.state.result=0;
 const run=(task:TaskContext=TaskContext.client().latest().blocking())=>{
  void task;
  const target={value:0};
  Object.defineProperty(target,'value',` + c.descriptor + `);
  this.state.count+=target.value;
  this.state.result=this.state.count;
 };
 return()=> <button onClick={()=>run()}>{this.state.count}:{this.state.result}</button>;
}`
			r := NewSession().Execute(Request{Kind: "compile", ID: testID, Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("public descriptor component rejected: %s %#v", r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Components) != 1 || len(r.Analysis.Continuations) != 0 {
				t.Fatal("component/transport ownership changed", r.Analysis.Components, r.Analysis.Continuations)
			}
			var task *Task
			for i := range r.Analysis.Tasks {
				if r.Analysis.Tasks[i].Component == "Page" && r.Analysis.Tasks[i].RequestedPlacement == "client" {
					if task != nil {
						t.Fatal("duplicate client task")
					}
					task = &r.Analysis.Tasks[i]
				}
			}
			if task == nil || task.Placement != "client" || task.Concurrency != "latest" || task.Readiness != "blocking" {
				t.Fatal("client task policy lost", r.Analysis.Tasks)
			}
			readCount, writeCount, writeResult := false, false, false
			for _, e := range task.Reads {
				readCount = readCount || e.Path == "count" || e.Path == "*"
			}
			for _, e := range task.Writes {
				writeCount = writeCount || e.Path == "count" || e.Path == "*"
				writeResult = writeResult || e.Path == "result" || e.Path == "*"
			}
			if !readCount || !writeCount || !writeResult {
				t.Fatal("task state dependency lost", task.Reads, task.Writes)
			}
			if c.getter && !task.BrowserEffects {
				t.Fatal("invoked authored descriptor getter lost browser effect")
			}
			render := strings.Index(source, "return()=> <button")
			countRead, resultRead := false, false
			for _, e := range r.Analysis.StateReads {
				if e.Component == "Page" && e.Start >= render && len(e.Path) > 0 {
					countRead = countRead || e.Path[0] == "count"
					resultRead = resultRead || e.Path[0] == "result"
				}
			}
			if !countRead || !resultRead {
				t.Fatal("render lost task state consumers", r.Analysis.StateReads)
			}
			output := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/descriptor-output.ts", Path: tspath.Path("/descriptor-output.ts")}, r.Code, core.ScriptKindTS)
			installations := 0
			walkNode(output.AsNode(), func(n *ast.Node) bool {
				if !ast.IsCallExpression(n) {
					return true
				}
				call := n.AsCallExpression()
				callee := call.Expression
				if !ast.IsPropertyAccessExpression(callee) || callee.AsPropertyAccessExpression().Name().Text() != "defineProperty" {
					return true
				}
				args := call.Arguments
				if args == nil || len(args.Nodes) != 3 || !ast.IsObjectLiteralExpression(args.Nodes[2]) {
					t.Fatal("emitted descriptor installation shape lost")
				}
				hasValue, hasGetter, hasEnumerable := false, false, false
				for _, property := range args.Nodes[2].AsObjectLiteralExpression().Properties.Nodes {
					if property.Name() != nil {
						switch property.Name().Text() {
						case "value":
							hasValue = true
						case "get":
							hasGetter = true
						case "enumerable":
							hasEnumerable = true
						}
					}
				}
				if !hasEnumerable || hasGetter != c.getter || hasValue == c.getter {
					t.Fatal("emitted descriptor kind changed", c.name)
				}
				installations++
				return true
			})
			if installations != 1 {
				t.Fatal("ordinary descriptor installation missing or duplicated", installations)
			}
		})
	}
}
