package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// Repeated producer phases must join the same original edge's receiver facts.
// A prior edge is not a promise that a new edge was appended in this phase.
func TestAccessorTargetsJoinPriorPhase(t *testing.T) {
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/accessor-targets.ts", Path: tspath.Path("/accessor-targets.ts")}, `function caller(){read();read()}function read(){}`, core.ScriptKindTS)
	caller, target := source.Statements.Nodes[0], source.Statements.Nodes[1]
	var calls []*ast.Node
	walkNode(caller, func(node *ast.Node) bool {
		if ast.IsCallExpression(node) {
			calls = append(calls, node)
		}
		return true
	})
	if len(calls) != 2 {
		t.Fatal("source call sites missing")
	}
	fact := callableFacts{node: caller, summary: CallableSummary{ID: "caller", Name: "caller"}}
	effect := func(call *ast.Node, binding ReceiverBinding) sourceCallableEffect {
		return sourceCallableEffect{operation: call, declaration: target, receivers: &sourceEffectReceivers{owner: caller, bindings: []ReceiverBinding{binding}}}
	}
	left := ReceiverBinding{Source: "component", Path: []string{"state", "left"}}
	right := ReceiverBinding{Source: "component", Path: []string{"state", "right"}}
	unknown := ReceiverBinding{Source: "unknown"}
	targets := map[*ast.Node]int{target: 1}
	appendAccessorTargets(&fact, calls[0], accessorCandidates{effects: []sourceCallableEffect{effect(calls[0], left)}}, targets, source)
	appendAccessorTargets(&fact, calls[0], accessorCandidates{effects: []sourceCallableEffect{effect(calls[0], right), effect(calls[0], unknown), effect(calls[0], right)}}, targets, source)
	if len(fact.summary.Calls) != 1 || len(fact.targets) != 1 {
		t.Fatalf("same original operation acquired duplicate targets: %v %v", fact.summary.Calls, fact.targets)
	}
	bindings := fact.summary.Calls[0].ReceiverBindings
	if len(bindings) != 3 || bindings[0].Source != "component" || bindings[0].Path[1] != "left" || bindings[1].Source != "component" || bindings[1].Path[1] != "right" || bindings[2].Source != "unknown" {
		t.Fatalf("prior or independent receiver facts lost: %#v", bindings)
	}
	appendAccessorTargets(&fact, calls[1], accessorCandidates{effects: []sourceCallableEffect{effect(calls[1], left)}}, targets, source)
	if len(fact.summary.Calls) != 2 || fact.summary.Calls[0].ID == fact.summary.Calls[1].ID || fact.fieldEdgeOperations[fact.summary.Calls[0].ID] != calls[0] || fact.fieldEdgeOperations[fact.summary.Calls[1].ID] != calls[1] {
		t.Fatal("distinct original operations coalesced")
	}
}

// A possible global member replacement retains both its getter donor and the
// unresolved receiver/key. Repeated acquisition must neither panic nor lose one.
func TestAccessorNativeGetterConservesKnownAndUnknown(t *testing.T) {
	const source = `declare const receiver:object;declare const key:PropertyKey;Object.defineProperty(receiver,key,{get(){document.title;return Object}});export function inspect(){return Object.freeze({})}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/accessor-native-getter.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, callable := range response.Analysis.Callables {
		if callable.Name != "inspect" {
			continue
		}
		found = true
		browser, unknown := false, false
		for _, effect := range callable.EffectSources {
			browser = browser || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
		}
		if !browser || !unknown {
			t.Fatalf("known getter or independent uncertainty lost: %#v", callable.EffectSources)
		}
	}
	if !found {
		t.Fatal("source callable missing")
	}
	response = session.Execute(Request{Kind: "compile", ID: "/virtual/accessor-native-getter.ts", Source: source, Target: TargetClient, Diagnostics: "semantic", PreserveOrdinaryModules: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	// The host owns the declared ambient inputs. PreserveOrdinaryModules permits
	// its bootstrap without claiming the unknown write itself is portable.
	const script = `const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const before=Object.getOwnPropertyDescriptor(Object,'freeze');let reads=0;try{const sandbox={exports:{},Object,receiver:Object,key:'freeze',document:{get title(){reads++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);assert.equal(reads,0);const value=sandbox.exports.inspect();assert.equal(typeof value,'object');assert.equal(reads,1)}finally{Object.defineProperty(Object,'freeze',before)}assert.deepEqual(Object.getOwnPropertyDescriptor(Object,'freeze'),before);`
	sourceNodeScript(t, response.Code, script)
}
