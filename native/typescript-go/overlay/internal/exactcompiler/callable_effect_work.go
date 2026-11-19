package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sort"
	"strings"
)

// callableEffectPurpose distinguishes summary collection from an operation owner.
// Only the latter may transfer original expression work to a staged protocol.
type callableEffectPurpose uint8

const (
	callableProtocolEffects callableEffectPurpose = iota
	callableMayEffects
)

// Public project analysis collects MAY effects. Standalone operation owners may transfer protocol work.
func publicCallableEffectPurpose(owner *executableBodyOwner) callableEffectPurpose {
	if owner != nil && owner.project != nil {
		return callableMayEffects
	}
	return callableProtocolEffects
}

// callableEffectWork schedules only callers whose inputs changed. Ascending passes retain
// the original solver's traversal order, including cycle widening and path tie breaking.
// Opaque effects and prior summary signatures remain immutable between input changes.
type callableEffectWork struct {
	// purpose is synchronous and restored on nested extraction/return, not cloned.
	purpose                       callableEffectPurpose
	operationCanonical            sourceCanonicalReadinessOwner              // Synchronous canonical readiness owner while direct-call extraction is suspended.
	descriptorTargetExecution     *sourceDescriptorTargetExecution           // Stack-only original Get/result source executor.
	nativeCapabilityNotifications *sourceStagedNativeCapabilityNotifications // Derived THIS-graph fan-in, never authority.
	nativeEffectsExecution        *sourceStagedNativeEffectsExecution        // Synchronous existing-task entry only.
	nativeEagerExecution          *sourceStagedNativeEagerExecution          // Distinct live eager dispatcher, never a cloned source right.

	declarationCallObserved     map[sourceStagedOperationKey]*projectGeneration                   // Fresh original Call source description, not actual invocation.
	entryLawReceipts            map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt         // Current graph's original implicit protocol observations.
	constructionEffectsObserved map[sourceStagedOperationKey]*sourceStagedConstructionObservation // Graph-local original New observation.
	memberProtocolSources       map[*ast.Node]sourceStagedOperationRequest                        // original semantic source identities, never completion
	writerSourceInputs          map[sourceStagedOperationKey]*sourceStagedWriterSourceInputs      // graph-local original B delivery, never cached scope
	nativeMemberEffects         map[sourceStagedOperationKey]*sourceStagedNativeMemberEffects
	memberCoverageObserved      map[sourceStagedOperationKey]*projectGeneration                 // current graph original Get publication only
	assignmentObserved          map[sourceStagedOperationKey]*sourceStagedAssignmentObservation // graph-local passive Set receipt, never cached
	assignmentObserving         map[sourceStagedOperationKey]bool                               // Synchronous original Set loans, never a completion receipt.
	stagedRequired              map[sourceStagedDependencyKey]*sourceStagedDependency
	stagedRevisions             []uint64
	mutationTransferGeneration  uint64 // Scheduling identity of the rebuilt canonical transfer tables, never a semantic receipt.
	// Extraction tasks are canonical source facts, never captured query work.
	extractionPhases       []callableExtractionPhase
	extractionQueue        []callableExtractionTask
	extractionHead         int
	extractionCalls        map[*ast.Node]struct{}
	extracting             int
	inputDataChanged       bool                  // Coalesced DATA-to-relative-consumer continuation on the existing fixed point.
	constructedDataChanged bool                  // Coalesced data-to-receiver continuation, never a second scheduler.
	legacySourceInputs     map[*ast.Node]bool    // graph-local dispatch of explicit unmigrated input owners
	constructedIssued      map[[2]*ast.Node]bool // graph-local original Call/construction source deliveries
	operationPreparing     bool                  // Existing extraction/delivery owner, never reentered by a source callback.
	operationEpoch         *sourceStagedOperationEpoch
	operationGeneration    *projectGeneration
	operationIDs           map[sourceStagedOperationKey]sourceStagedOperationID
	operationRecipes       map[sourceStagedOperationKey]sourceStagedOperationRecipe
	operationFacts         []callableFacts // owning graph only, never a query or activation
	operations             []sourceStagedOperationState
	// Graph-owned index of immutable source relationships, not query outcomes.
	nativeInstallations map[*ast.Node]map[string]map[*ast.Node]*sourceStagedNativeGetSource

	writerCapturePublications map[*sourceWriterCapture]uint64

	memberModuleRequirements map[int][]sourceStagedModuleRequirement
	memberModuleMemberships  map[sourceStagedDependencyKey]struct{}
	memberModuleCallers      map[[2]int]struct{}
	memberDeliveryCursors    []int
	memberCallerSets         []map[int]struct{}
	memberRevisions          []uint64
	memberCallers            [][]int
	memberNodes              map[*ast.Node]int

	dirty      []bool
	callers    [][]int
	opaque     [][]StateEffect
	signatures []callableEffectSignatures
}

