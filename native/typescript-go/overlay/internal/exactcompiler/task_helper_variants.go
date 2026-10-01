package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// taskHelperClass keeps companions inside the original private and generic class scope.
type taskHelperClass struct {
	members map[string]*ast.Node
}

// captureTaskHelperVariants retains original callable bodies before JSX and island reparenting.
func (lowering *jsxLowering) captureTaskHelperVariants() {
	lowering.helperClasses = map[string]*taskHelperClass{}
	lowering.helperInitializers = map[string]*ast.Node{}
	lowering.helperPrivateTokens = map[string]*ast.Node{}
	if lowering.checking {
		return
	}
	lowering.helperRegistryName = lowering.uniqueMutationName("__exactRegisterTaskHelper")
	lowering.helperContextTypeName = lowering.uniqueMutationName("__exactTaskHelperState")
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsClassDeclaration(node) {
			plan := &taskHelperClass{members: map[string]*ast.Node{}}
			for _, member := range node.AsClassDeclaration().Members.Nodes {
				if !(ast.IsMethodDeclaration(member) || ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member)) || member.Body() == nil || member.Name() == nil {
					continue
				}
				name := member.Name()
				if !(ast.IsIdentifier(name) || ast.IsStringLiteral(name) || ast.IsNumericLiteral(name)) {
					continue
				}
				plan.members[nodeSpanKey(member)] = member
			}
			if len(plan.members) != 0 {
				lowering.helperClasses[nodeSpanKey(node)] = plan
				lowering.captureHelperPrivateTokens(node)
			}
		}
		if (ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsFunctionDeclaration(node)) && node.Body() != nil && len(node.Parameters()) > 0 && node.Parent != nil && (ast.IsPropertyAssignment(node.Parent) || ast.IsVariableDeclaration(node.Parent) || ast.IsFunctionDeclaration(node) && ast.IsSourceFile(node.Parent)) {
			insideTask := false
			for _, task := range lowering.tasks {
				insideTask = insideTask || node.Pos() >= task.WorkStart && node.End() <= task.WorkStart+task.WorkLength
			}
			if !insideTask && taskHelperNeedsCompanion(node) && !lowering.isHelperComponent(node) {
				lowering.helperInitializers[nodeSpanKey(node)] = node
			}
		}
		return true
	})
}

func (lowering *jsxLowering) captureHelperPrivateTokens(class *ast.Node) {
	tokens := map[string]*ast.Node{}
	walkNode(class, func(node *ast.Node) bool {
		if node != class && ast.IsClassDeclaration(node) {
			return false
		}
		if ast.IsPropertyAccessExpression(node) && node.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier {
			name := node.AsPropertyAccessExpression().Name().Text()
			token := tokens[name]
			if token == nil {
				token = lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactPrivate_%d_%d", class.Pos(), len(tokens))))
				tokens[name] = token
				lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperConstant(token, lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(nil), false)))
			}
			lowering.helperPrivateTokens[nodeSpanKey(node)] = token
		}
		return true
	})
}

func (lowering *jsxLowering) helperConstant(name, value *ast.Node) *ast.Node {
	return lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(name, nil, nil, value)}), ast.NodeFlagsConst))
}

func (lowering *jsxLowering) helperParameter(context *ast.Node) *ast.Node {
	return lowering.factory.NewParameterDeclaration(nil, nil, context, nil, lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier(lowering.helperContextTypeName), nil), nil)
}

func (lowering *jsxLowering) helperRegistration(original, companion *ast.Node, raw bool, inferredName string, work, home *ast.Node) *ast.Node {
	arguments := []*ast.Node{original, companion, lowering.factory.NewFalseExpression()}
	if raw {
		arguments[2] = lowering.factory.NewTrueExpression()
	}
	indices := []*ast.Node{}
	index := 0
	for _, parameter := range work.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		if ast.IsBindingPattern(parameter.Name()) {
			indices = append(indices, lowering.factory.NewNumericLiteral(fmt.Sprint(index), ast.TokenFlagsNone))
		}
		index++
	}
	if inferredName != "" || len(indices) > 0 || home != nil {
		arguments = append(arguments, lowering.factory.NewStringLiteral(inferredName, ast.TokenFlagsNone))
	}
	if len(indices) > 0 || home != nil {
		arguments = append(arguments, lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(indices), false))
	}
	if home != nil {
		arguments = append(arguments, home)
	}
	return lowering.call(lowering.helperRegistryName, arguments)
}

