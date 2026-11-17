package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type sourcePendingMemberPhase uint8

const (
	memberRegistered sourcePendingMemberPhase = iota
	memberDelivered
	memberAcknowledged
	memberRevoked
)

type sourceMemberEndpointKind uint8

const (
	memberUnresolved sourceMemberEndpointKind = iota
	memberFormal
	memberCapture
	memberLocal
	memberConstruction
	memberResult
	memberAssignment
)

// sourceMemberEndpoint names a source dependency, never a current value. A New
// source or a library type grants no instance brand. Formal slots stay relative.
type sourceMemberEndpoint struct {
	kind                                   sourceMemberEndpointKind
	expression, declaration, owner, source *ast.Node
	position                               int
}
type sourcePendingMemberStats struct {
	DirectExposureRegistered, DirectExposureConsumed, DirectExposureSettled, DirectExposureUnresolved, DirectExposureOverflow                    uint64
	FormalProjectionOverflow                                                                                                                     uint64
	FormalProjectionRegistered, FormalProjectionReplay, FormalProjectionRecoveryRetired, FormalProjectionDelivered                               uint64
	DescriptorRequired, DescriptorRecoveryDeferred, DescriptorWriterDelivered, DescriptorValueDelivered, DescriptorSettled, DescriptorUnresolved uint64
	WriterAdmissionRetired                                                                                                                       uint64
	WriterValuePublications, WriterValueSubscriptions, WriterValueDeliveries                                                                     uint64

	WriterInputsRegistered, WriterInputPublications, WriterInputConsumed, WriterInputScopesRetired, WriterInputMappedDeliveries uint64

	ConstructionDependencies, ConstructionDependencyReplay, LateConstructionDeliveries uint64

	ConstructionPublications, GetTransfers, NativeAlternatives                       uint64
	DonorComparisons, DonorInsertions, SubscriberComparisons, SubscriberInsertions   uint64
	Refreshes, RefreshNoops, NewDonorDeliveries, CallerComparisons, CallerInsertions uint64

	Requested, Consumed, NeverNeeded, Restarted, PreparationReturns, PreparationAborted, PendingSubscribers uint64

	Registered, Replay, NewRelationships, Deliveries, Acknowledged, Declined, Revoked uint64
	KnownDonors, Revisions, DirtyNotifications, SkippedCallee, RelativeArguments      uint64
}

// A ledger retains only source relationships and exposure references. Exposure
// is deliberately not an invocation edge. The original Call still owns effects.
type sourcePendingMemberLedger struct {
	directExposures       map[sourceDirectExposureKey]*sourceDirectExposure
	formalProducersDone   map[*ast.Node]bool // original fact effect publication, not source result
	descriptorProjections map[[2]*ast.Node]*sourceDescriptorProjection
	writerGets            map[sourceWriterGet]struct{}

	writerCaptures map[sourceWriterCaptureKey]*sourceWriterCapture

	constructionDependencies []sourcePendingConstructionDependency
	constructionDeliveries   []sourcePendingConstructionDelivery

	constructions []sourceStandardConstructionContribution
	newDonors     []*ast.Node // append-only source exposure deliveries, not actual alternatives

	sites    map[*ast.Node]*sourcePendingMemberDemand
	revision uint64
	stats    sourcePendingMemberStats
}
type sourcePendingMemberSubscriber struct{ consumer, parent *ast.Node }

type sourcePendingMemberDemand struct {
	rolesResolved bool
	argumentCount int

	requests      uint64
	producerDepth int
	subscriberSet map[sourcePendingMemberSubscriber]struct{}
	donorSet      map[*ast.Node]struct{}
	subscribers   []sourcePendingMemberSubscriber

	declaration, get, call *ast.Node
	key                    string
	receiver               sourceMemberEndpoint
	arguments              []sourceMemberEndpoint
	donors                 []*ast.Node
	unknown                bool
	transferred            bool
}

// Publisher admission belongs to this exact active fact collector. It is revoked
// on exit, omitted from caches, and never lends publication authority to readers.
type sourcePendingMemberPublisher struct {
	// This synchronous registrar is installed only by the current work registry.
	// Source descriptions and clones never retain its work/query association.
	workRegistrar *sourcePendingMemberWorkRegistrar
	fact          *callableFacts
	live          bool
}

