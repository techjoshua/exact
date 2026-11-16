package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

const pendingMemberSource = `declare const choose:boolean;declare const other:{get(value:unknown):unknown};const table=choose?{get(value:unknown){document.title;return value}}:other;export function invoke(prototype:unknown){return table.get(prototype)}`

// The source selection owner, not a test-constructed candidate, supplies a late
// known alternative plus independent unknown after the demand is registered.
func TestPendingMemberSourceDelivery(t *testing.T) {
	withWriterInputGraph(t, pendingMemberSource, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		var donor *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
			if ast.IsMethodDeclaration(n) && callableNameText(n.Name()) == "get" {
				donor = n
			}
			return true
		})
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if donor == nil || r.member == nil || r.member.phase != memberRegistered {
			t.Fatal("missing source demand")
		}
		ledger := r.member.publisher.fact.pendingMembers
		if ledger.stats.Requested != 1 || !r.member.demand.rolesResolved {
			t.Fatal("source demand was not resolved lazily")
		}
		facts := []callableFacts{*r.member.publisher.fact, {node: donor}}
		work := newCallableEffectWork(facts)
		work.dirty[0] = false
		before := accessorCandidates{}
		q.initializing = call
		if _, ok := r.pendingMemberComponent(q, -1, nil, &before); ok {
			t.Fatal("registration acknowledged itself")
		}
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member.phase != memberAcknowledged || !r.member.unknown || len(r.member.values) == 0 || r.member.values[0].node != donor {
			t.Fatal("source producer did not transfer known plus unknown", r.member.phase, r.member.unknown, len(r.member.values))
		}
		if !work.refreshPendingMembers(facts, 0) || !work.dirty[0] || len(work.memberCallers[1]) != 1 {
			t.Fatal("late source delivery did not dirty existing fact work")
		}
		work.dirty[0] = false
		work.notifyPendingMemberDonors(facts, 1)
		if !work.dirty[0] || len(facts[0].summary.Calls) != 0 || len(facts[0].targets) != 0 {
			t.Fatal("exposure became invocation or missed later donor notification")
		}
		result := accessorCandidates{}
		scopes := q.refusedMemberWriterScopes(donor, call, nil, &result, r)
		if len(scopes) != len(r.member.values) || !result.opaque || ledger.stats.SkippedCallee == 0 || ledger.stats.RelativeArguments == 0 {
			t.Fatal("ACK did not retire exact recovery with donor and relative uncertainty", len(scopes), ledger.stats)
		}
		if ledger.stats.Consumed != 1 {
			t.Fatal("ACK ticket consumption counted per component", ledger.stats)
		}
		// A copy of the fact has independent mutable bookkeeping and no publisher right.
		clone := cloneProjectCallableFact(facts[0])
		clone.pendingMembers.sites[call].donors = nil
		if len(ledger.sites[call].donors) != 1 {
			t.Fatal("fact clone mutated original source relationship")
		}
	})
}

func TestPendingMemberIssuerCutAndExpiry(t *testing.T) {
	withWriterInputGraph(t, pendingMemberSource, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if r.member == nil {
			t.Fatal("missing demand")
		}
		copied := *q
		copied.initializing = call
		copied.pendingMemberRequest = r
		copied.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		if r.member.phase != memberRegistered {
			t.Fatal("copied query acquired publisher authority")
		}
		q.initializing = call
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member.phase != memberAcknowledged {
			t.Fatal("issuer never acknowledged")
		}
		part := accessorCandidates{}
		old := q.reading
		q.reading = nil
		if _, ok := r.pendingMemberComponent(q, -1, nil, &part); ok {
			t.Fatal("different source cut used acknowledgement")
		}
		q.reading = old
		saved := r.member
		r.revoke()
		q.reading, q.initializing = call, call
		if _, ok := r.pendingMemberComponent(q, -1, nil, &part); ok || saved.phase != memberRevoked || saved.values != nil {
			t.Fatal("expired issuer or borrowed values survived")
		}
	})
}

// An ambient method signature and a WeakMap annotation are not an acquired
// member alternative. The exact opaque-operation family must remain pending
// when no reached producer has supplied genuine selection evidence. A fresh
// source owner excludes construction facts from the syntax/type preflight.
func TestPendingMemberNoTypeBrandOrUnknownACK(t *testing.T) {
	for _, source := range []string{
		`declare const table:WeakMap<object,object>;export function invoke(prototype:object){return table.get(prototype)}`,
		`const table=new WeakMap<object,object>();export function invoke(prototype:object){table.set(prototype,{})}`,
		`const table=new WeakMap<object,object>();export function invoke(prototype:object){return table.get(prototype)}`,
		`const table=new WeakMap<object,object>();export function invoke(prototype:object){table.set(prototype,prototype)}`,
		`declare const table:{get(value:unknown):unknown};export function invoke(prototype:unknown){return table.get(prototype)}`,
	} {
		withStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			if r.member == nil {
				t.Fatal("source relationship missing")
			}
			q.initializing = call
			q.pendingMemberRequest = r
			q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
			q.pendingMemberRequest = nil
			if r.member.phase != memberRegistered {
				t.Fatal("type, New syntax or unknown alone issued ACK")
			}
			part := accessorCandidates{}
			q.reading, q.initializing = call, call
			if _, ok := r.pendingMemberComponent(q, -1, nil, &part); ok {
				t.Fatal("pending relation retired recovery")
			}
		})
	}
}

