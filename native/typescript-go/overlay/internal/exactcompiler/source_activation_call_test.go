package exactcompiler

import (
	"context"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"strings"
	"testing"
)

const activationCallSource = activationCaptureSource + `selected();`

func TestActualReturnedActivationCall(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if h.receipt == nil || len(h.callReceipts) != 1 || row.callInputs == nil || len(h.recipe.callSites) != 2 || row.callInputs.call != h.recipe.callSites[1].call {
			return
		}
		seen = true
		first, second := h.callReceipts[0].alternatives[0], row
		if !first.callHistory.validResult(first) || !second.callHistory.validResult(second) {
			t.Fatal("actual per-site completion missing")
		}
		if first.value.callable == nil || second.callHistory.entry.callable != first.value.callable || second.callHistory.entry == first.callHistory.entry || second.callHistory.entry.activation.env == first.callHistory.entry.activation.env {
			t.Fatal("distinct second activation/current selected identity missing")
		}
		if second.value.node == nil || second.value.node.Text() != "safe" {
			t.Fatalf("actual captured member result %#v", second.value)
		}
	}
	s := NewSession()
	r := s.Execute(Request{Kind: "compile", ID: "/virtual/activation-call.ts", Source: activationCallSource, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid source", r.Diagnostics)
		}
	}
	if !seen {
		h := bindingCloseHistory(s, "/virtual/activation-call.ts")
		if h == nil {
			t.Fatal("unchanged direct selected Call lacks actual source history")
		}
		t.Fatal("no completed second original Call", h.reason, len(h.callReceipts))
	}
}

func pendingActivationCalls(t *testing.T) (*projectGeneration, *closedPrefixCandidate, func() *callableFacts) {
	t.Helper()
	const source = activationCallSource
	request := Request{Kind: "compile", ID: "/virtual/pending-activation-calls.ts", Source: source, Diagnostics: "semantic"}
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
		collectDirectCallableEffects(&facts[i], i, facts, map[ast.SymbolId]int{}, map[string]int{}, nodeTargets, file, generation.checker, nil, nil, collectExternalImportBindings(file, generation.checker), collectContextBindings(file, generation.checker), analyzeAssets(file, generation.checker, request), owner)
	}
	collect(0)
	if candidate.continuation == nil || !candidate.priorContinuationValid() || candidate.frame != nil || candidate.slot != nil || facts[0].normalInputs != nil || len(candidate.history.callReceipts) != 1 {
		t.Fatal("first real Call did not dispose frame and retain live continuation")
	}
	return generation, candidate, func() *callableFacts { collect(1); return &facts[1] }
}

func TestReturnedActivationPostInitContinuation(t *testing.T) {
	_, p, second := pendingActivationCalls(t)
	h := p.history
	prior := p.continuation.prior
	first := h.callReceipts[0]
	post := prior.alternatives[0]
	creating := first.alternatives[0]
	if prior == first || post.branch == creating.branch || post.branch.state.previous != creating.branch.state || post.branch.cursor != creating.branch.cursor+1 || !h.initializerBindingResult(post) || !activationCapturedReturn(creating, &languageCopyWork{}) {
		t.Fatal("creator Call vs selected Init receipt conflated")
	}
	f := creating.value.callable
	if post.value.callable != f || post.branch.state.storage.value.callable != f || p.frame != nil || p.slot != nil || p.entryInputs != nil {
		t.Fatal("post-Init current binding/frame disposal")
	}
	firstEntry := creating.callHistory.entry
	firstState := creating.branch
	second()
	if h.reason != "" || len(h.callReceipts) != 2 || h.roots != 1 || h.publications != 2 || p.continuation != nil {
		t.Fatal("second original publication", h.reason, len(h.callReceipts))
	}
	result := h.callReceipts[1].alternatives[0]
	e := result.callHistory.entry
	raw := result.callHistory.raw.alternatives[0]
	if result.completion != languageNormal || result.value.node == nil || result.value.node.Text() != "safe" || e.callable != f || e == firstEntry || e.boundary == firstEntry.boundary || e.activation.env == firstEntry.activation.env || e.caller != firstEntry.caller || e.activation.env.outer != f.captures || e.acquisition.input != post.branch {
		t.Fatal("fresh actual returned callable entry/result/post-Init input")
	}
	if len(raw.storage.cells) != 0 || len(raw.storage.values) != 4 || raw.storage.values[0].object != firstEntry.inputs.arguments[0].value.object || raw.storage.references[1].receiver.object != firstEntry.inputs.arguments[0].value.object || raw.storage.references[1].key != languageStringKey("value") || raw.storage.references[1].id.serial == 0 {
		t.Fatal("actual captured Cell/object Reference/Get missing")
	}
	if e.proof.entry.events[0].kind != "ReadCapturedCell" || e.proof.entry.events[1].kind != "Member" || e.proof.entry.events[2].kind != "GetValue" || e.proof.entry.events[3].kind != "Return" || h.callReceipts[0] != first || creating.branch != firstState || !firstEntry.valid(firstState.owner, firstEntry.activation) {
		t.Fatal("original receipt changed or body execution substituted")
	}
	if got := result.branch.owner.readLocal(e.activation, f.capturedLexicals[0].cell); got.completion != languageResidual {
		t.Fatal("global readLocal env equality weakened")
	}
	if got := result.branch.owner.readModuleCapturedCell(e.activation, e, 0); got.completion != languageResidual {
		t.Fatal("module capture law absorbed activation formal")
	}
	next := result.branch.owner.next
	second()
	if len(h.callReceipts) != 2 || h.roots != 1 || result.branch.owner.next != next {
		t.Fatal("duplicate second dispatch renewed identities")
	}
}

