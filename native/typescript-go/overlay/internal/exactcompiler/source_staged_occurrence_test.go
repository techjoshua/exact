package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This checks the real source-descent issuer before any receiver, argument or
// returned value acquisition. Module availability is not a body invocation.
func TestStagedOccurrenceMemberInputsBeforeSelection(t *testing.T) {
	source := `const table=new WeakMap<object,object>(), sibling={get dormant(){return document.title}};
function read(key:object){if(key)return table.get(key);return undefined}
export function invoke(){return read({})}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, _ *ast.Node) {
		sourceFile := ast.GetSourceFileOfNode(query.effectOwner)
		nodes := collectCallableNodes(sourceFile)
		facts := make([]callableFacts, len(nodes))
		for i, node := range nodes {
			facts[i] = callableFacts{node: node, sourceFile: sourceFile, summary: CallableSummary{ID: fmt.Sprintf("source:%d", node.Pos())}}
		}
		work := registerCallableEffectWork(facts)
		revoke := registerPendingMemberFacts(query.executable, facts)
		defer revoke()
		readIndex := -1
		var original *ast.Node
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && (ast.IsPropertyAccessExpression(node.Expression()) || ast.IsElementAccessExpression(node.Expression())) {
				_, key := accessorReceiver(node.Expression())
				if key == "get" {
					original = node
					for i := range facts {
						if facts[i].node == enclosingCallableNode(node) {
							readIndex = i
						}
					}
				}
			}
			return true
		})
		if readIndex < 0 || original == nil {
			t.Fatal("source member owner missing")
		}
		fact := &facts[readIndex]
		registerPendingMemberSource(fact, original, query.executable, &work)
		demand := fact.pendingMembers.sites[original]
		if !demand.rolesResolved || demand.receiver.kind != memberCapture || demand.receiver.source == nil || !ast.IsNewExpression(demand.receiver.source) || len(demand.arguments) != 1 || demand.arguments[0].kind != memberFormal || demand.arguments[0].position != 0 || demand.requests != 0 || demand.transferred {
			t.Fatal("source descent depended on selection or falsely acknowledged its inputs")
		}
		module := sourceStagedModuleOwner(demand.receiver.source)
		producer, found := work.memberNodes[module]
		if !found || !ast.IsVariableDeclaration(module) || module.Name().Text() != "table" {
			t.Fatal("module initializer partition was replaced by sibling or whole module")
		}
		if len(work.stagedRequired) != 1 || len(work.memberModuleRequirements[readIndex]) != 1 || len(fact.targets) != 0 {
			t.Fatal("module availability missing or became a body invocation")
		}
		requirement := work.memberModuleRequirements[readIndex][0]
		dependency := work.stagedRequired[sourceStagedDependencyKey{readIndex, requirement.edge}]
		if dependency.producer != producer || dependency.operation != original || dependency.consumed != 0 {
			t.Fatal("unpublished module was consumed or demand cut changed")
		}
		for i := range facts {
			facts[i].staged.ready = true
		}
		work.initializePropagation(facts)
		dependency = work.stagedRequired[sourceStagedDependencyKey{readIndex, requirement.edge}]
		if dependency.consumed != work.stagedRevisions[producer] || dependency.consumed == 0 || len(fact.targets) != 0 || len(fact.summary.DirectEffectSources) != 0 {
			t.Fatal("source module publication not consumed independently of execution")
		}
		deliveries := fact.staged.revisionDeliveries
		work.refreshPendingMembers(facts, readIndex)
		if fact.staged.revisionDeliveries != deliveries {
			t.Fatal("unchanged module revision was delivered again")
		}
		for _, node := range nodes {
			if ast.IsFunctionLike(node) || runtimeModuleEvaluation(node) && node != module {
				if _, issued := sourceStagedOccurrenceRequest(&callableFacts{node: node, sourceFile: sourceFile}, demand.receiver.source, relativeDemandEffects, "wrong-owner"); issued {
					t.Fatal("another function or initializer acquired source ownership")
				}
			}
		}
	})
}

// The same semantic kernels are issued at their original module, conditional,
// initializer, statement and return occurrences. This is not a second body
// profile. Unrelated eager effects and dormant body ownership remain separate.
func TestStagedOccurrenceInputEffectsAcrossContexts(t *testing.T) {
	source := `declare function foreign():void;
export const frozen=Object.freeze({callback:()=>document.title});
export function invoke(prototype:object,choose:boolean){
 if(choose){const created=Object.create(prototype);Object.freeze({created});}
 window.name;foreign();
 return Object.freeze(Object.create(prototype));
}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-occurrences.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {

		t.Fatal(response.Error, response.Diagnostics)
	}
	contexts := make(map[string]bool)
	for _, fact := range stagedDeclarationFacts(session) {
		for _, use := range fact.staged.operationUses {
			if use.request.producer.selector != (sourceStagedOperationSelector{}) || use.request.producer.kind != relativeDemandEffects {
				continue
			}
			if !sourceStagedOccurrenceOwned(use.request.producer.operation, fact.node) || fact.staged.operationsPending {
				t.Fatal("original occurrence retained pending input Effects")
			}
			if _, legacy := fact.staged.legacy[use.request.producer.operation]; legacy {
				t.Fatal("covered occurrence reentered recursive Call selection")
			}
			if runtimeModuleEvaluation(fact.node) {
				contexts["module"] = true
			} else {
				call := use.request.producer.operation
				if ast.IsVariableDeclaration(call.Parent) {
					contexts["initializer"] = true
				}
				if ast.IsExpressionStatement(call.Parent) {
					contexts["statement"] = true
				}
				if ast.IsReturnStatement(call.Parent) {
					contexts["return"] = true
				}
			}
		}
	}
	for _, context := range []string{"module", "initializer", "statement", "return"} {
		if !contexts[context] {
			t.Fatalf("source context %s never reached the same semantic owner", context)
		}
	}
	root := executableSummary(t, response, "invoke")
	known, unknown := false, false
	for _, effect := range root.EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
		if effect.Description == "document.title" {
			t.Fatal("module-stored callback became an eager invocation")
		}
	}
	if !known || !unknown {
		t.Fatal("source routing dropped unrelated known or unknown contributions")
	}
}

