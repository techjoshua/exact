package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// sourceRelativeFieldMutation is an immutable symbolic mutation SOURCE
// obligation. A role is never an externally executed callback. Actual binder
// substitution must retain this operator until an original SOURCE producer
// supplies known writer DATA or authenticated external terminal provenance.
// Known callable RHS remains in the existing exposure/creating channel.
type sourceRelativeFieldMutation struct {
	external          *sourceStagedMemberExternalGet // Disjoint original external Get, passive until actual BODY/input consumer.
	externalSource    sourceStagedOperationRequest
	scope             *ast.Node // Canonical conditional body owning this operator, not a value.
	externalActive    bool      // Only an exact real getter BODY/input application can set this.
	standardReadEmpty bool      // Conditional supported standard-read field output only; not global NoWrites.
	applications      []sourceFieldMutationApplication
	native            sourceStagedDescriptorRetrieval
	method            *ast.Node
	field             sourceStagedOperationRequest
	receiver          sourceRelativeEndpoint
	name              string
	input             sourceDescriptorInputData
	key               sourceDescriptorInputData
	target            sourceRelativeEndpoint
	required          []sourceStagedOperationRequest
}

func cloneRelativeFieldMutation(source *sourceRelativeFieldMutation) *sourceRelativeFieldMutation {
	if source == nil {
		return nil
	}
	out := *source
	if source.external != nil {
		copy := *source.external
		out.external = &copy
	}
	out.applications = append([]sourceFieldMutationApplication(nil), source.applications...)
	for i, application := range out.applications {
		out.applications[i].before = cloneSourceRelativeEndpoint(application.before)
		out.applications[i].after = cloneSourceRelativeEndpoint(application.after)
		out.applications[i].invocation = cloneStagedWriterInvocation(application.invocation)
		out.applications[i].bound = cloneSourceRelativeBoundInputs(application.bound)
		if application.getterReader != nil {
			request := cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{*application.getterReader}}).required[0]
			out.applications[i].getterReader = &request
		}
	}
	out.native = *cloneDescriptorRetrieval(&source.native)
	out.receiver = cloneSourceRelativeEndpoint(source.receiver)
	out.input = cloneDescriptorInputData(source.input)
	out.key = cloneDescriptorInputData(source.key)
	out.target = cloneSourceRelativeEndpoint(source.target)
	out.required = cloneOperationDelta(sourceStagedOperationDelta{required: source.required}).required

	return &out
}

func sameRelativeFieldMutation(a, b *sourceRelativeFieldMutation) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.scope != b.scope || a.externalActive != b.externalActive || a.standardReadEmpty != b.standardReadEmpty || a.method != b.method || !sameMutationExternalOrigin(a, b) || a.name != b.name || !sameDescriptorRetrieval(&a.native, &b.native) || !sameOperationRequest(a.field, b.field) || !sameOperationEndpoint(a.receiver, b.receiver) || !sameDescriptorInputData(a.input, b.input) || !sameDescriptorInputData(a.key, b.key) || !sameOperationEndpoint(a.target, b.target) || len(a.required) != len(b.required) || !operationPrefix(a.required, b.required, sameOperationRequest) {
		return false
	}
	if len(a.applications) != len(b.applications) {
		return false
	}
	for i, application := range a.applications {
		if !sameFieldMutationApplication(application, b.applications[i]) {
			return false
		}
	}
	return true
}

