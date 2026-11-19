package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type sourceWriterInputKind uint8

const (
	writerInputUnknown sourceWriterInputKind = iota
	writerInputNoncallable
	writerInputExternal
	writerInputCallable
	writerInputBinding
	writerInputRest
)

// sourceWriterInputNode is a declaration-relative exposure recipe. It contains
// source identities only, never current values, scopes, frames or query results.
// Noncallable is conditional on normal expression completion, not its proof.
type sourceWriterInputNode struct {
	traceRecipeReason string // diagnostic-only explanation of an already evaluated branch

	expression, declaration *ast.Node
	kind                    sourceWriterInputKind
	symbol                  ast.SymbolId
	binding                 *ast.Symbol
	child                   *sourceWriterInputNode
	index                   uint64
}

type sourceWriterInputEdge struct {
	operation, from, to *ast.Node
	role                string
	position            int
}

// sourceWriterInputStats separates graph growth from accepted/replayed work.
// Delivered counts are occurrences, not distinct dynamic contexts or cache hits.
type sourceWriterInputStats struct {
	NewNodes, NewEdges, NewFacts                                                                 uint64
	Collections, ReusedNodes, CoveredComponents, UncoveredComponents                             uint64
	KnownCallableOccurrences, DiscoveryRetired, RecoveryRetired, FallbackEntries, FallbackYields uint64
}

// sourceWriterInputGraph belongs to the existing owning callable fact. Recipes
// remain parameterized by current inputs. Edges do not execute a stored callback
// and cannot grant native identity, alias equality, completion or NoWrites.
type sourceWriterInputGraph struct {
	memberCaptureSyntax map[*ast.Node]bool // generation-owned lexical syntax only, never a context/value cache

	consumer *ast.Node
	nodes    map[*ast.Node]*sourceWriterInputNode
	edges    map[sourceWriterInputEdge]bool
	stats    sourceWriterInputStats
	calls    map[*ast.Node]*sourceWriterInputCall
}

// sourceWriterInputCall caches only source argument/receiver recipes. Input
// alternatives and query authority never enter this declaration-owned plan.
type sourceWriterInputCall struct {
	receiver  *sourceWriterInputNode
	arguments []*sourceWriterInputNode
}

