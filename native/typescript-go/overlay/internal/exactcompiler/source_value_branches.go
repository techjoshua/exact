package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"math"
	"strconv"
	"strings"
)

// literalDecision shares finite primitive facts between acquisition and producers.
// Number requires a binder-owned native call, a primitive literal input and a
// closed indexed mutation/call boundary. Other conversion forms stay unresolved.
func (query *sourceValueQuery) literalDecision(node *ast.Node, bindings sourceValueBindings) (known, truthy, nullish bool) {
	node = unwrapSourceCallableReference(node)
	if node == nil || !query.charge(&accessorCandidates{}, node) {
		return
	}
	if ast.IsIdentifier(node) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(node)) {
		return true, false, true
	}
	switch node.Kind {
	case ast.KindTrueKeyword:
		return true, true, false
	case ast.KindFalseKeyword:
		return true, false, false
	case ast.KindNullKeyword:
		return true, false, true
	case ast.KindStringLiteral:
		return true, node.Text() != "", false
	case ast.KindNumericLiteral:
		number, err := strconv.ParseFloat(node.Text(), 64)
		return err == nil, number != 0 && !math.IsNaN(number), false
	}
	if ast.IsPrefixUnaryExpression(node) && node.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken {
		known, truthy, _ = query.literalDecision(node.AsPrefixUnaryExpression().Operand, bindings)
		return known, !truthy, false
	}
	if ast.IsConditionalExpression(node) {
		branch := node.AsConditionalExpression()
		known, truthy, _ = query.literalDecision(branch.Condition, bindings)
		if !known {
			return
		}
		if truthy {
			return query.literalDecision(branch.WhenTrue, bindings)
		}
		return query.literalDecision(branch.WhenFalse, bindings)
	}
	if ast.IsBinaryExpression(node) {
		binary := node.AsBinaryExpression()
		op := binary.OperatorToken.Kind
		if op != ast.KindBarBarToken && op != ast.KindAmpersandAmpersandToken && op != ast.KindQuestionQuestionToken {
			return
		}
		known, truthy, nullish = query.literalDecision(binary.Left, bindings)
		if !known {
			return
		}
		if sourceLogicalTakesRight(op, truthy, nullish) {
			return query.literalDecision(binary.Right, bindings)
		}
		return
	}
	if !ast.IsCallExpression(node) {
		return
	}
	call := node.AsCallExpression()
	target := unwrapSourceCallableReference(call.Expression)
	if target == nil || !ast.IsIdentifier(target) || target.Text() != "Number" || !standardLibraryCallRoot(target, query.owner.checker) || call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return
	}
	index := query.owner.index(ast.GetSourceFileOfNode(node))
	if symbol := query.owner.checker.GetSymbolAtLocation(target); symbol == nil || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return
	}
	if index.numberReplaced {
		return
	}
	for _, effect := range index.numberOpenCalls {
		if !query.sourceIntrinsicAcquisitionBefore(node, effect) {
			return
		}
	}
	argument := unwrapSourceCallableReference(call.Arguments.Nodes[0])
	if argument == nil {
		return
	}
	switch argument.Kind {
	case ast.KindTrueKeyword:
		return true, true, false
	case ast.KindFalseKeyword, ast.KindNullKeyword:
		return true, false, false
	case ast.KindNumericLiteral:
		known, truthy, _ = query.literalDecision(argument, bindings)
		return known, truthy, false
	case ast.KindStringLiteral:
		text := strings.Trim(argument.Text(), "\u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff\n\r\u2028\u2029")
		if text == "" {
			return true, false, false
		}
		if strings.ContainsAny(text, "xXpP_") {
			return
		}
		number, err := strconv.ParseFloat(text, 64)
		if err == nil && !math.IsInf(number, 0) && !math.IsNaN(number) {
			return true, number != 0, false
		}
	}
	return
}

