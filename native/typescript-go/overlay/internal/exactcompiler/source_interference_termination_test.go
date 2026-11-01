package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"strings"
	"testing"
)

// Reference traces describe a set of source obligations. Joining an already
// forwarded path must not double its storage or remove an independent reference.
func TestForwardingTraceFiniteJoin(t *testing.T) {
	a, b := &ast.Node{}, &ast.Node{}
	query := sourceValueQuery{owner: newSourceValueOwner(nil)}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	path := []*ast.Node{a, b, a}
	for range 16 {
		path = query.forwardingTrace(&result, path, path, []*ast.Node{b})
	}
	if !slices.Equal(path, []*ast.Node{a, b}) {
		t.Fatalf("lost finite first-seen obligations: %d", len(path))
	}
	if !result.opaque || !result.valueIncomplete {
		t.Fatal("trace join erased uncertainty")
	}
	if query.owner.work == 0 {
		t.Fatal("trace traversal was not charged")
	}
}

// Interference has only an opacity output. It cannot acquire another body's
// values or effects once that verdict is known, or retain its borrowed scopes.
func TestOpaqueReceiverInterferenceIsSettled(t *testing.T) {
	query := sourceValueQuery{}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	prior := &sourceReceiverInspection{}
	query.receiverInspection = prior
	query.receiverInterferenceAtInputs(nil, nil, sourceValue{}, nil, &result, nil, nil)
	if query.receiverInspection != prior || !result.opaque || !result.valueIncomplete {
		t.Fatal("settled interference changed independent state")
	}
}

// Nested logical predicates must not acquire each left subtree twice. The
// unknown parameter keeps both authored routes possible without fake purity.
func TestLogicalPredicateWorkIsFinite(t *testing.T) {
	source := `export function choose(value:boolean){return ` + strings.Repeat("value||", 18) + `value}export const stable=1;`
	request := Request{Kind: "analyze", ID: "/virtual/logical-predicate-work.ts", Source: source, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	var expression *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsReturnStatement(node) {
			expression = node.AsReturnStatement().Expression
		}
		return true
	})
	owner := newSourceValueOwner(generation.checker)
	query := sourceValueQuery{owner: owner, active: make(map[*ast.Node]bool)}
	known, _, _ := query.branchDecision(expression, nil)
	if known {
		t.Fatal("unknown parameter became a selected branch")
	}
	if owner.work > 2000 {
		t.Fatalf("predicate repeated its source subtrees: %d", owner.work)
	}
	session := NewSession()
	for _, target := range []Target{TargetClient, TargetServer} {
		response := session.Execute(Request{Kind: "compile", ID: request.ID, Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !strings.Contains(response.Code, "function choose") {
			t.Fatalf("lost emitted logical function: %s %#v", response.Error, response.Diagnostics)
		}
	}
}