// lowerTaskHelperClass keeps the original methods and installs companions without per-instance allocation.
func (lowering *jsxLowering) lowerTaskHelperClass(source *ast.Node, plan *taskHelperClass) *ast.Node {
	class := source.AsClassDeclaration()
	members := []*ast.Node{}
	registrations := []*ast.Node{}
	for _, sourceMember := range class.Members.Nodes {
		// Originals remain ordinary callables even when their class is authored inside a task.
		// Only the companion receives that invocation's pending context.
		pending := lowering.pendingStates
		lowering.pendingStates = nil
		originalMember := lowering.visitor.VisitEachChild(sourceMember)
		lowering.pendingStates = pending
		members = append(members, originalMember)
		work := plan.members[nodeSpanKey(sourceMember)]
		if work == nil {
			continue
		}
		context := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactHelperContext_%d", work.Pos())))
		symbol := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactHelperMethod_%d", work.Pos())))
		lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperConstant(symbol, lowering.call("Symbol", nil)))
		parameters := lowering.helperParameters(work, context)
		body := lowering.lowerTaskHelperBody(work, context)
		modifiers := []*ast.Node{}
		if work.Modifiers() != nil {
			for _, modifier := range work.Modifiers().Nodes {
				if modifier.Kind == ast.KindStaticKeyword || modifier.Kind == ast.KindAsyncKeyword {
					modifiers = append(modifiers, modifier)
				}
			}
		}
		var typeNode *ast.Node
		var method *ast.Node
		if ast.IsMethodDeclaration(work) {
			original := work.AsMethodDeclaration()
			method = lowering.factory.NewMethodDeclaration(lowering.factory.NewModifierList(modifiers), original.AsteriskToken, lowering.factory.NewComputedPropertyName(symbol), nil, original.TypeParameters, lowering.factory.NewNodeList(parameters), original.Type, nil, body)
		} else {
			if ast.IsGetAccessorDeclaration(work) {
				typeNode = work.AsGetAccessorDeclaration().Type
			}
			method = lowering.factory.NewMethodDeclaration(lowering.factory.NewModifierList(modifiers), nil, lowering.factory.NewComputedPropertyName(symbol), nil, nil, lowering.factory.NewNodeList(parameters), typeNode, nil, body)
		}
		members = append(members, method)
		receiver := lowering.factory.NewPropertyAccessExpression(lowering.factory.NewKeywordExpression(ast.KindThisKeyword), nil, lowering.factory.NewIdentifier("prototype"), ast.NodeFlagsNone)
		for _, modifier := range modifiers {
			if modifier.Kind == ast.KindStaticKeyword {
				receiver = lowering.factory.NewKeywordExpression(ast.KindThisKeyword)
			}
		}
		key := lowering.factory.NewStringLiteral(work.Name().Text(), ast.TokenFlagsNone)
		original := lowering.factory.NewElementAccessExpression(receiver, nil, key, ast.NodeFlagsNone)
		if ast.IsGetAccessorDeclaration(work) || ast.IsSetAccessorDeclaration(work) {
			descriptor := lowering.factory.NewNonNullExpression(lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(lowering.factory.NewIdentifier("Object"), nil, lowering.factory.NewIdentifier("getOwnPropertyDescriptor"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{receiver, key}), ast.NodeFlagsNone), ast.NodeFlagsNone)
			name := "get"
			if ast.IsSetAccessorDeclaration(work) {
				name = "set"
			}
			original = lowering.factory.NewNonNullExpression(lowering.factory.NewPropertyAccessExpression(descriptor, nil, lowering.factory.NewIdentifier(name), ast.NodeFlagsNone), ast.NodeFlagsNone)
		}
		companion := lowering.factory.NewElementAccessExpression(receiver, nil, symbol, ast.NodeFlagsNone)
		registrations = append(registrations, lowering.factory.NewExpressionStatement(lowering.helperRegistration(original, companion, true, "", work, receiver)))
	}
	if len(registrations) != 0 {
		members = append([]*ast.Node{lowering.factory.NewClassStaticBlockDeclaration(nil, lowering.factory.NewBlock(lowering.factory.NewNodeList(registrations), true))}, members...)
	}
	return lowering.factory.UpdateClassDeclaration(class, class.Modifiers(), class.Name(), class.TypeParameters, class.HeritageClauses, lowering.factory.NewNodeList(members))
}

