package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceRelativeDemandKind separates the consumer's required fact from normal
// value precision. An effects-only edge cannot fulfill either stronger demand.
type sourceRelativeDemandKind uint8

const (
	relativeDemandEffects sourceRelativeDemandKind = iota
	relativeDemandDirectExposure
	relativeDemandExactProof
)

// sourceRelativeInvokedInput is issued by an actual source Call through an input
// role. It is not issued by storage, argument presence or callable creation. The
// initial domain is empty projection/zero actuals. Richer roles retain their
// owning unmigrated operation until the corresponding transfer is represented.
type sourceRelativeInvokedInput struct {
	kind   sourceRelativeDemandKind
	role   sourceRelativeRole
	origin *ast.Node
	cut    sourceRelativeCut
}

// sourceRelativeRole identifies an input of a declaration in one checker
// generation. Formal slots are zero based and exclude an authored TypeScript
// this parameter. Capture bindings are declaration
// nodes, never values from an application caller. Receiver lexicalness preserves
// an arrow's enclosing receiver rather than manufacturing an ordinary this.
type sourceRelativeRole struct {
	kind        sourceRelativeRoleKind
	declaration *ast.Node
	slot        int
	binding     *ast.Node
	lexical     bool
}

type sourceRelativeRoleKind uint8

const (
	relativeRoleUnknown sourceRelativeRoleKind = iota
	relativeRoleFormal
	relativeRoleReceiver
	relativeRoleCapture
)

// sourceRelativeCut describes the original source observation. It is not a
// borrowed acquisition lease, execution receipt or authority to restore a query
// at these nodes. Exact consumers still authenticate their own live observation.
type sourceRelativeCut struct {
	operation, use                             *ast.Node
	reading, initializing, returning, invoking *ast.Node
}

// sourceRelativeEndpoint describes a source relationship, not a current value.
// A result names its original producer and optional Get occurrence. A rest slot
// keeps its ordered position. Creation/return endpoints distinguish callable
// associations without retaining a scope, frame, creator map or query callback.
// Published projections and endpoint records are immutable within a generation.
type sourceRelativeEndpoint struct {
	nativePrimitive      *sourceNativePrimitiveResult         // Conditional primitive SOURCE result; no value/key identity.
	constructionCallable *sourceConstructionCallableValue     // Conditional source closure/capture relation.
	moduleConstruction   *sourceStagedModuleConstructionValue // Typed conditional source/field DATA, never a raw object.
	descriptorView       *sourceNativeDescriptorView          // Explicit native result projection; no ordinary value authority.
	kind                 sourceRelativeEndpointKind
	role                 sourceRelativeRole
	expression           *ast.Node
	producer, get        *ast.Node
	creation, returning  *ast.Node
	projection           []string
	frameworkView        *sourceFrameworkStorageView // Explicit framework projection; never a raw/native endpoint.
	restPosition         int
	cut                  sourceRelativeCut
}

type sourceRelativeEndpointKind uint8

const (
	relativeEndpointUnknown sourceRelativeEndpointKind = iota
	relativeEndpointRole
	relativeEndpointExpression
	relativeEndpointResult
	relativeEndpointUndefined
	relativeEndpointRestSlot
	relativeEndpointFrameworkView
	relativeEndpointDescriptorView
	relativeEndpointModuleConstruction
	relativeEndpointConstructionCallable
	relativeEndpointNativePrimitive
)

// sourceRelativeActual retains original argument order even when a spread is
// expanded into represented rest slots. ordinal is the source argument index,
// and restPosition is the expanded slot index only when spread is true. This
// sequence must never be compared as an unordered donor set.
type sourceRelativeActual struct {
	expression   *ast.Node
	endpoint     sourceRelativeEndpoint
	ordinal      int
	spread       bool
	restPosition int
}

// sourceRelativeBinding transfers requirements into a declaration role. Known
// source relationships survive independently of unknown and pending producers.
// A formal role is a represented relative requirement, not a covered-empty value.
// Pending endpoints must be delivered or explicitly disposed by effect work
// before final publication. Unknown alone does not complete that work.
type sourceRelativeBinding struct {
	target  sourceRelativeRole
	sources []sourceRelativeEndpoint
	unknown bool
	pending []sourceRelativeEndpoint
}

