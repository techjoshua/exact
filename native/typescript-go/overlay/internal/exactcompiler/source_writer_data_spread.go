package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedDataSpreadWriterCall excludes a local module Call from indexed writer
// discovery when its literal-copy body and freshly evaluated actual cannot
// enter the writer. The original Call still owns its effects and return value.
func (q *sourceValueQuery) closedDataSpreadWriterCall(call, writer *ast.Node, bindings sourceValueBindings, request *sourceWriterInputRequest) bool {
	if !q.dependenciesOnly || q.executable == nil || q.operation != nil || q.returnObservation != nil ||
		enclosingCallableNode(call) != nil || !ast.IsIdentifier(call.Expression()) || call.AsCallExpression().QuestionDotToken != nil {
		return false
	}
	if request != nil && (request.member != nil || request.descriptorWork != nil || request.writerSourceWork != nil || request.nativeIssuer != nil) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || !ast.IsObjectLiteralExpression(actuals[0]) {
		return false
	}
	symbol, body := stagedLexicalFunctionImplementation(call.Expression(), q.executable)
	if body == nil || body == writer || !ast.IsSourceFile(body.Parent) || !envelopeSynchronousFunction(body) {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(call))
	if index.incomplete || index.normalDynamicScope || index.normalExportUnknown || index.normalExported[ast.GetSymbolId(symbol)] ||
		!ast.IsExternalModule(ast.GetSourceFileOfNode(body)) || q.owner.bindingWritten(symbol) {
		return false
	}
	parameters := body.Parameters()
	statements := body.Body().AsBlock().Statements.Nodes
	if len(parameters) != 1 || len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return false
	}
	formal := parameters[0]
	if formal.Name() == nil || !ast.IsIdentifier(formal.Name()) || formal.Name().Text() == "this" ||
		formal.Initializer() != nil || formal.AsParameterDeclaration().DotDotDotToken != nil {
		return false
	}
	returned := unwrapSourceCallableReference(statements[0].Expression())
	if returned == nil || !ast.IsObjectLiteralExpression(returned) {
		return false
	}
	fields := returned.AsObjectLiteralExpression().Properties.Nodes
	if len(fields) != 2 || !plainWriterCopyField(fields[0]) || !sourceInertValueCreation(fields[0].Initializer()) ||
		!ast.IsSpreadAssignment(fields[1]) {
		return false
	}
	spread := fields[1].Expression()
	if spread == nil || !ast.IsIdentifier(spread) {
		return false
	}
	formalSymbol := q.owner.checker.GetSymbolAtLocation(spread)
	if formalSymbol == nil || formalSymbol.ValueDeclaration != formal {
		return false
	}
	for _, field := range actuals[0].AsObjectLiteralExpression().Properties.Nodes {
		if !plainWriterCopyField(field) || !inertWriterCopyValue(field.Initializer()) {
			return false
		}
	}
	if q.memberWriterInputsNeedResolution(body, bindings) {
		return false
	}
	return true
}

func plainWriterCopyField(field *ast.Node) bool {
	return ast.IsPropertyAssignment(field) && field.Name() != nil && !ast.IsComputedPropertyName(field.Name()) &&
		callableNameText(field.Name()) != "__proto__"
}

func inertWriterCopyValue(node *ast.Node) bool {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return false
	}
	if ast.IsPrefixUnaryExpression(node) {
		prefix := node.AsPrefixUnaryExpression()
		return (prefix.Operator == ast.KindPlusToken || prefix.Operator == ast.KindMinusToken) && ast.IsNumericLiteral(prefix.Operand)
	}
	if !ast.IsArrayLiteralExpression(node) {
		return sourceInertValueCreation(node)
	}
	elements := node.AsArrayLiteralExpression().Elements.Nodes
	if !denseArrayElements(elements) {
		return false
	}
	for _, element := range elements {
		if ast.IsArrayLiteralExpression(element) || !inertWriterCopyValue(element) {
			return false
		}
	}
	return true
}