// branchDecision acquires finite primitive alternatives at the condition's own
// evaluation site. Later writes and completion observations cannot retarget that
// acquisition. Unknown or disagreeing alternatives never certify branch selection.
// This reuses the value owner and its root budget, without executing custom code.
func (query *sourceValueQuery) branchDecision(node *ast.Node, bindings sourceValueBindings) (known, truthy, nullish bool) {
	if known, truthy, nullish = query.literalDecision(node, bindings); known || node == nil {
		return
	}
	previous := query.initializing
	query.initializing = node
	defer func() { query.initializing = previous }()
	if query.active == nil {
		query.active = make(map[*ast.Node]bool)
	}
	if ast.IsCallExpression(node) {
		return query.sourceCallBranchDecision(node, bindings)
	}
	values := query.accessors(node, nil, "", accessorAcquire, bindings, nil)
	if values.opaque || len(values.values) == 0 {
		return false, false, false
	}
	for i, value := range values.values {
		if len(value.path) != 0 {
			return false, false, false
		}
		yes, truth, null := true, false, true
		if value.number != (numberPayload{}) {
			yes, truth, null = query.acquiredNumberDecision(value)
		} else if !value.undefined {
			// An unresolved acquired term is neither a call nor a known literal.
			if value.node == nil {
				return false, false, false
			}
			if ast.IsCallExpression(value.node) {
				yes, truth, null = query.sourceCallBranchDecision(value.node, bindings)
			} else {
				yes, truth, null = query.literalDecision(value.node, bindings)
			}
		}
		if !yes || i > 0 && (truth != truthy || null != nullish) {
			return false, false, false
		}
		truthy, nullish = truth, null
	}
	return true, truthy, nullish
}

// sourceCallBranchDecision reuses acquired callable identities for one immediate
// return under its actual input plan. It does not execute source code, borrow a
// signature body, or certify a native global. Other body shapes stay unknown.
func (query *sourceValueQuery) sourceCallBranchDecision(node *ast.Node, bindings sourceValueBindings) (known, truthy, nullish bool) {
	if query.active[node] {
		return
	}
	candidates := query.receiverCandidates(node, bindings)
	if candidates.opaque || candidates.receiverIncomplete || candidates.valueIncomplete || len(candidates.values) == 0 {
		return
	}
	query.active[node] = true
	defer delete(query.active, node)
	for i, value := range candidates.values {
		body := value.node
		if !query.charge(&candidates, body) {
			return false, false, false
		}
		if body == nil || len(value.path) != 0 || (!ast.IsArrowFunction(body) && !ast.IsFunctionDeclaration(body) && !ast.IsFunctionExpression(body)) || body.Body() == nil || ast.HasSyntacticModifier(body, ast.ModifierFlagsAsync) || ast.IsFunctionDeclaration(body) && body.AsFunctionDeclaration().AsteriskToken != nil || ast.IsFunctionExpression(body) && body.AsFunctionExpression().AsteriskToken != nil {
			return false, false, false
		}
		returned := body.Body()
		if ast.IsBlock(returned) {
			statements := returned.AsBlock().Statements.Nodes
			if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
				return false, false, false
			}
			returned = statements[0].AsReturnStatement().Expression
		}
		returned = unwrapSourceCallableReference(returned)
		if returned == nil {
			return false, false, false
		}
		formal := false
		if ast.IsIdentifier(returned) {
			if symbol := query.owner.checker.GetSymbolAtLocation(returned); symbol != nil && symbol.ValueDeclaration != nil {
				formal = ast.IsParameterDeclaration(symbol.ValueDeclaration) && enclosingCallableNode(symbol.ValueDeclaration) == body
			}
		}
		literal := returned.Kind == ast.KindTrueKeyword || returned.Kind == ast.KindFalseKeyword || returned.Kind == ast.KindNullKeyword || returned.Kind == ast.KindStringLiteral || returned.Kind == ast.KindNumericLiteral || ast.IsIdentifier(returned) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(returned))
		if !literal && !formal {
			return false, false, false
		}
		yes, truth, null := query.literalDecision(returned, bindings)
		if !yes && formal && candidates.callableScopes[i].creators == nil {
			// A returned formal observes completed binding initialization, including
			// writes by later active defaults. Preserve their original snapshots.
			inputs := query.bindInputs(body, node, bindings, &candidates)
			previousInputs, previousReturn := query.inputs, query.returning
			query.inputs, query.returning = inputs, returned
			if !candidates.opaque {
				yes, truth, null = query.branchDecision(returned, inputs.bindings)
			}
			query.inputs, query.returning = previousInputs, previousReturn
		}
		if !yes || i > 0 && (truth != truthy || null != nullish) {
			return false, false, false
		}
		truthy, nullish = truth, null
	}
	return true, truthy, nullish
}

