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

const hoistedModuleSource = `export{};const box={current:0};write();write();function write(){box.current=box.current+1;return 0}`

func TestHoistedModuleFunctionSource(t *testing.T) {
	const id = "/virtual/hoisted-module-function.ts"
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: id, Source: hoistedModuleSource, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid source", r.Diagnostics)
		}
	}
	h := bindingCloseHistory(session, id)
	if h == nil || h.receipt == nil {
		t.Fatalf("valid declaration-after-Calls source has no native receipt: history=%v diagnostics=%#v", h, r.Diagnostics)
	}
	if h.reason != "" || h.roots != 1 || h.publications != 2 || len(h.callReceipts) != 2 || len(h.receipt.alternatives) != 1 {
		t.Fatalf("hoisted source completion roots=%d pubs=%d calls=%d reason=%s", h.roots, h.publications, len(h.callReceipts), h.reason)
	}
	first, last := h.callReceipts[0].alternatives[0], h.callReceipts[1].alternatives[0]
	x, y := first.callHistory, last.callHistory
	if x == nil || y == nil || x == y || x.entry.callable != y.entry.callable || x.entry.activation.env == y.entry.activation.env || x.entry.boundary == y.entry.boundary || x.entry.inputs.call == y.entry.inputs.call || y.entry.acquisition.input != first.branch {
		t.Fatal("two actual declaration Calls did not use fresh activations and same caller state")
	}
	f := x.entry.callable
	if !ast.IsFunctionDeclaration(f.proof.arrow) || !moduleFunctionDeclaration(f.proof.arrow) || len(f.capturedLexicals) != 1 || f.captures != x.entry.caller || y.entry.caller != f.captures {
		t.Fatal("declaration/capture ownership")
	}
	capture := f.capturedLexicals[0]
	var binding languageCell
	for _, v := range x.entry.inputs.lexicals {
		if v.declaration == f.proof.arrow {
			binding = v.cell
		}
	}
	if binding.id.owner == nil || binding.immutable || binding == capture.cell {
		t.Fatal("ordinary function binding is not its own mutable cell")
	}
	var object *languageObject
	for row := first.branch.state.storage; row != nil; row = row.previous {
		if row.cell == capture.cell && row.initialized {
			object = row.value.object
			break
		}
	}
	if object == nil || f.id.serial >= object.id.serial {
		t.Fatal("hoisted callable did not precede actual captured allocation")
	}
	markerCount := 0
	for row := last.branch.state.storage; row != nil; row = row.previous {
		if moduleFunctionMarker(row, f) {
			markerCount++
			for before := row.previous; before != nil; before = before.previous {
				if before.cell == capture.cell && before.initialized {
					t.Fatal("instantiation captured a completed value snapshot")
				}
			}
		}
	}
	if markerCount != 1 {
		t.Fatal("actual instantiation origin count", markerCount)
	}
	inspect := func(b languageBranch, want float64) {
		for row := b.state.storage; row != nil; row = row.previous {
			if row.object == object && row.key == languageStringKey("current") && row.initialized {
				n, ok := numericNumberPayload(row.descriptor.value)
				if !ok || float64(n) != want {
					t.Fatal("current captured state", n, want)
				}
				return
			}
		}
		t.Fatal("actual field output missing")
	}
	inspect(x.entry.acquisition.alternatives[0].branch, 0)
	inspect(first.branch, 1)
	inspect(y.entry.acquisition.alternatives[0].branch, 1)
	inspect(last.branch, 2)
	references := map[languageID]bool{}
	for ordinal, ch := range []*languageCallHistory{x, y} {
		writes := 0
		before := ch.entry.acquisition.alternatives[0].branch.state
		for state := ch.outward.state; state != nil && state != before; state = state.previous {
			if state.storage != nil && (state.previous == nil || state.storage != state.previous.storage) && state.storage.object == object && state.storage.key == languageStringKey("current") && state.storage.initialized {
				writes++
			}
		}
		if writes != 1 {
			t.Fatal("actual Put count", writes)
		}
		raw := ch.raw.alternatives[0]
		puts := 0
		for _, e := range ch.entry.proof.entry.events {
			if e.kind == "PutValue" {
				puts++
				ref := raw.storage.references[e.a]
				n, ok := numericNumberPayload(raw.storage.values[e.b])
				if references[ref.id] || ref.receiver.object != object || !ok || float64(n) != float64(ordinal+1) {
					t.Fatal("original Reference/RHS association")
				}
				references[ref.id] = true
			}
		}
		if puts != 1 {
			t.Fatal("original Put site count", puts)
		}
	}
}

