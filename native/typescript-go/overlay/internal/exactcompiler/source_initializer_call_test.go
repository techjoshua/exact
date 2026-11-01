package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const initializerCallSource = `export{};const box={current:0};const write=()=>{box.current=1;return 7};const selected=write();`

func TestOriginalInitializerCallBindsSelected(t *testing.T) {
	const id = "/virtual/initializer-call.ts"
	s := NewSession()
	seen := false
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	conditionalFieldObserve = func(h *closedPrefixHistory, final languageAlternative) {
		if _, _, ok := sourceInitializerCallLayout(h.recipe); h.receipt == nil || !ok {
			return
		}
		seen = true
		checkOriginalInitializerBinding(t, h, final)
	}
	r := s.Execute(Request{Kind: "compile", ID: id, Source: initializerCallSource, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid fixture", r.Diagnostics)
		}
	}
	h := bindingCloseHistory(s, id)
	if h == nil || h.receipt == nil {
		t.Fatal("valid selected=write() source has no original native Call/binding receipt")
	}
	if h.reason != "" || h.roots != 1 || h.publications != 1 || len(h.callReceipts) != 1 {
		t.Fatalf("native source ownership roots=%d pubs=%d calls=%d reason=%s", h.roots, h.publications, len(h.callReceipts), h.reason)
	}
	if !seen {
		t.Fatal("actual live publisher not observed")
	}
	if h.initializerBindingResult(h.receipt.alternatives[0]) {
		t.Fatal("disposed source publisher revived binding authority")
	}
}

func checkOriginalInitializerBinding(t *testing.T, h *closedPrefixHistory, final languageAlternative) {
	t.Helper()
	if !h.initializerBindingResult(final) {
		t.Fatal("actual live original initializer publication rejected")
	}
	if len(h.callReceipts[0].alternatives) != 1 {
		t.Fatal("one actual Call and caller result required")
	}
	call := h.callReceipts[0].alternatives[0]
	if call.callHistory == nil || !call.callHistory.validResult(call) || final.completion != languageNormal {
		t.Fatalf("original actual Return/result not complete: call=%#v final=%#v live=%t valid=%t", call, final, call.branch.owner.live(call.branch), call.callHistory != nil && call.callHistory.validResult(call))
	}
	var selected languageCell
	for _, v := range call.callInputs.lexicals {
		if v.declaration.Name() != nil && v.declaration.Name().Text() == "selected" {
			selected = v.cell
		}
	}
	if selected.id.owner == nil || selected.environment != call.branch.env.id {
		t.Fatal("selected has no genuine original caller Cell")
	}
	count := 0
	for row := final.branch.state.storage; row != nil; row = row.previous {
		if row.cell == selected && row.initialized {
			n, ok := numericNumberPayload(row.value)
			if !ok || float64(n) != 7 {
				t.Fatal("selected actual Return value", row.value)
			}
			count++
		}
	}
	if count != 1 || final.branch.env != call.branch.env || final.branch.state.previous != call.branch.state {
		t.Fatal("selected not initialized once from same B_out", count)
	}
	if final.branch.state.storage.previous != call.branch.state.storage {
		t.Fatal("binding replaced original storage ancestry")
	}
	for row := call.branch.state.storage; row != nil; row = row.previous {
		if row.cell == selected {
			t.Fatal("selected initialized before actual Call returned")
		}
	}
	body := call.callHistory.raw.alternatives[0]
	puts := 0
	for _, e := range call.callHistory.entry.proof.entry.events {
		if e.kind == "PutValue" {
			puts++
		}
	}
	if puts != 1 {
		t.Fatal("original body Put count", puts)
	}
	cell := call.callHistory.entry.callable.capturedLexicals[0].cell
	var object *languageObject
	for row := call.branch.state.storage; row != nil; row = row.previous {
		if row.cell == cell && row.initialized {
			object = row.value.object
			break
		}
	}
	found := false
	for row := final.branch.state.storage; row != nil; row = row.previous {
		if row.object == object && row.key == languageStringKey("current") && row.initialized {
			n, ok := numericNumberPayload(row.descriptor.value)
			if !ok || float64(n) != 1 {
				t.Fatal("actual captured Put missing")
			}
			found = true
			break
		}
	}
	if !found || body.completion != languageReturn {
		t.Fatal("actual captured body/Return unavailable")
	}
	if len(call.callHistory.raw.alternatives) != 1 {
		t.Fatal("original body history")
	}
	t.Log("actual original Call/Put/Return then once caller InitializeCell(selected)=7")
}