// validRelativeFieldMutationShape validates a description, not a selected
// target, applied source, external terminal or permission to invoke a role.
func validRelativeFieldMutationShape(m *sourceRelativeFieldMutation) bool {
	if m != nil && m.external != nil {
		return validExternalFieldMutationShape(m)
	}
	if m == nil || m.scope != nil || m.externalActive || m.standardReadEmpty || len(m.applications) > 1 || m.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(m.method)) || m.native.generation == nil || m.name == "" || m.field.producer.kind != relativeDemandDirectExposure || m.receiver.expression == nil || !validDescriptorInputData(&m.native, 0, m.input) || !validDescriptorInputData(&m.native, 1, m.key) {
		return false
	}
	parent, role := fieldSourceParent(m.field)
	if !role || parent.producer.operation == nil || parent.producer.declaration != m.native.request.consumer || parent.consumer != m.native.request.consumer || m.name != parent.producer.selector.field || m.receiver.expression != parent.producer.selector.occurrence || m.native.request.producer.operation == nil || !ast.IsCallExpression(m.native.request.producer.operation) {
		return false
	}
	var expected []sourceStagedOperationRequest
	source := &sourceStagedNativeGetSource{request: m.native.request, get: m.native.request.producer.operation.Expression()}
	expected = appendEntryLawRequirement(expected, m.native.request)
	expected = appendEntryLawRequirement(expected, nativeRootDebtRequest(source, "algorithm"))
	expected = appendEntryLawRequirement(expected, nativeRootDebtRequest(source, "callee-get"))
	for _, input := range []sourceDescriptorInputData{m.input, m.key} {
		if input.request.producer.operation != nil {
			expected = appendEntryLawRequirement(expected, input.request)
		}
	}
	for _, request := range expected {
		if !operationContainsRequest(m.required, request) {
			return false
		}
	}
	for _, application := range m.applications {
		if !validFieldMutationApplication(application, m.target) {
			return false
		}
	}

	return m.target.kind == relativeEndpointRole && m.target.role.kind != relativeRoleUnknown && validMutationSourceRole(m.target.role, m.target.role.declaration)
}

func sameOperationResidual(a, b sourceStagedOperationResidual) bool {
	return a.operation == b.operation && a.role == b.role && sameRelativeFieldMutation(a.mutation, b.mutation)
}

func relativeFieldMutationFingerprint(m *sourceRelativeFieldMutation, b *strings.Builder) {
	if m == nil {
		return
	}
	b.WriteString(fmt.Sprintf("|field-mutation:%p:%#v:%#v:%s:%#v", m.method, m.native.request, m.field, m.name, m.required))
	b.WriteString(fmt.Sprintf(":scope:%p:active:%t:standard-read-empty:%t", m.scope, m.externalActive, m.standardReadEmpty))
	descriptorFingerprintEndpoint(m.receiver, b)
	descriptorFingerprintEndpoint(m.target, b)
	if m.external != nil {
		b.WriteString(fmt.Sprintf(":external-get:%#v:%#v", *m.external, m.externalSource))
	} else {
		view := sourceNativeDescriptorView{source: m.native, method: m.method, inputs: [2]sourceDescriptorInputData{m.input, m.key}}
		descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &view}, b)
	}
	for _, application := range m.applications {
		invocation := descriptorFingerprintInvocation(application.invocation, b)
		bound := cloneSourceRelativeBoundInputs(application.bound)
		bound.bindings = descriptorFingerprintBindings(bound.bindings, b)
		descriptorFingerprintEndpoint(application.before, b)
		descriptorFingerprintEndpoint(application.after, b)
		b.WriteString(fmt.Sprintf(":application:%#v:%#v:%p:%p:%#v", invocation, bound, application.inputs, application.sourceInputs, application.getterReader))
	}
}

func relativeFieldMutationIdentity(m *sourceRelativeFieldMutation) string {
	if m == nil {
		return ""
	}
	var b strings.Builder
	relativeFieldMutationFingerprint(m, &b)
	for _, application := range m.applications {
		b.WriteString(fmt.Sprintf(":at:%p:%#v", application.invocation.operation, application.invocation.cut))
	}
	return b.String()
}

// relativeMutationEffect retains a symbolic dependency at declaration scope.
// It deliberately does not populate relativeInput or claim that the formal was
// called. Actual consumer substitution owns external/known/pending decisions.
func relativeMutationEffect(m *sourceRelativeFieldMutation, owner string) EnvironmentEffectSource {
	environment, description := "unknown", "source-relative native field mutation"
	if m != nil && m.standardReadEmpty {
		environment, description = "browser", "source-relative trusted standard property read"
	}
	effect := environmentSource(environment, description, owner)
	effect.relativeMutation = cloneRelativeFieldMutation(m)
	return effect
}

