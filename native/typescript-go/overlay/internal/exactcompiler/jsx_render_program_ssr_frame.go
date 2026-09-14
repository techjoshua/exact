package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// ssrSinkFrame keeps generated locals in the synchronous invocation. A pending branch
// alone snapshots them; its callback captures that branch-local snapshot, not the outer locals.
// Reentry restores validated values and issued references without repeating preparation.
// Snapshot order is operations, context, invocation, output, stage, settled value, then locals.
// Snapshot cells are compiler-owned: their position determines their type. Explicit erased
// annotations preserve that invariant through generated-TypeScript semantic validation.
type ssrSinkFrame struct {
	lowering                          *jsxLowering
	arguments, locals, preparation    []*ast.Node
	localTypes                        []*ast.Node
	run, frame, stage, value, pending *ast.Node
}

func (lowering *jsxLowering) newSsrSinkFrame(plan renderProgramSsrPlan, preparation []*ast.Node) *ssrSinkFrame {
	f := lowering.factory
	frame := &ssrSinkFrame{
		lowering: lowering, arguments: []*ast.Node{plan.target, plan.context, plan.invocation, plan.output},
		run: f.NewIdentifier("__exactRun"), frame: f.NewIdentifier("__exactFrame"),
		stage: f.NewIdentifier("__exactStage"), value: f.NewIdentifier("__exactSettled"),
		pending: f.NewIdentifier("__exactPending"),
	}
	for _, statement := range preparation {
		if !ast.IsVariableStatement(statement) {
			frame.preparation = append(frame.preparation, statement)
			continue
		}
		for _, node := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			declaration := node.AsVariableDeclaration()
			if !ast.IsIdentifier(declaration.Name()) || declaration.Initializer == nil {
				panic("SSR continuation preparation requires initialized identifier locals")
			}
			frame.locals = append(frame.locals, declaration.Name())
			localType := f.NewKeywordTypeNode(ast.KindUnknownKeyword)
			if declaration.Initializer.Kind == ast.KindNumericLiteral {
				localType = f.NewKeywordTypeNode(ast.KindNumberKeyword)
			}
			frame.localTypes = append(frame.localTypes, localType)
			frame.preparation = append(frame.preparation, f.NewExpressionStatement(
				lowering.binary(declaration.Name(), ast.KindEqualsToken, declaration.Initializer)))
		}
	}
	return frame
}

func (frame *ssrSinkFrame) number(value int) *ast.Node {
	return frame.lowering.factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
}

func (frame *ssrSinkFrame) cell(receiver *ast.Node, index int) *ast.Node {
	return frame.lowering.factory.NewElementAccessExpression(receiver, nil, frame.number(index), ast.NodeFlagsNone)
}

// suspend exits the switch only when work is pending. One shared postlude keeps emitted frame
// construction linear in local count rather than repeating every local at every suspension site.
func (frame *ssrSinkFrame) suspend(promise *ast.Node, stage int) *ast.Node {
	lowering := frame.lowering
	f := lowering.factory
	return f.NewBlock(f.NewNodeList([]*ast.Node{
		f.NewExpressionStatement(lowering.binary(frame.pending, ast.KindEqualsToken, promise)),
		f.NewExpressionStatement(lowering.binary(frame.stage, ast.KindEqualsToken, frame.number(stage))),
		f.NewBreakStatement(nil),
	}), true)
}

func (frame *ssrSinkFrame) postlude() *ast.Node {
	lowering := frame.lowering
	f := lowering.factory
	saved := f.NewIdentifier("__exactSaved")
	values := append([]*ast.Node{}, frame.arguments...)
	values = append(values, frame.stage, f.NewVoidExpression(frame.number(0)))
	values = append(values, frame.locals...)
	declaration := f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList([]*ast.Node{
		f.NewVariableDeclaration(saved, nil, f.NewArrayTypeNode(f.NewKeywordTypeNode(ast.KindUnknownKeyword)), f.NewArrayLiteralExpression(f.NewNodeList(values), false)),
	}), ast.NodeFlagsConst))
	arguments := make([]*ast.Node, 0, 5)
	for index, argument := range frame.arguments {
		arguments = append(arguments, f.NewAsExpression(frame.cell(saved, index), f.NewTypeQueryNode(argument, nil)))
	}
	arguments = append(arguments, saved)
	resume := f.NewCallExpression(frame.run, nil, nil, f.NewNodeList(arguments), ast.NodeFlagsNone)
	result := f.NewIdentifier("__exactResult")
	parameters := []*ast.Node{f.NewParameterDeclaration(nil, nil, result, nil, nil, nil)}
	statements := []*ast.Node{f.NewExpressionStatement(lowering.binary(frame.cell(saved, 5), ast.KindEqualsToken, result))}
	statements = append(statements, f.NewReturnStatement(resume))
	callback := f.NewArrowFunction(nil, nil, f.NewNodeList(parameters), nil, nil,
		f.NewToken(ast.KindEqualsGreaterThanToken), f.NewBlock(f.NewNodeList(statements), true))
	then := f.NewPropertyAccessExpression(f.NewNonNullExpression(frame.pending, ast.NodeFlagsNone), nil, f.NewIdentifier("then"), ast.NodeFlagsNone)
	return f.NewBlock(f.NewNodeList([]*ast.Node{declaration,
		f.NewReturnStatement(f.NewCallExpression(then, nil, nil, f.NewNodeList([]*ast.Node{callback}), ast.NodeFlagsNone)),
	}), true)
}

