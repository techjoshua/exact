package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The live original publisher qualifies only the private migration diagnostic.
// No selected method, input binding or output is obtained by this check.
func TestStagedReplacementPendingWriterBoundary(t *testing.T) {
	withReflectiveRelevanceSource(t, pendingMemberSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "get" {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("original member Call missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		query := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
		request := query.registerWriterInputRequest(call)
		if request == nil || request.member == nil {
			t.Fatal("original pending source ticket missing")
		}
		defer request.revoke()
		query.initializing, query.pendingMemberRequest = call, request
		owner.project.stagedReplacement = true
		defer func() { owner.project.stagedReplacement = false }()
		boundary := func(q *sourceValueQuery) (gap stagedReplacementGap, interrupted bool) {
			defer func() {
				if failure := recover(); failure != nil {
					var valid bool
					gap, valid = failure.(stagedReplacementGap)
					if !valid {
						panic(failure)
					}
					interrupted = true
				}
			}()
			q.requireStagedInvocationConsumer(call, sourceInvocationConsumer{})
			return
		}
		gap, interrupted := boundary(query)
		if !interrupted || gap.operation != call || gap.consumer != query.effectOwner || gap.parent.producer.operation != call || gap.demand != "member writer input/source delivery" || gap.transition != "consumeInvocation" {
			t.Fatal("actual source request did not stop before recovery", gap)
		}
		copied := *query
		if _, stopped := boundary(&copied); stopped {
			t.Fatal("copied issuer gained diagnostic source authority")
		}
		for _, row := range []struct {
			name   string
			mutate func() func()
		}{
			{"DEFAULT", func() func() {
				owner.project.stagedReplacement = false
				return func() { owner.project.stagedReplacement = true }
			}},
			{"normal inputs", func() func() { query.inputs = &sourceValueInputs{}; return func() { query.inputs = nil } }},
			{"normal operation", func() func() { query.operation = &sourceOperationContext{}; return func() { query.operation = nil } }},
			{"wrong cut", func() func() { query.reading = call.Expression(); return func() { query.reading = call } }},
			{"expired request", func() func() { request.live = false; return func() { request.live = true } }},
			{"missing publisher", func() func() {
				publisher := owner.pendingMemberPublishers[query.effectOwner]
				delete(owner.pendingMemberPublishers, query.effectOwner)
				return func() { owner.pendingMemberPublishers[query.effectOwner] = publisher }
			}},
			{"copied publisher", func() func() {
				original := request.member.publisher
				copy := *original
				request.member.publisher = &copy
				return func() { request.member.publisher = original }
			}},
			{"cached fact", func() func() {
				publisher := request.member.publisher
				original := publisher.fact
				copy := cloneProjectCallableFact(*original)
				publisher.fact = &copy
				return func() { publisher.fact = original }
			}},
			{"wrong generation", func() func() {
				original := query.owner.generation
				query.owner.generation = new(projectGeneration)
				return func() { query.owner.generation = original }
			}},
		} {
			t.Run(row.name, func(t *testing.T) {
				restore := row.mutate()
				defer restore()
				if _, stopped := boundary(query); stopped {
					t.Fatal("unowned source boundary interrupted unrelated recovery")
				}
			})
		}
		if request.member.consumed || request.member.phase != memberRegistered || len(facts[0].summary.Calls) != 0 {
			t.Fatal("diagnostic consumed a semantic source")
		}
	})
}

// These are the unchanged original G2 functions/imports with only explicit G4
// omitted. Missing source handoff must abort before recursive legacy recovery.
func TestStagedReplacementPendingOriginalCache(t *testing.T) {
	f := newStagedOriginalCacheFixture(t)
	request := f.request("compile", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	response := f.session.Execute(request)
	for _, fragment := range []string{"not yet implemented: member writer input/source delivery", "opaque-operation.ts:", "consumer ", "source operation KindCallExpression@", "attempted legacy transition consumeInvocation"} {
		if !strings.Contains(response.Error, fragment) {
			t.Fatalf("missing actual source boundary %q: %s", fragment, response.Error)
		}
	}
	if response.Code != "" || response.SourceMap != nil || len(response.Analysis.Callables) != 0 {
		t.Fatal("interrupted source published partial artifacts")
	}
	for _, project := range f.session.projects {
		if project.stagedReplacement && !project.abandoned {
			t.Fatal("interrupted source checker remained reusable")
		}
	}
	t.Log(response.Error)
}
