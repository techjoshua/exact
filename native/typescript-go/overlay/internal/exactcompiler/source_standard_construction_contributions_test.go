package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Conditional member provenance must not change the original constructor's
// existing host-effect classification or reject a reached module initializer.
func TestStandardConstructionPreservesModuleEffects(t *testing.T) {
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/standard-constructor-module.ts", Source: `const table=new WeakMap<object,object>();function publish(name:string){const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}export function invoke(key:object){return table.get(key)}`, Target: "client", Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatal(r.Error, r.Diagnostics)
	}
}

// The original writer-input owner, rather than an unscoped second inventory,
// admits computed assignment donors. A dormant writer is not an invocation.
func TestNativeComputedAssignmentWriterAdmission(t *testing.T) {
	for _, reached := range []bool{false, true} {
		source := `declare const key:string;function install(){(Object as any)[key]=function(value:object){document.title;return value}}`
		if reached {
			source += `install();`
		}
		source += `export function read(){return Object.freeze({})}`
		r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-computed-writer.ts", Source: source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		browser := false
		for _, effect := range findCallable(t, r.Analysis.Callables, "read").EffectSources {
			browser = browser || effect.Environment == "browser"
		}
		if browser != reached {
			t.Fatal("computed writer admission", reached, browser)
		}
	}
}

// Only the original reached constructor producer can supply the conditional
// member carrier. Neither compatible annotations nor New syntax at a later Get
// can acknowledge recovery. The Call/output remains independently unresolved.
func TestStandardConstructionOriginalProducerTransfer(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();export function invoke(prototype:object){return table.get(prototype)}`
	for _, reached := range []bool{false, true} {
		withActiveStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
			var site, declaration *ast.Node
			walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
				if ast.IsNewExpression(node) {
					site, declaration = node, sourceStagedModuleOwner(node)
				}
				return true
			})
			if site == nil || !runtimeModuleEvaluation(declaration) {
				t.Fatal("missing original module producer")
			}
			publisher := q.executable.pendingMemberPublishers[declaration]
			if publisher == nil || !publisher.live || publisher.fact == nil {
				t.Fatal("original module fact publisher unavailable")
			}
			if reached {
				visitImplicitAccessors(site, q.owner.checker, nil, q.executable, declaration, nil, func(accessorCandidates) {})
				if len(q.executable.standardConstructions) != 1 || publisher.fact.pendingMembers == nil || publisher.fact.pendingMembers.stats.ConstructionPublications != 1 {
					t.Fatal("original New did not publish its acquired standard contribution")
				}
			}
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			if r.member == nil {
				t.Fatal("missing declaration-relative request")
			}
			q.initializing, q.pendingMemberRequest = call, r
			q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
			q.pendingMemberRequest = nil
			if !reached {
				if r.member.phase == memberAcknowledged {
					t.Fatal("unreached New syntax supplied Get authority")
				}
				return
			}
			if r.member.phase != memberAcknowledged || !r.member.unknown || r.member.publisher.fact.pendingMembers.stats.NativeAlternatives == 0 {
				t.Fatal("source Get did not transfer conditional method plus independent residual", r.member.phase)
			}
			result := accessorCandidates{}
			if values, covered := r.pendingMemberComponent(q, -1, nil, &result); !covered || len(values) != 0 || !result.opaque || !result.valueIncomplete {
				t.Fatal("conditional effect transfer invented output or closed uncertainty")
			}
			if nativeInvocable(sourceNativeWeakMapGetEffect) || nativeInvocable(sourceNativeWeakMapSetEffect) {
				t.Fatal("effect alternative gained native Call/completion rights")
			}
		})
	}
}

// Publication is source-owned. A caller frame, copied New syntax or an annotation
// cannot brand a member, and a factory's construction is not another definition's
// receiver. These controls use actual producers rather than hand-made carriers.
func TestStandardConstructionProducerBarriers(t *testing.T) {
	for _, source := range []string{
		`declare const table:WeakMap<object,object>;export function invoke(prototype:object){return table.get(prototype)}`,
		`class WeakMap {get(value:object){return value}}const table=new WeakMap();export function invoke(prototype:object){return table.get(prototype)}`,
		`function factory(){return new WeakMap<object,object>()}const table=factory();export function invoke(prototype:object){return table.get(prototype)}`,
	} {
		withStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
			// Visit only original module New sites. No extra factory body entry.
			walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
				if ast.IsNewExpression(node) && runtimeModuleEvaluation(node.Parent) {
					facts := []callableFacts{{node: node.Parent}}
					restore := registerPendingMemberFacts(q.executable, facts)
					visitImplicitAccessors(node, q.owner.checker, nil, q.executable, node.Parent, nil, func(accessorCandidates) {})
					restore()
				}
				return true
			})
			if len(q.executable.standardConstructions) != 0 {
				t.Fatal("shadow, type or dormant factory acquired native provenance")
			}
		})
	}
}

// Source-edge indices may deduplicate identities. They must not deduplicate the
// synchronous ordered alternative vector or repeatedly deliver old edges.

// The exact opaque-operation assignment may retire the preargument callee
// recovery. It cannot retire the independent New/assignment argument recovery.
func TestStandardMemberAssignmentKeepsArgumentRecovery(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();export function invoke(prototype:object){let domains:WeakMap<object,object>|undefined;table.set(prototype,(domains=new WeakMap<object,object>()));return domains}`
	withStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
		var moduleNew *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) && runtimeModuleEvaluation(node.Parent) {
				moduleNew = node
			}
			return true
		})
		facts := []callableFacts{{node: moduleNew.Parent}, {node: q.effectOwner}}
		restore := registerPendingMemberFacts(q.executable, facts)
		defer restore()
		visitImplicitAccessors(moduleNew, q.owner.checker, nil, q.executable, moduleNew.Parent, nil, func(accessorCandidates) {})
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		q.initializing, q.pendingMemberRequest = call, r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member == nil || r.member.phase != memberAcknowledged {
			t.Fatal("original Get did not transfer set callee")
		}
		result := accessorCandidates{}
		if _, covered := r.pendingMemberComponent(q, -1, nil, &result); !covered {
			t.Fatal("callee transfer not consumed")
		}
		if _, covered := r.pendingMemberComponent(q, 1, nil, &result); covered {
			t.Fatal("callee ACK erased independent assignment/New argument")
		}
		if !result.opaque || !result.valueIncomplete {
			t.Fatal("set operation acquired closure or output authority")
		}
	})
}