// sourcePendingMemberWorkRegistrar is one current collector's registration
// capability. Every supported source role shares this same live publisher/work
// ownership. None of its functions or query arguments enters source descriptions.
// Absence refuses registration; registration itself pays no semantic source work.
type sourcePendingMemberWorkRegistrar struct {
	arrayPush              func(*sourceValueQuery, *ast.Node, sourceValue, *ast.Node, sourceValue)
	originalGetMutation    func(*sourceValueQuery, *sourceGetInputs, *sourceMemberWriterReadCut, accessorTraversal, *ast.Node, []string, string, *sourceValue, ...*ast.Node) bool
	installedCallSelection func(*sourceValueQuery, *ast.Node) (func(), bool)
	descriptorSource       func(*sourceValueQuery, *sourceWriterInputRequest)
	descriptorPhases       func(*sourceValueQuery, *ast.Node, sourceValue) (func(), bool)
	installedPhase         func(*sourceValueQuery, sourceStagedOperationRequest, *sourceGetInputs, *sourceMemberWriterReadCut, sourceInstalledMemberPhase, string, sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool)
	descriptorTarget       func(*sourceValueQuery, *ast.Node, sourceValue, sourceValueBindings) bool
	writerScopeSource      func(*sourceValueQuery, *sourceWriterInputRequest)
}

// Only the synchronous ticket borrows the original selection's source values.
// Neither these values nor its issuer enter the ledger. Every collect must obtain
// a fresh producer delivery, even for the same AST and source observation cuts.
type sourcePendingMemberTicket struct {
	standardTransferSerial uint64 // current producer event only, never a context/cache key

	consumed bool

	publisher *sourcePendingMemberPublisher
	demand    *sourcePendingMemberDemand
	phase     sourcePendingMemberPhase
	values    []sourceValue
	unknown   bool
}

// registerPendingMemberFacts lends publication only to original live source facts.
// Nested collection restores prior publishers and cached clones receive no right.
func registerPendingMemberFacts(owner *executableBodyOwner, facts []callableFacts) func() {
	if owner.pendingMemberPublishers == nil {
		owner.pendingMemberPublishers = make(map[*ast.Node]*sourcePendingMemberPublisher)
	}
	type previous struct {
		node      *ast.Node
		publisher *sourcePendingMemberPublisher
	}
	var replaced []previous
	for i := range facts {
		fact := &facts[i]
		if prior := owner.pendingMemberPublishers[fact.node]; prior != nil {
			replaced = append(replaced, previous{fact.node, prior})
		}
		owner.pendingMemberPublishers[fact.node] = &sourcePendingMemberPublisher{fact: fact, live: true}
	}
	return func() {
		for i := range facts {
			p := owner.pendingMemberPublishers[facts[i].node]
			if p.fact != nil && p.fact.pendingMembers != nil {
				ledger := p.fact.pendingMembers
				ledger.stats.NeverNeeded = 0
				for _, demand := range ledger.sites {
					if demand.requests == 0 {
						ledger.stats.NeverNeeded++
					}
					demand.producerDepth = 0
				}
				progressPendingNeverNeeded(ledger.stats.NeverNeeded)
			}
			p.workRegistrar = nil
			p.live = false
			p.fact = nil
			delete(owner.pendingMemberPublishers, facts[i].node)
		}
		for _, prior := range replaced {
			owner.pendingMemberPublishers[prior.node] = prior.publisher
		}
	}
}

