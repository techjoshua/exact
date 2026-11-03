package exactcompiler

import (
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Conditional library candidates cannot erase authored/lookup/foreign writes.
// Compare the existing fallback on the same bound AST, including its independent
// uncertainty and original effects, rather than assuming type-based native identity.
func TestSourceCalleeWriteWorkAlternatives(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"authored named-slot writer", `const box={run(){box.run=()=>{document.title}}};export function invoke(){box.run();box.run()}`},
		{"array method replacement", `const box:string[]=[];box.push=function authored(...values:string[]){document.title;return values.length};export function invoke(){box.push("value")}`},
		{"lookup writer", `const box={field:0,get run(){this.field++;document.title;return ()=>{}}};export function invoke(){box.run()}`},
		{"unrepresented getter return", `declare function foreign():()=>void;const box={get run(){document.title;return foreign()}};export function invoke(){box.run()}`},
		{"prototype mutation", `const box:string[]=[];Object.setPrototypeOf(box,{push(){document.title;return 0}});export function invoke(){box.push("value")}`},
		{"foreign mutation", `declare function foreign(value:unknown):void;const box:string[]=[];foreign(box);export function invoke(){box.push("value")}`},
		{"captured setter", `let selected=()=>{};const box={get run(){return selected},set other(value:()=>void){selected=value}};function install(){box.other=()=>{document.title}}declare function foreign(write:()=>void):void;foreign(install);export function invoke(){box.run()}`},
		{"mutually replacing methods", `const box={left(){box.right=()=>{document.title;return "new-right"};return "left"},right(){box.left=()=>{document.title;return "new-left"};return "right"}};export function invoke(){return box.left()+":"+box.right()}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				old := newSourceDependencyQuery(call, q.owner.checker, q.executable, q.effectOwner)
				old.calleeWriteWork = &sourceCalleeWriteWork{fallback: true}
				want, wantEffects := old.prepareInvocation(call, nil)
				got, gotEffects := q.prepareInvocation(call, nil)
				if !reflect.DeepEqual(candidatePublisherPayload(wantEffects), candidatePublisherPayload(gotEffects)) || !reflect.DeepEqual(candidatePublisherPayload(want.acquired), candidatePublisherPayload(got.acquired)) {
					t.Fatal("callee preparation lost original effects or independent uncertainty")
				}
				if len(want.acquired.values) != len(got.acquired.values) {
					t.Fatal("callee alternatives changed")
				}
				for i, value := range want.acquired.values {
					if value.node != got.acquired.values[i].node || !reflect.DeepEqual(value.path, got.acquired.values[i].path) || !reflect.DeepEqual(value.capture, got.acquired.values[i].capture) || !reflect.DeepEqual(want.acquired.callableScopes[i], got.acquired.callableScopes[i]) {
						t.Fatal("authored or conditional library alternative changed")
					}
				}
				if q.calleeWriteWork != nil || q.calleeWriteUse != nil || q.pendingCallee != nil {
					t.Fatal("effect inspection retained selection state")
				}
			})
		})
	}
}

// A source endpoint is not an equivalence proof for changed discovery domains
// or captured inputs. These transitions must refuse rather than drop an arm.
func TestSourceCalleeWriteRowContextRefusal(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){document.title}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		view := q.receiverWriteCandidates(call, nil)
		if len(view.dependencies) != 1 {
			t.Fatal("missing source use")
		}
		original := view.dependencies[0]
		for _, row := range []struct {
			name   string
			change func(*sourceMemberWriteDemand)
		}{
			{"source membership", func(d *sourceMemberWriteDemand) { d.sources = []*ast.SourceFile{ast.GetSourceFileOfNode(call)} }},
			{"read cut", func(d *sourceMemberWriteDemand) { cut := *d.cut; cut.use = call.Expression(); d.cut = &cut }},
			{"receiver bindings", func(d *sourceMemberWriteDemand) {
				d.scope = q.acquireCallableScope(sourceValueBindings{1: {{node: call}}}, &accessorCandidates{})
			}},
			{"reader bindings", func(d *sourceMemberWriteDemand) {
				cut := *d.cut
				cut.scope = q.acquireCallableScope(sourceValueBindings{1: {{node: call}}}, &accessorCandidates{})
				d.cut = &cut
			}},
		} {
			t.Run(row.name, func(t *testing.T) {
				work := &sourceCalleeWriteWork{owner: q, rows: make(map[sourceCalleeWriteSite]*sourceCalleeWriteRow)}
				work.add(q, original)
				work.add(q, original)
				if work.unknown || len(work.queue) != 1 {
					t.Fatal("unchanged unparameterized endpoint did not retain one row")
				}
				changed := original
				row.change(&changed)
				work.add(q, changed)
				if !work.unknown || len(work.queue) != 1 {
					t.Fatal("changed use was silently merged or expanded into contexts")
				}
			})
		}
	})
}

func TestSourceCalleeWriteExtraActiveAncestorFallback(t *testing.T) {
	const source = `const box={run(){document.title}};export function ancestor(){box.run()}export function invoke(){box.run()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		var ancestor *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && enclosingCallableNode(node) != nil && callableNameText(enclosingCallableNode(node).Name()) == "ancestor" {
				ancestor = node
			}
			return true
		})
		if ancestor == nil {
			t.Fatal("missing valid source ancestor")
		}
		q.active[ancestor] = true
		view := q.receiverWriteCandidates(call, nil)
		work := &sourceCalleeWriteWork{owner: q, rows: make(map[sourceCalleeWriteSite]*sourceCalleeWriteRow)}
		for _, demand := range view.dependencies {
			work.add(q, demand)
		}
		if !work.unknown {
			t.Fatal("unrepresented active ancestor became completed write inspection")
		}
		old := newSourceDependencyQuery(call, q.owner.checker, q.executable, q.effectOwner)
		old.active[ancestor] = true
		old.calleeWriteWork = &sourceCalleeWriteWork{fallback: true}
		want, wantEffects := old.prepareInvocation(call, nil)
		got, gotEffects := q.prepareInvocation(call, nil)
		if !reflect.DeepEqual(candidatePublisherPayload(wantEffects), candidatePublisherPayload(gotEffects)) || !reflect.DeepEqual(candidatePublisherPayload(want.acquired), candidatePublisherPayload(got.acquired)) || !reflect.DeepEqual(want.acquired.values, got.acquired.values) {
			t.Fatal("active-ancestor refusal lost known payload or alternatives")
		}
	})
}

// Independent callable regions share the array source relationship without
// changing actual call order or the exported ordinary module in either target.
func TestSourceCalleeWriteWorkEmitted(t *testing.T) {
	var source strings.Builder
	source.WriteString(`export const trace:string[]=[];`)
	for i := 0; i < 6; i++ {
		n := strconv.Itoa(i)
		source.WriteString(`export function run` + n + `(){trace.push('` + n + `')}`)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/callee-write-regions.ts", Source: source.String(), Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});for(let i=0;i<6;i++)out['run'+i]();assert.equal(out.trace.join(','),'0,1,2,3,4,5');out.run2();assert.equal(out.trace.join(','),'0,1,2,3,4,5,2');`)
		})
	}
}