// registerWriterInputFacts installs existing facts before recursive discovery.
// Recursive source collection restores the prior owner registry. The graph has
// no callback or live source-query association and is not a result cache.
func registerWriterInputFacts(owner *executableBodyOwner, facts []callableFacts, works ...*callableEffectWork) func() {
	if owner == nil || len(facts) == 0 {
		return func() {}
	}
	if owner.writerInputFacts == nil {
		owner.writerInputFacts = make(map[*ast.Node]*sourceWriterInputGraph)
	}
	type replacedFact struct {
		node  *ast.Node
		graph *sourceWriterInputGraph
	}
	var replaced []replacedFact
	for i := range facts {
		fact := &facts[i]
		if fact.writerInputs == nil {
			fact.writerInputs = &sourceWriterInputGraph{consumer: fact.node}
		}
		if graph, present := owner.writerInputFacts[fact.node]; present {
			replaced = append(replaced, replacedFact{fact.node, graph})
		}
		owner.writerInputFacts[fact.node] = fact.writerInputs
	}
	restoreMembers := registerPendingMemberFacts(owner, facts)
	if len(works) == 1 && works[0] != nil {
		work := works[0]
		if work.operationFacts == nil {
			work.indexOperationSources(facts)
		}
		for i := range facts {
			publisher := owner.pendingMemberPublishers[facts[i].node]
			publisher.workRegistrar = &sourcePendingMemberWorkRegistrar{
				arrayPush: func(q *sourceValueQuery, call *ast.Node, selected sourceValue, receiver *ast.Node, origin sourceValue) {
					if work.purpose == callableMayEffects {
						return
					}
					work.publishArrayPushEffects(facts, owner, publisher, q, call, selected, receiver, origin)
				},
				writerScopeSource: func(q *sourceValueQuery, request *sourceWriterInputRequest) {
					if work.purpose == callableMayEffects {
						return
					}
					work.registerDeclarationWriterScope(facts, owner, publisher, q, request)
				},
				installedCallSelection: func(q *sourceValueQuery, call *ast.Node) (func(), bool) {
					if work.purpose == callableMayEffects {
						return func() {}, false
					}
					if q == nil || q.owner == nil || owner.values == nil || q.executable != owner || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || !publisher.live || publisher.fact == nil || owner.pendingMemberPublishers[q.effectOwner] != publisher || publisher.fact.node != q.effectOwner || call == nil {
						return func() {}, false
					}
					return work.beginInstalledSourceCallSelection(facts, q, call)
				},
				descriptorTarget: func(q *sourceValueQuery, call *ast.Node, selected sourceValue, bindings sourceValueBindings) bool {
					if work.purpose == callableMayEffects {
						return false
					}
					if q == nil || q.executable != owner || publisher == nil || !publisher.live || publisher.fact == nil || owner.pendingMemberPublishers[q.effectOwner] != publisher || publisher.fact.node != q.effectOwner {
						return false
					}
					original, issued := stagedNativeInputOccurrenceRequest(publisher.fact, call)
					if !issued {
						return false
					}
					source := work.operationRecipes[original.producer].nativeGet
					if !validDescriptorRetrieval(source) || source.request.producer.operation != call {
						return false
					}
					if !work.descriptorStrongTargetDemand(source) {
						return false
					}
					event, revoke, admitted := work.beginDescriptorTargetSource(facts, q, nativeRootDebtRequest(source, "algorithm"), source, selected)
					if !admitted {
						return false
					}
					defer revoke()
					plan, enumerated := work.enumerateDescriptorTargetSource(facts, q, event, bindings)
					return enumerated && work.publishDescriptorTargetSource(facts, q, event, plan)
				},
				originalGetMutation: func(q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue, ownMembers ...*ast.Node) bool {
					if work.purpose == callableMayEffects {
						return false
					}
					if q == nil || q.owner == nil || q.executable != owner || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || !publisher.live || publisher.fact == nil || owner.pendingMemberPublishers[q.effectOwner] != publisher || publisher.fact.node != q.effectOwner {
						return false
					}
					return work.publishOriginalGetMutationSource(facts, q, get, cut, mode, origin, projection, name, standard, ownMembers...)
				},
				descriptorSource: func(q *sourceValueQuery, request *sourceWriterInputRequest) {
					if work.purpose == callableMayEffects {
						return
					}
					work.registerDescriptorWriterSource(facts, owner, publisher, q, request)
				},
				descriptorPhases: func(q *sourceValueQuery, call *ast.Node, selected sourceValue) (func(), bool) {
					if work.purpose == callableMayEffects {
						return func() {}, false
					}
					if q == nil || q.owner == nil || q.executable != owner || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || !publisher.live || publisher.fact == nil || owner.pendingMemberPublishers[q.effectOwner] != publisher || publisher.fact.node != q.effectOwner || call == nil {
						return func() {}, false
					}
					original, issued := stagedNativeInputOccurrenceRequest(publisher.fact, call)
					if !issued {
						return func() {}, false
					}
					source := work.operationRecipes[original.producer].nativeGet
					if !validDescriptorRetrieval(source) || source.request.producer.operation != call {
						return func() {}, false
					}
					return work.beginInstalledDescriptorMemberPhases(facts, q, nativeRootDebtRequest(source, "algorithm"), source, selected)
				},
				installedPhase: func(q *sourceValueQuery, parent sourceStagedOperationRequest, get *sourceGetInputs, cut *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string, receiver sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool) {
					if work.purpose == callableMayEffects {
						return nil, func() {}, false
					}
					if q == nil || q.owner == nil || q.executable != owner || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || !publisher.live || publisher.fact == nil || owner.pendingMemberPublishers[q.effectOwner] != publisher || publisher.fact.node != q.effectOwner {
						return nil, func() {}, false
					}
					return work.beginInstalledMemberPhase(facts, q, parent, get, cut, phase, key, receiver)
				},
			}
		}
	}
	return func() {
		restoreMembers()
		for i := range facts {
			delete(owner.writerInputFacts, facts[i].node)
		}
		for _, old := range replaced {
			owner.writerInputFacts[old.node] = old.graph
		}
	}
}

