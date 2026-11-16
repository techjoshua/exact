package exactcompiler

import (
	"fmt"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedConstructionModuleAssignmentSource = `declare function foreign():void;function latentWriter(target:Record<string,unknown>){window.name;foreign();target.WeakMap=()=>document.title}const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new WeakMap();export function invoke(){return 2}`

// The actual lexical callee owner may complete without a generic member C.
// Any C it does issue must retain the original preselection cut and children.
func TestStagedConstructionModuleCalleeAndSet(t *testing.T) {
	const source = stagedConstructionModuleAssignmentSource
	const id = "/virtual/construction-module-callee.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if hasErrorDiagnostic(response.Diagnostics) || response.Error != "" && !strings.HasPrefix(response.Error, "Compiler analysis coverage gap: required staged effect contribution") {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil || project.callableCache == nil {
			continue
		}
		var node *ast.Node
		walkNode(file.AsNode(), func(value *ast.Node) bool {
			if ast.IsNewExpression(value) {
				node = value
			}
			return true
		})
		if node == nil {
			t.Fatal("original module New absent")
		}
		facts := stagedDeclarationFacts(session)
		for consumer := range facts {
			if !runtimeModuleEvaluation(facts[consumer].node) || !sourceStagedOccurrenceOwned(node, facts[consumer].node) {
				continue
			}
			work := newCallableEffectWork(facts)
			owner := project.callableCache.owner
			diagnose := func() {
				logStagedConstructionRequiredExits(t, &work,
					sourceStagedOperationKey{declaration: facts[consumer].node, operation: node, kind: relativeDemandEffects},
					sourceStagedOperationKey{declaration: facts[consumer].node, operation: node.Parent, kind: relativeDemandEffects})
			}
			if !plainStagedAssignment(node.Parent) {
				t.Fatal("original module Set absent")
			}
			setAdopted := work.stageAssignment(facts, consumer, node.Parent, owner)
			if !work.stageConstructionEffects(facts, consumer, node, owner) {
				diagnose()
				t.Fatal("original module New failed ordinary adoption")
			}
			work.prepareOperationUses(facts, owner)
			recipe := work.operationRecipes[sourceStagedOperationKey{declaration: facts[consumer].node, operation: node, kind: relativeDemandEffects}]
			if recipe.constructionEffects == nil {
				t.Fatal("original module construction recipe missing")
			}
			root := recipe.constructionEffects.root
			if root.use != node {
				t.Fatal("original module construction source refused")
			}
			callee := work.operationRecipes[stagedConstructionRequest(root, "callee").producer]
			if !callee.delta.extracted || !work.passiveConstructionEffectsReady(callee) {
				t.Fatal("original module callee Effects lost its live source disposition")
			}
			found := false
			for _, request := range callee.delta.required {
				source := work.operationRecipes[request.producer].memberSource
				if source != nil && source.coverage != nil {
					coverage := source.coverage
					found = found || coverage.cut.operation == node && coverage.cut.reading == node && coverage.cut.initializing == node && coverage.generation == work.operationGeneration && len(coverage.required) != 0
				}
			}
			if len(callee.delta.required) != 0 && !found {
				t.Fatal("callee source omitted its original preselection C/semantic children")
			}
			closed := work.closedOperationDependencies()
			for _, phase := range append([]string{""}, stagedConstructionPhases[:]...) {
				request := stagedConstructionRequest(root, phase)
				id, issued := work.operationIDs[request.producer]
				if !issued || !closed[id.index] || !work.operationRecipes[request.producer].delta.extracted {
					diagnose()
					t.Fatal("original module construction phase did not close", phase)
				}
			}
			setKey := sourceStagedOperationKey{declaration: root.consumer, operation: node.Parent, kind: relativeDemandEffects}
			if setAdopted {
				if id, issued := work.operationIDs[setKey]; !issued || !closed[id.index] {
					diagnose()
					t.Fatal("adopted Set did not consume its required New root")
				}
			} else {
				if id, issued := work.operationIDs[setKey]; issued && closed[id.index] {
					t.Fatal("unrepresented source children closed the refused Set")
				}
				for _, use := range facts[consumer].staged.operationUses {
					if use.request.producer == setKey {
						t.Fatal("refused Set acquired ordinary adoption")
					}
				}
				query := newSourceDependencyQuery(node.Parent.AsBinaryExpression().Left, owner.checker, owner, facts[consumer].node)
				result := query.evaluatedSourceAccessors(node.Parent.AsBinaryExpression().Left, nil)
				query.publishDependencyStatistics()
				knownExternal := false
				for _, effect := range result.environmentEffects {
					knownExternal = knownExternal || effect.Environment == "unknown" && effect.Opaque && effect.Description == "original external property Set"
				}
				if !knownExternal {
					t.Fatal("ordinary fallback lost the reached external Set prefix")
				}
			}
			return
		}
		t.Fatal("original module evaluation owner absent")
	}
	t.Fatal("source project absent")
}

