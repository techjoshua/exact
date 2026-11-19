package exactcompiler

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const pendingDescriptorPrefix = `declare const metadataKey:PropertyKey;const table=new WeakMap<object,object>();const domain={};`
const pendingDescriptorDynamicPublisher = `function publish(name:string){const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}publish('fixture');`
const pendingDescriptorBody = `export function read(prototype:object){const before=table.get(prototype);const descriptors=Object.create(prototype);Object.defineProperty(descriptors,metadataKey,{value:Object.freeze({domain})});return before}`

// These are original source producers and consumers. The Get precedes the
// descriptor value producer, so a pending record must actually let collection
// advance and be drained before the summary is used for qualification.
func TestPendingDescriptorProjectionSourceDelivery(t *testing.T) {
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/pending-descriptor.ts", Source: pendingDescriptorPrefix + pendingDescriptorBody, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	required, deferred, values, writers, settled := uint64(0), uint64(0), uint64(0), uint64(0), uint64(0)
	for _, p := range s.projects {
		for _, a := range p.callableCache.bySource {
			for _, f := range a.facts {
				if f.summary.Name != "read" || f.pendingMembers == nil {
					continue
				}
				z := f.pendingMembers.stats
				required += z.DescriptorRequired
				deferred += z.DescriptorRecoveryDeferred
				values += z.DescriptorValueDelivered
				writers += z.DescriptorWriterDelivered
				settled += z.DescriptorSettled
				for _, row := range f.pendingMembers.descriptorProjections {
					if !row.settled {
						t.Logf("required projection: valueSeen=%v valueDone=%v writerDone=%v protocolOwned=%v blocked=%v", row.valueSeen, row.valueDone, row.writerDone, row.protocolOwned, row.blocked)
					}
				}
			}
		}
	}
	if required == 0 || deferred == 0 || values == 0 || writers == 0 || settled == 0 {
		t.Fatal("source projection did not reach actual recovery retirement and producer settlement", required, deferred, values, writers, settled)
	}
	fact := findCallable(t, r.Analysis.Callables, "read")
	unknown := false
	for _, e := range fact.EffectSources {
		unknown = unknown || e.Environment == "unknown"
	}
	if !unknown {
		t.Fatal("effect settlement closed independent Get uncertainty")
	}
	app := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/pending-descriptor.ts", Source: pendingDescriptorPrefix + pendingDescriptorBody + `;read({});`, Diagnostics: "semantic"})
	if app.Error != "" || hasErrorDiagnostic(app.Diagnostics) {
		t.Fatal(app.Error, app.Diagnostics)
	}
	before, _ := json.Marshal(fact)
	after, _ := json.Marshal(findCallable(t, app.Analysis.Callables, "read"))
	if string(before) != string(after) {
		t.Fatal("application values changed declaration facts", string(before), string(after))
	}
}

// A known returned callable beside the standard alternative/unknown must reach
// the later Get's invocation. Creating the same callback without that invocation
// must remain dormant. Neither path receives output or replacement authority.
func TestPendingDescriptorProjectionKnownAndUnknown(t *testing.T) {
	prefix := pendingDescriptorPrefix + `declare const choose:boolean;const original=Object.freeze;Object.freeze=(choose?function(value:object){return ()=>document.title}:original) as typeof Object.freeze;`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/pending-descriptor-donor.ts", Source: prefix + pendingDescriptorBody, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	f := findCallable(t, r.Analysis.Callables, "read")
	browser, unknown := false, false
	for _, e := range f.EffectSources {
		browser = browser || e.Environment == "browser"
		unknown = unknown || e.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatal("known/unknown projection lost", f.EffectSources)
	}
}

