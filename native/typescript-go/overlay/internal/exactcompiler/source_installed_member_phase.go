package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceInstalledMemberPhase distinguishes semantic phases, including two
// phases at the same implicit algorithm Call. Has never lends Get authority.
type sourceInstalledMemberPhase uint8

const (
	installedMemberRead sourceInstalledMemberPhase = iota
	installedMemberHas
	installedMemberAcquire
)

func installedMemberTraversal(phase sourceInstalledMemberPhase) (accessorTraversal, bool) {
	switch phase {
	case installedMemberRead:
		return accessorRead, true
	case installedMemberHas:
		return accessorNoGet, true
	case installedMemberAcquire:
		return accessorAcquire, true
	}
	return 0, false
}

// sourceInstalledMemberApplication is a detached source description. The
// producer is the actual member/algorithm owner; consumer is its per-use reader.
// binderCut belongs to the original binder and is not rewritten to memberCut.
// The binding pointer names an already sealed descriptive edge, not a frame.
type sourceInstalledMemberApplication struct {
	origin        *ast.Node // authenticated source index anchor, never raw receiver DATA
	inputRequired []sourceStagedOperationRequest
	nativeGet     sourceStagedOperationRequest // independent selected native Get, never whole algorithm
	request       sourceStagedOperationRequest
	binding       *sourceRelativeInputEdge
	receiver      sourceRelativeEndpoint
	binderCut     sourceRelativeCut
	memberCut     sourceRelativeCut
	phase         sourceInstalledMemberPhase
	key           string
	generation    *projectGeneration
}

// sourceInstalledMemberInput is lent around the original SOURCE body/return
// traversal after its real binder publishes. Copying inputs or a query cannot
// copy this interval. It is revoked before the original traversal returns and
// is never placed in a recipe, fact, operation state or cache.
type sourceInstalledMemberInput struct {
	issuer     *sourceValueQuery
	inputs     *sourceValueInputs
	binding    *sourceRelativeInputEdge
	source     *sourceInstalledMemberInputDescription
	generation *projectGeneration
	live       bool
}

// sourceInstalledMemberEvent is an original phase's synchronous publication
// interval. Only application is detached. get, read, inputs and callbacks die
// with this interval; a later delivery must request a fresh original phase.
type sourceInstalledMemberEvent struct {
	self                                        *sourceInstalledMemberEvent // only the original synchronous event
	work                                        *callableEffectWork         // original enrollment owner, never detached
	epoch                                       *sourceStagedOperationEpoch
	readerActive                                bool                                     // only original memberWriterRead owns this interval
	construction                                *sourceConstructionFieldReadContribution // borrowed original typed field contribution
	constructionAccounted                       bool
	issuer                                      *sourceValueQuery
	input                                       *sourceInstalledMemberInput
	publisher                                   *sourcePendingMemberPublisher
	application                                 sourceInstalledMemberApplication
	get                                         *sourceGetInputs
	read                                        *sourceMemberWriterReadCut
	complete                                    func(*accessorCandidates) bool
	inventory                                   func() bool
	result                                      *accessorCandidates // ephemeral original phase result
	effectStart, environmentStart, contextStart int
	fieldCallStart, callOutcomeStart            int
	fieldFallbackStart, callFallbackStart       int
	live                                        bool
	pendingStart                                int
	inputStart                                  int
	observation                                 *sourceInstalledMemberObservation   // this actual event
	bodyRevisions                               []sourceInstalledMemberBodyRevision // actual body event revisions
	bodyObserved                                []sourceBodyEffectsObservation      // borrowed only by this actual phase

}

// sourceInstalledMemberInputDescription travels with one prepared alternative.
// It retains only the original binder's source descriptions. It is not a live
// lease and cannot itself activate a body or restore an observation cut.
type sourceInstalledMemberInputDescription struct {
	callable   *sourceConstructionCallableSource // actual SOURCE callable materialization description
	captures   []sourceRelativeBinding
	required   []sourceStagedOperationRequest
	selection  []sourceInstalledCallSelectionSource
	binding    *sourceRelativeInputEdge
	bound      sourceRelativeBoundInputs
	generation *projectGeneration
}