// Merely exposing a callback as data cannot publish a body invocation edge.
// A rest selector stays with the established ordered-rest consumer.
func TestPendingMemberDormantAndOrderedRoles(t *testing.T) {
	const source = `const table={get(...values:unknown[]){return values}};function writer(){document.title}export function invoke(first:unknown,...callbacks:(()=>void)[]){return table.get(callbacks[0],first,writer)}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if r.member == nil {
			t.Fatal("missing demand")
		}
		args := r.member.demand.arguments
		if len(args) != 3 || args[0].kind == memberFormal || args[1].kind != memberFormal || args[1].position != 0 {
			t.Fatal("source argument roles/order collapsed", args)
		}
		fact := r.member.publisher.fact
		q.initializing = call
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if len(fact.summary.Calls) != 0 || len(fact.targets) != 0 || len(fact.summary.DirectEffectSources) != 0 {
			t.Fatal("stored/argument callback executed by publication")
		}
		q.reading, q.initializing = call, call
		part := accessorCandidates{}
		if _, ok := r.pendingMemberComponent(q, 0, nil, &part); ok {
			t.Fatal("rest position treated as empty formal")
		}
	})
}

func TestPendingMemberFactoryCaptureRemainsOriginal(t *testing.T) {
	const source = `function make(box:{value:number}){return {get(value:unknown){box.value++;return box.value}}}const table=make({value:1});export function invoke(prototype:unknown){return table.get(prototype)}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if r.member == nil {
			t.Fatal("missing factory member demand")
		}
		q.initializing = call
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member.phase == memberAcknowledged {
			t.Fatal("creator-dependent factory capture detached without proof")
		}
	})
}

func TestPendingMemberUnrelatedCallKeepsOriginal(t *testing.T) {
	source := `declare const choose:boolean;declare const other:{get(value:unknown):unknown};const table=choose?{get(value:unknown){document.title;return value}}:other;function unrelated(){return 0}export function invoke(prototype:unknown){unrelated();return table.get(prototype)}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		var donor, unrelated *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
			if ast.IsMethodDeclaration(n) && callableNameText(n.Name()) == "get" {
				donor = n
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "unrelated" {
				unrelated = n
			}
			return true
		})
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		q.initializing = call
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member == nil || r.member.phase != memberAcknowledged || donor == nil || unrelated == nil {
			t.Fatal("missing source controls")
		}
		part := accessorCandidates{}
		if scopes := q.refusedMemberWriterScopes(donor, unrelated, nil, &part, r); len(scopes) != 0 {
			t.Fatal("unrelated Call borrowed transferred donor")
		}
	})
}

func TestPendingMemberArgumentEffectsStayOriginal(t *testing.T) {
	source := `const table={get(value:unknown){return value}};function change(){table.get=value=>{document.title;return value};return 1}export function invoke(){return table.get(change())}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, last *ast.Node, g *sourceWriterInputGraph) {
		var call *ast.Node
		walkNode(ast.GetSourceFileOfNode(last).AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().AsPropertyAccessExpression().Name().Text() == "get" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("missing original member Call")
		}
		q.reading, q.dependencyUse = call, call
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if r.member == nil {
			t.Fatal("missing source roles")
		}
		q.initializing = call
		q.pendingMemberRequest = r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member.phase == memberAcknowledged {
			t.Fatal("argument effects authorized a differently timed selection borrow")
		}
	})
}

// The ordinary Call producer remains responsible for known execution effects.
// A relative exposure notification cannot replace either this donor or unknown.
func TestPendingMemberKnownAndUnknownEffectsRemain(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/pending-member-effects.ts", Source: pendingMemberSource, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	registeredUnused := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				if fact.node != nil && ast.IsFunctionDeclaration(fact.node) && callableNameText(fact.node.Name()) == "invoke" && fact.pendingMembers != nil {
					registeredUnused = registeredUnused || fact.pendingMembers.stats.NeverNeeded > 0
				}
			}
		}
	}
	if !registeredUnused {
		t.Fatal("AST descent did not preserve an unrequested member site")
	}
	for _, callable := range response.Analysis.Callables {
		if callable.Name != "invoke" {
			continue
		}
		browser, unknown := false, false
		for _, source := range callable.EffectSources {
			browser = browser || source.Environment == "browser"
			unknown = unknown || source.Environment == "unknown"
		}
		if !browser || !unknown {
			t.Fatal("original Call lost known plus unknown effects", callable.EffectSources)
		}
		return
	}
	t.Fatal("missing invocation summary")
}
