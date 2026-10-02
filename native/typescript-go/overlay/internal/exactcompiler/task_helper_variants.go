package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// taskHelperClass keeps companions inside the original private and generic class scope.
type taskHelperClass struct {
	members     map[string]*ast.Node
	fieldHome   *ast.Node
	lexicalName *ast.Node
	restoreName *string
}

// captureTaskHelperVariants retains original callable bodies before JSX and island reparenting.
func (lowering *jsxLowering) captureTaskHelperVariants() {
	lowering.helperClasses = map[string]*taskHelperClass{}
	lowering.helperInitializers = map[string]*ast.Node{}
	lowering.helperObjects = map[string][]*ast.Node{}
	lowering.helperPrivateTokens = map[string]*ast.Node{}
	lowering.helperCompanionNames = map[string]*ast.Node{}
	lowering.helperPrivateAccessors = map[string]privateAccessorPlan{}
	lowering.helperBoundTypes = map[string]*ast.Node{}
	lowering.helperCallableTypes = map[string]*ast.Node{}
	lowering.helperParameterTypes = map[string]*ast.Node{}
	lowering.helperFactoryHomes = map[string]helperFactoryHome{}
	if lowering.checking {
		return
	}
	lowering.helperRegistryName = lowering.uniqueMutationName("__exactRegisterTaskHelper")
	lowering.helperContextTypeName = lowering.uniqueMutationName("__exactTaskHelperState")
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsObjectLiteralExpression(node) && !lowering.helperInsideComponent(node) {
			if works := objectHelperMembers(node, lowering.checker); len(works) != 0 {
				lowering.helperObjects[nodeSpanKey(node)] = works
				if lowering.checker != nil {
					lowering.helperCallableTypes[nodeSpanKey(node)] = lowering.authoredMutationType(node)
				}
			}
		}
		if helperBindingReceiver(node) != nil && lowering.checker != nil {
			lowering.helperBoundTypes[nodeSpanKey(node)] = lowering.authoredMutationType(node)
		}
		if ast.IsClassLike(node) {
			plan := &taskHelperClass{members: map[string]*ast.Node{}}
			for _, member := range node.ClassLikeData().Members.Nodes {
				if !(ast.IsMethodDeclaration(member) || ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member)) || member.Body() == nil || member.Name() == nil {
					continue
				}
				name := member.Name()
				if !(ast.IsIdentifier(name) || ast.IsStringLiteral(name) || ast.IsNumericLiteral(name) || name.Kind == ast.KindPrivateIdentifier) {
					continue
				}
				plan.members[nodeSpanKey(member)] = member
				lowering.helperCompanionNames[nodeSpanKey(member)] = lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactHelperMethod_%d", member.Pos())))
				lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperSymbolConstant(lowering.helperCompanionNames[nodeSpanKey(member)]))
			}
			if len(plan.members) != 0 {
				lowering.helperClasses[nodeSpanKey(node)] = plan
				lowering.captureHelperPrivateTokens(node)
			}
		}
		site := helperCallableParent(node)
		field := site != nil && ast.IsPropertyDeclaration(site) && site.Parent != nil && ast.IsClassLike(site.Parent)
		if (ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsFunctionDeclaration(node)) && node.Body() != nil && node.Parent != nil && helperCallableSite(node) {
			insideTask := false
			for _, task := range lowering.tasks {
				insideTask = insideTask || node.Pos() >= task.WorkStart && node.End() <= task.WorkStart+task.WorkLength
			}
			if (field || !insideTask) && (taskHelperNeedsCompanion(node) || helperNestedCallable(node)) && !lowering.isHelperComponent(node) && !lowering.helperInsideComponent(node) {
				lowering.helperInitializers[nodeSpanKey(node)] = node
				if lowering.checker != nil {
					lowering.helperCallableTypes[nodeSpanKey(node)] = lowering.authoredMutationType(node)
					for _, parameter := range node.Parameters() {
						if parameter.AsParameterDeclaration().Type == nil {
							lowering.helperParameterTypes[nodeSpanKey(parameter)] = lowering.authoredMutationType(parameter)
						}
					}
				}
				lowering.captureFactoryHelperHome(node)
				if field {
					if ast.IsArrowFunction(node) && helperHasLexicalSuper(node) && !helperStaticMember(site) {
						class := site.Parent
						plan := lowering.helperClasses[nodeSpanKey(class)]
						if plan == nil {
							plan = &taskHelperClass{members: map[string]*ast.Node{}}
							lowering.helperClasses[nodeSpanKey(class)] = plan
						}
						if plan.fieldHome == nil {
							plan.fieldHome = lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactFieldHome_%d", class.Pos())))
							lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperSymbolConstant(plan.fieldHome))
						}
					}
					lowering.captureHelperPrivateTokens(site.Parent)
				}
			}
		}
		return true
	})
	lowering.capturePrivateAccessorPlans()
}

