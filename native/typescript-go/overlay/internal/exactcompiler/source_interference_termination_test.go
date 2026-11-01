package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// Reference traces describe a set of source obligations. Joining an already
// forwarded path must not double its storage or remove an independent reference.
func TestForwardingTraceFiniteJoin(t *testing.T) {
	a, b := &ast.Node{}, &ast.Node{}
	query := sourceValueQuery{owner: newSourceValueOwner(nil)}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	path := []*ast.Node{a, b, a}
	for range 16 {
		path = query.forwardingTrace(&result, path, path, []*ast.Node{b})
	}
	if !slices.Equal(path, []*ast.Node{a, b}) {
		t.Fatalf("lost finite first-seen obligations: %d", len(path))
	}
	if !result.opaque || !result.valueIncomplete {
		t.Fatal("trace join erased uncertainty")
	}
	if query.owner.work == 0 {
		t.Fatal("trace traversal was not charged")
	}
}

// Interference has only an opacity output. It cannot acquire another body's
// values or effects once that verdict is known, or retain its borrowed scopes.
func TestOpaqueReceiverInterferenceIsSettled(t *testing.T) {
	query := sourceValueQuery{}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	prior := &sourceReceiverInspection{}
	query.receiverInspection = prior
	query.receiverInterferenceAtInputs(nil, nil, sourceValue{}, nil, &result, nil, nil)
	if query.receiverInspection != prior || !result.opaque || !result.valueIncomplete {
		t.Fatal("settled interference changed independent state")
	}
}

// Nested logical predicates must not acquire each left subtree twice. The
// unknown parameter keeps both authored routes possible without fake purity.
func TestLogicalPredicateWorkIsFinite(t *testing.T) {
	source := `export function choose(value:boolean){return ` + strings.Repeat("value||", 18) + `value}export const stable=1;`
	request := Request{Kind: "analyze", ID: "/virtual/logical-predicate-work.ts", Source: source, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var expression *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsReturnStatement(node) {
			expression = node.AsReturnStatement().Expression
		}
		return true
	})
	owner := newSourceValueOwner(generation.checker)
	query := sourceValueQuery{owner: owner, active: make(map[*ast.Node]bool)}
	known, _, _ := query.branchDecision(expression, nil)
	if known {
		t.Fatal("unknown parameter became a selected branch")
	}
	if owner.work > 2000 {
		t.Fatalf("predicate repeated its source subtrees: %d", owner.work)
	}
	session := NewSession()
	for _, target := range []Target{TargetClient, TargetServer} {
		response := session.Execute(Request{Kind: "compile", ID: request.ID, Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !strings.Contains(response.Code, "function choose") {
			t.Fatalf("lost emitted logical function: %s %#v", response.Error, response.Diagnostics)
		}
	}
}

// Checker-bound primitive operands preserve predicate selection without repeated acquisition.
func TestLogicalPredicateKnownSelection(t *testing.T) {
	for _, row := range []struct {
		name, left, expression string
		truthy, nullish        bool
	}{
		{"or-right", "0", "left || 9", true, false},
		{"or-left", "4", "left || 0", true, false},
		{"and-right", "4", "left && 0", false, false},
		{"and-left", "0", "left && 9", false, false},
		{"nullish-right", "null", "left ?? 9", true, false},
		{"nullish-left", "0", "left ?? 9", false, false},
		{"nullish-null", "null", "left ?? null", false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "const left=" + row.left + ";export function choose(){return " + row.expression + "}"
			request := Request{Kind: "analyze", ID: "/virtual/known-logical.ts", Source: source, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			var expression *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsReturnStatement(node) {
					expression = node.AsReturnStatement().Expression
				}
				return true
			})
			query := sourceValueQuery{owner: newSourceValueOwner(generation.checker), active: make(map[*ast.Node]bool)}
			known, truthy, nullish := query.branchDecision(expression, nil)
			if !known || truthy != row.truthy || nullish != row.nullish {
				t.Fatalf("predicate got %v/%v/%v want true/%v/%v", known, truthy, nullish, row.truthy, row.nullish)
			}
		})
	}
}

// Analysis reductions must preserve emitted operand order, short-circuiting and thrown values.
func TestLogicalPredicateEmittedSemantics(t *testing.T) {
	const source = `export function choose(value:boolean){return value||value||value||value||value||value||value||value||value||value||value||value||value||value||value||value||value||value||value}export function or(left:()=>unknown,right:()=>unknown){return left()||right()}export function and(left:()=>unknown,right:()=>unknown){return left()&&right()}export function coalesce(left:()=>unknown,right:()=>unknown){return left()??right()}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/logical-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("compile: %s %#v", r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "logical.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.choose(true),true);assert.equal(m.choose(false),false);for(const [op,left,expected,takes]of[['or',0,9,true],['or',4,4,false],['and',0,0,false],['and',4,9,true],['coalesce',null,9,true],['coalesce',undefined,9,true],['coalesce',0,0,false],['coalesce',false,false,false]]){const log=[];assert.equal(m[op](()=>{log.push('left');return left},()=>{log.push('right');return 9}),expected);assert.deepEqual(log,takes?['left','right']:['left'])}const sentinel={};for(const op of['or','and','coalesce']){let calls=0;assert.throws(()=>m[op](()=>{throw sentinel},()=>{calls++;return 9}),e=>e===sentinel);assert.equal(calls,0)}for(const[op,left]of[['or',0],['and',4],['coalesce',null]])assert.throws(()=>m[op](()=>left,()=>{throw sentinel}),e=>e===sentinel);`
			if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("runtime: %v %s", err, out)
			}
		})
	}
}
