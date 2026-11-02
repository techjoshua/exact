package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"testing"
)

var scopeBenchmarkSink acquiredCallableScope

// BenchmarkCallableScope measures detached map publication without checker work.
func BenchmarkCallableScope(b *testing.B) {
	for _, n := range []int{0, 4, 16, 64} {
		b.Run(fmt.Sprint(n), func(b *testing.B) {
			bindings := make(sourceValueBindings)
			creators := make(map[*ast.Node]sourceValueCreation)
			for i := 0; i < n; i++ {
				node := &ast.Node{}
				bindings[ast.SymbolId(i)] = []sourceValue{{node: node}}
				creators[node] = sourceValueCreation{invocation: node}
			}
			q := &sourceValueQuery{owner: newSourceValueOwner(nil), creators: creators}
			result := accessorCandidates{}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				scopeBenchmarkSink = q.acquireCallableScope(bindings, &result)
			}
			b.ReportMetric(float64(q.owner.work)/float64(b.N), "work/op")
		})
	}
}

// BenchmarkCallableScopeAnalyze includes a completed source analysis with captured inputs.
func BenchmarkCallableScopeAnalyze(b *testing.B) {
	const source = `function make(input:{value:string}){return {get value(){return input.value}}}export const value=make({get value(){return document.title}}).value;`
	b.ReportAllocs()
	var work int
	for i := 0; i < b.N; i++ {
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/scope-bench.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			b.Fatal(response.Error, response.Diagnostics)
		}
		for _, project := range session.projects {
			if project.callableCache != nil {
				work += project.callableCache.owner.values.work
			}
		}
	}
	b.ReportMetric(float64(work)/float64(b.N), "work/op")
}

// Scope maps detach from later binding replacement while published value carriers
// retain their existing immutable owners and creating occurrence.
func TestCallableScopeSnapshot(t *testing.T) {
	node, invocation, returning := &ast.Node{}, &ast.Node{}, &ast.Node{}
	value := sourceValue{node: node, path: []string{"value"}, capture: &acquiredCallableScope{}, acquired: &sourceObservedValue{}, bound: &sourceInvocationBody{}, normal: &sourceNormalValue{}, native: &sourceNativeValue{}, adapter: &sourceOrdinaryAdapter{}, entrySlot: node, forwarded: []*ast.Node{node}, rest: [][]sourceValue{{{node: node}}}, copied: map[string][]sourceValue{"x": {{node: node}}}, undefined: true}
	bindings := sourceValueBindings{1: {value}}
	creation := sourceValueCreation{invocation: invocation, returning: returning}
	q := &sourceValueQuery{owner: newSourceValueOwner(nil), creators: map[*ast.Node]sourceValueCreation{node: creation}, remaining: 100}
	result := accessorCandidates{}
	scope := q.acquireCallableScope(bindings, &result)
	bindings[1] = []sourceValue{{}}
	delete(q.creators, node)
	if !reflect.DeepEqual(scope.bindings[1], []sourceValue{value}) || scope.creators[node] != creation {
		t.Fatal("scope lost captured value or creator occurrence")
	}
	scope.bindings[2] = []sourceValue{{node: node}}
	scope.creators[invocation] = creation
	if len(bindings) != 1 || len(q.creators) != 0 {
		t.Fatal("scope map writes leaked to inputs")
	}
	if q.owner.work != 2 || q.remaining != 98 || q.estimatedCost != 2 {
		t.Fatal("scope work accounting changed")
	}
	empty := q.acquireCallableScope(nil, &result)
	empty.bindings[0] = nil
	empty.creators[node] = creation
}
