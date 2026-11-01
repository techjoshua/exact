package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// ordinaryInvocationPlan retains the original acquisition and actual input routing.
// Adapted is an ordinary invocation relation, not selected native identity, purity
// or proof that the call performed. A nil actual vector remains incomplete.
type ordinaryInvocationPlan struct {
	target, receiver *ast.Node
	actuals          []*ast.Node
	adapted          bool
	vectors          []*ast.Node
	captured         []sourceNormalActual
}

// planOrdinaryInvocation shares adapter routing and actual-vector completeness.
// Original acquisition ownership remains on the invocation-local input plan.
func planOrdinaryInvocation(expression *ast.Node, actuals []*ast.Node, c *checker.Checker, charge func(*ast.Node) bool) ordinaryInvocationPlan {
	var vectors []*ast.Node
	target, values, receiver := restrictedCallArgumentsPlan(expression, actuals, c, make(map[ast.SymbolId]bool), charge, &vectors)
	return ordinaryInvocationPlan{target: target, receiver: receiver, actuals: values, adapted: target != nil && target != unwrapSourceCallableReference(expression), vectors: vectors}
}

// restrictedCallArguments resolves native invocation adapters without executing them. Bound
// arguments precede invocation arguments, so ownership follows the actual formal parameter.
// An unresolved unbound apply vector returns nil arguments. Proven empty vectors return
// a nonnil empty slice. Known bind prefixes do not prove completeness of an unknown suffix.
func restrictedCallArguments(expression *ast.Node, arguments []*ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (*ast.Node, []*ast.Node, *ast.Node) {
	return restrictedCallArgumentsWithBudget(expression, arguments, typeChecker, seen, nil)
}

// restrictedCallArgumentsWithBudget preserves the existing adapter classifier while
// charging bounded queries for reference/alias traversal. Exhaustion supplies no adapter authority.
func restrictedCallArgumentsWithBudget(expression *ast.Node, arguments []*ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool, charge func(*ast.Node) bool) (*ast.Node, []*ast.Node, *ast.Node) {
	return restrictedCallArgumentsPlan(expression, arguments, typeChecker, seen, charge, nil)
}

// restrictedCallArgumentsPlan retains materialization separately from formal consumption.
// An apply vector is evaluated even when the target has no demanded parameters.
func restrictedCallArgumentsPlan(expression *ast.Node, arguments []*ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool, charge func(*ast.Node) bool, vectors *[]*ast.Node) (*ast.Node, []*ast.Node, *ast.Node) {
	expression = unwrapSourceCallableReferenceWithBudget(expression, charge)
	if expression == nil {
		return expression, arguments, nil
	}
	if ast.IsParenthesizedExpression(expression) {
		return restrictedCallArgumentsPlan(expression.AsParenthesizedExpression().Expression, arguments, typeChecker, seen, charge, vectors)
	}
	if receiver, name := restrictedInvocationMember(expression, typeChecker); receiver != nil && (name == "call" || name == "apply") && nativeFunctionInvocation(receiver, name, typeChecker) {
		if len(arguments) == 0 {
			return receiver, nil, nil
		}
		values := arguments[1:]
		if name == "apply" {
			if vectors != nil && len(arguments) > 1 {
				*vectors = append(*vectors, arguments[1])
			}
			values = nil
			if len(arguments) == 1 {
				values = []*ast.Node{}
			} else if vector := arguments[1]; ast.IsArrayLiteralExpression(vector) {
				values = vector.AsArrayLiteralExpression().Elements.Nodes
				if values == nil {
					values = []*ast.Node{}
				}
			} else if vector != nil && vector.Kind == ast.KindNullKeyword || ast.IsVoidExpression(vector) || ast.IsIdentifier(vector) && typeChecker.IsUndefinedSymbol(typeChecker.GetSymbolAtLocation(vector)) {
				values = []*ast.Node{}
			}
		}
		target, values, boundReceiver := restrictedCallArgumentsPlan(receiver, values, typeChecker, seen, charge, vectors)
		if boundReceiver == nil {
			boundReceiver = arguments[0]
		}
		return target, values, boundReceiver
	}
	if ast.IsCallExpression(expression) {
		bound := expression.AsCallExpression()
		if receiver, name := restrictedInvocationMember(bound.Expression, typeChecker); receiver != nil && name == "bind" && nativeFunctionInvocation(receiver, name, typeChecker) {
			values := append([]*ast.Node(nil), callArguments(expression)...)
			if len(values) > 0 {
				values = values[1:]
			}
			values = append(values, arguments...)
			target, values, boundReceiver := restrictedCallArgumentsPlan(receiver, values, typeChecker, seen, charge, vectors)
			if boundReceiver == nil && bound.Arguments != nil && len(bound.Arguments.Nodes) > 0 {
				boundReceiver = bound.Arguments.Nodes[0]
			}
			return target, values, boundReceiver
		}
	}
	if ast.IsIdentifier(expression) {
		symbol := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(expression), typeChecker)
		if symbol != nil && !seen[ast.GetSymbolId(symbol)] {
			seen[ast.GetSymbolId(symbol)] = true
			for _, declaration := range symbol.Declarations {
				if charge != nil && !charge(declaration) {
					return nil, nil, nil
				}
				if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
					value := declaration.AsVariableDeclaration().Initializer
					if value != nil && (ast.IsIdentifier(value) || ast.IsPropertyAccessExpression(value) || ast.IsElementAccessExpression(value) || ast.IsCallExpression(value) || ast.IsParenthesizedExpression(value)) {
						return restrictedCallArgumentsPlan(value, arguments, typeChecker, seen, charge, vectors)
					}
				}
			}
		}
	}
	return expression, arguments, nil
}

// nativeFunctionInvocation excludes authored methods named call, apply or bind.
func nativeFunctionInvocation(receiver *ast.Node, method string, typeChecker *checker.Checker) bool {
	value := typeChecker.GetTypeAtLocation(receiver)
	for _, name := range []string{"Function", "CallableFunction", "NewableFunction"} {
		if nativeCollectionMethod(value, method, name, typeChecker) {
			return true
		}
	}
	return false
}

// restrictedInvocationMember resolves literal computed names without relying on source text.
func restrictedInvocationMember(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, string) {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		return member.Expression, member.Name().Text()
	}
	if ast.IsElementAccessExpression(expression) {
		member := expression.AsElementAccessExpression()
		if member.ArgumentExpression != nil {
			value := typeChecker.GetTypeAtLocation(member.ArgumentExpression)
			if value != nil && value.Flags()&checker.TypeFlagsStringLiteral != 0 {
				if name, ok := value.AsLiteralType().Value().(string); ok {
					return member.Expression, name
				}
			}
		}
	}
	return nil, ""
}
