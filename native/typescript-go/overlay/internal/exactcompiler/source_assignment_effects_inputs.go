package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// sourceAssignmentEffectsInput is an original Set supplier's conditional SOURCE
// substitution for a nested authored write. It is part of the existing
// assignment recipe, not an activation, normal input, receiver value or binder.
// The parent must renew its actual graph-owned source coverage before use.
type sourceAssignmentEffectsInput struct {
	parent sourceStagedOperationRequest
	access sourceQualifiedReadWrite
}

func sameAssignmentEffectsInput(a, b sourceAssignmentEffectsInput) bool {
	return sameOperationRequest(a.parent, b.parent) && sameQualifiedReadWrite(a.access, b.access)
}

func stagedAssignmentTarget(operation *ast.Node) *ast.Node {
	return planMutationOperation(operation).target
}

func stagedAssignmentOperation(operation *ast.Node) bool {
	plan := planMutationOperation(operation)
	return (plan.kind == mutationAssign || plan.kind == mutationPrefix || plan.kind == mutationPostfix) && plan.target != nil && (ast.IsPropertyAccessExpression(plan.target) || ast.IsElementAccessExpression(plan.target))
}

func checkedNumericUpdate(operation *ast.Node, owner *executableBodyOwner) bool {
	if owner == nil || owner.checker == nil || !stagedAssignmentOperation(operation) {
		return false
	}
	plan := planMutationOperation(operation)
	return (plan.kind == mutationPrefix || plan.kind == mutationPostfix) && owner.checker.GetTypeAtLocation(plan.target).Flags()&checker.TypeFlagsNumberLike != 0
}

var stagedUpdatePhases = [...]string{"receiver", "key-input", "key-coercion", "get", "numeric", "set"}

func stagedAssignmentPhasesFor(root sourceStagedOperationRequest) []string {
	if plainStagedAssignment(root.use) {
		return stagedAssignmentPhases[:]
	}
	return stagedUpdatePhases[:]
}

func validAssignmentEffectsInput(source *sourceStagedAssignment) bool {
	in := source.sourceInput
	if in.parent.use == nil {
		return true
	}
	a := in.access
	return plainStagedAssignment(in.parent.use) && validStagedMemberParent(in.parent) && source.root.consumer == a.declaration && source.root.use == a.operation && stagedAssignmentTarget(source.root.use) == a.reference && a.write && a.owner == in.parent.consumer && a.binding != nil && enclosingCallableNode(a.binding) == a.owner && a.generation == source.generation && a.cut == (sourceRelativeCut{operation: in.parent.use, reading: a.reference})
}

// assignmentEffectsInputCurrent accepts the original publisher's SOURCE
// population, not a cloned inventory or selected event. Required SOURCE children
// still close independently; the parent's BODY can remain pending.
func (work *callableEffectWork) assignmentEffectsInputCurrent(in sourceAssignmentEffectsInput) bool {
	if in.parent.use == nil || work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration || in.access.generation != work.operationGeneration {
		return false
	}
	observation := work.assignmentObserved[in.parent.producer]
	if observation == nil || !observation.local || observation.effects == nil || observation.effects.work != work || observation.effects.generation != work.operationGeneration || observation.disposition == nil || observation.effects.issuer != observation.disposition.issuer || observation.effects.issuer == nil || observation.effects.issuer.observation != observation || !sameOperationRequest(observation.effects.root, in.parent) || !sameOperationRequest(observation.disposition.root, in.parent) || observation.effects.issuer.operation != in.parent.use || observation.effects.issuer.get != stagedAssignmentTarget(in.parent.use) {
		return false
	}
	for _, supplier := range observation.effects.suppliers {
		for _, original := range supplier.accesses {
			// The description precedes appending its own ticket. The actual parent
			// payload reducer consumes that ticket; source identity must already match.
			left, right := original, in.access
			left.required, right.required = nil, nil
			if sameQualifiedReadWrite(left, right) && validSetReadWriteSubstitution(&supplier, original, in.parent) {
				return true
			}
		}
	}
	return false
}

func (work *callableEffectWork) assignmentEffectsInputRoot(in sourceAssignmentEffectsInput, owner *executableBodyOwner) *ast.Node {
	if !work.assignmentEffectsInputCurrent(in) || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || in.access.binding == nil || !ast.IsVariableDeclaration(in.access.binding) {
		return nil
	}
	binding := in.access.binding
	file := ast.GetSourceFileOfNode(binding)
	if file == nil || owner.values.program.GetSourceFile(file.FileName()) != file || binding.Initializer() == nil || !ast.IsObjectLiteralExpression(binding.Initializer()) || !sourceInertValueCreation(binding.Initializer()) {
		return nil
	}
	return binding.Initializer()
}

