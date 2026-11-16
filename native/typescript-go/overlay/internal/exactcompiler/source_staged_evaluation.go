package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedEvaluation is an original creation/key protocol contribution.
// Children retain their semantic owners. It carries no value, key identity,
// successful execution, mutation exclusion or normal-frame authority.
type sourceStagedEvaluation struct {
	node       *ast.Node
	phase      string
	primitive  bool
	generation *projectGeneration
}

func validStagedEvaluationRecipe(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource != nil && recipe.memberSource.getPreparation != nil {
		return false
	}
	s := recipe.memberSource
	if !validStagedMemberProtocolEnvelope(recipe) || s.protocolSource == nil || s.protocolSource.evaluation == nil || s.protocolSource.get != nil || s.protocolSource.external != nil || s.generation == nil || !validStagedMemberParent(s.parent) {
		return false
	}
	e := s.protocolSource.evaluation
	if e.node != s.parent.producer.operation || e.generation != s.generation || s.candidate.operation != e.node || s.candidate.region != s.parent.consumer || s.candidate.cut != s.parent.cut || recipe.key != s.request.producer || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
		return false
	}
	expected := s.parent
	if e.phase != "" {
		expected.producer.selector = sourceStagedOperationSelector{occurrence: e.node, field: "source-evaluation:" + e.phase}
		expected.edge += ":" + e.phase
	}
	if e.phase != "" {
		switch e.phase {
		case "key-coercion":
			if !ast.IsComputedPropertyName(e.node) || recipe.delta.extracted != e.primitive {
				return false
			}
		case "heritage", "decorators":
			if ast.IsComputedPropertyName(e.node) || recipe.delta.extracted || len(recipe.delta.required) != 0 {
				return false
			}
		default:
			return false
		}
	}
	if !sameOperationRequest(s.request, expected) {
		return false
	}
	if !ast.IsClassDeclaration(e.node) && !ast.IsClassExpression(e.node) && !ast.IsComputedPropertyName(e.node) && !sourceConstructionEventNode(e.node) {
		return false
	}
	for _, r := range recipe.delta.required {
		if r.producer.kind != relativeDemandEffects || r.inputs != nil || r.consumer != r.producer.declaration {
			return false
		}
	}
	return true
}

// stageSourceEvaluation is called by the original effect walker at its event.
// Local construction is composed with exact child source requests. Unsupported
// protocols remain typed pending children rather than disappearing from a list.
func (work *callableEffectWork) stageSourceEvaluation(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) bool {
	if node == nil || owner == nil || !ast.IsClassDeclaration(node) && !ast.IsClassExpression(node) && !ast.IsComputedPropertyName(node) && !sourceConstructionEventNode(node) {
		return false
	}
	request, ok := sourceStagedOccurrenceRequest(&facts[consumer], node, relativeDemandEffects, fmt.Sprintf("%s:evaluation:%d", facts[consumer].summary.ID, node.Pos()))
	if !ok {
		return false
	}
	source := &sourceStagedMemberSource{parent: request, request: request, generation: owner.values.generation, candidate: sourceStagedMemberCandidate{request: request, operation: node, origin: node, region: request.consumer, protocol: true, cut: request.cut}, protocolSource: &sourceStagedMemberProtocol{evaluation: &sourceStagedEvaluation{node: node, generation: owner.values.generation}}}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: source}
	if _, exists := work.operationRecipes[recipe.key]; !exists {
		if !work.registerOperationRecipe(facts, recipe) {
			return false
		}
	}
	work.operationGeneration = owner.values.generation
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	return true
}

