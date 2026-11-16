package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func relativeTransferDeclaration() *ast.Node {
	source := parseNormalizationSource("/virtual/relative-transfer.ts", `function invoke(){}`)
	var declaration *ast.Node
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declaration = node
		}
		return true
	})
	return declaration
}

// Receiver slot zero and formal slot zero have different typed identities.
// An eager default requirement cannot activate its returned callback here.
func TestRelativeInvokedRoleSelection(t *testing.T) {
	declaration := relativeTransferDeclaration()
	formal := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration}
	receiver := sourceRelativeRole{kind: relativeRoleReceiver, declaration: declaration}
	bound := sourceRelativeBoundInputs{declaration: declaration, bindings: []sourceRelativeBinding{
		{target: receiver, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, projection: []string{"receiver"}}}},
		{target: formal, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, projection: []string{"formal"}}}, unknown: true, pending: []sourceRelativeEndpoint{{kind: relativeEndpointResult, projection: []string{"pending"}}}},
	}, defaults: []sourceRelativeDefaultInput{{formal: formal, initializer: declaration, selection: relativeDefaultRequired}}}
	plan := substituteSourceRelativeInvokedInput(bound, formal, []string{"read"})
	if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 || !plan.bindings[0].unknown || len(plan.bindings[0].sources) != 1 || len(plan.bindings[0].pending) != 1 || plan.bindings[0].sources[0].projection[0] != "formal" {
		t.Fatal("invoked role activated a sibling or lost partial result", plan)
	}
	plan.bindings[0].sources[0].projection[0] = "changed"
	plan.bindings[0].pending[0].projection[0] = "changed"
	if bound.bindings[1].sources[0].projection[0] != "formal" || bound.bindings[1].pending[0].projection[0] != "pending" {
		t.Fatal("transfer mutated another edge")
	}
	missing := sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: declaration}
	plan = substituteSourceRelativeInvokedInput(bound, missing, nil)
	if plan.unsupported != relativeInputsUnsupportedCapture || !plan.bindings[0].unknown || len(plan.bindings[0].pending) != 0 {
		t.Fatal("missing capture fabricated pending or covered empty")
	}
	bound.bindings = append(bound.bindings, sourceRelativeBinding{target: missing})
	plan = substituteSourceRelativeInvokedInput(bound, missing, nil)
	if plan.unsupported != relativeInputsUnsupportedCapture || !plan.bindings[0].unknown || len(plan.bindings[0].pending) != 0 {
		t.Fatal("unclassified capture delivery became covered empty")
	}

}

// A spread can have zero elements, so every later authored donor can reach the
// first uncertain position. Earlier exact slots do not invoke those siblings.
func TestRelativeInvokedRestProjection(t *testing.T) {
	declaration := relativeTransferDeclaration()
	role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration}
	donor := func(name string) sourceRelativeBinding {
		return sourceRelativeBinding{target: role, sources: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, projection: []string{name}}}}
	}
	rest := sourceRelativeRestInput{formal: role, unknownTail: true, slots: []sourceRelativeRestSlot{
		{position: 0, binding: donor("prefix")},
		{position: 1, unknownPosition: true, binding: sourceRelativeBinding{target: role, unknown: true}},
		{position: 2, unknownPosition: true, binding: donor("later")},
	}}
	bound := sourceRelativeBoundInputs{declaration: declaration, rest: []sourceRelativeRestInput{rest}}
	for _, row := range []struct {
		path    []string
		unknown bool
		name    string
		gap     sourceRelativeInputGap
	}{
		{[]string{"0", "read"}, false, "prefix", relativeInputsSupported},
		{[]string{"1"}, true, "later", relativeInputsSupported},
		{[]string{"3"}, true, "later", relativeInputsSupported},
		{nil, true, "", relativeInputsUnsupportedRest},
		{[]string{"length"}, true, "", relativeInputsUnsupportedRest},
	} {
		plan := substituteSourceRelativeInvokedInput(bound, role, row.path)
		if plan.unsupported != row.gap || len(plan.bindings) != 1 || plan.bindings[0].unknown != row.unknown {
			t.Fatalf("path %v: %+v", row.path, plan)
		}
		binding := plan.bindings[0]
		if row.name == "" {
			if len(binding.sources) != 0 {
				t.Fatal("whole rest activated stored callbacks")
			}
			continue
		}
		if len(binding.sources) != 1 || binding.sources[0].projection[0] != row.name {
			t.Fatalf("path %v selected siblings: %+v", row.path, binding)
		}
	}
	bound.rest[0] = sourceRelativeRestInput{formal: role}
	plan := substituteSourceRelativeInvokedInput(bound, role, []string{"0"})
	if plan.bindings[0].unknown || plan.bindings[0].sources[0].kind != relativeEndpointUndefined {
		t.Fatal("represented empty rest became unknown")
	}
	bound.rest[0].unknownTail = true
	plan = substituteSourceRelativeInvokedInput(bound, role, []string{"0"})
	if !plan.bindings[0].unknown || len(plan.bindings[0].sources) != 0 {
		t.Fatal("unknown vector became omitted undefined")
	}
}

func TestRelativeInvokedWrittenCaptureRemainsUnmigrated(t *testing.T) {
	declaration := relativeTransferDeclaration()
	role := sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: declaration}
	bound := sourceRelativeBoundInputs{declaration: declaration, unsupported: relativeInputsUnsupportedCapture, bindings: []sourceRelativeBinding{{target: role, sources: []sourceRelativeEndpoint{{kind: relativeEndpointRole, role: role, creation: declaration}}}}}
	plan := substituteSourceRelativeInvokedInput(bound, role, nil)
	if plan.unsupported != relativeInputsUnsupportedCapture || plan.bindings[0].sources[0].kind != relativeEndpointRole || plan.bindings[0].sources[0].creation != declaration || len(plan.bindings[0].pending) != 0 {
		t.Fatal("written capture promoted to settled or pending")
	}
}
