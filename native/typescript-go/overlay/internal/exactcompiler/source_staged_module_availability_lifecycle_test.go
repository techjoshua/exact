package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source registration precedes propagation in the actual project resolver. This
// summary subscription needs no optional native role or pending member ledger
// to survive that boundary; neither initialization nor delivery invokes a body.
func TestStagedModuleAvailabilityBeforePropagation(t *testing.T) {
	for _, source := range []string{
		`const version=6;export function read(){return version}`,
		`const version=6;export const selected=version;`,
	} {
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			analysis := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
			facts := analysis.facts
			producerNode, consumerNode := file.Statements.Nodes[0], file.Statements.Nodes[1]
			var read *ast.Node
			if ast.IsFunctionDeclaration(consumerNode) {
				read = consumerNode.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
			} else {
				read = consumerNode.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].Initializer()
			}
			work := registerCallableEffectWork(facts)
			producer, present := work.memberNodes[producerNode]
			consumer, using := work.memberNodes[consumerNode]
			if !present || !using || read == nil || !facts[producer].staged.ready || !facts[consumer].staged.ready {
				t.Fatal("actual source facts unavailable", present, using)
			}
			request, original := sourceStagedOccurrenceRequest(&facts[consumer], read, relativeDemandEffects, "source-module-before-propagation")
			if !original {
				t.Fatal("original reader factory missing")
			}
			edge := request.edge
			work.requireSourceModuleAvailability(facts, consumer, producer, edge, request.use, request.cut)
			dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, edge}]
			if dependency == nil || dependency.consumed != 0 || dependency.invalid {
				t.Fatal("pre-initialization source acquired a revision")
			}
			calls, targets, effects := len(facts[consumer].summary.Calls), len(facts[consumer].targets), len(facts[consumer].summary.DirectEffectSources)
			before := facts[consumer].staged.revisionDeliveries
			work.initializePropagation(facts)
			if dependency.consumed == 0 || dependency.consumed != work.stagedRevisions[producer] || facts[consumer].staged.revisionDeliveries != before+1 {
				t.Fatal("original module subscription lost before revision initialization", dependency.consumed, work.stagedRevisions[producer])
			}
			matches := 0
			for _, r := range work.memberModuleRequirements[consumer] {
				if r.edge == edge {
					matches++
				}
			}
			if matches != 1 || dependency.operation != read || dependency.cut != request.cut {
				t.Fatal("module factory was duplicated or retargeted")
			}
			work.dirty[consumer] = false
			work.stagedContributionChanged(producer)
			if !work.dirty[consumer] {
				t.Fatal("module revision did not dirty its original subscriber")
			}
			work.refreshMemberSourceModules(facts, consumer)
			if dependency.consumed != work.stagedRevisions[producer] {
				t.Fatal("late module revision not delivered")
			}
			delivered := facts[consumer].staged.revisionDeliveries
			callers := len(work.callers[producer])
			work.requireSourceModuleAvailability(facts, consumer, producer, edge, request.use, request.cut)
			work.refreshMemberSourceModules(facts, consumer)
			if len(work.callers[producer]) != callers || facts[consumer].staged.revisionDeliveries != delivered || len(facts[consumer].summary.Calls) != calls || len(facts[consumer].targets) != targets || len(facts[consumer].summary.DirectEffectSources) != effects {
				t.Fatal("availability replayed delivery or granted invocation/Effects")
			}
			clones := make([]callableFacts, len(facts))
			for i := range facts {
				clones[i] = cloneProjectCallableFact(facts[i])
			}
			stale := work
			stale.initializePropagation(clones)
			for _, r := range stale.memberModuleRequirements[consumer] {
				if r.edge == edge {
					t.Fatal("another facts graph inherited module enrollment")
				}
			}
			fresh := registerCallableEffectWork(clones)
			fresh.initializePropagation(clones)
			if fresh.stagedRequired[sourceStagedDependencyKey{consumer, edge}] != nil {
				t.Fatal("clone fabricated the original subscription")
			}
		})
	}
}

func TestStagedModuleAvailabilityEnrollmentRefusals(t *testing.T) {
	withReflectiveRelevanceSource(t, `const version=6;export function read(){return version}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner).facts
		producerNode, consumerNode := file.Statements.Nodes[0], file.Statements.Nodes[1]
		read := consumerNode.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
		for _, kind := range []string{"pending-producer", "projection", "wrong-cut", "wrong-producer", "unregistered-membership"} {
			t.Run(kind, func(t *testing.T) {
				work := registerCallableEffectWork(facts)
				producer, consumer := work.memberNodes[producerNode], work.memberNodes[consumerNode]
				request, _ := sourceStagedOccurrenceRequest(&facts[consumer], read, relativeDemandEffects, "module-enrollment-refusal:"+kind)
				if kind == "pending-producer" {
					facts[producer].staged.ready = false
					defer func() { facts[producer].staged.ready = true }()
				}
				work.requireSourceModuleAvailability(facts, consumer, producer, request.edge, request.use, request.cut)
				key := sourceStagedDependencyKey{consumer, request.edge}
				dependency := work.stagedRequired[key]
				if kind == "projection" {
					dependency.projectionPending = true
				}
				if kind == "wrong-cut" {
					wrong := request.cut
					wrong.invoking = read
					work.requireSourceModuleAvailability(facts, consumer, producer, request.edge, request.use, wrong)
				}
				if kind == "wrong-producer" {
					work.requireSourceModuleAvailability(facts, consumer, consumer, request.edge, request.use, request.cut)
				}
				if kind == "unregistered-membership" {
					delete(work.memberModuleMemberships, key)
				}
				work.initializePropagation(facts)
				if kind == "projection" {
					if !dependency.projectionPending {
						t.Fatal("module availability cleared pending projection")
					}
					return
				}
				if dependency.consumed != 0 {
					t.Fatal("unsupported/pending subscription acquired a revision", kind)
				}
				if kind == "pending-producer" {
					facts[producer].staged.ready = true
					work.stagedContributionChanged(producer)
					work.refreshMemberSourceModules(facts, consumer)
					if dependency.consumed != work.stagedRevisions[producer] {
						t.Fatal("real late module publication did not resume")
					}
				}
				if (kind == "wrong-cut" || kind == "wrong-producer") && !dependency.invalid {
					t.Fatal("conflicting factory invalidation was cleared")
				}
			})
		}
	})
}