func memberEndpoint(q *sourceValueQuery, expression, consumer *ast.Node) sourceMemberEndpoint {
	expression = unwrapSourceCallableReference(expression)
	endpoint := sourceMemberEndpoint{expression: expression, position: -1}
	if expression == nil {
		return endpoint
	}
	if ast.IsNewExpression(expression) {
		endpoint.kind, endpoint.source = memberConstruction, expression
		return endpoint
	}
	if ast.IsCallExpression(expression) {
		endpoint.kind, endpoint.source = memberResult, expression
		return endpoint
	}
	if ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		endpoint.kind, endpoint.source = memberAssignment, expression.AsBinaryExpression().Right
		left := unwrapSourceCallableReference(expression.AsBinaryExpression().Left)
		if left != nil && ast.IsIdentifier(left) {
			if symbol := q.owner.checker.GetSymbolAtLocation(left); symbol != nil && symbol.ValueDeclaration != nil {
				endpoint.declaration = symbol.ValueDeclaration
				endpoint.owner = enclosingCallableNode(symbol.ValueDeclaration)
			}
		}
		return endpoint
	}
	if !ast.IsIdentifier(expression) {
		return endpoint
	}
	symbol := q.owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return endpoint
	}
	declaration := symbol.ValueDeclaration
	endpoint.declaration, endpoint.owner = declaration, enclosingCallableNode(declaration)
	if endpoint.owner != nil && ast.IsParameterDeclaration(declaration) && ast.IsIdentifier(declaration.Name()) && declaration.Initializer() == nil && declaration.AsParameterDeclaration().DotDotDotToken == nil && !q.owner.bindingWritten(symbol) {
		position := 0
		for _, parameter := range endpoint.owner.Parameters() {
			if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			if parameter == declaration {
				endpoint.kind, endpoint.position = memberFormal, position
				return endpoint
			}
			position++
		}
	}
	endpoint.kind = memberLocal
	if endpoint.owner != consumer {
		endpoint.kind = memberCapture
	}
	if ast.IsVariableDeclaration(declaration) {
		endpoint.source = declaration.Initializer()
	}
	return endpoint
}

