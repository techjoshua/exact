package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceInstalledCallBody is borrowed only around invokeAcquired's real selected
// body callback. Each alternative keeps its own real binder and descriptions.
// It is not retained by the Call observer recipe or a prepared cache.
type sourceInstalledCallBody struct {
	issuer     *sourceValueQuery
	call, body *ast.Node
	inputs     *sourceValueInputs
	source     *sourceInstalledMemberInputDescription
	live       bool
}

// sourceInstalledCallPhase is an original SOURCE observation request, not a
// Call Effects/body execution receipt. It asks the existing dispatcher to renew
// one actual member demand under a fresh real selected binder.
type sourceInstalledCallPhase struct {
	request     sourceStagedOperationRequest
	member      sourceStagedOperationRequest
	application sourceInstalledMemberApplication
	input       *sourceInstalledMemberInputDescription
	body, call  *ast.Node
	generation  *projectGeneration
}

func (q *sourceValueQuery) beginInstalledCallBody(body, call *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) func() {
	if q == nil || q.installedMemberIssuer != q || !q.dependenciesOnly || q.operation != nil || inputs == nil || inputs.declaration != body || inputs.invocation != call || inputs.installedMemberDescription == nil || result == nil || !q.installedMemberSourceOwned(body, call, q.effectOwner) {
		return func() {}
	}
	description := cloneInstalledMemberInputDescription(inputs.installedMemberDescription)
	description.selection = nil
	for _, selected := range result.installedCallSelections {
		if selected.call == call && selected.generation == q.owner.generation && validInstalledCallSelectionSource(&selected) {
			description.selection = append(description.selection, *cloneInstalledCallSelectionSource(&selected))
		}
	}
	if inputs.constructionCapture != nil && inputs.constructionCapture.source != nil && inputs.constructionCapture.source.callable == body && inputs.constructionCapture.source.generation == q.owner.generation {
		description.callable = cloneConstructionCallableSource(inputs.constructionCapture.source)
	}
	if len(description.selection) == 0 && description.callable == nil {
		return func() {}
	}
	inputs.installedMemberDescription = description
	previous := q.installedCallBody
	event := &sourceInstalledCallBody{issuer: q, call: call, body: body, inputs: inputs, source: description, live: true}
	q.installedCallBody = event
	return func() {
		if !event.live {
			return
		}
		event.live = false
		if q.installedCallBody == event {
			q.installedCallBody = previous
		}
		event.issuer, event.inputs, event.source = nil, nil, nil
	}
}

func installedCallPhaseRequest(application sourceInstalledMemberApplication, body, call *ast.Node) sourceStagedOperationRequest {
	consumer := application.request.consumer
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: consumer, operation: call, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: application.request.producer.operation, association: application.request.producer.selector.occurrence, field: fmt.Sprintf("installed-source-call:%d:%s", application.phase, application.key)}}, consumer: consumer, use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}, reading: application.request.producer, edge: fmt.Sprintf("installed-source-call:%p:%p:%d:%s", body, application.request.producer.operation, application.phase, application.key)}
}

func validInstalledCallPhase(recipe sourceStagedOperationRecipe) bool {
	source := recipe.installedCall
	if source == nil || source.generation == nil || source.input == nil || source.input.generation != source.generation || source.input.binding == nil || !source.input.binding.delivered || source.body == nil || !ast.IsFunctionLike(source.body) || source.body.Body() == nil || source.call == nil || !ast.IsCallExpression(source.call) || source.input.binding.request.declaration != source.body || source.input.binding.request.operation != source.call || !source.input.binding.request.actualsKnown || source.application.generation != source.generation || !validInstalledMemberApplication(&source.application) || !sameInstalledMemberRequest(source.member, source.application.request) || !sameOperationRequest(source.request, installedCallPhaseRequest(source.application, source.body, source.call)) || recipe.key != source.request.producer || enclosingCallableNode(source.application.request.producer.operation) != source.body || !sourceStagedOccurrenceOwned(source.call, source.request.consumer) {
		return false
	}
	// This domain deliberately preserves the original top SOURCE Call cut. Richer
	// parent return/initializer contexts need their own original dispatcher.
	expected := sourceRelativeCut{operation: source.call, reading: source.call}
	if !ast.IsFunctionLike(source.request.consumer) {
		expected.use = source.call
	}
	if source.input.binding.request.cut != expected || len(source.input.selection) == 0 && !installedCallConstructionSourceOwned(source) {
		return false
	}
	if recipe.descriptorTarget != nil || recipe.installedMember != nil || recipe.frameworkEffects != nil || recipe.descriptorSource != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.declarationCallGeneration != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.nativeGet != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards)+len(recipe.writerRequired) != 0 || len(recipe.delta.effects)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	var required []sourceStagedOperationRequest
	for _, selection := range source.input.selection {
		if selection.call != source.call || selection.generation != source.generation || !validInstalledCallSelectionSource(&selection) {
			return false
		}
		for _, request := range selection.coverage {
			required = appendEntryLawRequirement(required, request)
		}
	}
	for _, request := range source.input.required {
		required = appendEntryLawRequirement(required, request)
	}
	return sameInstalledMemberRequirements(required, recipe.delta.required)
}

func cloneInstalledCallPhase(source *sourceInstalledCallPhase) *sourceInstalledCallPhase {
	if source == nil {
		return nil
	}
	copy := *source
	copy.application = *cloneInstalledMemberApplication(&source.application)
	copy.input = cloneInstalledMemberInputDescription(source.input)
	return &copy
}
func sameInstalledCallPhase(a, b *sourceInstalledCallPhase) bool {
	return a == nil && b == nil || a != nil && b != nil && a.body == b.body && a.call == b.call && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.member, b.member) && sameInstalledMemberApplication(&a.application, &b.application) && sameInstalledMemberInputDescription(a.input, b.input)
}

func (work *callableEffectWork) registerInstalledCallPhase(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent) bool {
	alternative := q.installedCallBody
	input := q.installedMemberInput
	if alternative == nil || !alternative.live || alternative.issuer != q || alternative.inputs != q.inputs || input == nil || input.inputs != alternative.inputs || input.source == nil || !q.installedMemberInputOwned(input) || alternative.call != input.source.binding.request.operation || alternative.body != q.inputs.declaration || event.application.nativeGet.producer.operation != nil {
		return false
	}
	source := &sourceInstalledCallPhase{member: event.application.request, application: *cloneInstalledMemberApplication(&event.application), input: cloneInstalledMemberInputDescription(input.source), body: alternative.body, call: alternative.call, generation: q.owner.generation}
	source.request = installedCallPhaseRequest(source.application, source.body, source.call)
	recipe := sourceStagedOperationRecipe{key: source.request.producer, installedCall: source}
	for _, selection := range source.input.selection {
		for _, request := range selection.coverage {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, request)
		}
	}
	for _, request := range source.input.required {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, request)
	}
	if !validInstalledCallPhase(recipe) {
		return false
	}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !validInstalledCallPhase(prior) || !sameInstalledCallPhase(prior.installedCall, source) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: source.request})
}

// A typed callable's original DATA/capture source can own the callee domain
// when no property Get exists (for example a captured source arrow). It is
// supplied by the actual acquired scope and enriched only after the original
// binder activation, never inferred from the Call's spelling or body syntax.
func installedCallConstructionSourceOwned(source *sourceInstalledCallPhase) bool {
	if source == nil || source.input == nil || source.input.callable == nil {
		return false
	}
	callable := source.input.callable
	return callable.callable == source.body && callable.generation == source.generation && callable.parent.producer.operation != nil && operationContainsRequest(source.input.required, callable.parent)
}
