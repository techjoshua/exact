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

// Reading the returned target runs the installed getter in the task's placement.
func TestComponentReturnedDescriptorGetter(t *testing.T) {
	const read = "(box as {value:string}).value.length"
	for _, row := range []struct {
		name, define, getter, use, placement string
		browser                              bool
	}{
		{"direct", "Object.defineProperty", "document.title", read, "server", true},
		{"alias", "define", "document.title", read, "server", true},
		{"client", "define", "document.title", read, "client", true},
		{"mixed", "define", "foreign() || document.title", read, "client", true},
		{"dormant", "Object.defineProperty", "document.title", "1", "server", false},
		{"neutral", "define", "'ready'", read, "server", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign():string;
const define=Object.defineProperty;
export function Page(this:Component<{value:number}>) {
 this.state.value=0;
 const run=(task:TaskContext=TaskContext.` + row.placement + `())=>{
  const box=` + row.define + `({},'value',{get(){return ` + row.getter + `}});
  this.state.value=` + row.use + `;
 };
 run();
 return()=> <output>{this.state.value}</output>;
}`
			target := TargetServer
			if row.placement == "client" {
				target = TargetClient
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: "returned-descriptor-" + row.name + ".tsx", Source: source, Target: target, Diagnostics: "semantic"})
			if row.browser && row.placement == "server" {
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "document") && r.Code == "" && r.Error == "" {
						return
					}
				}
				t.Fatal("missing server placement diagnostic naming getter donor", r.Error, r.Diagnostics)
			}
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal("component failed to emit", r.Error, r.Diagnostics)
			}
			if row.name == "dormant" && !strings.Contains(r.Code, "document.title") {
				t.Fatal("emitted task lost its dormant getter")
			}
			for _, task := range r.Analysis.Tasks {
				if task.FunctionDefined && task.BrowserEffects == row.browser && task.Placement == row.placement {
					if row.name == "mixed" {
						for _, effect := range task.EffectSources {
							if effect.Environment == "unknown" {
								return
							}
						}
						t.Fatal("missing unknown getter dependency", task.EffectSources)
					}
					return
				}
			}
			t.Fatal("missing task with expected getter effects and placement", r.Analysis.Tasks)
		})
	}
}

// Editing the key's binding or the read must retain the getter actually used by
// the client task, including writes through an alias of the inspected object.
func TestComponentComputedWriterGetterEffects(t *testing.T) {
	session := NewSession()
	for _, row := range []struct{ name, factory, key, install, read string }{
		{"installed", "", "Symbol.for(props.input)", "Object.defineProperty(box,'value',{get(){return {n:document.title.length}}});alias[key]={n:0};", "box.value"},
		{"descriptor through alias", "", "Symbol.for(props.input)", "Object.defineProperty(alias,'value',{get(){return {n:document.title.length}}});Object.defineProperty(box,key,{value:{n:0}});", "box.value"},
		{"descriptor same symbol", "", "Symbol.for(props.input)", "Object.defineProperty(alias,key,{get(){return {n:document.title.length}}});", "box[key]"},
		{"descriptor dynamic key", "", "props.key", "Object.defineProperty(alias,key,{get(){return {n:document.title.length}}});", "box.value"},
		{"disjoint cache write", "", "Symbol.for(props.input)", "const cache={data:0};function update(view:{data:number}){view.data=1}update(cache);Object.defineProperty(alias,'value',{get(){return {n:document.title.length}}});", "box.value"},
		{"nested dynamic donor", "", "props.key", "const nested={box};function write(){nested.box[key]={get n(){return document.title.length}}}write();", "nested.box.value"},
		{"same symbol", "", "Symbol.for(props.input)", "", "box[key]"},
		{"lexical shadow", "const Symbol={for(_:string){return 'value'}};", "Symbol.for(props.input)", "", "box.value"},
		{"dynamic key", "", "props.key", "", "box.value"},
	} {
		install := row.install
		if install == "" {
			install = "function write(){alias[key]={get n(){return document.title.length}}}write();"
		}
		source := `import {TaskContext,type Component} from '@exactjs/core';
` + row.factory + `export function Page(this:Component<{n:number}>,props:{input:string,key:string|symbol}){
 this.state.n=0;
 const run=(task:TaskContext=TaskContext.client())=>{
  const box:Record<PropertyKey,{n:number}>={};const alias=box;const key=` + row.key + `;
  ` + install + `this.state.n=` + row.read + `.n;
 };
 return()=> <button onClick={()=>run()}>{this.state.n}</button>;
}`
		r := session.Execute(Request{Kind: "compile", ID: "computed-writer-getter.tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].BrowserEffects {
			t.Fatalf("%s: missing getter effect on emitted task: %s %v %v", row.name, r.Error, r.Diagnostics, r.Analysis.Tasks)
		}
	}
}