func (g *sourceWriterInputGraph) edge(edge sourceWriterInputEdge) {
	if g.edges == nil {
		g.edges = make(map[sourceWriterInputEdge]bool)
	}
	if !g.edges[edge] {
		g.edges[edge] = true
		g.stats.NewEdges++
	}
}

func (g *sourceWriterInputGraph) recipe(q *sourceValueQuery, expression *ast.Node) *sourceWriterInputNode {
	q.recordEstimatedCost(1)
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return nil
	}
	if prior := g.nodes[expression]; prior != nil {
		g.stats.ReusedNodes++
		return prior
	}
	n := &sourceWriterInputNode{expression: expression, traceRecipeReason: "syntax-outside-recipe-vocabulary"}
	if g.nodes == nil {
		g.nodes = make(map[*ast.Node]*sourceWriterInputNode)
	}
	g.nodes[expression] = n
	g.stats.NewNodes++
	switch {
	case sourcePrimitiveValue(expression), ast.IsTemplateExpression(expression), ast.IsObjectLiteralExpression(expression), ast.IsArrayLiteralExpression(expression):
		// These expressions cannot themselves be source functions. Their child
		// evaluation/coercion belongs to the original Call's effect consumer.
		n.kind = writerInputNoncallable
	case isWriterInputCallable(expression):
		n.kind, n.declaration = writerInputCallable, expression
	case standardLibraryCallRoot(expression, q.owner.checker):
		// Reuse the existing genuine-standard acquisition policy. This is only
		// absence of an authored source body at that entry, not operation purity.
		n.kind = writerInputExternal
	case expression.Kind == ast.KindThisKeyword:
		n.kind = writerInputBinding
		g.edge(sourceWriterInputEdge{from: expression, to: g.consumer, role: "receiver", position: -1})
	case ast.IsIdentifier(expression):
		symbol := q.owner.checker.GetSymbolAtLocation(expression)
		if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 {
			n.traceRecipeReason = "identifier-declaration-or-alias-gate"
			break
		}
		n.symbol, n.binding, n.declaration = ast.GetSymbolId(symbol), symbol, symbol.ValueDeclaration
		index := q.owner.index(ast.GetSourceFileOfNode(n.declaration))
		if index.incomplete || index.normalDynamicScope || q.owner.bindingWritten(symbol) {
			n.traceRecipeReason = "incomplete-dynamic-index-or-written-binding"
			break
		}
		n.kind = writerInputBinding
		role := "local-binding"
		if ast.IsParameterDeclaration(n.declaration) {
			role = "formal"
			position := 0
			if owner := enclosingCallableNode(n.declaration); owner != nil {
				for _, parameter := range owner.Parameters() {
					if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
						continue
					}
					if parameter == n.declaration {
						break
					}
					position++
				}
			}
			g.edge(sourceWriterInputEdge{from: expression, to: n.declaration, role: role, position: position})
		} else {
			g.edge(sourceWriterInputEdge{from: expression, to: n.declaration, role: role})
		}
		if enclosingCallableNode(expression) != enclosingCallableNode(n.declaration) {
			g.edge(sourceWriterInputEdge{from: expression, to: n.declaration, role: "lexical-capture"})
		}
	case ast.IsElementAccessExpression(expression):
		access := expression.AsElementAccessExpression()
		if access.ArgumentExpression == nil || !ast.IsStringLiteral(access.ArgumentExpression) && !ast.IsNumericLiteral(access.ArgumentExpression) {
			break
		}
		key := sourceMemberKey(access.ArgumentExpression)
		index, ok := sourceArrayIndex(key.name)
		if !key.resolved || !ok || !ast.IsIdentifier(unwrapSourceCallableReference(access.Expression)) {
			break
		}
		n.kind, n.index = writerInputRest, index
		n.child = g.recipe(q, access.Expression)
		if n.child == nil || n.child.binding == nil || !writerInputRestPrivate(q, n.child.binding, expression) {
			n.kind = writerInputUnknown
			n.traceRecipeReason = "ordered-rest-private-proof-refused"
			break
		}
		if n.child != nil {
			g.edge(sourceWriterInputEdge{from: expression, to: n.child.expression, role: "ordered-rest", position: int(index)})
		}
	}
	if n.kind != writerInputUnknown {
		g.stats.NewFacts++
	}
	return n
}