// Only invocation of the projected callable activates its body. Completed
// creation captures and ordered inputs belong to the existing binder, including
// finally assignments. A stored standard-object callback stays dormant. The
// nested overridden-return and completed-finally-safe cases retain baseline
// conservative browser exposure (descriptor-dormant-baseline.jsonl and
// descriptor-finally-safe-015.jsonl). They assert preservation, not precision.
// Saved-factory handoff controls separately protect completed capture direction.
func TestPendingDescriptorProjectionCaptureAndDormancy(t *testing.T) {
	for _, row := range []struct {
		name, producer, key string
		browser             bool
	}{
		{"eager-producer", `document.title;return value`, `metadataKey`, true},
		{"captured-browser", `const captured=()=>document.title;return ()=>captured()`, `metadataKey`, true},
		{"nested-return-existing-conservative", `return ()=>()=>document.title`, `metadataKey`, true},
		{"stored-standard-object", ``, `metadataKey`, false},
		{"unrelated-key", `return ()=>document.title`, `'metadata'`, false},
		{"completed-finally-browser", `let captured=()=>'';try{return ()=>captured()}finally{captured=()=>document.title}`, `metadataKey`, true},
		{"completed-finally-safe-existing-conservative", `let captured=()=>document.title;try{return ()=>captured()}finally{captured=()=>''}`, `metadataKey`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			setup := ""
			body := pendingDescriptorBody
			if row.producer != "" {
				setup = `Object.freeze=(function(value:object){` + row.producer + `}) as typeof Object.freeze;`
			} else {
				body = strings.Replace(body, `{domain}`, `{domain:()=>document.title}`, 1)
			}
			source := pendingDescriptorPrefix + setup + strings.Replace(body, `descriptors,metadataKey,`, `descriptors,`+row.key+`,`, 1)
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/pending-descriptor-capture.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			fact := findCallable(t, r.Analysis.Callables, "read")
			browser, unknown := false, false
			for _, e := range fact.EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != row.browser || !unknown {
				t.Fatalf("browser=%v unknown=%v, want browser=%v and independent unknown: %+v", browser, unknown, row.browser, fact.EffectSources)
			}
		})
	}
}

// Eager key conversion remains with the original operation. A disjoint ordinary
// setter is not DefineProperty's protocol. A descriptor field getter is outside
// this bounded literal-value projection and must not receive its settlement.
func TestPendingDescriptorProjectionProtocolBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		browser, allowed bool
	}{
		{"key-coercion", strings.Replace(pendingDescriptorPrefix, `declare const metadataKey:PropertyKey;`, `const metadataKey={ [Symbol.toPrimitive](){document.title;return 'metadata'} } as unknown as PropertyKey;`, 1) + pendingDescriptorBody, true, true},
		{"ordinary-setter", pendingDescriptorPrefix + strings.Replace(strings.Replace(pendingDescriptorBody, `Object.create(prototype);`, `{set metadata(value:object){document.title}};`, 1), `descriptors,metadataKey,`, `descriptors,'metadata',`, 1), false, false},
		{"descriptor-getter-original-path", pendingDescriptorPrefix + strings.Replace(pendingDescriptorBody, `{value:Object.freeze({domain})}`, `{get value(){document.title;return Object.freeze({domain})}}`, 1), false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/" + row.name + ".ts", Source: row.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser, unknown := false, false
			for _, e := range findCallable(t, r.Analysis.Callables, "read").EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			// Generic descriptor-getter exposure is absent in the immutable
			// baseline too. This row protects original-path exclusion and unknown,
			// not qualification of that existing missing eager donor.
			if browser != row.browser || !unknown {
				t.Fatal(browser, unknown, r.Analysis.Callables)
			}
			if !row.allowed {
				for _, p := range s.projects {
					for _, a := range p.callableCache.bySource {
						for _, f := range a.facts {
							if f.pendingMembers != nil && f.pendingMembers.stats.DescriptorRequired != 0 {
								t.Fatal("unsupported protocol received projection enrollment", f.pendingMembers.stats)
							}
						}
					}
				}
			}
		})
	}
}

