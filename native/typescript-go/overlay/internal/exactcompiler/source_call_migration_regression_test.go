package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const callMigrationID = "/virtual/call-migration.ts"
const callMigrationSource = `const first=(a:number,b:number)=>a;
const replacement=(a:number,b:number)=>b;
let chosen=first;let n=0;
chosen((chosen=replacement,n=3),(n=4));export{};`
const callMigrationReplacement = `const first=(a:number,b:number)=>b;
const replacement=(a:number,b:number)=>b;
let chosen=first;let n=0;
chosen((chosen=replacement,n=3),(n=4));export{};`
const callMigrationMethod = `export {};
const f=function(this:{value:number},a:number){return this.value;};
const holder={value:3,run:f};(holder.run)(1);`

func callMigrationRow(t *testing.T, h *closedPrefixHistory, want float64) languageAlternative {
	t.Helper()
	if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 || h.roots != 1 || h.publications != 1 || h.reason != "" {
		t.Fatal("one actual source Call publication")
	}
	a := h.receipt.alternatives[0]
	number, known := numericNumberPayload(a.value)
	if a.completion != languageNormal || !known || float64(number) != want || a.callHistory == nil || a.callHistory.raw == nil || len(a.callHistory.raw.alternatives) != 1 {
		t.Fatal("actual source Call result", a.completion, a.remaining)
	}
	return a
}

func TestSourceCallLifecycleMigration(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "compile", ID: callMigrationID, Source: callMigrationSource, Diagnostics: "semantic"}
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	first := bindingCloseHistory(session, callMigrationID)
	firstRow := callMigrationRow(t, first, 3)
	// The original saved-callee-before-arguments contract: writes replace the
	// current target and advance n, but execution retains the already acquired F.
	inputs := firstRow.callHistory.entry.inputs
	if len(inputs.arguments) != 2 || inputs.arguments[1].input != inputs.arguments[0].output || firstRow.callHistory.entry.acquisition.alternatives[0].branch != inputs.arguments[1].output {
		t.Fatal("actual ordered acquired arguments")
	}
	for index, want := range []float64{3, 4} {
		value, known := numericNumberPayload(inputs.arguments[index].value)
		if !known || float64(value) != want {
			t.Fatal("saved argument value", index)
		}
	}
	chosenFound, numberFound := false, false
	for _, lexical := range inputs.lexicals {
		if lexical.declaration == nil || lexical.declaration.Name() == nil || !ast.IsIdentifier(lexical.declaration.Name()) {
			continue
		}
		name := lexical.declaration.Name().Text()
		if name != "chosen" && name != "n" {
			continue
		}
		for record := firstRow.branch.state.storage; record != nil; record = record.previous {
			if record.cell != lexical.cell {
				continue
			}
			if !record.initialized {
				t.Fatal("actual caller cell initialization")
			}
			if name == "chosen" {
				chosenFound = true
				if record.value.callable == nil || record.value.callable == firstRow.callHistory.entry.callable {
					t.Fatal("argument replacement did not preserve saved callee")
				}
			} else {
				numberFound = true
				value, known := numericNumberPayload(record.value)
				if !known || float64(value) != 4 {
					t.Fatal("latest caller state lost after saved callee entry")
				}
			}
			break
		}
	}
	if !chosenFound || !numberFound {
		t.Fatal("actual source lexical retention witnesses")
	}
	old, raw := first.receipt, firstRow.callHistory.raw
	again := session.Execute(request)
	if again.Error != "" || hasErrorDiagnostic(again.Diagnostics) || again.Code != response.Code || bindingCloseHistory(session, callMigrationID) != first || first.roots != 1 || first.publications != 1 {
		t.Fatal("cache replayed source Call")
	}
	reset := session.Execute(Request{Kind: "reset"})
	after := session.Execute(request)
	fresh := bindingCloseHistory(session, callMigrationID)
	freshRow := callMigrationRow(t, fresh, 3)
	if reset.Error != "" || after.Error != "" || hasErrorDiagnostic(after.Diagnostics) || fresh == first || fresh.receipt.input.owner == old.input.owner {
		t.Fatal("reset retained source namespace/history")
	}
	if _, live := old.project(); live {
		t.Fatal("reset reanimated terminal receipt")
	}
	if _, live := raw.project(); live {
		t.Fatal("reset reanimated raw Call receipt")
	}
	request.Source = callMigrationReplacement
	changed := session.Execute(request)
	replaced := bindingCloseHistory(session, callMigrationID)
	replacedRow := callMigrationRow(t, replaced, 4)
	if changed.Error != "" || hasErrorDiagnostic(changed.Diagnostics) || changed.Code == "" || replaced == fresh || replacedRow.callHistory == freshRow.callHistory {
		t.Fatal("source replacement reused old Call result")
	}
	sibling := session.Execute(Request{Kind: "compile", ID: "/virtual/call-migration-independent.ts", Source: "export const independent=1;", Diagnostics: "semantic"})
	if sibling.Error != "" || hasErrorDiagnostic(sibling.Diagnostics) || sibling.Code == "" {
		t.Fatal("independent source lost progress", sibling.Error, sibling.Diagnostics)
	}
	// Completed Session requests already release execution owners. Reset and
	// independent work must not revive them or edit immutable raw/terminal values.
	if firstRow.callHistory.raw != raw || firstRow.callHistory.value != firstRow.value || raw.alternatives[0].returnBoundary != firstRow.callHistory.entry.boundary {
		t.Fatal("later source work edited original history")
	}
	if _, live := replaced.receipt.project(); live {
		t.Fatal("completed source publication retained live authority")
	}
}