func appendOperationMutation(fact *callableFacts, m *sourceRelativeFieldMutation) bool {
	if !validRelativeFieldMutationShape(m) {
		return false
	}
	for _, effect := range fact.summary.DirectEffectSources {
		if sameRelativeFieldMutation(effect.relativeMutation, m) {
			return true
		}
	}
	fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, relativeMutationEffect(m, fact.summary.Name))
	return true
}

func cloneOperationResidual(r sourceStagedOperationResidual) sourceStagedOperationResidual {
	r.mutation = cloneRelativeFieldMutation(r.mutation)
	return r
}

// relativeFieldMutationSourceCurrent consumes actual original source/input
// associations only. It never asks dependency closure or runs a query/binder.
func (work *callableEffectWork) relativeFieldMutationSourceCurrent(m *sourceRelativeFieldMutation) bool {
	if m != nil && m.external != nil {
		return work.externalFieldMutationSourceCurrent(m)
	}
	if !validRelativeFieldMutationShape(m) || work.operationGeneration != m.native.generation {
		return false
	}
	algorithm := nativeRootDebtRequest(&sourceStagedNativeGetSource{request: m.native.request, get: m.native.request.producer.operation.Expression()}, "algorithm")
	recipe, registered := work.operationRecipes[algorithm.producer]
	source := recipe.nativeGet
	if !registered || !validDescriptorEffectsPhase(recipe) || source == nil || source.method != m.method || !sameDescriptorRetrieval(source.descriptorRead, &m.native) || !work.nativeEffectsGetCurrent(source) || !work.descriptorInputSnapshotCurrent(&m.native, 0, m.input) || !work.descriptorInputSnapshotCurrent(&m.native, 1, m.key) {
		return false
	}
	for _, application := range m.applications {
		if !work.fieldMutationApplicationCurrent(application, m.target) {
			return false
		}
	}

	return true
}

// applyOperationMutation preserves an unbound source operator as a distinct
// canonical atom. An arbitrary role is not invoked or collapsed to unknown.
func (work *callableEffectWork) applyOperationMutation(facts []callableFacts, consumer int, use sourceStagedOperationUse, m *sourceRelativeFieldMutation) bool {
	if consumer < 0 || consumer >= len(facts) || !work.relativeFieldMutationSourceCurrent(m) {
		return false
	}
	if use.call == nil && use.installed == nil && use.request.producer.kind == relativeDemandDirectExposure {
		return true // Producer retains the typed DATA operator; no effect demand.
	}

	if m.external != nil {
		if !work.externalFieldMutationUseCurrent(facts, consumer, use, m) {
			return false
		}
		if m.standardReadEmpty {
			return true // Browser/dependency effects remain with the real canonical BODY.
		}
		effect := environmentSource("unknown", "external getter mutation alternative", facts[consumer].summary.Name)
		effect.Opaque = true
		appendOperationEffect(&facts[consumer], effect)
		return true
	}
	if m.target.kind != relativeEndpointRole || m.target.role.declaration != facts[consumer].node {
		return false
	}
	return work.recordCanonicalMutation(facts, consumer, m)
}

// sourceFieldMutationApplication records one original source substitution. It
// preserves the original producer input snapshot rather than rewriting it.
type sourceFieldMutationApplication struct {
	scopeBefore, scopeAfter *ast.Node // External Get canonical-body transport; never invoked role substitution.
	before, after           sourceRelativeEndpoint
	invocation              sourceRelativeInvocation
	bound                   sourceRelativeBoundInputs
	inputs                  *sourceRelativeInputEdge
	sourceInputs            *sourceStagedInputSubstitution
	getterReader            *sourceStagedOperationRequest
}

