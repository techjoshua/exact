package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// moduleRead is the eager module consumer, kept outside temporary alias acquisitions.
// Callable summaries without an eager consumer retain their existing may-write relation.
func (query *sourceValueQuery) moduleRead() *ast.Node {
	if query.reading != nil && enclosingCallableNode(query.reading) == nil {
		return query.reading
	}
	return nil
}

// moduleWriteProducer separates retained source definitions from performed initialization.
// Only direct statement-list assignments and direct calls establish a producer. Conditional,
// recursive and indirect routes remain possible, never a certificate for target pruning.
// The existing generation index and query budget bound the search, with no second source walk.
func (query *sourceValueQuery) moduleWriteProducer(left *ast.Node, bindings sourceValueBindings, result *accessorCandidates) (*ast.Node, bool) {
	if query.deferredCandidateExcluded(left, &accessorCandidates{}) {
		return nil, false
	}
	at := query.moduleRead()
	if at == nil {
		return nil, true
	}
	if query.afterRead(left) {
		return nil, false
	}
	if query.initializing != nil && enclosingCallableNode(query.initializing) == nil {
		at = query.initializing
	}
	possible, _ := query.reachable(left, bindings)
	if !possible {
		return nil, false
	}
	known, taken := query.logicalModuleWrite(left, bindings)
	if !known {
		return nil, true
	}
	if !taken {
		return nil, false
	}
	writer := enclosingCallableNode(left)
	if writer == nil {
		if ast.GetSourceFileOfNode(left) != ast.GetSourceFileOfNode(at) {
			return nil, true
		}
		if left.Pos() >= at.Pos() {
			return nil, false
		}
		if query.precedes(left, at, bindings) {
			return sourceProducerStatement(left), true
		}
		return nil, true
	}
	if creator := query.creators[writer].invocation; creator != nil {
		at := query.returning
		if at == nil {
			at = query.initializing
		}
		if at != nil && enclosingCallableNode(at) == writer {
			possible, _ := query.reachable(left, bindings)
			if !possible || left.Pos() >= at.Pos() {
				return nil, false
			}
			if query.precedes(left, at, bindings) {
				return creator, true
			}
		}
		return nil, true
	}
	possible = false
	for _, call := range query.owner.index(ast.GetSourceFileOfNode(left)).calls {
		// Only the enclosing invocation is later than this actual child-map
		// observation. Its callee and nested argument operations remain indexed.
		if query.stagedMapInvocationFollows(call) {
			continue
		}
		if query.active[call] || query.afterRead(call) {
			continue
		}
		if !query.charge(&accessorCandidates{}, call) {
			return nil, true
		}
		expression := call.AsCallExpression().Expression
		if call.AsCallExpression().Arguments != nil {
			for _, argument := range call.AsCallExpression().Arguments.Nodes {
				candidates := accessorCandidates{}
				// Acquiring this argument cannot execute the considered call's body.
				// Keep the same occurrence guard used by input/default binding.
				query.withActiveInvocation(call, func() {
					candidates = query.accessors(argument, nil, "", accessorAcquire, bindings, nil)
				})
				possible = possible || candidates.opaque
				for _, value := range candidates.values {
					possible = possible || value.node == writer
				}
			}
		}
		var body *ast.Node
		candidates := accessorCandidates{}
		for _, declaration := range query.callDeclarations(expression, &candidates) {
			if ast.IsVariableDeclaration(declaration) {
				declaration = unwrapSourceCallableReference(declaration.Initializer())
			}
			if declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil {
				body = declaration
			}
		}
		possible = possible || candidates.opaque

		if body != writer && (ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression)) && !query.active[call] {
			if disposition := query.stagedWriterRelevance(call, result); disposition.handled {
				if disposition.excluded {
					continue
				}
				return nil, true // The caller retains the explicit compiler-pending result.
			}
			candidates := query.receiverCandidates(call, bindings)
			for _, candidate := range candidates.values {
				if candidate.node == writer {
					body = writer
				}
			}
			possible = possible || candidates.opaque
		}
		if body != writer {
			possible = possible || body == nil && !nativeReceiverMemberDeclarations(expression, query.owner.checker) && unresolvedCallEnvironment(expression, ast.GetSourceFileOfNode(call), query.owner.checker, nil) == "unknown"
			continue
		}
		possible = true
		if query.moduleCallWriteProducer(left, writer, call, bindings) {
			return call, true
		}
	}
	return nil, possible
}