type callableEffectSignatures struct {
	environment, reads, writes, contexts string
}

func newCallableEffectWork(facts []callableFacts) callableEffectWork {
	work := callableEffectWork{extracting: -1}
	work.initializePropagation(facts)
	return work
}

// initializePropagation starts the existing fixed point after local producers
// have yielded their source requirements. The extraction queue remains owned by
// this same work object. No normal output or selection receipt is introduced.
func (work *callableEffectWork) initializePropagation(facts []callableFacts) {
	moduleAvailability := work.sourceModuleAvailabilityEnrollments(facts)
	propagation := callableEffectWork{
		writerCapturePublications: make(map[*sourceWriterCapture]uint64),
		memberDeliveryCursors:     make([]int, len(facts)), memberCallerSets: make([]map[int]struct{}, len(facts)),
		memberRevisions: make([]uint64, len(facts)), memberCallers: make([][]int, len(facts)), memberNodes: make(map[*ast.Node]int, len(facts)),
		dirty: make([]bool, len(facts)), callers: make([][]int, len(facts)),
		opaque: make([][]StateEffect, len(facts)), signatures: make([]callableEffectSignatures, len(facts)),
	}
	work.writerCapturePublications = propagation.writerCapturePublications
	work.memberDeliveryCursors = propagation.memberDeliveryCursors
	work.memberCallerSets = propagation.memberCallerSets
	work.memberRevisions = propagation.memberRevisions
	work.memberCallers = propagation.memberCallers
	work.memberNodes = propagation.memberNodes
	work.dirty = propagation.dirty
	work.callers = propagation.callers
	work.opaque = propagation.opaque
	work.signatures = propagation.signatures
	work.stagedRevisions = make([]uint64, len(facts))
	for index := range facts {
		work.memberNodes[facts[index].node] = index
		if facts[index].staged.ready {
			work.stagedRevisions[index] = 1
		}
	}
	for index := range facts {
		fact := &facts[index]
		work.dirty[index] = true
		work.opaque[index] = opaqueCallStateEffects(fact)
		work.signatures[index] = callableEffectSignatures{
			environment: environmentSourcesSignature(fact.summary.EffectSources),
			reads:       stateEffectSetSignature(fact.summary.StateReads),
			writes:      stateEffectSetSignature(fact.summary.StateWrites),
			contexts:    contextEffectSetSignature(fact.summary.Contexts),
		}
		for _, target := range fact.targets {
			callers := work.callers[target]
			if !facts[target].progressReceiver && (len(callers) == 0 || callers[len(callers)-1] != index) {
				work.callers[target] = append(callers, index)
			}
		}
	}
	work.memberModuleRequirements = nil
	work.memberModuleMemberships = nil
	work.memberModuleCallers = nil
	// Source registration may precede revision initialization. Re-enroll only
	// those exact same-graph factories, then merge later native/ledger sources.
	for _, input := range moduleAvailability {
		work.requireSourceModuleAvailability(facts, input.consumer, input.producer, input.edge, input.operation, input.cut)
	}
	for index := 1; index < len(work.operations); index++ {
		work.operations[index].moduleInputs = nil
		work.registerNativeModuleInputs(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)})
	}
	for index := range facts {
		if ledger := facts[index].pendingMembers; ledger != nil {
			for _, demand := range ledger.sites {
				work.requireMemberSourceModules(facts, &facts[index], demand)
			}
		}
		work.refreshPendingMembers(facts, index)
	}
}