func sameFieldMutationApplication(a, b sourceFieldMutationApplication) bool {
	if a.scopeBefore != b.scopeBefore || a.scopeAfter != b.scopeAfter || !sameOperationEndpoint(a.before, b.before) || !sameOperationEndpoint(a.after, b.after) || !sameSourceRelativeInvocation(a.invocation, b.invocation) || !sameInstalledMemberBoundInputs(a.bound, b.bound) || a.inputs != b.inputs || a.sourceInputs != b.sourceInputs {
		return false
	}
	return a.getterReader == nil && b.getterReader == nil || a.getterReader != nil && b.getterReader != nil && sameOperationRequest(*a.getterReader, *b.getterReader)
}

func validFieldMutationApplication(a sourceFieldMutationApplication, target sourceRelativeEndpoint) bool {
	if a.scopeBefore != nil || a.scopeAfter != nil || a.before.kind != relativeEndpointRole || a.before.role.declaration != a.invocation.declaration || !sameOperationEndpoint(a.after, target) || !sameSourceRelativeInputEnvelope(a.invocation, a.bound) {
		return false
	}
	if a.inputs != nil {
		if !a.inputs.delivered || !sameSourceRelativeInvocation(a.inputs.request, a.invocation) || !sameInstalledMemberBoundInputs(a.inputs.relative, a.bound) {
			return false
		}
	} else if a.sourceInputs == nil || !sameSourceRelativeInvocation(a.sourceInputs.invocation, a.invocation) || !sameInstalledMemberBoundInputs(a.sourceInputs.bindings, a.bound) {
		return false
	}
	for _, binding := range a.bound.bindings {
		if binding.target == a.before.role {
			for _, endpoint := range binding.sources {
				if sameOperationEndpoint(endpoint, a.after) {
					return true
				}
			}
		}
	}
	return false
}

// fieldMutationApplicationCurrent checks the actual registered canonical input
// association. It is local; required BODY/DATA closure stays with its owner.
func (work *callableEffectWork) fieldMutationApplicationCurrent(a sourceFieldMutationApplication, target sourceRelativeEndpoint) bool {
	if !validFieldMutationApplication(a, target) {
		return false
	}
	if a.getterReader != nil {
		id, adopted := work.operationIDs[a.getterReader.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		for _, getter := range work.operations[id.index].getters {
			if getter.declaration == a.invocation.declaration && getter.inputs == a.inputs && getter.bodyTransferred && getter.bodyReady && sameOperationRequest(getter.demand.request, *a.getterReader) {
				return true
			}
		}
		return false
	}
	caller, known := work.memberNodes[target.role.declaration]
	if !known || caller < 0 || caller >= len(work.operationFacts) {
		return false
	}
	for _, call := range work.operationFacts[caller].staged.calls {
		if call.inputConsumerWait == nil && !call.legacyInputs && call.inputs == a.inputs && call.sourceInputs == a.sourceInputs && sameSourceRelativeInvocation(call.invocation, a.invocation) {
			return true
		}
	}
	return false
}

// validMutationSourceRole describes input dependency roles. The invocation
// protocol's narrower formal-only validator is intentionally unchanged: a
// receiver or lexical capture mutation obligation is never a call of that role.
func validMutationSourceRole(role sourceRelativeRole, declaration *ast.Node) bool {
	if declaration == nil || role.declaration != declaration || !ast.IsFunctionLike(declaration) {
		return false
	}
	switch role.kind {
	case relativeRoleFormal:
		return validOperationRelativeRole(role, declaration)
	case relativeRoleReceiver:
		return role.slot == 0 && role.binding == nil && role.lexical == ast.IsArrowFunction(declaration)
	case relativeRoleCapture:
		return role.slot == 0 && !role.lexical && role.binding != nil && role.binding.Name() != nil && ast.IsIdentifier(role.binding.Name()) && enclosingCallableNode(role.binding) != declaration
	}
	return false
}