// A reached dynamic global publisher makes the original descriptor receiver
// participate in writer discovery. The formal remains a relative input at use
// zero, without an installed frame. Its original producer must independently
// publish before the enclosing effect projection can settle.
func TestPendingDescriptorFormalSourceConsumer(t *testing.T) {
	source := pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + pendingDescriptorBody
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/pending-descriptor-formal.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	registered, retired, delivered, settled := uint64(0), uint64(0), uint64(0), uint64(0)
	for _, p := range s.projects {
		for _, a := range p.callableCache.bySource {
			for _, f := range a.facts {
				if f.summary.Name != "read" || f.pendingMembers == nil {
					continue
				}
				z := f.pendingMembers.stats
				registered += z.FormalProjectionRegistered
				retired += z.FormalProjectionRecoveryRetired
				delivered += z.FormalProjectionDelivered
				settled += z.DescriptorSettled
				clone := clonePendingMemberLedger(f.pendingMembers)
				for operation := range clone.formalProducersDone {
					clone.formalProducersDone[operation] = false
					if !f.pendingMembers.formalProducersDone[operation] {
						t.Fatal("publication event shared mutable storage")
					}
				}
				for key, row := range clone.descriptorProjections {
					for input, formal := range row.formals {
						formal.delivered = false
						if !f.pendingMembers.descriptorProjections[key].formals[input].delivered {
							t.Fatal("projection clone mutated original delivery")
						}
					}
				}
				for _, row := range f.pendingMembers.descriptorProjections {
					for _, formal := range row.formals {
						if !row.settled {
							t.Fatal("required formal was not drained before effect settlement", row)
						}
						if formal.use != nil || formal.formal.kind != memberFormal || formal.formal.owner != f.node || formal.formal.position != 0 || !formal.delivered {
							t.Fatal("relative input lost its source ownership", formal)
						}
					}
				}
			}
		}
	}
	t.Logf("formal registered=%d recovery-retired=%d original-publication-delivered=%d descriptor-settled=%d", registered, retired, delivered, settled)
	if registered == 0 || retired == 0 || delivered == 0 || settled == 0 {
		t.Fatal("original source did not traverse and drain formal recovery", registered, retired, delivered, settled)
	}
}

// Application inputs use the ordinary formal/capture binder. They must add the
// invoked callback's browser requirement to that application without changing
// the declaration's relative facts or activating a merely stored sibling.
func TestPendingDescriptorFormalAppliedCapture(t *testing.T) {
	body := strings.Replace(pendingDescriptorBody, `Object.create(prototype)`, `operations.create(prototype)`, 1)
	source := pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + `const operations={create(prototype:object){(prototype as ()=>unknown)();return {}}};` + body + `export function Library(){return ()=>read(()=>0)?'present':'empty'}`
	library := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/descriptor-formal-application.ts", Source: source, Diagnostics: "semantic"})
	application := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/descriptor-formal-application.ts", Source: source + `export function applied(){const captured=()=>document.title;const dormant=()=>document.cookie;return read(()=>captured())}export function App(){return ()=>applied()?'present':'empty'}`, Diagnostics: "semantic"})
	for _, r := range []Response{library, application} {
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
	}
	left := findCallable(t, library.Analysis.Callables, "read")
	right := findCallable(t, application.Analysis.Callables, "read")
	a, _ := json.Marshal(left)
	b, _ := json.Marshal(right)
	if string(a) != string(b) {
		t.Fatal("application specialized relative definition", string(a), string(b))
	}
	browser := false
	for _, e := range findCallable(t, application.Analysis.Callables, "applied").EffectSources {
		browser = browser || e.Environment == "browser"
	}
	if !browser {
		t.Fatal("ordinary binder lost invoked captured browser donor", application.Analysis.Callables)
	}
}

