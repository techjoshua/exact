package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"path/filepath"
)

// timeMemberIdentity selects a finite key without evaluating it. Bound pipeline callers supply
// a checker. The nil-checker form is limited to parsed, literal-only sensitivity unit tests.
func timeMemberIdentity(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, string) {
	expression = unwrapTimeStaticExpression(expression)
	if expression == nil {
		return nil, ""
	}
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		return member.Expression, member.Name().Text()
	}
	if ast.IsElementAccessExpression(expression) {
		member := expression.AsElementAccessExpression()
		key := unwrapTimeStaticExpression(member.ArgumentExpression)
		if key != nil && (ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key)) {
			return member.Expression, key.Text()
		}
	}
	if typeChecker != nil && !ast.NodeIsSynthesized(expression) && expression.Parent != nil {
		return restrictedInvocationMember(expression, typeChecker)
	}
	return nil, ""
}

// timeNativeGlobalValue proves the runtime value rather than borrowing a native-looking name.
// Parsed sensitivity tests can omit a checker, while every analysis/lowering pipeline supplies one.
func timeNativeGlobalValue(expression *ast.Node, name string, typeChecker *checker.Checker) bool {
	expression = unwrapTimeStaticExpression(expression)
	if expression == nil || !ast.IsIdentifier(expression) || expression.Text() != name {
		return false
	}
	if typeChecker == nil {
		return true
	}
	if name == "Temporal" {
		return intlNativeNamespaceValue(expression, typeChecker)
	}
	return standardLibraryValue(expression, typeChecker)
}

// timeTemporalClockOperation shares the same allowlist between reachability, plans and emission.
// Temporal.Now.timeZoneId is ordinary data, not a sampled clock category.
func timeTemporalClockOperation(node *ast.Node, typeChecker *checker.Checker) string {
	node = unwrapTimeStaticExpression(node)
	if node == nil || !ast.IsCallExpression(node) {
		return ""
	}
	now, operation := timeMemberIdentity(node.AsCallExpression().Expression, typeChecker)
	root, member := timeMemberIdentity(now, typeChecker)
	if member != "Now" || !timeNativeGlobalValue(root, "Temporal", typeChecker) {
		return ""
	}
	switch operation {
	case "instant", "zonedDateTimeISO", "plainDateTimeISO", "plainDateISO", "plainTimeISO":
		return operation
	}
	return ""
}

// preserveTimeClockMemberEvaluation retains computed-key evaluation in receiver-to-member order
// before the sampled read evaluates its arguments. Native namespaces themselves are inert values.
func (lowering *jsxLowering) preserveTimeClockMemberEvaluation(member, emitted *ast.Node) *ast.Node {
	var keys []*ast.Node
	var collect func(*ast.Node)
	collect = func(node *ast.Node) {
		node = unwrapTimeStaticExpression(node)
		if node == nil {
			return
		}
		if ast.IsPropertyAccessExpression(node) {
			collect(node.AsPropertyAccessExpression().Expression)
		} else if ast.IsElementAccessExpression(node) {
			access := node.AsElementAccessExpression()
			collect(access.Expression)
			keys = append(keys, access.ArgumentExpression)
		}
	}
	collect(member)
	for index := len(keys) - 1; index >= 0; index-- {
		emitted = lowering.factory.NewParenthesizedExpression(lowering.factory.NewBinaryExpression(nil, lowering.factory.NewVoidExpression(lowering.visitor.VisitNode(keys[index])), nil, lowering.factory.NewToken(ast.KindCommaToken), emitted))
	}
	return emitted
}

// timeClockInputsSafe prevents a clock exemption from authorizing repeated key or argument effects.
func (lowering *jsxLowering) timeClockInputsSafe(node *ast.Node) bool {
	call := node.AsCallExpression()
	safe := true
	walkNode(call.Expression, func(candidate *ast.Node) bool {
		if ast.IsElementAccessExpression(candidate) && !safeReactiveInitializer(candidate.AsElementAccessExpression().ArgumentExpression, lowering.sourceFile, lowering.checker) {
			safe = false
			return false
		}
		return safe
	})
	for _, argument := range callArguments(node) {
		if !safeReactiveInitializer(argument, lowering.sourceFile, lowering.checker) {
			return false
		}
	}
	return safe
}

// timeNativeTemporalCall admits standard immutable Temporal arithmetic while its arguments
// remain visible to the enclosing clock safety walk. Application methods retain their effects.
func timeNativeTemporalCall(node *ast.Node, typeChecker *checker.Checker) bool {
	if ast.NodeIsSynthesized(node) || node.Parent == nil {
		return false
	}
	signature := typeChecker.GetResolvedSignature(node)
	if signature == nil || signature.Declaration() == nil {
		return false
	}
	source := ast.GetSourceFileOfNode(signature.Declaration())
	return source != nil && source.IsDeclarationFile && filepath.Base(source.FileName()) == "lib.esnext.temporal.d.ts"
}
