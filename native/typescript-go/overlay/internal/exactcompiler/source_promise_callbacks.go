package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// promiseExecutor proves a direct standard constructor's eager literal executor.
// The target library supplies this built-in contract, including conforming polyfills.
// Authored shadow constructors and arbitrary callbacks supply no intrinsic inputs.
func (query *sourceValueQuery) promiseExecutor(node *ast.Node, result *accessorCandidates) *ast.Node {
	if node == nil || !ast.IsNewExpression(node) || !query.charge(result, node) {
		return nil
	}
	executor := query.standardPromiseExecutor(node)
	if executor == nil {
		return nil
	}
	return executor
}

// standardPromiseExecutor identifies the standard constructor and its eager source
// callback shape. Conforming global replacements retain the target-library contract.
// Their implementations are not revalidated at application or library compilation.
func (query *sourceValueQuery) standardPromiseExecutor(node *ast.Node) *ast.Node {
	if node == nil || !ast.IsNewExpression(node) {
		return nil
	}
	construction := node.AsNewExpression()
	target := unwrapSourceCallableReference(construction.Expression)
	if !ast.IsIdentifier(target) || target.Text() != "Promise" || !standardLibraryCallRoot(target, query.owner.checker) || construction.Arguments == nil || len(construction.Arguments.Nodes) != 1 {
		return nil
	}
	executor := unwrapSourceCallableReference(construction.Arguments.Nodes[0])
	if executor == nil || (!ast.IsArrowFunction(executor) && !ast.IsFunctionExpression(executor)) || executor.Body() == nil || executor.Name() != nil || ast.HasSyntacticModifier(executor, ast.ModifierFlagsAsync) || ast.IsFunctionExpression(executor) && executor.AsFunctionExpression().AsteriskToken != nil {
		return nil
	}
	return executor
}

// promiseResolver identifies a parameter supplied by that literal executor contract.
// Its actual source symbol survives aliases. Live binding replacement remains owned
// by liveValues, so a reassigned formal cannot borrow its original input identity.
func (query *sourceValueQuery) promiseResolver(node *ast.Node, result *accessorCandidates) (reject, known bool) {
	reject, executor := query.promiseResolverParameter(node, result)
	return reject, executor != nil && query.promiseExecutor(executor.Parent, result) == executor
}

// promiseResolverParameter preserves actual binder identity and supplied input position.
// The enclosing constructor must identify the target library's built-in contract.
func (query *sourceValueQuery) promiseResolverParameter(node *ast.Node, result *accessorCandidates) (reject bool, executor *ast.Node) {
	if node == nil {
		return false, nil
	}
	parameter := node
	if ast.IsIdentifier(node) {
		symbol := query.owner.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return false, nil
		}
		parameter = symbol.ValueDeclaration
	}
	if parameter == nil || !ast.IsParameterDeclaration(parameter) {
		return false, nil
	}
	executor = parameter.Parent
	if executor == nil || executor.Parent == nil || !ast.IsNewExpression(executor.Parent) || query.standardPromiseExecutor(executor.Parent) != executor {
		return false, nil
	}
	i := 0
	for _, entry := range executor.Parameters() {
		if !query.charge(result, entry) {
			return false, nil
		}
		if ast.IsIdentifier(entry.Name()) && entry.Name().Text() == "this" {
			continue
		}
		if entry == parameter {
			if i < 2 && ast.IsIdentifier(parameter.Name()) && parameter.AsParameterDeclaration().DotDotDotToken == nil {
				return i == 1, executor
			}
			return false, nil
		}
		i++
	}
	return false, nil
}

