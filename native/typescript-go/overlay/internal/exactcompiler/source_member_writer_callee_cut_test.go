package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// The public nested-map journey exercises the live source owner. This supplied
// cut control isolates the ordering boundary without granting a Get capability.
func TestSourceWriterCalleeCutRetainsEarlierAndDeferredOperations(t *testing.T) {
	const source = `const holder={run(...values:unknown[]){}};declare function argument():unknown;declare function deferred():void;function factory(){return holder}export function invoke(){holder.run=()=>{};return factory().run(argument(),()=>deferred())}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, _ *ast.Node) {
		var outer *ast.Node
		calls := map[string]*ast.Node{}
		walkNode(ast.GetSourceFileOfNode(q.effectOwner).AsNode(), func(node *ast.Node) bool {
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				calls["earlier"] = node
			}
			if ast.IsCallExpression(node) {
				if ast.IsIdentifier(node.Expression()) {
					calls[node.Expression().Text()] = node
				} else if ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "run" {
					outer = node
				}
			}
			return true
		})
		if outer == nil {
			t.Fatal("original call")
		}
		q.reading, q.initializing, q.protectedMember = outer, outer, outer.Expression()
		cut := &sourceMemberWriterReadCut{operation: outer, use: outer}
		get := &sourceGetInputs{operation: outer}
		unborrowed := accessorCandidates{}
		if cut.followsCalleeGet(q, get, calls["argument"], &unborrowed) {
			t.Fatal("ordinary retained receiver borrowed native callee cut")
		}
		facts := installationSourceFacts(q)
		request, owned := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, q.effectOwner)], outer, relativeDemandEffects, "callee-cut-control")
		if !owned {
			t.Fatal("original occurrence")
		}
		work := callableEffectWork{extracting: -1}
		revoke, installed := q.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: outer, get: outer.Expression(), request: request})
		if !installed {
			t.Fatal("original callee loan")
		}
		for _, name := range []string{"argument", "earlier", "factory", "deferred"} {
			result := accessorCandidates{}
			if got := cut.followsCalleeGet(q, get, calls[name], &result); got != (name == "argument") {
				t.Fatal("wrong before-argument boundary", name, got)
			}
		}
		q.reading, q.initializing = calls["factory"], calls["factory"]
		receiverCut := &sourceMemberWriterReadCut{operation: calls["factory"], use: calls["factory"]}
		receiverGet := &sourceGetInputs{operation: calls["factory"]}
		result := accessorCandidates{}
		if !receiverCut.followsCalleeGet(q, receiverGet, calls["argument"], &result) {
			t.Fatal("receiver acquisition lost original callee phase")
		}
		receiverCut.afterArguments = &sourceArrayIndexMay{owner: q, operation: outer}
		if receiverCut.followsCalleeGet(q, receiverGet, calls["argument"], &result) {
			t.Fatal("after-argument read inherited earlier cut")
		}
		receiverCut.afterArguments = nil
		generation := q.owner.generation
		q.owner.generation = &projectGeneration{}
		if receiverCut.followsCalleeGet(q, receiverGet, calls["argument"], &result) {
			t.Fatal("expired callee phase")
		}
		q.owner.generation = generation
		copied := *q
		if receiverCut.followsCalleeGet(&copied, receiverGet, calls["argument"], &result) {
			t.Fatal("copied query inherited callee loan")
		}
		revoke()
		if receiverCut.followsCalleeGet(q, receiverGet, calls["argument"], &result) {
			t.Fatal("revoked receiver acquisition loan")
		}

	})
}

// A current callee-before-arguments loan cannot erase a later statement that
// may have replaced the constructor during a previous invocation.
func TestSourceWriterNewCalleeRetainsPriorInvocationWrite(t *testing.T) {
	const source = `class Replacement{constructor(){window.name}callback=()=>document.title}export function invoke(){const result=new WeakMap();WeakMap=Replacement as unknown as WeakMapConstructor;return result}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/new-callee-prior-state.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	browser := false
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "window")
		if strings.Contains(effect.Description, "document") {
			t.Fatal("constructor source transfer invoked a stored callback", effect)
		}
	}
	if !browser {
		t.Fatal("current constructor cut erased prior invocation replacement")
	}
}