func TestHoistedModuleSourceNeighbors(t *testing.T) {
	for _, c := range []struct {
		name, source string
		calls        int
		want         float64
	}{
		{"declaration-before-box", `export{};function write(){box.current=box.current+1;return 0}const box={current:0};write();write();`, 2, 2},
		{"one-call", `export{};const box={current:0};write();function write(){box.current=1;return 0}`, 1, 1},
		{"alias-current", `export{};function write(){box.current=box.current+1;return 0}const box={current:0};const alias=box;alias.current=3;write();write();`, 2, 5},
		{"shadow-parameter", `export{};const box={current:0};const shadow=(box:{current:number})=>0;write();write();function write(){box.current=box.current+1;return 0}`, 2, 2},
	} {
		t.Run(c.name, func(t *testing.T) {
			const id = "/virtual/hoisted-neighbor.ts"
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: id, Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || h.reason != "" || h.roots != 1 || h.publications != c.calls {
				t.Fatal("actual source instantiation unavailable", h)
			}
			a := h.receipt.alternatives[0]
			ch := a.callHistory
			if ch == nil || len(ch.entry.callable.capturedLexicals) != 1 {
				t.Fatal("actual capture tuple")
			}
			cell := ch.entry.callable.capturedLexicals[0].cell
			var object *languageObject
			for row := a.branch.state.storage; row != nil; row = row.previous {
				if row.cell == cell && row.initialized {
					object = row.value.object
					break
				}
			}
			found := false
			for row := a.branch.state.storage; row != nil; row = row.previous {
				if row.object == object && row.key == languageStringKey("current") && row.initialized {
					v, ok := numericNumberPayload(row.descriptor.value)
					if !ok || float64(v) != c.want {
						t.Fatal("current state", v, c.want)
					}
					found = true
					break
				}
			}
			if !found {
				t.Fatal("current captured object missing")
			}
		})
	}
}

// Source refusals use the real checker and completed source index. No missing
// receipt is interpreted as a particular live TDZ/proxy/body guard being reached.
func TestHoistedModuleSourceRefusals(t *testing.T) {
	for _, c := range []struct {
		name, source string
		invalid      bool
	}{
		{"call-before-box-init", `export{};write();const box={current:0};function write(){box.current=1;return 0}`, false},
		{"async", `export{};const box={current:0};write();async function write(){box.current=1;return 0}`, false},
		{"generator", `export{};const box={current:0};write();function* write(){box.current=1;return 0}`, false},
		{"mutable-capture", `export{};let box={current:0};write();function write(){box.current=1;return 0}`, false},
		{"foreign", `export{};declare const box:{current:number};write();function write(){box.current=1;return 0}`, false},
		{"changed-function-binding-invalid-TS", `export{};const box={current:0};function write(){box.current=1;return 0}write=()=>0;write();write();`, true},
		{"wrong-selected-callable", `export{};const box={current:0};const other=()=>0;other();function write(){box.current=1;return 0}`, false},
		{"spread-acquisition", `export{};const box={current:0};write(...([] as []));function write(){box.current=1;return 0}`, false},
		{"two-free-cells", `export{};const box={current:0};const other={current:1};write();function write(){box.current=other.current;return 0}`, false},
		{"this", `export{};const box={current:0};write();function write(this:void){box.current=1;return 0}`, false},
		{"duplicate-invalid", `export{};const box={current:0};write();function write(){box.current=1;return 0}function write(){box.current=2;return 0}`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			req := Request{Kind: "compile", ID: "/virtual/hoisted-refusal.ts", Source: c.source, Diagnostics: "semantic"}
			project, ds, err := newProjectState(req, req.ID)
			if err != nil || len(ds) != 0 {
				t.Fatal(err, ds)
			}
			g, err := project.advance(context.Background(), req.ID, req.Source)
			if err != nil {
				t.Fatal(err)
			}
			defer g.release()
			if (len(g.checker.GetDiagnostics(context.Background(), g.sourceFile)) != 0) != c.invalid {
				ds := []Diagnostic{}
				for _, diagnostic := range g.checker.GetDiagnostics(context.Background(), g.sourceFile) {
					ds = append(ds, projectDiagnostic(diagnostic))
				}
				t.Fatalf("refusal source validity differs %s: %#v", c.name, ds)
			}
			p := reserveClosedPrefixCandidate(g.sourceFile, project.program, g.checker, g, req)
			if p == nil {
				return
			}
			defer p.release()
			owner := newExecutableBodyOwner(project, g.checker)
			p.attach(owner.values, owner)
			owner.values.index(g.sourceFile)
			p.qualifyIndex()
			if p.history.state != prefixRefused || p.history.roots != 0 || p.history.receipt != nil {
				t.Fatal("unsupported source acquired module execution")
			}
		})
	}
}