// expressionBranch qualifies only conditionally evaluated children. Receivers,
// logical left operands and tests still execute. Optional continuations consult
// every actual ?. root in their chain, stopping at a grouping boundary.
func (query *sourceValueQuery) expressionBranch(child, parent *ast.Node, bindings sourceValueBindings) (possible, certain bool) {
	if ast.IsBinaryExpression(parent) {
		binary := parent.AsBinaryExpression()
		op := binary.OperatorToken.Kind
		if child == binary.Right && (op == ast.KindBarBarToken || op == ast.KindAmpersandAmpersandToken || op == ast.KindQuestionQuestionToken || op == ast.KindBarBarEqualsToken || op == ast.KindAmpersandAmpersandEqualsToken || op == ast.KindQuestionQuestionEqualsToken) {
			known, truthy, nullish := query.branchDecision(binary.Left, bindings)
			return !known || sourceLogicalTakesRight(op, truthy, nullish), known
		}
	}
	if ast.IsConditionalExpression(parent) {
		branch := parent.AsConditionalExpression()
		if child == branch.WhenTrue || child == branch.WhenFalse {
			known, truthy, _ := query.branchDecision(branch.Condition, bindings)
			return !known || (child == branch.WhenTrue) == truthy, known
		}
	}
	certain = true
	if ast.IsOptionalChain(parent) && child != parent.Expression() {
		for chain := parent; chain != nil && ast.IsOptionalChain(chain); chain = chain.Expression() {
			if !query.charge(&accessorCandidates{}, chain) {
				return true, false
			}
			if ast.IsOptionalChainRoot(chain) {
				known, _, nullish := query.branchDecision(chain.Expression(), bindings)
				if known && nullish {
					return false, true
				}
				certain = certain && known
			}
		}
	}
	return true, certain
}

// sourceCompletion retains one finite structural outcome. A break owns its actual
// lexical label, so only that label can consume it into normal continuation.
type sourceCompletion struct {
	kind     sourceCompletionKind
	target   *ast.Node
	outcomes sourceReturnOutcomes
}

// sourceReturnOutcomes describes possible statement completion, not expression
// evaluation or body purity. Unknown retains unaccounted successful alternatives.
type sourceReturnOutcomes uint8

const (
	sourceReturnNormal sourceReturnOutcomes = 1 << iota
	sourceReturnValue
	sourceReturnThrow
	sourceReturnUnknown
)

func returnCompletion(outcomes sourceReturnOutcomes) sourceCompletion {
	kind := sourceCompletionIncomplete
	if outcomes == sourceReturnNormal {
		kind = sourceCompletionNormal
	} else if outcomes != 0 && outcomes&(sourceReturnNormal|sourceReturnUnknown) == 0 {
		kind = sourceCompletionTerminal
	}
	return sourceCompletion{kind: kind, outcomes: outcomes}
}

type sourceCompletionKind uint8

const (
	sourceCompletionNormal sourceCompletionKind = iota
	sourceCompletionTerminal
	sourceCompletionBreak
	sourceCompletionIncomplete
)