// Constructor substitutions start AFTER a genuine first original collector.
// Its frame is disposed, but the generation-owned successor is still pending.
func TestReturnedActivationContinuationRefusals(t *testing.T) {
	for _, name := range []string{"wrong-site", "wrong-prior", "pre-Init-prior", "ordinal", "wrong-mode", "wrong-generation", "wrong-entry", "copied-candidate", "abandon", "wrong-input-branch"} {
		t.Run(name, func(t *testing.T) {
			_, p, second := pendingActivationCalls(t)
			h := p.history
			first := h.callReceipts[0]
			prior := p.continuation.prior
			if !p.priorContinuationValid() {
				t.Fatal("genuine pending successor not reached")
			}
			if name == "wrong-input-branch" {
				a := prior.alternatives[0]
				a.branch = a.branch.owner.storageStep(a.branch, languageStorage{})
				if p.continuationOutput(a) {
					t.Fatal("wrong incoming branch")
				}
				return
			}
			restore := func() {}
			switch name {
			case "wrong-site":
				p.call = h.recipe.callSites[0].call
			case "wrong-entry":
				p.entry = h.recipe.callSites[0].entry
			case "wrong-prior":
				c := *prior
				p.continuation.prior = &c
			case "pre-Init-prior":
				p.continuation.prior = first
			case "ordinal":
				p.continuation.next = 0
			case "wrong-mode":
				old := h.mode
				h.mode[0] ^= 1
				restore = func() { h.mode = old }
			case "wrong-generation":
				old := p.generation
				p.generation = nil
				restore = func() { p.generation = old }
			case "copied-candidate":
				c := *p
				if c.priorContinuationValid() {
					t.Fatal("copied authority")
				}
				return
			case "abandon":
				p.release()
			}
			defer restore()
			if name != "wrong-mode" && p.priorContinuationValid() {
				t.Fatal("corrupted successor accepted")
			}
			next := h.authority.owner.language.next
			second()
			if len(h.callReceipts) != 1 || h.callReceipts[0] != first || h.roots != 1 || h.authority.owner.language.next != next {
				t.Fatal("refusal replayed or issued second body", len(h.callReceipts))
			}
		})
	}
}

func TestReturnedActivationCaptureRefusals(t *testing.T) {
	for _, name := range []string{"callee", "copied-callable", "cell", "environment", "marker", "marker-key", "marker-descriptor", "capture-declaration", "source", "generation", "copied-proof"} {
		t.Run(name, func(t *testing.T) {
			_, p, second := pendingActivationCalls(t)
			h := p.history
			prior := p.continuation.prior.alternatives[0]
			f := prior.value.callable
			o := prior.branch.owner
			if !o.activationCaptureState(prior.branch, f) || !p.priorContinuationValid() {
				t.Fatal("genuine live origin positive")
			}
			restore := func() {}
			switch name {
			case "callee", "copied-callable":
				old := prior.branch.state.storage.value
				c := *f
				prior.branch.state.storage.value.callable = &c
				restore = func() { prior.branch.state.storage.value = old }
			case "cell":
				old := f.capturedLexicals[0].cell
				f.capturedLexicals[0].cell = prior.callInputs.lexicals[0].cell
				restore = func() { f.capturedLexicals[0].cell = old }
			case "environment":
				old := f.captures
				f.captures = prior.branch.env
				restore = func() { f.captures = old }
			case "marker", "marker-key", "marker-descriptor":
				marker := h.callReceipts[0].alternatives[0].callHistory.raw.alternatives[0].branch.state.storage
				old := *marker
				if name == "marker" {
					marker.value = languageValue{}
				} else if name == "marker-key" {
					marker.key = languageStringKey("wrong")
				} else {
					marker.descriptor = languageDescriptor{writable: true}
				}
				restore = func() { *marker = old }
			case "capture-declaration":
				old := f.capturedLexicals[0].declaration
				f.capturedLexicals[0].declaration = prior.callInputs.lexicals[0].declaration
				restore = func() { f.capturedLexicals[0].declaration = old }
			case "source":
				old := f.proof.source
				f.proof.source = nil
				restore = func() { f.proof.source = old }
			case "generation":
				old := f.proof.generation
				f.proof.generation = 0
				restore = func() { f.proof.generation = old }
			case "copied-proof":
				old := f.proof
				c := *old
				f.proof = &c
				restore = func() { f.proof = old }
			}
			defer restore()
			next := o.next
			if p.priorContinuationValid() {
				t.Fatal("corrupted actual creating history accepted")
			}
			second()
			if len(h.callReceipts) != 1 || o.next != next {
				t.Fatal("invalid capture issued")
			}
		})
	}
}