// sourceProducerStatement preserves the retained statement's full evaluation dependency.
// Shared reachability separately proves selection of any conditional expression region.
func sourceProducerStatement(work *ast.Node) *ast.Node {
	statement := sourceEvaluationStatement(work)
	if statement == nil || !ast.IsExpressionStatement(statement) {
		return nil
	}
	return statement
}

// sourceEvaluationStatement identifies the containing evaluation statement only.
// The shared reachability relation owns conditional execution, including expression
// branches. Returning an expression evaluates it before completion.
func sourceEvaluationStatement(work *ast.Node) *ast.Node {
	statement := work
	for statement != nil && !ast.IsStatement(statement) {
		parent := statement.Parent
		if parent == nil || ast.IsFunctionLike(parent) {
			return nil
		}
		statement = parent
	}
	if statement == nil || !ast.IsExpressionStatement(statement) && !ast.IsReturnStatement(statement) {
		return nil
	}
	return statement
}

// directSourceDataSlot excludes setters and inherited or dynamic slots from replacement proof.
func directSourceDataSlot(origin *ast.Node, written []string, left *ast.Node, c *checker.Checker) bool {
	// Assignment supersedes only an ordinary own data slot. An accessor can keep
	// returning its old value after a setter runs, so it cannot supply this proof.
	if len(written) != 1 {
		return false
	}
	data := false
	if ast.IsObjectLiteralExpression(origin) {
		for _, member := range origin.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsSpreadAssignment(member) || (member.Name() != nil && ast.IsComputedPropertyName(member.Name())) {
				return false
			}
			if member.Name() != nil && callableNameText(member.Name()) == written[0] {
				data = ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member) || ast.IsMethodDeclaration(member)
			}
		}
	}
	if ast.IsArrayLiteralExpression(origin) {
		// A direct assignment to an inherited standard data member creates an own slot.
		// This proves replacement only, never which implementation will be invoked.
		if _, indexed := sourceArrayIndex(written[0]); !indexed {
			data = nativeReceiverMemberDeclarations(left, c)
		}
		for i, element := range origin.AsArrayLiteralExpression().Elements.Nodes {
			if ast.IsSpreadElement(element) {
				return false
			}
			if strconv.Itoa(i) == written[0] {
				data = !ast.IsOmittedExpression(element)
				break
			}
		}
	}
	return data
}

// callableProducer admits only a proved reachable body expression in a synchronous
// direct call. Conditional and terminal prefixes use the shared branch relation.
func (query *sourceValueQuery) callableProducer(left, writer *ast.Node, bindings sourceValueBindings) bool {
	if writer.Body() == nil || !ast.IsBlock(writer.Body()) || ast.HasSyntacticModifier(writer, ast.ModifierFlagsAsync) || ast.IsMethodDeclaration(writer) && writer.AsMethodDeclaration().AsteriskToken != nil || ast.IsFunctionDeclaration(writer) && writer.AsFunctionDeclaration().AsteriskToken != nil || ast.IsFunctionExpression(writer) && writer.AsFunctionExpression().AsteriskToken != nil || sourceProducerStatement(left) == nil {
		return false
	}
	possible, certain := query.reachable(left, bindings)
	return possible && certain
}

// moduleBindingProducers supplies scalar binding dependencies to the same environment walker.
// Property demands use accessors instead, retaining projected alias and object identity.
func moduleBindingProducers(node, at *ast.Node, c *checker.Checker, owner *executableBodyOwner) accessorCandidates {
	result := accessorCandidates{}
	if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
		return result
	}
	symbol := c.GetSymbolAtLocation(node)
	if symbol == nil || symbol.ValueDeclaration == nil || enclosingCallableNode(symbol.ValueDeclaration) != nil || owner == nil || owner.values == nil || !owner.values.bindingWritten(symbol) {
		return result
	}
	query := &sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool), reading: at}
	query.origins(node, nil, &result)
	return result
}