// These inspect the actual live publisher. Substituted rows are constructor
// controls, not claims that authored source reached a particular refusal guard.
func TestInitializerCallPublisherControls(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if _, _, ok := sourceInitializerCallLayout(h.recipe); h.receipt == nil || !ok {
			return
		}
		seen = true
		if !h.initializerBindingResult(row) {
			t.Fatal("live positive")
		}
		copyH := *h
		if copyH.initializerBindingResult(row) {
			t.Fatal("copied publisher")
		}
		for _, kind := range []string{"history", "branch", "rhs", "ready", "cell", "source-call"} {
			bad := row
			snapshot := *row.storage
			snapshot.ready = append([]bool(nil), snapshot.ready...)
			snapshot.cells = append([]languageCell(nil), snapshot.cells...)
			bad.storage = &snapshot
			_, pc, _ := sourceInitializerCallLayout(h.recipe)
			switch kind {
			case "history":
				bad.callHistory = nil
			case "branch":
				bad.branch = h.callReceipts[0].alternatives[0].branch
			case "rhs":
				bad.value = languageValue{undefined: true}
			case "ready":
				snapshot.ready[pc] = false
			case "cell":
				snapshot.cells[h.recipe.events[pc+1].cell] = snapshot.cells[0]
			case "source-call":
				header := *row.callInputs
				header.call = row.callHistory.entry.proof.arrow
				bad.callInputs = &header
			}
			if h.initializerBindingResult(bad) {
				t.Fatal("substituted publisher accepted", kind)
			}
		}
		r := *h.recipe
		r.events = append([]storageEvent(nil), r.events...)
		_, pc, _ := sourceInitializerCallLayout(&r)
		r.events[pc+1].a = pc - 1
		if _, _, ok := sourceInitializerCallLayout(&r); ok {
			t.Fatal("wrong binding RHS layout")
		}
	}
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/initializer-controls.ts", Source: initializerCallSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal(r.Error, r.Diagnostics, seen)
	}
}

func TestInitializerCallSourceRefusals(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"noncallable", `export{};const box={current:0};let write:any=()=>{box.current=1;return 7};write=0;const selected=write();`},
		{"unavailable-object-return", `export{};const box={current:0};const write=()=>{box.current=1;return box};const selected=write();`},
		{"unavailable-body", `export{};declare function foreign():number;const box={current:0};const write=()=>{box.current=1;return foreign()};const selected=write();`},
		{"second-initializer", initializerCallSource + `const another=write();`},
		{"unknown-call-argument", `export{};const box={current:0};const write=()=>{box.current=1;return 7};const selected=write(...([] as []));`},
		{"unsupported-throw", `export{};const box={current:0};const write=()=>{box.current=1;throw 9};const selected=write();`},
	} {
		t.Run(c.name, func(t *testing.T) {
			const id = "/virtual/initializer-refusal.ts"
			s := NewSession()
			r := s.Execute(Request{Kind: "compile", ID: id, Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatal("invalid source", r.Diagnostics)
				}
			}
			h := bindingCloseHistory(s, id)
			if h == nil {
				t.Log("source discovery refusal, no actual Call/Throw claim")
				return
			}
			if h.receipt == nil || len(h.receipt.alternatives) != 1 {
				t.Fatal("missing reached disposition")
			}
			row := h.receipt.alternatives[0]
			if row.completion == languageNormal {
				t.Fatal("refused original Call published successful binding")
			}
			if row.callInputs != nil {
				for _, v := range row.callInputs.lexicals {
					if v.declaration.Name() != nil && v.declaration.Name().Text() == "selected" {
						for r := row.branch.state.storage; r != nil; r = r.previous {
							if r.cell == v.cell && r.initialized {
								t.Fatal("refused Call initialized selected")
							}
						}
					}
				}
			}
			if h.reason == "Object Return provenance" {
				if row.callHistory == nil || row.callHistory.entry == nil {
					t.Fatal("refused actual body lost Call history")
				}
				capture := row.callHistory.entry.callable.capturedLexicals[0].cell
				var object *languageObject
				for r := row.branch.state.storage; r != nil; r = r.previous {
					if r.cell == capture && r.initialized {
						object = r.value.object
						break
					}
				}
				found := false
				for r := row.branch.state.storage; r != nil; r = r.previous {
					if r.object == object && r.key == languageStringKey("current") && r.initialized {
						n, ok := numericNumberPayload(r.descriptor.value)
						if !ok || float64(n) != 1 {
							t.Fatal("refused Return erased performed Put")
						}
						found = true
						break
					}
				}
				if !found {
					t.Fatal("refused Return dropped original storage write")
				}
			}
			t.Log("actual original acquisition incomplete/abrupt, no successful selected binding", h.reason)
		})
	}
}

