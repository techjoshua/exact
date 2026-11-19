package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// appendArgumentAccessorEffects instantiates shared callable demands, including returned closures.
// Construction alone never executes a getter. The shared query retains captured receiver writes.
func appendArgumentAccessorEffects(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, definition *sourceDefinitionMAYCall, delivered ...*sourceRelativeInputEdge) accessorCandidates {
	return appendArgumentAccessorEffectsWithBodyEffects(fact, node, targets, source, c, owner, definition, nil, delivered...)
}

// appendArgumentAccessorEffectsWithBodyEffects retains the original three-appender
// publication and borrows source-body accounting only during that same traversal.
func appendArgumentAccessorEffectsWithBodyEffects(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, definition *sourceDefinitionMAYCall, observe func(sourceBodyEffectsObservation), delivered ...*sourceRelativeInputEdge) accessorCandidates {
	return appendArgumentAccessorEffectsObserved(fact, node, targets, source, c, owner, definition, sourceEffectsObserver{body: observe}, delivered...)
}

// appendArgumentAccessorEffectsObserved keeps source body and original callee
// accounting on one synchronous publisher. Ordinary callers install no callee
// consumer and retain their existing candidate metadata unchanged.
func appendArgumentAccessorEffectsObserved(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, definition *sourceDefinitionMAYCall, observe sourceEffectsObserver, delivered ...*sourceRelativeInputEdge) accessorCandidates {
	defer finishDirectExposureProducer(fact, node, owner)
	defer finishDescriptorFormalProducer(fact, node, owner)
	finishProjection := beginDescriptorProducer(fact, node, targets, owner)
	defer finishProjection()
	if definition != nil && definition.registered(fact, node) {
		// No occurrence value or completion is published. This empty local delta
		// is NOT a neutral summary: the registered edge remains solver-owned.
		if definition.valueIncomplete {
			// A MAY return/coercion can invoke unknown user work. Retain its
			// uncertainty independently of the known callee effect graph.
			candidates := accessorCandidates{opaque: definition.opaque, valueIncomplete: true, cause: node}
			appendOpaqueAccessorEffect(fact, candidates)
			return candidates
		}
		return accessorCandidates{}
	}
	if fact.normalInputs == nil {
		candidates := sourceInvocationDependenciesObserved(node, node, c, owner, fact.node, nil, observe, delivered...)
		appendOpaqueAccessorEffect(fact, candidates)
		appendSourceValueWrites(fact, candidates, c)
		appendAccessorTargets(fact, node, candidates, targets, source)
		return candidates
	}
	precise := sourceInvocationWithResults(node, c, owner, fact.node, fact.nativeCalls, fact.normalCalls, fact.normalInputs)
	candidates := refineSourceDependencies(precise, func() accessorCandidates { return sourceInvocationDependencies(node, c, owner, fact.node) })
	if publishOriginalDescriptorCall(fact, node, candidates, targets, source, c) {
		return candidates
	}
	appendOpaqueAccessorEffect(fact, candidates)
	appendSourceValueWrites(fact, candidates, c)
	appendAccessorTargets(fact, node, candidates, targets, source)
	return candidates
}

// sourceDefinitionMAYCall is an ephemeral collector-to-invocation domain. It
// borrows only live definition facts and an already registered canonical edge.
// It never escapes the current collector callback or authorizes actual calls.
type sourceDefinitionMAYCall struct {
	caller, callee  *callableFacts
	call            *ast.Node
	edge            int
	valueIncomplete bool
	opaque          bool
}

func (domain *sourceDefinitionMAYCall) registered(caller *callableFacts, call *ast.Node) bool {
	if domain.caller != caller || domain.call != call || domain.callee == nil || domain.edge < 0 || domain.edge >= len(caller.summary.Calls) {
		return false
	}
	edge := caller.summary.Calls[domain.edge]
	return edge.Resolved && edge.TargetID == domain.callee.summary.ID && caller.fieldEdgeOperations[edge.ID] == call
}