// logicalModuleWrite uses only finite acquired literal values, never a type assertion or
// a general constant evaluator. An unknown branch remains possible rather than performed.
func (query *sourceValueQuery) logicalModuleWrite(left *ast.Node, bindings sourceValueBindings) (bool, bool) {
	if left.Parent == nil || !ast.IsBinaryExpression(left.Parent) {
		return true, true
	}
	op := left.Parent.AsBinaryExpression().OperatorToken.Kind
	if op != ast.KindBarBarEqualsToken && op != ast.KindAmpersandAmpersandEqualsToken && op != ast.KindQuestionQuestionEqualsToken {
		return true, true
	}
	// Reacquire the strictly earlier source prefix, rather than the binding currently
	// being joined. The shared budget still bounds aliases and recursive source routes.
	var id ast.SymbolId
	live := false
	if ast.IsIdentifier(left) {
		if symbol := query.owner.checker.GetSymbolAtLocation(left); symbol != nil {
			id = ast.GetSymbolId(symbol)
			live = query.live[id]
			delete(query.live, id)
		}
	}
	defer func() {
		if live {
			query.live[id] = true
		}
	}()
	previous := query.initializing
	query.initializing = left
	values := query.accessors(left, nil, "", accessorAcquire, bindings, nil)
	query.initializing = previous
	if values.opaque || len(values.values) == 0 {
		return false, false
	}
	var take bool
	for i, value := range values.values {
		value.node = unwrapSourceCallableReference(value.node)
		if value.node == nil || len(value.path) != 0 {
			return false, false
		}
		known, truthy, nullish := query.literalDecision(value.node, bindings)
		if !known {
			return false, false
		}
		next := sourceLogicalTakesRight(op, truthy, nullish)
		if i != 0 && next != take {
			return false, false
		}
		take = next
	}
	return true, take
}

// setterWriteProducer binds one source-owned implicit setter invocation to its indexed
// module assignment. Receiver acquisition precedes the RHS. Only one reachable site,
// one acquired setter and a proved body write can supply performed-write authority.
// The existing accessor, origin and reachability owners retain budget and uncertainty.
func (query *sourceValueQuery) setterWriteProducer(left *ast.Node, bindings sourceValueBindings) (*ast.Node, sourceValueBindings) {
	writer := enclosingCallableNode(left)
	at := query.moduleRead()
	if at == nil || writer == nil || !ast.IsSetAccessorDeclaration(writer) || writer.Parent == nil || !ast.IsObjectLiteralExpression(writer.Parent) || query.active[writer] || len(writer.Parameters()) != 1 {
		return nil, bindings
	}
	parameter := writer.Parameters()[0]
	if !ast.IsIdentifier(parameter.Name()) || parameter.Initializer() != nil || query.owner.bindingWritten(query.owner.checker.GetSymbolAtLocation(parameter.Name())) {
		return nil, bindings
	}
	if query.initializing != nil && enclosingCallableNode(query.initializing) == nil {
		at = query.initializing
	}
	query.active[writer] = true
	defer delete(query.active, writer)
	index := query.owner.index(ast.GetSourceFileOfNode(left))
	assignments := append(append([]sourceValueAssignment{}, index.memberOrigins[writer.Parent]...), index.dynamicMembers...)
	var producer *ast.Node
	var selected sourceValueBindings
	matched := false
	for _, assignment := range assignments {
		if !query.charge(&accessorCandidates{}, assignment.left) {
			return nil, bindings
		}
		// The index retains the normalized member and original RHS. Classify the
		// original assignment so wrapped references still count for uniqueness.
		operation := assignment.right.Parent
		if enclosingCallableNode(assignment.left) != nil || assignment.left.Pos() >= at.Pos() || ast.GetSourceFileOfNode(assignment.left) != ast.GetSourceFileOfNode(at) || operation == nil || !ast.IsBinaryExpression(operation) || operation.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || unwrapSourceCallableReference(operation.AsBinaryExpression().Left) != assignment.left {
			continue
		}
		possible, _ := query.reachable(assignment.left, bindings)
		if !possible {
			continue
		}
		receiver, name := accessorReceiver(assignment.left)
		if name == "" || name == "*" {
			continue
		}
		temporary := accessorCandidates{}
		receivers := query.originsAt(receiver, assignment.left, bindings, &temporary)
		if temporary.opaque || len(receivers) != 1 || receivers[0].node != writer.Parent || len(receivers[0].path) != 0 {
			continue
		}
		// JavaScript retains the reference's receiver before evaluating the RHS,
		// but PutValue selects the setter afterwards. Include RHS and other prior
		// effects in descriptor uncertainty without reacquiring the receiver.
		previous := query.initializing
		query.initializing = at
		candidates := query.accessors(receivers[0].node, nil, name, accessorSetAcquire, bindings, nil)
		query.initializing = previous
		owns := false
		for _, declaration := range candidates.declarations {
			owns = owns || declaration == writer
		}
		if !owns {
			continue
		}
		// A second possible invocation cannot be collapsed into this invocation's
		// receiver or RHS. Keeping the old relation is conservative for this proof.
		if matched || candidates.opaque || len(candidates.declarations) != 1 {
			return nil, bindings
		}
		matched = true
		if !query.precedes(assignment.left, at, bindings) || sourceProducerStatement(assignment.left) == nil {
			continue
		}
		actuals := query.originsAt(assignment.right, assignment.right, bindings, &temporary)
		if temporary.opaque || len(receivers) != 1 || receivers[0].node != writer.Parent || len(receivers[0].path) != 0 || len(actuals) == 0 {
			continue
		}
		bound := make(sourceValueBindings, len(bindings)+2)
		for id, values := range bindings {
			bound[id] = values
		}
		bound[0] = receivers
		query.bindPattern(parameter.Name(), actuals, bound, &temporary, accessorAcquire)
		if !temporary.opaque && query.callableProducer(left, writer, bound) {
			producer, selected = sourceProducerStatement(assignment.left), bound
		}
	}
	if producer == nil {
		return nil, bindings
	}
	return producer, selected
}