// sourceWriterInputRequest carries source cuts only during one synchronous
// consumer. The fact graph retains neither this request nor its issuing query.
// Its cuts identify the existing observation, never effective-context equality.
type sourceWriterInputRequest struct {
	descriptorWork   *callableEffectWork // Synchronous original publisher association only.
	descriptorIssuer *sourceWriterInputRequest
	// Allocate this descriptive payload only at descriptor attachment; the
	// original request retains all live authority.
	descriptorSource *sourceStagedOperationRequest

	nativeIssuer     *sourceWriterInputRequest // Actual scoped registration, copied requests cannot use the association.
	nativeReadings   []sourceStagedOperationRequest
	writerSourceWork *callableEffectWork
	*sourceRegisteredWriterReading
	writerSourceIssuer *sourceWriterInputRequest
	member             *sourcePendingMemberTicket
	traceReason        string // observer variant only, never semantic equality or branch input

	issuer              *sourceValueQuery // cleared at the synchronous collect's deferred revocation
	live                bool
	graph               *sourceWriterInputGraph
	call, use, consumer *ast.Node
	original            [4]*ast.Node
	*sourceWriterInputCall // Immutable recipes shared by all occurrences of this call.
}

// The source and its dependent reading exist only after a staged writer is enrolled.
type sourceRegisteredWriterReading struct {
	writerSource, writerSourceReading sourceStagedOperationRequest
}

func (r *sourceWriterInputRequest) bindWriterReading(source, reading sourceStagedOperationRequest, work *callableEffectWork) {
	r.sourceRegisteredWriterReading = &sourceRegisteredWriterReading{source, reading}
	r.writerSourceWork, r.writerSourceIssuer = work, r
}

func (q *sourceValueQuery) registerWriterInputRequest(call *ast.Node) *sourceWriterInputRequest {
	if !q.dependenciesOnly || q.executable == nil || call == nil || !ast.IsCallExpression(call) {
		return nil
	}
	g := q.executable.writerInputFacts[q.effectOwner]
	if g == nil {
		return nil
	}
	q.recordEstimatedCost(1)
	g.stats.Collections++
	plan := g.calls[call]
	if plan == nil {
		plan = &sourceWriterInputCall{receiver: g.recipe(q, call.Expression())}
		g.edge(sourceWriterInputEdge{operation: call, from: call, to: call.Expression(), role: "callee", position: -1})
		if args := call.AsCallExpression().Arguments; args != nil {
			plan.arguments = make([]*sourceWriterInputNode, len(args.Nodes))
			for position, argument := range args.Nodes {
				plan.arguments[position] = g.recipe(q, argument)
				g.edge(sourceWriterInputEdge{operation: call, from: call, to: argument, role: "actual", position: position})
			}
		}
		if g.calls == nil {
			g.calls = make(map[*ast.Node]*sourceWriterInputCall)
		}
		g.calls[call] = plan
	}
	r := &sourceWriterInputRequest{issuer: q, live: true, graph: g, call: call, use: q.effectUse(), consumer: q.effectOwner, original: [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}, sourceWriterInputCall: plan}
	r.member = q.registerPendingMember(r)
	if publisher := q.executable.pendingMemberPublishers[q.effectOwner]; publisher != nil && publisher.workRegistrar != nil && publisher.workRegistrar.descriptorSource != nil {
		publisher.workRegistrar.descriptorSource(q, r)
	}
	if r.member != nil && r.member.publisher != nil {
		registrar := r.member.publisher.workRegistrar
		if registrar != nil && registrar.writerScopeSource != nil {
			registrar.writerScopeSource(q, r)
		}
	}
	// Root-use scope registration is disjoint from a physical C/Get reading.
	// A failed foreign-cut physical attempt cannot overwrite this real reader.
	if declarationWriterScopeReading(r) {
		return r
	}
	if native := q.stagedNativeGet; native != nil && native.bindInput != nil {
		native.bindInput(r)
	} else if member := q.stagedMember; member != nil && member.registerWriterSource != nil {
		member.registerWriterSource(r)
	}
	return r
}