// breakTarget resolves a named break without crossing callable ownership. Each
// ancestor step shares the query budget, including unsuccessful resolution.
func (query *sourceValueQuery) breakTarget(node *ast.Node) *ast.Node {
	label := node.AsBreakStatement().Label
	if label == nil {
		return nil
	}
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if !query.charge(&accessorCandidates{}, parent) || ast.IsFunctionLike(parent) {
			return nil
		}
		if ast.IsLabeledStatement(parent) && parent.AsLabeledStatement().Label.Text() == label.Text() {
			return parent
		}
	}
	return nil
}

// completion preserves the existing reachability projection and its charge/order
// behavior. Successful-return consumers request additional structured outcomes
// through completionFor without a parallel statement walker or a general CFG.
func (query *sourceValueQuery) completion(node *ast.Node, bindings sourceValueBindings) sourceCompletion {
	return query.completionFor(node, bindings, false)
}

func (query *sourceValueQuery) completionFor(node *ast.Node, bindings sourceValueBindings, returns bool) sourceCompletion {
	if node == nil || !query.charge(&accessorCandidates{}, node) {
		return returnCompletion(sourceReturnUnknown)
	}
	if ast.IsReturnStatement(node) {
		return returnCompletion(sourceReturnValue)
	}
	if ast.IsThrowStatement(node) {
		return returnCompletion(sourceReturnThrow)
	}
	if ast.IsBreakStatement(node) {
		if !returns {
			if target := query.breakTarget(node); target != nil {
				return sourceCompletion{kind: sourceCompletionBreak, target: target}
			}
		}
		return returnCompletion(sourceReturnUnknown)
	}
	if ast.IsContinueStatement(node) {
		return returnCompletion(sourceReturnUnknown)
	}
	if ast.IsLabeledStatement(node) {
		if returns {
			return returnCompletion(sourceReturnUnknown)
		}
		result := query.completionFor(node.AsLabeledStatement().Statement, bindings, false)
		if result.kind == sourceCompletionBreak && result.target == node {
			return sourceCompletion{}
		}
		return result
	}
	if ast.IsBlock(node) {
		outcomes := sourceReturnNormal
		for _, statement := range node.AsBlock().Statements.Nodes {
			result := query.completionFor(statement, bindings, returns)
			if !returns {
				if result.kind != sourceCompletionNormal {
					return result
				}
				continue
			}
			outcomes = outcomes&^sourceReturnNormal | result.outcomes
			if outcomes&sourceReturnNormal == 0 {
				break
			}
		}
		if returns {
			return returnCompletion(outcomes)
		}
		return sourceCompletion{}
	}
	if ast.IsIfStatement(node) {
		branch := node.AsIfStatement()
		known, truthy, _ := query.branchDecision(branch.Expression, bindings)
		if known {
			if truthy {
				return query.completionFor(branch.ThenStatement, bindings, returns)
			}
			if branch.ElseStatement != nil {
				return query.completionFor(branch.ElseStatement, bindings, returns)
			}
			return returnCompletion(sourceReturnNormal)
		}
		yes := query.completionFor(branch.ThenStatement, bindings, returns)
		no := returnCompletion(sourceReturnNormal)
		if branch.ElseStatement != nil {
			no = query.completionFor(branch.ElseStatement, bindings, returns)
		}
		if returns {
			return returnCompletion(yes.outcomes | no.outcomes)
		}
		if yes.kind == no.kind && (yes.kind == sourceCompletionNormal || yes.kind == sourceCompletionTerminal) {
			return yes
		}
		return returnCompletion(sourceReturnUnknown)
	}
	if ast.IsTryStatement(node) {
		if !returns {
			return returnCompletion(sourceReturnUnknown)
		}
		region := node.AsTryStatement()
		outcomes := query.completionFor(region.TryBlock, bindings, true).outcomes
		if region.CatchClause != nil {
			// Any evaluated prefix can throw. A catch is a possible completion
			// alternative even if the syntactic try has no explicit throw.
			caught := query.completionFor(region.CatchClause.AsCatchClause().Block, bindings, true)
			outcomes = outcomes&^sourceReturnThrow | caught.outcomes
		}
		if region.FinallyBlock != nil {
			final := query.completionFor(region.FinallyBlock, bindings, true).outcomes
			replaced := final &^ sourceReturnNormal
			if final&sourceReturnNormal != 0 {
				replaced |= outcomes
			}
			outcomes = replaced
		}
		return returnCompletion(outcomes)
	}
	if ast.IsSwitchStatement(node) || ast.IsIterationStatement(node, false) {
		return returnCompletion(sourceReturnUnknown)
	}
	return returnCompletion(sourceReturnNormal)
}