// prepareDefinitionMAYCall retains exact formal forwarding as an effects-only
// graph obligation. Other value demands, captured inputs, replaced bindings and
// module execution stay ordinary. Primitive type information decides
// whether return/coercion opacity is needed, never certifying a result or purity.
func prepareDefinitionMAYCall(caller, callee *callableFacts, node *ast.Node, symbol *ast.Symbol, c *checker.Checker, owner *executableBodyOwner, parent *callableFacts) *sourceDefinitionMAYCall {
	if caller == nil || callee == nil || owner == nil || owner.values == nil || owner.values.checker != c || !ast.IsFunctionDeclaration(callee.node) || caller.node.Parent == nil || callee.node.Parent == nil || !ast.IsSourceFile(callee.node.Parent) || ast.GetSourceFileOfNode(caller.node) != ast.GetSourceFileOfNode(callee.node) || enclosingCallableNode(node) != caller.node || caller.normalInputs != nil && caller.normalInputs.invocation != nil || symbol == nil || symbol.ValueDeclaration != callee.node {
		return nil
	}
	if caller.normalInputs == nil {
		// A closed zero-input definition has no invocation-specific bindings.
		// The result-use and capture checks below still apply.
		directRender := ast.IsArrowFunction(caller.node) && unwrapSourceCallableReference(caller.node.Body()) == node
		if len(callee.node.Parameters()) != 0 || !(definitionPrimitiveOperand(node, c) || directRender) {
			return nil
		}
	} else if caller.normalInputs.declaration != caller.node || caller.normalInputs.ownedFact != caller {
		return nil
	}
	formalOwner := caller.node
	render := false
	if !ast.IsFunctionDeclaration(caller.node) || !ast.IsSourceFile(caller.node.Parent) {
		// This is the canonical deferred render definition, not its invocation.
		// Its enclosing formal stays an unresolved input, never a captured value.
		if !ast.IsArrowFunction(caller.node) || len(caller.node.Parameters()) != 0 || parent == nil || parent.node != enclosingCallableNode(caller.node) || !ast.IsFunctionDeclaration(parent.node) || parent.node.Parent == nil || !ast.IsSourceFile(parent.node.Parent) || parent.sourceFile != caller.sourceFile || parent.node.Body() == nil {
			return nil
		}
		returned := caller.node
		for returned.Parent != nil && ast.IsParenthesizedExpression(returned.Parent) {
			returned = returned.Parent
		}
		if returned.Parent == nil || !ast.IsReturnStatement(returned.Parent) || returned.Parent.AsReturnStatement().Expression != returned || enclosingCallableNode(returned.Parent) != parent.node {
			return nil
		}
		formalOwner, render = parent.node, true
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || c.GetSymbolAtLocation(call.Expression) != symbol || call.QuestionDotToken != nil {
		return nil
	}
	async, ordinary := ordinaryResultCategory(callee.node)
	if async || !ordinary {
		return nil
	}
	index := owner.values.index(ast.GetSourceFileOfNode(node))
	if index.incomplete || index.normalDynamicScope || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return nil
	}
	parameters := func(declaration *ast.Node) (map[ast.SymbolId]bool, bool) {
		selected := make(map[ast.SymbolId]bool)
		for _, parameter := range declaration.Parameters() {
			name := parameter.Name()
			if name == nil || !ast.IsIdentifier(name) || name.Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
				return nil, false
			}
			formal := c.GetSymbolAtLocation(name)
			if formal == nil || formal.ValueDeclaration != parameter || len(index.bindings[ast.GetSymbolId(formal)]) != 0 {
				return nil, false
			}
			selected[ast.GetSymbolId(formal)] = true
		}
		return selected, true
	}
	callerFormals, callerValid := parameters(formalOwner)
	calleeFormals, calleeValid := parameters(callee.node)
	if !callerValid || !calleeValid {
		return nil
	}
	var arguments []*ast.Node
	if call.Arguments != nil {
		arguments = call.Arguments.Nodes
	}
	if len(arguments) != len(calleeFormals) || len(calleeFormals) == 0 && len(callerFormals) != 0 {
		return nil
	}
	for _, argument := range arguments {
		argument = unwrapSourceCallableReference(argument)
		if !ast.IsIdentifier(argument) {
			return nil
		}
		actual := c.GetSymbolAtLocation(argument)
		if actual == nil || !callerFormals[ast.GetSymbolId(actual)] {
			return nil
		}
	}
	primitive := func(expression *ast.Node) bool {
		value := c.GetTypeAtLocation(expression)
		return value != nil && value.Flags()&checker.TypeFlagsPrimitive != 0
	}
	if render && len(calleeFormals) == 0 && !primitive(node) {
		return nil
	}
	forwarding := len(calleeFormals) != 0
	if forwarding {
		// Async settlement and generator consumers require their own result
		// work. This domain only transfers an ordinary definition's effects.
		async, ordinary := ordinaryResultCategory(caller.node)
		if async || !ordinary {
			return nil
		}
		if render {
			async, ordinary = ordinaryResultCategory(parent.node)
			if async || !ordinary {
				return nil
			}
		}
	}
	valueIncomplete := forwarding || !primitive(node)
	// Moving an unknown return value does not itself execute coercion. Keep its
	// missing value separate from graph-owned effects and actual input Gets.
	opaque := !forwarding && valueIncomplete
	// Only the enclosing definition's return/+ demand is summarized. Unknown
	// coercion stays opaque, not NoWrites or a fulfilled result. Property
	// receivers, arguments and assigned values retain their value consumer.
	outer := node
	for outer.Parent != nil {
		parent := outer.Parent
		if ast.IsParenthesizedExpression(parent) {
			outer = parent
			continue
		}
		if strictComparisonOperand(outer) {
			outer = parent
			continue
		}
		if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken {
			valueIncomplete = valueIncomplete || !primitive(parent.AsBinaryExpression().Left) || !primitive(parent.AsBinaryExpression().Right)
			opaque = opaque || forwarding || valueIncomplete
			outer = parent
			continue
		}
		break
	}
	if !(render && unwrapSourceCallableReference(caller.node.Body()) == outer) && (outer.Parent == nil || !ast.IsReturnStatement(outer.Parent) || enclosingCallableNode(outer.Parent) != caller.node) {
		return nil
	}
	if !callee.definitionScopeChecked {
		callee.definitionScopeClosed = closedDefinitionEffectScope(callee.node, calleeFormals, c, index)
		callee.definitionScopeChecked = true
	}

	if !callee.definitionScopeClosed {
		return nil
	}
	return &sourceDefinitionMAYCall{caller: caller, callee: callee, call: node, edge: -1, valueIncomplete: valueIncomplete, opaque: opaque}
}