func (r *sourceWriterInputRequest) atRecovery(q *sourceValueQuery) bool {
	return r != nil && r.live && r.issuer == q && r.consumer == q.effectOwner && r.use == q.effectUse() && q.reading == r.call && q.initializing == r.call && q.returning == nil && q.invoking == r.original[3]
}

// component substitutes only the current source carriers at the original cut.
// An unsupported alternative makes the whole component fall back, preserving
// its known donors and uncertainty with the old owner. Nothing is memoized.
func (r *sourceWriterInputRequest) component(q *sourceValueQuery, position int, bindings sourceValueBindings) ([]sourceValue, bool) {
	if r == nil || !r.live || r.issuer != q || r.consumer != q.effectOwner || r.use != q.effectUse() || !r.atRecovery(q) && r.original != [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking} {
		if r != nil {
			progressWriterComponent(q, r, position, nil, false, 0, "request-authority")
		}
		return r.traceUnsupported("request-authority")
	}
	r.traceReason = ""
	q.recordEstimatedCost(1)
	n := r.receiver
	if position >= 0 {
		if position >= len(r.arguments) {
			return r.traceUnsupported("unsupported")
		}
		n = r.arguments[position]
	}
	values, covered := r.evaluate(q, n, bindings, nil)
	progressWriterComponent(q, r, position, n, covered, len(values), r.traceReason)
	if covered {
		r.graph.stats.CoveredComponents++
		r.graph.stats.KnownCallableOccurrences += uint64(len(values))
	} else {
		r.graph.stats.UncoveredComponents++
	}
	return values, covered
}

func (r *sourceWriterInputRequest) evaluate(q *sourceValueQuery, n *sourceWriterInputNode, bindings sourceValueBindings, active *sourceWriterInputVisit) ([]sourceValue, bool) {
	if n == nil {
		return r.traceUnsupported("missing-recipe")
	}
	switch n.kind {
	case writerInputNoncallable, writerInputExternal:
		return nil, true
	case writerInputCallable:
		return []sourceValue{{node: n.declaration}}, true
	}
	for prior := active; prior != nil; prior = prior.prior {
		q.recordEstimatedCost(1)
		if prior.node == n {
			return r.traceUnsupported("binding-cycle")
		}
	}
	visit := sourceWriterInputVisit{node: n, prior: active}
	active = &visit
	switch n.kind {
	case writerInputBinding:
		if n.expression.Kind == ast.KindThisKeyword && q.inputs != nil && q.inputs.declaration != nil && !helperOwnsReceiver(n.expression, q.inputs.declaration) {
			return r.traceUnsupported("receiver-owner")
		}
		if n.binding != nil && q.owner.bindingWritten(n.binding) {
			return r.traceUnsupported("written-binding")
		}
		if terms, present := bindings[n.symbol]; present {
			return r.terms(q, terms, bindings, active)
		}
		if isWriterInputCallable(n.declaration) {
			return []sourceValue{{node: n.declaration}}, true
		}
		return r.traceUnsupported("absent-binding")
	case writerInputRest:
		if n.child == nil || n.child.kind != writerInputBinding || n.child.binding == nil || q.owner.bindingWritten(n.child.binding) {
			return r.traceUnsupported("unsupported")
		}
		terms, present := bindings[n.child.symbol]
		if !present || len(terms) == 0 {
			return r.traceUnsupported("absent-or-empty-rest-alternatives")
		}
		var values []sourceValue
		for _, term := range terms {
			if !calleeSyntaxCarrier(term) || len(term.path) != 0 || term.rest == nil {
				return r.traceUnsupported("unsupported")
			}
			// Match boundProjection's finite positional proof. A spread before this
			// index withholds the entire component rather than joining positions.
			for i, group := range term.rest {
				if uint64(i) > n.index {
					break
				}
				if len(group) == 0 {
					return r.traceUnsupported("unsupported")
				}
				for _, value := range group {
					if !value.undefined && (value.node == nil || ast.IsSpreadElement(value.node)) {
						return r.traceUnsupported("unsupported")
					}
				}
			}
			if n.index < uint64(len(term.rest)) {
				part, ok := r.terms(q, term.rest[n.index], bindings, active)
				if !ok {
					return r.traceUnsupported("unsupported")
				}
				values = append(values, part...)
			}
		}
		return values, true
	}
	if n.kind == writerInputUnknown {
		return r.traceUnsupported(n.traceRecipeReason)
	}
	return r.traceUnsupported("recipe-kind-unknown")
}