// sourceNumericPrefix is a query-local proof of the actual startup-to-acquisition
// prefix. It retains completed occurrences, not an abstract heap or a reusable
// clean environment. Unknown execution refuses the whole proof under existing fuel.
// The borrowed result is passed separately through synchronous proof steps. Keeping
// it out of the proof record prevents escaping proof inputs from retaining it.
type sourceNumericPrefix struct {
	query       *sourceValueQuery
	path        map[*ast.Node]*ast.Node
	active      map[*ast.Node]bool
	initialized map[*ast.SourceFile]bool
	allocated   map[*ast.Node]bool
	bindings    map[ast.SymbolId]bool
	completed   []*sourceImplicitInvocation
	producer    *ast.Node
}

// numericBindingReplacement consumes only a normally completed implicit activation
// before this exact acquired global binding. A standard initial writable Number
// slot is conditional on every reached prefix preserving it. No native fold fence
// is removed and an earlier captured reference cannot see a later replacement.
func (query *sourceValueQuery) numericBindingReplacement(symbol *ast.Symbol, read *ast.Node, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	if !ast.IsIdentifier(read) || read.Text() != "Number" || !standardLibraryCallRoot(read, query.owner.checker) || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return nil, false
	}
	implicit := false
	for _, effect := range query.owner.index(ast.GetSourceFileOfNode(read)).numberOpenCalls {
		if ast.IsPrefixUnaryExpression(effect) && effect.AsPrefixUnaryExpression().Operator == ast.KindPlusToken {
			implicit = true
			break
		}
	}
	if !implicit {
		return nil, false
	}
	proof := &sourceNumericPrefix{query: query, path: make(map[*ast.Node]*ast.Node), active: make(map[*ast.Node]bool), initialized: make(map[*ast.SourceFile]bool), allocated: make(map[*ast.Node]bool), bindings: make(map[ast.SymbolId]bool)}
	root := read
	for root.Parent != nil {
		if !query.charge(result, root) {
			return nil, false
		}
		parent := root.Parent
		if ast.IsFunctionLike(parent) {
			call := query.creators[parent].invocation
			if call == nil && query.inputs != nil && query.inputs.declaration == parent {
				call = query.inputs.invocation
			}
			if call == nil || call == root || !ast.IsCallExpression(call) || ast.GetSourceFileOfNode(call) != ast.GetSourceFileOfNode(root) {
				return nil, false
			}
			proof.path[call] = parent.Body()
			root = call
			continue
		}
		proof.path[parent] = root
		root = parent
	}
	if !ast.IsSourceFile(root) || !ast.IsExternalModule(root.AsSourceFile()) || !proof.imports(root.AsSourceFile(), result) || !proof.node(root, result) {
		return nil, false
	}
	var selected *sourceImplicitInvocation
	for _, invocation := range proof.completed {
		if invocation.assignment == nil {
			continue
		}
		left := invocation.assignment.AsBinaryExpression().Left
		if query.owner.checker.GetSymbolAtLocation(left) == symbol {
			selected = invocation
		}
	}
	if selected == nil {
		return nil, false
	}
	result.producers = append(result.producers, selected.producer)
	result.inputs = append(result.inputs, selected.inputs)
	return []sourceValue{{node: selected.assignment.AsBinaryExpression().Right}}, true
}