// describeInstalledMemberInput runs only in the real binder's publication
// consumer. No later activation rebinds actuals or reruns an initializer.
func (q *sourceValueQuery) describeInstalledMemberInput(inputs *sourceValueInputs, binding *sourceRelativeInputEdge) *sourceInstalledMemberInputDescription {
	if q == nil || q.installedMemberIssuer != q || !q.dependenciesOnly || q.owner == nil || q.owner.generation == nil || inputs == nil || binding == nil || !binding.delivered || q.relativeInputBinding != inputs || inputs.declaration != binding.request.declaration || inputs.invocation != binding.request.operation || !sameSourceRelativeInputEnvelope(binding.request, binding.bound) || binding.bound.unsupported != relativeInputsSupported || inputs.operationLifetime != nil || inputs.consumedCall != nil || inputs.storage != nil || inputs.population != nil || inputs.fulfilled != nil || inputs.get != nil || inputs.deferredBody {
		return nil
	}
	return &sourceInstalledMemberInputDescription{binding: binding, bound: cloneSourceRelativeBoundInputs(binding.bound), generation: q.owner.generation}
}

// beginInstalledMemberInput lends a fresh interval after the actual source
// body/return owner installs these inputs. Checking source descriptions reads
// the supplied binder/default/rest data only; it performs no acquisition.
// Different prepared alternatives each pass their own original description.
func (q *sourceValueQuery) beginInstalledMemberInput(inputs *sourceValueInputs, source *sourceInstalledMemberInputDescription) (func(), bool) {
	if q == nil || q.installedMemberIssuer != q || q.inputs != inputs || inputs == nil || source == nil || source.binding == nil || q.owner == nil || q.owner.generation != source.generation || !q.dependenciesOnly || q.operation != nil || inputs.operationLifetime != nil || inputs.consumedCall != nil || inputs.storage != nil || inputs.population != nil || inputs.fulfilled != nil || inputs.get != nil || inputs.deferredBody || inputs.declaration != source.binding.request.declaration || inputs.invocation != source.binding.request.operation || !source.binding.delivered {
		return func() {}, false
	}
	if !q.installedMemberSourceOwned(inputs.declaration, inputs.invocation, q.effectOwner) {
		return func() {}, false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.node != q.effectOwner || publisher.fact.sourceFile != ast.GetSourceFileOfNode(q.effectOwner) || publisher.fact.writerInputs != q.executable.writerInputFacts[q.effectOwner] {
		return func() {}, false
	}
	actual := describeSourceRelativeBoundInputs(q, inputs, source.binding.request)
	if !sameInstalledMemberBoundInputs(actual, source.bound) {
		return func() {}, false
	}
	activated := cloneInstalledMemberInputDescription(source)
	if inputs.constructionCapture != nil {
		captures, required, valid := constructionBoundCaptureBindings(q, inputs)
		if !valid {
			return func() {}, false
		}
		activated.captures = captures
		activated.required = required
	}
	previous := q.installedMemberInput
	input := &sourceInstalledMemberInput{issuer: q, inputs: inputs, binding: source.binding, source: activated, generation: source.generation, live: true}
	q.installedMemberInput = input
	return func() {
		input.live = false
		if q.installedMemberInput == input {
			q.installedMemberInput = previous
		}
	}, true
}

func sameInstalledMemberBoundInputs(a, b sourceRelativeBoundInputs) bool {
	if a.inputKind != b.inputKind || a.declaration != b.declaration || a.operation != b.operation || a.use != b.use || a.cut != b.cut || a.unsupported != b.unsupported || !sameSourceRelativeVector(sourceRelativeInvocation{captures: a.bindings}, sourceRelativeInvocation{captures: b.bindings}) || len(a.defaults) != len(b.defaults) || len(a.rest) != len(b.rest) {
		return false
	}
	for i, item := range a.defaults {
		if item != b.defaults[i] {
			return false
		}
	}
	for i, item := range a.rest {
		other := b.rest[i]
		if item.formal != other.formal || item.unknownTail != other.unknownTail || item.cut != other.cut || len(item.slots) != len(other.slots) {
			return false
		}
		for j, slot := range item.slots {
			otherSlot := other.slots[j]
			if slot.position != otherSlot.position || slot.unknownPosition != otherSlot.unknownPosition || !sameSourceRelativeVector(sourceRelativeInvocation{captures: []sourceRelativeBinding{slot.binding}}, sourceRelativeInvocation{captures: []sourceRelativeBinding{otherSlot.binding}}) {
				return false
			}
		}
	}
	return true
}

func (q *sourceValueQuery) installedMemberInputOwned(input *sourceInstalledMemberInput) bool {
	return q != nil && q.installedMemberIssuer == q && input != nil && input.live && input.issuer == q && q.installedMemberInput == input && q.inputs == input.inputs && q.inputs != nil && q.owner != nil && input.generation == q.owner.generation && input.binding != nil && input.binding.delivered && q.inputs.declaration == input.binding.request.declaration && q.inputs.invocation == input.binding.request.operation && input.binding.request.inputKind == relativeInputInvocation && q.dependenciesOnly && q.operation == nil && q.inputs.operationLifetime == nil && q.inputs.consumedCall == nil && q.inputs.storage == nil && q.inputs.population == nil && q.inputs.fulfilled == nil && q.inputs.get == nil && !q.inputs.deferredBody && q.returnObservation == nil && q.receiverInspection == nil && q.argumentPrefix == nil
}

// installedMemberSourceOwned checks actual registered AST ownership. A type
// annotation or matching node position cannot substitute for this program.
func (q *sourceValueQuery) installedMemberSourceOwned(nodes ...*ast.Node) bool {
	if q == nil || q.owner == nil || q.owner.program == nil || q.owner.checker == nil || q.owner.generation == nil || q.executable == nil || q.executable.project == nil || !installedMemberGenerationActive(q.owner.generation) || q.owner.generation.program != q.owner.program || q.owner.generation.checker != q.owner.checker || q.executable.project.activeGeneration != q.owner.generation || q.executable.checker != q.owner.checker {
		return false
	}
	for _, node := range nodes {
		if node == nil {
			continue
		}
		file := ast.GetSourceFileOfNode(node)
		if file == nil || file.IsDeclarationFile || q.owner.program.GetSourceFile(file.FileName()) != file {
			return false
		}
	}
	return true
}

// beginInstalledMemberPhase is called by the original phase owner, before its
// ordinary member population is enumerated. parent is the real lexical Get or
// a fixed phase request issued by the owning native algorithm. It is not a C.
// The native owner must authenticate implicit fields before invoking this API;
// ordinary callers must match the actual accessorReceiver syntax.
func (work *callableEffectWork) beginInstalledMemberPhase(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest, get *sourceGetInputs, cut *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string, receiver sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool) {
	mode, supported := installedMemberTraversal(phase)
	if !supported || key == "" || key == "*" || q == nil || !q.installedMemberInputOwned(q.installedMemberInput) || !q.installedMemberSourceOwned(parent.producer.declaration, parent.producer.operation, q.effectOwner, q.reading, q.initializing, q.returning, q.invoking) || get == nil || cut == nil || get.operation != parent.producer.operation || get.operation != cut.operation || cut.use != q.reading || !installedMemberGetKey(get, key) || get.hasOnly != (phase == installedMemberHas) || q.effectOwner == nil || parent.producer.kind != relativeDemandEffects || work.operationGeneration != nil && work.operationGeneration != q.owner.generation {
		return nil, func() {}, false
	}
	if !q.installedAuthoredMemberPhaseOwned(parent, get, phase, key) && !q.installedDescriptorMemberPhaseOwned(parent, get, cut, phase, key) {
		return nil, func() {}, false
	}
	work.indexOperationSources(facts)
	producer, producerKnown := work.memberNodes[parent.producer.declaration]
	consumer, consumerKnown := work.memberNodes[q.effectOwner]
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if !producerKnown || !consumerKnown || producer >= len(facts) || consumer >= len(facts) || facts[producer].node != parent.producer.declaration || facts[producer].sourceFile != ast.GetSourceFileOfNode(get.operation) || publisher == nil || !publisher.live || publisher.fact != &facts[consumer] || len(work.operationFacts) != len(facts) || &work.operationFacts[consumer] != publisher.fact {
		return nil, func() {}, false
	}
	work.operationGeneration = q.owner.generation
	input := q.installedMemberInput
	request := parent
	request.producer.selector = sourceStagedOperationSelector{occurrence: installedMemberReceiverOrigin(receiver, q.owner.generation), association: input.binding.request.operation, field: fmt.Sprintf("installed-member:%d:%s", phase, key)}
	request.consumer, request.use = q.effectOwner, q.effectUse()
	request.cut, request.inputs = q.relativeInputCut(get.operation), input.binding
	request.edge = fmt.Sprintf("%s:installed-member:%d:%s:%p:%p", parent.edge, phase, key, receiver.expression, input.binding.request.operation)
	application := sourceInstalledMemberApplication{origin: installedMemberReceiverOrigin(receiver, q.owner.generation), inputRequired: append([]sourceStagedOperationRequest(nil), input.source.required...), request: request, binding: input.binding, receiver: cloneSourceRelativeEndpoint(receiver), binderCut: input.binding.request.cut, memberCut: request.cut, phase: phase, key: key, generation: q.owner.generation}
	if receiver.moduleConstruction != nil && receiver.moduleConstruction.source != nil {
		for _, field := range receiver.moduleConstruction.source.fields {
			if field.name == key && field.required.producer.operation != nil {
				application.inputRequired = appendEntryLawRequirement(application.inputRequired, field.required)
			}
		}
		required, _ := constructionEndpointRoleRequirements(receiver)
		for _, child := range required {
			application.inputRequired = appendEntryLawRequirement(application.inputRequired, child)
		}
	}
	if native := q.installedMemberNativePhase; native != nil && q.installedDescriptorMemberPhaseOwned(parent, get, cut, phase, key) {
		application.nativeGet = nativeRootDebtRequest(native.source, "callee-get")
	}
	// Reissue keeps the existing subscriber's descriptive edge identity only
	// when every source role and original cut is semantically identical. The
	// new live input lease is still required; no old observation is refreshed.
	if prior, exists := work.operationRecipes[request.producer]; exists && prior.installedMember != nil {
		if !sameInstalledMemberApplication(prior.installedMember, &application) {
			return nil, func() {}, false
		}
		if id, adopted := work.operationIDs[request.producer]; adopted && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{consumer: request.consumer, edge: request.edge}]
			if subscriber != nil {
				if !sameInstalledMemberRequest(subscriber.request, request) {
					return nil, func() {}, false
				}
				application.request = subscriber.request
			}
		}
	}
	if !validInstalledMemberApplication(&application) || mode == accessorNoGet && !get.hasOnly {
		return nil, func() {}, false
	}
	event := &sourceInstalledMemberEvent{issuer: q, input: input, publisher: publisher, application: application, get: get, read: cut, live: true}
	event.self = event
	previous := q.installedMemberPhase
	q.installedMemberPhase = event
	if !work.enrollInstalledMemberPhase(facts, q, event) {
		event.live = false
		q.installedMemberPhase = previous
		return nil, func() {}, false
	}
	event.work, event.epoch = work, work.operationEpoch
	if q.installedCallBody != nil && application.nativeGet.producer.operation == nil {
		if !work.registerInstalledCallPhase(facts, q, event) {
			event.live = false
			q.installedMemberPhase = previous
			return nil, func() {}, false
		}
	}
	revokeSource := work.beginInstalledMemberSource(facts, q, event)
	return event, func() {
		if !event.live {
			return
		}
		work.finishInstalledMemberOutcome(q, event)
		q.publishInstalledMemberReading(event)
		revokeSource()
		event.live = false
		event.readerActive = false
		event.work, event.epoch, event.self = nil, nil, nil
		event.complete = nil
		event.result = nil
		if q.installedMemberPhase == event {
			q.installedMemberPhase = previous
		}
	}, true
}

