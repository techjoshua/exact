package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Real original writer callbacks own the interval. An inert stored literal can
// be detached there, while a missing acquired formal tuple remains pending.
func TestStagedWriterInputProjectionOriginalInterval(t *testing.T) {
	for _, row := range []struct {
		source string
		known  bool
	}{
		{`function put(box:{run:()=>string}){box.run=()=>window.name}const box={run:()=> 'safe'};put(box);export function invoke(){return box.run()}`, true},
		{`function browser(){return window.name}function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,browser);export function invoke(){return box.run()}`, false},
	} {
		withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
			var assignment sourceValueAssignment
			var input sourceMemberWriterInput
			seen := false
			revoke, installed := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
				seen = true
				assignment = sourceValueAssignment{left: read.write.AsBinaryExpression().Left, right: read.write.AsBinaryExpression().Right}
				input = sourceMemberWriterInput{call: read.call}
				before := q.relativeInputCut(read.get)
				copied := *q
				if result := produceStagedWriterProjection(&copied, assignment, input); len(result.delta.exposures) != 0 || result.delta.extracted {
					t.Fatal("copied issuer borrowed projection")
				}
				result := produceStagedWriterProjection(q, assignment, input)
				if q.relativeInputCut(read.get) != before || q.stagedWriter.projecting != nil {
					t.Fatal("projection did not restore original read/issuer")
				}
				if len(result.delta.invoked)+len(result.delta.effects)+len(result.delta.relative)+len(result.delta.residuals) != 0 {
					t.Fatal("projection invoked stored body or manufactured runtime unknown")
				}
				if row.known {
					if len(result.delta.exposures) != 1 || result.delta.exposures[0].endpoint.expression != assignment.right || len(q.stagedWriter.projectedScopes) != 1 {
						t.Fatalf("known original literal/scoped source lost: %+v", result)
					}
					if !sameOperationAlternative(q.stagedWriter.projectedScopes[0].alternative, result.delta.exposures[0]) {
						t.Fatal("scope keyed by body rather than full endpoint")
					}
				} else if len(result.pending) != 1 || result.delta.extracted || len(result.delta.exposures) != 0 {
					t.Fatal("missing actual tuple became covered empty or reacquired formal")
				}
				return false
			})
			if !installed {
				t.Fatal("original writer source interval missing")
			}
			q.receiverCandidates(call, nil)
			if !seen {
				t.Fatal("no original writer receipt")
			}
			if result := produceStagedWriterProjection(q, assignment, input); len(result.delta.exposures) != 0 || result.delta.extracted {
				t.Fatal("finished publication retained source rights")
			}
			revoke()
			if result := produceStagedWriterProjection(q, assignment, input); len(result.delta.exposures) != 0 || result.delta.extracted {
				t.Fatal("revoked publication retained source rights")
			}
		})
	}
}

// The narrow hook records raw operation provenance during an original owner
// publication. Installing a marker in this test exercises deferral only, not
// projection admission, acquired inputs or graph publication authority.
func TestStagedWriterInputProjectionDefersRawSource(t *testing.T) {
	for _, rhs := range []string{"factory()", "provider.callback", "new Factory().run"} {
		source := `function factory(){return()=>window.name}const provider={get callback(){window.name;return()=>document.title}};class Factory{run=()=>window.name}function put(box:{run:()=>string}){box.run=` + rhs + ` }const box={run:()=> 'safe'};put(box);export function invoke(){return box.run()}`
		withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
			seen := false
			revoke, installed := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
				seen = true
				borrow := q.stagedWriter
				active := &sourceStagedWriterInputProjection{issuer: q}
				borrow.projecting = active
				defer func() { borrow.projecting = nil }()
				value := read.value.expression
				var result accessorCandidates
				copied := *q
				if copied.deferStagedWriterInputOperation(value, &result) {
					t.Fatal("copied issuer deferred source operation")
				}
				if !q.deferStagedWriterInputOperation(value, &result) || len(active.pending) != 1 || active.pending[0].expression != value || active.pending[0].producer != value || active.pending[0].creation != read.call || active.pending[0].cut != q.relativeInputCut(value) {
					t.Fatal("raw operation lost original pending provenance")
				}
				if !result.valueIncomplete || result.opaque || len(result.values)+len(result.effects)+len(result.environmentEffects)+len(result.normalCalls) != 0 {
					t.Fatal("raw source deferral executed/requeried output or inferred runtime unknown")
				}
				borrow.projecting = nil
				if q.deferStagedWriterInputOperation(value, &result) {
					t.Fatal("finished interval retained raw-operation rights")
				}
				return false
			})
			if !installed {
				t.Fatal("original observer missing")
			}
			defer revoke()
			q.receiverCandidates(call, nil)
			if !seen {
				t.Fatal("original writer owner did not publish raw RHS")
			}
		})
	}
}

// These source branches are traversed by the original accessor under a real
// writer publication. Only a retained ambient variable entry owns the explicit
// unknown channel. Local/formal/library holes remain compiler-pending.
func TestStagedWriterAmbientSourceAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, prefix, alternative string
		unknown                   bool
	}{
		{"ambient", "declare const ambientForeign:()=>string;", "ambientForeign", true},
		{"authored local", "let ambientForeign:(()=>string)|undefined;", "ambientForeign", false},
		{"formal", "", "flag", false},
		{"library", "", "Math", false},
		{"classified", "/** @exact pure */ declare const ambientForeign:()=>string;", "ambientForeign", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.prefix + `function browser(){return window.name}function put(box:{run:()=>string}){box.run=()=>window.name}const box={run:()=> 'safe'};put(box);export function invoke(flag:boolean){const candidate=flag?browser:` + row.alternative + `;return box.run()}`
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				var expression *ast.Node
				walkNode(enclosingCallableNode(call).Body(), func(node *ast.Node) bool {
					if ast.IsConditionalExpression(node) {
						expression = node
					}
					return true
				})
				if expression == nil {
					t.Fatal("original source branch missing")
				}
				seen := false
				revoke, installed := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
					seen = true
					borrow := q.stagedWriter
					active := &sourceStagedWriterInputProjection{issuer: q}
					borrow.projecting = active
					defer func() { borrow.projecting = nil }()
					result := q.accessorsAtGetOutput(nil, nil, "", accessorAcquire, nil, nil, nil, nil, nil, sourceValue{node: expression})
					if len(result.values) == 0 || result.values[0].node.Name() == nil || result.values[0].node.Name().Text() != "browser" {
						t.Fatal("known source sibling lost")
					}
					if row.unknown {
						if len(active.runtimeUnknown) != 1 || result.valueIncomplete || result.opaque {
							t.Fatalf("ambient branch not explicitly represented: unknown=%d incomplete=%v", len(active.runtimeUnknown), result.valueIncomplete)
						}
						unknown := active.runtimeUnknown[0]
						if unknown.expression.Text() != "ambientForeign" || unknown.declaration.Name().Text() != "ambientForeign" || unknown.cut != q.relativeInputCut(unknown.expression) {
							t.Fatal("ambient source provenance/cut lost")
						}
						if len(result.effects)+len(result.environmentEffects)+len(result.normalCalls) != 0 {
							t.Fatal("dormant unknown source executed")
						}
					} else if len(active.runtimeUnknown) != 0 {
						t.Fatal("compiler-pending/classified source became runtime unknown")
					}
					return false
				})
				if !installed {
					t.Fatal("original writer observer missing")
				}
				defer revoke()
				q.receiverCandidates(call, nil)
				if !seen {
					t.Fatal("original writer publication missing")
				}
			})
		})
	}
}