func (lowering *jsxLowering) captureHelperPrivateTokens(class *ast.Node) {
	tokens := map[string]*ast.Node{}
	walkNode(class, func(node *ast.Node) bool {
		if node != class && ast.IsClassLike(node) {
			return false
		}
		if ast.IsPropertyAccessExpression(node) && node.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier {
			name := node.AsPropertyAccessExpression().Name().Text()
			token := tokens[name]
			if token == nil {
				token = lowering.helperPrivateTokens[nodeSpanKey(node)]
			}
			if token == nil {
				token = lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactPrivate_%d_%d", class.Pos(), len(tokens))))
				lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperConstant(token, lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(nil), false)))
			}
			tokens[name] = token
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
	class := source.ClassLikeData()
	members := []*ast.Node{}
	registrations := []*ast.Node{}
	if plan.restoreName != nil {
		registrations = append(registrations, lowering.restoreHelperClassName(*plan.restoreName))
	}
	instanceRegistrations := []*ast.Node{}
	if plan.fieldHome != nil {
		lowering.installHelperFieldHome(plan.fieldHome, &members, &registrations)
	}
	for _, sourceMember := range class.Members.Nodes {
		// Originals remain ordinary callables even when their class is authored inside a task.
		// Only the companion receives that invocation's pending context.
		originalMember := lowering.visitHelperOriginal(sourceMember)
		members = append(members, originalMember)
		work := plan.members[nodeSpanKey(sourceMember)]
		if work == nil {
			continue
		}
		context := lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactHelperContext_%d", work.Pos())))
		symbol := lowering.helperCompanionNames[nodeSpanKey(work)]
		parameters := lowering.helperParameters(work, context)
		body := lowering.lowerTaskHelperBody(work, context)
		if work.Name().Kind == ast.KindPrivateIdentifier && (ast.IsGetAccessorDeclaration(work) || ast.IsSetAccessorDeclaration(work)) {
			body = lowering.privateAccessorBody(work.Name(), body)
		}
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
			descriptor := lowering.factory.NewNonNullExpression(lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(lowering.taskHelperIntrinsic("Object"), nil, lowering.factory.NewIdentifier("getOwnPropertyDescriptor"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{receiver, key}), ast.NodeFlagsNone), ast.NodeFlagsNone)
			name := "get"
			if ast.IsSetAccessorDeclaration(work) {
				name = "set"
			}
			original = lowering.factory.NewNonNullExpression(lowering.factory.NewPropertyAccessExpression(descriptor, nil, lowering.factory.NewIdentifier(name), ast.NodeFlagsNone), ast.NodeFlagsNone)
		}
		companion := lowering.factory.NewElementAccessExpression(receiver, nil, symbol, ast.NodeFlagsNone)
		if work.Name().Kind == ast.KindPrivateIdentifier {
			if ast.IsMethodDeclaration(work) {
				// Instance private methods are installed before field initializers, never on the
				// public prototype. Register their original identity without exposing an own key.
				owner := lowering.factory.NewKeywordExpression(ast.KindThisKeyword)
				original = lowering.factory.NewPropertyAccessExpression(owner, nil, work.Name(), ast.NodeFlagsNone)
				registration := lowering.helperRegistration(original, companion, true, "", work, receiver)
				if receiver.Kind == ast.KindThisKeyword {
					registrations = append(registrations, lowering.factory.NewExpressionStatement(registration))
				} else {
					registrations = append(registrations, lowering.factory.NewExpressionStatement(lowering.helperRegistration(companion, companion, true, "", work, receiver)))
					instanceWork := lowering.factory.NewElementAccessExpression(owner, nil, symbol, ast.NodeFlagsNone)
					instanceRegistrations = append(instanceRegistrations, lowering.helperRegistration(original, instanceWork, true, "", work, nil))
				}
				continue
			}
			// Private accessor functions cannot be reflected. Their compiler-only method is
			// both registry identity and companion, selected only by transformed accesses.
			original = companion
		}
		registrations = append(registrations, lowering.factory.NewExpressionStatement(lowering.helperRegistration(original, companion, true, "", work, receiver)))
	}
	if len(instanceRegistrations) != 0 {
		initializer := instanceRegistrations[0]
		for _, registration := range instanceRegistrations[1:] {
			initializer = lowering.binary(initializer, ast.KindCommaToken, registration)
		}
		name := lowering.factory.NewPrivateIdentifier("#" + lowering.uniqueMutationName(fmt.Sprintf("__exactHelperRegistration_%d", source.Pos())))
		members = append([]*ast.Node{lowering.factory.NewPropertyDeclaration(nil, name, nil, nil, lowering.factory.NewParenthesizedExpression(initializer))}, members...)
	}
	if len(registrations) != 0 {
		members = append([]*ast.Node{lowering.factory.NewClassStaticBlockDeclaration(nil, lowering.factory.NewBlock(lowering.factory.NewNodeList(registrations), true))}, members...)
	}
	if ast.IsClassExpression(source) {
		return lowering.factory.UpdateClassExpression(source.AsClassExpression(), source.Modifiers(), lowering.helperClassName(source, plan), class.TypeParameters, class.HeritageClauses, lowering.factory.NewNodeList(members))
	}
	return lowering.factory.UpdateClassDeclaration(source.AsClassDeclaration(), source.Modifiers(), lowering.helperClassName(source, plan), class.TypeParameters, class.HeritageClauses, lowering.factory.NewNodeList(members))
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
	site := helperCallableParent(work)
	if site != nil && (ast.IsParameterDeclaration(site) || ast.IsBindingElement(site) || ast.IsPropertyAssignment(site) || ast.IsVariableDeclaration(site) || ast.IsPropertyDeclaration(site)) && site.Name() != nil && (ast.IsIdentifier(site.Name()) || ast.IsStringLiteral(site.Name())) {
		name = site.Name().Text()
	}
	if site != nil && ast.IsBinaryExpression(site) && site.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && ast.IsIdentifier(site.AsBinaryExpression().Left) {
		name = site.AsBinaryExpression().Left.Text()
	}
	original := lowering.visitHelperOriginal(work)
	if ast.IsFunctionDeclaration(work) {
		lowering.retainHelperDeclaration(work, companion)
		return original
	}
	field := site != nil && ast.IsPropertyDeclaration(site)
	var home *ast.Node
	if field && helperStaticMember(site) {
		home = lowering.factory.NewKeywordExpression(ast.KindThisKeyword)
	} else if field {
		if plan := lowering.helperClasses[nodeSpanKey(site.Parent)]; plan != nil && plan.fieldHome != nil {
			selected := lowering.factory.NewElementAccessExpression(lowering.factory.NewKeywordExpression(ast.KindThisKeyword), nil, plan.fieldHome, ast.NodeFlagsNone)
			home = lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
		}
	}
	if lexical := lowering.factoryHelperHome(work); lexical != nil {
		home = lexical
	}
	// Registration arguments must preserve the authored arrow context before inference.
	if typeNode := lowering.helperCallableTypes[nodeSpanKey(work)]; typeNode != nil {
		original = lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(original), typeNode)
	}
	registration := lowering.helperRegistration(original, companion, field, name, work, home)
	return lowering.retainLexicalHelperPolicy(work, registration)
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
	component, exists := lowering.components[name.Text()]
	return exists && component.Start == node.Pos() && component.Length == node.End()-node.Pos()
}

