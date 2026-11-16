package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Regression for the actual member-first/late-DATA production order. These
// detached identities test only the envelope language; they install no graph,
// selected-callee receipt, extraction flag or currentness proof. The unchanged
// public Session workload remains the production-entry connection gate.
func TestNativeCalleeRequiredInterleaving(t *testing.T) {
	declaration, operation := new(ast.Node), new(ast.Node)
	request := func(edge string) sourceStagedOperationRequest {
		return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: operation}, consumer: declaration, use: operation, cut: sourceRelativeCut{operation: operation, use: operation, reading: operation}, edge: edge}
	}
	d1, d2 := request("data-1"), request("data-2")
	m1, m2, m3 := request("member-1"), request("member-2"), request("member-3")
	s1, s2, g := request("selection-1"), request("selection-2"), request("get-contribution")
	source := sourceStagedNativeGetSource{callResults: []sourceStagedOperationRequest{d1, d2}, memberSources: []sourceStagedOperationRequest{m1, m2, m3}, selectionRequired: []sourceStagedOperationRequest{s1, s2}, getContributions: g}
	cases := []struct {
		name     string
		required []sourceStagedOperationRequest
		valid    bool
	}{
		{"old data-first order", []sourceStagedOperationRequest{d1, d2, m1, m2, m3, g, s1, s2}, true},
		{"member prefix then DATA", []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d1, g, d2}, true},
		{"late member after contribution", []sourceStagedOperationRequest{m1, g, d1, s2, m2, d2, s1, m3}, true},
		{"missing child", []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d1, g}, false},
		{"unknown child", []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d1, g, request("unknown")}, false},
		{"duplicate DATA", []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d1, g, d1}, false},
		{"duplicate selection", []sourceStagedOperationRequest{s1, m1, s1, m2, m3, d1, g, d2}, false},
		{"DATA subsequence changed", []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d2, g, d1}, false},
		{"member subsequence changed", []sourceStagedOperationRequest{s1, m2, s2, m1, m3, d1, g, d2}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if validNativeCalleeRequired(&source, c.required) != c.valid {
				t.Fatal("unexpected envelope disposition", c.valid)
			}
		})
	}
	original := []sourceStagedOperationRequest{s1, m1, s2, m2, m3, d1, g, d2}
	for _, mutate := range []func(*sourceStagedOperationRequest){
		func(r *sourceStagedOperationRequest) { r.consumer = new(ast.Node) },
		func(r *sourceStagedOperationRequest) { r.cut.initializing = operation },
		func(r *sourceStagedOperationRequest) { r.reading = r.producer },
	} {
		foreign := append([]sourceStagedOperationRequest(nil), original...)
		mutate(&foreign[5])
		if validNativeCalleeRequired(&source, foreign) {
			t.Fatal("foreign full-request association accepted")
		}
	}
	alias := source
	alias.selectionRequired = append(append([]sourceStagedOperationRequest(nil), source.selectionRequired...), m1)
	if validNativeCalleeRequired(&alias, append(append([]sourceStagedOperationRequest(nil), original...), m1)) {
		t.Fatal("ambiguous cross-role duplicate accepted")
	}
	before := append([]sourceStagedOperationRequest(nil), original...)
	if !validNativeCalleeRequired(&source, original) || !operationPrefix(before, original, sameOperationRequest) || !operationPrefix(original, before, sameOperationRequest) {
		t.Fatal("validation mutated the original issued prefix")
	}
}