// beginInstalledMemberSource lends the ordinary indexed population owner. The
// definition-only constructor stays unchanged. These callbacks register actual
// all-MAY children; none supplies an empty-set or NoUser verdict for a candidate.
func (work *callableEffectWork) beginInstalledMemberSource(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent) func() {
	previous := q.stagedMember
	previousBodies := q.sourceEffects.body
	q.sourceEffects.body = func(observation sourceBodyEffectsObservation) {
		if event.live && event.issuer == q && q.installedMemberPhase == event && observation.consumer == event.application.request.consumer && observation.generation == event.application.generation {
			event.bodyObserved = append(event.bodyObserved, observation)
			if producer, known := work.memberNodes[observation.call.target]; known && producer < len(work.stagedRevisions) {
				event.bodyRevisions = append(event.bodyRevisions, sourceInstalledMemberBodyRevision{declaration: observation.call.target, operation: observation.call.operation, revision: work.stagedRevisions[producer]})
			}
		}
		if previousBodies != nil {
			previousBodies(observation)
		}
	}
	request := event.application.request
	b := &sourceStagedMemberBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, request: request, installedMember: event, mode: event.getMode()}
	b.publish = func(candidate sourceStagedMemberCandidate) bool {
		return work.registerStagedMemberCandidate(facts, q, request, candidate)
	}
	b.finish = func(receipt sourceStagedMemberDisposition) bool {
		return work.registerStagedMemberDisposition(facts, q, receipt)
	}
	event.inventory = func() bool {
		// This is the actual source owner publishing its pre-recovery C.
		// The early prefix is intentionally not an extracted empty source set.
		return q.publishStagedMemberDisposition(event.get, event.read, false)
	}
	b.registerWriterSource = func(r *sourceWriterInputRequest) { work.registerWriterSource(facts, q, r) }
	b.writerCall = func(call *ast.Node) sourceStagedWriterCallDisposition {
		return work.consumeStagedStandardWriterCall(facts, q, call)
	}
	b.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
		return work.transferStagedCallResult(facts, q, call, interest)
	}
	b.reflectiveTarget = func(operation *ast.Node, target sourceValue) sourceStagedReflectiveTargetTransfer {
		return work.prepareStagedReflectiveTarget(facts, q, operation, target)
	}
	b.nativeInputCall = func(call *ast.Node) sourceStagedWriterCallDisposition {
		return work.consumeStagedNativeInputInvocation(facts, q, call)
	}
	event.complete = func(result *accessorCandidates) bool {
		return work.recordInstalledMemberPhase(facts, q, event, result)
	}
	q.stagedMember = b
	return func() {
		q.sourceEffects.body = previousBodies
		event.bodyObserved = nil
		event.bodyRevisions = nil
		event.inventory = nil
		if q.stagedMember == b {
			q.stagedMember = previous
		}
		b.issuer, b.installedMember = nil, nil
		b.publish, b.finish = nil, nil
		b.registerWriterSource, b.writerCall, b.returnResult = nil, nil, nil
		b.reflectiveTarget, b.nativeInputCall = nil, nil
	}
}