// registerPendingMember records literal-member source roles before selection.
// Observation cuts and authority stay on the exact issuing synchronous request.
func (q *sourceValueQuery) registerPendingMember(r *sourceWriterInputRequest) *sourcePendingMemberTicket {
	if r == nil || q.inputs != nil || q.operation != nil || q.executable == nil || q.effectUse() != nil || !sourceStagedOccurrenceOwned(r.call, q.effectOwner) {
		return nil
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	demand := q.ensurePendingMemberSource(r.call, publisher)
	if demand == nil {
		return nil
	}
	ledger := publisher.fact.pendingMembers

	ledger.stats.Requested++
	progressPendingMember(q, r, "requested", -1, ledger.stats)
	if demand.requests != 0 {
		ledger.stats.Replay++
		progressPendingMember(q, r, "replay", -1, ledger.stats)
	}
	demand.requests++
	return &sourcePendingMemberTicket{publisher: publisher, demand: demand}
}

// registerPendingMemberSource is called by the original reached AST/normal
// schedule descent. It creates source roles only, never a value query, body
// execution edge, module-initialization effect or second traversal.
func registerPendingMemberSource(fact *callableFacts, node *ast.Node, owner *executableBodyOwner, works ...*callableEffectWork) {
	if fact == nil || fact.node == nil || node == nil || !ast.IsCallExpression(node) || !sourceStagedOccurrenceOwned(node, fact.node) || owner == nil || owner.values == nil {
		return
	}
	publisher := owner.pendingMemberPublishers[fact.node]
	if publisher == nil || publisher.fact != fact {
		return
	}
	source := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, dependenciesOnly: true}
	demand := source.ensurePendingMemberSource(node, publisher)
	if demand != nil && len(works) == 1 && works[0] != nil {
		works[0].requireMemberSourceModules(works[0].operationFacts, fact, demand)
	}
}
func (q *sourceValueQuery) ensurePendingMemberSource(call *ast.Node, publisher *sourcePendingMemberPublisher) *sourcePendingMemberDemand {
	if publisher == nil || !publisher.live || publisher.fact == nil || call == nil || !ast.IsCallExpression(call) || !sourceStagedOccurrenceOwned(call, q.effectOwner) {
		return nil
	}
	get := unwrapSourceCallableReference(call.Expression())
	if get == nil || !ast.IsPropertyAccessExpression(get) || call.AsCallExpression().QuestionDotToken != nil {
		return nil
	}
	member := get.AsPropertyAccessExpression()
	if !ast.IsIdentifier(unwrapSourceCallableReference(member.Expression)) {
		return nil
	}
	fact := publisher.fact
	if fact.pendingMembers == nil {
		fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	ledger := fact.pendingMembers
	if demand := ledger.sites[call]; demand != nil {
		return demand
	}
	demand := &sourcePendingMemberDemand{declaration: q.effectOwner, get: get, call: call, key: member.Name().Text(), receiver: sourceMemberEndpoint{expression: member.Expression, position: -1}}
	if args := call.AsCallExpression().Arguments; args != nil {
		demand.argumentCount = len(args.Nodes)
	}
	demand.receiver = memberEndpoint(q, member.Expression, q.effectOwner)
	if args := call.AsCallExpression().Arguments; args != nil {
		demand.arguments = make([]sourceMemberEndpoint, len(args.Nodes))
		for i, arg := range args.Nodes {
			demand.arguments[i] = memberEndpoint(q, arg, q.effectOwner)
		}
	}
	demand.rolesResolved = true // Descriptions only, never selection or transfer ACK.
	q.recordEstimatedCost(1)
	ledger.sites[call] = demand
	ledger.stats.Registered++
	progressPendingMemberDeclaration(q, call, "registered", ledger.stats)
	progressPendingMemberRelationships(uint64(1 + demand.argumentCount))
	ledger.stats.NewRelationships += uint64(1 + demand.argumentCount)
	ledger.revision++
	ledger.stats.Revisions++
	progressPendingCost(9, 1)
	return demand
}

type sourcePendingMemberPreparation struct {
	demand *sourcePendingMemberDemand
	ledger *sourcePendingMemberLedger
	active bool
}

// A backedge subscribes to source fact delivery. Unsupported legacy acquisition
// still runs until the Get owner can transfer all obligations. Count that real
// restart instead of treating pending registration as completed empty coverage.
func (q *sourceValueQuery) beginPendingMemberPreparation(call *ast.Node, bindings sourceValueBindings) sourcePendingMemberPreparation {
	r := q.pendingMemberRequest
	if r == nil || !r.live || r.issuer != q || r.call != call || r.member == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 {
		return sourcePendingMemberPreparation{}
	}
	ticket := r.member
	if !ticket.publisher.live || ticket.publisher.fact == nil {
		return sourcePendingMemberPreparation{}
	}
	demand, ledger := ticket.demand, ticket.publisher.fact.pendingMembers
	if demand.producerDepth != 0 {
		ledger.stats.Restarted++
		progressPendingMember(q, r, "restarted", -1, ledger.stats)
		subscriber := sourcePendingMemberSubscriber{consumer: r.consumer, parent: r.original[0]}
		if demand.subscriberSet == nil {
			demand.subscriberSet = make(map[sourcePendingMemberSubscriber]struct{}, len(demand.subscribers))
			for _, prior := range demand.subscribers {
				demand.subscriberSet[prior] = struct{}{}
			}
		}
		ledger.stats.SubscriberComparisons++
		progressPendingCost(2, 1)
		if _, found := demand.subscriberSet[subscriber]; !found {
			demand.subscriberSet[subscriber] = struct{}{}
			ledger.stats.SubscriberInsertions++
			progressPendingCost(3, 1)
			demand.subscribers = append(demand.subscribers, subscriber)
			ledger.stats.PendingSubscribers++
			progressPendingMember(q, r, "subscribed", -1, ledger.stats)
			ledger.stats.NewRelationships++
			ledger.revision++
			ledger.stats.Revisions++
			progressPendingCost(9, 1)
		}
	}
	demand.producerDepth++
	return sourcePendingMemberPreparation{demand: demand, ledger: ledger, active: true}
}
func endPendingMemberPreparation(preparation *sourcePendingMemberPreparation, returned bool) {
	if !preparation.active {
		return
	}
	preparation.active = false
	preparation.demand.producerDepth--
	if returned {
		preparation.ledger.stats.PreparationReturns++
	} else {
		preparation.ledger.stats.PreparationAborted++
	}
}

// publishPendingMemberSelection consumes the already-acquired alternatives from
// prepareInvocation. It performs no acquisition or body execution. Unknown alone,
// signature declarations and unsupported captures cannot issue an acknowledgement.
func (q *sourceValueQuery) publishPendingMemberSelection(call *ast.Node, bindings sourceValueBindings, prepared sourcePreparedInvocation) {
	r := q.pendingMemberRequest
	if r == nil || !r.live || r.issuer != q || r.call != call || r.member == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || r.use != q.effectUse() || q.reading != r.original[0] || q.initializing != call || q.returning != r.original[2] || q.invoking != r.original[3] {
		return
	}
	ticket := r.member
	publisher := ticket.publisher
	if !publisher.live || publisher.fact == nil || ticket.phase != memberRegistered {
		return
	}
	ledger := publisher.fact.pendingMembers
	acquired := prepared.acquired.candidates()
	if !pendingMemberStableActualReads(q, call) && !r.standardMemberAssignmentArguments(q, acquired) {
		ledger.stats.Declined++
		progressPendingMember(q, r, "declined", -1, ledger.stats)
		return
	}
	unknown := acquired.opaque || acquired.valueIncomplete || acquired.receiverIncomplete || prepared.base.opaque || prepared.base.valueIncomplete || prepared.base.receiverIncomplete
	var values []sourceValue
	known := false
	for i, value := range acquired.values {
		q.recordEstimatedCost(1)
		if scope, ok := acquired.callableScopes[i]; ok {
			value.capture = &scope
		}
		if r.transferredStandardMember(acquired, value) {
			// The original Get transferred known alternatives and independent
			// residuals. This does not cover the method's Call or its output.
			ledger.stats.NativeAlternatives++
			unknown = true
			known = true
			continue
		}
		if value.native != nil && nativeInvocable(value.native.kind) {
			if value.native.referencesIncomplete {
				ledger.stats.Declined++
				progressPendingMember(q, r, "declined", -1, ledger.stats)
				return
			}
			known = true
			continue
		}
		if !calleeSyntaxCarrier(value) || len(value.path) != 0 || value.copied != nil || value.rest != nil {
			ledger.stats.Declined++
			progressPendingMember(q, r, "declined", -1, ledger.stats)
			return
		}
		if isWriterInputCallable(value.node) {
			// Captured values are not detached into declaration-owned facts. Factory
			// inputs and creator-dependent alternatives retain the original route.
			if !r.graph.memberCaptureSyntaxOnly(q, value.node) || !pendingMemberSourceCapture(q, value.capture) {
				ledger.stats.Declined++
				progressPendingMember(q, r, "declined", -1, ledger.stats)
				return
			}
			values = append(values, value)
			known = true
		} else {
			unknown = true
		}
	}
	if !known {
		ledger.stats.Declined++
		progressPendingMember(q, r, "declined", -1, ledger.stats)
		return
	}
	// Prepare completely before publishing. No partial donor list can ACK.
	ticket.values, ticket.unknown, ticket.phase = values, unknown, memberDelivered
	ledger.stats.Deliveries++
	progressPendingMember(q, r, "delivered", -1, ledger.stats)
	demand := ticket.demand
	changed := !demand.transferred
	demand.transferred = true
	if demand.donorSet == nil && len(values) != 0 {
		demand.donorSet = make(map[*ast.Node]struct{}, len(demand.donors)+len(values))
		for _, donor := range demand.donors {
			demand.donorSet[donor] = struct{}{}
		}
	}
	for _, value := range values {
		ledger.stats.DonorComparisons++
		progressPendingCost(0, 1)
		if _, present := demand.donorSet[value.node]; !present {
			demand.donorSet[value.node] = struct{}{}
			demand.donors = append(demand.donors, value.node)
			ledger.newDonors = append(ledger.newDonors, value.node)
			ledger.stats.DonorInsertions++
			progressPendingCost(1, 1)
			ledger.stats.KnownDonors++
			changed = true
		}
	}
	if unknown && !demand.unknown {
		demand.unknown = true
		changed = true
	}
	if changed {
		ledger.revision++
		ledger.stats.Revisions++
		progressPendingCost(9, 1)
	}
	// Acceptance transfers exposure and its relative roles to the existing fact.
	// It grants this ticket no execution, output, descriptor or normal authority.
	ticket.phase = memberAcknowledged
	ledger.stats.Acknowledged++
	progressPendingMember(q, r, "acknowledged", -1, ledger.stats)
}

// pendingMemberComponent is distinct from the value-only recipe contract. A
// relative formal transfers an explicit obligation and uncertainty, never a
// covered-empty value. Current bindings/frames cannot consume this disposition.
func (r *sourceWriterInputRequest) pendingMemberComponent(q *sourceValueQuery, position int, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	if r == nil || r.member == nil || !r.atRecovery(q) || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 {
		return nil, false
	}
	ticket := r.member
	if ticket.phase != memberAcknowledged || !ticket.publisher.live || ticket.publisher.fact == nil {
		return nil, false
	}
	ledger := ticket.publisher.fact.pendingMembers
	if position < 0 {
		if !ticket.consumed {
			ticket.consumed = true
			ledger.stats.Consumed++
			progressPendingMember(q, r, "consumed", position, ledger.stats)
		}
		// Selection was frozen by the original pre-argument acquisition owner.
		// Its independent uncertainty stays explicit beside every known donor.
		if ticket.unknown {
			result.opaque, result.receiverIncomplete, result.valueIncomplete = true, true, true
		}
		ledger.stats.SkippedCallee++
		progressPendingMember(q, r, "callee-skipped", -1, ledger.stats)
		return ticket.values, true
	}
	if position >= len(ticket.demand.arguments) {
		return nil, false
	}
	endpoint := ticket.demand.arguments[position]
	if endpoint.kind != memberFormal || endpoint.owner != q.effectOwner {
		return nil, false
	}
	result.valueIncomplete = true
	if ticket.unknown {
		result.opaque = true
	}
	if !ticket.consumed {
		ticket.consumed = true
		ledger.stats.Consumed++
		progressPendingMember(q, r, "consumed", position, ledger.stats)
	}
	ledger.stats.RelativeArguments++
	progressPendingMember(q, r, "relative-formal", position, ledger.stats)
	return nil, true
}

func clonePendingMemberLedger(ledger *sourcePendingMemberLedger) *sourcePendingMemberLedger {
	if ledger == nil {
		return nil
	}
	copy := &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand, len(ledger.sites)), revision: ledger.revision, stats: ledger.stats}
	if ledger.formalProducersDone != nil {
		copy.formalProducersDone = make(map[*ast.Node]bool, len(ledger.formalProducersDone))
		for operation, done := range ledger.formalProducersDone {
			copy.formalProducersDone[operation] = done
		}
	}
	if ledger.directExposures != nil {
		copy.directExposures = make(map[sourceDirectExposureKey]*sourceDirectExposure, len(ledger.directExposures))
		for key, row := range ledger.directExposures {
			value := *row
			copy.directExposures[key] = &value
		}
	}
	copy.constructionDependencies = append([]sourcePendingConstructionDependency(nil), ledger.constructionDependencies...)
	copy.constructionDeliveries = append([]sourcePendingConstructionDelivery(nil), ledger.constructionDeliveries...)
	copy.constructions = append([]sourceStandardConstructionContribution(nil), ledger.constructions...)
	copy.newDonors = append([]*ast.Node(nil), ledger.newDonors...)
	if ledger.descriptorProjections != nil {
		copy.descriptorProjections = make(map[[2]*ast.Node]*sourceDescriptorProjection, len(ledger.descriptorProjections))
		for key, row := range ledger.descriptorProjections {
			v := *row
			if row.formals != nil {
				v.formals = make(map[sourceFormalProjectionKey]*sourceFormalProjection, len(row.formals))
				for key, formal := range row.formals {
					copy := *formal
					v.formals[key] = &copy
				}
			}
			v.arguments = append([]sourceMemberEndpoint(nil), row.arguments...)
			copy.descriptorProjections[key] = &v
		}
	}
	if ledger.writerGets != nil {
		copy.writerGets = make(map[sourceWriterGet]struct{}, len(ledger.writerGets))
		for demand := range ledger.writerGets {
			copy.writerGets[demand] = struct{}{}
		}
	}
	if ledger.writerCaptures != nil {
		copy.writerCaptures = make(map[sourceWriterCaptureKey]*sourceWriterCapture, len(ledger.writerCaptures))
		for key, relation := range ledger.writerCaptures {
			value := *relation
			value.aliases = append([]*ast.Node(nil), relation.aliases...)
			value.formals = append([]sourceMemberEndpoint(nil), relation.formals...)
			copy.writerCaptures[key] = &value
		}
	}
	for call, demand := range ledger.sites {
		value := *demand
		value.producerDepth = 0
		value.subscriberSet, value.donorSet = nil, nil // rebuild finite indices from copied ordered records
		value.subscribers = append([]sourcePendingMemberSubscriber(nil), demand.subscribers...)
		value.arguments = append([]sourceMemberEndpoint(nil), demand.arguments...)
		value.donors = append([]*ast.Node(nil), demand.donors...)
		copy.sites[call] = &value
	}
	return copy
}

