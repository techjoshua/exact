package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceOriginalMutationBodyPopulation describes operations encountered by the
// original canonical BODY visitor. It supplies no input or execution authority.
// A completed ordinary walk proves population membership, never its effects.
// Refined event schedules remain unsupported until their owner supplies the
// equivalent operation-population contract.
type sourceOriginalMutationBodyPopulation struct {
	declaration *ast.Node
	generation  *projectGeneration
	operations  []sourceOriginalMutationBodyOperation
	complete    bool
}
type sourceOriginalMutationBodyOperation struct {
	node *ast.Node
	kind sourceOriginalMutationBodyOperationKind
}
type sourceOriginalMutationBodyOperationKind uint8

const (
	originalMutationBodyGet sourceOriginalMutationBodyOperationKind = iota + 1
	originalMutationBodyCall
	originalMutationBodyWrite
	originalMutationBodyUnsupported
)

func recordOriginalMutationBodyOperation(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) {
	if fact == nil || node == nil || owner == nil || owner.values == nil || owner.values.generation == nil || !ast.IsFunctionLike(fact.node) || enclosingCallableNode(node) != fact.node || !sourceStagedOccurrenceOwned(node, fact.node) {
		return
	}
	kind, recorded := originalMutationBodyKind(node)
	if !recorded {
		return
	}
	population := &fact.staged.mutationBody
	if population.declaration != fact.node || population.generation != owner.values.generation {
		*population = sourceOriginalMutationBodyPopulation{declaration: fact.node, generation: owner.values.generation}
	}
	for _, prior := range population.operations {
		if prior.node == node {
			return
		}
	}
	population.operations = append(population.operations, sourceOriginalMutationBodyOperation{node: node, kind: kind})
}

func finishOriginalMutationBodyPopulation(fact *callableFacts, owner *executableBodyOwner, refined bool) {
	if fact == nil || owner == nil || owner.values == nil || owner.values.generation == nil || !ast.IsFunctionLike(fact.node) {
		return
	}
	p := &fact.staged.mutationBody
	if p.declaration != fact.node || p.generation != owner.values.generation {
		*p = sourceOriginalMutationBodyPopulation{declaration: fact.node, generation: owner.values.generation}
	}
	p.complete = !refined && !ast.HasSyntacticModifier(fact.node, ast.ModifierFlagsAsync) && !(ast.IsFunctionExpression(fact.node) && fact.node.AsFunctionExpression().AsteriskToken != nil) && !(ast.IsFunctionDeclaration(fact.node) && fact.node.AsFunctionDeclaration().AsteriskToken != nil)
}

// descriptorGetterHasEmptyMutationSyntax bounds eligibility before the getter
// has an original BODY publication. It borrows the canonical operation classes.
func descriptorGetterHasEmptyMutationSyntax(getter *ast.Node) bool {
	empty := true
	walkNode(getter.Body(), func(node *ast.Node) bool {
		if !empty || !sourceStagedOccurrenceOwned(node, getter) {
			return false
		}
		_, recorded := originalMutationBodyKind(node)
		empty = !recorded
		return empty
	})
	return empty
}

func nativeDescriptorGetterMutationEligible(source *sourceStagedNativeGetSource, field string) bool {
	if source.installation == nil || !runtimeModuleEvaluation(source.request.consumer) || !ast.IsObjectLiteralExpression(source.descriptorGet) {
		return false
	}
	for _, member := range source.descriptorGet.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsGetAccessorDeclaration(member) && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == field {
			return descriptorGetterHasEmptyMutationSyntax(member)
		}
	}
	return false
}

func (work *callableEffectWork) descriptorFieldMutationLawDescribed(field sourceStagedOperationRequest) bool {
	request, valid := stagedEntryLawRequest(field, stagedEntryLawFieldNoMutation)
	recipe := work.operationRecipes[request.producer]
	return valid && validStagedEntryLawRecipe(recipe) && sameOperationRequest(recipe.entryLaw.request, request)
}