// Keep the ordinary production analysis phase live solely for its internal
// authority checks. This uses the real checker, population/index and installed
// source Call. No observer hook, fabricated header or private runner is used.
func callMigrationLive(t *testing.T) (*projectGeneration, *closedPrefixHistory, languageAlternative) {
	t.Helper()
	request := Request{Kind: "compile", ID: callMigrationID, Source: callMigrationMethod, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal("ordinary project", err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	source := generation.sourceFile
	if len(source.Diagnostics()) != 0 || len(source.BindDiagnostics()) != 0 || len(generation.checker.GetDiagnostics(context.Background(), source)) != 0 {
		t.Fatal("ordinary TS7 method source diagnostics")
	}
	candidate := reserveClosedPrefixCandidate(source, project.program, generation.checker, generation, request)
	if candidate == nil {
		t.Fatal("actual source reservation")
	}
	t.Cleanup(candidate.release)
	collectProjectCallableEffects(project, source, generation.checker, nil, nil, nil, nil, analyzeAssets(source, generation.checker, request), nil)
	history := candidate.history
	row := callMigrationRow(t, history, 3)
	if history.state != prefixTerminal || row.branch.owner == nil || !row.branch.owner.live(row.branch) || !row.callHistory.validResult(row) || candidate.owner == nil || candidate.owner.closedPrefixes[source] != history {
		t.Fatal("real finalized live source Call")
	}
	return generation, history, row
}

func TestSourceCallLiveContractMigration(t *testing.T) {
	generation, history, row := callMigrationLive(t)
	call := row.callHistory
	entry := call.entry
	owner := row.branch.owner
	proof := entry.proof
	mapping := proof.mapping
	if !proof.finalizedBodyProof(owner) || !entry.valid(owner, entry.activation) || !validCallTarget(owner, entry.inputs) || mapping == nil || !mapping.validProjection() || len(mapping.physical) != 2 || len(mapping.declarations) != 1 || mapping.erasedThis != mapping.physical[0] {
		t.Fatal("actual erased-this/runtime-formal projection")
	}
	raw := call.raw.alternatives[0]
	if raw.completion != languageReturn || raw.returnBoundary != entry.boundary || raw.storage == nil || len(raw.storage.cells) != 1 || raw.storage.cells[0].environment != entry.activation.env.id || raw.branch.env != entry.activation.env || row.branch.env != entry.caller || row.branch.state != raw.branch.state || row.branch.cursor != raw.branch.cursor+1 {
		t.Fatal("Return/formal/checked-exit association")
	}
	formal := raw.storage.cells[0]
	initialized := false
	for record := raw.branch.state.storage; record != nil; record = record.previous {
		if record.cell != formal {
			continue
		}
		value, known := numericNumberPayload(record.value)
		if !record.initialized || !known || float64(value) != 1 {
			t.Fatal("actual runtime argument cell")
		}
		initialized = true
		break
	}
	if !initialized {
		t.Fatal("erased this displaced runtime formal")
	}
	wrong := *mapping
	wrong.erasedThis = wrong.physical[1]
	if wrong.validProjection() {
		t.Fatal("runtime formal erased as this")
	}
	wrong = *mapping
	wrong.declarations = nil
	if wrong.validProjection() {
		t.Fatal("runtime formal omitted")
	}
	acquired := entry.acquisition.alternatives[0]
	for _, kind := range []string{"missing-proof", "projection", "generation", "recipe"} {
		bad := *proof
		badMap := *mapping
		switch kind {
		case "missing-proof":
			bad.mapping = nil
		case "projection":
			badMap.erasedThis = nil
			bad.mapping = &badMap
		case "generation":
			bad.generation++
		case "recipe":
			recipe := *bad.entry
			bad.entry = &recipe
		}
		before := owner.next
		if bad.finalizedBodyProof(owner) {
			t.Fatal("foreign finalized proof", kind)
		}
		func() {
			original := entry.callable.proof
			defer func() { entry.callable.proof = original }()
			entry.callable.proof = &bad
			// Acquisition authenticates the saved target and argument endpoint.
			// Finalized body permission belongs to source admission and entry.
			if !callAcquisitionValid(owner, entry.acquisition.input, acquired) {
				t.Fatal("body proof changed acquired target/argument correlation", kind)
			}
			if entry.valid(owner, entry.activation) {
				t.Fatal("invalid body proof authorized activation", kind)
			}
		}()
		if owner.next != before {
			t.Fatal("proof validation issued identities", kind)
		}
	}
	if normalized := call.normalize(); normalized.completion != languageNormal || normalized.value != row.value {
		t.Fatal("genuine detached Return conversion")
	}
	// These rows intentionally change only metadata of genuine raw source output.
	// Owned-object Return requires its separate Get provenance and work owner.
	// This preserves that boundary rather than restoring the old scalar ceiling.
	for _, value := range []languageValue{entry.inputs.receiver, {callable: entry.callable, node: proof.arrow}, {}, {undefined: true, object: entry.inputs.receiver.object}} {
		changed := languageCopy(raw)
		changed.value = value
		bad := *call
		bad.raw = owner.receipt(entry.activation, []languageAlternative{changed})
		out := bad.normalize()
		if out.completion != languageResidual || out.pending != languageReturn || out.pendingValue != value || out.pendingReturnBoundary != entry.boundary || out.branch != raw.branch {
			t.Fatal("changed raw output gained conversion authority")
		}
	}
	otherBoundary := owner.identity()
	changed := languageCopy(raw)
	changed.returnBoundary = otherBoundary
	bad := *call
	bad.raw = owner.receipt(entry.activation, []languageAlternative{changed})
	if out := bad.normalize(); out.completion != languageResidual || out.pendingReturnBoundary != otherBoundary {
		t.Fatal("different Return boundary converted")
	}
	copy := languageCopy(raw)
	entered := 0
	sequence := languageSequence([]languageAlternative{copy}, func(languageAlternative) []languageAlternative { entered++; return nil })
	if entered != 0 || len(sequence) != 1 || sequence[0].returnBoundary != raw.returnBoundary || sequence[0].value != raw.value || sequence[0].storage.entry.proof != proof || !sameLanguageCallInputs(sequence[0].callInputs, raw.callInputs) {
		t.Fatal("copy/sequence lost nonnormal authority")
	}
	if len(copy.storage.ready) == 0 {
		t.Fatal("actual body buffers absent")
	}
	copy.storage.ready[0] = !copy.storage.ready[0]
	copy.storage.entry.boundary = otherBoundary
	if copy.storage.ready[0] == raw.storage.ready[0] || raw.storage.entry.boundary != entry.boundary {
		t.Fatal("copied mutable snapshot aliases canonical raw history")
	}
	// Unlike the former synthetic positive, this starts with a genuine live
	// completed source Call and causally fences it through its owning generation.
	if !call.validResult(row) {
		t.Fatal("live source result before abandonment")
	}
	generation.abandon()
	if call.validResult(row) || proof.finalizedBodyProof(owner) || validCallTarget(owner, entry.inputs) {
		t.Fatal("abandoned source proof/result reanimated")
	}
	if _, live := call.raw.project(); live {
		t.Fatal("abandon retained raw execution authority")
	}
	if _, live := history.receipt.project(); live {
		t.Fatal("abandon retained terminal execution authority")
	}
	if call.raw.alternatives[0].returnBoundary != entry.boundary || call.value != row.value {
		t.Fatal("release edited detached historical data")
	}
}
