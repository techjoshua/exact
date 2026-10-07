package exactcompiler

import "testing"

// Requested facts include binding writes and must enter the graph once, rather than being
// replaced after a provisional project-wide pass. Existing synchronization tests cover edits.
func TestRequestedCallableSourceAnalyzedOnce(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{ID: "/virtual/analysis-facts.tsx", Kind: "compile", Target: TargetClient, Source: `export function Page(){return()=> <p>value</p>}`})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile rejected: %#v", response)
	}
	if response.Counters.CallableSourceAnalyses != 1 {
		t.Fatalf("requested source analyzed %d times", response.Counters.CallableSourceAnalyses)
	}
}
