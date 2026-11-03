package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Emission retains default-input evaluation before the getter body and prevents
// a throwing input from entering the body or the caller's property default.
func TestSourceGetterDefaultEmittedOrder(t *testing.T) {
	const source = `export function run(fail=false){const events:string[]=[];function input(){events.push("input");if(fail)throw 9;return {x:"ignored"}}const box:{value?:string}={};Object.defineProperty(box,"value",{get({x}=input()){events.push("get");return "safe"}});function take({value=(()=>{events.push("default");return "wrong"})()}:{value?:string}){return value}try{return {value:take(box),events}}catch(error){return {error,events}}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/getter-default-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "order.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const{run}=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(run(),{value:'safe',events:['input','get']});assert.deepEqual(run(true),{error:9,events:['input']});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("emitted getter default: %v %s", err, output)
			}
		})
	}
}

// Descriptor getter defaults are executed with zero supplied arguments. Their
// unknown inputs remain effects, while the getter's own return supplies the value.
func TestSourceGetterDefaultValueEffects(t *testing.T) {
	for _, row := range []struct {
		name, getter string
		browser      bool
	}{
		{"unused-input", `get(value=foreign()){return "safe"}`, false},
		{"unused-pattern", `get({x}:{x:string}=foreign()){return "safe"}`, false},
		{"returned-pattern", `get({x}:{x:string}=foreign()){return x}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():{x:string};const box:{value?:string}={};Object.defineProperty(box,"value",{` + row.getter + `});function take({value=document.title}:{value?:string}){return value}export const value=take(box);`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/getter-default.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser, unknown := reentrantInitializerEffects(t, r, source, true)
			if browser != row.browser || !unknown {
				t.Fatalf("browser=%v unknown=%v, want %v true", browser, unknown, row.browser)
			}
		})
	}
}

// A known selected return cannot erase earlier caller uncertainty. An output-only
// observer cannot enter the wrapper or borrow a body result to fill that gap.
func TestSourceGetterPriorUncertaintyAndRefusal(t *testing.T) {
	const source = `const box={get value(){return "safe"}};export const value=box.value;`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/get-value-effect.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, p := range session.projects {
		if p.callableCache == nil {
			continue
		}
		var body, receiver, operation *ast.Node
		walkNode(p.program.GetSourceFile("/virtual/get-value-effect.ts").AsNode(), func(n *ast.Node) bool {
			if ast.IsGetAccessorDeclaration(n) {
				body = n
				receiver = n.Parent
			}
			if ast.IsPropertyAccessExpression(n) {
				operation = n
			}
			return true
		})
		if body == nil || receiver == nil || operation == nil {
			t.Fatal("missing original Get")
		}
		owner := p.callableCache.owner
		newQuery := func() *sourceValueQuery { return newSourceDependencyQuery(operation, owner.values.checker, owner, nil) }
		get := &sourceGetInputs{operation: operation, receiver: sourceValue{node: receiver}}
		scope := acquiredCallableScope{bindings: make(sourceValueBindings)}
		q := newQuery()
		prior := accessorCandidates{valueIncomplete: true}
		observed := q.acquireGetResult(body, get, scope, &prior)
		if !prior.valueIncomplete || observed.incomplete || len(observed.values) != 1 {
			t.Fatal("known return erased prior uncertainty or lost its value")
		}
		q = newQuery()
		q.operation = &sourceOperationContext{node: operation, outputOnly: true}
		refused := accessorCandidates{}
		observed = q.acquireGetResult(body, get, scope, &refused)
		if !refused.valueIncomplete || len(observed.values) != 0 || len(refused.effects) != 0 {
			t.Fatal("refused wrapper acquired a body or output")
		}
		return
	}
	t.Fatal("missing project")
}
