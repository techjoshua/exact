package exactcompiler

import (
	"encoding/json"
	"testing"
)

func TestAnalysisWarningPolicy(t *testing.T) {
	for _, test := range []struct {
		raw       string
		threshold uint64
		enabled   bool
	}{
		{"", 4096, true}, {"false", 0, false}, {"1", 1, true},
		{"1e3", 1000, true}, {"1.0", 1, true}, {" false ", 0, false},
		{"9007199254740991", 9007199254740991, true},
	} {
		threshold, enabled, err := (AnalysisOptions{EstimatedCostWarningThreshold: json.RawMessage(test.raw)}).warningThreshold()
		if err != nil || threshold != test.threshold || enabled != test.enabled {
			t.Fatal(test.raw, threshold, enabled, err)
		}
	}
	for _, raw := range []string{"0", "-1", "true", "1.5", "null", "9007199254740992", `"4096"`} {
		if _, _, err := (AnalysisOptions{EstimatedCostWarningThreshold: json.RawMessage(raw)}).warningThreshold(); err == nil {
			t.Fatal("invalid transport policy accepted", raw)
		}
	}
}

// Diagnostic arithmetic may saturate, but exhaustion cannot become authority to
// refuse an operation. Identity/allocation guards retain their separate contract.
func TestAnalysisEstimateDoesNotSupplyExecutionFuel(t *testing.T) {
	work := languageCopyWork{remaining: 0}
	if !work.spend(4097) || work.used != 4097 || !work.spend(int(^uint(0)>>1)) || work.used != int(^uint(0)>>1) || work.spend(-1) {
		t.Fatal("advisory work estimate became an execution limit")
	}
	owner := newLanguageOwner()
	t.Cleanup(owner.dispose)
	branch := owner.root()
	owner.next = ^uint64(0)
	if owner.identity() != (languageID{}) || owner.environment(nil) != nil {
		t.Fatal("identity overflow issued authority")
	}
	if _, value := owner.allocateObject(branch); value.object != nil || owner.next != ^uint64(0) {
		t.Fatal("identity overflow partially allocated an object")
	}
}
