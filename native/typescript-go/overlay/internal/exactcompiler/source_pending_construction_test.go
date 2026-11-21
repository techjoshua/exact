package exactcompiler

import (
	"reflect"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The ordinary Session source walker, not a manually invoked New publisher,
// determines both orders. A late source contribution invalidates the earlier
// consumer. A repeated demand still needs a fresh issuer and Get transfer.
func TestPendingConstructionNaturalTraversalOrder(t *testing.T) {
	for _, late := range []bool{true, false} {
		t.Run(map[bool]string{true: "consumer-before-producer", false: "producer-before-consumer"}[late], func(t *testing.T) {
			definition := `export function invoke(prototype:object){return table.get(prototype)}`
			producer := `const table=new WeakMap<object,object>();`
			source := producer + definition
			if late {
				source = definition + producer
			}
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				var ledger *sourcePendingMemberLedger
				for _, analysis := range q.executable.project.callableCache.bySource {
					for _, fact := range analysis.facts {
						if fact.node == q.effectOwner {
							ledger = fact.pendingMembers
						}
					}
				}
				if len(q.executable.standardConstructions) != 1 {
					t.Fatal("natural reached New was not published")
				}
				if late {
					if ledger == nil || ledger.stats.ConstructionDependencies == 0 || ledger.stats.LateConstructionDeliveries == 0 || len(ledger.constructionDeliveries) == 0 {
						t.Fatal("late natural source publication did not invalidate earlier consumer", ledger)
					}
					clone := clonePendingMemberLedger(ledger)
					clone.constructionDeliveries[0].dependency.get = nil
					if ledger.constructionDeliveries[0].dependency.get == nil {
						t.Fatal("clone shares mutable delivery records")
					}
				} else if ledger != nil && ledger.stats.LateConstructionDeliveries != 0 {
					t.Fatal("producer-first case was called a late delivery", ledger.stats)
				}
				facts := []callableFacts{{node: q.effectOwner}}
				restore := registerWriterInputFacts(q.executable, facts)
				defer restore()
				var priorSerial uint64
				for i := 0; i < 2; i++ {
					current := newSourceDependencyQuery(call, q.owner.checker, q.executable, q.effectOwner)
					r := current.registerWriterInputRequest(call)
					if r.member == nil || r.member.phase != memberRegistered {
						t.Fatal("source index revived an old ACK")
					}
					current.initializing, current.pendingMemberRequest = call, r
					current.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
					current.pendingMemberRequest = nil
					if r.member.phase != memberAcknowledged || !r.member.unknown || r.member.standardTransferSerial == 0 || r.member.standardTransferSerial == priorSerial {
						t.Fatal("repeated owner demand lacked fresh actual Get ACK", r.member.phase)
					}
					priorSerial = r.member.standardTransferSerial
					if len(r.member.demand.arguments) != 1 || r.member.demand.arguments[0].kind != memberFormal || r.member.demand.arguments[0].owner != q.effectOwner || r.member.demand.arguments[0].position != 0 {
						t.Fatal("formal was replaced by current caller data")
					}
					result := accessorCandidates{}
					if _, ok := r.pendingMemberComponent(current, -1, nil, &result); !ok || !result.opaque {
						t.Fatal("actual transferred callee recovery was not retired")
					}
					r.revoke()
					if _, ok := r.pendingMemberComponent(current, -1, nil, &result); ok {
						t.Fatal("expired ticket borrowed source delivery")
					}
				}
			})
		})
	}
}

// A custom constructor actually invokes the independently supplied callback.
// Callee coverage must leave this argument's evaluation and donor mapping owned
// by the ordinary New/assignment path, including the unknown sibling.
func TestPendingConstructionSetArgumentDonor(t *testing.T) {
	const source = `declare const choose:boolean;declare const other:()=>void;function writer(){document.title}class Box{constructor(callback:()=>void){callback()}}const table=new WeakMap<object,object>();export function invoke(prototype:object){let domains:Box|undefined;table.set(prototype,(domains=new Box(choose?writer:other)));return domains}`
	checkPendingConstructionTask(t, source, true, true)
}