// Keep precision publication checks separate from the runtime semantics so one
// failure cannot prevent the other contract from being exercised.
func TestInitializerCallPublisherResponseParity(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			request := Request{Kind: "compile", ID: "/virtual/initializer-runtime.ts", Source: initializerCallSource, Target: target, Diagnostics: "semantic"}
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			conditionalFieldObserve = nil
			normal := NewSession().Execute(request)
			seen := false
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if _, _, ok := sourceInitializerCallLayout(h.recipe); h.receipt != nil && ok {
					seen = true
					checkOriginalInitializerBinding(t, h, row)
				}
			}
			observed := NewSession().Execute(request)
			if normal.Error != "" || hasErrorDiagnostic(normal.Diagnostics) || !seen {
				t.Fatal(normal.Error, normal.Diagnostics, seen)
			}
			clean := func(r Response) map[string]any {
				b, e := json.Marshal(r)
				if e != nil {
					t.Fatal(e)
				}
				m := map[string]any{}
				if e = json.Unmarshal(b, &m); e != nil {
					t.Fatal(e)
				}
				delete(m, "timings")
				return m
			}
			if !reflect.DeepEqual(clean(normal), clean(observed)) {
				t.Fatal("full Response observer parity differs excluding only top-level timings")
			}
		})
	}
}

func TestInitializerCallRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/initializer-runtime.ts", Source: initializerCallSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "initializer.mjs")
			if e := os.WriteFile(file, []byte(r.Code+`;if(selected!==7||box.current!==1)throw Error('initializer value/order');console.log('PASS');`), 0600); e != nil {
				t.Fatal(e)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			out, e := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if e != nil || strings.TrimSpace(string(out)) != "PASS" {
				t.Fatalf("runtime %v %s", e, out)
			}
		})
	}
}

// Source discovery is genuine. Abandonment is injected before collector entry,
// so this proves absence of issuance, not an authored runtime Throw path.
func TestInitializerCallAbandonAndDuplicateInitialization(t *testing.T) {
	const id = "/virtual/initializer-abandon.ts"
	request := Request{Kind: "compile", ID: id, Source: initializerCallSource, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, id)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, initializerCallSource)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	p := reserveClosedPrefixCandidate(generation.sourceFile, project.program, generation.checker, generation, request)
	if p == nil {
		t.Fatal("actual source discovery not reached")
	}
	h := p.history
	p.release()
	if !p.released || p.authenticated || p.awaitingSourceCall() || h.roots != 0 || h.publications != 0 || h.receipt != nil || len(h.callReceipts) != 0 {
		t.Fatal("abandoned pending initializer issued execution")
	}
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if _, _, ok := sourceInitializerCallLayout(h.recipe); h.receipt == nil || !ok {
			return
		}
		seen = true
		if !h.initializerBindingResult(row) {
			t.Fatal("live positive")
		}
		_, pc, _ := sourceInitializerCallLayout(h.recipe)
		cell := row.storage.cells[h.recipe.events[pc+1].cell]
		duplicate := row.branch.owner.initializeLocal(row.branch, cell, row.value)
		if duplicate.completion != languageThrow || duplicate.branch != row.branch {
			t.Fatal("duplicate initialization changed caller storage")
		}
		if h.roots != 1 || len(h.callReceipts) != 1 || h.publications != 1 {
			t.Fatal("duplicate initialized Call replayed")
		}
	}
	r := NewSession().Execute(request)
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal(r.Error, r.Diagnostics, seen)
	}
}