func TestReturnedActivationMatchedRuntimeParity(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			req := Request{Kind: "compile", ID: "/virtual/activation-call-runtime.ts", Source: activationCallSource, Target: target, Diagnostics: "semantic"}
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			conditionalFieldObserve = nil
			normal := NewSession().Execute(req)
			observedCount := 0
			conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
				if a.callInputs != nil && len(h.recipe.callSites) == 2 && a.callInputs.call == h.recipe.callSites[1].call {
					observedCount++
				}
			}
			observed := NewSession().Execute(req)
			if normal.Error != "" || hasErrorDiagnostic(normal.Diagnostics) || observedCount != 1 {
				t.Fatal(normal.Error, normal.Diagnostics, observedCount)
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
				t.Fatal("full Response parity differs excluding top-level timings only")
			}
			conditionalNodeCompletion(t, normal.Code+`;if(typeof selected!=='function'||selected()!=='safe'||input.value!=='safe')throw Error('actual direct closure');1;`, 1, 0)
		})
	}
}

func TestReturnedActivationExactFieldEdge(t *testing.T) {
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "/virtual/activation-field-edge.ts", Source: activationCallSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	joined := 0
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for _, caller := range facts {
			for _, target := range facts {
				for _, effect := range target.summary.DirectEffectSources {
					if effect.fieldOrigin == nil || !ast.IsParameterDeclaration(effect.fieldOrigin.slot) || !activationCapturedDemand(effect.fieldOrigin.declaration, effect.fieldOrigin.operation, effect.fieldOrigin.slot, effect.fieldOrigin.key) {
						continue
					}
					// The generic target retains UNKNOWN. Coverage is an exact caller edge.
					if effect.Environment != "unknown" || !effect.Opaque || !effect.provenanceIncomplete {
						t.Fatal("naming field demand minted precision")
					}
					for _, edge := range caller.summary.Calls {
						if !fieldFallbackFulfilled(&caller, &target, edge, effect) {
							continue
						}
						joined++
						if len(caller.fieldCalls) != 1 || len(caller.fieldCalls[0].outcomes) != 1 {
							t.Fatal("actual field outcome published other than once")
						}
						wrong := edge
						wrong.ID += "wrong"
						if fieldFallbackFulfilled(&caller, &target, wrong, effect) {
							t.Fatal("wrong edge fulfilled")
						}
						wrong = edge
						wrong.Resolved = false
						if fieldFallbackFulfilled(&caller, &target, wrong, effect) {
							t.Fatal("unresolved alternative fulfilled")
						}
						for _, name := range []string{"untagged", "forwarded", "key", "member", "parameter", "declaration", "knownbrowser", "independentunknown"} {
							altered := effect
							origin := *effect.fieldOrigin
							altered.fieldOrigin = &origin
							switch name {
							case "untagged":
								altered.fieldOrigin = nil
							case "forwarded":
								altered.fieldForwarded = true
							case "key":
								origin.key = "other"
							case "member":
								origin.operation = origin.operation.Expression()
							case "parameter":
								origin.slot = target.node
							case "declaration":
								origin.declaration = origin.slot.Parent
							case "knownbrowser":
								altered.Environment = "browser"
							case "independentunknown":
								altered.provenanceIncomplete = false
							}
							if fieldFallbackFulfilled(&caller, &target, edge, altered) {
								t.Fatal("unrelated effect fulfilled", name)
							}
						}
						copied := caller
						copied.summary.Calls = append(append([]CallEdge(nil), caller.summary.Calls...), edge)
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("duplicate edge granted coverage")
						}
						copied = caller
						copied.fieldCalls = append([]sourceFieldCall(nil), caller.fieldCalls...)
						incomplete := cloneSourceFieldCall(copied.fieldCalls[0])
						incomplete.complete = false
						copied.fieldCalls = append(copied.fieldCalls, incomplete)
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("uncovered duplicate alternative lost")
						}
						copied = caller
						copied.fieldCalls = append([]sourceFieldCall(nil), caller.fieldCalls...)
						copied.fieldCalls[0].operation = target.node
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("other Call matched")
						}
					}
				}
			}
		}
	}
	if joined != 1 {
		t.Fatal("exact original second-Call field join", joined)
	}
}

