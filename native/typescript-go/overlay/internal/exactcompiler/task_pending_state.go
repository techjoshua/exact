package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// pendingStateTypeFacts captures authored types and native method identity before reparenting.
// Runtime ownership decides whether aliases and helper results belong to this invocation.
func (lowering *jsxLowering) capturePendingStateFacts(tasks []Task) {
	lowering.pendingCollectionCalls = map[string]bool{}
	lowering.pendingHelperCalls = map[string]bool{}
	lowering.pendingInlineHelperCalls = map[string]bool{}
	lowering.pendingOwnedValues = map[string]bool{}
	lowering.pendingOwnedAliases = map[string]pendingStateAlias{}
	if lowering.checker == nil {
		return
	}
	needed := len(lowering.helperClasses) != 0 || len(lowering.helperInitializers) != 0 || len(lowering.helperObjects) != 0
	for _, task := range tasks {
		if task.Readiness != "blocking" {
			continue
		}
		needed = true
		if lowering.taskHasPendingHelper(task) {
			needed = true
		}
		for _, write := range lowering.writes {
			if write.Start >= task.WorkStart && write.Start+write.Length <= task.WorkStart+task.WorkLength && pendingCollectionWrite(write) {
				needed = true
			}
		}
	}
	if !needed {
		return
	}
	lowering.capturePendingOwnedAliases()
	reads := map[string]bool{}
	for _, read := range lowering.stateReads {
		reads[fmt.Sprintf("%d:%d", read.Start, read.Length)] = true
	}
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		capture := reads[nodeSpanKey(node)]
		if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
			capture = true
			var receiver *ast.Node
			if ast.IsPropertyAccessExpression(node) {
				receiver = node.AsPropertyAccessExpression().Expression
			} else {
				receiver = node.AsElementAccessExpression().Expression
			}
			lowering.mutationFacts.capture(nodeSpanKey(receiver), mutationTypePending, lowering.authoredMutationType(receiver))
		}
		if target, operation := stateWriteTarget(node, lowering.checker); operation != "" && target != nil && (ast.IsPropertyAccessExpression(target) || ast.IsElementAccessExpression(target)) {
			lowering.mutationFacts.capture(nodeSpanKey(node), mutationTypeDestination, lowering.authoredMutationType(target))
		}
		if ast.IsCallExpression(node) {
			callee := node.AsCallExpression().Expression
			if helperBindingReceiver(node) != nil {
				lowering.pendingHelperCalls[nodeSpanKey(node)] = true
				capture = true
			}
			if ast.IsPropertyAccessExpression(callee) && callee.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier {
				capture = true
				lowering.pendingHelperCalls[nodeSpanKey(node)] = true
			}
			if symbol := resolvedCallableSymbol(lowering.checker.GetSymbolAtLocation(callee), lowering.checker); symbol != nil {
				if _, task := lowering.taskDefinitions[ast.GetSymbolId(symbol)]; !task {
					for _, argument := range callArguments(node) {
						if argument.Kind == ast.KindThisKeyword || (lowering.hasReactiveComponentCapture(argument) || lowering.pendingOwnedValues[nodeSpanKey(argument)]) && lowering.checker.GetTypeAtLocation(argument).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsUnion|checker.TypeFlagsAny) != 0 {
							lowering.pendingHelperCalls[nodeSpanKey(node)] = true
							capture = true
						}
					}
					for _, declaration := range symbol.Declarations {
						if ast.IsPropertyDeclaration(declaration) && declaration.AsPropertyDeclaration().Initializer != nil {
							declaration = declaration.AsPropertyDeclaration().Initializer
						}
						if ast.IsVariableDeclaration(declaration) && declaration.AsVariableDeclaration().Initializer != nil {
							declaration = declaration.AsVariableDeclaration().Initializer
							if ast.IsCallExpression(declaration) {
								if callableAliasTarget(declaration, lowering.checker) != nil {
									lowering.pendingHelperCalls[nodeSpanKey(node)] = true
									capture = true
								}
								call := declaration.AsCallExpression()
								file := ast.GetSourceFileOfNode(declaration)
								if file != nil {
									imports := collectExternalImportBindings(file, lowering.checker)
									if reference, ok := externalImportForExpression(call.Expression, imports, lowering.checker); ok && reference.moduleSpecifier == "@exactjs/core/runtime/task-helpers" && reference.exportName == "registerTaskHelper" && len(callArguments(declaration)) > 0 {
										declaration = callArguments(declaration)[0]
									}
								}
							}
						}
						if ast.IsMethodDeclaration(declaration) || ast.IsFunctionDeclaration(declaration) || ast.IsArrowFunction(declaration) || ast.IsFunctionExpression(declaration) {
							if declaration.Body() != nil {
								lowering.pendingHelperCalls[nodeSpanKey(node)] = true
								if ast.GetSourceFileOfNode(declaration) == lowering.sourceFile {
									for _, task := range tasks {
										if declaration.Pos() >= task.WorkStart && declaration.End() <= task.WorkStart+task.WorkLength {
											lowering.pendingInlineHelperCalls[nodeSpanKey(node)] = true
										}
									}
								}
								capture = true
							}
						}
					}
				}
			}
			if ast.IsPropertyAccessExpression(callee) {
				member := callee.AsPropertyAccessExpression()
				receiver := lowering.checker.GetTypeAtLocation(member.Expression)
				method := member.Name().Text()
				if nativeCollectionMethod(receiver, method, "Map", lowering.checker) || nativeCollectionMethod(receiver, method, "Set", lowering.checker) || nativeCollectionMethod(receiver, method, "ReadonlyMap", lowering.checker) || nativeCollectionMethod(receiver, method, "ReadonlySet", lowering.checker) || nativeCollectionMethod(receiver, method, "Array", lowering.checker) || nativeCollectionMethod(receiver, method, "ReadonlyArray", lowering.checker) {
					lowering.pendingCollectionCalls[nodeSpanKey(node)] = true
					capture = true
					for _, argument := range callArguments(node) {
						lowering.captureMutationArgumentType(argument)
					}
				}
			}
			// Published declarations can hide a zero-argument method's body. Its proven state
			// receiver carries ownership even when no authored argument can carry that fact.
			var receiver *ast.Node
			if ast.IsPropertyAccessExpression(callee) {
				receiver = callee.AsPropertyAccessExpression().Expression
			} else if ast.IsElementAccessExpression(callee) {
				receiver = callee.AsElementAccessExpression().Expression
			}
			if receiver != nil && !lowering.pendingCollectionCalls[nodeSpanKey(node)] && (lowering.hasReactiveComponentCapture(receiver) || lowering.pendingOwnedValues[nodeSpanKey(receiver)]) && lowering.checker.GetTypeAtLocation(receiver).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsUnion|checker.TypeFlagsAny) != 0 {
				symbol := resolvedCallableSymbol(lowering.checker.GetSymbolAtLocation(callee), lowering.checker)
				boundTask := false
				if symbol != nil {
					_, boundTask = lowering.taskDefinitions[ast.GetSymbolId(symbol)]
				}
				if !boundTask {
					lowering.pendingHelperCalls[nodeSpanKey(node)] = true
					capture = true
				}
			}
			if lowering.pendingHelperCalls[nodeSpanKey(node)] {
				for _, argument := range callArguments(node) {
					lowering.captureMutationArgumentType(argument)
				}
			}
		}
		if capture {
			value := lowering.checker.GetTypeAtLocation(node)
			if value.Flags()&checker.TypeFlagsNever == 0 {
				lowering.mutationFacts.capture(nodeSpanKey(node), mutationTypePending, lowering.authoredMutationType(node))
			}
		}
		return true
	})
}

