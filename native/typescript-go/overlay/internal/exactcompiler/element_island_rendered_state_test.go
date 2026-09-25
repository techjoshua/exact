package exactcompiler

import "testing"

func TestIslandStateConsumersExcludeSnapshotsAndFollowDerivedChains(t *testing.T) {
	reads := []StateRead{
		{Component: "View", Path: []string{"count"}, Start: 10, Length: 1},
		{Component: "View", Path: []string{"count"}, Start: 30, Length: 1},
		{Component: "View", Path: []string{"count"}, Start: 110, Length: 1},
		{Component: "Other", Path: []string{"count"}, Start: 120, Length: 1},
	}
	bindings := []ReactiveBinding{
		{Component: "View", Provenance: "snapshot", Definition: SourceSpan{Start: 10, Length: 5}, References: []SourceSpan{{Start: 130, Length: 1}}},
		{Component: "View", Provenance: "state", Definition: SourceSpan{Start: 30, Length: 5}, References: []SourceSpan{{Start: 50, Length: 1}}},
		{Component: "View", Provenance: "derived", Definition: SourceSpan{Start: 50, Length: 5}, References: []SourceSpan{{Start: 150, Length: 1}}},
	}
	got := renderedIslandStateReads([]componentElement{{fullStart: 100, fullEnd: 200}}, "View", reads, bindings)
	if len(got) != 2 || got[0].Start != 150 || got[1].Start != 110 {
		t.Fatalf("expected rendered derived and direct consumers only, got %#v", got)
	}
}