func (work *callableEffectWork) stageStandardDataGet(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) bool {
	if !ast.IsPropertyAccessExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return false
	}
	request, ok := sourceStagedOccurrenceRequest(&facts[consumer], node, relativeDemandEffects, fmt.Sprintf("%s:data-get:%d", facts[consumer].summary.ID, node.Pos()))
	if !ok {
		return false
	}
	if prior, exists := work.operationRecipes[request.producer]; exists && prior.memberSource != nil && prior.memberSource.protocolSource != nil && prior.memberSource.protocolSource.get != nil {
		request = prior.memberSource.request
		if prior.memberSource.protocolSource.get.standardSymbolData && work.memberCoverageObserved[request.producer] == work.operationGeneration {
			return true
		}
	}
	q := newSourceDependencyQuery(node, owner.checker, owner, request.consumer)
	defer q.publishDependencyStatistics()
	root := owner.checker.GetSymbolAtLocation(node.Expression())
	member := owner.checker.GetSymbolAtLocation(node)
	if root == nil || !q.standardSymbolDataGet(node, node.Expression(), root, member) {
		return false
	}
	revoke, ok := work.beginStagedMemberWork(q, facts, request)
	if !ok {
		return false
	}
	defer revoke()
	q.evaluatedSourceAccessors(node, nil)
	recipe := work.operationRecipes[request.producer]
	if recipe.memberSource == nil || recipe.memberSource.protocolSource == nil || recipe.memberSource.protocolSource.get == nil || !recipe.memberSource.protocolSource.get.standardSymbolData {
		return false
	}
	return true
}

// refreshStagedEvaluations composes original source events after their producers
// are issued. No callback, acquired scope or syntax-derived execution is stored.
func (work *callableEffectWork) refreshStagedEvaluations(facts []callableFacts, owner *executableBodyOwner) bool {
	if owner == nil || work.operationGeneration != owner.values.generation {
		return false
	}
	changed := false
	for key, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || s.protocolSource == nil || s.protocolSource.evaluation == nil || s.protocolSource.evaluation.phase != "" {
			continue
		}
		e := s.protocolSource.evaluation

		// A fresh graph must receive the original source event again. The
		// current canonical event loan supplies local creation/key semantics,
		// while every original semantic child is registered below.
		current := false
		file := ast.GetSourceFileOfNode(e.node)
		if file != nil && owner.values.program.GetSourceFile(file.FileName()) == file {
			for _, event := range owner.values.summary(s.parent.consumer).normal {
				if event.node == e.node && event.phase == nil && event.operand == nil && event.fold == nil {
					current = true
					break
				}
			}
		}
		if !current {
			continue
		}
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}

		var required []sourceStagedOperationRequest
		complete := true
		add := func(node *ast.Node) {
			request, ok := work.memberProtocolSources[node]
			if !ok || request.producer == key {
				complete = false
				return
			}
			for _, r := range required {
				if sameOperationRequest(r, request) {
					return
				}
			}
			required = append(required, request)
		}
		pending := func(phase string, primitive bool, dependencies []sourceStagedOperationRequest) {
			request := s.parent
			request.producer.selector = sourceStagedOperationSelector{occurrence: e.node, field: "source-evaluation:" + phase}
			request.edge += ":" + phase
			child := *s
			p := *s.protocolSource
			v := *e
			v.phase = phase
			v.primitive = primitive
			p.evaluation = &v
			child.protocolSource = &p
			child.request = request
			childRecipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &child, delta: sourceStagedOperationDelta{required: dependencies, extracted: primitive}}
			if prior, exists := work.operationRecipes[request.producer]; !exists {
				work.registerOperationRecipe(facts, childRecipe)
			} else if prior.delta.extracted != childRecipe.delta.extracted || !operationDeltaPrefix(prior.delta, childRecipe.delta) || !operationDeltaPrefix(childRecipe.delta, prior.delta) {
				work.attachOperationSource(facts, childRecipe)
			}
			if primitive {
				work.memberCoverageObserved[request.producer] = work.operationGeneration
				if id, known := work.operationIDs[request.producer]; known {
					work.publishMemberSourceContributions(id)
				}
			}
			required = append(required, request)
		}

		if sourceConstructionEventNode(e.node) {
			// A retained descriptor is not a source event. Reissue only the
			// current canonical original event, under its live fact publisher.
			// The graph receives a fresh observation; no saved stamp is copied.
			if !work.currentConstructionSourceEvent(facts, recipe, owner) {
				continue
			}
			complete = sourceConstructionEffectsShape(e.node, s.parent.consumer, owner.values)
		} else if ast.IsComputedPropertyName(e.node) {
			expression := e.node.AsComputedPropertyName().Expression
			primitive, known := work.stagedPrimitiveKeySource(facts, expression, s.parent.consumer, owner)
			var inputs []sourceStagedOperationRequest
			if known {
				if primitive.producer.producer.operation != nil {
					inputs = append(inputs, primitive.producer)
				}
			} else {
				add(expression)
			}
			required = append(required, inputs...)
			pending("key-coercion", known, inputs)

		} else {
			// The canonical source population already separates eager names/static
			// work from deferred methods and instance initializers.
			index := owner.values.index(ast.GetSourceFileOfNode(e.node))
			operations, populated := stagedFieldPrototypeDiscovery(index)
			sort.SliceStable(operations, func(i, j int) bool { return operations[i].operation.Pos() < operations[j].operation.Pos() })
			complete = complete && populated && !index.incomplete && !index.normalDynamicScope
			for _, operation := range operations {
				if operation.operation != e.node && nodeInside(operation.operation, e.node) && operation.region == sourceStagedEvaluationOwner(e.node) {
					add(operation.operation)
				}
			}
			if sourceClassHasDecoratorApplication(e.node) {
				pending("decorators", false, nil)
			}
			var clause *ast.NodeList
			if ast.IsClassDeclaration(e.node) {
				clause = e.node.AsClassDeclaration().HeritageClauses
			} else {
				clause = e.node.AsClassExpression().HeritageClauses
			}
			if clause != nil && len(clause.Nodes) != 0 {
				pending("heritage", false, nil)
			}
		}
		delta := sourceStagedOperationDelta{required: required, extracted: complete}

		fresh := work.memberCoverageObserved[key] != work.operationGeneration
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[key] = work.operationGeneration
		if operationDeltaPrefix(delta, recipe.delta) && operationDeltaPrefix(recipe.delta, delta) && delta.extracted == recipe.delta.extracted {
			if fresh {
				if id, known := work.operationIDs[key]; known {
					work.publishMemberSourceContributions(id)
					changed = true
				}
			}
			continue
		}

		recipe.delta = delta
		if work.attachOperationSource(facts, recipe) {
			changed = true
		}
	}
	return changed
}