func TestReturnedActivationUnmatchedEffects(t *testing.T) {
	for _, c := range []struct {
		name, source string
		browser      bool
	}{
		{"getter", `export{};function make(input:{value:string}){return()=>input.value}const input={get value(){return document.title}};const selected=make(input);selected();`, true},
		{"proxy", `export{};function make(input:{value:string}){return()=>input.value}const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});const selected=make(input);selected();`, true},
		{"body-browser", `export{};function make(input:{value:string}){return()=>{document.title;return input.value}}const input={value:'safe'};const selected=make(input);selected();`, true},
		{"independent-unknown", `export{};declare function foreign():void;function make(input:{value:string}){return()=>{foreign();return input.value}}const input={value:'safe'};const selected=make(input);selected();`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/activation-effect-refusal.ts", Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatal("invalid control", r.Diagnostics)
				}
			}
			currentCallers := 0
			for _, project := range session.projects {
				if project.callableCache != nil {
					for _, fact := range project.callableCache.merged.facts {
						if fact.node == nil || !ast.IsExpressionStatement(fact.node) || !ast.IsCallExpression(fact.node.Expression()) || !ast.IsIdentifier(fact.node.Expression().Expression()) || fact.node.Expression().Expression().Text() != "selected" {
							continue
						}
						currentCallers++
						browser, unknown := false, false
						for _, effect := range fact.summary.EffectSources {
							browser = browser || effect.Environment == "browser"
							unknown = unknown || effect.Environment == "unknown"
						}
						if !unknown || c.browser && !browser {
							t.Fatalf("CURRENT selected() caller lost propagated effects: %s browser=%v unknown=%v effects=%#v", fact.summary.Name, browser, unknown, fact.summary.EffectSources)
						}
						for _, call := range fact.fieldCalls {
							for _, outcome := range call.outcomes {
								if outcome.fulfilled && ast.IsParameterDeclaration(outcome.demand.slot) && outcome.demand.slot.Parent != outcome.demand.declaration {
									t.Fatal("CURRENT caller received unadmitted DATA field outcome")
								}
							}
						}
					}
				}
			}
			if currentCallers != 1 {
				t.Fatal("exact current selected() caller not found", currentCallers)
			}
			for _, project := range session.projects {
				if project.callableCache != nil {
					for _, fact := range project.callableCache.merged.facts {
						for _, call := range fact.fieldCalls {
							for _, outcome := range call.outcomes {
								if outcome.fulfilled && ast.IsParameterDeclaration(outcome.demand.slot) && outcome.demand.slot.Parent != outcome.demand.declaration {
									t.Fatal("unadmitted accessor/Proxy/body received capture DATA coverage")
								}
							}
						}
					}
				}
			}
		})
	}
}

func TestReturnedActivationDisposedFieldPublisher(t *testing.T) {
	_, p, second := pendingActivationCalls(t)
	fact := second()
	h := p.history
	if len(h.callReceipts) != 2 || len(fact.fieldCalls) != 1 {
		t.Fatal("actual publication not reached")
	}
	row := h.callReceipts[1].alternatives[0]
	next := row.branch.owner.next
	if _, ok := p.activationCapturedFieldCall(row, fact); ok {
		t.Fatal("disposed source frame renewed projection")
	}
	copied := *p
	if _, ok := copied.activationCapturedFieldCall(row, fact); ok {
		t.Fatal("copied candidate renewed projection")
	}
	p.release()
	if _, ok := p.activationCapturedFieldCall(row, fact); ok || row.branch.owner.next != next {
		t.Fatal("released publisher renewed authority")
	}
}

// These are constructor faults in the CURRENT shared index after the first
// real collector. They qualify outcome refusal, not authored index mutation.
func TestReturnedActivationCurrentIndexProjection(t *testing.T) {
	for _, name := range []string{"member", "base", "region"} {
		t.Run(name, func(t *testing.T) {
			_, p, second := pendingActivationCalls(t)
			f := p.continuation.prior.alternatives[0].value.callable
			member := f.proof.arrow.Body()
			index := p.owner.indexes[p.source]
			node := member
			if name == "base" {
				node = member.Expression()
			}
			original := index.normalOccurrences[node]
			if original == nil {
				t.Fatal("genuine index positive")
			}
			if name == "region" {
				copy := *original
				copy.region = original.node
				index.normalOccurrences[node] = &copy
			} else {
				index.normalOccurrences[node] = nil
			}
			defer func() { index.normalOccurrences[node] = original }()
			fact := second()
			if len(fact.fieldCalls) != 0 {
				t.Fatal("wrong current index produced outcome")
			}
		})
	}
}