// terminates preserves the return/throw-only projection used by finalizer override
// selection. An unconsumed break cannot acquire return-completion authority.
func (query *sourceValueQuery) terminates(node *ast.Node, bindings sourceValueBindings) (certain, possible bool) {
	result := query.completion(node, bindings)
	return result.kind == sourceCompletionTerminal, result.kind != sourceCompletionNormal
}

// breakExits proves that a resolved target leaves this sibling-list region. A
// missing target or exhausted containment proof retains uncertainty at the caller.
func (query *sourceValueQuery) breakExits(target, region *ast.Node) bool {
	for node := region; node != nil; node = node.Parent {
		if !query.charge(&accessorCandidates{}, node) || ast.IsFunctionLike(node) {
			return false
		}
		if node == target {
			return true
		}
	}
	return false
}

// reachable retains enclosing branch facts and preceding terminal statements at an
// occurrence. This bounded lexical relation does not construct a control-flow graph.
func (query *sourceValueQuery) reachable(node *ast.Node, bindings sourceValueBindings) (possible, certain bool) {
	return query.reachableWithin(node, nil, bindings)
}

// reachableWithin limits the shared lexical proof to an already reached region.
// Completion uses it inside a selected return expression or its required finally.
func (query *sourceValueQuery) reachableWithin(node, region *ast.Node, bindings sourceValueBindings) (possible, certain bool) {
	certain = true
	for child := node; child != nil && child != region && child.Parent != nil; child = child.Parent {
		if !query.charge(&accessorCandidates{}, child) {
			return true, false
		}
		parent := child.Parent
		if ast.IsFunctionLike(parent) {
			break
		}
		if inputs := query.inputs; inputs != nil && inputs.declaration == enclosingCallableNode(child) {
			if defaults, found := inputs.defaults[child]; found {
				if defaults.bindings == nil {
					return false, true
				}
				certain = certain && !defaults.conditional
			}
		}
		possible, performed := query.expressionBranch(child, parent, bindings)
		if !possible {
			return false, true
		}
		certain = certain && performed
		if ast.IsIfStatement(parent) {
			branch := parent.AsIfStatement()
			if child == branch.ThenStatement || child == branch.ElseStatement {
				known, truthy, _ := query.branchDecision(branch.Expression, bindings)
				if known && (child == branch.ThenStatement) != truthy {
					return false, true
				}
				certain = certain && known
			}
		}
		var statements []*ast.Node
		if ast.IsBlock(parent) {
			statements = parent.AsBlock().Statements.Nodes
		}
		if ast.IsSourceFile(parent) {
			statements = parent.AsSourceFile().Statements.Nodes
		}
		for _, prior := range statements {
			if prior == child {
				break
			}
			result := query.completion(prior, bindings)
			if result.kind == sourceCompletionTerminal || result.kind == sourceCompletionBreak && query.breakExits(result.target, parent) {
				return false, true
			}
			certain = certain && result.kind == sourceCompletionNormal
		}
		if ast.IsTryStatement(parent) || ast.IsSwitchStatement(parent) || ast.IsIterationStatement(parent, false) {
			certain = false
		}
	}
	return true, certain
}

