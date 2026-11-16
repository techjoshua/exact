package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type sourceStagedModuleRequirement struct {
	producer    int // -1 until the selected external initializer joins this work graph.
	edge        string
	declaration *ast.Node
}

// requireMemberSourceModules connects captured source endpoints to their
// original initializer facts. It is availability membership, not invocation or
// permission to merge module effects into a function. The member/Get consumer
// must independently consume the constructor, writer and input contributions.
func (work *callableEffectWork) requireMemberSourceModules(facts []callableFacts, fact *callableFacts, demand *sourcePendingMemberDemand) {
	if work == nil || fact == nil || demand == nil || !demand.rolesResolved || len(facts) == 0 {
		return
	}
	consumer, exists := work.memberNodes[fact.node]
	if !exists {
		return
	}
	require := func(endpoint sourceMemberEndpoint) {
		if endpoint.kind != memberCapture || endpoint.source == nil {
			return
		}
		module := sourceStagedModuleOwner(endpoint.source)
		producer, exists := work.memberNodes[module]
		if !exists || module == nil || !sourceStagedOccurrenceOwned(endpoint.source, module) {
			return // An unavailable module relationship remains with the source owner.
		}
		edge := fmt.Sprintf("%s:member-module:%d:%d", fact.summary.ID, demand.call.Pos(), endpoint.source.Pos())
		cut := sourceRelativeCut{operation: demand.call, use: demand.call, reading: demand.call}
		work.requireSourceModuleAvailability(facts, consumer, producer, edge, demand.call, cut)
	}
	require(demand.receiver)
	for _, endpoint := range demand.arguments {
		require(endpoint)
	}
}

// refreshMemberSourceModules rebuilds graph-local memberships from immutable
// source endpoints on a clone and consumes late initializer revisions. No saved
// query is replayed and no source index is interpreted as a completed producer.
func (work *callableEffectWork) refreshMemberSourceModules(facts []callableFacts, index int) {
	for _, requirement := range work.memberModuleRequirements[index] {
		if facts[requirement.producer].staged.ready {
			work.observeStagedSummary(facts, index, requirement.producer, requirement.edge)
		}
	}
}

// requireSourceModuleAvailability is shared by captured member endpoints and
// original imported operand reads. It records source activation dependencies
// and late revision delivery without invoking a module or merging its Effects
// into the referencing function. Clones rebuild this graph-local membership.
func (work *callableEffectWork) requireSourceModuleAvailability(facts []callableFacts, consumer, producer int, edge string, operation *ast.Node, cut sourceRelativeCut) {
	work.requireStagedSummary(facts, consumer, producer, edge, operation, cut)
	if work.memberModuleRequirements == nil {
		work.memberModuleRequirements = make(map[int][]sourceStagedModuleRequirement)
	}
	if work.memberModuleMemberships == nil {
		work.memberModuleMemberships = make(map[sourceStagedDependencyKey]struct{})
	}
	key := sourceStagedDependencyKey{consumer: consumer, edge: edge}
	if _, listed := work.memberModuleMemberships[key]; !listed {
		work.memberModuleMemberships[key] = struct{}{}
		work.memberModuleRequirements[consumer] = append(work.memberModuleRequirements[consumer], sourceStagedModuleRequirement{producer: producer, edge: edge})
	}
	// A module publication dirties the existing consumer. It never appends a
	// target edge, so stored declarations and initializer bodies stay dormant.
	if producer >= len(work.callers) {
		return // Extraction has issued membership. Propagation rebuilds reverse edges.
	}
	if work.memberModuleCallers == nil {
		work.memberModuleCallers = make(map[[2]int]struct{})
	}
	pair := [2]int{producer, consumer}
	if _, found := work.memberModuleCallers[pair]; !found {
		work.memberModuleCallers[pair] = struct{}{}
		work.callers[producer] = append(work.callers[producer], consumer)
	}
	if facts[producer].staged.ready {
		work.observeStagedSummary(facts, consumer, producer, edge)
	}
}

// sourceModuleAvailabilityEnrollment is an already-issued same-graph summary
// subscription. It carries no observation, module execution or imported value.
type sourceModuleAvailabilityEnrollment struct {
	consumer, producer int
	edge               string
	operation          *ast.Node
	cut                sourceRelativeCut
}

// sourceModuleAvailabilityEnrollments preserves original source registrations
// while propagation rebuilds its indexes. Optional native/ledger snapshots need
// not repeat every earlier availability read, but its required factory survives.
func (work *callableEffectWork) sourceModuleAvailabilityEnrollments(facts []callableFacts) []sourceModuleAvailabilityEnrollment {
	if len(facts) == 0 || len(work.operationFacts) != len(facts) || &work.operationFacts[0] != &facts[0] {
		return nil // Another graph must issue its own source registrations.
	}
	var enrolled []sourceModuleAvailabilityEnrollment
	for consumer, fact := range facts {
		if previous, known := work.memberNodes[fact.node]; !known || previous != consumer || fact.sourceFile == nil || ast.GetSourceFileOfNode(fact.node) != fact.sourceFile {
			continue
		}
		for _, requirement := range work.memberModuleRequirements[consumer] {
			key := sourceStagedDependencyKey{consumer: consumer, edge: requirement.edge}
			dependency := work.stagedRequired[key]
			_, issued := work.memberModuleMemberships[key]
			producer := requirement.producer
			if !issued || requirement.edge == "" || dependency == nil || dependency.invalid || dependency.producer != producer || dependency.operation == nil || dependency.cut.operation == nil || producer < 0 || producer >= len(facts) {
				continue
			}
			if previous, known := work.memberNodes[facts[producer].node]; !known || previous != producer || facts[producer].sourceFile == nil || ast.GetSourceFileOfNode(facts[producer].node) != facts[producer].sourceFile {
				continue
			}
			enrolled = append(enrolled, sourceModuleAvailabilityEnrollment{consumer: consumer, producer: producer, edge: requirement.edge, operation: dependency.operation, cut: dependency.cut})
		}
	}
	return enrolled
}
