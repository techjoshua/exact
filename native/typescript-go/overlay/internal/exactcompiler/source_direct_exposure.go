package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDirectExposure is a conditional native result category, never a value
// or a successful Call receipt. Its two original effect publications remain
// required independently of excluding this alternative from writer exposure.
type sourceDirectExposure struct {
	producer, acquired, consumer, argument *ast.Node
	cuts                                   [4]*ast.Node
	kind                                   sourceNativeKind
	settled                                bool
}

type sourceDirectExposureKey struct {
	producer, acquired, consumer, argument *ast.Node
	cuts                                   [4]*ast.Node
	kind                                   sourceNativeKind
}

func directExposureNative(kind sourceNativeKind) bool {
	return kind == sourceNativeSymbolForExposure || kind == sourceNativeObjectCreateExposure
}

// directExposureEligible checks operation shape, not types or result values.
// Unsupported coercion/descriptor protocols retain their original path.
func directExposureEligible(kind sourceNativeKind, call *ast.Node) bool {
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 1 || ast.IsSpreadElement(args[0]) {
		return false
	}
	if kind == sourceNativeObjectCreateExposure {
		return true
	}
	return kind == sourceNativeSymbolForExposure && (ast.IsStringLiteral(args[0]) || ast.IsNoSubstitutionTemplateLiteral(args[0]))
}

// excludeNativeDirectExposure is used only by the empty-path acquisition of a
// refused input itself. Native acquisition happens at the original producer's
// source cut. No captured scope or value is installed in an earlier consumer.
func (q *sourceValueQuery) excludeNativeDirectExposure(call *ast.Node, bindings sourceValueBindings) bool {
	if !q.directWriterExposure || q.probingDirectExposure || !q.dependenciesOnly || q.inputs != nil || q.callerInputs != nil || q.installedReceiverCall != nil || q.returnObservation != nil || q.argumentPrefix != nil || q.operation != nil || q.executable == nil || q.directExposureConsumer == nil || ast.GetSourceFileOfNode(call) != ast.GetSourceFileOfNode(q.effectOwner) {
		return false
	}
	if call == nil || !ast.IsCallExpression(call) {
		return false
	}
	// Enrollment only. Other member names keep ordinary acquisition. Saved
	// identifier callees still pass the same native acquisition owner below.
	expression := unwrapSourceCallableReference(call.Expression())
	if expression == nil {
		return false
	}
	if !ast.IsIdentifier(expression) {
		_, key := sourceLiteralMemberReference(expression)
		if key != "create" && key != "for" {
			return false
		}
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return false
	}
	var acquired accessorCandidates
	func() {
		priorRead, priorInit, priorReturn := q.reading, q.initializing, q.returning
		q.reading, q.initializing, q.returning = call, call, nil
		q.probingDirectExposure = true
		defer func() {
			q.probingDirectExposure = false
			q.reading, q.initializing, q.returning = priorRead, priorInit, priorReturn
		}()
		acquired = q.receiverCandidates(call, bindings)
	}()
	all := len(acquired.values) > 0 && !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete
	known := false
	for _, value := range acquired.values {
		if value.native == nil || !directExposureNative(value.native.kind) || !directExposureEligible(value.native.kind, call) || len(value.path) != 0 {
			all = false
			continue
		}
		known = true
		fact := publisher.fact
		if fact.pendingMembers == nil {
			fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
		}
		ledger := fact.pendingMembers
		if ledger.directExposures == nil {
			ledger.directExposures = make(map[sourceDirectExposureKey]*sourceDirectExposure)
		}
		key := sourceDirectExposureKey{producer: call, acquired: value.native.acquired, consumer: q.directExposureConsumer, argument: q.directExposureArgument, cuts: q.directExposureCuts, kind: value.native.kind}
		if ledger.directExposures[key] == nil {
			if len(ledger.directExposures) >= 64 {
				all = false
				ledger.stats.DirectExposureOverflow++
				continue
			}
			ledger.directExposures[key] = &sourceDirectExposure{producer: call, acquired: value.native.acquired, consumer: q.directExposureConsumer, argument: q.directExposureArgument, cuts: q.directExposureCuts, kind: value.native.kind}
			ledger.stats.DirectExposureRegistered++
			progressPendingMemberDeclaration(q, call, "direct-exposure-registered", ledger.stats)
		}
	}
	if all && known {
		publisher.fact.pendingMembers.stats.DirectExposureConsumed++
		progressPendingMemberDeclaration(q, call, "direct-exposure-consumed", publisher.fact.pendingMembers.stats)
		return true
	}
	return false
}

// finishDirectExposureProducer records only original collector publication.
// The source operation event is not a query-result cache or execution identity.
func finishDirectExposureProducer(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) {
	if fact == nil || owner == nil || call == nil {
		return
	}
	if fact.directExposurePublished == nil {
		fact.directExposurePublished = make(map[*ast.Node]bool)
	}
	fact.directExposurePublished[call] = true
}

// drainDirectExposures runs in the existing effect work owner. A category pays
// neither producer effects nor the consuming Call. Missing publications remain
// explicit pending/unknown contributions and cannot settle from category alone.
func drainDirectExposures(facts []callableFacts, owner *executableBodyOwner) {
	// Original publication facts survive ordinary cached fact cloning. They
	// contain source operations only, never the producer's query or input frame.
	published := make(map[*ast.Node]bool)
	for i := range facts {
		for operation, done := range facts[i].directExposurePublished {
			published[operation] = done
		}
	}

	for i := range facts {
		fact := &facts[i]
		if fact.pendingMembers == nil {
			continue
		}
		for _, row := range fact.pendingMembers.directExposures {
			if published[row.producer] && published[row.consumer] {
				if !row.settled {
					row.settled = true
					fact.pendingMembers.stats.DirectExposureSettled++
					progressDirectExposureDisposition(true)
				}
			} else {
				fact.pendingMembers.stats.DirectExposureUnresolved++
				appendOpaqueAccessorEffect(fact, accessorCandidates{opaque: true, cause: row.producer})
				progressDirectExposureDisposition(false)
			}
		}
	}
}
