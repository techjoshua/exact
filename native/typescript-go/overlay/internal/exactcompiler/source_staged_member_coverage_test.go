package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original source owner emits a finite set, including later writes from a
// possible previous activation and exposed passive open-operation relationships. Local
// extraction neither activates those bodies nor settles their semantic children.
func TestStagedMemberCoverageOriginalFunctionSources(t *testing.T) {
	const source = `declare function foreign():void;const box={run:()=>1};function factory(){return box}export function passive(){foreign()}function reference(){return factory()}export function invoke(){const before=box.run();box.run=()=>2;return before}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, factory *ast.Node) {
		file := ast.GetSourceFileOfNode(factory)
		var read, later, foreign *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "run" {
				read = node
			}
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "foreign" {
				foreign = node
			}
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				later = node
			}
			return true
		})
		if read == nil || later == nil || foreign == nil {
			t.Fatal("original source occurrences")
		}
		facts := stagedReturnSourceFacts(file)
		work := callableEffectWork{extracting: -1}
		work.indexOperationSources(facts)
		caller := work.memberNodes[enclosingCallableNode(read)]
		request, owned := sourceStagedOccurrenceRequest(&facts[caller], read, relativeDemandEffects, "function-member-sources")
		if !owned {
			t.Fatal("original member request")
		}
		q := newSourceDependencyQuery(read, owner.checker, owner, facts[caller].node)
		revoke, installed := work.beginStagedMemberWork(q, facts, request)
		if !installed {
			t.Fatal("original member loan")
		}
		q.receiverCandidates(read, nil)
		revoke()
		if work.publishStagedMemberCoverage(facts, q) {
			t.Fatal("revoked scope retained source authority")
		}
		prior, protocol := false, false
		var coverage *sourceStagedMemberCoverage
		for _, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source == nil {
				continue
			}
			prior = prior || source.candidate.operation == later && source.candidate.prior
			protocol = protocol || source.candidate.operation == foreign && source.candidate.protocol && source.candidate.region == enclosingCallableNode(foreign)
			if source.coverage != nil && source.coverage.extracted {
				coverage = source.coverage
			}
		}
		if !prior || !protocol || coverage == nil || len(coverage.required) == 0 {
			t.Fatal("finite source set dropped prior/open-operation relationships", prior, protocol, coverage)
		}
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: coverage.request}) {
			t.Fatal("actual Effects subscriber refused finite source set")
		}
		work.prepareOperationUses(facts, owner)
		id := work.operationIDs[coverage.request.producer]
		state := work.operations[id.index]
		if state.revision == 0 || !state.delta.extracted || !state.memberCoverageObserved || len(state.dependencies) != len(coverage.required) || work.closedOperationDependencies()[id.index] {
			t.Fatal("local source extraction paid a pending semantic child")
		}
		for _, fact := range facts {
			if len(fact.summary.DirectEffectSources) != 0 || len(fact.summary.Calls) != 0 {
				t.Fatal("passive source relationship executed a declaration")
			}
		}
		cloned := append([]callableFacts(nil), facts...)
		for i := range cloned {
			cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
		}
		next := callableEffectWork{extracting: -1, operationGeneration: owner.values.generation}
		next.indexOperationSources(cloned)
		if !next.registerOperationUse(cloned, sourceStagedOperationUse{request: coverage.request}) {
			t.Fatal("clone lost descriptive source relation")
		}
		next.prepareOperationUses(cloned, owner)
		fresh := next.operationIDs[coverage.request.producer]
		if next.operations[fresh.index].memberCoverageObserved || next.closedOperationDependencies()[fresh.index] {
			t.Fatal("clone inherited original Get observation")
		}
	})
}

// A locally sealed Call header is insufficient when its retained source body
// has no canonical producer in this graph. This supplied-state control tests
// closure only, not original Get admission or body execution authority.
func TestStagedMemberCallMissingBodyCannotClose(t *testing.T) {
	withStagedReturnProgram(t, `function factory(){return ()=>1}export function invoke(){return factory()}`, func(owner *executableBodyOwner, creating *ast.Node) {
		factory := owner.checker.GetSymbolAtLocation(creating.Expression()).ValueDeclaration
		var body *ast.Node
		walkNode(factory, func(node *ast.Node) bool {
			if ast.IsArrowFunction(node) {
				body = node
			}
			return true
		})
		if body == nil {
			t.Fatal("original returned callable")
		}
		key := sourceStagedOperationKey{declaration: factory, operation: factory, kind: relativeDemandEffects}
		call := &sourceStagedMemberCall{complete: true, values: []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{expression: body}}}}
		work := callableEffectWork{
			operationGeneration: owner.values.generation,
			memberNodes:         map[*ast.Node]int{factory: 0},
			operationRecipes:    map[sourceStagedOperationKey]sourceStagedOperationRecipe{key: {key: key, memberSource: &sourceStagedMemberSource{generation: owner.values.generation, call: call, request: sourceStagedOperationRequest{consumer: factory}}}},
			operations:          []sourceStagedOperationState{{}, {key: key, revision: 1, delta: sourceStagedOperationDelta{extracted: true}, dependenciesRegistered: true, memberCoverageObserved: true}},
		}
		if work.closedOperationDependencies()[1] {
			t.Fatal("retained unavailable body disappeared from Call closure")
		}
		call.values = nil // A native-only Call has no authored body requirement.
		if !work.closedOperationDependencies()[1] {
			t.Fatal("empty authored-body population invented a body dependency")
		}
	})
}

// The ordinary collector drains the original queue without preparing the same
// Get again. Empty finite coverage needs a revision just like a known prefix.
func TestStagedMemberCoverageEmptyObservedDelivery(t *testing.T) {
	withHasInstanceSource(t, `export function invoke(){return (null as unknown as object) instanceof WeakMap}`, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageHasInstance(facts, consumer, operation, q.executable) {
			t.Fatal("original operator registration")
		}
		for work.extractionHead < len(work.extractionQueue) {
			task := work.extractionQueue[work.extractionHead]
			work.extractionHead++
			work.extractOperation(facts, task, q.executable)
		}
		found := false
		for i := 1; i < len(work.operations); i++ {
			state := &work.operations[i]
			recipe := work.operationRecipes[state.key]
			if recipe.memberSource != nil && recipe.memberSource.coverage != nil {
				found = true
				if len(recipe.delta.required) != 0 || !state.memberCoverageObserved || state.revision == 0 || !state.delta.extracted || !work.closedOperationDependencies()[i] {
					t.Fatal("observed empty source disposition was not delivered")
				}
			}
		}
		if !found {
			t.Fatal("original finite source owner not observed")
		}
		clone := make([]callableFacts, len(facts))
		for i := range facts {
			clone[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := newCallableEffectWork(clone)
		fresh.operationGeneration = q.owner.generation
		fresh.indexOperationSources(clone)
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource != nil && recipe.memberSource.coverage != nil {
				id, ok := fresh.requireOperation(clone, recipe.memberSource.request)
				if !ok {
					t.Fatal("cached descriptive source refused")
				}
				fresh.extractOperation(clone, callableExtractionTask{operation: id}, q.executable)
				if fresh.operations[id.index].revision != 0 || fresh.closedOperationDependencies()[id.index] {
					t.Fatal("cached empty source acquired a live receipt")
				}
			}
		}
	})
}
