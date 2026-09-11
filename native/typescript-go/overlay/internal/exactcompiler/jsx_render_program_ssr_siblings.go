package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// prepareSsrSinkSiblings issues direct references after slot validation, then transfers the
// sibling preparation resource to caller-owned output. The same references are visited later,
// preserving parallel task startup and disposal of unvisited siblings when traversal fails.
func (lowering *jsxLowering) prepareSsrSinkSiblings(plan *renderProgramSsrPlan) []*ast.Node {
	f := lowering.factory
	var statements, references []*ast.Node
	property := func(receiver *ast.Node, name string) *ast.Node {
		return f.NewPropertyAccessExpression(receiver, nil, f.NewIdentifier(name), ast.NodeFlagsNone)
	}
	call := func(receiver *ast.Node, name string, arguments []*ast.Node) *ast.Node {
		return f.NewCallExpression(property(receiver, name), nil, nil, f.NewNodeList(arguments), ast.NodeFlagsNone)
	}
	for index := range plan.writes {
		write := &plan.writes[index]
		if write.method != "directComponent" && write.method != "component" {
			continue
		}
		expression := plan.statements[write.statement].AsExpressionStatement().Expression
		assignment := expression.AsBinaryExpression()
		arguments := assignment.Right.Arguments()
		reference := arguments[2]
		if write.method == "directComponent" {
			reference = f.NewIdentifier("__exactSibling_" + strconv.Itoa(len(references)))
			referenceArguments := append([]*ast.Node(nil), arguments[2:4]...)
			if ast.IsIdentifier(arguments[3]) {
				if proof := plan.scalarPropsProofs[arguments[3].Text()]; proof != nil {
					referenceArguments = append(referenceArguments, proof, plan.invocation)
				}
			}
			statements = append(statements, f.NewVariableStatement(nil,
				f.NewVariableDeclarationList(f.NewNodeList([]*ast.Node{
					f.NewVariableDeclaration(reference, nil, nil, call(plan.target, "reference", referenceArguments)),
				}), ast.NodeFlagsConst)))
			componentArguments := []*ast.Node{arguments[0], arguments[1], reference}
			componentArguments = append(componentArguments, arguments[4:]...)
			plan.statements[write.statement] = f.NewExpressionStatement(lowering.binary(
				assignment.Left, ast.KindEqualsToken, call(plan.target, "component", componentArguments)))
			write.method = "component"
		}
		references = append(references, reference)
	}
	if len(references) != 0 {
		prepare := call(plan.output, "prepareReferences", []*ast.Node{
			f.NewArrayLiteralExpression(f.NewNodeList(references), false),
		})
		statements = append(statements, f.NewIfStatement(property(plan.output, "prepareReferences"),
			f.NewExpressionStatement(lowering.binary(property(plan.output, "preparation"), ast.KindEqualsToken, prepare)), nil))
	}
	return statements
}