// sourceHasTaskHelpers keeps helper-only modules in the compilation pipeline.
func sourceHasTaskHelpers(source *ast.SourceFile) bool {
	found := false
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		classMember := node.Parent != nil && (ast.IsClassLike(node.Parent) || ast.IsPropertyDeclaration(node.Parent) && node.Parent.Parent != nil && ast.IsClassLike(node.Parent.Parent))
		if ast.IsFunctionLike(node) && node.Body() != nil && (classMember || helperCallableSite(node) || node.Parent != nil && ast.IsObjectLiteralExpression(node.Parent)) && (taskHelperNeedsCompanion(node) || helperNestedCallable(node)) {
			found = true
		}
		return !found
	})
	return found
}

// taskHelperNeedsCompanion retains a pending path for supported authored callables.
// A syntactic mutation screen cannot prove that captured custom methods, identity
// comparisons or returned references are independent of owned state. Keep original
// callables unchanged, and omit companions only at the separate JSX ownership boundary.
func taskHelperNeedsCompanion(work *ast.Node) bool {
	return helperHasBindingDefault(work) || work.SubtreeFacts()&ast.SubtreeContainsJsx == 0
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
		typeNode := parameter.Type
		if typeNode == nil {
			typeNode = lowering.helperParameterTypes[nodeSpanKey(node)]
		}
		parameters = append(parameters, lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(), parameter.DotDotDotToken, lowering.helperBindingName(work, context, parameter.Name()), parameter.QuestionToken, typeNode, initializer))
	}
	return parameters
}
