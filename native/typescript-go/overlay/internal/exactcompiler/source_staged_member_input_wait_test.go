package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This preserves the conditional map/upstream-result receiver and the genuine
// native/reflective writer-source demand group from the original workload. Only
// the unrelated nested authored factory input is replaced by literal actuals.
// The original collector supplies every request, observation and queued task.
// This is an input-ownership contract control, not a claim that every unrelated
// operation in the cache workload is settled or that its artifacts execute.
func TestStagedMemberInputOwnerOriginalSource(t *testing.T) {
	const id = "/virtual/member-input-owner-causal.ts"
	const source = `const identity=Symbol.for('@test/identity');
const inputGeneration=Symbol.for('@test/input-generation');
const metadata=Symbol.for('@test/metadata');
const empty=Object.freeze(Object.defineProperties({},{[identity]:{value:true},[inputGeneration]:{value:1}}));
const domainOperationPrototypes=new WeakMap<object,WeakMap<object,object>>();
function domainOperationPrototype(prototype:object,domain:object):object{
 let domains=domainOperationPrototypes.get(prototype);
 if(!domains)domainOperationPrototypes.set(prototype,(domains=new WeakMap<object,object>()));
 let owned=domains.get(domain);
 if(!owned){
  const descriptors:object=Object.create(prototype);
  owned=Object.freeze(Object.defineProperty(descriptors,metadata,{value:Object.freeze({domain})}));
  domains.set(domain,owned);
 }
 return owned;
}
export function invoke(){return domainOperationPrototype({},{});}`
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}
	sources := map[string]string{id: source}
	imports := []string(nil)
	type observed struct {
		use         *ast.Node
		requirement sourceStagedInputConsumerRequirement
		pending     bool
	}
	observations := make(map[string]observed)
	var releasedWork *callableEffectWork
	var releasedOwner *executableBodyOwner
	var releasedFact *callableFacts
	var releasedUse *ast.Node
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
				t.Fatal("original work registrar missing")
			}
			original := publisher.workRegistrar.writerScopeSource
			publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if r == nil || r.call == nil || ast.GetSourceFileOfNode(r.call) == nil || ast.GetSourceFileOfNode(r.call).FileName() != id || !ast.IsPropertyAccessExpression(r.call.Expression()) {
					return
				}
				receiver := r.call.Expression().Expression()
				if !ast.IsIdentifier(receiver) || receiver.Text() != "domains" {
					return
				}
				method := r.call.Expression().Name().Text()
				if method != "get" && method != "set" {
					return
				}
				caller, known := work.memberNodes[enclosingCallableNode(r.call)]
				args := restrictedInvocationArguments(r.call.AsCallExpression())
				if !known || len(args) == 0 || !ast.IsIdentifier(args[0]) {
					t.Fatal("actual original formal argument missing")
				}
				requirement, current, owned := work.memberInputConsumer(&facts[caller], args[0], owner)
				if owned {
					prior := observations[method]
					observations[method] = observed{args[0], requirement, prior.pending || !current}
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, position := range []string{"get", "set"} {
			observation, reached := observations[position]
			if !reached || !observation.pending {
				t.Fatalf("original%s pending input ownership UNREACHED", position)
			}
			caller := work.memberNodes[observation.requirement.owner]
			requirement, current, owned := work.memberInputConsumer(&facts[caller], observation.use, owner)
			if !owned || !current || requirement != observation.requirement {
				t.Fatalf("original%s fresh standard/formal local ownership UNREACHED", position)
			}
			recipe := work.operationRecipes[requirement.phase.producer]
			id := work.operationIDs[requirement.phase.producer]
			for _, branch := range recipe.memberSource.call.standard {
				for _, debt := range standardMemberCallRequirements(&branch) {
					if !work.memberInputChildRetained(id, debt) {
						t.Fatal("local ownership erased original source/eager/C/own-writer debt")
					}
				}
			}
			// These detached copies cannot become an original fact or a different
			// formal/argument/request merely because the positive owner was delivered.
			copy := facts[caller]
			if _, _, owned := work.memberInputConsumer(&copy, observation.use, owner); owned {
				t.Fatal("copied fact accepted")
			}
			for _, change := range []func(*sourceStagedInputConsumerRequirement){
				func(r *sourceStagedInputConsumerRequirement) { r.phase.cut.initializing = r.use },
				func(r *sourceStagedInputConsumerRequirement) { r.phase.consumer = nil },
				func(r *sourceStagedInputConsumerRequirement) { r.phase.edge += "foreign" },
				func(r *sourceStagedInputConsumerRequirement) { r.argument++ },
				func(r *sourceStagedInputConsumerRequirement) { r.formal.slot++ },
				func(r *sourceStagedInputConsumerRequirement) { r.owner = nil },
				func(r *sourceStagedInputConsumerRequirement) { r.generation = nil },
				func(r *sourceStagedInputConsumerRequirement) { r.epoch = nil },
			} {
				wrong := requirement
				change(&wrong)
				if work.memberInputRequirementCurrent(wrong, owner) {
					t.Fatal("foreign original input association accepted")
				}
			}
			if _, _, owned := work.memberInputConsumer(&facts[caller], observation.use.Parent, owner); owned {
				t.Fatal("nonargument formal occurrence accepted")
			}
			releasedWork, releasedOwner, releasedFact, releasedUse = work, owner, &facts[caller], observation.use
		}
		// Pending is not normal B; a genuine source substitution remains the owning
		// relation even after this local method law is available.
		associations := 0
		for _, fact := range facts {
			for _, call := range fact.staged.calls {
				if call.invocation.declaration == observations["get"].requirement.owner && enclosingCallableNode(call.invocation.operation) != nil && callableNameText(enclosingCallableNode(call.invocation.operation).Name()) == "invoke" {
					if call.legacyInputs || call.inputs != nil || call.sourceInputs == nil || call.inputConsumerWait != nil {
						t.Fatal("local completion did not retire wait while preserving source-only inputs")
					}
					associations++
				}
			}
		}
		if associations == 0 {
			t.Fatal("original canonical sourceInputs association UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
	if releasedWork == nil {
		t.Fatal("original lifetime positive missing")
	}
	if _, _, owned := releasedWork.memberInputConsumer(releasedFact, releasedUse, releasedOwner); owned {
		t.Fatal("revoked publisher admitted input ownership")
	}
}