// currentEagerDescriptorGetterNoMutation reads the canonical operation
// population of the earlier Get's actual bound body. The separate field
// Effects requirement retains propagation and all of its other dependencies.
func (work *callableEffectWork) currentEagerDescriptorGetterNoMutation(field sourceStagedOperationRequest, receiver sourceRelativeEndpoint) bool {
	id := work.operationIDs[field.producer]
	recipe := work.operationRecipes[field.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !validNativeGetRequest(recipe, field) || !stagedLiteralStandardPrototype(recipe.nativeGet, receiver.expression) {
		return false
	}
	state := &work.operations[id.index]
	disposition := state.fieldDisposition
	if state.invalid || disposition == nil || disposition.kind != stagedFieldDispositionGetter || disposition.receiver != receiver.expression || disposition.operation != field.producer.operation || disposition.field != field.producer.selector.field || len(disposition.invoked) != 1 || len(state.getters) != 1 {
		return false
	}
	getter := state.getters[0]
	if getter.declaration.Parent != receiver.expression || getter.declaration != disposition.invoked[0].declaration || getter.demand.producer != id || !sameOperationRequest(getter.demand.request, field) || !sameOperationEndpoint(getter.demand.receiver, receiver) || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyReady || !getter.bodyTransferred {
		return false
	}
	actor, known := work.memberNodes[getter.declaration]
	consumer, owned := work.memberNodes[field.consumer]
	if !known || !owned {
		return false
	}
	dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
	body := work.operationFacts[actor].staged.mutationBody
	return dependency != nil && dependency.producer == actor && dependency.operation == field.use && dependency.cut == field.cut && !dependency.invalid && !dependency.projectionPending && body.generation == work.operationGeneration && body.declaration == getter.declaration && body.complete && len(body.operations) == 0
}

// originalMutationBodyKind classifies the same original operation for canonical
// BODY recording and SOURCE effect description; classification grants no coverage.
func originalMutationBodyKind(node *ast.Node) (sourceOriginalMutationBodyOperationKind, bool) {
	var kind sourceOriginalMutationBodyOperationKind
	switch {
	case ast.IsCallExpression(node):
		kind = originalMutationBodyCall
	case ast.IsVariableDeclarationList(node) && node.Flags&ast.NodeFlagsUsing != 0:
		kind = originalMutationBodyUnsupported
	case ast.IsPropertyAccessExpression(node), ast.IsElementAccessExpression(node):
		if node.Parent != nil && ast.IsBinaryExpression(node.Parent) && node.Parent.AsBinaryExpression().Left == node && node.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			return 0, false
		}
		kind = originalMutationBodyGet
	case ast.IsBinaryExpression(node):
		switch node.AsBinaryExpression().OperatorToken.Kind {
		case ast.KindEqualsToken:
			kind = originalMutationBodyWrite
		case ast.KindEqualsEqualsEqualsToken, ast.KindExclamationEqualsEqualsToken, ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken, ast.KindCommaToken:
			return 0, false
		default:
			kind = originalMutationBodyUnsupported
		}
	default:
		switch node.Kind {
		case ast.KindNewExpression, ast.KindTaggedTemplateExpression, ast.KindAwaitExpression, ast.KindYieldExpression, ast.KindPrefixUnaryExpression, ast.KindPostfixUnaryExpression, ast.KindDeleteExpression, ast.KindTemplateExpression, ast.KindSpreadElement, ast.KindSpreadAssignment, ast.KindForOfStatement, ast.KindForInStatement, ast.KindObjectBindingPattern, ast.KindArrayBindingPattern, ast.KindComputedPropertyName, ast.KindClassDeclaration, ast.KindClassExpression:
			kind = originalMutationBodyUnsupported
		default:
			return 0, false
		}
	}
	return kind, true
}
