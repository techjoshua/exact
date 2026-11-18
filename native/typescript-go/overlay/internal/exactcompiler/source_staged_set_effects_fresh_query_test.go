package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Exercise the actual original SOURCE loan at the existing synchronous member
// registrar, not a constructed borrow or detached recipe. The registrar still
// receives each original delivery exactly once; only validity checks are repeated.
func TestOriginalSetEffectsFreshQueryOwner(t *testing.T) {
	withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(foreign *executableBodyOwner, _ *ast.SourceFile) {
		withReflectiveRelevanceSource(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
			prepared := prepareCallableSourceFacts(file, owner.checker, nil, owner)
			facts := prepared.facts
			work := registerCallableEffectWork(facts)
			restore := registerWriterInputFacts(owner, facts, &work)
			defer restore()
			installBuildingInitializers(owner, file, facts)
			var originalQuery *sourceValueQuery
			for _, publisher := range owner.pendingMemberPublishers {
				original := publisher.workRegistrar.originalGetMutation
				publisher.workRegistrar.originalGetMutation = func(q *sourceValueQuery, get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, origin *ast.Node, projection []string, name string, standard *sourceValue, ownMembers ...*ast.Node) bool {
					b := q.liveStagedAssignment()
					if originalQuery == nil && b != nil && sourceText(file, b.request.operation) == "receiver().work=input.value" {
						// A passing live consumer is required before each negative;
						// none may pass merely because its issuer was never installed.
						loan := q.liveAssignmentSourceEffects()
						if loan == nil {
							t.Fatal("genuine same-executable fresh SOURCE query refused")
						}
						originalQuery = q
						if q.owner == owner.values || q.owner.initializerRevision != 0 || q.owner.initializerDeclarations != nil || q.owner.initializerOccurrences != nil || owner.values.initializerRevision == 0 {
							t.Fatal("fresh SOURCE query borrowed outer initializer/current state")
						}
						otherExecutable := newExecutableBodyOwner(owner.project, owner.checker)
						q.executable = otherExecutable
						if q.liveAssignmentSourceEffects() != nil {
							t.Fatal("different executable borrowed original SOURCE loan")
						}
						q.executable = owner
						if q.liveAssignmentSourceEffects() != loan {
							t.Fatal("executable refusal damaged genuine loan")
						}
						program := q.owner.program
						q.owner.program = foreign.values.program
						if q.liveAssignmentSourceEffects() != nil {
							t.Fatal("foreign Program accepted")
						}
						q.owner.program = program
						if q.liveAssignmentSourceEffects() != loan {
							t.Fatal("Program refusal damaged genuine loan")
						}
						checker := q.owner.checker
						q.owner.checker = foreign.checker
						if q.liveAssignmentSourceEffects() != nil {
							t.Fatal("foreign checker accepted")
						}
						q.owner.checker = checker
						if q.liveAssignmentSourceEffects() != loan {
							t.Fatal("checker refusal damaged genuine loan")
						}
						generation := q.owner.generation
						q.owner.generation = foreign.values.generation
						if q.liveAssignmentSourceEffects() != nil {
							t.Fatal("foreign generation accepted")
						}
						q.owner.generation = generation
						if q.liveAssignmentSourceEffects() != loan {
							t.Fatal("generation refusal damaged genuine loan")
						}
					}
					return original(q, get, cut, mode, origin, projection, name, standard, ownMembers...)
				}
			}
			// Same collector entry as withOriginalSetEffectsCollector, with the
			// existing registrar checks installed before its first extraction.
			for {
				task, available := work.nextExtraction()
				if !available {
					break
				}
				if task.operation.index != 0 {
					work.extractOperation(facts, task, owner)
					continue
				}
				i := task.callable
				if callableIsInteractiveHandler(facts[i].node) {
					t.Fatal("original fixture unexpectedly needs interactive setup")
				}
				collectDirectCallableEffects(&facts[i], i, facts, prepared.symbolTargets, prepared.syntacticTargets, prepared.nodeTargets, file, owner.checker, nil, nil, prepared.importBindings, prepared.contextBindings, assetAnalysis{}, owner, &work)
				work.finishExtraction(facts, i)
			}
			sealMapInputs(facts, prepared.nodeTargets)
			_ = resolveCallableEffectsWithWork(facts, owner, &work)
			if originalQuery == nil {
				t.Fatal("ENTRY: original Set synchronous registrar loan UNREACHED")
			}
			if originalQuery.liveStagedAssignment() != nil || originalQuery.liveAssignmentSourceEffects() != nil {
				t.Fatal("revoked original query retained SOURCE loan")
			}
		})
	})
}
