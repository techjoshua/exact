package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeEagerInputs is a detached proof domain for the original
// selected algorithm's ordered eager input phase. Source language construction
// owns creation/coercion effects, independently of descriptor-field conversion.
// It carries no acquired values, invocation frame or normal-completion rights.
type sourceStagedNativeEagerInputs struct {
	request        sourceStagedOperationRequest
	descriptorData sourceStagedOperationRequest // Original immutable descriptor read, not a literal replacement.
	actuals        []sourceRelativeEndpoint
	operations     []sourceStagedNativeEagerOperation // Original native input Calls, not selected values or ready producers.
	calls          []sourceStagedNativeEagerCall      // Descriptive dependencies, never delivered binder authority.
	targetPending  bool                               // Target evaluation requires its separate original-source producer.
}

// sourceStagedNativeEagerCall preserves the original argument/property evaluation
// position and selected declaration relationship. The central issuing owner must
// still obtain the original Call's real B envelope and subscribe to its summary.
// Its result/exposure is independent and no returned value is acquired here.
type sourceStagedNativeEagerCall struct {
	actual     int
	property   *ast.Node
	invocation sourceRelativeInvocation
}

// sourceStagedNativeEagerOperation preserves a native input's original argument
// and literal property position. The original Get/algorithm owner must still
// authenticate it and register its Effects dependencies. No body, return value,
// target identity or completion authority is carried by this description.
type sourceStagedNativeEagerOperation struct {
	actual    int
	property  *ast.Node
	operation *ast.Node
}

func nativeRootDebtRequest(source *sourceStagedNativeGetSource, role string) sourceStagedOperationRequest {
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: role}
	request.edge += ":" + role
	return request
}
