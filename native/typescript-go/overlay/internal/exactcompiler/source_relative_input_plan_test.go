package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A partial capture binding carries known, unknown and pending independently.
// Cloning must not let an edge rewrite another edge's donor projection.
func TestRelativeInputBindingOwnership(t *testing.T) {
	original := sourceRelativeBinding{unknown: true, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, projection: []string{"known"}}}, pending: []sourceRelativeEndpoint{{kind: relativeEndpointResult, projection: []string{"waiting"}}}}
	cloned := cloneSourceRelativeBinding(original)
	cloned.sources[0].projection[0] = "changed"
	cloned.pending[0].projection[0] = "changed"
	if !cloned.unknown || len(cloned.sources) != 1 || len(cloned.pending) != 1 || original.sources[0].projection[0] != "known" || original.pending[0].projection[0] != "waiting" {
		t.Fatal("partial binding lost distinction or independent ownership")
	}
	unresolved := relativeBindingFromEndpoint(sourceRelativeRole{}, sourceRelativeEndpoint{})
	if !unresolved.unknown || len(unresolved.sources) != 0 || len(unresolved.pending) != 0 {
		t.Fatal("unknown became covered empty or pending")
	}
}

// Formal positions exclude TypeScript's explicit this annotation. An omitted
// actual is undefined only in an authenticated ordinary argument vector.
func TestRelativeInputFormalSlots(t *testing.T) {
	source := parseNormalizationSource("/virtual/relative-slots.ts", `function invoke(this:object,first:unknown,second:unknown){}invoke({});`)
	var declaration, operation *ast.Node
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		if ast.IsCallExpression(node) {
			operation = node
		}
		return true
	})
	plan := planSourceRelativeInputs(sourceRelativeInvocation{declaration: declaration, operation: operation, actualsKnown: true, actuals: []sourceRelativeActual{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: operation}}}}, &sourceValueOwner{})
	if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 3 {
		t.Fatalf("plan: %+v", plan)
	}
	if plan.bindings[1].target.slot != 0 || plan.bindings[1].sources[0].expression != operation || plan.bindings[2].target.slot != 1 || plan.bindings[2].sources[0].kind != relativeEndpointUndefined {
		t.Fatal("explicit this consumed an actual or omission became unknown")
	}
}

// Unsupported default/rest inputs remain visible migration gaps. They cannot
// authorize the caller to retire the original binder and its eager work.
func TestRelativeInputUnmigratedInputs(t *testing.T) {
	for _, row := range []struct {
		source string
		gap    sourceRelativeInputGap
	}{
		{`function invoke(read=()=>1){}invoke();`, relativeInputsUnsupportedDefault},
		{`function invoke(...reads:unknown[]){}invoke();`, relativeInputsUnsupportedRest},
	} {
		source := parseNormalizationSource("/virtual/relative-gap.ts", row.source)
		var declaration, operation *ast.Node
		walkNode(source.AsNode(), func(node *ast.Node) bool {
			if ast.IsFunctionDeclaration(node) {
				declaration = node
			}
			if ast.IsCallExpression(node) {
				operation = node
			}
			return true
		})
		plan := planSourceRelativeInputs(sourceRelativeInvocation{declaration: declaration, operation: operation, actualsKnown: true}, &sourceValueOwner{})
		if plan.unsupported != row.gap {
			t.Fatalf("gap=%v want %v", plan.unsupported, row.gap)
		}
	}
}

// A withheld apply vector is required unresolved input, never proof of zero
// arguments. Already described capture donors survive that migration gap.
func TestRelativeInputUnknownVector(t *testing.T) {
	source := parseNormalizationSource("/virtual/relative-vector.ts", `const captured=1;function invoke(input:unknown){}invoke();`)
	var declaration, operation, binding *ast.Node
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		if ast.IsCallExpression(node) {
			operation = node
		}
		if ast.IsVariableDeclaration(node) {
			binding = node
		}
		return true
	})
	invocation := sourceRelativeInvocation{declaration: declaration, operation: operation, captures: []sourceRelativeBinding{{target: sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: binding}, unknown: true, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, expression: binding}}, pending: []sourceRelativeEndpoint{{kind: relativeEndpointResult, producer: operation}}}}}
	plan := planSourceRelativeInputs(invocation, &sourceValueOwner{})
	if plan.unsupported != relativeInputsUnsupportedActual || len(plan.bindings) != 1 || !plan.bindings[0].unknown || len(plan.bindings[0].sources) != 1 || len(plan.bindings[0].pending) != 1 {
		t.Fatalf("unknown vector lost capture or became missing: %+v", plan)
	}
	invocation.actualsKnown = true
	plan = planSourceRelativeInputs(invocation, &sourceValueOwner{})
	if plan.unsupported != relativeInputsSupported || plan.bindings[2].sources[0].kind != relativeEndpointUndefined {
		t.Fatalf("known empty vector lost omission: %+v", plan)
	}
}

// A requested lexical binding identifies required work without delivering it.
// Its empty donor slice must not become a supported empty capture substitution.
func TestRelativeInputUnclassifiedCapture(t *testing.T) {
	source := parseNormalizationSource("/virtual/relative-unclassified-capture.ts", `const captured=1;function invoke(){}invoke();`)
	var declaration, operation, binding *ast.Node
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		if ast.IsCallExpression(node) {
			operation = node
		}
		if ast.IsVariableDeclaration(node) {
			binding = node
		}
		return true
	})
	request := sourceRelativeInvocation{declaration: declaration, operation: operation, actualsKnown: true, captures: []sourceRelativeBinding{{target: sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: binding}}}}
	plan := planSourceRelativeInputs(request, &sourceValueOwner{})
	if plan.unsupported != relativeInputsUnsupportedCapture || !plan.bindings[0].unknown || len(plan.bindings[0].pending) != 0 {
		t.Fatal("capture request became a covered empty substitution", plan)
	}
	request.captures[0].sources = []sourceRelativeEndpoint{{kind: relativeEndpointUndefined}}
	plan = planSourceRelativeInputs(request, &sourceValueOwner{})
	if plan.unsupported != relativeInputsSupported || plan.bindings[0].unknown || len(plan.bindings[0].sources) != 1 {
		t.Fatal("explicit undefined capture lost its represented input", plan)
	}
}