func (r *sourceWriterInputRequest) terms(q *sourceValueQuery, terms []sourceValue, bindings sourceValueBindings, active *sourceWriterInputVisit) ([]sourceValue, bool) {
	if len(terms) == 0 {
		return r.traceUnsupported("empty-alternatives")
	}
	var values []sourceValue
	for _, term := range terms {
		if !calleeSyntaxCarrier(term) || len(term.path) != 0 || term.copied != nil {
			return r.traceUnsupported("unsupported-carrier-projection-copy")
		}
		if term.undefined || term.rest != nil {
			continue
		}
		if isWriterInputCallable(term.node) {
			if term.capture != nil && !writerInputSourceCapture(q, term.capture, nil) {
				return r.traceUnsupported("capture-admission")
			}
			// Keep the original per-alternative capture. It is borrowed only until
			// the existing scope consumer copies/seals it at this same recovery cut.
			values = append(values, term)
			continue
		}
		part, ok := r.evaluate(q, r.graph.recipe(q, term.node), bindings, active)
		if !ok {
			return r.traceUnsupported("unsupported")
		}
		// A recursively resolved reference with a distinct capture is not a
		// detachable association. Keep the original accessor route instead.
		if len(part) > 0 && term.capture != nil {
			return r.traceUnsupported("indirect-distinct-capture")
		}
		values = append(values, part...)
	}
	return values, true
}

// excludeDiscovery closes only the writer-exposure question using a current
// authenticated method/input reader, or an established external standard callee
// with fully covered noncallable inputs. It cannot execute an authored body. Real
// argument/Get/coercion effects remain with the
// original Call's effect owner. No entry-zero result or operation proof is stored.
func (r *sourceWriterInputRequest) excludeDiscovery(q *sourceValueQuery, bindings sourceValueBindings) bool {
	if r == nil || !r.live || r.issuer != q || r.receiver == nil || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking} {
		return false
	}
	if native := q.stagedNativeGet; r.nativeIssuer == r && native != nil && native.consumeInput != nil {
		if invocation := native.consumeInput(r); invocation.handled {
			return invocation.excluded
		}
	}
	// A registered method/input reader carries its own exact semantic
	// producer. The static external recipe gate belongs only to the older
	// component fallback, not to that authenticated reader dispatch.
	if r.receiver.kind != writerInputExternal {
		return false
	}
	// A current selected algorithm can answer this direct-invocation demand
	// without requiring its argument's category. Protocol effects remain with
	// its whole Call root. Other external algorithms keep the component rule.
	if invocation := q.stagedNativeInputCall(r.call); invocation.handled {
		if invocation.excluded {
			r.graph.stats.DiscoveryRetired++
		}
		return invocation.excluded
	}
	borrow := q.stagedMember
	var required []sourceStagedOperationRequest
	for position := -1; position < len(r.arguments); position++ {
		values, covered := r.component(q, position, bindings)
		if covered {
			if len(values) != 0 {
				return false
			}
			continue
		}
		if position < 0 || r.arguments[position] == nil {
			return false
		}
		// The original argument may already have a conditional native result
		// source. Only its noncallable law answers this exposure question.
		// Keep the real DATA/Effects debt without acquiring a return value.
		transfer := q.transferStagedCallReturn(r.arguments[position].expression, sourceCallResultInterest{purpose: resultCallableExposure})
		if !transfer.accepted || !transfer.noncallable || transfer.required.producer.operation == nil {
			return false
		}
		required = appendEntryLawRequirement(required, transfer.required)
	}
	if !r.live || r.issuer != q || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking} {
		return false
	}
	if len(required) != 0 {
		if borrow == nil || q.stagedMember != borrow || !q.liveStagedMemberSource(borrow, borrow.get, borrow.read) {
			return false
		}
		// A later uncovered component must not publish a successful-used
		// selection premise. Passive child registration remains independent.
		for _, request := range required {
			borrow.selectionRequired = appendEntryLawRequirement(borrow.selectionRequired, request)
		}
	}
	r.graph.stats.DiscoveryRetired++
	return true
}