func (lowering *jsxLowering) taskNeedsPendingState(task Task) bool {
	if lowering.checking || lowering.target == TargetServer || task.Readiness != "blocking" {
		return false
	}
	if lowering.taskHasPendingHelper(task) {
		return true
	}
	for _, write := range lowering.writes {
		if write.Start >= task.WorkStart && write.Start+write.Length <= task.WorkStart+task.WorkLength && pendingCollectionWrite(write) {
			return true
		}
	}
	return false
}

// taskHasPendingHelper selects invocation cells when local callable parameters can carry state
// identity. Ordinary scalar tasks keep the compiler-local path without a runtime context.
func (lowering *jsxLowering) taskHasPendingHelper(task Task) bool {
	found := false
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() < task.WorkStart || node.End() > task.WorkStart+task.WorkLength {
			return true
		}
		if lowering.pendingHelperCalls[nodeSpanKey(node)] || ast.IsFunctionLike(node) && node.Pos() != task.WorkStart && len(node.Parameters()) > 0 {
			found = true
			return false
		}
		return !found
	})
	return found
}

func pendingCollectionWrite(write StateWrite) bool {
	return write.Operation == "map-mutation" || write.Operation == "set-mutation" || write.Operation == "array-mutation"
}

// pendingStateOperation keeps receivers and eager awaits in the authored function. Only the
// context owns publication, so results and later reads use the same pending cells.
func (lowering *jsxLowering) pendingStateOperation(node, context *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if ast.IsIdentifier(node) && lowering.pendingOwnedValues[nodeSpanKey(node)] && !pendingReadIsWriteTarget(node) && !isNonReferenceComponentIdentifier(node) {
		return lowering.helperContextCall(context, "own", []*ast.Node{node})
	}
	if result := lowering.pendingOptionalRead(node, context, visitor); result != nil {
		return result
	}
	plan := planMutationOperation(node)
	operation := func(method string, arguments []*ast.Node) *ast.Node {
		callee := lowering.factory.NewPropertyAccessExpression(context, nil, lowering.factory.NewIdentifier(method), ast.NodeFlagsNone)
		return lowering.factory.NewCallExpression(callee, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
	}
	memberParts := func(target *ast.Node) (receiver, key *ast.Node) {
		if ast.IsPropertyAccessExpression(target) {
			member := target.AsPropertyAccessExpression()
			if member.Name().Kind == ast.KindPrivateIdentifier {
				return nil, nil
			}
			return visitor.VisitNode(member.Expression), lowering.factory.NewStringLiteral(member.Name().Text(), ast.TokenFlagsNone)
		}
		if ast.IsElementAccessExpression(target) {
			member := target.AsElementAccessExpression()
			return visitor.VisitNode(member.Expression), operation("key", []*ast.Node{visitor.VisitNode(member.ArgumentExpression)})
		}
		return nil, nil
	}
	if ast.IsDeleteExpression(node) {
		receiver, key := memberParts(plan.target)
		if receiver != nil {
			return operation("remove", []*ast.Node{receiver, key})
		}
	}
	if ast.IsCallExpression(node) && lowering.pendingCollectionCalls[nodeSpanKey(node)] {
		receiver, key := memberParts(plan.target)
		arguments := []*ast.Node{}
		for _, argument := range callArguments(node) {
			value := lowering.visitor.VisitNode(visitor.VisitNode(argument))
			if typeNode := lowering.mutationFacts.at(nodeSpanKey(argument)).argument; typeNode != nil {
				value = lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(value), typeNode)
			}
			arguments = append(arguments, value)
		}
		selection := []*ast.Node{receiver, key}
		callee := plan.target
		if ast.IsPropertyAccessExpression(callee) && callee.AsPropertyAccessExpression().Expression.Kind == ast.KindSuperKeyword {
			selection = []*ast.Node{lowering.factory.NewKeywordExpression(ast.KindThisKeyword), key, callee}
		}
		selected := operation("method", selection)
		result := lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
		if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil {
			result = lowering.factory.NewAsExpression(result, typeNode)
		}
		return result
	}
	if ast.IsCallExpression(node) && lowering.pendingHelperCalls[nodeSpanKey(node)] {
		callee := plan.target
		receiver, key := memberParts(callee)
		var selected *ast.Node
		if receiver != nil {
			selected = operation("helperMember", []*ast.Node{receiver, key, lowering.factory.NewFalseExpression()})
			if lowering.pendingInlineHelperCalls[nodeSpanKey(node)] {
				selected = operation("helperMember", []*ast.Node{receiver, key, lowering.factory.NewTrueExpression()})
			}
		} else {
			selected = operation("helper", []*ast.Node{visitor.VisitNode(callee)})
			if lowering.pendingInlineHelperCalls[nodeSpanKey(node)] {
				selected = operation("helper", []*ast.Node{visitor.VisitNode(callee), lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)), lowering.factory.NewTrueExpression()})
			}
		}
		arguments := []*ast.Node{}
		for _, argument := range callArguments(node) {
			arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
		}
		result := lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
		if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil {
			result = lowering.factory.NewAsExpression(result, typeNode)
		}
		return result
	}
	if plan.kind == mutationAssign {
		write := lowering.writes[nodeSpanKey(node)]
		write.Start, write.Length = node.Pos(), node.End()-node.Pos()
		receiver, key := memberParts(plan.target)
		if receiver != nil {
			return operation("write", []*ast.Node{receiver, key, lowering.contextualAssignmentValue(visitor.VisitNode(plan.value), write)})
		}
	}
	if _, exists := lowering.writes[nodeSpanKey(node)]; !exists {
		if lowering.mutationFacts.at(nodeSpanKey(node)).destination != nil && (ast.IsBinaryExpression(node) || ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node)) {
			target, _ := stateWriteTarget(node, nil)
			if ast.IsPropertyAccessExpression(target) && target.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier {
				return nil
			}
			write := StateWrite{Start: node.Pos(), Length: node.End() - node.Pos()}
			if result := lowering.lowerSuspendedStateWrite(node, write, nil, false, visitor); result != nil {
				return result
			}
		}
	}
	if node.Parent != nil && (ast.IsSpreadElement(node.Parent) && node.Parent.AsSpreadElement().Expression == node || ast.IsForOfStatement(node.Parent) && node.Parent.AsForInOrOfStatement().Expression == node) {
		value := visitor.VisitEachChild(node)
		if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil {
			receiver, key := memberParts(node)
			if receiver != nil {
				value = lowering.factory.NewAsExpression(operation("read", []*ast.Node{receiver, key}), typeNode)
			}
		}
		return operation("iterable", []*ast.Node{value})
	}
	if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil && node.Flags&ast.NodeFlagsOptionalChain == 0 && !pendingReadIsWriteTarget(node) && !(node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node) {
		receiver, key := memberParts(node)
		if receiver != nil {
			return lowering.factory.NewAsExpression(operation("read", []*ast.Node{receiver, key}), typeNode)
		}
	}
	return nil
}

// A selected write receiver is still a read. Only the final reference or destructuring target
// must remain assignable syntax, including generated setter targets from normalization.
func pendingReadIsWriteTarget(node *ast.Node) bool {
	parent := node.Parent
	if parent != nil && (ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == node || ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == node) {
		return false
	}
	return identifierIsWriteTarget(node) || insideStateWriteTarget(node) || isDeleteOperand(node)
}