func (event *sourceInstalledMemberEvent) getMode() accessorTraversal {
	mode, _ := installedMemberTraversal(event.application.phase)
	return mode
}

// installedMemberFactoryParent validates this distinct per-use factory. It is
// deliberately not an additional success clause in validStagedMemberParent.
func installedMemberFactoryParent(source *sourceStagedMemberSource, cut sourceRelativeCut) bool {
	return source != nil && validInstalledMemberApplication(source.installedMember) && source.generation == source.installedMember.generation && sameInstalledMemberRequest(source.parent, source.installedMember.request) && cut == source.installedMember.memberCut
}

func stagedMemberFactoryObservation(source *sourceStagedMemberSource, cut sourceRelativeCut) bool {
	if source != nil && source.installedCallSelection != nil {
		return installedCallSelectionFactoryParent(source, cut)
	}
	if source != nil && source.installedMember != nil {
		return installedMemberFactoryParent(source, cut)
	}
	return source != nil && validStagedMemberObservation(source.parent, cut)
}

func stagedMemberFactoryParent(source *sourceStagedMemberSource) bool {
	if source != nil && source.installedCallSelection != nil {
		return installedCallSelectionFactoryParent(source, source.installedCallSelection.cut)
	}
	if source != nil && source.installedMember != nil {
		return installedMemberFactoryParent(source, source.installedMember.memberCut)
	}
	return source != nil && validStagedMemberParent(source.parent)
}

