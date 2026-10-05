package exactcompiler

import "testing"

// Transport may carry a proven receiver for broad reads. Unproven labels and
// write effects retain their original authority and cannot acquire exact scope.
func TestContinuationStateReadContracts(t *testing.T) {
	for _, c := range []struct {
		name, kind, confidence, path, receiver string
		segments                               []string
	}{
		{"nested", "read", "broad", "table.*.value", "table", []string{"table", "*", "value"}},
		{"root", "read", "broad", "*.value", "*", []string{"*", "value"}},
		{"exact", "read", "exact", "table.first", "", []string{"table", "first"}},
		{"opaque", "read", "broad", "table.*", "", nil},
		{"unknown-reason", "read", "broad", "table", "", []string{"table"}},
		{"write", "write", "broad", "table.*", "", []string{"table", "*"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			input := StateEffect{Path: c.path, Kind: c.kind, Confidence: c.confidence, pathSegments: c.segments}
			result := continuationStateReadContracts([]StateEffect{input, input})
			found := false
			for _, effect := range result {
				found = found || effect.Path == c.receiver && effect.Kind == "read" && effect.Confidence == "exact"
			}
			expected := 1
			if c.receiver != "" {
				expected++
			}
			if found != (c.receiver != "") || input.Confidence != c.confidence || len(result) != expected {
				t.Fatalf("receiver proof or original authority changed: %#v", result)
			}
		})
	}
}