// precedes proves a performed expression before a consumer in one lexical owner.
// Optional expressions retain the existing statement-evaluation requirement.
func (query *sourceValueQuery) precedes(work, at *ast.Node, bindings sourceValueBindings) bool {
	if work == nil || at == nil || ast.GetSourceFileOfNode(work) != ast.GetSourceFileOfNode(at) || enclosingCallableNode(work) != enclosingCallableNode(at) || work.End() > at.Pos() {
		return false
	}
	if sourceProducerStatement(work) == nil {
		// A definitely active default completes before the later binding/body read.
		// This is invocation-local authority, never a deferred or bypassed default.
		inputs := query.inputs
		if inputs == nil || inputs.declaration != enclosingCallableNode(work) {
			return false
		}
		defaults, found := query.defaultInput(inputs, work, &accessorCandidates{})
		if !found || defaults.bindings == nil || defaults.conditional {
			return false
		}
	}
	possible, certain := query.reachable(work, bindings)
	return possible && certain
}

// sourceLogicalTakesRight shares native short-circuit selection for finite branch facts.
func sourceLogicalTakesRight(op ast.Kind, truthy, nullish bool) bool {
	switch op {
	case ast.KindBarBarToken, ast.KindBarBarEqualsToken:
		return !truthy
	case ast.KindAmpersandAmpersandToken, ast.KindAmpersandAmpersandEqualsToken:
		return truthy
	default:
		return nullish
	}
}

// sourceIntrinsicAcquisitionBefore follows only the actual creating occurrences
// already selected by this query. A synchronous body acquires its native callee
// during that invocation, before a later module statement can execute. Missing,
// deferred or recursive occurrence ownership retains the existing uncertainty.
func (query *sourceValueQuery) sourceIntrinsicAcquisitionBefore(node, effect *ast.Node) bool {
	for owner := enclosingCallableNode(node); owner != nil; owner = enclosingCallableNode(node) {
		if !query.charge(&accessorCandidates{}, owner) {
			return false
		}
		if !ast.IsFunctionDeclaration(owner) && !ast.IsFunctionExpression(owner) && !ast.IsArrowFunction(owner) {
			return false
		}
		if ast.HasSyntacticModifier(owner, ast.ModifierFlagsAsync) || ast.IsFunctionDeclaration(owner) && owner.AsFunctionDeclaration().AsteriskToken != nil || ast.IsFunctionExpression(owner) && owner.AsFunctionExpression().AsteriskToken != nil {
			return false
		}
		invocation := query.creators[owner].invocation
		if invocation == nil || invocation == node || ast.GetSourceFileOfNode(invocation) != ast.GetSourceFileOfNode(node) {
			return false
		}
		node = invocation
	}
	return query.sourceModuleEvaluationBefore(node, effect)
}

// sourceModuleEvaluationBefore proves only ordering between distinct module-level
// statements. It does not prove either occurrence executes. Callable, repeated and
// exception regions cannot borrow textual order to close an intrinsic acquisition.
func (query *sourceValueQuery) sourceModuleEvaluationBefore(first, second *ast.Node) bool {
	statement := func(node *ast.Node) *ast.Node {
		for node != nil && node.Parent != nil {
			if !query.charge(&accessorCandidates{}, node) {
				return nil
			}
			if ast.IsFunctionLike(node) || ast.IsIterationStatement(node, false) || ast.IsSwitchStatement(node) || ast.IsTryStatement(node) {
				return nil
			}
			if ast.IsSourceFile(node.Parent) {
				return node
			}
			node = node.Parent
		}
		return nil
	}
	if first == nil || second == nil || ast.GetSourceFileOfNode(first) != ast.GetSourceFileOfNode(second) {
		return false
	}
	a, b := statement(first), statement(second)
	return a != nil && b != nil && a != b && a.End() <= b.Pos()
}

