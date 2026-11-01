package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This source capability requires two indexed Calls, not a runtime-only repeat.
// The existing finite increment body and captured module allocation are unchanged.
func TestModuleCellCaptureTwoIndexedCalls(t *testing.T) {
	const id = "/virtual/captured-cell-two-calls.ts"
	const source = `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};write();write();`
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatalf("invalid source: %#v", r.Diagnostics)
		}
	}
	h := bindingCloseHistory(session, id)
	if h == nil || h.receipt == nil {
		t.Fatalf("valid two-Call source has no actual module execution receipt: history=%v diagnostics=%#v", h, r.Diagnostics)
	}
	// Existing history validation is deliberately used before any new API exists.
	// The full distinct-activation/current-state assertions follow only after the
	// caller-continuation contract can retain both actual Call histories.
	if len(h.receipt.alternatives) != 1 || h.reason != "" {
		t.Fatalf("terminal two-Call receipt: %s", h.reason)
	}
	a := h.receipt.alternatives[0]
	n, known := numericNumberPayload(a.value)
	if a.completion != languageNormal || !known || float64(n) != 0 {
		t.Fatal("two-Call result", a.completion, a.value)
	}
	if len(h.callReceipts) != 2 || h.roots != 1 || h.publications != 2 {
		t.Fatalf("per-site publication: receipts=%d roots=%d publications=%d", len(h.callReceipts), h.roots, h.publications)
	}
	first, last := h.callReceipts[0].alternatives[0], h.callReceipts[1].alternatives[0]
	x, y := first.callHistory, last.callHistory
	if x == nil || y == nil || x == y || x.entry.callable != y.entry.callable || x.entry.activation.env == y.entry.activation.env || x.entry.boundary == y.entry.boundary || x.entry.inputs.call == y.entry.inputs.call || x.raw == y.raw || x.entry.caller != y.entry.caller || x.entry.inputs.callee.callable != y.entry.inputs.callee.callable {
		t.Fatal("actual two-Call identity")
	}
	if len(x.entry.callable.capturedLexicals) != 1 {
		t.Fatal("capture tuple")
	}
	cell := x.entry.callable.capturedLexicals[0].cell
	var object *languageObject
	inspect := func(b languageBranch, want float64) {
		for row := b.state.storage; row != nil; row = row.previous {
			if row.cell == cell && row.initialized {
				if object == nil {
					object = row.value.object
				}
				if object == nil || row.value.object != object {
					t.Fatal("captured allocation changed")
				}
				break
			}
		}
		for row := b.state.storage; row != nil; row = row.previous {
			if row.object == object && row.key == languageStringKey("current") && row.initialized && !row.deleted {
				n, ok := numericNumberPayload(row.descriptor.value)
				if !ok || float64(n) != want {
					t.Fatalf("current state want %v got %#v", want, row.descriptor.value)
				}
				return
			}
		}
		t.Fatal("missing performed DATA Put")
	}
	inspect(x.entry.acquisition.alternatives[0].branch, 0)
	inspect(first.branch, 1)
	if y.entry.acquisition.input != first.branch {
		t.Fatal("second Call did not start at first actual B_out")
	}
	inspect(y.entry.acquisition.alternatives[0].branch, 1)
	inspect(a.branch, 2)
	references := map[languageID]bool{}
	for ordinal, h := range []*languageCallHistory{x, y} {
		before := h.entry.acquisition.alternatives[0].branch.state
		writes := 0
		for state := h.outward.state; state != nil && state != before; state = state.previous {
			// storage versions are persistent. Count only rows introduced by
			// this actual body, not the inherited predecessor's rows.
			if state.storage != nil && (state.previous == nil || state.storage != state.previous.storage) && state.storage.object == object && state.storage.key == languageStringKey("current") && state.storage.initialized {
				writes++
			}
		}
		if writes != 1 {
			t.Fatalf("performed Put count %d", writes)
		}
		raw := h.raw.alternatives[0]
		r := h.entry.proof.entry
		puts := 0
		for _, e := range r.events {
			if e.kind == "PutValue" {
				puts++
				if raw.storage == nil || e.a < 0 || e.a >= len(raw.storage.references) || raw.storage.references[e.a].id.owner != a.branch.owner {
					t.Fatal("original member Reference missing")
				}
				ref := raw.storage.references[e.a]
				if ref.receiver.object != object || ref.key != languageStringKey("current") || references[ref.id] {
					t.Fatal("original Reference identity reused")
				}
				references[ref.id] = true
				if e.b < 0 || e.b >= len(raw.storage.values) {
					t.Fatal("RHS result register missing")
				}
				v, ok := numericNumberPayload(raw.storage.values[e.b])
				if !ok || float64(v) != float64(ordinal+1) {
					t.Fatal("actual original RHS", v, ordinal)
				}
			}
		}
		if puts != 1 {
			t.Fatalf("original indexed Put sites %d", puts)
		}
	}
}