func (frame *ssrSinkFrame) writer(traversal *ast.Node) *ast.Node {
	lowering := frame.lowering
	f := lowering.factory
	var declarations, restored, parameters []*ast.Node
	for index, name := range frame.locals {
		declarations = append(declarations, f.NewVariableDeclaration(name, nil, frame.localTypes[index], nil))
		restored = append(restored, f.NewExpressionStatement(lowering.binary(name, ast.KindEqualsToken, f.NewAsExpression(frame.cell(frame.frame, index+6), frame.localTypes[index]))))
	}
	declarations = append(declarations, f.NewVariableDeclaration(frame.stage, nil, nil, frame.number(0)),
		f.NewVariableDeclaration(frame.value, nil, f.NewKeywordTypeNode(ast.KindUnknownKeyword), nil), f.NewVariableDeclaration(frame.pending, nil, nil, nil))
	restored = append(restored,
		f.NewExpressionStatement(lowering.binary(frame.stage, ast.KindEqualsToken, f.NewAsExpression(frame.cell(frame.frame, 4), f.NewKeywordTypeNode(ast.KindNumberKeyword)))),
		f.NewExpressionStatement(lowering.binary(frame.value, ast.KindEqualsToken, frame.cell(frame.frame, 5))))
	for _, name := range frame.arguments {
		parameters = append(parameters, f.NewParameterDeclaration(nil, nil, name, nil, nil, nil))
	}
	parameters = append(parameters, f.NewParameterDeclaration(nil, nil, frame.frame, f.NewToken(ast.KindQuestionToken), f.NewArrayTypeNode(f.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil))
	body := []*ast.Node{
		f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList(declarations), ast.NodeFlagsLet)),
		f.NewIfStatement(frame.frame, f.NewBlock(f.NewNodeList(restored), true), f.NewBlock(f.NewNodeList(frame.preparation), true)),
		traversal,
		frame.postlude(),
	}
	resultType := f.NewUnionTypeNode(f.NewNodeList([]*ast.Node{f.NewTypeQueryNode(frame.arguments[3], nil), f.NewKeywordTypeNode(ast.KindUndefinedKeyword)}))
	returnType := f.NewUnionTypeNode(f.NewNodeList([]*ast.Node{resultType, f.NewTypeReferenceNode(f.NewIdentifier("Promise"), f.NewNodeList([]*ast.Node{resultType}))}))
	return f.NewFunctionExpression(nil, nil, frame.run, nil, f.NewNodeList(parameters), returnType, nil, f.NewBlock(f.NewNodeList(body), true))
}

// ssrSinkPreparation validates the straight-line plan boundary before removing local output
// allocation. Sibling ownership transfers after slot validation and before context mutation.
func ssrSinkPreparation(plan renderProgramSsrPlan, siblings []*ast.Node) []*ast.Node {
	prefixEnd := len(plan.statements) - 1
	if len(plan.writes) > 0 {
		prefixEnd = plan.writes[0].statement
		for index, write := range plan.writes {
			if write.statement != prefixEnd+index {
				panic("SSR continuation plan contains an unclassified statement between writes")
			}
		}
		if prefixEnd+len(plan.writes) != len(plan.statements)-1 {
			panic("SSR continuation plan contains an unclassified statement after writes")
		}
	}
	body := append([]*ast.Node{}, plan.statements[:plan.outputDeclaration-1]...)
	body = append(body, siblings...)
	body = append(body, plan.statements[plan.outputDeclaration-1])
	return append(body, plan.statements[plan.outputDeclaration+1:prefixEnd]...)
}