// Faults below are constructor injections into the genuine, live pre-consumer
// buffers. They do not claim authored source reached any corrupted condition.
func TestInitializerCallPreConsumerGuards(t *testing.T) {
	for _, kind := range []string{"positive", "lexical-declaration", "cell", "environment", "summary", "mutable", "initialized", "wrong-call"} {
		t.Run(kind, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			var originalCell languageCell
			var inserted *languageStorage
			var candidate *closedPrefixCandidate
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if h.receipt != nil {
					return
				}
				_, pc, ok := sourceInitializerCallLayout(h.recipe)
				if !ok {
					return
				}
				seen = true
				candidate = h.authority.owner.closedPrefixCandidate
				view := row.storage
				if view == nil || view.pc != pc || candidate == nil || candidate.bodyClaimed || h.publications != 0 || len(h.callReceipts) != 0 {
					t.Fatal("not genuine pre-Call boundary")
				}
				work := languageCopyWork{}
				if !candidate.initializerCallReady(h.recipe, row, view.cells, view.values, view.ready, &work) {
					t.Fatal("genuine pre-Call positive refused")
				}
				ordinal := h.recipe.events[pc+1].cell
				originalCell = view.cells[ordinal]
				switch kind {
				case "lexical-declaration":
					row.callInputs.lexicals[ordinal].declaration = h.recipe.declarations[0]
				case "cell":
					view.cells[ordinal] = view.cells[0]
				case "environment":
					c := originalCell
					c.environment = languageID{}
					view.cells[ordinal] = c
					row.callInputs.lexicals[ordinal].cell = c
				case "summary":
					c := originalCell
					c.summary = true
					view.cells[ordinal] = c
					row.callInputs.lexicals[ordinal].cell = c
				case "mutable":
					c := originalCell
					c.immutable = false
					view.cells[ordinal] = c
					row.callInputs.lexicals[ordinal].cell = c
				case "initialized":
					// Deliberately poison the current immutable storage shape. This is
					// not an authored Initialize event or an execution receipt.
					inserted = &languageStorage{cell: originalCell, initialized: true, value: languageValue{undefined: true}, previous: row.branch.state.storage}
					row.branch.state.storage = inserted
				case "wrong-call":
					row.callInputs.call = row.callInputs.callee.callable.proof.arrow
				}
				got := candidate.initializerCallReady(h.recipe, row, view.cells, view.values, view.ready, &work)
				if got != (kind == "positive") {
					t.Fatal("pre-Call guard disposition", got)
				}
				if candidate.bodyClaimed || h.publications != 0 || len(h.callReceipts) != 0 {
					t.Fatal("guard inspection issued execution or publication")
				}
			}
			const id = "/virtual/initializer-pre-consumer.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: initializerCallSource, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
				t.Fatal(response.Error, response.Diagnostics, seen)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
				t.Fatal("missing reached original source disposition")
			}
			row := h.receipt.alternatives[0]
			if kind == "positive" {
				if row.completion != languageNormal || len(h.callReceipts) != 1 || !candidate.bodyClaimed {
					t.Fatal("positive did not enter original Call")
				}
				return
			}
			if row.completion != languageResidual || candidate.bodyClaimed || len(h.callReceipts) != 0 {
				t.Fatal("pre-Call refusal executed body/result")
			}
			if row.storage == nil || row.storage.ready[row.storage.pc] {
				t.Fatal("refused Call acquired result register")
			}
			found := 0
			for r := row.branch.state.storage; r != nil; r = r.previous {
				if r.cell == originalCell && r.initialized {
					found++
					if r != inserted {
						t.Fatal("refusal initialized selected")
					}
				}
			}
			want := 0
			if kind == "initialized" {
				want = 1
			}
			if found != want || h.roots != 1 {
				t.Fatal("unexpected selected write/root", found, h.roots)
			}
			// An opaque refusal fact can publish, but no original Call result or
			// successful selected-binding contribution is issued.
			t.Log("actual pre-consumer refusal, no body/Call receipt/selected Initialize", kind)
		})
	}
}

func TestInitializerCallLayoutAndNilConsumerGuards(t *testing.T) {
	var h *closedPrefixHistory
	if h.initializerBindingResult(languageAlternative{}) {
		t.Fatal("nil publisher")
	}
	h = &closedPrefixHistory{}
	if h.initializerBindingResult(languageAlternative{}) {
		t.Fatal("ownerless publisher")
	}
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if h.receipt == nil {
			return
		}
		seen = true
		r := *h.recipe
		r.body = h.call
		if _, _, ok := sourceInitializerCallLayout(&r); ok {
			t.Fatal("foreign declaration source layout")
		}
	}
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/initializer-layout-guards.ts", Source: initializerCallSource, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
		t.Fatal(response.Error, response.Diagnostics, seen)
	}
}
