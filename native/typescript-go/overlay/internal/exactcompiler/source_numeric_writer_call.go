package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// localNumericWriterCall excludes direct writer discovery through a lexical
// numeric expression helper. The original call and operand owners still
// evaluate the argument, execute the helper, and deliver the numeric result.
func (q *sourceValueQuery) localNumericWriterCall(call *ast.Node, bindings sourceValueBindings) bool {
	expression, arguments := call.Expression(), call.AsCallExpression().Arguments
	if !ast.IsIdentifier(expression) || ast.IsOptionalChain(call) || arguments == nil || len(arguments.Nodes) != 1 {
		return false
	}
	c := q.owner.checker
	symbol := c.GetSymbolAtLocation(expression)
	if symbol == nil || len(symbol.Declarations) != 1 || !envelopeSynchronousFunction(symbol.ValueDeclaration) {
		return false
	}
	fn := symbol.ValueDeclaration
	source := ast.GetSourceFileOfNode(call)
	if ast.GetSourceFileOfNode(fn) != source || !ast.IsExternalModule(source) {
		return false
	}
	if _, substituted := bindings[ast.GetSymbolId(symbol)]; substituted {
		return false
	}
	parameters, statements := fn.Parameters(), fn.Body().AsBlock().Statements.Nodes
	if len(parameters) != 1 || len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return false
	}
	param := parameters[0].AsParameterDeclaration()
	if !ast.IsIdentifier(param.Name()) || param.Type == nil || param.Type.Kind != ast.KindNumberKeyword ||
		param.Initializer != nil || param.DotDotDotToken != nil {
		return false
	}
	index := q.owner.index(source)
	if index.incomplete || index.normalDynamicScope || q.owner.bindingWritten(symbol) {
		return false
	}
	return numericWriterExpression(statements[0].AsReturnStatement().Expression, c, parameters[0]) &&
		numericWriterExpression(arguments.Nodes[0], c, nil)
}

// numericWriterExpression accepts arithmetic syntax whose operands cannot
// reach authored code. Helpers may read their sole parameter. Actuals may
// read checked numeric lexical bindings, with their original evaluation kept.
func numericWriterExpression(node *ast.Node, c *checker.Checker, parameter *ast.Node) bool {
	if node == nil {
		return false
	}
	switch node.Kind {
	case ast.KindNumericLiteral:
		return true
	case ast.KindIdentifier:
		symbol := c.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil {
			return false
		}
		if parameter != nil {
			return symbol.ValueDeclaration == parameter
		}
		return ast.GetSourceFileOfNode(symbol.ValueDeclaration) == ast.GetSourceFileOfNode(node) &&
			symbol.ValueDeclaration.Flags&ast.NodeFlagsAmbient == 0 &&
			(ast.IsVariableDeclaration(symbol.ValueDeclaration) || ast.IsParameterDeclaration(symbol.ValueDeclaration)) &&
			c.GetTypeAtLocation(node).Flags()&checker.TypeFlagsNumberLike != 0
	case ast.KindParenthesizedExpression:
		return numericWriterExpression(node.AsParenthesizedExpression().Expression, c, parameter)
	case ast.KindPrefixUnaryExpression:
		unary := node.AsPrefixUnaryExpression()
		return (unary.Operator == ast.KindPlusToken || unary.Operator == ast.KindMinusToken) &&
			numericWriterExpression(unary.Operand, c, parameter)
	case ast.KindBinaryExpression:
		binary := node.AsBinaryExpression()
		switch binary.OperatorToken.Kind {
		case ast.KindPlusToken, ast.KindMinusToken, ast.KindAsteriskToken, ast.KindSlashToken,
			ast.KindPercentToken, ast.KindAsteriskAsteriskToken, ast.KindLessThanToken,
			ast.KindLessThanEqualsToken, ast.KindGreaterThanToken, ast.KindGreaterThanEqualsToken:
			return numericWriterExpression(binary.Left, c, parameter) && numericWriterExpression(binary.Right, c, parameter)
		}
	case ast.KindConditionalExpression:
		conditional := node.AsConditionalExpression()
		return numericWriterExpression(conditional.Condition, c, parameter) &&
			numericWriterExpression(conditional.WhenTrue, c, parameter) &&
			numericWriterExpression(conditional.WhenFalse, c, parameter)
	}
	return false
}
