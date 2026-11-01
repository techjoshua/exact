package exactcompiler

import (
	"reflect"
	"sort"
	"testing"
)

// Source effect traversal must preserve the caller's parameter relation. A known
// write must not gain an unrelated unknown receiver when helpers forward it.
func TestForwardedStateEffectBindings(t *testing.T) {
	for _, test := range []struct {
		name, source string
		indices      []int
	}{
		{"direct", `export function run(left:{value:number},right:{value:number}){right.value=1}`, []int{1}},
		{"forwarded", `function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(right)}`, []int{1}},
		{"reordered", `function write(value:{value:number}){value.value=1}function forward(first:{value:number},second:{value:number}){write(first)}export function run(left:{value:number},right:{value:number}){forward(right,left)}`, []int{1}},
		{"separate-calls", `function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(left);write(right)}`, []int{0, 1}},
		{"ordinary-object", `const ordinary={value:0};function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(ordinary)}`, nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/forwarded-state.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("analysis: %s %#v", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "run")
			var indices []int
			for _, write := range summary.StateWrites {
				if write.Receiver == nil || write.Receiver.Kind != "parameter" {
					if len(test.indices) != 0 {
						t.Fatalf("lost forwarded receiver %v on %s (%s): %#v", write.Receiver, write.Path, write.Confidence, summary.StateWrites)
					}
					continue
				}
				if write.Path != "value" || write.Confidence != "exact" || write.Receiver.Root != "value" {
					t.Fatalf("lost leaf or receiver precision: %#v", write)
				}
				indices = append(indices, write.Receiver.Index)
			}
			sort.Ints(indices)
			if !reflect.DeepEqual(indices, test.indices) {
				t.Fatalf("parameter writes %v, want %v: %#v", indices, test.indices, summary.StateWrites)
			}
		})
	}
}