func validInstalledMemberApplication(a *sourceInstalledMemberApplication) bool {
	if a == nil || a.generation == nil || a.binding == nil || !a.binding.delivered || a.binding.bound.unsupported != relativeInputsSupported || !sameSourceRelativeInputEnvelope(a.binding.request, a.binding.bound) || a.binderCut != a.binding.request.cut || !sameInstalledMemberInputEdge(a.request.inputs, a.binding) || a.request.cut != a.memberCut || a.memberCut.operation != a.request.producer.operation || a.memberCut.use != a.request.use || a.key == "" || a.key == "*" || a.request.consumer == nil || a.request.producer.declaration == nil || a.request.producer.operation == nil || a.request.producer.kind != relativeDemandEffects || a.origin == nil || a.origin != installedMemberReceiverOrigin(a.receiver, a.generation) {
		return false
	}
	_, phaseKnown := installedMemberTraversal(a.phase)
	return phaseKnown && a.request.producer.selector == (sourceStagedOperationSelector{occurrence: a.origin, association: a.binding.request.operation, field: fmt.Sprintf("installed-member:%d:%s", a.phase, a.key)})
}

func sameInstalledMemberApplication(a, b *sourceInstalledMemberApplication) bool {
	return a == nil && b == nil || a != nil && b != nil && sameInstalledMemberRequest(a.request, b.request) && sameInstalledMemberInputEdge(a.binding, b.binding) && sameOperationRequest(a.nativeGet, b.nativeGet) && sameOperationEndpoint(a.receiver, b.receiver) && a.origin == b.origin && a.binderCut == b.binderCut && a.memberCut == b.memberCut && a.phase == b.phase && a.key == b.key && a.generation == b.generation && sameInstalledMemberRequirements(a.inputRequired, b.inputRequired)
}

