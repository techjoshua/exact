package exactcompiler

import (
	"fmt"
	"strings"
)

// Normalize owned descriptor/source payloads before formatting. Cloning these
// descriptions must not manufacture semantic progress from fresh Go pointers.
func originalGetMutationSourceFingerprint(s *sourceOriginalGetMutationSource, out *strings.Builder) {
	if s == nil {
		return
	}
	copy := *s
	copy.record = nil
	copy.nativeTarget = nil
	copy.nativeCallee = nil
	copy.nativeField = nil
	copy.intrinsicField = nil
	out.WriteString(fmt.Sprintf("|original-get-mutation:%#v", copy))
	if s.intrinsicField != nil {
		primitive := *s.intrinsicField
		primitive.header, primitive.installation = nil, nil
		out.WriteString(fmt.Sprintf("|intrinsic-field:%#v:%#v:%#v", primitive, *s.intrinsicField.header, *s.intrinsicField.installation))
	}
	if s.nativeField != nil {
		out.WriteString(fmt.Sprintf("|native-field:%#v", *s.nativeField))
	}
	if s.nativeCallee != nil {
		out.WriteString(fmt.Sprintf("|native-callee:%#v", *s.nativeCallee))
	}
	if s.nativeTarget != nil {
		out.WriteString(fmt.Sprintf("|selected-target:%#v", *s.nativeTarget))
	}
	if s.record != nil {
		record := *s.record
		view := descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &record.view}, out)
		record.view = sourceNativeDescriptorView{}
		out.WriteString(fmt.Sprintf("|record:%#v:%#v", record, view))
	}
}

func originalGetMutationInterestFingerprint(i *sourceOriginalGetMutationInterest, out *strings.Builder) {
	if i == nil {
		return
	}
	copy := *i
	copy.nativeCallee = nil
	copy.nativeField = nil
	copy.descriptor = nil
	copy.source = nil
	out.WriteString(fmt.Sprintf("|original-get-interest:%#v", copy))
	if i.nativeField != nil {
		out.WriteString(fmt.Sprintf("|native-field-interest:%#v", *i.nativeField))
	}
	if i.nativeCallee != nil {
		out.WriteString(fmt.Sprintf("|native-callee-interest:%#v", *i.nativeCallee))
	}
	if i.descriptor != nil {
		view := sourceNativeDescriptorView{source: *i.descriptor, method: i.method}
		descriptorFingerprintEndpoint(sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, descriptorView: &view}, out)
	}
	originalGetMutationSourceFingerprint(i.source, out)
}