// A closed definition can reuse its graph effects without specializing its
// lexical environment. Invocation and result-use checks still run at each site.
func closedDefinitionEffectScope(callee *ast.Node, calleeFormals map[ast.SymbolId]bool, c *checker.Checker, index sourceValueIndex) bool {
	source := ast.GetSourceFileOfNode(callee)
	closed := true
	walkCallable(callee, func(part *ast.Node) bool {
		if part.Kind == ast.KindThisKeyword || part.Kind == ast.KindSuperKeyword || ast.IsNewExpression(part) || ast.IsAwaitExpression(part) || ast.IsFunctionLike(part) && part != callee {
			closed = false
			return false
		}
		if ast.IsIdentifier(part) && !ast.IsDeclarationName(part) && !isStaticPropertyName(part) {
			selected := c.GetSymbolAtLocation(part)
			if selected != nil && selected.ValueDeclaration != nil && ast.GetSourceFileOfNode(selected.ValueDeclaration) == source {
				declaration := selected.ValueDeclaration
				if calleeFormals[ast.GetSymbolId(selected)] {
					return closed
				}
				if !ast.IsFunctionDeclaration(declaration) || declaration.Parent == nil || !ast.IsSourceFile(declaration.Parent) || len(index.bindings[ast.GetSymbolId(selected)]) != 0 {
					closed = false
				}
			}
		}
		return closed
	})
	return closed
}

// A checked primitive addition and a strict comparison consume their operands
// without calling an authored conversion on either value.
func definitionPrimitiveOperand(node *ast.Node, c *checker.Checker) bool {
	if strictComparisonOperand(node) {
		return true
	}
	if node.Parent == nil || !ast.IsBinaryExpression(node.Parent) {
		return false
	}
	binary := node.Parent.AsBinaryExpression()
	if binary.OperatorToken.Kind != ast.KindPlusToken {
		return false
	}
	for _, operand := range []*ast.Node{binary.Left, binary.Right} {
		value := c.GetTypeAtLocation(operand)
		if value == nil || value.Flags()&checker.TypeFlagsPrimitive == 0 {
			return false
		}
	}
	return true
}

// Strict equality evaluates both operands without coercing either result.
func strictComparisonOperand(node *ast.Node) bool {
	if node.Parent == nil || !ast.IsBinaryExpression(node.Parent) {
		return false
	}
	kind := node.Parent.AsBinaryExpression().OperatorToken.Kind
	return kind == ast.KindEqualsEqualsEqualsToken || kind == ast.KindExclamationEqualsEqualsToken
}