// promiseInputs binds the two real intrinsic inputs without fabricating a source
// CallExpression or a caller activation. Remaining formals use the existing default
// and binding-pattern owners. Ordinary argument evaluation belongs to the constructor.
func (query *sourceValueQuery) promiseInputs(executor *ast.Node, bindings sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	inputs := &sourceValueInputs{declaration: executor, bindings: make(sourceValueBindings, len(bindings)+2), defaults: make(map[*ast.Node]sourceDefaultInput)}
	for id, values := range bindings {
		if !query.charge(result, executor) {
			return inputs
		}
		inputs.bindings[id] = values
	}
	if !ast.IsArrowFunction(executor) {
		inputs.bindings[0] = []sourceValue{{undefined: true}}
	}
	i := 0
	for _, parameter := range executor.Parameters() {
		if !query.charge(result, parameter) {
			return inputs
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		values := []sourceValue{{undefined: true}}
		if i < 2 {
			values = []sourceValue{{}}
			if ast.IsIdentifier(parameter.Name()) && parameter.AsParameterDeclaration().DotDotDotToken == nil {
				values = []sourceValue{{node: parameter}}
			}
		}
		if parameter.AsParameterDeclaration().DotDotDotToken != nil && i >= 2 {
			values = []sourceValue{{rest: make([][]sourceValue, 0)}}
		}
		values = query.bindingDefault(values, parameter.Initializer(), inputs.bindings, result, inputs)
		query.bindInputPattern(parameter.Name(), values, inputs.bindings, result, accessorAcquire, inputs)
		i++
	}
	return inputs
}

// promiseExecutorWrite adds a may assignment from an eagerly supplied executor.
// It never proves the containing reset ran or supersedes the initial callable.
// Other writers and constructor alternatives retain their existing conservative path.
func (query *sourceValueQuery) promiseExecutorWrite(assignment sourceValueAssignment, declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates, values *[]sourceValue) bool {
	writer := enclosingCallableNode(assignment.left)
	if writer == nil || writer == enclosingCallableNode(declaration) || writer.Parent == nil || !ast.IsNewExpression(writer.Parent) || query.promiseExecutor(writer.Parent, result) != writer {
		return false
	}
	inputs := query.promiseInputs(writer, bindings, result)
	*values = append(*values, query.originsAt(assignment.right, assignment.left, inputs.bindings, result)...)
	return true
}

// promiseConstruction retains the executor's actual body effects and input demands.
// Constructor recognition establishes the supplied functions, never whole-call purity
// or permission to discard registered continuation work.
func (query *sourceValueQuery) promiseConstruction(node *ast.Node, bindings sourceValueBindings) accessorCandidates {
	result := accessorCandidates{}
	executor := query.promiseExecutor(node, &result)
	if executor == nil {
		target := unwrapSourceCallableReference(node.AsNewExpression().Expression)
		if ast.IsIdentifier(target) && target.Text() == "Promise" {
			result.opaque = true
			result.cause = node
		}
		return result
	}
	result.retainCallableEffect(node, executor)
	inputs := query.promiseInputs(executor, bindings, &result)
	query.executeInputs(executor, inputs.bindings, &result, nil, inputs)
	return result
}

// invokePromiseResolver keeps argument Gets independent of settlement. Reject does
// not assimilate its argument. Resolve can Get then on any nonprimitive alternative,
// so that Get and uncertainty survive instead of inheriting no-argument neutrality.
func (query *sourceValueQuery) invokePromiseResolver(node *ast.Node, actuals []*ast.Node, reject bool, bindings sourceValueBindings, result *accessorCandidates) {
	if actuals == nil {
		// Vector materialization belongs to the shared invocation operation.
		// Reject never inspects the supplied value, while resolve may assimilate it.
		result.opaque = result.opaque || !reject
		return
	}
	for i, argument := range actuals {
		if !query.charge(result, argument) {
			return
		}
		values := query.originsAt(argument, node, bindings, result)
		if reject || i != 0 {
			continue
		}
		for _, value := range values {
			if value.undefined {
				continue
			}
			if value.node == nil {
				// Resolve receives an unresolved value, not an omitted argument.
				result.opaque = true
				continue
			}
			// A source body's own uninstantiated formal is a deferred argument
			// demand, as for an ordinary property read. executeInputs revisits this
			// operation with actual bindings. Replacements and foreign inputs do not
			// gain that authority merely from their compatible parameter type.
			if ast.IsIdentifier(value.node) {
				symbol := query.owner.checker.GetSymbolAtLocation(value.node)
				if symbol != nil && symbol.ValueDeclaration != nil && ast.IsParameterDeclaration(symbol.ValueDeclaration) && enclosingCallableNode(symbol.ValueDeclaration) == enclosingCallableNode(node) {
					if _, bound := bindings[ast.GetSymbolId(symbol)]; !bound {
						continue
					}
				}
			}
			if value.undefined || len(value.path) == 0 && (sourcePrimitiveValue(value.node) || ast.IsVoidExpression(value.node) || ast.IsIdentifier(value.node) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(value.node))) {
				continue
			}
			mergeAccessorCandidates(result, query.accessors(value.node, value.path, "then", accessorRead, bindings, nil))
			then := query.accessors(value.node, append(append([]string{}, value.path...), "then"), "", accessorAcquire, bindings, nil)
			mergeAccessorCandidates(result, then)
			for _, callable := range then.values {
				if callable.node != nil && len(callable.path) == 0 && ast.IsFunctionLike(callable.node) && callable.node.Body() != nil {
					result.retainCallableEffect(node, callable.node)
				}
			}
			result.opaque = true
		}
	}
}