// isWriterInputCallable excludes getter/setter/constructor syntax from ordinary
// function-value exposure. Those protocols retain their existing consumer.
func isWriterInputCallable(n *ast.Node) bool {
	return n != nil && (ast.IsFunctionDeclaration(n) || ast.IsFunctionExpression(n) || ast.IsArrowFunction(n) || ast.IsMethodDeclaration(n)) && n.Body() != nil
}

// writerInputRestPrivate uses the source body's actual references, once per
// recipe, to decline mutation/escape through any other use of the rest array.
// Only the selected element read and the declaration itself may name it. This
// is an exposure premise, not an array identity or normal storage receipt.
func writerInputRestPrivate(q *sourceValueQuery, symbol *ast.Symbol, selected *ast.Node) bool {
	declaration := symbol.ValueDeclaration
	if declaration == nil || !ast.IsParameterDeclaration(declaration) || declaration.AsParameterDeclaration().DotDotDotToken == nil {
		return false
	}
	owner := enclosingCallableNode(declaration)
	if owner == nil {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(owner))
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	safe := true
	walkNode(owner, func(n *ast.Node) bool {
		q.recordEstimatedCost(1)
		if !safe {
			return false
		}
		if !ast.IsIdentifier(n) || ast.IsPartOfTypeNode(n) {
			return true
		}
		selectedSymbol := q.owner.checker.GetSymbolAtLocation(n)
		if n.Parent != nil && ast.IsShorthandPropertyAssignment(n.Parent) {
			selectedSymbol = q.owner.checker.GetShorthandAssignmentValueSymbol(n.Parent)
		}
		if selectedSymbol != symbol {
			return true
		}
		if n == declaration.Name() || n.Parent == selected && selected.Expression() == n {
			return true
		}
		safe = false
		return false
	})
	return safe
}

// writerInputSourceCapture is admission only. Pointer membership detects a live
// cycle during this check, never equality/reuse across requests. Normal/opaque
// runtime carriers and copied/rest capture graphs keep the original accessor.
type sourceWriterInputVisit struct {
	node  *sourceWriterInputNode
	prior *sourceWriterInputVisit
}
type sourceWriterCaptureVisit struct {
	scope *acquiredCallableScope
	prior *sourceWriterCaptureVisit
}

func writerInputSourceCapture(q *sourceValueQuery, scope *acquiredCallableScope, active *sourceWriterCaptureVisit) bool {
	if scope == nil {
		return true
	}
	q.recordEstimatedCost(1)
	for prior := active; prior != nil; prior = prior.prior {
		q.recordEstimatedCost(1)
		if prior.scope == scope {
			return false
		}
	}
	visit := sourceWriterCaptureVisit{scope: scope, prior: active}
	for _, terms := range scope.bindings {
		q.recordEstimatedCost(1)
		for _, term := range terms {
			q.recordEstimatedCost(1)
			if !calleeSyntaxCarrier(term) || len(term.path) != 0 || term.rest != nil || term.copied != nil || !writerInputSourceCapture(q, term.capture, &visit) {
				return false
			}
		}
	}
	return true
}