// imports audits the actual source modules selected by named imports before any
// entry statement, including imports textually after the acquisition. Only finite
// literal initialization without further syntactic runtime imports is admitted here.
// Standard emit elision serves operation dependency proofs, not this numeric
// startup premise. An erased import cannot relax its historical prefix policy.
func (proof *sourceNumericPrefix) imports(source *ast.SourceFile, result *accessorCandidates) bool {
	index := proof.query.owner.index(source)
	if index.incomplete {
		return false
	}
	for _, node := range index.runtimeImports {
		if !proof.query.charge(result, node) || !ast.IsImportDeclaration(node) {
			return false
		}
		// Alias resolution identifies a value, not every module that initializes it.
		// Require this actual selected module to own the declaration we audit.
		module := proof.query.owner.checker.GetSymbolAtLocation(node.AsImportDeclaration().ModuleSpecifier)
		if module == nil || len(module.Declarations) != 1 || !ast.IsSourceFile(module.Declarations[0]) {
			return false
		}
		selectedSource := module.Declarations[0].AsSourceFile()
		clause := node.AsImportDeclaration().ImportClause
		if clause == nil || clause.AsImportClause().Name() != nil {
			return false
		}
		named := clause.AsImportClause().NamedBindings
		if !ast.IsNamedImports(named) || len(named.AsNamedImports().Elements.Nodes) == 0 {
			return false
		}
		for _, imported := range named.AsNamedImports().Elements.Nodes {
			if !proof.query.charge(result, imported) {
				return false
			}
			symbol := proof.query.owner.checker.GetSymbolAtLocation(imported.Name())
			if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
				return false
			}
			symbol = proof.query.owner.checker.GetAliasedSymbol(symbol)
			if symbol == nil || symbol.ValueDeclaration == nil {
				return false
			}
			producer := ast.GetSourceFileOfNode(symbol.ValueDeclaration)
			if producer == nil || producer != selectedSource || producer == source || producer.IsDeclarationFile || proof.query.owner.index(producer).incomplete || len(proof.query.owner.index(producer).runtimeImports) != 0 {
				return false
			}
			if proof.initialized[producer] {
				continue
			}
			for _, statement := range producer.Statements.Nodes {
				if !ast.IsVariableStatement(statement) && !ast.IsFunctionDeclaration(statement) || !proof.node(statement, result) {
					return false
				}
			}
			proof.initialized[producer] = true
		}
	}
	return true
}