// completionWrite relates a same-owner binding assignment to a selected returned
// value. This is a lexical completion proof, not a flow interpreter. Unproved
// branches stay possible and cannot replace the entry origin. Every ancestor step
// shares the root budget. Acquired aliases never use this later observation.
func (query *sourceValueQuery) completionWrite(work, returned *ast.Node, bindings sourceValueBindings) (possible, certain bool) {
	if work == nil || returned == nil || enclosingCallableNode(work) != enclosingCallableNode(returned) {
		return true, false
	}
	// A selected return evaluates all unconditional parts of its expression before
	// its caller can invoke a captured binding, even parts after the closure literal.
	if returned.Pos() <= work.Pos() && work.End() <= returned.End() {
		possible, certain = query.reachableWithin(work, returned, bindings)
		return possible, certain && sourceEvaluationStatement(work) != nil
	}
	// Only finally regions enclosing this return execute after its expression.
	// An unrelated later statement or another return path is not completion work.
	for child := work; child != nil && child.Parent != nil; child = child.Parent {
		if !query.charge(&accessorCandidates{}, child) {
			return true, false
		}
		parent := child.Parent
		if ast.IsFunctionLike(parent) {
			break
		}
		if ast.IsTryStatement(parent) && child == parent.AsTryStatement().FinallyBlock {
			attempt := parent.AsTryStatement()
			if attempt.TryBlock.Pos() <= returned.Pos() && returned.End() <= attempt.TryBlock.End() || attempt.CatchClause != nil && attempt.CatchClause.Pos() <= returned.Pos() && returned.End() <= attempt.CatchClause.End() {
				possible, certain = query.reachableWithin(work, child, bindings)
				return possible, certain && sourceEvaluationStatement(work) != nil
			}
		}
	}
	if work.Pos() >= returned.Pos() {
		return false, true
	}
	possible, _ = query.reachable(work, bindings)
	return possible, query.precedes(work, returned, bindings)
}

// returnCompletes excludes a selected value superseded by a definitely abrupt
// enclosing finally. The original return expression still executes in its owner.
// Unproved finalizers keep both return alternatives rather than choosing one.
func (query *sourceValueQuery) returnCompletes(returned *ast.Node, bindings sourceValueBindings) bool {
	return query.returnCompletesFor(returned, bindings, false)
}

func (query *sourceValueQuery) returnCompletesFor(returned *ast.Node, bindings sourceValueBindings, returns bool) bool {
	for child := returned; child != nil && child.Parent != nil; child = child.Parent {
		if !query.charge(&accessorCandidates{}, child) {
			return true
		}
		parent := child.Parent
		if ast.IsFunctionLike(parent) {
			break
		}
		if ast.IsTryStatement(parent) {
			final := parent.AsTryStatement().FinallyBlock
			if final != nil && child != final {
				if returns {
					outcomes := query.completionFor(final, bindings, true).outcomes
					if outcomes != 0 && outcomes&(sourceReturnNormal|sourceReturnUnknown) == 0 {
						return false
					}
				} else if certain, _ := query.terminates(final, bindings); certain {
					return false
				}
			}
		}
	}
	return true
}

// sourcePrimitiveValue proves a finite ordinary primitive result, independently of
// evaluating its children. It grants neither call purity nor numeric-conversion success.
// Unknown names and structural annotations cannot supply object/primitive identity.
func sourcePrimitiveValue(node *ast.Node) bool {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return false
	}
	if ast.IsLiteralExpression(node) {
		return node.Kind != ast.KindRegularExpressionLiteral
	}
	switch node.Kind {
	case ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword, ast.KindVoidExpression, ast.KindTypeOfExpression:
		return true
	}
	if ast.IsPrefixUnaryExpression(node) {
		unary := node.AsPrefixUnaryExpression()
		if unary.Operator == ast.KindExclamationToken {
			return true
		}
		if unary.Operator == ast.KindPlusToken || unary.Operator == ast.KindMinusToken || unary.Operator == ast.KindTildeToken {
			return sourcePrimitiveValue(unary.Operand)
		}
	}
	return false
}