// revoke ends this exact issuer's synchronous permission. Graph plans retain no
// request/query pointer, and copied/expired queries must use the original path.
func (r *sourceWriterInputRequest) revoke() {
	if r == nil {
		return
	}
	if r.member != nil {
		if r.member.publisher.live && r.member.publisher.fact != nil {
			r.member.publisher.fact.pendingMembers.stats.Revoked++
			progressPendingMember(r.issuer, r, "revoked", -1, r.member.publisher.fact.pendingMembers.stats)
		}
		r.member.values = nil
		r.member.phase = memberRevoked
		r.member = nil
	}
	r.descriptorWork, r.descriptorIssuer, r.descriptorSource = nil, nil, nil
	r.live = false
	r.nativeIssuer, r.nativeReadings = nil, nil
	r.writerSourceWork, r.writerSourceIssuer = nil, nil
	r.sourceRegisteredWriterReading = nil
	r.issuer = nil
	r.call, r.use, r.consumer = nil, nil, nil
	r.original = [4]*ast.Node{}
}

func (r *sourceWriterInputRequest) traceUnsupported(reason string) ([]sourceValue, bool) {
	if r != nil && r.traceReason == "" {
		r.traceReason = reason
	}
	return nil, false
}

// beginInstalledMemberWorkPhase delegates to the same current collector that
// owns the canonical facts and queue. The caller must own the original field
// phase and its real installed source binder. A missing registry remains an
// explicit unmigrated/pending path; no metadata-only work graph is constructed.
func (q *sourceValueQuery) beginInstalledMemberWorkPhase(parent sourceStagedOperationRequest, get *sourceGetInputs, cut *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string, receiver sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool) {
	if q == nil || q.executable == nil || q.owner == nil {
		return nil, func() {}, false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.workRegistrar == nil || publisher.workRegistrar.installedPhase == nil {
		return nil, func() {}, false
	}
	return publisher.workRegistrar.installedPhase(q, parent, get, cut, phase, key, receiver)
}

// beginDescriptorSourcePhases is called only from the genuine selected Object
// invocation dispatch. The current collector authenticates the original source
// occurrence and registered algorithm; a missing registrar lends no interval.
func (q *sourceValueQuery) beginDescriptorSourcePhases(call *ast.Node, selected sourceValue) (func(), bool) {
	if q == nil || q.executable == nil || q.owner == nil {
		return func() {}, false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.workRegistrar == nil || publisher.workRegistrar.descriptorPhases == nil {
		return func() {}, false
	}
	return publisher.workRegistrar.descriptorPhases(q, call, selected)
}

// beginInstalledSourceCallSelectionWork delegates only within the original live
// collector registrar. The source selector owner authenticates its actual Get,
// Call and acquisition interval; absent ownership leaves source work pending.
// No callback, work or query association enters a source description or clone.
func (q *sourceValueQuery) beginInstalledSourceCallSelectionWork(call *ast.Node) (func(), bool) {
	if q == nil || q.owner == nil || q.executable == nil || call == nil {
		return func() {}, false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.workRegistrar == nil || publisher.workRegistrar.installedCallSelection == nil {
		return func() {}, false
	}
	return publisher.workRegistrar.installedCallSelection(q, call)
}

// publishOriginalDescriptorTarget delegates only in the current collector's
// publisher interval. It creates no work registry and supplies no source receipt.
func (q *sourceValueQuery) publishOriginalDescriptorTarget(call *ast.Node, selected sourceValue, bindings sourceValueBindings) bool {
	if q == nil || q.executable == nil {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.workRegistrar == nil || publisher.workRegistrar.descriptorTarget == nil {
		return false
	}
	return publisher.workRegistrar.descriptorTarget(q, call, selected, bindings)
}