// Context effects describe a set of capabilities. Recursive callers can reorder the same
// set indefinitely, so convergence compares canonical membership without changing emission order.
func contextEffectSetSignature(values []ContextEffect) string {
	if len(values) < 2 {
		return contextEffectsSignature(values)
	}
	ordered := append([]ContextEffect(nil), values...)
	sort.Slice(ordered, func(left, right int) bool {
		a, b := ordered[left], ordered[right]
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		if a.Token != b.Token {
			return a.Token < b.Token
		}
		if a.rootDeclaration != b.rootDeclaration {
			return a.rootDeclaration < b.rootDeclaration
		}
		return strings.Compare(a.Confidence, b.Confidence) < 0
	})
	return contextEffectsSignature(ordered)
}

// State effects are unordered obligations. Compare full member identities without mutating
// their retained order or removing duplicates. Paths keep structured property boundaries,
// and unknown confidence and receiver ownership remain distinct during convergence.
func stateEffectSetSignature(values []StateEffect) string {
	keys := make([]string, 0, len(values))
	for _, effect := range values {
		receiverKind, receiverRoot, receiverIndex := "", "", 0
		if effect.Receiver != nil {
			receiverKind, receiverRoot, receiverIndex = effect.Receiver.Kind, effect.Receiver.Root, effect.Receiver.Index
		}
		keys = append(keys, arrayRootProofSignature(effect.ArrayRoots)+fmt.Sprintf("%q:%q:%q:%q:%q:%t:%q:%d:%q",
			effect.Kind, effect.Path, stateEffectPathKey(effect), effect.Confidence, effect.Operation,
			effect.Receiver != nil, receiverKind, receiverIndex, receiverRoot))
	}
	sort.Strings(keys)
	return strings.Join(keys, "\n")
}

// Exposure dependencies dirty the same existing work queue. They never become
// invocation edges and never merge a dormant donor body's effects into its user.
func (work *callableEffectWork) refreshPendingMembers(facts []callableFacts, index int) bool {
	work.refreshMemberSourceModules(facts, index)
	ledger := facts[index].pendingMembers
	if ledger == nil {
		return false
	}
	ledger.stats.Refreshes++
	progressPendingCost(4, 1)
	if work.memberRevisions[index] == ledger.revision {
		ledger.stats.RefreshNoops++
		progressPendingCost(5, 1)
		return false
	}
	for _, relation := range ledger.writerCaptures {
		if relation.publication > work.writerCapturePublications[relation] {
			work.writerCapturePublications[relation] = relation.publication
			ledger.stats.WriterInputMappedDeliveries++
		}
	}
	work.memberRevisions[index] = ledger.revision
	work.stagedContributionChanged(index)
	work.dirty[index] = true
	ledger.stats.DirtyNotifications++
	progressPendingMemberDirty()
	// Revisions can publish roles, unknown or constructors without new donors.
	// Consume only the append-only delivery tail, never rescan accumulated sites.
	for _, donor := range ledger.newDonors[work.memberDeliveryCursors[index]:] {
		ledger.stats.NewDonorDeliveries++
		progressPendingCost(6, 1)
		target, found := work.memberNodes[donor]
		if !found {
			continue
		}
		if work.memberCallerSets[target] == nil {
			work.memberCallerSets[target] = make(map[int]struct{})
		}
		ledger.stats.CallerComparisons++
		progressPendingCost(7, 1)
		if _, present := work.memberCallerSets[target][index]; !present {
			work.memberCallerSets[target][index] = struct{}{}
			work.memberCallers[target] = append(work.memberCallers[target], index)
			ledger.stats.CallerInsertions++
			progressPendingCost(8, 1)
		}
	}
	work.memberDeliveryCursors[index] = len(ledger.newDonors)
	return true
}
func (work *callableEffectWork) notifyPendingMemberDonors(facts []callableFacts, index int) bool {
	earlier := false
	for _, caller := range work.memberCallers[index] {
		work.dirty[caller] = true
		earlier = earlier || caller <= index
		if ledger := facts[caller].pendingMembers; ledger != nil {
			ledger.stats.DirtyNotifications++
			progressPendingMemberDirty()
		}
	}
	return earlier
}