// memberCaptureSyntaxOnly rejects lexical instance/factory associations even if
// an upstream producer has no capture marker. Only this declaration syntax is
// cached. Each actual alternative still checks its current capture separately.
func (graph *sourceWriterInputGraph) memberCaptureSyntaxOnly(q *sourceValueQuery, body *ast.Node) bool {
	if safe, present := graph.memberCaptureSyntax[body]; present {
		return safe
	}
	safe := true
	walkNode(body, func(node *ast.Node) bool {
		q.recordEstimatedCost(1)
		if !safe {
			return false
		}
		if node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword || node.Kind == ast.KindMetaProperty {
			safe = false
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsPartOfTypeNode(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		if node.Text() == "arguments" {
			safe = false
			return false
		}
		symbol := q.owner.checker.GetSymbolAtLocation(node)
		if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
			symbol = q.owner.checker.GetShorthandAssignmentValueSymbol(node.Parent)
		}
		if symbol == nil || symbol.ValueDeclaration == nil {
			return true
		}
		captured := enclosingCallableNode(symbol.ValueDeclaration)
		if captured != nil && captured != body && !nodeInside(captured, body) {
			safe = false
		}
		return safe
	})
	if graph.memberCaptureSyntax == nil {
		graph.memberCaptureSyntax = make(map[*ast.Node]bool)
	}
	graph.memberCaptureSyntax[body] = safe
	return safe
}

// Current selection is borrowed only when evaluating actual syntax cannot
// introduce a later member replacement. Other argument/protocol work
// remains entirely on the original path, including spreads and nested Calls.
func pendingMemberStableActualReads(q *sourceValueQuery, call *ast.Node) bool {
	args := call.AsCallExpression().Arguments
	if args == nil {
		return true
	}
	for _, actual := range args.Nodes {
		q.recordEstimatedCost(1)
		actual = unwrapSourceCallableReference(actual)
		if actual == nil {
			return false
		}
		if sourcePrimitiveValue(actual) || ast.IsArrowFunction(actual) || ast.IsFunctionExpression(actual) {
			continue
		}
		if !ast.IsIdentifier(actual) {
			return false
		}
		symbol := q.owner.checker.GetSymbolAtLocation(actual)
		if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || q.owner.bindingWritten(symbol) {
			return false
		}
	}
	return true
}

// A source method can retain its unused receiver slot even when its body has no
// this/lexical-capture dependency. Keep that original scope for the synchronous
// copy/seal consumer. No scope enters the fact ledger or later delivery.
func pendingMemberSourceCapture(q *sourceValueQuery, scope *acquiredCallableScope) bool {
	if scope == nil {
		return true
	}
	if len(scope.creators) != 0 {
		return false
	}
	for id := range scope.bindings {
		q.recordEstimatedCost(1)
		if id != 0 {
			return false
		}
	}
	return writerInputSourceCapture(q, scope, nil)
}