func cloneInstalledMemberApplication(a *sourceInstalledMemberApplication) *sourceInstalledMemberApplication {
	if a == nil {
		return nil
	}
	copy := *a
	copy.receiver = cloneSourceRelativeEndpoint(a.receiver)
	copy.inputRequired = append([]sourceStagedOperationRequest(nil), a.inputRequired...)
	copy.binding = cloneInstalledMemberInputEdge(a.binding)
	copy.request.inputs = copy.binding
	return &copy
}

func (q *sourceValueQuery) liveInstalledMemberPhase(event *sourceInstalledMemberEvent, get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	return event != nil && event.live && q != nil && event.issuer == q && q.installedMemberPhase == event && q.installedMemberInputOwned(event.input) && get == event.get && cut == event.read && get != nil && cut != nil && get.operation == event.application.request.producer.operation && installedMemberGetKey(get, event.application.key) && get.hasOnly == (event.application.phase == installedMemberHas) && q.installedMemberCutOwned(event, get, cut) && q.effectOwner == event.application.request.consumer && event.publisher != nil && event.publisher.live && q.executable.pendingMemberPublishers[q.effectOwner] == event.publisher && q.installedMemberSourceOwned(get.operation, q.effectOwner, q.returning, q.initializing) && validInstalledMemberApplication(&event.application)
}

func installedMemberGetKey(get *sourceGetInputs, key string) bool {
	if get == nil || key == "" || key == "*" {
		return false
	}
	if get.propertyKey != "" {
		return get.propertyKey == key
	}
	_, actual := accessorReceiver(get.operation)
	return actual == key
}

// installedMemberReaderOwned keeps the genuine SOURCE return/creator context.
// The definition reader's factory-return suppression is not borrowed here.
func (q *sourceValueQuery) installedMemberReaderOwned(get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	return q.liveInstalledMemberPhase(q.installedMemberPhase, get, cut)
}

