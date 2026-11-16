package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The callback receives an original member-owner receipt before RHS recovery.
// Reducing it is dormant transport, not a second publication or activation.
func TestStagedWriterProjectionOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source       string
		unsupported, inert bool
	}{
		{"formal", `function browser(){return window.name}function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,browser);export function invoke(){return box.run()}`, false, false},
		{"inert stored callback", `function put(box:{run:()=>string}){box.run=()=>window.name}const box={run:()=> 'safe'};put(box);export function invoke(){return box.run()}`, false, true},
		{"written capture", `function browser(){return window.name}function safe(){return 'safe'}function put(box:{run:()=>string},next:()=>string){next=safe;box.run=next}const box={run:safe};put(box,browser);export function invoke(){return box.run()}`, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				count := 0
				revoke, installed := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
					count++
					result := describeStagedWriterProjection(read)
					if len(result.delta.invoked)+len(result.delta.relative)+len(result.delta.effects)+len(result.delta.required)+len(result.delta.residuals) != 0 {
						t.Fatal("dormant storage manufactured execution or dependency authority")
					}
					if row.unsupported {
						if result.delta.extracted || len(result.pending) == 0 || !sameOperationEndpoint(result.pending[len(result.pending)-1], read.value) {
							t.Fatal("unsupported capture became empty completion or lost original pending RHS")
						}
					} else {
						if len(result.delta.exposures) != 1 || len(result.pending) != 0 || !result.delta.extracted {
							t.Fatalf("known original source projection missing: %+v", result)
						}
						endpoint := result.delta.exposures[0].endpoint
						if row.inert {
							if !sameOperationEndpoint(endpoint, read.value) || endpoint.creation != read.call {
								t.Fatal("inert source RHS lost creating Call/cut")
							}
						} else if !sameOperationEndpoint(endpoint, read.rhs.bindings[0].sources[0]) || endpoint.expression.Name().Text() != "browser" {
							t.Fatal("stored formal did not retain original source")
						}
						if result.delta.exposures[0].creating != nil {
							t.Fatal("descriptive endpoint manufactured a delivered creating edge")
						}
					}
					return false
				})
				if !installed {
					t.Fatal("original source observer unavailable")
				}
				defer revoke()
				q.receiverCandidates(call, nil)
				if count != 1 {
					t.Fatalf("actual original writer receipts=%d", count)
				}
			})
		})
	}
}

// These variations test detached payload reduction only. Changing a received
// record does not authenticate it for the live publisher or grant tickets.
func TestStagedWriterProjectionDetachedPrefixes(t *testing.T) {
	const fixture = `function browser(){return window.name}function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,browser);export function invoke(){return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(q *sourceValueQuery, call *ast.Node) {
		observed := false
		revoke, installed := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
			observed = true
			if len(read.rhs.bindings) != 1 || len(read.rhs.bindings[0].sources) != 1 {
				t.Fatal("original formal input source missing")
			}
			for _, mode := range []string{"pending", "unknown", "incomplete", "unsupported", "vector"} {
				modified := read
				modified.projection = []string{"child"}
				modified.rhs.bindings = []sourceRelativeBinding{cloneSourceRelativeBinding(read.rhs.bindings[0])}
				binding := &modified.rhs.bindings[0]
				binding.sources[0].projection = []string{"stored"}
				switch mode {
				case "pending":
					binding.pending = []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(binding.sources[0])}
				case "unknown":
					binding.unknown = true
				case "incomplete":
					modified.incomplete = true
				case "unsupported":
					modified.rhs.unsupported = relativeInputsUnsupportedCapture
				case "vector":
					modified.invocation.actualsKnown = false
				}
				result := describeStagedWriterProjection(modified)
				if result.delta.extracted || len(result.delta.exposures) != 1 || len(result.delta.invoked)+len(result.delta.effects)+len(result.delta.relative)+len(result.delta.residuals) != 0 {
					t.Fatal("partial source prefix discarded or promoted to completion/execution")
				}
				endpoint := result.delta.exposures[0].endpoint
				original := binding.sources[0]
				original.projection = []string{"stored", "child"}
				if !sameOperationEndpoint(endpoint, original) {
					t.Fatal("projection lost original endpoint association/cut")
				}
				if mode == "pending" {
					if len(result.pending) != 1 || !sameOperationEndpoint(result.pending[0], original) {
						t.Fatal("pending source was delivered as exposure or retargeted")
					}
					result.pending[0].projection[0] = "changed"
					if binding.pending[0].projection[0] != "stored" {
						t.Fatal("pending projection retained borrowed path")
					}
				}
				result.delta.exposures[0].endpoint.projection[0] = "changed"
				modified.projection[0] = "changed"
				if binding.sources[0].projection[0] != "stored" {
					t.Fatal("known projection retained borrowed path")
				}
			}
			return false
		})
		if !installed {
			t.Fatal("original observer missing")
		}
		defer revoke()
		q.receiverCandidates(call, nil)
		if !observed {
			t.Fatal("original member owner did not publish")
		}
	})
}