// registerSourceWriteEffects connects a canonical BODY write to its original
// Set SOURCE supplier. The existing assignment owner may perform its normal
// SOURCE observation; registration creates no input frame or execution grant.
func (work *callableEffectWork) registerSourceWriteEffects(facts []callableFacts, consumer int, operation *ast.Node, owner *executableBodyOwner, parent sourceStagedOperationRequest, access sourceQualifiedReadWrite) (sourceStagedOperationRequest, bool) {
	input := sourceAssignmentEffectsInput{parent: parent, access: cloneQualifiedReadWrites([]sourceQualifiedReadWrite{access})[0]}
	return work.registerStagedAssignmentEffects(facts, consumer, operation, owner, input)
}

// The original parent owns these declaration-relative read SOURCE requests.
// A nested receiver phase retains them without treating a local as a caller
// formal or admitting normal DATA from its initializer.
func assignmentInputReadRequirement(source *sourceStagedAssignment, request sourceStagedOperationRequest) bool {
	if source.sourceInput.parent.use == nil {
		return false
	}
	parent := sourceStagedAssignment{root: source.sourceInput.parent, phase: "set"}
	return assignmentSourceReadRequirement(&parent, request)
}

// operationRecipeEffectRequirements consumes the assignment SOURCE input on its
// original aggregate owner, without changing an already sealed evaluation-phase
// prefix. This is the same dependency consumer used by admission and delivery.
func operationRecipeEffectRequirements(recipe sourceStagedOperationRecipe) []sourceStagedOperationRequest {
	required := operationEffectRequirements(recipe.delta)
	source := recipe.assignment
	if source == nil || source.phase != "" || source.sourceInput.parent.use == nil {
		return required
	}
	out := append([]sourceStagedOperationRequest(nil), required...)
	for _, request := range source.sourceInput.access.required {
		out = appendEntryLawRequirement(out, request)
	}
	return out
}

// qualifiedAssignmentRequest scopes only conditional SOURCE Effects to the
// original Set use. The generic BODY operation keeps its independent debt.
func qualifiedAssignmentRequest(root, parent sourceStagedOperationRequest) sourceStagedOperationRequest {
	root.producer.selector = sourceStagedOperationSelector{occurrence: stagedAssignmentTarget(root.use), association: parent.use, field: "assignment-source-effects"}
	root.edge += ":source:" + parent.edge
	return root
}

func validAssignmentRoot(source *sourceStagedAssignment) bool {
	if source.sourceInput.parent.use == nil {
		return validStagedMemberParent(source.root)
	}
	root := source.root
	root.producer.selector = sourceStagedOperationSelector{}
	root.edge = strings.TrimSuffix(root.edge, ":source:"+source.sourceInput.parent.edge)
	return validStagedMemberParent(root) && sameOperationRequest(source.root, qualifiedAssignmentRequest(root, source.sourceInput.parent))
}

func assignmentSourceMemberParent(parent sourceStagedOperationRequest) bool {
	s := parent.producer.selector
	return s.field == "assignment-source-member" && s.occurrence != nil && stagedAssignmentOperation(s.occurrence) && stagedAssignmentTarget(s.occurrence) == parent.use && s.association != nil && plainStagedAssignment(s.association) && enclosingCallableNode(s.occurrence) == parent.consumer
}

func (work *callableEffectWork) assignmentUnaryInput(facts []callableFacts, consumer int, operation *ast.Node, owner *executableBodyOwner, parent sourceStagedOperationRequest) (sourceStagedOperationRequest, bool) {
	source := work.operationRecipes[parent.producer].assignment
	if source == nil || source.sourceInput.parent.use == nil {
		return work.registerStagedAssignmentEffects(facts, consumer, operation, owner)
	}
	key := sourceStagedOperationKey{declaration: facts[consumer].node, operation: operation, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: stagedAssignmentTarget(operation), association: source.sourceInput.parent.use, field: "assignment-source-effects"}}
	child := work.operationRecipes[key].assignment
	returnRequest := sourceStagedOperationRequest{}
	if child == nil {
		return returnRequest, false
	}
	return child.root, validStagedAssignmentRecipe(work.operationRecipes[key])
}
