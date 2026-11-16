package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Cached source inventory must supply a filename on the first retained event,
// even when the observation starts after the source index was built.
func TestWriterInputTraceFirstLabelAndExpiredParent(t *testing.T) {
	withWriterInputGraph(t, `export function invoke(input:unknown){return Symbol.for(input as string)}`, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		BeginProgressObservation()
		defer EndProgressObservation()
		parent := progressWriterBegin(q, call, nil)
		copied := *q
		progressWriterEnd(q, parent)
		child := progressWriterBegin(&copied, call, nil)
		r := copied.registerWriterInputRequest(call)
		defer r.revoke()
		r.component(&copied, 0, nil)
		progressWriterEnd(&copied, child)
		s := progressActive.Load()
		if s == nil {
			t.Fatal("missing observer")
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		requests, components := 0, 0
		for _, record := range s.writerInput.Records {
			if record.Event == "" {
				continue
			}
			if record.Location.File == "" || record.Location.End <= record.Location.Pos {
				t.Fatal("unlabelled retained record")
			}
			if record.Event == "request-finished" {
				requests++
				if record.Serial == child.serial && record.Parent != 0 {
					t.Fatal("expired parent attributed to copied query")
				}
			}
			if record.Event == "component" {
				components++
				if record.Reason != "absent-binding" {
					t.Fatal("wrong observed rejection", record.Reason)
				}
			}
		}
		if requests != 2 || components != 1 || s.writerInput.Active.Load() != 0 {
			t.Fatal("observer balances", requests, components, s.writerInput.Active.Load())
		}
	})
}

// Source descent must label a first event before the call appears in an index.
// The production observer sees only the supplied existing filename/span.
func TestWriterInputTraceDescentLabelBeforeIndex(t *testing.T) {
	withWriterInputGraph(t, `export function invoke(input:unknown){return Symbol.for(input as string)}`, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
		file := ast.GetSourceFileOfNode(call)
		prior := q.owner.indexes
		q.owner.indexes = nil
		defer func() { q.owner.indexes = prior }()
		BeginProgressObservation()
		defer EndProgressObservation()
		progressWriterInputSource(q.executable, file, call)
		frame := progressWriterBegin(q, call, nil)
		progressWriterEnd(q, frame)
		s := progressActive.Load()
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.writerInput.DescentLabels.Load() != 1 || s.writerInput.SourceInspections.Load() != 0 || s.writerInput.Unmapped.Load() != 0 {
			t.Fatal("first event required an index", s.writerInput.countersOnly())
		}
		found := false
		for _, record := range s.writerInput.Records {
			if record.Serial == frame.serial && record.Call == progressPointer(call) {
				found = true
				if record.Location.File != file.FileName() || record.Location.Pos != call.Pos() || record.Location.End != call.End() {
					t.Fatal("wrong first source label", record.Location)
				}
			}
		}
		if !found || s.writerInput.Active.Load() != 0 {
			t.Fatal("missing balanced labelled request")
		}
	})
}
