package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDependencyFact is a finite source relationship, not an activation key.
// Paths contribute adjacent member edges, never an ever-growing path string.
// Container slots join their alternatives. Capture and creator endpoints are AST
// identities owned by the current checker. No live scope is retained here.
type sourceDependencyFact struct {
	owner, node, site *ast.Node
	symbol, root      ast.SymbolId
	key, previous     string
	kind              sourceDependencyRelation
	undefined         bool
}

type sourceDependencyRelation uint8

const (
	sourceDependencyOrigin sourceDependencyRelation = iota
	sourceDependencyCreation
	sourceDependencyObservation
	sourceDependencyMember
	sourceDependencyInvocation
	sourceDependencyRest
	sourceDependencyCopied
)

type sourceDependencyEntry struct {
	traceSerial uint64 // disposable observer interval, never read by analysis
	// Each alternative is a source relation, compared by contents. Scope/map
	// allocation identities and completed results never participate in reuse.
	alternatives []map[sourceDependencyFact]bool
}

// enterDependencyBody permits newly reached inputs to an already active source
// summary. Its monotone source facts bound reentry. Saturation keeps unknown;
// body demands and already discovered donors remain in the original consumer.
// Normal execution and unrelated active occurrence fences keep their old guard.
func (query *sourceValueQuery) enterDependencyBody(declaration *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) (func(), bool) {
	if !query.dependenciesOnly {
		return func() {}, false
	}
	progressCount(query, tBodyAttempts, 1)
	progressFrontier(query, declaration, 1)
	entry := query.dependencyEntries[declaration]
	if query.active[declaration] && entry == nil {
		progressCount(query, tActiveWithoutEntry, 1)
		return func() {}, false
	}
	release := func() {}
	if entry == nil {
		if query.dependencyEntries == nil {
			query.dependencyEntries = make(map[*ast.Node]*sourceDependencyEntry)
		}
		entry = &sourceDependencyEntry{traceSerial: progressNewInterval(query, declaration)}
		query.dependencyEntries[declaration] = entry
		release = func() { progressCloseInterval(query, entry.traceSerial); delete(query.dependencyEntries, declaration) }
	}
	previousInterval := query.traceInterval
	query.traceInterval = entry.traceSerial
	originalRelease := release
	release = func() { originalRelease(); query.traceInterval = previousInterval }
	facts := make(map[sourceDependencyFact]bool)
	saturated := false
	add := func(fact sourceDependencyFact) {
		query.recordEstimatedCost(1)
		facts[fact] = true
	}
	ancestors := make(map[sourceDependencyFact]bool)
	var values func(*ast.Node, ast.SymbolId, ast.SymbolId, string, sourceDependencyRelation, []sourceValue)
	var scope func(*ast.Node, acquiredCallableScope, ast.SymbolId, bool)
	scope = func(owner *ast.Node, captured acquiredCallableScope, root ast.SymbolId, rooted bool) {
		for symbol, terms := range captured.bindings {
			inputRoot := root
			if !rooted {
				inputRoot = symbol
			}
			values(owner, symbol, inputRoot, "", sourceDependencyOrigin, terms)
		}
		for body, creator := range captured.creators {
			add(sourceDependencyFact{owner: body, node: creator.invocation, site: creator.returning, root: root, kind: sourceDependencyCreation})
		}
	}
	values = func(owner *ast.Node, symbol, root ast.SymbolId, key string, kind sourceDependencyRelation, terms []sourceValue) {
		for _, value := range terms {
			fact := sourceDependencyFact{owner: owner, node: value.node, symbol: symbol, root: root, key: key, kind: kind, undefined: value.undefined}
			add(fact)
			previous := ""
			edges := make(map[sourceDependencyFact]bool)
			for _, member := range value.path {
				edge := sourceDependencyFact{owner: owner, node: value.node, symbol: symbol, root: root, key: member, previous: previous, kind: sourceDependencyMember}
				add(edge)
				if edges[edge] {
					saturated = true
				}
				edges[edge] = true
				previous = member
			}
			if ancestors[fact] {
				// Repeated source relationships in capture/rest/copied graphs join.
				// Do not distinguish another fresh scope or deeper repeated path.
				saturated = true
				continue
			}
			ancestors[fact] = true
			if value.capture != nil {
				scope(value.node, *value.capture, root, true)
			}
			for _, rest := range value.rest {
				values(value.node, symbol, root, "", sourceDependencyRest, rest)
			}
			for name, copied := range value.copied {
				values(value.node, symbol, root, name, sourceDependencyCopied, copied)
			}
			delete(ancestors, fact)
		}
	}
	for role, node := range map[string]*ast.Node{"read": query.reading, "initialize": query.initializing, "return": query.returning, "caller": query.invoking} {
		add(sourceDependencyFact{node: node, key: role, kind: sourceDependencyObservation})
	}
	add(sourceDependencyFact{owner: declaration, node: invocation, kind: sourceDependencyInvocation})
	scope(declaration, acquiredCallableScope{bindings: bindings, creators: query.creators}, 0, false)
	if inputs != nil {
		scope(declaration, acquiredCallableScope{bindings: inputs.bindings}, 0, false)
		add(sourceDependencyFact{owner: declaration, node: inputs.invocation, kind: sourceDependencyInvocation})
	}
	// Projection saturation is not itself a performed unknown operation.
	// Only an active reentry needs residual uncertainty about a merged context.
	if query.active[declaration] && saturated {
		result.opaque = true
	}
	for _, previous := range entry.alternatives {
		if len(previous) != len(facts) {
			continue
		}
		same := true
		for fact := range facts {
			if !previous[fact] {
				same = false
				break
			}
		}
		if same {
			progressCount(query, tExistingBlocked, 1)
			progressObserveFacts(query, declaration, entry, facts, false, saturated)
			return release, false
		}
	}
	if len(entry.alternatives) == 0 {
		progressCount(query, tFirstAlternative, 1)
	} else {
		progressCount(query, tNewAlternative, 1)
	}
	progressCount(query, tAdmittedFactOccurrences, uint64(len(facts)))
	progressObserveFacts(query, declaration, entry, facts, true, saturated)
	entry.alternatives = append(entry.alternatives, facts)
	return release, true
}
