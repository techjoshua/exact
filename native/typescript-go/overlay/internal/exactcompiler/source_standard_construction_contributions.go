package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sync/atomic"
)

// sourceStandardConstructionContribution records a conditional source alternative
// published by the original New source owner. It has no value, frame, completion,
// instance identity or table contents. A later Get still owns its alternatives.
type sourceStandardConstructionContribution struct {
	site, owner, constructor *ast.Node
	selectionComplete        bool // Original callee alternatives only, not New output or completion.
}

// sourceConstructionSelection is a synchronous loan from the actual original
// selector. It is never copied into a fact, contribution or graph observation.
// Copying the query/selection or changing its publisher cannot renew a source.
type sourceConstructionSelection struct {
	issuer     *sourceValueQuery
	selected   *sourcePreparedInvocation
	site       *ast.Node
	generation *projectGeneration
	publisher  *sourcePendingMemberPublisher
	fact       *callableFacts
}

func (q *sourceValueQuery) lendStandardConstructionSelection(site *ast.Node, selected *sourcePreparedInvocation) {
	if q.standardConstructionSource != site || q.executable == nil || q.owner == nil || q.owner.generation == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return
	}
	selected.constructionSource = &sourceConstructionSelection{issuer: q, selected: selected, site: site, generation: q.owner.generation, publisher: publisher, fact: publisher.fact}
}

// sourceStandardMemberTransfer is emitted only after the original Get has walked
// its own-writer alternatives. It is an exposure transfer, not a normal result or
// permission to call a method. Unknown and relative obligations stay independent.
type sourceStandardMemberTransfer struct {
	ticketSerial uint64

	complete                       bool // final original construction-Get owner accepted known source branches
	site, get, call, owner, method *ast.Node
}

func standardMemberEffect(kind sourceNativeKind) bool {
	return kind == sourceNativeWeakMapGetEffect || kind == sourceNativeWeakMapSetEffect
}

// publishStandardConstruction is passive on the original source-New owner. A
// demanded receiver must enter that original owner with its live fact publisher;
// inventory alone cannot publish. Only a declaration-relative or module-owned
// traversal contributes to definitions, independently of ordinary New entry.
func (q *sourceValueQuery) publishStandardConstruction(site *ast.Node, bindings sourceValueBindings, selected *sourcePreparedInvocation) {
	if q.standardConstructionSource != site || q.reading != site || q.executable == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || selected == nil || site == nil || !ast.IsNewExpression(site) {
		return
	}
	selection := selected.constructionSource
	if selection == nil || selection.issuer != q || selection.selected != selected || selection.site != site || q.owner == nil || q.owner.generation == nil || selection.generation != q.owner.generation || q.executable.values == nil || q.executable.project == nil || q.owner.generation != q.executable.values.generation || q.owner.generation != q.executable.project.activeGeneration || q.owner.program == nil || q.owner.program != q.executable.values.program {
		return
	}
	defer func() { selection.issuer, selection.selected = nil, nil; selected.constructionSource = nil }()
	file := ast.GetSourceFileOfNode(site)
	if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file || !sourceStagedOccurrenceOwned(site, q.effectOwner) {
		return
	}
	owner := enclosingCallableNode(site)
	if owner != q.effectOwner && !runtimeModuleEvaluation(q.effectOwner) {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil || publisher != selection.publisher || publisher.fact != selection.fact || publisher.fact.node != q.effectOwner || publisher.fact.sourceFile != file {
		return
	}
	for _, value := range selected.acquired.values {
		q.recordEstimatedCost(1)
		if value.native == nil || value.native.kind != sourceNativeWeakMapConstructor || len(value.path) != 0 || value.capture != nil || value.bound != nil || value.normal != nil || value.instance != nil {
			continue
		}
		_, kind := q.nativeRootDeclaration(value.node)
		if kind != sourceNativeWeakMapConstructor {
			continue
		}
		if q.executable.standardConstructions == nil {
			q.executable.standardConstructions = make(map[*ast.Node]sourceStandardConstructionContribution)
		}
		contribution := sourceStandardConstructionContribution{site: site, owner: q.effectOwner, constructor: value.node, selectionComplete: standardConstructionSelectionComplete(selected, value.node)}
		prior, exists := q.executable.standardConstructions[site]
		ledger := publisher.fact.pendingMembers
		entry := -1
		if exists {
			if prior.site != contribution.site || prior.owner != contribution.owner || prior.constructor != contribution.constructor || prior.selectionComplete || !contribution.selectionComplete || ledger == nil {
				return
			}
			for i, known := range ledger.constructions {
				if known == prior {
					entry = i
					break
				}
			}
			if entry < 0 {
				return
			} // A cached/index-only entry cannot renew the owning fact.
		} else if ledger == nil {
			ledger = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
			publisher.fact.pendingMembers = ledger
		}
		q.executable.standardConstructions[site] = contribution
		if exists {
			ledger.constructions[entry] = contribution
		} else {
			ledger.constructions = append(ledger.constructions, contribution)
		}
		ledger.revision++
		ledger.stats.ConstructionPublications++
		q.deliverStandardConstruction(contribution)
		progressPendingMemberDeclaration(q, site, "construction-published", ledger.stats)
		ledger.stats.Revisions++
		progressPendingCost(9, 1)
		return
	}
}

func (q *sourceValueQuery) standardConstructionMember(demand sourceConstructedMemberDemand, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), visitOrigins func([]sourceValue, []string, bool)) bool {
	if q.executable == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || demand.mode != accessorAcquire && (demand.mode != accessorSet|accessorNoGet || q.liveStagedAssignment() == nil) {
		return false
	}
	// Iterable/constructor arguments may carry independent callable donors.
	// This vertical has no complete constructor-input transfer for those.
	if args := demand.source.AsNewExpression().Arguments; args != nil && len(args.Nodes) != 0 {
		return false
	}
	contribution, exists := q.executable.standardConstructions[demand.source]
	if !exists {
		q.subscribeStandardConstruction(demand)
		return false
	}
	if contribution.owner != q.effectOwner && !runtimeModuleEvaluation(contribution.owner) {
		return false
	}
	// A source carrier is conditional and has no normal instance authority.
	// Native member lookup still walks the original New's own-writer index.
	carrier := sourceValue{node: contribution.site, native: &sourceNativeValue{kind: sourceNativeWeakMapSourceInstance, acquired: contribution.site}}
	q.nativeMember(carrier, demand.projection, demand.name, demand.mode, bindings, result, visit, func(value sourceValue) { visitOrigins([]sourceValue{value}, nil, false) })
	if b := q.stagedConstructedMember; b != nil && b.live && b.owner == q && b.site == contribution.site && b.transferred {
		return true // The full original Get owner retained all conditional method debts.
	}
	if b := q.stagedMember; b != nil && b.constructedGetEffects != nil && b.transferredGet != nil && b.transferredGet.receiver.node == contribution.site && q.takeStagedMemberGetTransfer(b.transferredGet) {
		return true // The exact original Get Effects loan owns this continuation.
	}
	// The original selected allocation owns this Set receiver branch. Its
	// member traversal retained every actual source/refusal above; it supplies
	// no result value and does not need a constructor implementation fallback.
	return demand.mode == accessorSet|accessorNoGet && contribution.selectionComplete
}