// Neither an absent captured/local value nor a defaulted/written formal is an
// unbound declaration slot. These cases must retain their existing acquisition.
func TestPendingDescriptorFormalNonformalFallback(t *testing.T) {
	for _, row := range []struct{ name, setup, body string }{
		{"capture", `declare const external:object;`, strings.Replace(pendingDescriptorBody, `Object.create(prototype)`, `Object.create(external)`, 1)},
		{"default", ``, strings.Replace(pendingDescriptorBody, `read(prototype:object)`, `read(prototype:object={})`, 1)},
		{"written", ``, strings.Replace(pendingDescriptorBody, `const before=`, `prototype={};const before=`, 1)},
	} {
		t.Run(row.name, func(t *testing.T) {
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/descriptor-formal-nonformal.ts", Source: pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + row.setup + row.body, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			for _, p := range s.projects {
				for _, a := range p.callableCache.bySource {
					for _, f := range a.facts {
						if f.summary.Name == "read" && f.pendingMembers != nil && f.pendingMembers.stats.FormalProjectionRegistered != 0 {
							t.Fatal("nonformal became relative", f.pendingMembers.stats)
						}
					}
				}
			}
		})
	}
}

// Issuer and lifetime protections are independent of the source-produced
// positive. These requests deliberately have no right to consume any projection.
func TestPendingDescriptorFormalAuthority(t *testing.T) {
	source := pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + strings.Replace(pendingDescriptorBody, `function read(`, `function invoke(`, 1)
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, _ *ast.Node) {
		var call *ast.Node
		walkNode(q.effectOwner, func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				expression := unwrapSourceCallableReference(node.Expression())
				if ast.IsPropertyAccessExpression(expression) && expression.AsPropertyAccessExpression().Name().Text() == "create" {
					call = node
				}
			}
			return true
		})
		var facts []callableFacts
		for _, analysis := range q.executable.project.callableCache.bySource {
			for _, fact := range analysis.facts {
				if fact.node == q.effectOwner {
					facts = append(facts, cloneProjectCallableFact(fact))
				}
			}
		}
		if call == nil || len(facts) != 1 || facts[0].pendingMembers == nil {
			t.Fatal("missing actual source projection")
		}
		// Reopen only descriptive rows in this independent owner-lifetime test.
		// No cached issuer or query is restored. The positive traversal above
		// separately proves that original collection produces these records.
		for _, row := range facts[0].pendingMembers.descriptorProjections {
			row.settled = false
		}
		restore := registerWriterInputFacts(q.executable, facts)
		defer restore()
		q.reading = call
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		q.initializing = call
		if !r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("valid issuing source request did not accept relative input")
		}
		copy := *q
		if r.pendingDescriptorFormal(&copy, 0, nil, &accessorCandidates{}) {
			t.Fatal("copied query inherited issuer")
		}
		q.inputs = &sourceValueInputs{declaration: q.effectOwner}
		if r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("installed frame became relative")
		}
		q.inputs = nil
		q.callerInputs = &sourceCallerInputOwner{}
		if r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("caller input authority became relative")
		}
		q.callerInputs = nil
		q.installedReceiverCall = &sourceInstalledReceiverCall{}
		if r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("installed receiver authority became relative")
		}
		q.installedReceiverCall = nil
		q.sourceReceiver = &sourceReceiverInputs{}
		if r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("borrowed receiver became relative")
		}
		q.sourceReceiver = nil
		r.revoke()
		if r.pendingDescriptorFormal(q, 0, nil, &accessorCandidates{}) {
			t.Fatal("expired request consumed relative proof")
		}
	})
}

// A known authored callee contributes eagerly even though the prototype formal
// is unavailable. Relative writer exposure cannot erase callee execution.
func TestPendingDescriptorFormalEagerCallee(t *testing.T) {
	source := pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + `const operations={create(prototype:object){document.title;return {}}};` + strings.Replace(pendingDescriptorBody, `Object.create(prototype)`, `operations.create(prototype)`, 1)
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/descriptor-formal-callee.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	browser, unknown := false, false
	for _, e := range findCallable(t, r.Analysis.Callables, "read").EffectSources {
		browser = browser || e.Environment == "browser"
		unknown = unknown || e.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatal("eager known callee or independent unknown lost", r.Analysis.Callables)
	}
}
