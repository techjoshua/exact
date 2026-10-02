package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// objectHelperMembers selects method descriptors whose final ownership is provable without
// evaluating a spread, computed key, or getter. Later data properties replace earlier methods.
func objectHelperMembers(object *ast.Node, typeChecker *checker.Checker) []*ast.Node {
	selected := map[string][]*ast.Node{}
	for _, member := range object.AsObjectLiteralExpression().Properties.Nodes {
		key, valid := objectHelperMemberKey(member, typeChecker)
		if !valid {
			clear(selected)
			continue
		}
		if ast.IsPropertyAssignment(member) && key == "__proto__" && !ast.IsComputedPropertyName(member.Name()) {
			continue
		}
		if ast.IsMethodDeclaration(member) && member.Body() != nil {
			selected[key] = []*ast.Node{member}
		} else if (ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member)) && member.Body() != nil {
			previous := selected[key]
			selected[key] = []*ast.Node{member}
			for _, other := range previous {
				if ast.IsGetAccessorDeclaration(member) && ast.IsSetAccessorDeclaration(other) || ast.IsSetAccessorDeclaration(member) && ast.IsGetAccessorDeclaration(other) {
					selected[key] = append(selected[key], other)
				}
			}
		} else {
			delete(selected, key)
		}
	}
	members := []*ast.Node{}
	for _, member := range object.AsObjectLiteralExpression().Properties.Nodes {
		if key, valid := objectHelperMemberKey(member, typeChecker); valid {
			for _, selectedMember := range selected[key] {
				if member == selectedMember && (taskHelperNeedsCompanion(member) || helperNestedCallable(member)) {
					members = append(members, member)
				}
			}
		}
	}
	return members
}

// lowerTaskHelperObject preserves the actual authored object and methods, including their home,
// descriptors and nonconstructability. Only method execution selects a pending companion.
// Property values still execute in the creation context, and registration never invokes accessors.
func (lowering *jsxLowering) lowerTaskHelperObject(source *ast.Node, works []*ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	members := []*ast.Node{}
	for _, member := range source.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsMethodDeclaration(member) || ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member) {
			members = append(members, lowering.visitHelperOriginal(member))
		} else {
			members = append(members, visitor.VisitNode(member))
		}
	}
	original := lowering.factory.UpdateObjectLiteralExpression(source.AsObjectLiteralExpression(), lowering.factory.NewNodeList(members), source.AsObjectLiteralExpression().MultiLine)
	object := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactHelperObject"))
	statements := []*ast.Node{}
	for _, work := range works {
		context := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactObjectHelperContext"))
		parameters := lowering.helperParameters(work, context)
		if len(parameters) == 0 || !ast.IsIdentifier(parameters[0].Name()) || parameters[0].Name().Text() != "this" {
			receiver := lowering.factory.NewParameterDeclaration(nil, nil, lowering.factory.NewIdentifier("this"), nil, lowering.helperCallableTypes[nodeSpanKey(source)], nil)
			parameters = append([]*ast.Node{receiver}, parameters...)
		}
		body := lowering.lowerTaskHelperBody(work, context)
		var asterisk *ast.Node
		var typeNode *ast.Node
		var typeParameters *ast.NodeList
		if ast.IsMethodDeclaration(work) {
			method := work.AsMethodDeclaration()
			asterisk, typeNode, typeParameters = method.AsteriskToken, method.Type, method.TypeParameters
		} else if ast.IsGetAccessorDeclaration(work) {
			typeNode = work.AsGetAccessorDeclaration().Type
		}
		companion := lowering.factory.NewFunctionExpression(work.Modifiers(), asterisk, nil, typeParameters, lowering.factory.NewNodeList(parameters), typeNode, nil, body)
		keyText, _ := objectHelperMemberKey(work, lowering.checker)
		key := lowering.factory.NewStringLiteral(keyText, ast.TokenFlagsNone)
		descriptor := lowering.factory.NewNonNullExpression(lowering.taskHelperIntrinsicCall("Object.getOwnPropertyDescriptor", []*ast.Node{object, key}), ast.NodeFlagsNone)
		property := "value"
		if ast.IsGetAccessorDeclaration(work) {
			property = "get"
		} else if ast.IsSetAccessorDeclaration(work) {
			property = "set"
		}
		method := lowering.factory.NewNonNullExpression(lowering.factory.NewPropertyAccessExpression(descriptor, nil, lowering.factory.NewIdentifier(property), ast.NodeFlagsNone), ast.NodeFlagsNone)
		statements = append(statements, lowering.factory.NewExpressionStatement(lowering.helperRegistration(method, companion, false, "", work, object)))
	}
	statements = append(statements, lowering.factory.NewReturnStatement(object))
	typeNode := lowering.helperCallableTypes[nodeSpanKey(source)]
	if typeNode != nil {
		original = lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(original), typeNode)
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, object, nil, typeNode, nil)
	register := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{parameter}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(register), nil, nil, lowering.factory.NewNodeList([]*ast.Node{original}), ast.NodeFlagsNone)
}

// objectHelperMemberKey accepts computed names only when immutable authored literals prove them.
// A contextual literal type alone cannot prove the runtime value of a cast or opaque expression.
func objectHelperMemberKey(member *ast.Node, typeChecker *checker.Checker) (string, bool) {
	name := member.Name()
	if name == nil {
		return "", false
	}
	if ast.IsIdentifier(name) || ast.IsStringLiteral(name) {
		return name.Text(), true
	}
	if !ast.IsComputedPropertyName(name) {
		return "", false
	}
	return objectHelperLiteralKey(name.AsComputedPropertyName().Expression, typeChecker, make(map[ast.SymbolId]bool))
}

func objectHelperLiteralKey(value *ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (string, bool) {
	if value == nil {
		return "", false
	}
	if ast.IsStringLiteral(value) {
		return value.Text(), true
	}
	if ast.IsParenthesizedExpression(value) {
		return objectHelperLiteralKey(value.AsParenthesizedExpression().Expression, typeChecker, seen)
	}
	if ast.IsAsExpression(value) {
		return objectHelperLiteralKey(value.AsAsExpression().Expression, typeChecker, seen)
	}
	if ast.IsSatisfiesExpression(value) {
		return objectHelperLiteralKey(value.AsSatisfiesExpression().Expression, typeChecker, seen)
	}
	if !ast.IsIdentifier(value) || typeChecker == nil {
		return "", false
	}
	symbol := typeChecker.GetSymbolAtLocation(value)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return "", false
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) || declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		if key, valid := objectHelperLiteralKey(declaration.AsVariableDeclaration().Initializer, typeChecker, seen); valid {
			return key, true
		}
	}
	return "", false
}