// currentConstructionSourceEvent authenticates the existing semantic event
// description. It does not walk the initializer or invoke any dormant body.
func (work *callableEffectWork) currentConstructionSourceEvent(facts []callableFacts, recipe sourceStagedOperationRecipe, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.program != owner.project.program || owner.values.checker != owner.checker || owner.values.generation == nil || !owner.values.generation.active || owner.project.activeGeneration != owner.values.generation || work.operationGeneration != owner.values.generation || !validStagedEvaluationRecipe(recipe) {
		return false
	}
	s := recipe.memberSource
	e := s.protocolSource.evaluation
	index, known := work.memberNodes[s.parent.consumer]
	if !known || index < 0 || index >= len(facts) || facts[index].node != s.parent.consumer || facts[index].normalInputs != nil || s.generation != owner.values.generation || e.generation != s.generation || !sourceConstructionEventNode(e.node) {
		return false
	}
	publisher := owner.pendingMemberPublishers[s.parent.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[index] {
		return false
	}
	file := ast.GetSourceFileOfNode(e.node)
	if file == nil || facts[index].sourceFile != file || owner.values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	request, owned := constructionEffectsRequest(&facts[index], e.node)
	if !owned || !sameOperationRequest(request, s.parent) || !sameOperationRequest(request, s.request) {
		return false
	}
	for _, event := range owner.values.summary(s.parent.consumer).normal {
		if event.node == e.node && event.visitOnly && event.phase == nil && event.operand == nil && event.fold == nil {
			return true
		}
	}
	return false
}
