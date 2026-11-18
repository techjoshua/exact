package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// checkedComponentProtocolMember proves finite computed keys without granting ordinary receivers
// component authority. The key expression still belongs to source evaluation and must survive
// any lowering that replaces the member lookup, even when its type is one literal string.
func checkedComponentProtocolMember(node *ast.Node, typeChecker *checker.Checker) (string, bool, bool) {
	if node == nil {
		return "", false, false
	}
	name, member, dynamic := componentProtocolMember(node)
	if !member || !dynamic || typeChecker == nil || ast.NodeIsSynthesized(node) || node.Parent == nil {
		return name, member, dynamic
	}
	key := node.AsElementAccessExpression().ArgumentExpression
	value := typeChecker.GetTypeAtLocation(key)
	if value != nil && value.Flags()&checker.TypeFlagsStringLiteral != 0 {
		if literal, valid := value.AsLiteralType().Value().(string); valid {
			return literal, true, false
		}
	}
	return name, member, dynamic
}

// preserveComponentMemberKeyEvaluation retains key effects and binding errors before arguments.
// A one-string type proves operation identity, never that evaluating the key is inert.
func (lowering *jsxLowering) preserveComponentMemberKeyEvaluation(member, emitted *ast.Node) *ast.Node {
	if !ast.IsElementAccessExpression(member) {
		return emitted
	}
	key := member.AsElementAccessExpression().ArgumentExpression
	return lowering.factory.NewParenthesizedExpression(lowering.factory.NewBinaryExpression(
		nil, lowering.factory.NewVoidExpression(lowering.visitor.VisitNode(key)), nil,
		lowering.factory.NewToken(ast.KindCommaToken), emitted,
	))
}

// componentProtocolReceiverOwned checks lexical authority before assigning an operation contract.
// Method spelling cannot make an ordinary object or class receiver a component instance.
func componentProtocolReceiverOwned(node *ast.Node, typeChecker *checker.Checker) bool {
	sourceFile := ast.GetSourceFileOfNode(node)
	if sourceFile == nil {
		return false
	}
	for _, candidate := range componentCandidates(sourceFile) {
		if node.Pos() >= candidate.node.Pos() && node.End() <= candidate.node.End() {
			return componentOwnsReceiver(node, componentStateReceiverScopes(candidate.node, typeChecker))
		}
	}
	return false
}

