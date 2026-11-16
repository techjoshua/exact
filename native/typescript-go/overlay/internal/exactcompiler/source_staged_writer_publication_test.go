package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These controls enter original member acquisition. No supplied writer event,
// selected native value or detached index entry can publish a receipt.
func TestStagedWriterPublicationOriginalOwner(t *testing.T) {
	const source = `function browser(){return window.name}function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,browser);export function invoke(){return box.run()}`
	for _, accept := range []bool{false, true} {
		t.Run(map[bool]string{false: "observe", true: "take-projection"}[accept], func(t *testing.T) {
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				var receipts []sourceStagedWriterRead
				revoke, ok := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool { receipts = append(receipts, read); return accept })
				if !ok {
					t.Fatal("original demand observer unavailable")
				}
				defer revoke()
				result := q.receiverCandidates(call, nil)
				if len(receipts) != 1 {
					t.Fatalf("original writer receipts=%d", len(receipts))
				}
				read := receipts[0]
				if read.call == nil || read.region == nil || read.region.Name().Text() != "put" || read.get != call || read.readCut.use != call || read.readCut.reading != call || read.write.AsBinaryExpression().Right != read.value.expression || read.value.creation != read.call || read.value.get != read.write.AsBinaryExpression().Left || read.bound.operation != read.call || read.invocation.operation != read.call || !read.invocation.actualsKnown || len(read.invocation.actuals) != 2 {
					t.Fatalf("original association lost: %+v", read)
				}
				if read.bound.cut.reading != read.call || read.bound.cut.initializing != read.call || read.bound.cut.returning != nil || read.bound.cut.reading == read.readCut.reading {
					t.Fatal("creating projection borrowed later read cut")
				}
				if read.rhs.unsupported != relativeInputsSupported || len(read.rhs.bindings) != 1 || len(read.rhs.bindings[0].sources) != 1 || read.rhs.bindings[0].sources[0].expression.Name().Text() != "browser" {
					t.Fatalf("real creating argument not detached: %+v", read.rhs)
				}
				if accept && !result.valueIncomplete {
					t.Fatal("source acceptance manufactured complete selected output")
				}
				revoke()
				if q.stagedWriter != nil {
					t.Fatal("observer retained after revoke")
				}
			})
		})
	}
}

func TestStagedWriterPublicationCutsAndCaptures(t *testing.T) {
	for _, row := range []struct {
		name, writer, setup, suffix string
		want                        int
		gap                         bool
	}{
		{"saved-before-later", `box.run=next`, `put(box,browser);const saved=box.run;`, `box.run=safe;return saved()`, 1, false},
		{"fresh-after-later", `box.run=next`, `put(box,browser);`, `box.run=safe;return box.run()`, 1, false},
		{"completed-written-formal", `try{box.run=()=>next()}finally{next=safe}`, `put(box,browser);`, `return box.run()`, 1, false},
		{"written-before-store", `next=safe;box.run=next`, `put(box,browser);`, `return box.run()`, 1, true},
		{"unreachable-writer", `throw 9;box.run=next`, `try{put(box,browser)}catch{}`, `return box.run()`, 0, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function browser(){return window.name}function safe(){return 'safe'}function put(box:{run:()=>string},next:()=>string){` + row.writer + `}const box={run:safe};export function invoke(){` + row.setup + row.suffix + `}`
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				var reads []sourceStagedWriterRead
				revoke, ok := q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
					if read.region != nil && read.region.Name() != nil && read.region.Name().Text() == "put" {
						reads = append(reads, read)
					}
					return false
				})
				if !ok {
					t.Fatal("no observer")
				}
				defer revoke()
				q.receiverCandidates(call, nil)
				if len(reads) != row.want {
					t.Fatalf("reads=%d want=%d", len(reads), row.want)
				}
				for _, read := range reads {
					if (read.rhs.unsupported == relativeInputsUnsupportedCapture) != row.gap {
						t.Fatalf("completed input must retain capture disposition: %+v", read.rhs)
					}
					if read.readCut.use != call || read.observation.reading != call || read.value.creation != read.call {
						t.Fatal("later read retargeted creating relationship")
					}
				}
			})
		})
	}
}

// Publication rights come from the original owner interval, not from copied
// receipt metadata. Nested observers restore their prior issuer without lending
// acceptance to a copied query, Get or a saved callback.
func TestStagedWriterPublicationLifetime(t *testing.T) {
	const source = `function put(box:{run:()=>string},next:()=>string){box.run=next}const box={run:()=> 'safe'};put(box,()=>window.name);export function invoke(){return box.run()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		var revoke func()
		calls := 0
		revoke, _ = q.beginStagedWriterSource(func(read sourceStagedWriterRead) bool {
			calls++
			borrow := q.stagedWriter
			input := sourceMemberWriterInput{call: read.call}
			assignment := sourceValueAssignment{left: read.write.AsBinaryExpression().Left, right: read.write.AsBinaryExpression().Right}
			copied := *q
			if copied.publishStagedWriterSource(borrow.get, borrow.read, assignment, input, read.origin, read.projection, false, true) {
				t.Fatal("copied query published")
			}
			getCopy := *borrow.get
			if q.publishStagedWriterSource(&getCopy, borrow.read, assignment, input, read.origin, read.projection, false, true) {
				t.Fatal("copied Get published")
			}
			if q.publishStagedWriterSource(borrow.get, borrow.read, assignment, input, read.origin, read.projection, false, true) {
				t.Fatal("reentrant writer publication")
			}
			nested, nestedOK := q.beginStagedWriterSource(func(sourceStagedWriterRead) bool {
				t.Fatal("nested callback executed without original traversal")
				return true
			})
			if !nestedOK || q.stagedWriter == borrow {
				t.Fatal("nested loan not installed")
			}
			nested()
			nested()
			if q.stagedWriter != borrow {
				t.Fatal("nested loan did not restore original")
			}
			revoke()
			if borrow.issuer != nil || borrow.publish != nil || borrow.get != nil || borrow.read != nil {
				t.Fatal("revoked observer retained live owner")
			}
			return true
		})
		result := q.receiverCandidates(call, nil)
		if calls != 1 {
			t.Fatalf("original calls=%d", calls)
		}
		// Revoked acceptance must fall through to the original RHS/value owner.
		found := false
		for _, value := range result.values {
			found = found || value.node != nil && ast.IsArrowFunction(value.node) && value.node.Body() != nil && value.node.Body().Kind == ast.KindPropertyAccessExpression
		}
		if !found {
			t.Fatal("revoked callback skipped original RHS recovery")
		}
		if q.stagedWriter != nil {
			t.Fatal("source observer retained after traversal")
		}
	})
}
