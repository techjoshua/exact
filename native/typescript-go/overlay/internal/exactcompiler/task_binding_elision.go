package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prepareTaskBindingElision proves which setup-only task bindings have no
// surviving ordinary value use. It consumes the existing complete reference
// inventory once per original body; it does not infer invocation authority.
// The result belongs to this request's source/checker facts, never Task copies.
func prepareTaskBindingElision(facts *sourceAnalysisFacts, calls map[*ast.Node]*ast.Node, workFacts map[*ast.Node]taskSourceWorkFacts, owner *executableBodyOwner, scopes map[*ast.Node]bool, typeQueries map[string]bool, unknownTypeQuery bool) {
	if facts == nil {
		return
	}
	facts.taskBindingElision = nil
	if len(workFacts) == 0 || owner == nil || owner.values == nil || owner.values.checker != facts.checker {
		return
	}
	index := owner.values.index(facts.source)
	pop := index.privateUses
	if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete || unknownTypeQuery {
		return
	}
	// privateUses.refused governs a different finite observation-only law.
	// JSX/export syntax can refuse that law while the original index still
	// records every runtime identifier. Dynamic code and unresolved identities
	// below independently deny erasure. Fused original type-query names also
	// deny erasure because those references survive in generated TypeScript.
	facts.taskBindingElision = make(map[*ast.Node]bool, len(workFacts))
	for work := range workFacts {
		// Only visited component subtrees have the fused type-query inventory.
		// Module/global helpers retain source bindings without another file walk.
		scope := work.Parent
		for scope != nil && !scopes[scope] {
			scope = scope.Parent
		}
		if scope == nil {
			continue
		}
		if ast.GetSourceFileOfNode(work) != facts.source {
			continue
		}
		var name *ast.Node
		if ast.IsFunctionDeclaration(work) {
			name = work.Name()
		} else if binding := sourceCallableBinding(work); binding != nil {
			name = binding.Name()
		}
		if name == nil || !ast.IsIdentifier(name) || typeQueries[name.Text()] || len(pop.unresolved[""]) != 0 || len(pop.unresolved[name.Text()]) != 0 {
			continue
		}
		symbol := facts.checker.GetSymbolAtLocation(name)
		if symbol == nil {
			continue
		}
		uses := pop.uses[ast.GetSymbolId(symbol)]
		if len(uses) == 0 {
			continue
		}
		elidable := true
		for _, use := range uses {
			call := functionTaskReferenceCall(use.node)
			if call == nil || ast.GetSourceFileOfNode(call) != facts.source {
				elidable = false
				break
			}
			if calls[call] != work {
				elidable = false
				break
			}
		}
		facts.taskBindingElision[work] = elidable
	}
}

// Unknown coverage retains the original ordinary binding. This proof has no
// clone-inherited execution loan: only the exact current source/checker owner
// that produced it can remove source syntax; explicit task facades have priority.
func (lowering *jsxLowering) taskSourceBindingElidable(work *ast.Node) bool {
	f := lowering.analysisFacts
	return f != nil && f.source == lowering.sourceFile && f.checker == lowering.checker && ast.GetSourceFileOfNode(work) == f.source && f.taskBindingElision[work]
}
