package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type sourceStagedDependencyKey struct {
	consumer int
	edge     string
}

// sourceStagedDependency is graph-owned membership, not an acquired input cache.
// Its descriptive cut names the original demand. Consumed revisions prove only
// delivery of summary contributions, never normal output or execution authority.
type sourceStagedDependency struct {
	producer          int
	operation         *ast.Node
	cut               sourceRelativeCut
	consumed          uint64
	invalid           bool
	projectionPending bool // Required input/result owner has not delivered, even if Effects summary is ready.
}

type sourceStagedPendingReason uint8

const (
	stagedPendingLocalProducer sourceStagedPendingReason = iota
	stagedPendingRevision
	stagedPendingDependency
	stagedPendingPublication
)

// sourceStagedPending is the explicit unfinished compiler obligation retained
// before publication. It cannot become a runtime-unknown effect or a covered
// empty alternative. It holds generation-owned source nodes only.
type sourceStagedPending struct {
	consumer, producer, operation *ast.Node
	cut                           sourceRelativeCut
	reason                        sourceStagedPendingReason
}

func (work *callableEffectWork) requireStagedSummary(facts []callableFacts, consumer, producer int, edge string, operation *ast.Node, cut sourceRelativeCut) {
	work.demandCallable(producer)
	if work.stagedRequired == nil {
		work.stagedRequired = make(map[sourceStagedDependencyKey]*sourceStagedDependency)
	}
	key := sourceStagedDependencyKey{consumer: consumer, edge: edge}
	if current := work.stagedRequired[key]; current != nil {
		current.invalid = current.invalid || current.producer != producer || current.operation != operation || current.cut != cut
		return
	}
	work.stagedRequired[key] = &sourceStagedDependency{producer: producer, operation: operation, cut: cut}
	if !facts[producer].staged.ready {
		facts[consumer].staged.pendingBeforeLocal++
	}
}

func (work *callableEffectWork) observeStagedSummary(facts []callableFacts, consumer, producer int, edge string) {
	if dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, edge}]; dependency != nil {
		if dependency.producer != producer {
			dependency.invalid = true
			return
		}
		// Source registration and DATA delivery can precede propagation setup.
		// A ready definition has no consumable graph revision until that owner
		// initializes it. Keep the membership pending for the normal refresh.
		if producer < 0 || producer >= len(work.stagedRevisions) || work.stagedRevisions[producer] == 0 {
			return
		}
		if dependency.consumed != work.stagedRevisions[producer] {
			facts[consumer].staged.revisionDeliveries++
			dependency.consumed = work.stagedRevisions[producer]
			work.afterEntryLawModuleConsumption(consumer, producer, edge)
			work.afterReflectiveKeyModule(consumer, producer, edge)
			work.afterNativeEagerKeyModule(consumer, producer, edge)
			work.afterNativeWriterCapabilityModule(consumer, producer, edge)
		}
	}
}

// stagedContributionChanged includes disposition-only changes, independently of
// environment bits. Existing reverse caller indexes schedule summary consumers.
func (work *callableEffectWork) stagedContributionChanged(index int) {
	if index >= len(work.stagedRevisions) {
		return
	}
	work.stagedRevisions[index]++
	for _, caller := range work.callers[index] {
		work.dirty[caller] = true
	}
}