func TestHoistedModuleLiveCapture(t *testing.T) {
	req := Request{Kind: "compile", ID: "/virtual/live-hoisted-function.ts", Source: hoistedModuleSource, Diagnostics: "semantic"}
	project, ds, err := newProjectState(req, req.ID)
	if err != nil || len(ds) != 0 {
		t.Fatal(err, ds)
	}
	g, err := project.advance(context.Background(), req.ID, req.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(g.release)
	p := reserveClosedPrefixCandidate(g.sourceFile, project.program, g.checker, g, req)
	if p == nil {
		t.Fatal("discovery")
	}
	t.Cleanup(p.release)
	collectProjectCallableEffects(project, g.sourceFile, g.checker, nil, nil, nil, nil, analyzeAssets(g.sourceFile, g.checker, req), nil, p)
	h := p.history
	if h == nil || len(h.callReceipts) != 2 || h.reason != "" {
		t.Fatal("real source instantiation")
	}
	a := h.receipt.alternatives[0]
	entry := a.callHistory.entry
	raw := a.callHistory.raw.alternatives[0]
	f := entry.callable
	owner := a.branch.owner
	capture := f.capturedLexicals[0]
	got := owner.readModuleCapturedCell(raw.branch, entry, 0)
	if got.completion != languageNormal || got.value.object == nil || owner.readLocal(raw.branch, capture.cell).completion != languageResidual {
		t.Fatal("actual captured access/local access separation")
	}
	var fnCell languageCell
	for _, v := range entry.inputs.lexicals {
		if v.declaration == f.proof.arrow {
			fnCell = v.cell
		}
	}
	if fnCell.immutable || fnCell.id.owner != owner {
		t.Fatal("function binding became const")
	}
	changed := owner.putLocal(a.branch, fnCell, languageValue{undefined: true})
	if changed.completion != languageNormal || !owner.readLocal(changed.branch, fnCell).value.undefined || owner.readLocal(a.branch, fnCell).value.callable != f {
		t.Fatal("ordinary mutable function binding/current storage")
	}
	// Only the branch environment changes here. Callable, proof, original
	// creation marker and storage ancestry remain genuine and identical.
	if !owner.callableCaptureState(a.branch, f) {
		t.Fatal("genuine capture positive before environment control")
	}
	other := a.branch
	other.env = owner.environment(nil)
	markerPresent := false
	for row := other.state.storage; row != nil; row = row.previous {
		markerPresent = markerPresent || moduleFunctionMarker(row, f)
	}
	if !owner.live(other) || other.state != a.branch.state || !markerPresent {
		t.Fatal("environment discriminator lost genuine ancestry")
	}
	beforeEnv := owner.next
	if owner.callableCaptureState(other, f) || owner.next != beforeEnv {
		t.Fatal("same-owner unrelated branch environment gained capture authority")
	}
	// Composite constructor substitutions below can be rejected by proof or
	// exact marker identity first. They do not independently cover each named
	// source/capture/generation check.

	for _, name := range []string{"fresh-callable", "wrong-defining-env", "wrong-capture-cell", "wrong-source", "wrong-generation"} {
		t.Run(name, func(t *testing.T) {
			copied := *f
			copied.capturedLexicals = append([]languageLexical(nil), f.capturedLexicals...)
			proof := *f.proof
			copied.proof = &proof
			switch name {
			case "fresh-callable":
				copied.id = owner.identity()
			case "wrong-defining-env":
				copied.captures = &languageEnvironment{id: owner.identity()}
			case "wrong-capture-cell":
				copied.capturedLexicals[0].cell = fnCell
			case "wrong-source":
				proof.source = nil
			case "wrong-generation":
				proof.generation++
			}
			before := owner.next
			if owner.callableCaptureState(a.branch, &copied) || owner.next != before {
				t.Fatal("copied or substituted capture gained authority")
			}
		})
	}
	sibling := owner.storageStep(entry.activation, languageStorage{})
	copiedEntry := *entry
	copiedEntry.activation = sibling
	before := owner.next
	if owner.readModuleCapturedCell(raw.branch, &copiedEntry, 0).completion != languageResidual || owner.next != before {
		t.Fatal("wrong activation branch gained capture access")
	}
	if p.frame != nil || p.slot != nil || p.continuation != nil || p.awaitingSourceCall() {
		t.Fatal("completed source retained issuing frame")
	}
	g.abandon()
	if owner.callableCaptureState(a.branch, f) || owner.readModuleCapturedCell(raw.branch, entry, 0).completion != languageResidual {
		t.Fatal("abandoned generation retained capture authority")
	}
}

// Constructor-level storage invariant only. This is not a source TDZ execution
// claim and has no finalized callable/body entry proof.
func TestHoistedModuleMarkerStorageInvariant(t *testing.T) {
	owner := newLanguageOwner()
	root := owner.root()
	cell := owner.cell(root.env, false)
	f := &languageCallable{id: owner.identity(), captures: root.env}
	marker := languageStorage{value: languageValue{callable: f}}
	if !moduleFunctionMarker(&marker, f) {
		t.Fatal("canonical marker shape")
	}
	for _, name := range []string{"cell", "object", "property-key", "descriptor", "initialized", "deleted", "extra-value"} {
		t.Run(name, func(t *testing.T) {
			bad := marker
			switch name {
			case "cell":
				bad.cell = cell
			case "object":
				bad.object = &languageObject{}
			case "property-key":
				bad.key = languageStringKey("x")
			case "descriptor":
				bad.descriptor.writable = true
			case "initialized":
				bad.initialized = true
			case "deleted":
				bad.deleted = true
			case "extra-value":
				bad.value.undefined = true
			}
			if moduleFunctionMarker(&bad, f) {
				t.Fatal("marker accepted lexical/property payload")
			}
		})
	}
	stored := owner.storageStep(root, marker)
	out := owner.initializeLocal(stored, cell, languageValue{undefined: true})
	if out.completion != languageNormal || !owner.readLocal(out.branch, cell).value.undefined {
		t.Fatal("non-cell marker obstructed ordinary initialization")
	}
	if owner.initializeLocal(out.branch, cell, languageValue{undefined: true}).completion != languageThrow {
		t.Fatal("duplicate lexical initialization guard weakened")
	}
	if owner.callableCaptureState(out.branch, f) {
		t.Fatal("storage marker minted callable proof")
	}
}

func TestHoistedModuleEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/hoisted-runtime.ts", Source: hoistedModuleSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "hoisted.mjs")
			if err := os.WriteFile(file, []byte(r.Code+`;if(box.current!==2)throw Error('hoisted module current state');console.log('PASS');`), 0600); err != nil {
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

// Every case starts from the same genuine source discovery and source index.
// Only the named immutable-plan/index field is constructor-substituted before
// qualification. These negatives grant no source execution/publication evidence.
func TestHoistedModulePreludeAndIndexRefusals(t *testing.T) {
	for _, name := range []string{"positive", "duplicate-event", "displaced-event", "declaration-once", "declaration-region", "body-once", "body-region"} {
		t.Run(name, func(t *testing.T) {
			req := Request{Kind: "compile", ID: "/virtual/hoisted-prelude-control.ts", Source: hoistedModuleSource, Diagnostics: "semantic"}
			project, ds, err := newProjectState(req, req.ID)
			if err != nil || len(ds) != 0 {
				t.Fatal(err, ds)
			}
			g, err := project.advance(context.Background(), req.ID, req.Source)
			if err != nil {
				t.Fatal(err)
			}
			defer g.release()
			if len(g.checker.GetDiagnostics(context.Background(), g.sourceFile)) != 0 {
				t.Fatal("invalid source")
			}
			p := reserveClosedPrefixCandidate(g.sourceFile, project.program, g.checker, g, req)
			if p == nil {
				t.Fatal("actual discovery")
			}
			defer p.release()
			owner := newExecutableBodyOwner(project, g.checker)
			p.attach(owner.values, owner)
			index := owner.values.index(g.sourceFile)
			r := p.history.recipe
			f := r.events[0].callable
			if r.events[0].kind != "InstantiateModuleFunction" || f == nil || index.normalOccurrences[f.arrow] == nil {
				t.Fatal("canonical instantiation layout")
			}
			switch name {
			case "duplicate-event":
				r.events = append([]storageEvent{r.events[0]}, r.events...)
				r.registers++
			case "displaced-event":
				r.events[0], r.events[1] = r.events[1], r.events[0]
			case "declaration-once":
				e := index.normalOccurrences[f.arrow]
				if !e.once || e.region != nil {
					t.Fatal("invalid declaration positive")
				}
				e.once = false
			case "declaration-region":
				e := index.normalOccurrences[f.arrow]
				if !e.once || e.region != nil {
					t.Fatal("invalid declaration positive")
				}
				e.region = f.arrow
			case "body-once", "body-region":
				var read *ast.Node
				walkNode(f.arrow.Body(), func(n *ast.Node) bool {
					if read == nil && ast.IsIdentifier(n) && n.Text() == "box" {
						read = n
					}
					return true
				})
				e := index.normalOccurrences[read]
				if e == nil || !e.once || e.region != f.arrow {
					t.Fatal("invalid body occurrence positive")
				}
				if name == "body-once" {
					e.once = false
				} else {
					e.region = nil
				}
			}
			before := owner.values.language.next
			p.qualifyIndex()
			if p.history.roots != 0 || p.history.publications != 0 || p.history.receipt != nil || owner.values.language.next != before {
				t.Fatal("qualification issued execution/publication")
			}
			if name == "positive" {
				if p.history.state != prefixQualified {
					t.Fatal("positive qualification")
				}
			} else if p.history.state != prefixRefused {
				t.Fatal("substituted prelude/index admitted", name)
			}
		})
	}
}
