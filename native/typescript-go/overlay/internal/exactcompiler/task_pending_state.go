package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// pendingStateTypeFacts captures authored types and native method identity before reparenting.
// Runtime ownership decides whether aliases and helper results belong to this invocation.
func (lowering *jsxLowering) capturePendingStateFacts(tasks []Task) {
	lowering.pendingNamespaceReads = map[SourceSpan]bool{}
	lowering.pendingCollectionCalls = map[SourceSpan]bool{}
	lowering.pendingHelperCalls = map[SourceSpan]bool{}
	lowering.pendingInlineHelperCalls = map[SourceSpan]bool{}
	lowering.pendingOwnedValues = map[SourceSpan]bool{}
	lowering.pendingOwnedAliases = map[SourceSpan]pendingStateAlias{}
	if lowering.checker == nil {
		return
	}
	needed := false
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
	reads := map[SourceSpan]bool{}
	for _, read := range lowering.stateReads {
		reads[SourceSpan{Start: read.Start, Length: read.Length}] = true
	}
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		capture := reads[nodeSourceSpan(node)]
		if ast.IsTaggedTemplateExpression(node) {
			tag := node.AsTaggedTemplateExpression().Tag
			value := lowering.checker.GetTypeAtLocation(tag)
			// The invocation supplies this. Removing only its explicit parameter
			// preserves authored generic and overloaded argument/result signatures.
			typeNode := lowering.checker.TypeToTypeNode(value, tag, nodebuilder.FlagsNoTruncation|nodebuilder.FlagsOmitThisParameter, nil)
			lowering.mutationFacts.capture(nodeSourceSpan(node), mutationTypeBoundCallable, typeNode)
		}
		if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
			capture = true
			var receiver *ast.Node
			if ast.IsPropertyAccessExpression(node) {
				receiver = node.AsPropertyAccessExpression().Expression
			} else {
				receiver = node.AsElementAccessExpression().Expression
			}
			if ast.IsIdentifier(receiver) {
				if symbol := lowering.checker.GetSymbolAtLocation(receiver); symbol != nil {
					for _, declaration := range symbol.Declarations {
						if ast.IsNamespaceImport(declaration) {
							lowering.pendingNamespaceReads[nodeSourceSpan(node)] = true
						}
					}
				}
			}
			lowering.mutationFacts.capture(nodeSourceSpan(receiver), mutationTypePending, lowering.authoredMutationType(receiver))
		}
		if target, operation := stateWriteTarget(node, lowering.checker); operation != "" && target != nil && (ast.IsPropertyAccessExpression(target) || ast.IsElementAccessExpression(target)) {
			lowering.mutationFacts.capture(nodeSourceSpan(node), mutationTypeDestination, lowering.authoredMutationType(target))
		}
		if ast.IsCallExpression(node) {
			callee := node.AsCallExpression().Expression
			symbol := resolvedCallableSymbol(lowering.checker.GetSymbolAtLocation(callee), lowering.checker)
			// Factory results and expression-selected callables have no binding symbol.
			// Their call signatures identify ordinary helpers whose inputs may need
			// invocation-owned views. Their implementations remain host-owned.
			// Unchecked JavaScript can expose the same selection as any, with no signatures.
			if symbol == nil && callee.Kind != ast.KindImportKeyword && callee.Kind != ast.KindSuperKeyword {
				value := lowering.checker.GetTypeAtLocation(callee)
				if value.Flags()&checker.TypeFlagsAny != 0 || len(lowering.checker.GetSignaturesOfType(value, checker.SignatureKindCall)) != 0 {
					lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
					capture = true
				}
			}
			if ast.IsPropertyAccessExpression(callee) && callee.AsPropertyAccessExpression().Name().Kind == ast.KindPrivateIdentifier {
				capture = true
				lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
			}
			if symbol != nil {
				// A guard can narrow an optional or mixed callable property while its
				// generated pending read cannot narrow the original receiver. Select
				// that member through the invocation so checking and pending value
				// selection retain the authored guard and receiver binding.
				if ast.IsPropertyAccessExpression(callee) || ast.IsElementAccessExpression(callee) {
					declared := lowering.checker.GetTypeOfSymbol(symbol)
					selected := lowering.checker.GetTypeAtLocation(callee)
					if declared != selected && declared.Flags()&checker.TypeFlagsUnion != 0 {
						lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
						capture = true
					}
				}
				if _, task := lowering.taskDefinitions[ast.GetSymbolId(symbol)]; !task {
					for _, argument := range callArguments(node) {
						if argument.Kind == ast.KindThisKeyword || (lowering.hasReactiveComponentCapture(argument) || lowering.pendingOwnedValues[nodeSourceSpan(argument)]) && lowering.checker.GetTypeAtLocation(argument).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsUnion|checker.TypeFlagsAny) != 0 {
							lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
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
									lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
									capture = true
								}

							}
						}
						if ast.IsMethodDeclaration(declaration) || ast.IsFunctionDeclaration(declaration) || ast.IsArrowFunction(declaration) || ast.IsFunctionExpression(declaration) {
							if declaration.Body() != nil {
								lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
								if ast.GetSourceFileOfNode(declaration) == lowering.sourceFile {
									for _, task := range tasks {
										if declaration.Pos() >= task.WorkStart && declaration.End() <= task.WorkStart+task.WorkLength {
											lowering.pendingInlineHelperCalls[nodeSourceSpan(node)] = true
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
					lowering.pendingCollectionCalls[nodeSourceSpan(node)] = true
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
			if receiver != nil && !lowering.pendingCollectionCalls[nodeSourceSpan(node)] && (lowering.hasReactiveComponentCapture(receiver) || lowering.pendingOwnedValues[nodeSourceSpan(receiver)]) && lowering.checker.GetTypeAtLocation(receiver).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsUnion|checker.TypeFlagsAny) != 0 {
				boundTask := false
				if symbol != nil {
					_, boundTask = lowering.taskDefinitions[ast.GetSymbolId(symbol)]
				}
				if !boundTask {
					lowering.pendingHelperCalls[nodeSourceSpan(node)] = true
					capture = true
				}
			}
			if lowering.pendingHelperCalls[nodeSourceSpan(node)] {
				for _, argument := range callArguments(node) {
					lowering.captureMutationArgumentType(argument)
				}
			}
		}
		if capture {
			value := lowering.checker.GetTypeAtLocation(node)
			// Routed helpers still throw or terminate. Their result must retain never in
			// defaults and other value contexts even though the invocation API erases types.
			if value.Flags()&checker.TypeFlagsNever == 0 || ast.IsCallExpression(node) && lowering.pendingHelperCalls[nodeSourceSpan(node)] {
				lowering.mutationFacts.capture(nodeSourceSpan(node), mutationTypePending, lowering.authoredMutationType(node))
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
		if lowering.pendingHelperCalls[nodeSourceSpan(node)] || ast.IsFunctionLike(node) && node.Pos() != task.WorkStart && len(node.Parameters()) > 0 {
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
	// A super reference is lexical syntax, never a value that can be passed
	// as a pending receiver. Keep its selected member and evaluate keys normally.
	if ast.IsPropertyAccessExpression(node) && node.AsPropertyAccessExpression().Expression.Kind == ast.KindSuperKeyword {
		return visitor.VisitEachChild(node)
	}
	if ast.IsElementAccessExpression(node) && node.AsElementAccessExpression().Expression.Kind == ast.KindSuperKeyword {
		return visitor.VisitEachChild(node)
	}
	if reference := lowering.pendingNativeReference(node, context, visitor); reference != nil {
		return reference
	}
	if copy := lowering.pendingObjectCopy(node, context, visitor); copy != nil {
		return copy
	}
	// Imported namespace bindings are live module exports, not transaction-owned
	// cells. Preserve their source access for subsequent host export replacement.
	// Their selected exported objects still receive normal pending lowering.
	if lowering.pendingNamespaceReads[nodeSourceSpan(node)] && !pendingReadIsWriteTarget(node) {
		return visitor.VisitEachChild(node)
	}
	if ast.IsIdentifier(node) && lowering.pendingOwnedValues[nodeSourceSpan(node)] && !pendingReadIsWriteTarget(node) && !isNonReferenceComponentIdentifier(node) {
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
	if ast.IsTaggedTemplateExpression(node) {
		tagged := node.AsTaggedTemplateExpression()
		receiver, key := memberParts(tagged.Tag)
		if receiver != nil && receiver.Kind != ast.KindSuperKeyword {
			// Native tagged templates retain one template object per source site.
			// Select the member before substitutions without lowering the template
			// into an ordinary call or dropping the authored receiver.
			selected := operation("helperMember", []*ast.Node{receiver, key, lowering.factory.NewFalseExpression()})
			if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).boundCallable; typeNode != nil {
				selected = lowering.factory.NewAsExpression(selected, typeNode)
			}
			return lowering.factory.UpdateTaggedTemplateExpression(tagged, selected, tagged.QuestionDotToken, tagged.TypeArguments, visitor.VisitNode(tagged.Template), tagged.Flags)
		}
	}
	if ast.IsDeleteExpression(node) {
		receiver, key := memberParts(plan.target)
		if receiver != nil {
			return operation("remove", []*ast.Node{receiver, key})
		}
	}
	if ast.IsCallExpression(node) && lowering.pendingCollectionCalls[nodeSourceSpan(node)] {
		receiver, key := memberParts(plan.target)
		arguments := []*ast.Node{}
		for _, argument := range callArguments(node) {
			value := lowering.visitor.VisitNode(visitor.VisitNode(argument))
			if typeNode := lowering.mutationFacts.at(nodeSourceSpan(argument)).argument; typeNode != nil {
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
		if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).pending; typeNode != nil {
			result = lowering.factory.NewAsExpression(result, typeNode)
		}
		return result
	}
	if ast.IsCallExpression(node) && lowering.pendingHelperCalls[nodeSourceSpan(node)] {
		callee := plan.target
		receiver, key := memberParts(callee)
		selected := lowering.pendingPrivateHelperSelection(callee, context, visitor, false)
		if receiver != nil && receiver.Kind == ast.KindSuperKeyword {
			selected = operation("helper", []*ast.Node{visitor.VisitNode(callee), lowering.factory.NewKeywordExpression(ast.KindThisKeyword), lowering.factory.NewFalseExpression()})
		}
		if selected == nil {
			if receiver != nil {
				selected = operation("helperMember", []*ast.Node{receiver, key, lowering.factory.NewFalseExpression()})
				if lowering.pendingInlineHelperCalls[nodeSourceSpan(node)] {
					selected = operation("helperMember", []*ast.Node{receiver, key, lowering.factory.NewTrueExpression()})
				}
			} else {
				selected = operation("helper", []*ast.Node{visitor.VisitNode(callee)})
				if lowering.pendingInlineHelperCalls[nodeSourceSpan(node)] {
					selected = operation("helper", []*ast.Node{visitor.VisitNode(callee), lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)), lowering.factory.NewTrueExpression()})
				}
			}
		}
		arguments := []*ast.Node{}
		for _, argument := range callArguments(node) {
			arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
		}
		result := lowering.factory.NewCallExpression(selected, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
		if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).pending; typeNode != nil {
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
		if lowering.mutationFacts.at(nodeSourceSpan(node)).destination != nil && (ast.IsBinaryExpression(node) || ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node)) {
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
		if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).pending; typeNode != nil {
			receiver, key := memberParts(node)
			if receiver != nil {
				value = lowering.factory.NewAsExpression(operation("read", []*ast.Node{receiver, key}), typeNode)
			}
		}
		return operation("iterable", []*ast.Node{value})
	}
	if typeNode := lowering.mutationFacts.at(nodeSourceSpan(node)).pending; typeNode != nil && node.Flags&ast.NodeFlagsOptionalChain == 0 && !pendingReadIsWriteTarget(node) && !(node.Parent != nil && ast.IsCallExpression(node.Parent) && node.Parent.AsCallExpression().Expression == node) {
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