func (lowering *jsxLowering) lowerTaskHelperInitializer(work *ast.Node) *ast.Node {
	context := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactHelperContext_%d", work.Pos())))
	parameters := lowering.helperParameters(work, context)
	body := lowering.lowerTaskHelperBody(work, context)
	var companion *ast.Node
	if ast.IsArrowFunction(work) {
		arrow := work.AsArrowFunction()
		companion = lowering.factory.UpdateArrowFunction(arrow, arrow.Modifiers(), arrow.TypeParameters, lowering.factory.NewNodeList(parameters), arrow.Type, nil, arrow.EqualsGreaterThanToken, body)
	} else if ast.IsFunctionDeclaration(work) {
		function := work.AsFunctionDeclaration()
		modifiers := []*ast.Node{}
		if function.Modifiers() != nil {
			for _, modifier := range function.Modifiers().Nodes {
				if modifier.Kind == ast.KindAsyncKeyword {
					modifiers = append(modifiers, modifier)
				}
			}
		}
		companion = lowering.factory.NewFunctionExpression(lowering.factory.NewModifierList(modifiers), function.AsteriskToken, nil, function.TypeParameters, lowering.factory.NewNodeList(parameters), function.Type, nil, body)
	} else {
		function := work.AsFunctionExpression()
		companion = lowering.factory.NewFunctionExpression(function.Modifiers(), function.AsteriskToken, nil, function.TypeParameters, lowering.factory.NewNodeList(parameters), function.Type, nil, body)
	}
	name := ""
	if work.Parent != nil && (ast.IsPropertyAssignment(work.Parent) || ast.IsVariableDeclaration(work.Parent)) && work.Parent.Name() != nil {
		name = work.Parent.Name().Text()
	}
	lowering.helperVariantDepth++
	original := lowering.visitor.VisitEachChild(work)
	lowering.helperVariantDepth--
	if ast.IsFunctionDeclaration(work) {
		lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.factory.NewExpressionStatement(lowering.helperRegistration(work.Name(), companion, false, "", work, nil)))
		return original
	}
	return lowering.helperRegistration(original, companion, false, name, work, nil)
}

// isHelperComponent keeps component definitions on their own state-machine lowering path.
func (lowering *jsxLowering) isHelperComponent(node *ast.Node) bool {
	name := node.Name()
	if name == nil && node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
		name = node.Parent.Name()
	}
	if name == nil {
		return false
	}
	_, exists := lowering.components[name.Text()]
	return exists
}

// sourceHasTaskHelpers keeps helper-only modules in the compilation pipeline.
func sourceHasTaskHelpers(source *ast.SourceFile) bool {
	found := false
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		classMember := node.Parent != nil && ast.IsClassDeclaration(node.Parent)
		if ast.IsFunctionLike(node) && node.Body() != nil && (len(node.Parameters()) > 0 || classMember) && taskHelperNeedsCompanion(node) {
			found = true
		}
		return !found
	})
	return found
}

// taskHelperNeedsCompanion avoids changing pure module plumbing while retaining mutation and suspension.
func taskHelperNeedsCompanion(work *ast.Node) bool {
	if work.SubtreeFacts()&ast.SubtreeContainsJsx != 0 {
		return false
	}
	found := false
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsAwaitExpression(node) {
			found = true
		}
		if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
			method := node.AsCallExpression().Expression.AsPropertyAccessExpression().Name().Text()
			_, array := reactiveArrayMutators[method]
			_, mapped := reactiveMapMutators[method]
			_, set := reactiveSetMutators[method]
			found = found || array || mapped || set
			switch method {
			case "get", "has", "keys", "values", "entries", "forEach":
				found = true
			}
		}
		if ast.IsPropertyAccessExpression(node) {
			member := node.AsPropertyAccessExpression()
			found = found || member.Name().Kind == ast.KindPrivateIdentifier || member.Expression.Kind == ast.KindThisKeyword || member.Expression.Kind == ast.KindSuperKeyword
			switch node.AsPropertyAccessExpression().Name().Text() {
			case "size", "length":
				found = true
			}
		}
		var target *ast.Node
		if ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind) {
			target = node.AsBinaryExpression().Left
		}
		if ast.IsPrefixUnaryExpression(node) {
			target = node.AsPrefixUnaryExpression().Operand
		}
		if ast.IsPostfixUnaryExpression(node) {
			target = node.AsPostfixUnaryExpression().Operand
		}
		if target != nil && (ast.IsPropertyAccessExpression(target) || ast.IsElementAccessExpression(target)) {
			found = true
		}
		return !found
	})
	return found
}

// helperParameters retains TypeScript's erased receiver parameter before runtime context arguments.
func (lowering *jsxLowering) helperParameters(work, context *ast.Node) []*ast.Node {
	parameters := []*ast.Node{}
	authored := work.Parameters()
	if len(authored) > 0 && ast.IsIdentifier(authored[0].Name()) && authored[0].Name().Text() == "this" {
		parameters = append(parameters, authored[0])
		authored = authored[1:]
	}
	parameters = append(parameters, lowering.helperParameter(context))
	for _, node := range authored {
		parameter := node.AsParameterDeclaration()
		initializer := parameter.Initializer
		if initializer != nil {
			initializer = lowering.lowerTaskHelperNode(work, context, initializer)
			if ast.IsBindingPattern(parameter.Name()) {
				initializer = lowering.helperContextCall(context, "view", []*ast.Node{initializer})
			}
		}
		parameters = append(parameters, lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(), parameter.DotDotDotToken, lowering.helperBindingName(work, context, parameter.Name()), parameter.QuestionToken, parameter.Type, initializer))
	}
	return parameters
}