func (q *sourceValueQuery) standardConstructionMemberSeed(value sourceValue, key string) (*ast.Node, sourceValue, bool) {
	if q.executable == nil || key != "get" && key != "set" {
		return nil, sourceValue{}, false
	}
	contribution, exists := q.executable.standardConstructions[value.node]
	if !exists || value.native.acquired != contribution.site {
		return nil, sourceValue{}, false
	}
	global, kind := q.nativeRootDeclaration(contribution.constructor)
	if global == nil || kind != sourceNativeWeakMapConstructor {
		return nil, sourceValue{}, false
	}
	prototype := q.owner.checker.GetPropertyOfType(q.owner.checker.GetTypeOfSymbol(global), "prototype")
	if prototype == nil {
		return nil, sourceValue{}, false
	}
	member := q.owner.checker.GetPropertyOfType(q.owner.checker.GetTypeOfSymbol(prototype), key)
	if member == nil || member.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(member.ValueDeclaration)) {
		return nil, sourceValue{}, false
	}
	method := sourceNativeWeakMapGetEffect
	if key == "set" {
		method = sourceNativeWeakMapSetEffect
	}
	// Neither kind is nativeInvocable. Existing invocation/effect consumers
	// continue to own mutation, argument protocols, brand failures and Throw.
	return contribution.site, sourceValue{node: member.ValueDeclaration, native: &sourceNativeValue{kind: method, acquired: contribution.site}}, true
}

func (q *sourceValueQuery) publishStandardMemberGet(receiver, selected sourceValue, result *accessorCandidates) {
	r := q.pendingMemberRequest
	if r == nil || !r.live || r.issuer != q || r.member == nil || selected.native == nil || !standardMemberEffect(selected.native.kind) || receiver.native == nil || receiver.native.kind != sourceNativeWeakMapSourceInstance {
		return
	}
	// The marker is source-only. The consumer separately checks the exact issuer,
	// cuts, lifetime and complete acquired donor list before issuing its ACK.
	demand := r.member.demand
	if q.protectedMember != demand.get || q.effectOwner != r.consumer || q.returning != r.original[2] || q.invoking != r.original[3] {
		return
	}
	if publisher := r.member.publisher; publisher.live && publisher.fact != nil {
		publisher.fact.pendingMembers.stats.GetTransfers++
		progressPendingMember(q, r, "get-transferred", -1, publisher.fact.pendingMembers.stats)
	}
	if r.member.standardTransferSerial == 0 {
		r.member.standardTransferSerial = acquireStandardTransferSerial()
	}
	if r.member.standardTransferSerial == 0 {
		return
	}
	result.standardMemberTransfers = append(result.standardMemberTransfers, sourceStandardMemberTransfer{ticketSerial: r.member.standardTransferSerial, site: receiver.node, get: demand.get, call: r.call, owner: r.consumer, method: selected.node})
}