func TestStagedOccurrenceAvailabilityCyclesDoNotInvoke(t *testing.T) {
	facts := []callableFacts{{targets: []int{1}}, {}}
	required := map[sourceStagedDependencyKey]*sourceStagedDependency{{consumer: 1, edge: "module-availability"}: {producer: 0}}
	calls := callableCycleGroups(facts)
	publication := callableDependencyCycleGroups(facts, required)
	if calls[0] == calls[1] || publication[0] != publication[1] || len(facts[1].targets) != 0 {
		t.Fatal("publication either failed to close a source backedge or activated its producer")
	}
	required[sourceStagedDependencyKey{consumer: 1, edge: "module-availability"}].invalid = true
	invalid := callableDependencyCycleGroups(facts, required)
	if invalid[0] == invalid[1] {
		t.Fatal("invalid source dependency created a publication cycle")
	}
}

// A real unresolved source-write alternative can exceed the callee transport
// domain. Its conditional native registration must not adopt an unsatisfied
// consumer or replace the original known/unknown legacy effects with a gap.
func TestStagedOccurrenceRegistrationIsNotAdoption(t *testing.T) {
	source := pendingDescriptorPrefix + pendingDescriptorDynamicPublisher + pendingDescriptorBody
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/occurrence-adoption.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "read" {
			continue
		}
		for _, recipe := range fact.staged.operationRecipes {
			if recipe.nativeGet == nil || recipe.nativeGet.kind != sourceNativeObjectCreate || recipe.key.selector != (sourceStagedOperationSelector{}) {
				continue
			}
			found = true
			if _, legacy := fact.staged.legacy[recipe.key.operation]; !legacy || fact.staged.operationsPending {
				t.Fatal("unsupported selection lost its owning fallback or became required")
			}
			for _, use := range fact.staged.operationUses {
				if use.request.producer == recipe.key {
					t.Fatal("conditional registration was mistaken for consumer adoption")
				}
			}
		}
	}
	if !found {
		t.Fatal("original selected standard alternative was discarded")
	}
}