// settleStagedPublication runs after ordinary effect propagation is quiescent.
// SCCs can settle together once locally extracted and current required revisions
// are consumed. Outgoing required components must settle first. Sink scheduling
// visits component edges once, rather than repeatedly rescanning a dependency DAG.
func (work *callableEffectWork) settleStagedPublication(facts []callableFacts, cycles []int) []sourceStagedPending {
	if len(work.stagedRequired) != 0 {
		cycles = callableDependencyCycleGroups(facts, work.stagedRequired)
	}
	count := 0
	for _, group := range cycles {
		if group >= count {
			count = group + 1
		}
	}
	eligible := make([]bool, count)
	for index := range eligible {
		eligible[index] = true
	}
	remaining := make([]int, count)
	parents := make([][]int, count)
	edges := make(map[[2]int]bool)
	for index := range facts {
		facts[index].staged.settled = false
		facts[index].staged.pending = nil
		if facts[index].staged.operationsPending {
			eligible[cycles[index]] = false
		}
		if (len(facts[index].staged.calls) != 0 || len(facts[index].staged.invoked) != 0) && !facts[index].staged.ready {
			eligible[cycles[index]] = false
		}
	}
	for key, dependency := range work.stagedRequired {
		consumer, producer := cycles[key.consumer], cycles[dependency.producer]
		if !facts[dependency.producer].staged.ready {
			eligible[producer] = false
		}
		if dependency.projectionPending || dependency.invalid || !facts[key.consumer].staged.ready || !facts[dependency.producer].staged.ready || dependency.consumed != work.stagedRevisions[dependency.producer] {
			eligible[consumer] = false
		}
		pair := [2]int{consumer, producer}
		if consumer != producer && !edges[pair] {
			edges[pair] = true
			remaining[consumer]++
			parents[producer] = append(parents[producer], consumer)
		}
	}
	var queue []int
	for group := range eligible {
		if eligible[group] && remaining[group] == 0 {
			queue = append(queue, group)
		}
	}
	settled := make([]bool, count)
	for head := 0; head < len(queue); head++ {
		group := queue[head]
		settled[group] = true
		for _, parent := range parents[group] {
			remaining[parent]--
			if eligible[parent] && remaining[parent] == 0 {
				queue = append(queue, parent)
			}
		}
	}
	for index := range facts {
		facts[index].staged.settled = facts[index].staged.ready && settled[cycles[index]]
	}
	for key, dependency := range work.stagedRequired {
		if settled[cycles[key.consumer]] {
			continue
		}
		reason := stagedPendingDependency
		if !facts[dependency.producer].staged.ready {
			reason = stagedPendingLocalProducer
		} else if dependency.invalid || dependency.consumed != work.stagedRevisions[dependency.producer] {
			reason = stagedPendingRevision
		}
		facts[key.consumer].staged.pending = append(facts[key.consumer].staged.pending, sourceStagedPending{consumer: facts[key.consumer].node, producer: facts[dependency.producer].node, operation: dependency.operation, cut: dependency.cut, reason: reason})
	}
	return stagedPublicationPending(facts)
}

// stagedPublicationPending is shared by direct collection, project merge and the
// last summary projection. Cloned local extraction flags alone cannot authorize
// publication before the rebuilt graph has settled its supporting requirements.
func stagedPublicationPending(facts []callableFacts) []sourceStagedPending {
	var pending []sourceStagedPending
	for index := range facts {
		fact := &facts[index]
		pending = append(pending, fact.staged.pending...)
		if fact.staged.operationsPending {
			if len(fact.staged.operationUses) == 0 {
				pending = append(pending, sourceStagedPending{consumer: fact.node, operation: fact.node, reason: stagedPendingPublication})
			}
			for _, use := range fact.staged.operationUses {
				operation := use.call
				if operation == nil {
					operation = use.request.use
				}
				pending = append(pending, sourceStagedPending{consumer: fact.node, producer: use.request.producer.operation, operation: operation, cut: use.request.cut, reason: stagedPendingLocalProducer})
			}
		}
		if !fact.staged.settled && len(fact.staged.pending) == 0 && (len(fact.staged.calls) != 0 || len(fact.staged.invoked) != 0) {
			pending = append(pending, sourceStagedPending{consumer: fact.node, operation: fact.node, reason: stagedPendingPublication})
		}
	}
	sort.SliceStable(pending, func(i, j int) bool {
		if pending[i].reason != pending[j].reason {
			return pending[i].reason < pending[j].reason
		}
		for _, pair := range [][2]*ast.Node{{pending[i].operation, pending[j].operation}, {pending[i].producer, pending[j].producer}, {pending[i].consumer, pending[j].consumer}} {
			leftFile, leftPos := stagedPendingLocation(pair[0])
			rightFile, rightPos := stagedPendingLocation(pair[1])
			if leftFile != rightFile {
				return leftFile < rightFile
			}
			if leftPos != rightPos {
				return leftPos < rightPos
			}
		}
		return false
	})
	return pending
}

func stagedPendingLocation(node *ast.Node) (string, int) {
	if node == nil {
		return "", 0
	}
	if source := ast.GetSourceFileOfNode(node); source != nil {
		return source.FileName(), node.Pos()
	}
	return "", node.Pos()
}

func stagedPublicationError(pending []sourceStagedPending) string {
	if len(pending) == 0 {
		return ""
	}
	operation := pending[0].operation
	if operation != nil {
		if source := ast.GetSourceFileOfNode(operation); source != nil {
			return fmt.Sprintf("Compiler analysis coverage gap: required staged effect contribution at %s:%d remains pending", source.FileName(), operation.Pos())
		}
	}
	return "Compiler analysis coverage gap: required staged effect contribution remains pending"
}
