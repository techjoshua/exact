package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestMutationOperationPlans(t *testing.T) {
	factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	owner, key, value := factory.NewIdentifier("owner"), factory.NewIdentifier("key"), factory.NewIdentifier("value")
	target := factory.NewElementAccessExpression(owner, nil, key, ast.NodeFlagsNone)
	for _, operator := range []ast.Kind{ast.KindEqualsToken, ast.KindPlusEqualsToken, ast.KindAmpersandAmpersandEqualsToken, ast.KindQuestionQuestionEqualsToken} {
		source := factory.NewBinaryExpression(nil, target, nil, factory.NewToken(operator), value)
		plan := planMutationOperation(source)
		if plan.target != target || plan.value != value || plan.operator != operator {
			t.Fatalf("lost assignment selections: %v", operator)
		}
		receiver, selected, computed := plan.reference()
		if receiver != owner || selected != key || !computed {
			t.Fatal("computed reference was not retained")
		}
		if operator != ast.KindEqualsToken {
			_, valid, logical := plan.compoundOperator()
			if !valid || logical != (operator != ast.KindPlusEqualsToken) {
				t.Fatal("lost short-circuit policy")
			}
		}
	}
	for _, candidate := range []struct {
		source *ast.Node
		kind   mutationOperationKind
	}{
		{factory.NewPrefixUnaryExpression(ast.KindPlusPlusToken, target), mutationPrefix},
		{factory.NewPostfixUnaryExpression(target, ast.KindMinusMinusToken), mutationPostfix},
		{factory.NewDeleteExpression(target), mutationDelete},
		{factory.NewCallExpression(target, nil, nil, factory.NewNodeList([]*ast.Node{value}), ast.NodeFlagsNone), mutationCall},
		{target, mutationRead},
	} {
		plan := planMutationOperation(candidate.source)
		if plan.kind != candidate.kind || plan.target != target {
			t.Fatal("lost operation or authored reference")
		}
	}
	// Unary coercion is a read, not a mutation of its operand.
	unary := factory.NewPrefixUnaryExpression(ast.KindMinusToken, target)
	if plan := planMutationOperation(unary); plan.kind != mutationRead || plan.target != unary {
		t.Fatal("coercion classified as a write")
	}
}

func TestMutationFactsSealBeforeEmission(t *testing.T) {
	var facts mutationSemanticFacts
	facts.initialize()
	value := ast.NewNodeFactory(ast.NodeFactoryHooks{}).NewIdentifier("Type")
	facts.capture(SourceSpan{Start: 1, Length: 2}, mutationTypeResult, value)
	record := facts.at(SourceSpan{Start: 1, Length: 2})
	record.result = nil
	if facts.at(SourceSpan{Start: 1, Length: 2}).result != value {
		t.Fatal("emitter changed captured facts")
	}
	facts.seal()
	defer func() {
		if recover() == nil {
			t.Fatal("accepted analysis writes during emission")
		}
	}()
	facts.capture(SourceSpan{Start: 1, Length: 2}, mutationTypeDestination, value)
}
