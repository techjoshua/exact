package exactcompiler

import (
	"os"
	"strings"
	"testing"
)

func TestNormalizationProtocolDiscoveryOwnerEquivalence(t *testing.T) {
	input, err := os.ReadFile("testdata/normalization-protocol-owners.tsx")
	if err != nil {
		t.Fatal(err)
	}
	source := parseNormalizationSource("owners.tsx", string(input))
	var captured []componentCandidate
	if edits := planJSXAttributeSyntax(source, &captured); len(edits) != 0 {
		t.Fatalf("unchanged owner fixture unexpectedly edits JSX: %#v", edits)
	}
	legacy := rawComponentCandidates(source)
	if len(captured) != len(legacy) {
		t.Fatalf("candidate count changed: %d versus %d", len(captured), len(legacy))
	}
	expected := map[string]bool{
		"direct": true, "nestedArrow": true, "nestedFunction": true,
		"objectMethod": true, "classMethod": true, "classStatic": true,
		"typedForeign": true, "typedCore": true, "optionalReceiver": true,
		"identifierReceiver": false, "aliasReceiver": false,
		"bracketReceiver": false, "parenthesizedReceiver": false,
		"wrongMember": false, "beforeOutside": false, "initializerOnly": false,
		"firstVariable": false, "secondVariable": true, "afterSibling": false,
	}
	for i, row := range captured {
		if row.node != legacy[i].node || row.moduleLevel != legacy[i].moduleLevel {
			t.Fatalf("candidate order or scope changed at %d", i)
		}
		if row.protocolKnown != row.moduleLevel {
			t.Fatalf("%s has invalid protocol fact scope", row.name)
		}
		observed := candidateHasProtocolMember(row)
		if observed != containsComponentProtocolCall(row.node) {
			t.Fatalf("%s changed the protocol presence result", row.name)
		}
		if want, ok := expected[row.name]; ok {
			if !row.protocolKnown || observed != want {
				t.Fatalf("%s protocol presence = %t, want %t", row.name, observed, want)
			}
			delete(expected, row.name)
		}
		if hasNormalizationComponentSignal(row, source) != hasNormalizationComponentSignal(legacy[i], source) {
			t.Fatalf("%s changed normalization eligibility", row.name)
		}
	}
	if len(expected) != 0 {
		t.Fatalf("fixture candidates missing: %v", expected)
	}
}

func TestNormalizationProtocolDiscoveryRefresh(t *testing.T) {
	const authored = `function edited(input: { onMount: unknown }) { return input.onMount; }
export function Page() { const cls = 'page'; return <p {cls}/>; }`
	first := parseNormalizationSource("refresh.tsx", authored)
	var discarded []componentCandidate
	edits := planJSXAttributeSyntax(first, &discarded)
	if len(edits) == 0 || len(discarded) != 0 {
		t.Fatalf("JSX recovery must release its partial discovery")
	}
	repaired := applySourceEdits(authored, edits)
	for _, text := range []string{repaired, strings.Replace(repaired, "input.onMount", "this.onMount", 1), repaired} {
		source := parseNormalizationSource("refresh.tsx", text)
		candidates := rawNormalizationCandidates(source)
		if len(candidates) != 2 || candidates[0].name != "edited" ||
			!candidates[0].protocolKnown || candidates[0].protocolMember != strings.Contains(text, "this.onMount") {
			t.Fatalf("replacement parse retained a stale protocol fact: %#v", candidates)
		}
	}
}
