package exactcompiler

import (
	"fmt"
	"strings"
)

// Descriptor fingerprints retain semantic source association, not allocation
// addresses of cloned carrier descriptions. These pure projections are used
// only for hashing. Unchanged carrier domains reuse their original slices.
func descriptorFingerprintEndpoint(endpoint sourceRelativeEndpoint, result *strings.Builder) sourceRelativeEndpoint {
	if value := endpoint.nativePrimitive; value != nil {
		input := descriptorFingerprintEndpoint(value.input, result)
		alternatives := descriptorFingerprintAlternatives(value.inputData, result)
		result.WriteString(fmt.Sprintf("|native-primitive:%#v:%#v:%p:%p:%#v:%#v:%#v", value.request, value.original, value.method, value.generation, input, value.inputRequired, alternatives))
		endpoint.nativePrimitive = nil
	}
	if value := endpoint.constructionCallable; value != nil {
		result.WriteString(constructionCallableSourceFingerprint(value.source))
		result.WriteString(fmt.Sprintf("|descriptor-construction-callable:%t", value.pending))
		if value.source != nil {
			result.WriteString(fmt.Sprintf(":%p", value.source.generation))
		}
		for _, capture := range value.captures {
			alternatives := descriptorFingerprintAlternatives(capture.alternatives, result)
			result.WriteString(fmt.Sprintf("|descriptor-construction-capture:%#v:%#v:%t:%#v", capture.role, capture.required, capture.pending, alternatives))
		}
		endpoint.constructionCallable = nil
	}
	if value := endpoint.moduleConstruction; value != nil {
		result.WriteString(fmt.Sprintf("|module-construction:%t", value.pending))
		if source := value.source; source != nil {
			result.WriteString(fmt.Sprintf("|descriptor-local-construction:%p:%#v", source.localOwner, source.creationEffects))
			result.WriteString(constructionCallableSourceFingerprint(source.scalarCallable))
			if source.scalar != nil {
				scalar := descriptorFingerprintEndpoint(*source.scalar, result)
				result.WriteString(fmt.Sprintf("|descriptor-construction-scalar:%#v", scalar))
			}
			result.WriteString(fmt.Sprintf(":%#v:%p:%p:%p:%p:%t", source.request, source.binding, source.initializer, source.module, source.generation, source.unsupported))
			for _, field := range source.fields {
				result.WriteString(constructionCallableSourceFingerprint(field.callable))
				result.WriteString(fmt.Sprintf("|module-field:%p:%p:%q:%d:%#v", field.property, field.operand, field.name, field.ordinal, field.required))
				if field.literal != nil {
					literal := descriptorFingerprintEndpoint(*field.literal, result)
					result.WriteString(fmt.Sprintf(":%#v", literal))
				}
			}
		}
		for _, field := range value.fields {
			alternatives := descriptorFingerprintAlternatives(field.alternatives, result)
			result.WriteString(fmt.Sprintf("|module-field-data:%d:%t:%#v", field.ordinal, field.pending, alternatives))
		}
		endpoint.moduleConstruction = nil
	}
	if view := endpoint.descriptorView; view != nil {
		result.WriteString(fmt.Sprintf("|descriptor-view:%#v:%p:%#v:%#v", view.source, view.method, view.projection, view.delivery))
		for _, input := range view.inputs {
			descriptorFingerprintInput(input, result)
		}
		endpoint.descriptorView = nil
	}
	return endpoint
}

func descriptorFingerprintEndpoints(endpoints []sourceRelativeEndpoint, result *strings.Builder) []sourceRelativeEndpoint {
	out := endpoints
	copied := false
	for i, endpoint := range endpoints {
		if endpoint.nativePrimitive == nil && endpoint.descriptorView == nil && endpoint.moduleConstruction == nil && endpoint.constructionCallable == nil {
			continue
		}
		if !copied {
			out = append([]sourceRelativeEndpoint(nil), endpoints...)
			copied = true
		}
		out[i] = descriptorFingerprintEndpoint(endpoint, result)
	}
	return out
}

func descriptorFingerprintBindings(bindings []sourceRelativeBinding, result *strings.Builder) []sourceRelativeBinding {
	out := bindings
	copied := false
	for i, binding := range bindings {
		hasView := false
		for _, endpoint := range binding.sources {
			hasView = hasView || endpoint.nativePrimitive != nil || endpoint.descriptorView != nil || endpoint.moduleConstruction != nil || endpoint.constructionCallable != nil
		}
		for _, endpoint := range binding.pending {
			hasView = hasView || endpoint.nativePrimitive != nil || endpoint.descriptorView != nil || endpoint.moduleConstruction != nil || endpoint.constructionCallable != nil
		}
		if !hasView {
			continue
		}
		if !copied {
			out = append([]sourceRelativeBinding(nil), bindings...)
			copied = true
		}
		out[i].sources = descriptorFingerprintEndpoints(binding.sources, result)
		out[i].pending = descriptorFingerprintEndpoints(binding.pending, result)
	}
	return out
}

func descriptorFingerprintInvocation(invocation sourceRelativeInvocation, result *strings.Builder) sourceRelativeInvocation {
	invocation.receiver = descriptorFingerprintEndpoint(invocation.receiver, result)
	copied := false
	for i, actual := range invocation.actuals {
		if actual.endpoint.nativePrimitive == nil && actual.endpoint.descriptorView == nil && actual.endpoint.moduleConstruction == nil && actual.endpoint.constructionCallable == nil {
			continue
		}
		if !copied {
			invocation.actuals = append([]sourceRelativeActual(nil), invocation.actuals...)
			copied = true
		}
		invocation.actuals[i].endpoint = descriptorFingerprintEndpoint(actual.endpoint, result)
	}
	invocation.captures = descriptorFingerprintBindings(invocation.captures, result)
	return invocation
}

func descriptorFingerprintAlternatives(values []sourceStagedOperationAlternative, result *strings.Builder) []sourceStagedOperationAlternative {
	out := values
	copied := false
	for i, value := range values {
		if value.endpoint.nativePrimitive == nil && value.endpoint.descriptorView == nil && value.endpoint.moduleConstruction == nil && value.endpoint.constructionCallable == nil {
			continue
		}
		if !copied {
			out = append([]sourceStagedOperationAlternative(nil), values...)
			copied = true
		}
		out[i].endpoint = descriptorFingerprintEndpoint(value.endpoint, result)
	}
	return out
}

func descriptorFingerprintInput(input sourceDescriptorInputData, result *strings.Builder) {
	alternatives := descriptorFingerprintAlternatives(input.alternatives, result)
	result.WriteString(fmt.Sprintf("|descriptor-input:%#v:%t:%#v", input.request, input.construction, alternatives))
	if application := input.application; application != nil {
		invocation := descriptorFingerprintInvocation(application.association.invocation, result)
		result.WriteString(fmt.Sprintf("|descriptor-input-application:%#v:%p:%p:%p:%t:%#v:%#v", application.request, application.generation, application.association.inputs, application.association.sourceInputs, application.pending, invocation, application.readings))
		if application.prior != nil {
			descriptorFingerprintInput(*application.prior, result)
		}
	}
}