// Run the real first statement collector, including its own dispatcher and
// disposal, before inspecting the generation-live caller continuation. No old
// normal frame is kept alive or constructed as a substitute for second entry.
func pendingModuleTwoCalls(t *testing.T) (*projectGeneration, *closedPrefixCandidate, func() *callableFacts) {
	t.Helper()
	const source = `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};write();write();`
	request := Request{Kind: "compile", ID: "/virtual/pending-module-two-calls.ts", Source: source, Diagnostics: "semantic"}
	project, ds, err := newProjectState(request, request.ID)
	if err != nil || len(ds) != 0 {
		t.Fatal(err, ds)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	file := generation.sourceFile
	if len(generation.checker.GetDiagnostics(context.Background(), file)) != 0 {
		t.Fatal("invalid source")
	}
	candidate := reserveClosedPrefixCandidate(file, project.program, generation.checker, generation, request)
	if candidate == nil {
		t.Fatal("actual source discovery")
	}
	t.Cleanup(candidate.release)
	owner := newExecutableBodyOwner(project, generation.checker)
	candidate.attach(owner.values, owner)
	owner.values.index(file)
	candidate.qualifyIndex()
	if candidate.history.state != prefixQualified {
		t.Fatal("actual index qualification")
	}
	sites := candidate.history.recipe.callSites
	facts := make([]callableFacts, 2)
	nodeTargets := map[*ast.Node]int{}
	for i, site := range sites {
		facts[i] = callableFacts{node: site.statement, sourceFile: file, descriptorMode: candidate.history.mode, summary: CallableSummary{Name: "original source Call"}, callSymbols: map[string]ast.SymbolId{}, callExpressions: map[string]*ast.Node{}, contextReferences: map[string]*ast.Node{}, ownedScalarCalls: map[string]bool{}}
		nodeTargets[site.statement] = i
	}
	collect := func(i int) {
		collectDirectCallableEffects(&facts[i], i, facts, map[ast.SymbolId]int{}, map[string]int{}, nodeTargets, file, generation.checker, nil, nil, collectExternalImportBindings(file, generation.checker), collectContextBindings(file, generation.checker), analyzeAssets(file, generation.checker, request), owner, candidate.history.mode)
	}
	collect(0)
	if candidate.continuation == nil || !candidate.priorContinuationValid() || candidate.frame != nil || candidate.slot != nil || facts[0].normalInputs != nil || len(candidate.history.callReceipts) != 1 {
		t.Fatal("first real Call did not dispose frame and retain live continuation")
	}
	return generation, candidate, func() *callableFacts { collect(1); return &facts[1] }
}

func TestModuleCellTwoCallContinuationBoundaries(t *testing.T) {
	for _, name := range []string{"valid-disposed-first-frame", "wrong-call", "ordinal", "copied-prior", "wrong-branch", "wrong-history", "copied-candidate", "replaced-history-identity", "duplicate", "abandon", "release"} {
		t.Run(name, func(t *testing.T) {
			generation, p, second := pendingModuleTwoCalls(t)
			prior := p.continuation.prior
			row := prior.alternatives[0]
			owner := row.branch.owner
			switch name {
			case "valid-disposed-first-frame":
				if !p.continuationOutput(row) || p.resumeInputs(p.currentSourceRecipe(), row) {
					t.Fatal("prior receipt alone became current slot authority")
				}
				second()
				if len(p.history.callReceipts) != 2 || p.history.roots != 1 || p.continuation != nil {
					t.Fatal("second actual installed slot did not resume")
				}
				return
			case "wrong-call":
				p.call = p.history.recipe.callSites[0].call
			case "ordinal":
				p.continuation.next = 0
			case "copied-prior":
				copied := *prior
				p.continuation.prior = &copied
			case "wrong-branch":
				changed := row
				changed.branch = owner.storageStep(row.branch, languageStorage{})
				if !p.priorContinuationValid() || p.continuationOutput(changed) {
					t.Fatal("wrong incoming current branch accepted")
				}
				return
			case "wrong-history":
				changed := row
				copied := *row.callHistory
				changed.callHistory = &copied
				if !p.priorContinuationValid() || p.continuationOutput(changed) {
					t.Fatal("wrong incoming completed Call history accepted")
				}
				return
			case "copied-candidate":
				copied := *p
				if copied.priorContinuationValid() {
					t.Fatal("copy inherited live candidate authority")
				}
				return
			case "replaced-history-identity":
				copied := *p.history
				copied.mode[0] ^= 1
				p.history = &copied
			case "duplicate":
				second()
				if p.awaitingSourceCall() || p.continuation != nil || len(p.history.callReceipts) != 2 {
					t.Fatal("duplicate source site reopened")
				}
				return
			case "abandon":
				generation.abandon()
			case "release":
				p.release()
			}
			before := owner.next
			if p.priorContinuationValid() || p.awaitingSourceCall() || owner.next != before {
				t.Fatal("invalid continuation authorized successor", name)
			}
		})
	}
}

func TestModuleCellTwoCallSourceControls(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"alias", `export{};const box={current:0};const alias=box;const write=()=>{box.current=box.current+1;return 0};alias.current=3;write();write();`},
		{"current-state", `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};box.current=4;write();write();`},
	} {
		t.Run(c.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "/virtual/two-call-control.ts", Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			h := bindingCloseHistory(session, "/virtual/two-call-control.ts")
			if h == nil || len(h.callReceipts) != 2 || h.reason != "" {
				t.Fatal("two source control failed")
			}
			end := h.receipt.alternatives[0]
			cell := end.callHistory.entry.callable.capturedLexicals[0].cell
			var object *languageObject
			for row := end.branch.state.storage; row != nil; row = row.previous {
				if row.cell == cell && row.initialized {
					object = row.value.object
					break
				}
			}
			want := float64(5)
			if c.name == "current-state" {
				want = 6
			}
			found := false
			for row := end.branch.state.storage; row != nil; row = row.previous {
				if row.object == object && row.key == languageStringKey("current") && row.initialized {
					v, ok := numericNumberPayload(row.descriptor.value)
					if !ok || float64(v) != want {
						t.Fatal("current state", v, want)
					}
					found = true
					break
				}
			}
			if !found {
				t.Fatal("performed current field absent")
			}
		})
	}
	for _, source := range []string{
		`export{};const box={current:0};const write=()=>{box.current=1;return 0};const other=()=>0;write();other();`,
		`export{};const write=()=>0;write();write();`,
		`export{};const box={current:0};const write=(n?:number)=>{box.current=1;return 0};write();write(1);`,
	} {
		request := Request{Kind: "compile", ID: "/virtual/two-call-refusal.ts", Source: source, Diagnostics: "semantic"}
		project, _, err := newProjectState(request, request.ID)
		if err != nil {
			t.Fatal(err)
		}
		g, err := project.advance(context.Background(), request.ID, source)
		if err != nil {
			t.Fatal(err)
		}
		if len(g.checker.GetDiagnostics(context.Background(), g.sourceFile)) != 0 {
			g.release()
			t.Fatal("invalid refusal source", source)
		}
		candidate := reserveClosedPrefixCandidate(g.sourceFile, project.program, g.checker, g, request)
		if candidate != nil {
			owner := newExecutableBodyOwner(project, g.checker)
			candidate.attach(owner.values, owner)
			owner.values.index(g.sourceFile)
			candidate.qualifyIndex()
			refused := candidate.history.state == prefixRefused && candidate.history.roots == 0 && candidate.history.receipt == nil && candidate.frame == nil
			candidate.release()
			if !refused {
				g.release()
				t.Fatal("outside selected indexed source admission", source)
			}
		}
		g.release()
	}
}

func TestModuleCellTwoCallsEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			const source = `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};write();write();`
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/two-call-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "two-call.mjs")
			if err := os.WriteFile(file, []byte(r.Code+`;if(box.current!==2)throw Error('two source Calls current state');console.log('PASS');`), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			out, err := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != "PASS" {
				t.Fatalf("runtime %v %s", err, out)
			}
		})
	}
}

// This is the real request-mode attachment law with the original owner map,
// source, checker and generation preserved. No privileged map/history mutation
// is used to claim authored source coverage of a constructor-only condition.
func TestModuleCellTwoCallRequestMode(t *testing.T) {
	g, p, second := pendingModuleTwoCalls(t)
	second()
	h := p.history
	source, program, c, owner, x := p.source, p.program, p.checker, p.owner, p.executable
	mode := h.mode
	if !h.cacheCompatible(owner, x, source, mode) {
		t.Fatal("positive historical cache binding")
	}
	p.release()
	request := Request{Kind: "compile", ID: "/virtual/pending-module-two-calls.ts", Source: source.Text(), Diagnostics: "semantic"}
	same := reserveClosedPrefixCandidate(source, program, c, g, request)
	if same == nil || same.history.mode != mode {
		t.Fatal("matching actual request-mode issuance")
	}
	same.attach(owner, x)
	if same.history != h || same.continuation != nil || same.awaitingSourceCall() || owner.closedPrefixes[source] != h {
		t.Fatal("matching request resumed cached execution")
	}
	same.release()
	request.Target = TargetServer
	changed := reserveClosedPrefixCandidate(source, program, c, g, request)
	if changed == nil || changed.history.mode == mode || !h.cacheCompatible(owner, x, source, mode) || h.cacheCompatible(owner, x, source, changed.history.mode) {
		t.Fatal("request-mode discriminator not isolated")
	}
	changed.attach(owner, x)
	if changed.history.state != prefixRefused || changed.continuation != nil || owner.closedPrefixes[source] != h || h.mode != mode || h.roots != 1 || h.publications != 2 {
		t.Fatal("changed request-mode reused old result")
	}
	changed.release()
}