// beginAuthoredInstalledMemberPopulation uses the original authored Get and
// the registered lexical fact. Implicit Call-based phases require their own
// native issuer; they cannot enter through this syntax-owned branch.
func (q *sourceValueQuery) beginAuthoredInstalledMemberPopulation(get *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, key string, origin *ast.Node) func() {
	if q == nil || get == nil || origin == nil || q.executable == nil || !q.installedMemberInputOwned(q.installedMemberInput) || q.liveInstalledMemberPhase(q.installedMemberPhase, get, cut) {
		return func() {}
	}
	phase := installedMemberRead
	if mode == accessorAcquire {
		phase = installedMemberAcquire
	} else if mode != accessorRead {
		return func() {}
	}
	producer := enclosingCallableNode(get.operation)
	publisher := q.executable.pendingMemberPublishers[producer]
	if publisher == nil || !publisher.live || publisher.fact == nil || publisher.fact.node != producer {
		return func() {}
	}
	parent, described := stagedMemberGetSourceRequest(publisher.fact, get.operation)
	if !described || !q.installedAuthoredMemberPhaseOwned(parent, get, phase, key) {
		return func() {}
	}
	creator := q.creators[enclosingCallableNode(origin)]
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: origin, creation: creator.invocation, returning: creator.returning, cut: q.relativeInputCut(get.operation)}
	_, revoke, installed := q.beginInstalledMemberWorkPhase(parent, get, cut, phase, key, receiver)
	if !installed {
		return func() {}
	}
	return revoke
}

func installedMemberGenerationActive(generation *projectGeneration) bool {
	return generation != nil && generation.active && generation.project != nil && generation.project.activeGeneration == generation && generation.program != nil && generation.checker != nil
}

func cloneInstalledMemberInputDescription(source *sourceInstalledMemberInputDescription) *sourceInstalledMemberInputDescription {
	if source == nil {
		return nil
	}
	copy := *source
	copy.bound = cloneSourceRelativeBoundInputs(source.bound)
	copy.binding = cloneInstalledMemberInputEdge(source.binding)
	copy.required = append([]sourceStagedOperationRequest(nil), source.required...)
	copy.captures = append([]sourceRelativeBinding(nil), source.captures...)
	for i := range copy.captures {
		copy.captures[i] = cloneSourceRelativeBinding(copy.captures[i])
	}
	copy.selection = cloneInstalledCallSelections(source.selection)
	copy.callable = cloneConstructionCallableSource(source.callable)
	return &copy
}

// Input edges here are detached source descriptions. Equal descriptions do
// not lend a binder interval or an operation subscriber. Subscriber matching
// continues to use the independently retained original full request.
func sameInstalledMemberInputEdge(a, b *sourceRelativeInputEdge) bool {
	return a == nil && b == nil || a != nil && b != nil && a.delivered == b.delivered && sameSourceRelativeInvocation(a.request, b.request) && sameInstalledMemberBoundInputs(a.bound, b.bound) && sameInstalledMemberBoundInputs(a.relative, b.relative)
}

func cloneInstalledMemberInputEdge(edge *sourceRelativeInputEdge) *sourceRelativeInputEdge {
	if edge == nil {
		return nil
	}
	copy := *edge
	copy.request = cloneStagedWriterInvocation(edge.request)
	copy.bound = cloneSourceRelativeBoundInputs(edge.bound)
	copy.relative = cloneSourceRelativeBoundInputs(edge.relative)
	return &copy
}

func sameInstalledMemberRequest(a, b sourceStagedOperationRequest) bool {
	inputsA, inputsB := a.inputs, b.inputs
	a.inputs, b.inputs = nil, nil
	return sameOperationRequest(a, b) && sameInstalledMemberInputEdge(inputsA, inputsB)
}

func sameInstalledMemberRequirements(a, b []sourceStagedOperationRequest) bool {
	return operationPrefix(a, b, sameOperationRequest) && operationPrefix(b, a, sameOperationRequest)
}

func sameInstalledMemberInputDescription(a, b *sourceInstalledMemberInputDescription) bool {
	return a == nil && b == nil || a != nil && b != nil && a.generation == b.generation && sameInstalledMemberInputEdge(a.binding, b.binding) && sameInstalledMemberBoundInputs(a.bound, b.bound) && sameSourceRelativeVector(sourceRelativeInvocation{captures: a.captures}, sourceRelativeInvocation{captures: b.captures}) && sameInstalledMemberRequirements(a.required, b.required) && sameInstalledCallSelections(a.selection, b.selection) && sameConstructionCallableSource(a.callable, b.callable)
}