// sourceRelativeInvocation is the descriptive input to the existing binder's
// staged adapter. Original callee/Get selection and eager argument effects remain
// owned by their source operations. The adapter may not infer normal completion,
// exact output, callable identity, NoWrites or capture/secret policy permission.
// sourceRelativeInputKind separates a SOURCE getter binder from an ordinary
// invocation even when an implicit native Get uses its enclosing Call as the
// operation AST. It supplies descriptive binding identity, never execution.
type sourceRelativeInputKind uint8

const (
	relativeInputInvocation sourceRelativeInputKind = iota
	relativeInputSourceGetter
)

type sourceRelativeInvocation struct {
	inputKind      sourceRelativeInputKind
	declaration    *ast.Node
	operation, use *ast.Node
	cut            sourceRelativeCut
	receiver       sourceRelativeEndpoint
	// actualsKnown authenticates the argument vector's extent. An empty slice
	// without this premise can be an unresolved apply vector, not missing inputs.
	// Defaults still require their original binder-owned activation disposition.
	actualsKnown bool
	actuals      []sourceRelativeActual
	captures     []sourceRelativeBinding
}

// sourceRelativeInputPlan is the adapter-to-effect-edge handoff. A supported
// plan represents every required input role, including independent unknown and
// pending contributions. An unsupported plan cannot retire legacy acquisition.
// These are input-transfer facts, never complete callee/Get/effect coverage.
type sourceRelativeInputPlan struct {
	bindings    []sourceRelativeBinding
	unsupported sourceRelativeInputGap
}

type sourceRelativeInputGap uint8

const (
	relativeInputsSupported sourceRelativeInputGap = iota
	relativeInputsInvalidOwner
	relativeInputsUnsupportedActual
	relativeInputsUnsupportedReceiver
	relativeInputsUnsupportedDefault
	relativeInputsUnsupportedRest
	relativeInputsUnsupportedCapture
)

// sourceRelativeInputPlanner is the M03 adapter seam. The central effect owner
// supplies a descriptive invocation and the generation-owned static value owner.
// The adapter lives in source_relative_input_plan.go and returns detached role
// substitutions. It must not acquire current query results or schedule execution.
type sourceRelativeInputPlanner func(sourceRelativeInvocation, *sourceValueOwner) sourceRelativeInputPlan

// sourceRelativeDefaultInput describes the original binder's activation decision,
// not evaluation or the value returned by an initializer. An absent defaults-map
// entry is unclassified. A present nil binding proves bypass, conditional admits
// MAY work, and a present nonconditional binding requires initializer effects.
type sourceRelativeDefaultInput struct {
	formal      sourceRelativeRole
	initializer *ast.Node
	selection   sourceRelativeDefaultSelection
	cut         sourceRelativeCut
}

type sourceRelativeDefaultSelection uint8

const (
	relativeDefaultUnclassified sourceRelativeDefaultSelection = iota
	relativeDefaultBypassed
	relativeDefaultRequired
	relativeDefaultConditional
)

// sourceRelativeRestInput preserves an explicitly represented ordered rest
// container. Empty slots with unknownTail false describe represented empty rest,
// not an absent binding. Unknown tails never manufacture missing undefined slots.
type sourceRelativeRestInput struct {
	formal      sourceRelativeRole
	slots       []sourceRelativeRestSlot
	unknownTail bool
	cut         sourceRelativeCut
}

type sourceRelativeRestSlot struct {
	position        int
	unknownPosition bool // source order remains known after an unknown spread, not its exact index
	binding         sourceRelativeBinding
}

