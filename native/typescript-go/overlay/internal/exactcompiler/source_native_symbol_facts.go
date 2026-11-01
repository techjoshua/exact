package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceSymbolNativeFacts is a finite pre-entry classification, not a KEY
// issuer, completed read or builtin-integrity certificate. The common owner
// must additionally validate the exact emitted prefix and bind its native case.
// No query, frame, callback or runtime storage is retained here.
type sourceSymbolNativeFacts struct {
	source               *ast.SourceFile
	global, member       *ast.Symbol
	first, last, call    *sourceNormalOccurrence
	selection            *sourceNormalViewIdentity
	computedName         *ast.Node
	blockedAt            *ast.Node
	referencesIncomplete bool
	executableOpaque     bool
}

// nativeSymbolSourceFacts consumes an already completed source-selection view
// explicitly, after ensureNormalSourceSelection has returned. It never consults active reading/initializing/returning state and
// never prepares a view or evaluates an origin. Passing this classification
// preserves only a possible standard entry, never exclusive runtime identity.
// The first experiment rejects all executable dependencies and any eager
// interfering inventory before the last KEY. Exact prefix proof is still due.
func (q *sourceValueQuery) nativeSymbolSourceFacts(source *ast.SourceFile, first, last, call *ast.Node, selection *sourcePropertyReferenceView, result *accessorCandidates, recipe *storageRecipe) (sourceSymbolNativeFacts, bool) {
	f := sourceSymbolNativeFacts{source: source}
	if result == nil || q == nil || q.owner == nil || q.owner.checker == nil || source == nil || first == nil || last == nil || call == nil || selection == nil {
		return f, false
	}
	if selection.owner != q.owner || selection.program != q.owner.program || selection.checker != q.owner.checker || selection.generation != q.owner.generation || selection.executable != q.executable || selection.state == sourcePropertyDisposed || selection.source != source || !selection.normalSelectionDone || selection.normalIdentity == nil {
		return f, false
	}
	s := selection.normalSources[source]
	index, indexed := q.owner.indexes[source]
	if !indexed || index.incomplete || index.normalDynamicScope || s == nil || s.source != source || s.cyclic || s.population == nil {
		return f, false
	}
	if selection.incomplete {
		f.blockedAt, f.executableOpaque = source.AsNode(), true
	}
	f.selection = selection.normalIdentity
	f.first, f.last, f.call = index.normalOccurrences[first], index.normalOccurrences[last], index.normalOccurrences[call]
	for _, e := range [3]*sourceNormalOccurrence{f.first, f.last, f.call} {
		if !q.charge(result, call) || e == nil || !e.once || e.region != nil || e.node == nil || ast.GetSourceFileOfNode(e.node) != source || s.population.entries[e.node] != e || e.parent != index.normalOccurrences[e.node.Parent] {
			return f, false
		}
	}
	shapeFirst, shapeLast, shapePut, twoBinding := bindingSymbolWrite(recipe)
	if twoBinding {
		if recipe.body != source.AsNode() || recipe.binding.declaration != call || recipe.events[shapeFirst].node != first || recipe.events[shapeLast].node != last {
			return f, false
		}
	} else if recipe != nil && recipe.binding != nil && first != last {
		return f, false
	}
	if supportedBindingDeclaration(call) {
		if twoBinding {
			if f.first == f.last || f.last.ordinal != f.first.ordinal+2 || f.call.ordinal != f.last.ordinal+1 || f.last.callOwner != nil || f.call.callOwner != nil || f.call.statement != call.Parent.Parent || f.last.statement != recipe.events[shapePut].node.Parent {
				return f, false
			}
		} else if first != last || f.first != f.last || f.first.ordinal >= f.call.ordinal || f.call.statement != call.Parent.Parent || f.call.callOwner != nil {
			return f, false
		}
	} else if f.first == f.last || f.first.ordinal >= f.last.ordinal || f.last.ordinal != f.call.ordinal || f.last.callOwner != f.call {
		return f, false
	}
	// nativeWellKnownKey recognizes declarations only. This does not erase the
	// complement of the native standard-entry alternative.
	_, f.member = q.nativeWellKnownKey("iterator", result)
	f.global = q.owner.checker.GetGlobalSymbol("Symbol", ast.SymbolFlagsValue, nil)
	if f.global == nil || f.member == nil {
		return f, false
	}
	for _, n := range [2]*ast.Node{first, last} {
		if !q.charge(result, n) || !ast.IsPropertyAccessExpression(n) {
			return f, false
		}
		m := n.AsPropertyAccessExpression()
		if !ast.IsIdentifier(m.Expression) || q.owner.checker.GetSymbolAtLocation(m.Expression) != f.global || q.owner.checker.GetSymbolAtLocation(m.Name()) != f.member {
			return f, false
		}
	}
	// Consume the existing dependency classification, including unavailable
	// and explicitly opaque states. No module is entered or re-resolved here.
	for _, d := range selection.edges {
		if !q.charge(result, d.edge) {
			return f, false
		}
		if d.state == sourceDependencyErased {
			continue
		}
		f.blockedAt = d.edge
		f.referencesIncomplete = f.referencesIncomplete || d.state == sourceDependencyReferencesUnavailable
		f.executableOpaque = f.executableOpaque || d.state != sourceDependencyReferencesUnavailable
	}
	// The bounded experiment has no executed dependency. Complete inventory
	// coverage must agree with selection, rather than treating no edges as none.
	for _, edge := range index.runtimeImports {
		if !q.charge(result, edge) {
			return f, false
		}
		found := false
		for _, d := range selection.edges {
			if !q.charge(result, edge) {
				return f, false
			}
			found = found || d.edge == edge
		}
		if !found {
			f.blockedAt, f.executableOpaque = edge, true
		}
	}
	// Existing eager-region inventories include delete, compound and implicit
	// hazard routes absent from plain assignment buckets. No alias evaluation
	// is used to pronounce an unknown receiver disjoint from Symbol. The one
	// exact computed KEY name remains a pending recipe-proof obligation.
	if region := index.operationRegions[nil]; region != nil {
		for _, group := range [4][]*ast.Node{region.writes, region.hazards, region.openCalls, region.calls} {
			for _, n := range group {
				if !q.charge(result, n) {
					return f, false
				}
				e := index.normalOccurrences[n]
				if e == nil || e.region != nil {
					return f, false
				}
				horizon := f.last.ordinal
				if twoBinding {
					horizon = f.call.ordinal
				}
				if n == call || e.ordinal > horizon {
					continue
				}
				if twoBinding {
					// Exact pending binding structure is not eager prefix work.
					if n == call.Name() && ast.IsArrayBindingPattern(n) {
						continue
					}
					write := recipe.events[shapePut].node.AsBinaryExpression()
					if n == write.Left && e.ordinal == f.last.ordinal && e.statement == recipe.events[shapePut].node.Parent && e.parent == index.normalOccurrences[recipe.events[shapePut].node] {
						continue
					}
				}
				if n == first.Parent && ast.IsComputedPropertyName(n) && n.Parent != nil && n.Parent.Name() == n && (ast.IsPropertyAssignment(n.Parent) || ast.IsGetAccessorDeclaration(n.Parent) && !twoBinding && recipe != nil && first == last && func() bool {
					for pc, event := range recipe.events {
						if event.node == n.Parent && event.kind == "DefineAccessorSlot" && storageComputedGetterDefinition(recipe, pc) && recipe.events[event.keyProducerPC].node == first {
							return true
						}
					}
					return false
				}()) {
					f.computedName = n
					continue
				}
				f.blockedAt, f.executableOpaque = n, true
			}
		}
	}
	return f, f.blockedAt == nil
}
