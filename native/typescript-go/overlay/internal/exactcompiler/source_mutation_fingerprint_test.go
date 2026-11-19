package exactcompiler

import (
	"fmt"
	"strings"
)

func installedMutationRHSFingerprint(s *sourceInstalledMutationRHS, b *strings.Builder) {
	if s == nil {
		return
	}
	b.WriteString(fmt.Sprintf("|installed-mutation-rhs:%#v:%#v:%p:%p:%t:%d:%#v:%#v", s.request, s.parent, s.generation, s.template.write, s.direct, s.bound.unsupported, s.inputRequired, s.bound.defaults))
	b.WriteString(fmt.Sprintf(":input-kind:%d:%d", s.binding.request.inputKind, s.bound.inputKind))
	descriptorFingerprintEndpoint(s.template.value, b)
	for _, binding := range s.bound.bindings {
		b.WriteString(fmt.Sprintf(":binding:%#v:%t", binding.target, binding.unknown))
		descriptorFingerprintEndpoints(binding.sources, b)
		descriptorFingerprintEndpoints(binding.pending, b)
	}
	for _, rest := range s.bound.rest {
		b.WriteString(fmt.Sprintf(":rest:%#v:%t", rest.formal, rest.unknownTail))
		for _, slot := range rest.slots {
			b.WriteString(fmt.Sprintf(":slot:%d:%t:%t", slot.position, slot.unknownPosition, slot.binding.unknown))
			descriptorFingerprintEndpoints(slot.binding.sources, b)
			descriptorFingerprintEndpoints(slot.binding.pending, b)
		}
	}
	descriptorFingerprintAlternatives(s.projection.delta.exposures, b)
	descriptorFingerprintEndpoints(s.projection.pending, b)
	if s.native != nil {
		view := sourceNativeDescriptorView{source: *s.native, inputs: s.nativeInputs}
		descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &view}, b)
	}
}

func fieldMutationDataFingerprint(s *sourceFieldMutationData, b *strings.Builder) {
	if s == nil {
		return
	}
	if s.installation != nil {
		i := s.installation
		b.WriteString(fmt.Sprintf("|installation-mutation:%#v:%#v:%p:%d:%p", i.request, i.algorithm, i.method, i.kind, i.generation))
		descriptorFingerprintEndpoint(i.installation.target, b)
		descriptorFingerprintEndpoint(i.installation.key, b)
		descriptorFingerprintEndpoint(i.installation.descriptor, b)
	}
	originalGetMutationInterestFingerprint(s.getInterest, b)
	originalGetMutationSourceFingerprint(s.getSource, b)
	b.WriteString(fmt.Sprintf("|field-mutation-data:%#v:%#v:%p:%#v", s.request, s.field, s.generation, s.externalSource))
	descriptorFingerprintEndpoint(s.receiver, b)
	if s.external != nil {
		b.WriteString(fmt.Sprintf(":external:%#v", *s.external))
	}
	if s.native != nil {
		native := *s.native
		native.descriptorRead = nil
		b.WriteString(fmt.Sprintf(":native-origin:%#v", native))
		view := sourceNativeDescriptorView{source: *s.native.descriptorRead, method: s.native.method}
		descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &view}, b)
	}
}
