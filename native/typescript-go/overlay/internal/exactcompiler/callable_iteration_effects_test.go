package exactcompiler

import (
	"strings"
	"testing"
)

// The task executor sees effects at iteration, including sync fallback and
// accessor reads on yielded steps. Merely acquiring a generator cannot run it.
func TestTaskIterationPlacement(t *testing.T) {
	root, config := formsSourceFixture(t)
	const iterate = "for await (const item of rows) { break }"
	const generator = "async function* generate(){ try { yield 1 } finally { document.title } }"
	for _, row := range []struct {
		name, setup, task string
		browser           bool
	}{
		{"saved generator", generator, "const rows=generate();" + iterate, true},
		{"bypassed generator", generator, "if(false) { const rows=generate();" + iterate + " }", false},
		{"dead callback", "function invoke(f:()=>void){f()}", "if(false){invoke(()=>{document.title})}", false},
		{"after return", "function focus(){return document.title}", "return;focus()", false},
		{"after throw", "function focus(){return document.title}", "throw 1;focus()", false},
		{"unknown condition", "function focus(){return document.title}", "if(Math.random()){focus()}", true},
		{"dormant generator", generator, "void generate()", false},
		{"neutral generator", "async function* generate(){yield 1}", "const rows=generate();" + iterate, false},
		{"step", "const rows={ [Symbol.asyncIterator](){return {next:async()=>{document.title; return {done:true as const,value:0}}}} };", iterate, true},
		{"step value getter", "const rows={ [Symbol.asyncIterator](){return {next:async()=>({done:false as const,get value(){return document.title}})}} };", iterate, true},
		{"completed step skips value", "const rows={ [Symbol.asyncIterator](){return {next:async()=>({done:true as const,get value(){return document.title}})}} };", iterate, false},
		{"close", "const rows={ [Symbol.asyncIterator](){return {next:async()=>({done:false as const,value:0}),return:async()=>{document.title;return {done:true as const,value:0}}}} };", iterate, true},
		{"sync return only", "const rows={ [Symbol.iterator](){document.title;return {next:()=>({done:true as const,value:0})}} };", iterate, true},
		{"sync yield only", "const rows={ [Symbol.iterator](){return {next:()=>({done:false as const,value:1})}} };", iterate, false},
		{"sync yielded then getter", "const rows={ [Symbol.iterator](){return {next:()=>({done:false as const,value:{get then(){document.title;return undefined}}})}} };", iterate, true},
		{"plain sync skips then", "const rows={ [Symbol.iterator](){return {next:()=>({done:false as const,value:{get then(){document.title;return undefined}}})}} };", "for(const item of rows){break}", false},
		{"sync close value", "const rows={ [Symbol.iterator](){return {next:()=>({done:false as const,value:0}),return:()=>({done:true as const,value:{get then(){document.title;return undefined}}})}} };", iterate, true},
		{"async preferred", "const rows={ [Symbol.asyncIterator](){return {next:async()=>({done:true as const,value:0})}},[Symbol.iterator](){document.title;return {next:()=>({done:true as const,value:0})}} };", iterate, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import {TaskContext,type Component} from '@exactjs/core';" + row.setup + ";export function Page(this:Component<{}>){async function run(task:TaskContext=TaskContext.server()){" + row.task + "}return()=> <button onClick={()=>run()}>run</button>}"
			for _, target := range []Target{TargetClient, TargetServer} {
				r := formsCompileSource(t, root, config, source, target)
				browser := false
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Severity == "error" {
						if diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, "document") {
							t.Fatalf("%s: %s", target, diagnostic.Message)
						}
						browser = true
					}
				}
				if browser != row.browser || (r.Code == "") != row.browser {
					t.Fatalf("%s: expected browser conflict %v, got %v", target, row.browser, formsDiagnosticDetails(r.Diagnostics))
				}
			}
		})
	}
}

// A generator parameter keeps the original component receiver when the loop
// advances it. A stored generator does not publish an unexecuted mutation.
func TestTaskGeneratorWrite(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, task := range []struct {
		body   string
		writes int
	}{
		{"const rows=gen(this.state); for (const item of rows) {break}", 1},
		{"void gen(this.state)", 0},
	} {
		source := "import {TaskContext,type Component} from '@exactjs/core';function* gen(dst:{label:string}){dst.label='next';yield 1}export function Page(this:Component<{label:string}>){this.state.label='initial';async function work(task:TaskContext=TaskContext.server()){" + task.body + "}return()=> <button onClick={()=>work()}>{this.state.label}</button>}"
		for _, target := range []Target{TargetClient, TargetServer} {
			r := formsCompileSource(t, root, config, source, target)
			if r.Code == "" || len(r.Analysis.Tasks) != 1 {
				t.Fatalf("%s: %v", target, formsDiagnosticDetails(r.Diagnostics))
			}
			writes := r.Analysis.Tasks[0].Writes
			if len(writes) != task.writes || len(writes) != 0 && writes[0].Path != "label" {
				t.Fatalf("%s %s: %v", target, task.body, writes)
			}
		}
	}
}