// node recognizes only execution-neutral allocation/declaration prefixes, actual
// direct zero-input source calls and the selected numeric activation. It is not a
// JavaScript evaluator. Loops, accessors, reflective work and unsupported operations
// refuse rather than gaining a completed-write fact from possible effects.
func (proof *sourceNumericPrefix) node(node *ast.Node, result *accessorCandidates) bool {
	if node == nil || !proof.query.charge(result, node) {
		return false
	}
	next := proof.path[node]
	if ast.IsSourceFile(node) || ast.IsBlock(node) {
		var statements []*ast.Node
		if ast.IsSourceFile(node) {
			statements = node.AsSourceFile().Statements.Nodes
		} else {
			statements = node.AsBlock().Statements.Nodes
		}
		for _, statement := range statements {
			if !proof.node(statement, result) {
				return false
			}
			if statement == next {
				return true
			}
		}
		return next == nil
	}
	if ast.IsVariableStatement(node) {
		for _, declaration := range node.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if !proof.query.charge(result, declaration) || !ast.IsIdentifier(declaration.Name()) || !proof.node(declaration.Initializer(), result) {
				return false
			}
			if symbol := proof.query.owner.checker.GetSymbolAtLocation(declaration.Name()); symbol != nil {
				proof.bindings[ast.GetSymbolId(symbol)] = true
			}
			if proof.path[declaration] != nil {
				return true
			}
		}
		return true
	}
	if ast.IsVariableDeclaration(node) {
		return ast.IsIdentifier(node.Name()) && proof.node(node.Initializer(), result)
	}
	if ast.IsImportDeclaration(node) || ast.IsFunctionDeclaration(node) {
		return true
	}
	if ast.IsIfStatement(node) {
		return next == node.AsIfStatement().Expression && proof.node(next, result)
	}
	if ast.IsExpressionStatement(node) {
		return proof.node(node.AsExpressionStatement().Expression, result)
	}
	if ast.IsReturnStatement(node) {
		return next != nil && proof.node(next, result)
	}
	if ast.IsParenthesizedExpression(node) || ast.IsAsExpression(node) || ast.IsSatisfiesExpression(node) || ast.IsNonNullExpression(node) {
		return proof.node(node.Expression(), result)
	}
	if ast.IsIdentifier(node) {
		symbol := proof.query.owner.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return false
		}
		if next == nil && (node.Text() == "Number" && standardLibraryCallRoot(node, proof.query.owner.checker)) {
			return true
		}
		if symbol.Flags&ast.SymbolFlagsAlias != 0 {
			symbol = proof.query.owner.checker.GetAliasedSymbol(symbol)
		}
		return symbol != nil && symbol.ValueDeclaration != nil && !ast.GetSourceFileOfNode(symbol.ValueDeclaration).IsDeclarationFile && !proof.query.owner.bindingWritten(symbol) && (ast.IsFunctionDeclaration(symbol.ValueDeclaration) || proof.bindings[ast.GetSymbolId(symbol)])
	}
	if sourceNumericPrimitive(node) || ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) {
		return true
	}
	if ast.IsObjectLiteralExpression(node) {
		for _, member := range node.AsObjectLiteralExpression().Properties.Nodes {
			if !proof.query.charge(result, member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) == "__proto__" {
				return false
			}
			if ast.IsPropertyAssignment(member) {
				if !proof.node(member.AsPropertyAssignment().Initializer, result) {
					return false
				}
			} else if !ast.IsMethodDeclaration(member) {
				return false
			}
		}
		proof.allocated[node] = true
		return true
	}
	if ast.IsPropertyAccessExpression(node) && next == node.AsPropertyAccessExpression().Expression {
		return proof.node(next, result)
	}
	if ast.IsPrefixUnaryExpression(node) {
		invocation := proof.query.numericOwnInvocation(node, proof.producer, result)
		if invocation == nil || !proof.allocated[invocation.receiver] {
			return false
		}
		if invocation.assignment != nil && !proof.globalPut(invocation.assignment.AsBinaryExpression().Left, result) {
			return false
		}
		if invocation.producer == nil {
			invocation.producer = node
		}
		proof.completed = append(proof.completed, invocation)
		return true
	}
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if next == call.Expression {
		return proof.node(next, result)
	}
	if !ast.IsIdentifier(call.Expression) || call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		return false
	}
	symbol := proof.query.owner.checker.GetSymbolAtLocation(call.Expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || !ast.IsFunctionDeclaration(symbol.ValueDeclaration) || proof.query.owner.bindingWritten(symbol) {
		return false
	}
	body := symbol.ValueDeclaration
	if body.Body() == nil || len(body.Parameters()) != 0 || ast.HasSyntacticModifier(body, ast.ModifierFlagsAsync) || body.AsFunctionDeclaration().AsteriskToken != nil || proof.active[body] || next != nil && next != body.Body() || ast.GetSourceFileOfNode(body) != ast.GetSourceFileOfNode(node) {
		return false
	}
	// The path stops one actual receiving activation, not every use of its AST.
	// An earlier call of a target-path body needs complete-prefix proof. Refuse
	// that overlap instead of borrowing the later activation's acquisition stop.
	if proof.path[body.Body()] != nil && next != body.Body() {
		return false
	}
	previous := proof.producer
	if previous == nil {
		proof.producer = node
	}
	proof.active[body] = true
	accepted := proof.node(body.Body(), result)
	delete(proof.active, body)
	proof.producer = previous
	return accepted
}

