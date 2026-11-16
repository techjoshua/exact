package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedFieldEffectsDemand is issued by this graph for a registered native
// Has/Get role. The receiver is a source-construction relationship, never an
// acquired value or normal input. IDs and consumption expire with this graph.
type sourceStagedFieldEffectsDemand struct {
	producer        sourceStagedOperationID
	request         sourceStagedOperationRequest
	receiver        sourceRelativeEndpoint
	receiverPending bool // DATA prefix does not account for unrepresented receiver alternatives.
}

// sourceStagedGetterRequirement requests declaration facts before value/member
// selection or receiver substitution completes. It does not issue an invocation
// edge or activate a stored callback. Required summary membership and pending
// receiver disposition stay separate. No query or creating frame is retained.
type sourceStagedGetterRequirement struct {
	demand           sourceStagedFieldEffectsDemand
	declaration      *ast.Node
	edge             string
	bodyReady        bool
	receiverPending  bool
	selectionPending bool
	bodyTransferred  bool
	inputs           *sourceRelativeInputEdge     // detached original Get binder publication
	installed        *sourceStagedInstalledGetter // graph-local conditional installation guards
}

func (work *callableEffectWork) issueFieldEffectsDemand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) (sourceStagedFieldEffectsDemand, bool) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || owner == nil || owner.values == nil || owner.values.checker != owner.checker || owner.values.program == nil {
		return sourceStagedFieldEffectsDemand{}, false
	}
	state := &work.operations[id.index]
	recipe, found := work.operationRecipes[state.key]
	source := recipe.nativeGet
	if !found || source == nil || source.descriptorGet == nil || !(reflectiveNative(source.kind) || source.kind == sourceNativeObjectDefineProperties && source.descriptorEntry != nil) || state.key.kind != relativeDemandEffects || state.key.selector.occurrence != source.descriptorGet || stagedDescriptorFieldIndex(state.key.selector.field) < 0 || !validNativeGetRecipe(recipe) {
		return sourceStagedFieldEffectsDemand{}, false
	}
	producer, found := work.memberNodes[state.key.declaration]
	if !found || owner.values.program.GetSourceFile(facts[producer].sourceFile.FileName()) != facts[producer].sourceFile || ast.GetSourceFileOfNode(source.descriptorGet) != facts[producer].sourceFile {
		return sourceStagedFieldEffectsDemand{}, false
	}
	request := source.request
	request.producer = state.key
	if source.descriptorEntry != nil {
		entry := source.descriptorEntry
		if entry.read == nil || entry.read.getter != nil || entry.read.accounting != sourceEffectsAccounted {
			return sourceStagedFieldEffectsDemand{}, false
		}
		request = stagedMapEntryFieldRequest(entry, state.key.selector.field)
	}
	if !validNativeGetRequest(recipe, request) {
		return sourceStagedFieldEffectsDemand{}, false
	}
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.descriptorGet, producer: state.key.operation, get: source.descriptorGet, cut: request.cut}
	if source.descriptorEntry != nil {
		receiver = cloneSourceRelativeEndpoint(source.descriptorEntry.read.descriptor)
	}
	// An uninstalled definition formal stays relative. Its type/default does
	// not brand a descriptor or substitute an application's current value.
	if ast.IsIdentifier(source.descriptorGet) {
		symbol := owner.checker.GetSymbolAtLocation(source.descriptorGet)
		if symbol != nil && symbol.ValueDeclaration != nil && symbol.ValueDeclaration.Kind == ast.KindParameter && enclosingCallableNode(symbol.ValueDeclaration) == state.key.declaration {
			slot := 0
			for _, parameter := range state.key.declaration.Parameters() {
				if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
					continue
				}
				if parameter == symbol.ValueDeclaration {
					receiver.kind = relativeEndpointRole
					receiver.role = sourceRelativeRole{kind: relativeRoleFormal, declaration: state.key.declaration, slot: slot}
					receiver.expression = nil
					break
				}
				slot++
			}
		}
	}
	demand := sourceStagedFieldEffectsDemand{producer: id, request: request, receiver: receiver}
	if source.descriptorEntry == nil && ast.IsIdentifier(source.descriptorGet) && receiver.kind == relativeEndpointExpression {
		reading, registered := work.prepareStagedDescriptorReceiver(facts, request, source.descriptorGet, owner)
		if registered {
			if delivery, available := work.stagedDescriptorReceiverData(facts, request, reading); available {
				for _, alternative := range delivery.delta.exposures {
					endpoint := alternative.endpoint
					if endpoint.kind == relativeEndpointExpression && ast.IsObjectLiteralExpression(endpoint.expression) && len(endpoint.projection) == 0 && alternative.creating == nil {
						demand.receiver = cloneSourceRelativeEndpoint(endpoint)
						demand.receiverPending = !delivery.delta.extracted || len(delivery.delta.exposures) != 1 || len(delivery.delta.residuals) != 0
						break
					}
				}
			}
		}
	}
	return demand, true
}

// prepareFieldGetterRequirements consumes source declaration relationships only.
// The ordinary fixed point already owns and queues these canonical summaries.
// There is no recursive callee preparation, value projection or body executor.
// This does not settle Has/Get, own writers, receiver/capture transport or absence.
func (work *callableEffectWork) prepareFieldGetterRequirements(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	demand, ok := work.issueFieldEffectsDemand(facts, id, owner)
	if !ok || work.operations[id.index].getterRequirementsRegistered {
		return
	}
	work.operations[id.index].effectsDemand = &demand
	if demand.receiver.kind != relativeEndpointExpression || demand.receiver.expression == nil || !ast.IsObjectLiteralExpression(demand.receiver.expression) {
		return
	}
	// This seals source-constructor declarations only. It is not a cached
	// empty Get result. Prototype, writer and unresolved input work stays pending.
	work.operations[id.index].getterRequirementsRegistered = true
	for _, getter := range sourceReflectiveGetterRequirements(demand.receiver.expression, demand.request.producer.selector.field) {
		producer, found := work.memberNodes[getter]
		if !found {
			continue
		}
		consumer := work.memberNodes[demand.request.consumer]
		edge := fmt.Sprintf("%s:field:%s:getter:%d", demand.request.edge, demand.request.producer.selector.field, getter.Pos())
		work.requireStagedSummary(facts, consumer, producer, edge, demand.request.producer.operation, demand.request.cut)
		work.operations[id.index].getters = append(work.operations[id.index].getters, sourceStagedGetterRequirement{demand: demand, declaration: getter, edge: edge, bodyReady: facts[producer].staged.ready, receiverPending: true, selectionPending: true})
	}
}