func (r *sourceWriterInputRequest) transferredStandardMember(acquired accessorCandidates, value sourceValue) bool {
	if r == nil || r.member == nil || value.native == nil || !standardMemberEffect(value.native.kind) {
		return false
	}
	for _, transfer := range acquired.standardMemberTransfers {
		if transfer.complete && transfer.ticketSerial != 0 && transfer.ticketSerial == r.member.standardTransferSerial && transfer.site == value.native.acquired && transfer.get == r.member.demand.get && transfer.call == r.call && transfer.owner == r.consumer && transfer.method == value.node {
			return true
		}
	}
	return false
}

// This exception covers the callee only. Its original Get owner selected before
// argument evaluation and transferred every acquired donor plus unknown. The
// assignment/New argument is deliberately NOT covered by pendingMemberComponent.
// Its ordered evaluation, constructor, replacement results and captured donors
// remain on the existing argument/effect path. No New syntax is branded here.
func (r *sourceWriterInputRequest) standardMemberAssignmentArguments(q *sourceValueQuery, acquired accessorCandidates) bool {
	if q.argumentPrefix != nil || q.callerInputs != nil || q.returnObservation != nil {
		return false
	}
	transferred := false
	for _, value := range acquired.values {
		transferred = transferred || r.transferredStandardMember(acquired, value)
	}
	if !transferred || r.member == nil || r.member.demand.call != r.call {
		return false
	}
	args := r.call.AsCallExpression().Arguments
	if args == nil {
		return true
	}
	for _, argument := range args.Nodes {
		argument = unwrapSourceCallableReference(argument)
		q.recordEstimatedCost(1)
		if argument == nil {
			return false
		}
		if sourcePrimitiveValue(argument) || ast.IsFunctionExpression(argument) || ast.IsArrowFunction(argument) {
			continue
		}
		if ast.IsIdentifier(argument) {
			symbol := q.owner.checker.GetSymbolAtLocation(argument)
			if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias == 0 && symbol.ValueDeclaration != nil && !q.owner.bindingWritten(symbol) {
				continue
			}
			return false
		}
		if !ast.IsBinaryExpression(argument) || argument.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return false
		}
		assignment := argument.AsBinaryExpression()
		left, right := unwrapSourceCallableReference(assignment.Left), unwrapSourceCallableReference(assignment.Right)
		if left == nil || !ast.IsIdentifier(left) || right == nil || !ast.IsNewExpression(right) {
			return false
		}
		symbol := q.owner.checker.GetSymbolAtLocation(left)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != q.effectOwner {
			return false
		}
	}
	return true
}

// finishStandardConstructionGet runs after the already-existing source Get walk.
// A conditional native branch cannot ACK over a known unrepresented constructor
// return, field population or Proxy alternative. Those branches keep recovery.
func finishStandardConstructionGet(result *accessorCandidates, start int, site *ast.Node, complete bool) {
	for i := start; i < len(result.standardMemberTransfers); i++ {
		transfer := &result.standardMemberTransfers[i]
		if transfer.site == site {
			transfer.complete = complete
		}
	}
}

// A transfer may pass through temporary acquired summaries. A fresh ticket must
// never consume a previous ticket's marker, even at identical syntax/cuts. This
// scalar neither retains authority nor deduplicates behavior. Saturation declines
// publication instead of recycling an identity. Only actual producer events mint.
var standardTransferSerial atomic.Uint64

func acquireStandardTransferSerial() uint64 {
	for {
		prior := standardTransferSerial.Load()
		if prior == ^uint64(0) {
			return 0
		}
		if standardTransferSerial.CompareAndSwap(prior, prior+1) {
			return prior + 1
		}
	}
}

// standardConstructionSelectionComplete belongs to the original New selection.
// Bodyless standard declarations do not need a result/output proof. Authored or
// unknown callee siblings remain independent and withhold this Effects premise.
func standardConstructionSelectionComplete(selected *sourcePreparedInvocation, constructor *ast.Node) bool {
	if selected == nil || selected.acquired.opaque || selected.acquired.valueIncomplete || selected.acquired.receiverIncomplete || len(selected.acquired.values) == 0 {
		return false
	}
	for _, value := range selected.acquired.values {
		if value.node != constructor || value.native == nil || value.native.kind != sourceNativeWeakMapConstructor || value.native.referencesIncomplete || len(value.path) != 0 || value.capture != nil || value.bound != nil || value.normal != nil || value.instance != nil {
			return false
		}
	}
	return true
}