// globalPut requires the binder-owned globalThis namespace and actual standard
// Number variable symbol. Its writable ordinary startup slot survives only this
// admitted prefix. A type-compatible receiver or authored ambient shadow is not it.
func (proof *sourceNumericPrefix) globalPut(left *ast.Node, result *accessorCandidates) bool {
	if !proof.query.charge(result, left) || !ast.IsPropertyAccessExpression(left) {
		return false
	}
	receiver := left.AsPropertyAccessExpression().Expression
	if !ast.IsIdentifier(receiver) || receiver.Text() != "globalThis" {
		return false
	}
	namespace := proof.query.owner.checker.GetSymbolAtLocation(receiver)
	symbol := proof.query.owner.checker.GetSymbolAtLocation(left)
	return namespace != nil && namespace.Flags&ast.SymbolFlagsModule != 0 && len(namespace.Declarations) == 0 && symbol != nil && namespace.Exports[ast.SymbolName(symbol)] == symbol && ast.SymbolName(symbol) == "Number" && symbol.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration))
}

// replacesSourceValue requires both own-data authority and a completed source write.
// A performed Set alone does not prove a receiver retained the assigned value.
func (query *sourceValueQuery) replacesSourceValue(origin *ast.Node, written []string, left *ast.Node, mode accessorTraversal, producer *ast.Node, bindings sourceValueBindings) bool {
	data := directSourceDataSlot(origin, written, left, query.owner.checker)
	if len(written) == 1 && query.dependenciesOnly && ast.IsNewExpression(origin) {
		data = query.sourceConstructedDataSlot(origin, written[0], bindings)
	}
	return data && query.sourceWritePrecedes(left, producer, bindings)
}

// sourceWritePrecedes shares performed-write ordering without granting data-slot
// identity. Both replacement and method-operation consumers use the actual complete
// assignment, caller producer and conditional/abrupt-completion relations.
func (query *sourceValueQuery) sourceWritePrecedes(left, producer *ast.Node, bindings sourceValueBindings) bool {
	at := query.initializing
	if at == nil {
		at = query.returning
	}
	if at == nil && query.moduleRead() != nil {
		at = query.reading
	}
	if at == nil || left.Parent == nil || !ast.IsBinaryExpression(left.Parent) || left.Parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return false
	}
	if producer != nil && enclosingCallableNode(left) != enclosingCallableNode(at) {
		return query.precedes(producer, at, bindings) && query.callableProducer(left.Parent, enclosingCallableNode(left), bindings)
	}
	return query.precedes(left.Parent, at, bindings)
}

// moduleCallWriteProducer preserves the existing performed-write law for one
// original Call. Another invocation of the same declaration cannot borrow it.
func (query *sourceValueQuery) moduleCallWriteProducer(left, writer, call *ast.Node, bindings sourceValueBindings) bool {
	at := query.moduleRead()
	if at == nil || call == nil || writer == nil {
		return false
	}
	if query.initializing != nil && enclosingCallableNode(query.initializing) == nil {
		at = query.initializing
	}
	expression := call.AsCallExpression().Expression
	known, taken := query.logicalModuleWrite(left, bindings)
	return known && taken && ast.IsIdentifier(expression) && ast.IsFunctionDeclaration(writer) && !query.owner.bindingWritten(query.owner.checker.GetSymbolAtLocation(expression)) && enclosingCallableNode(call) == nil && query.precedes(call, at, bindings) && query.callableProducer(left, writer, bindings)
}

// descriptorWriterPrecedes ties a performed own-slot write to this particular
// local Call before the descriptor snapshot. Other calls of that function cannot
// supply its ordering. The member owner checks the actual receiver and data slot.
func (q *sourceValueQuery) descriptorWriterPrecedes(left, call, lookup *ast.Node, caller, writerBindings sourceValueBindings) bool {
	writer := enclosingCallableNode(left)
	target := unwrapSourceCallableReference(call.Expression())
	if target == nil || !ast.IsIdentifier(target) || writer == nil || !ast.IsFunctionDeclaration(writer) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(target)
	return symbol != nil && symbol.ValueDeclaration == writer && !q.owner.bindingWritten(symbol) &&
		q.precedes(call, lookup, caller) && q.callableProducer(left, writer, writerBindings)
}