// componentProtocolCallMember follows immutable local aliases to a proven component operation.
// Mutable bindings and ordinary receivers remain opaque, and alias cycles fail closed.
func componentProtocolCallMember(node *ast.Node, typeChecker *checker.Checker) *ast.Node {
	seen := map[*ast.Symbol]bool{}
	for node != nil {
		node = unwrapRenderExpression(node)
		if !ast.IsIdentifier(node) {
			return node
		}
		if typeChecker == nil {
			return node
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil || seen[symbol] {
			return node
		}
		seen[symbol] = true
		declaration := symbol.ValueDeclaration
		if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			return node
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		if initializer == nil {
			return node
		}
		node = initializer
	}
	return nil
}

// checkedNonliteralComponentProtocolGet projects the existing component contract
// only for a direct nonliteral callee. Dot/literal and generic member paths keep
// their original acquisition. Package signatures are classification, not values.
func checkedNonliteralComponentProtocolGet(node *ast.Node, typeChecker *checker.Checker) *ast.Symbol {
	if node == nil || typeChecker == nil || !ast.IsElementAccessExpression(node) || ast.NodeIsSynthesized(node) || node.Parent == nil || normalCalleeGetOwner(node) == nil {
		return nil
	}
	if normalCalleeGetOwner(node).AsCallExpression().Expression != node {
		return nil
	}
	member := node.AsElementAccessExpression()
	if sourceMemberKey(member.ArgumentExpression).resolved {
		return nil
	}
	name, owned, dynamic := checkedComponentProtocolMember(node, typeChecker)
	if !owned || dynamic || !exactComponentOperation("this."+name) || !componentProtocolReceiverOwned(node, typeChecker) {
		return nil
	}
	value := typeChecker.GetTypeAtLocation(member.Expression)
	if value == nil {
		return nil
	}
	selected := typeChecker.GetPropertyOfType(typeChecker.GetNonNullableType(value), name)
	if !portableDeclaredMethod(selected) {
		return nil
	}
	return selected
}

// componentContextPackage identifies the maintained core primitive contract.
// Package identity alone supplies neither default selection nor member coverage.
func componentContextPackage(declaration *ast.Node) string {
	if declaration == nil {
		return ""
	}
	file := ast.GetSourceFileOfNode(declaration)
	if file == nil || !file.IsDeclarationFile {
		return ""
	}
	name := strings.ReplaceAll(file.FileName(), "\\", "/")
	for _, marker := range []string{"/packages/core/", "/@exactjs/core/"} {
		if i := strings.LastIndex(name, marker); i >= 0 {
			return name[:i+len(marker)]
		}
	}
	return ""
}

// conditionalComponentContextMethod recognizes only the declared default arm of
// the actual canonical receiver. Ordinary overrides remain independent sources.
func conditionalComponentContextMethod(member, receiver *ast.Node, c *checker.Checker) *ast.Symbol {
	selected := nativeReceiverMemberSymbol(member, c)
	if selected == nil || selected.Name != "hasContext" || !portableDeclaredMethod(selected) {
		return nil
	}
	actualType := c.GetTypeAtLocation(receiver)
	if actualType == nil {
		return nil
	}
	actual := c.GetPropertyOfType(actualType, "hasContext")
	if !portableDeclaredMethod(actual) || len(actual.Declarations) != len(selected.Declarations) {
		return nil
	}
	for i, declaration := range selected.Declarations {
		if actual.Declarations[i] != declaration || componentContextPackage(declaration) == "" {
			return nil
		}
	}
	return selected
}

// componentLifecycleCallName is the direct lifecycle lowering domain. A checked
// key identifies the operation; its evaluation remains independently required.
func componentLifecycleCallName(node *ast.Node, typeChecker *checker.Checker) string {
	if node == nil || !ast.IsCallExpression(node) || node.AsCallExpression().QuestionDotToken != nil {
		return ""
	}
	name, member, dynamic := checkedComponentProtocolMember(node.Expression(), typeChecker)
	if !member || dynamic {
		return ""
	}
	switch name {
	case "onMount", "onActivate", "onDeactivate", "onUnmount", "onRender", "own":
		return name
	}
	return ""
}

// ordinaryComponentLifecycleCall accounts only an inline callback registration
// in an actually selected component. The ordinary walk owns its key and arrow
// creation; factory, getter, spread and extracted callback inputs keep generic
// acquisition. This domain supplies no normal output or callback execution.
func ordinaryComponentLifecycleCall(node *ast.Node, typeChecker *checker.Checker, owner *executableBodyOwner) bool {
	if node == nil || !ast.IsCallExpression(node) || owner == nil || owner.values == nil {
		return false
	}
	call := node.AsCallExpression()
	if call.QuestionDotToken != nil || call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsArrowFunction(unwrapRenderExpression(call.Arguments.Nodes[0])) {
		return false
	}
	if _, member, _ := componentProtocolMember(call.Expression); !member {
		return false
	}
	for scope := node.Parent; scope != nil; scope = scope.Parent {
		if _, selected := owner.values.components[scope]; selected {
			// This bounded domain needs lexical this only. Ordinary functions
			// and class receivers keep generic acquisition; no component scan
			// or import collection is needed at either collector entry.
			if !helperOwnsReceiver(node, scope) {
				return false
			}
			switch componentLifecycleCallName(node, typeChecker) {
			case "onMount", "onActivate", "onDeactivate":
				return true
			}
			return false
		}
	}
	return false
}