// The producer and second collector are real source owners. Only the corrupt
// pending prior or setup shape is constructor-injected. These controls do not
// advertise an authored source domain for those invalid states.
func TestModuleCellTwoCallSecondDispatchRefusal(t *testing.T) {
	for _, setup := range []bool{false, true} {
		name := "wrong-prior"
		if setup {
			name = "setup-shape"
		}
		t.Run(name, func(t *testing.T) {
			_, p, second := pendingModuleTwoCalls(t)
			h := p.history
			prior := h.receipt
			first := prior.alternatives[0]
			raw := first.callHistory.raw
			owner := first.branch.owner
			if setup {
				h.recipe.choiceSlots = h.recipe.registers + 1
				if !p.priorContinuationValid() {
					t.Fatal("setup discriminator did not reach exact setup boundary")
				}
				if _, valid := shortCircuitSetup(h.recipe, 4096); valid {
					t.Fatal("invalid setup shape not isolated")
				}
			} else {
				copied := *prior
				p.continuation.prior = &copied
				if p.priorContinuationValid() {
					t.Fatal("wrong prior discriminator not established")
				}
			}
			before := owner.next
			fact := second()
			if h.roots != 1 || h.publications != 1 || len(h.callReceipts) != 1 || h.callReceipts[0] != prior || h.receipt != prior || owner.next != before {
				t.Fatalf("refused second site issued/relabelled result roots=%d pubs=%d receipts=%d ids=%d->%d stale=%t", h.roots, h.publications, len(h.callReceipts), before, owner.next, h.receipt == prior)
			}
			if p.continuation != nil || p.frame != nil || p.slot != nil || p.retryLegacy || h.state != prefixTerminal || fact.normalInputs != nil {
				t.Fatal("second collector left live continuation or replay route")
			}
			if h.reason == "" || environmentEffectFor(fact.summary.DirectEffectSources) != "unknown" {
				t.Fatal("actual refusal lost opacity", h.reason, fact.summary.DirectEffectSources)
			}
			if first.callHistory.raw != raw || !first.callHistory.validResult(first) || raw.alternatives[0].returnBoundary != first.callHistory.entry.boundary {
				t.Fatal("first immutable receipt invalidated or borrowed")
			}
		})
	}
}