// Real source overrides remain effects even beside a genuine construction.
// Unknown is preserved alongside the writer, rather than replacing its donor.
func TestStandardConstructionOwnWriterAndUnknown(t *testing.T) {
	const source = `declare const choose:boolean;const table=new WeakMap<object,object>();if(choose)table.get=function writer(key:object){document.title;return key};export function invoke(prototype:object){return table.get(prototype)}`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-construction-writer.ts", Source: source, Diagnostics: "semantic"})
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
		if !browser || !unknown {
			t.Fatal("conditional standard contribution hid writer or unknown", callable.EffectSources)
		}
		return
	}
	t.Fatal("missing source invocation")
}

// Identical source/cuts cannot consume a previously acquired transfer. Only a
// producer event belonging to the current live ticket may acknowledge recovery.
func TestStandardMemberTransferCannotReplay(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();export function invoke(prototype:object){return table.get(prototype)}`
	withActiveStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
		var moduleNew *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) && runtimeModuleEvaluation(node.Parent) {
				moduleNew = node
			}
			return true
		})
		visitImplicitAccessors(moduleNew, q.owner.checker, nil, q.executable, sourceStagedModuleOwner(moduleNew), nil, func(accessorCandidates) {})
		first := q.registerWriterInputRequest(call)
		q.initializing, q.pendingMemberRequest = call, first
		copied := *q
		copied.prepareInvocation(call, nil)
		if first.member == nil || first.member.standardTransferSerial != 0 {
			t.Fatal("copied query minted original ticket transfer")
		}
		prepared, _ := q.prepareInvocation(call, nil)
		if first.member == nil || first.member.standardTransferSerial == 0 {
			t.Fatal("original source Get did not issue a ticket-bound transfer")
		}
		q.publishPendingMemberSelection(call, nil, prepared)
		if first.member.phase != memberAcknowledged {
			t.Fatal("original source transfer was not consumable")
		}
		first.revoke()
		second := q.registerWriterInputRequest(call)
		defer second.revoke()
		q.pendingMemberRequest = second
		q.publishPendingMemberSelection(call, nil, prepared)
		q.pendingMemberRequest = nil
		if second.member == nil || second.member.phase == memberAcknowledged || second.member.standardTransferSerial != 0 {
			t.Fatal("cached acquired marker acknowledged a later ticket")
		}
	})
}

// A fresh executable owner starts with no reached-New contributions. The session
// helper first qualifies real syntax/types, then this owner observes only events
// explicitly supplied through the original source producer in the test.
func withStandardConstructionSource(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node, *sourceWriterInputGraph), allowPending ...bool) {
	t.Helper()
	withSourceCalleeWriteQueryStatus(t, source, func(prior *sourceValueQuery, call *ast.Node) {
		owner := newExecutableBodyOwner(prior.executable.project, prior.owner.checker)
		q := newSourceDependencyQuery(call, prior.owner.checker, owner, enclosingCallableNode(call))
		facts := []callableFacts{{node: q.effectOwner}}
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		inspect(q, call, facts[0].writerInputs)
	}, len(allowPending) == 1 && allowPending[0])
}

// withActiveStandardConstructionSource holds the existing source/checker lease
// through original New/Get inspection. Facts come from the shared source-fact
// collector, including module initializer/source-file ownership. The older
// wrapper and its other callers retain their separate setup unchanged.
// Writer discovery can omit reconstruction only after the reached original
// construction and its closed source-use relation identify the whole callee.
func TestPrivateStandardWriterDiscovery(t *testing.T) {
	const table = `const table=new WeakMap<object,()=>string>();`
	for _, tc := range []struct {
		name, setup, invocation string
		excluded                bool
	}{
		{"stored callback", table, "table.set(key,()=>document.title);", true},
		{"private get", table, "return table.get(key);", true},
		{"authored override", table + "table.set=(_key,fn)=>{fn();return table};", "table.set(key,()=>document.title);", false},
		{"escaped receiver", table + "declare function expose(value: typeof table): void; expose(table);", "return table.get(key);", false},
		{"alternative receiver", table + "declare const other: typeof table; declare const flag:boolean; const chosen=flag ? table : other;", "return chosen.get(key);", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := tc.setup + "export function invoke(key:object){" + tc.invocation + "}"
			withActiveStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
				if q.privateStandardWriterCall(call, nil) {
					t.Fatal("unreached construction supplied a writer exclusion")
				}
				walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						visitImplicitAccessors(node, q.owner.checker, nil, q.executable, sourceStagedModuleOwner(node), nil, func(accessorCandidates) {})
					}
					return true
				})
				if got := q.privateStandardWriterCall(call, nil); got != tc.excluded {
					t.Fatalf("writer excluded = %t, want %t", got, tc.excluded)
				}
				if tc.excluded {
					receiver, _ := accessorReceiver(call.Expression())
					symbol := q.owner.checker.GetSymbolAtLocation(receiver)
					if q.privateStandardWriterCall(call, sourceValueBindings{ast.GetSymbolId(symbol): nil}) {
						t.Fatal("private lexical receiver proof accepted a substituted receiver")
					}
				}
			})
		})
	}
}

func withActiveStandardConstructionSource(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node, *sourceWriterInputGraph)) {
	t.Helper()
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				declaration := enclosingCallableNode(node)
				if declaration != nil && declaration.Name() != nil && callableNameText(declaration.Name()) == "invoke" {
					call = node
				}
			}
			return true
		})
		if call == nil {
			t.Fatal("original source callee missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		consumer := enclosingCallableNode(call)
		publisher := owner.pendingMemberPublishers[consumer]
		if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.writerInputs == nil {
			t.Fatal("current original consumer fact unavailable")
		}
		query := newSourceDependencyQuery(call, owner.checker, owner, consumer)
		inspect(query, call, publisher.fact.writerInputs)
	})
}