// Failure-only traversal of actual issued requirements. No source loans,
// extraction, local readiness overrides or operation registration occur here.
func logStagedConstructionRequiredExits(t *testing.T, work *callableEffectWork, roots ...sourceStagedOperationKey) {
	t.Helper()
	closed := work.closedOperationDependencies()
	seen := make(map[sourceStagedOperationKey]bool)
	var visit func(sourceStagedOperationRequest, string)
	visit = func(request sourceStagedOperationRequest, parent string) {
		key := request.producer
		recipe, present := work.operationRecipes[key]
		operation := "nil"
		if node := key.operation; node != nil {
			file := ast.GetSourceFileOfNode(node)
			if file != nil {
				operation = fmt.Sprintf("%s:%d:%d:%s", file.FileName(), node.Pos(), node.End(), node.Kind)
			}
		}
		id, adopted := work.operationIDs[key]
		currentClosed := adopted && id.epoch == work.operationEpoch && int(id.index) < len(closed) && closed[id.index]
		t.Logf("required parent=%q op=%s selector=%#v present=%t envelope=%t sourceRequest=%t extracted=%t adopted=%t closed=%t memberReady=%t NewReady=%t SetReady=%t stamp=%p currentGen=%p request=%#v", parent, operation, key.selector, present, validOperationEnvelope(recipe), sameAdoptionSourceRequest(recipe, request), recipe.delta.extracted, adopted, currentClosed, work.passiveMemberSourceReady(recipe), work.passiveConstructionEffectsReady(recipe), work.passiveAssignmentSourceReady(recipe), work.memberCoverageObserved[key], work.operationGeneration, request)
		if seen[key] {
			return
		}
		seen[key] = true
		children := append([]sourceStagedOperationRequest(nil), recipe.delta.required...)
		children = append(children, recipe.writerRequired...)
		if source := recipe.memberSource; source != nil {
			t.Logf("source op=%s parent=%#v generation=%p candidate=%#v extraction=%#v coverage=%#v get=%#v protocol=%#v rawValues=%d writeEffects=%t", operation, source.parent, source.generation, source.candidate, source.extraction, source.coverage, source.getEffects, source.protocolSource, len(source.values), source.writeEffects)
			if source.protocolSource != nil && source.protocolSource.get != nil {
				t.Logf("original Get op=%s source=%#v", operation, source.protocolSource.get)
			}
			if proof := source.moduleExcluded; proof != nil {
				read := "nil"
				if proof.source.read != nil {
					read = fmt.Sprintf("%s@%d", proof.source.read.Kind, proof.source.read.Pos())
				}
				t.Logf("module-excluded op=%s supported=%t accounted=%t read=%s generation=%p cut=%#v source=%#v required=%#v", operation, proof.supported, proof.accounted, read, proof.source.generation, proof.source.cut, proof.source, proof.required)
				children = append(children, proof.required...)
			}
		}
		if adopted && id.epoch == work.operationEpoch && int(id.index) < len(work.operations) {
			state := work.operations[id.index]
			t.Logf("state op=%s revision=%d extracted=%t observedMember=%t dependencies=%#v", operation, state.revision, state.delta.extracted, state.memberCoverageObserved, state.dependencies)
		}
		if len(children) == 0 {
			t.Logf("required LEAF op=%s selector=%#v closed=%t", operation, key.selector, currentClosed)
		}
		for _, child := range children {
			visit(child, fmt.Sprintf("%s/%s", operation, key.selector.field))
		}
	}
	for _, key := range roots {
		recipe := work.operationRecipes[key]
		switch {
		case recipe.constructionEffects != nil:
			visit(recipe.constructionEffects.request, "New-root")
		case recipe.assignment != nil:
			visit(recipe.assignment.request, "Set-root")
		default:
			t.Logf("missing original root key=%#v", key)
		}
	}
}

// Inspect the failed production Session's immutable facts without constructing
// another work graph, reissuing a source receipt or replaying a query/binder.
func logStagedConstructionSessionFailure(t *testing.T, session *Session) {
	t.Helper()
	facts := stagedDeclarationFacts(session)
	recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
	for _, fact := range facts {
		for _, recipe := range fact.staged.operationRecipes {
			recipes[recipe.key] = recipe
		}
	}
	seen := make(map[sourceStagedOperationKey]bool)
	var visit func(sourceStagedOperationRequest)
	visit = func(request sourceStagedOperationRequest) {
		recipe, present := recipes[request.producer]
		t.Logf("Session cached-source request=%#v present=%t envelope=%t sameRequest=%t extracted=%t residuals=%#v effects=%#v", request, present, validOperationEnvelope(recipe), sameAdoptionSourceRequest(recipe, request), recipe.delta.extracted, recipe.delta.residuals, recipe.delta.effects)
		if seen[request.producer] {
			return
		}
		seen[request.producer] = true
		if source := recipe.memberSource; source != nil {
			t.Logf("Session member source=%#v extraction=%#v coverage=%#v protocol=%#v", source, source.extraction, source.coverage, source.protocolSource)
		}
		for _, child := range recipe.delta.required {
			visit(child)
		}
	}
	for _, fact := range facts {
		if fact.summary.Name != "invoke" && !runtimeModuleEvaluation(fact.node) {
			continue
		}
		t.Logf("Session fact name=%q node=%p ready=%t settled=%t pending=%t summaries=%#v direct=%#v uses=%#v pendingSources=%#v", fact.summary.Name, fact.node, fact.staged.ready, fact.staged.settled, fact.staged.operationsPending, fact.summary.EffectSources, fact.summary.DirectEffectSources, fact.staged.operationUses, fact.staged.pending)
		for _, use := range fact.staged.operationUses {
			visit(use.request)
		}
	}
}