// readerAssignmentCompleted proves only a PutValue conditional on this query's
// selected normal reader. The existing effectOwner/reading producer supplies
// that operation boundary. It never admits a different indexed call or capture.
func (query *sourceValueQuery) readerAssignmentCompleted(work, reader *ast.Node, bindings sourceValueBindings) bool {
	if work == nil || reader == nil || reader != query.reading || query.effectOwner == nil || query.effectOwner != enclosingCallableNode(reader) || enclosingCallableNode(work) != query.effectOwner || !ast.IsBinaryExpression(work) || work.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return false
	}
	statement := sourceProducerStatement(work)
	if statement == nil || statement.AsExpressionStatement().Expression != work || !ast.IsBlock(statement.Parent) {
		return false
	}
	block := statement.Parent
	attempt := block.Parent
	if !ast.IsTryStatement(attempt) || attempt.AsTryStatement().TryBlock != block || attempt.AsTryStatement().CatchClause == nil || attempt.AsTryStatement().FinallyBlock != nil || len(block.AsBlock().Statements.Nodes) != 1 {
		return false
	}
	// On reaching a later sibling reader, rejection cannot have left the catch
	// normally. No inference about success, purity or the assigned value follows.
	if query.completion(attempt.AsTryStatement().CatchClause.AsCatchClause().Block, bindings).kind != sourceCompletionTerminal {
		return false
	}
	readerStatement := reader
	for readerStatement != nil && readerStatement.Parent != attempt.Parent {
		if !query.charge(&accessorCandidates{}, readerStatement) || ast.IsFunctionLike(readerStatement) || ast.IsTryStatement(readerStatement) || ast.IsIterationStatement(readerStatement, false) || ast.IsSwitchStatement(readerStatement) {
			return false
		}
		readerStatement = readerStatement.Parent
	}
	if readerStatement == nil || !ast.IsBlock(attempt.Parent) {
		return false
	}
	found := false
	for _, sibling := range attempt.Parent.AsBlock().Statements.Nodes {
		if !query.charge(&accessorCandidates{}, sibling) {
			return false
		}
		if sibling == attempt {
			found = true
		} else if sibling == readerStatement {
			return found
		}
	}
	return false
}

// acquiredNumberDecision consumes a value after the existing accessor observation
// boundary. Saved normal/Get associations are checked without replay or syntax.
func (query *sourceValueQuery) acquiredNumberDecision(value sourceValue) (known, truthy, nullish bool) {
	if query.owner == nil || query.owner.language == nil || query.owner.language.disposed || value.undefined || value.node == nil || len(value.path) != 0 || value.native != nil || value.bound != nil || value.awaited != nil || value.entrySlot != nil || value.initializerUse != nil || value.adapter != nil || value.rest != nil || value.copied != nil {
		return
	}
	if value.normal != nil && (!normalInputOwned(value.normal, query.inputs) || value.normal.observed.value.number != value.number || value.normal.observed.value.node != value.node) {
		return
	}
	if value.acquired != nil && (value.acquired.value.number != value.number || value.acquired.value.node != value.node) {
		return
	}
	if row := value.ownedGetRow; row != nil {
		if row.population == nil || row.population.receipt == nil || row.population.receipt.input.owner != query.owner.language {
			return
		}
		rows, live := row.population.receipt.project()
		if !live || row.position < 0 || row.position >= len(rows) {
			return
		}
		original := rows[row.position]
		if original.completion != languageNormal && original.completion != languageReturn || original.value.number != value.number || original.value.node != value.node {
			return
		}
	}
	n, ok := numericNumberPayload(languageValue{number: value.number, node: value.node})
	return ok, ok && n != 0 && !n.IsNaN(), false
}