// The shared New binder preserves defaults and positional rest groups. Passing
// or storing a callback alone never activates its body.
func TestPendingConstructionConstructorInputBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, constructor, actuals string
		browser                    bool
	}{
		{"stored", `class Box{callback:()=>void;constructor(callback:()=>void){this.callback=callback}}`, `writer`, false},
		{"default", `class Box{constructor(callback:()=>void=writer){callback()}}`, ``, true},
		{"rest-quiet-first", `class Box{constructor(...callbacks:(()=>void)[]){callbacks[0]!()}}`, `quiet,writer`, false},
		{"rest-writer-first", `class Box{constructor(...callbacks:(()=>void)[]){callbacks[0]!()}}`, `writer,quiet`, true},
		{"function", `function Box(this:object,callback:()=>void){callback()}const Constructor=Box as unknown as {new(callback:()=>void):object};`, `writer`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			name := "Box"
			if row.name == "function" {
				name = "Constructor"
			}
			source := `function writer(){document.title}function quiet(){}` + row.constructor + `const table=new WeakMap<object,object>();export function invoke(prototype:object){let domains:object|undefined;table.set(prototype,(domains=new ` + name + `(` + row.actuals + `)));return domains}`
			checkPendingConstructionTask(t, source, row.browser, false)
		})
	}
}

func TestPendingConstructionProxyGetUnknown(t *testing.T) {
	const source = `const table=new Proxy(new WeakMap<object,object>(),{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}});export function invoke(prototype:object){return table.get(prototype)}`
	pendingConstructionSummary(t, source, true, true)
}

// Application callers may change their own effects. They cannot install actual
// prototype values, Proxy effects or call frames in the definition's relative
// member obligations. The unchanged definition has the same complete summary.
func TestPendingConstructionRelativeDefinitionInvariant(t *testing.T) {
	const definition = `const table=new WeakMap<object,object>();export function invoke(prototype:object){return table.get(prototype)}`
	baseline := pendingConstructionSummary(t, definition, false, true)
	for _, use := range []string{`invoke({});`, `invoke(new Proxy({},{get(){document.title;return undefined}}));`} {
		actual := pendingConstructionSummary(t, definition+use, false, true)
		if !reflect.DeepEqual(baseline, actual) {
			t.Fatal("application input changed declaration-relative definition", baseline, actual)
		}
	}
}

// checkPendingConstructionTask observes New and writer effects through the
// authored task that needs them. Its result publishes to rendered state.
func checkPendingConstructionTask(t *testing.T, source string, wantBrowser, requireUnknown bool) {
	t.Helper()
	const publish = `this.state.label=invoke({})===undefined?'missing':'found'`
	for _, placement := range []Target{TargetClient, TargetServer} {
		fixture := newPublicAwaitRequiredFixture(t, source+publicAwaitRequiredPage("", publish, placement))
		for _, target := range []Target{TargetClient, TargetServer} {
			request := fixture.request("compile", "entry.tsx")
			request.Target = target
			response := NewSession().Execute(request)
			denied := placement == TargetServer && wantBrowser
			if response.Error != "" || len(response.Analysis.Tasks) != 1 || (response.Code == "") != denied {
				t.Fatal(placement, target, response.Error, response.Diagnostics)
			}
			task := response.Analysis.Tasks[0]
			browser, unknown := false, false
			for _, effect := range task.EffectSources {
				browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "document")
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != wantBrowser || requireUnknown && !unknown {
				t.Fatal(placement, target, task.EffectSources)
			}
			if denied {
				refused := false
				for _, diagnostic := range response.Diagnostics {
					refused = refused || diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals")
				}
				if !refused {
					t.Fatal(placement, target, response.Diagnostics)
				}
			} else if hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(placement, target, response.Diagnostics)
			}
		}
	}
}

func pendingConstructionSummary(t *testing.T, source string, wantBrowser, wantUnknown bool) CallableSummary {
	t.Helper()
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/pending-construction.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, callable := range r.Analysis.Callables {
		if callable.Name != "invoke" {
			continue
		}
		browser, unknown := false, false
		for _, effect := range callable.EffectSources {
			browser = browser || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
		}
		if browser != wantBrowser || unknown != wantUnknown {
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				t.Log("mapped source setter contributions", len(project.callableCache.owner.writerValues))
				for _, analysis := range project.callableCache.bySource {
					for _, fact := range analysis.facts {
						if fact.pendingMembers != nil {
							t.Logf("%s: Get obligations=%d delivered donors=%d retired writer scopes=%d", fact.summary.Name, len(fact.pendingMembers.writerGets), fact.pendingMembers.stats.WriterValueDeliveries, fact.pendingMembers.stats.WriterInputScopesRetired)
						}
					}
				}
			}
			t.Fatal("known/unknown effect contract", callable.EffectSources)
		}
		return callable
	}
	t.Fatal("missing invoke summary")
	return CallableSummary{}
}
