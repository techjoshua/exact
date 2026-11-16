package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// A construction dependency names one definition-relative source demand and its
// original Get/Call/use/cuts. These endpoints invalidate facts only. They retain
// no request, query, scope, publisher, callback or permission to acknowledge.
type sourcePendingConstructionDependency struct {
	site, consumer, get, call, use *ast.Node
	cuts                           [4]*ast.Node
}

type sourcePendingConstructionDelivery struct {
	dependency   sourcePendingConstructionDependency
	contribution sourceStandardConstructionContribution
}

// subscribeStandardConstruction records a missing source producer on the same
// finite source-identity index. In-progress and completed-empty are not joined.
// An ordinary original Get can subscribe before recovery creates any ticket.
func (q *sourceValueQuery) subscribeStandardConstruction(demand sourceConstructedMemberDemand) {
	if q.executable == nil || q.inputs != nil || q.operation != nil || len(q.creators) != 0 {
		return
	}
	if owner := enclosingCallableNode(demand.source); owner != nil && owner != q.effectOwner {
		return
	}
	get := q.protectedMember
	if get == nil || !ast.IsPropertyAccessExpression(get) || get.Parent == nil || !ast.IsCallExpression(get.Parent) || unwrapSourceCallableReference(get.Parent.Expression()) != get {
		return
	}
	call := get.Parent
	if enclosingCallableNode(call) != q.effectOwner {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return
	}
	dependency := sourcePendingConstructionDependency{site: demand.source, consumer: q.effectOwner, get: get, call: call, use: q.effectUse(), cuts: [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}}
	if request := q.pendingMemberRequest; request != nil {
		if !request.live || request.issuer != q || request.call != call {
			return
		}
		dependency.use, dependency.cuts = request.use, request.original
	}
	if q.executable.constructionSubscribers == nil {
		q.executable.constructionSubscribers = make(map[*ast.Node]map[sourcePendingConstructionDependency]struct{})
	}
	dependencies := q.executable.constructionSubscribers[demand.source]
	if dependencies == nil {
		dependencies = make(map[sourcePendingConstructionDependency]struct{})
		q.executable.constructionSubscribers[demand.source] = dependencies
	}
	if publisher.fact.pendingMembers == nil {
		publisher.fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	ledger := publisher.fact.pendingMembers
	if _, exists := dependencies[dependency]; exists {
		ledger.stats.ConstructionDependencyReplay++
		return
	}
	dependencies[dependency] = struct{}{}
	ledger.constructionDependencies = append(ledger.constructionDependencies, dependency)
	ledger.revision++
	ledger.stats.ConstructionDependencies++
	progressPendingMemberDeclaration(q, call, "construction-subscribed", ledger.stats)
	ledger.stats.NewRelationships++
	ledger.stats.Revisions++
	progressPendingCost(9, 1)
}

// deliverStandardConstruction moves the new source contribution into each live
// owning consumer fact and bumps its existing work revision. It never reruns a
// query or revives a request. A subsequent Get must acquire and ACK for itself.
func (q *sourceValueQuery) deliverStandardConstruction(contribution sourceStandardConstructionContribution) {
	dependencies := q.executable.constructionSubscribers[contribution.site]
	for dependency := range dependencies {
		publisher := q.executable.pendingMemberPublishers[dependency.consumer]
		if publisher == nil || !publisher.live || publisher.fact == nil {
			continue
		}
		ledger := publisher.fact.pendingMembers
		if ledger == nil {
			continue
		}
		ledger.constructionDeliveries = append(ledger.constructionDeliveries, sourcePendingConstructionDelivery{dependency: dependency, contribution: contribution})
		ledger.stats.LateConstructionDeliveries++
		progressPendingMemberDeclaration(&sourceValueQuery{owner: q.owner, executable: q.executable, effectOwner: dependency.consumer}, dependency.call, "construction-delivered", ledger.stats)
		ledger.revision++
		ledger.stats.Revisions++
		progressPendingCost(9, 1)
	}
	// Existing delivered endpoints are retained by their owning facts. Refine
	// those records in place so the same revision/invalidation path observes a
	// newly complete selection, without reviving a query or growing the ledger.
	for _, publisher := range q.executable.pendingMemberPublishers {
		if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.pendingMembers == nil {
			continue
		}
		ledger := publisher.fact.pendingMembers
		for i := range ledger.constructionDeliveries {
			delivery := &ledger.constructionDeliveries[i]
			prior := delivery.contribution
			if prior.site != contribution.site || prior.owner != contribution.owner || prior.constructor != contribution.constructor || prior.selectionComplete || !contribution.selectionComplete {
				continue
			}
			delivery.contribution = contribution
			ledger.revision++
			ledger.stats.Revisions++
			ledger.stats.LateConstructionDeliveries++
		}
	}
	// Pending endpoints are consumed once; later refinements use the original
	// delivered records above, rather than a second subscription registry.
	delete(q.executable.constructionSubscribers, contribution.site)
}