// sourceRelativeBoundInputs is detached only by the original synchronous binder
// consumer while sourceValueInputs belongs to that invocation. The M03 adapter
// may inspect the current query/inputs during this callback, never store them.
// Slots, default decisions and captures are descriptive publication inputs, not
// rights to reinstall the original cut or execute an initializer later. Pending
// endpoints must originate in central registered producers, never opaque flags.
// The central consumer validates declaration/operation/use and source ownership
// before transferring these records into an effect edge.
type sourceRelativeBoundInputs struct {
	inputKind                   sourceRelativeInputKind
	declaration, operation, use *ast.Node
	cut                         sourceRelativeCut
	bindings                    []sourceRelativeBinding
	defaults                    []sourceRelativeDefaultInput
	rest                        []sourceRelativeRestInput
	unsupported                 sourceRelativeInputGap
}

// Invocation identity is shared by source transfer consumers and the original
// binder issuer. Equal endpoint descriptions do not supply issuer authority.
func sameSourceRelativeInvocation(a, b sourceRelativeInvocation) bool {
	return a.declaration == b.declaration && a.operation == b.operation && a.use == b.use && a.cut == b.cut && sameSourceRelativeVector(a, b)
}

func sameSourceRelativeVector(a, b sourceRelativeInvocation) bool {
	if a.inputKind != b.inputKind || a.actualsKnown != b.actualsKnown || !sameOperationEndpoint(a.receiver, b.receiver) || len(a.actuals) != len(b.actuals) || len(a.captures) != len(b.captures) {
		return false
	}
	for i, actual := range a.actuals {
		other := b.actuals[i]
		if actual.expression != other.expression || actual.ordinal != other.ordinal || actual.spread != other.spread || actual.restPosition != other.restPosition || !sameOperationEndpoint(actual.endpoint, other.endpoint) {
			return false
		}
	}
	for i, binding := range a.captures {
		other := b.captures[i]
		if binding.target != other.target || binding.unknown != other.unknown || len(binding.sources) != len(other.sources) || len(binding.pending) != len(other.pending) {
			return false
		}
		for j, endpoint := range binding.sources {
			if !sameOperationEndpoint(endpoint, other.sources[j]) {
				return false
			}
		}
		for j, endpoint := range binding.pending {
			if !sameOperationEndpoint(endpoint, other.pending[j]) {
				return false
			}
		}
	}
	return true
}

// stagedDeclarationCallEdge keeps ordinary Call IDs stable. An implicit
// HasInstance occurrence may invoke both a getter and several selected methods,
// so each original body owns its own canonical membership at that Binary.
// Original assignment setters likewise retain distinct conditional body edges.
func stagedDeclarationCallEdge(caller string, invocation sourceRelativeInvocation) string {
	operation := invocation.operation
	if invocation.inputKind == relativeInputSourceGetter && operation != nil && invocation.declaration != nil {
		body := invocation.declaration
		return fmt.Sprintf("%s:source-get-body:%s:%d:%d:%d", caller, ast.GetSourceFileOfNode(body).FileName(), body.Pos(), body.End(), operation.Pos())
	}
	if operation != nil && stagedResultExpression(operation) && !ast.IsCallExpression(operation) && invocation.declaration != nil && ast.IsGetAccessorDeclaration(invocation.declaration) {
		body := invocation.declaration
		return fmt.Sprintf("%s:get-body:%s:%d:%d:%d", caller, ast.GetSourceFileOfNode(body).FileName(), body.Pos(), body.End(), operation.Pos())
	}
	if operation != nil && ast.IsBinaryExpression(operation) && operation.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword && invocation.declaration != nil {
		declaration := invocation.declaration
		return fmt.Sprintf("%s:has-instance-body:%s:%d:%d:%d", caller, ast.GetSourceFileOfNode(declaration).FileName(), declaration.Pos(), declaration.End(), operation.Pos())
	}
	if operation != nil && plainStagedAssignment(operation) && invocation.declaration != nil && ast.IsSetAccessorDeclaration(invocation.declaration) {
		declaration := invocation.declaration
		return fmt.Sprintf("%s:assignment-setter:%s:%d:%d:%d", caller, ast.GetSourceFileOfNode(declaration).FileName(), declaration.Pos(), declaration.End(), operation.Pos())
	}
	return fmt.Sprintf("%s:call:%d", caller, operation.Pos())
}
