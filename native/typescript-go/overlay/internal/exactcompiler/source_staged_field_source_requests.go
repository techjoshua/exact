package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedFieldSourceRequests are the two independent source coverage
// producers required by one original Has/Get. Only the central issuer registers
// these keys. Constructing equal metadata is not admission or source closure.
type sourceStagedFieldSourceRequests struct {
	ownWriters, prototype sourceStagedOperationRequest
}

// sourceStagedFieldDiscoverySource borrows an original generation index during
// synchronous source discovery only. The selecting owner supplies the complete
// dependency population separately. Neither indexes nor their maps enter facts.
type sourceStagedFieldDiscoverySource struct {
	source *ast.SourceFile
	index  sourceValueIndex
}

// Mapping is performed by the original semantic source owner. An operation in a
// deferred region is a passive candidate, not a newly executed body. Unmapped
// source/module/summary relationships leave local extraction pending. Explicit
// runtime unknown is a residual supplied by this owner, never an index flag.
type sourceStagedFieldSourceMapper func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool)
type sourceStagedFieldSourcePublisher func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool

// sourceStagedFieldValueBaseline is the original value owner's explicit source
// premise for one issued projection role. False authorizes no prefix. True may
// retain an incomplete prefix, using delta.extracted independently from child
// closure. The value emitter cannot construct this premise from an empty index,
// Effects readiness or missing acquired values. Callbacks are synchronous loans.
type sourceStagedFieldValueBaseline func(request sourceStagedOperationRequest) (sourceStagedOperationDelta, bool)

// fieldSourceRequests reserves a finite domain: two source roles for each of
// the six fixed descriptor fields. These are semantic role names, not growing
// recursion paths or value/context cache keys. The source emitter receives the
// registered requests and cannot invent selectors. Both keep the original
// issuing consumer, operation, use, cut and input association.
func fieldSourceRequests(parent sourceStagedOperationRequest) (sourceStagedFieldSourceRequests, bool) {
	if (parent.producer.kind != relativeDemandEffects && parent.producer.kind != relativeDemandDirectExposure) || parent.producer.selector.occurrence == nil || stagedDescriptorFieldIndex(parent.producer.selector.field) < 0 {
		return sourceStagedFieldSourceRequests{}, false
	}
	writers, prototype := parent, parent
	writers.producer.selector.field = "field-source:" + parent.producer.selector.field + ":own-writers"
	prototype.producer.selector.field = "field-source:" + parent.producer.selector.field + ":prototype"
	return sourceStagedFieldSourceRequests{ownWriters: writers, prototype: prototype}, true
}

// fieldSourceParent recognizes only the twelve central-issued roles. It recovers
// the original field request without accepting synthesized recursive paths.
func fieldSourceParent(request sourceStagedOperationRequest) (sourceStagedOperationRequest, bool) {
	for _, field := range reflectiveDescriptorKeys {
		parent := request
		parent.producer.selector.field = field
		roles, valid := fieldSourceRequests(parent)
		if valid && (sameOperationRequest(request, roles.ownWriters) || sameOperationRequest(request, roles.prototype)) {
			return parent, true
		}
	}
	return sourceStagedOperationRequest{}, false
}

// A different descriptor role needs its own complete original request, including
// entry association and subscriber edge. Editing only a field name can alias
// entries or issue a dependency to another role's consumer.
func nativeDescriptorFieldRequest(source *sourceStagedNativeGetSource, field string) sourceStagedOperationRequest {
	if source.descriptorEntry != nil {
		return stagedMapEntryFieldRequest(source.descriptorEntry, field)
	}
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: field}
	return request
}