func TestSourceWriterCalleeCutModulePredecessors(t *testing.T) {
	const source = `const before=Object.defineProperty({},'before',{});const key=Symbol.for('key');const after=Object.defineProperty({},'after',{});function deferred(){return Object.defineProperty({},'deferred',{})}const box=Object.freeze({});export function invoke(){return box}`
	withStagedKeyModuleQuery(t, source, func(parent *sourceValueQuery) {
		var original *ast.Node
		operations := map[string]*ast.Node{}
		walkNode(ast.GetSourceFileOfNode(parent.effectOwner).AsNode(), func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			if stagedNativeInputIntent(node.Expression()) == sourceNativeSymbolFor {
				original = node
			}
			actuals := restrictedInvocationArguments(node.AsCallExpression())
			if len(actuals) == 3 && ast.IsStringLiteral(actuals[1]) {
				operations[actuals[1].Text()] = node
			}
			return true
		})
		facts := installationSourceFacts(parent)
		declaration := sourceStagedModuleOwner(original)
		query := newSourceDependencyQuery(original, parent.owner.checker, parent.executable, declaration)
		graph, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, declaration)], original, relativeDemandEffects, "module-read-cut")
		if !issued {
			t.Fatal("original module source owner")
		}
		work := callableEffectWork{extracting: -1}
		revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeSymbolFor, call: original, get: original.Expression(), request: graph})
		if !installed {
			t.Fatal("original callee interval")
		}
		defer revoke()
		cut := &sourceMemberWriterReadCut{operation: original, use: original}
		get := &sourceGetInputs{operation: original}
		for name, operation := range operations {
			result := accessorCandidates{}
			if got := cut.followsCalleeGet(query, get, operation, &result); got != (name == "after") {
				t.Fatal("module timing borrowed deferred/earlier state", name, got)
			}
		}
	})
}

// Call and New share the same argument ordering law. The supplied source loan
// isolates this phase only and grants no constructor selection or output.
func TestSourceWriterNewCalleeCutRetainsEarlierAndDeferredOperations(t *testing.T) {
	const source = `declare function argument():unknown;declare function deferred():void;function factory(){return class{constructor(...values:unknown[]){}}}export function invoke(){factory();return new (factory())(argument(),()=>deferred())}`
	withSourceCalleeWriteQueryStatus(t, source, func(parent *sourceValueQuery, _ *ast.Node) {
		var original *ast.Node
		operations := map[string]*ast.Node{}
		walkNode(ast.GetSourceFileOfNode(parent.effectOwner).AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				original = node
			}
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) {
				if node.Expression().Text() == "factory" {
					if original == nil {
						operations["earlier"] = node
					} else {
						operations["callee"] = node
					}
				} else {
					operations[node.Expression().Text()] = node
				}
			}
			return true
		})
		if original == nil || operations["callee"] == nil || operations["earlier"] == nil {
			t.Fatal("original constructor expression missing")
		}
		q := newSourceDependencyQuery(original, parent.owner.checker, parent.executable, parent.effectOwner)
		defer q.publishDependencyStatistics()
		facts := installationSourceFacts(q)
		request, owned := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, q.effectOwner)], original, relativeDemandEffects, "original-New-callee-cut")
		if !owned {
			t.Fatal("original New occurrence missing")
		}
		work := callableEffectWork{extracting: -1}
		revoke, installed := work.beginStagedMemberWork(q, facts, request)
		if !installed {
			t.Fatal("original member source loan missing")
		}
		defer revoke()
		borrow := q.stagedMember
		cut := &sourceMemberWriterReadCut{operation: original, use: original}
		get := &sourceGetInputs{operation: original}
		if q.originalSourceCalleeOperation() != nil {
			t.Fatal("New root alone supplied a callee phase")
		}
		borrow.constructionCallee = true
		for _, name := range []string{"argument", "earlier", "callee", "deferred"} {
			result := accessorCandidates{}
			if got := cut.followsCalleeGet(q, get, operations[name], &result); got != (name == "argument") {
				t.Fatal("wrong New argument boundary", name, got)
			}
		}
		borrow.constructionCallee = false
		if cut.followsCalleeGet(q, get, operations["argument"], &accessorCandidates{}) {
			t.Fatal("later prototype Get borrowed constructor selection phase")
		}
		borrow.constructionCallee = true
		copy := *q
		if cut.followsCalleeGet(&copy, get, operations["argument"], &accessorCandidates{}) {
			t.Fatal("copied issuer inherited constructor phase")
		}
		revoke()
		if cut.followsCalleeGet(q, get, operations["argument"], &accessorCandidates{}) {
			t.Fatal("revoked constructor phase survived")
		}
	}, true)
}
