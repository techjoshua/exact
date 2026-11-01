package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedPrefixBuilder compiles a completely closed module interval into the
// existing storage schedule. Its symbol table is discovery-only and is never
// retained by a receipt or used to execute source expressions.
type closedPrefixBuilder struct {
	storageBuilder
	runtime      map[*ast.Node]bool
	declarations []*ast.Node
}

func (p *closedPrefixBuilder) mark(n *ast.Node) bool {
	if n == nil || !p.discover() {
		return false
	}
	p.runtime[n] = true
	return true
}

// Prefix statements borrow the same scalar value/reference recursion as bodies.
func (p *closedPrefixBuilder) lowerer() expressionLowerer {
	return expressionLowerer{storageBuilder: &p.storageBuilder, context: expressionContext{prefix: p, runtime: p.runtime}}
}
func (p *closedPrefixBuilder) expression(n *ast.Node) (int, bool) {
	x := p.lowerer()
	return x.value(n)
}
func (p *closedPrefixBuilder) reference(n *ast.Node) (int, bool) {
	x := p.lowerer()
	return x.reference(n)
}

// capture audits runtime identifiers with resolved symbols. Types do not read
// values, static property names are not captures, and nested callable scopes,
// lexical capabilities and ambiguous declarations are excluded before entry.
func (p *closedPrefixBuilder) capture(arrow *ast.Node) (*closedCallableProof, bool) {
	if !p.discover() || ast.HasSyntacticModifier(arrow, ast.ModifierFlagsAsync) || ast.HasDecorators(arrow) || arrow.Body() == nil {
		return nil, false
	}
	if !closedCallableNode(arrow) {
		return nil, false
	}
	if moduleActivationCaptureCreator(arrow) {
		return p.activationCreatorProof(arrow)
	}
	// Pay the complete physical projection before allocating its frozen slices.
	for range arrow.Parameters() {
		if !p.discover() {
			return nil, false
		}
	}
	mapping := &closedParameterMap{arrow: arrow, physical: append([]*ast.Node(nil), arrow.Parameters()...), references: make(map[*ast.Node]int)}
	runtime := arrow.Parameters()
	if ast.IsFunctionExpression(arrow) {
		if len(runtime) == 0 {
			return nil, false
		}
		mapping.erasedThis = runtime[0]
		runtime = runtime[1:]
	}
	mapping.declarations = append([]*ast.Node(nil), runtime...)
	if !mapping.validProjection() {
		return nil, false
	}
	parameters := make(map[ast.SymbolId]int)
	references := mapping.references
	for position, parameter := range mapping.declarations {
		if !p.discover() || !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil && mapping.defaultParameter(position) != parameter || parameter.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(parameter) {
			return nil, false
		}
		s := p.query.owner.checker.GetSymbolAtLocation(parameter.Name())
		if s == nil || s.ValueDeclaration != parameter || len(s.Declarations) != 1 {
			return nil, false
		}
		parameters[ast.GetSymbolId(s)] = position
	}
	captureDeclarations := []*ast.Node{}
	captureReferences := make(map[*ast.Node]int)
	valid := true
	var visit func(*ast.Node) bool
	visit = func(n *ast.Node) bool {
		if !valid || !p.discover() {
			valid = false
			return true
		}
		if ast.IsTypeNode(n) || ast.IsPartOfTypeNode(n) {
			return false
		}
		if ast.HasDecorators(n) || n.Kind == ast.KindImportKeyword || n.Kind == ast.KindClassExpression || ast.IsFunctionLike(n) || n.Kind == ast.KindThisKeyword && !ast.IsFunctionExpression(arrow) && !ast.IsGetAccessorDeclaration(arrow) || n.Kind == ast.KindSuperKeyword || n.Kind == ast.KindMetaProperty || ast.IsJsxElement(n) || ast.IsJsxSelfClosingElement(n) {
			valid = false
			return true
		}
		if ast.IsIdentifier(n) && !isStaticPropertyName(n) && !(n.Parent != nil && ast.IsPropertyAssignment(n.Parent) && n.Parent.Name() == n) {
			s := p.query.owner.checker.GetSymbolAtLocation(n)
			if n.Parent != nil && ast.IsShorthandPropertyAssignment(n.Parent) {
				s = p.query.owner.checker.GetShorthandAssignmentValueSymbol(n.Parent)
			}
			position, local := 0, false
			if s != nil {
				position, local = parameters[ast.GetSymbolId(s)]
			}
			if s == nil {
				valid = false
				return true
			}
			if !local {
				d := s.ValueDeclaration
				binding, present := p.locals[ast.GetSymbolId(s)]
				if (!ast.IsArrowFunction(arrow) && !moduleFunctionDeclaration(arrow)) || len(parameters) != 0 || !present || binding.cell < 0 || binding.cell >= len(p.declarations) || p.declarations[binding.cell] != d || len(s.Declarations) != 1 || !ast.IsVariableDeclaration(d) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 || d.Parent.Parent == nil || d.Parent.Parent.Parent != ast.GetSourceFileOfNode(arrow).AsNode() || ast.HasSyntacticModifier(d.Parent.Parent, ast.ModifierFlagsExport|ast.ModifierFlagsAmbient) || (!moduleFunctionDeclaration(arrow) && d.End() > arrow.Pos()) || d.Initializer() == nil || !ast.IsObjectLiteralExpression(d.Initializer()) {
					valid = false
					return true
				}
				if len(captureDeclarations) == 0 {
					captureDeclarations = append(captureDeclarations, d)
				}
				if len(captureDeclarations) != 1 || captureDeclarations[0] != d {
					valid = false
					return true
				}
				captureReferences[n] = 0
			} else {
				references[n] = position
			}
		}
		n.ForEachChild(visit)
		return !valid
	}
	visit(arrow.Body())
	// Initializer references use the same checker-owned formal map. In the finite
	// two-formal path only the second default may read the earlier slot0.
	for i, parameter := range mapping.declarations {
		if initializer := parameter.Initializer(); initializer != nil {
			visit(initializer)
			if i > 0 {
				slot, ok := references[mapping.earlierDefaultRead()]
				if !ok || slot != 0 || slot >= i {
					valid = false
				}
			}
		}
	}
	if !valid || p.exhausted {
		return nil, false
	}
	proof := &closedCallableProof{arrow: arrow, parameters: len(parameters), empty: len(captureDeclarations) == 0, captureDeclarations: captureDeclarations, captureReferences: captureReferences}
	proof.entry, proof.plan = p.callBodyRecipe(arrow, mapping, proof)
	return proof, !p.exhausted
}

// qualifyClosedPrefix exhaustively validates every module statement and emitted
// runtime instruction before reservation. Its fixed allowance bounds symbols,
// syntax, event/register allocations and capture traversal. Failure is whole
// before-entry refusal and publishes no semantic root or acquired value.
func qualifyClosedPrefix(q *sourceValueQuery, source *ast.SourceFile, budget int) (*storageRecipe, map[*ast.Node]bool, *ast.Node, bool) {
	if source == nil || source.IsDeclarationFile || !ast.IsExternalModule(source) {
		return nil, nil, nil, false
	}
	p := closedPrefixBuilder{storageBuilder: storageBuilder{query: q, discovery: budget, locals: make(map[ast.SymbolId]storageBinding), recipe: storageRecipe{body: source.AsNode(), prefix: true}}, runtime: make(map[*ast.Node]bool)}
	p.runtime[source.AsNode()] = true
	var statement, call *ast.Node
	var secondStatement, secondCall *ast.Node
	var binding *ast.Node
	var initializer *ast.Node
	hoisted := 0
	for _, s := range source.Statements.Nodes {
		if !p.mark(s) || ast.HasDecorators(s) {
			return nil, nil, nil, false
		}
		if ast.IsExportDeclaration(s) {
			e := s.AsExportDeclaration()
			if e.ModuleSpecifier != nil || e.ExportClause == nil || !ast.IsNamedExports(e.ExportClause) || len(e.ExportClause.AsNamedExports().Elements.Nodes) != 0 {
				return nil, nil, nil, false
			}
			continue
		}
		if ast.IsFunctionDeclaration(s) {
			if !moduleFunctionDeclaration(s) || hoisted != 0 || binding != nil || !p.discover() {
				return nil, nil, nil, false
			}
			symbol := q.owner.checker.GetSymbolAtLocation(s.Name())
			if symbol == nil || symbol.ValueDeclaration != s || len(symbol.Declarations) != 1 {
				return nil, nil, nil, false
			}
			id := ast.GetSymbolId(symbol)
			if _, exists := p.locals[id]; exists {
				return nil, nil, nil, false
			}
			p.locals[id] = storageBinding{cell: p.recipe.locals}
			p.recipe.locals++
			p.recipe.constants = append(p.recipe.constants, false)
			p.declarations = append(p.declarations, s)
			hoisted++
			continue
		}
		if call != nil || binding != nil {
			if binding != nil || secondCall != nil || !ast.IsExpressionStatement(s) || !ast.IsCallExpression(s.Expression()) || ast.IsOptionalChain(s.Expression()) {
				return nil, nil, nil, false
			}
			secondStatement, secondCall = s, s.Expression()
			continue
		}
		if ast.IsVariableStatement(s) {
			if ast.HasSyntacticModifier(s, ast.ModifierFlagsAmbient|ast.ModifierFlagsExport|ast.ModifierFlagsDefault) {
				return nil, nil, nil, false
			}
			if !p.mark(s.AsVariableStatement().DeclarationList) {
				return nil, nil, nil, false
			}
			list := s.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			if list.Flags&(ast.NodeFlagsConst|ast.NodeFlagsLet) == 0 {
				return nil, nil, nil, false
			}

			if len(list.Declarations.Nodes) == 1 && supportedBindingDeclaration(list.Declarations.Nodes[0]) {
				binding = list.Declarations.Nodes[0]
				if list.Flags&ast.NodeFlagsConst == 0 || !p.mark(binding) || !p.mark(binding.Name()) {
					return nil, nil, nil, false
				}
				elements, supported := bindingElements(binding)
				if !supported {
					return nil, nil, nil, false
				}
				for _, element := range elements {
					if !p.mark(element) || !p.mark(element.Name()) {
						return nil, nil, nil, false
					}
					symbol := q.owner.checker.GetSymbolAtLocation(element.Name())
					if symbol == nil || symbol.ValueDeclaration != element || len(symbol.Declarations) != 1 {
						return nil, nil, nil, false
					}
					id := ast.GetSymbolId(symbol)
					if _, exists := p.locals[id]; exists {
						return nil, nil, nil, false
					}
					p.locals[id] = storageBinding{cell: p.recipe.locals}
					p.recipe.locals++
					p.recipe.constants = append(p.recipe.constants, true)
					p.declarations = append(p.declarations, element)
				}
				statement = s
				continue
			}
			for _, d := range list.Declarations.Nodes {
				if !p.mark(d) || !ast.IsIdentifier(d.Name()) || !p.mark(d.Name()) || d.Initializer() == nil {
					return nil, nil, nil, false
				}
				symbol := q.owner.checker.GetSymbolAtLocation(d.Name())
				if symbol == nil || symbol.ValueDeclaration != d || len(symbol.Declarations) != 1 {
					return nil, nil, nil, false
				}
				id := ast.GetSymbolId(symbol)
				if _, exists := p.locals[id]; exists {
					return nil, nil, nil, false
				}
				p.locals[id] = storageBinding{cell: p.recipe.locals}
				p.recipe.locals++
				p.recipe.constants = append(p.recipe.constants, list.Flags&ast.NodeFlagsConst != 0)
				p.declarations = append(p.declarations, d)
				if ast.IsCallExpression(d.Initializer()) || sourceArrayInitializerCall(d) != nil {
					if len(list.Declarations.Nodes) != 1 || list.Flags&ast.NodeFlagsConst == 0 || ast.IsOptionalChain(d.Initializer()) {
						return nil, nil, nil, false
					}
					initializer, statement, call = d, s, d.Initializer()
					if nested := sourceArrayInitializerCall(d); nested != nil {
						call = nested
					}
				}
			}
			continue
		}
		if closedPrefixAssignmentStatement(s) {
			continue
		}
		if !ast.IsExpressionStatement(s) || !ast.IsCallExpression(s.Expression()) || ast.IsOptionalChain(s.Expression()) {
			return nil, nil, nil, false
		}
		statement, call = s, s.Expression()
	}
	if call == nil && binding == nil {
		return nil, nil, nil, false
	}
	if hoisted != 0 {
		if binding != nil || !ast.IsIdentifier(call.Expression()) {
			return nil, nil, nil, false
		}
		selected := q.owner.checker.GetSymbolAtLocation(call.Expression())
		if selected == nil || len(selected.Declarations) != 1 {
			return nil, nil, nil, false
		}
		count := 0
		if call.AsCallExpression().Arguments != nil {
			count = len(call.AsCallExpression().Arguments.Nodes)
		}
		if count != 0 && (initializer == nil || count != 1 || !moduleActivationCaptureCreator(selected.ValueDeclaration)) {
			return nil, nil, nil, false
		}
		// Source declaration instantiation precedes every lexical initializer.
		// The complete symbol/cell layout is known, but no value has run yet.
		for cell, d := range p.declarations {
			if !moduleFunctionDeclaration(d) {
				continue
			}
			if selected.ValueDeclaration != d {
				return nil, nil, nil, false
			}
			proof, ok := p.capture(d)
			if !ok || proof == nil || proof.empty && !moduleActivationCaptureCreator(d) || proof.entry == nil {
				return nil, nil, nil, false
			}
			p.event(storageEvent{kind: "InstantiateModuleFunction", node: d, callable: proof, cell: cell})
		}
	}
	// All lexical cells are instantiated by schedule setup before the first
	// initializer. Initializers are then emitted in their original source order.
	for _, s := range source.Statements.Nodes {
		if closedPrefixAssignmentStatement(s) {
			// The existing VALUE schedule owns effects/state once. The statement
			// adapter does not consume its final register as a binding value.
			if _, ok := p.expression(s.Expression()); !ok {
				return nil, nil, nil, false
			}
			continue
		}
		if !ast.IsVariableStatement(s) {
			continue
		}
		for _, d := range s.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			if d == binding || d == initializer {
				continue
			}
			value, ok := p.expression(d.Initializer())
			if !ok {
				return nil, nil, nil, false
			}
			symbol := q.owner.checker.GetSymbolAtLocation(d.Name())
			p.event(storageEvent{kind: "InitializeCell", node: d, a: value, cell: p.locals[ast.GetSymbolId(symbol)].cell})
		}
	}

	if binding != nil {
		if !p.emptyBinding(binding) || p.exhausted {
			return nil, nil, nil, false
		}
		p.recipe.declarations = append([]*ast.Node(nil), p.declarations...)
		r := p.recipe
		r.binding.recipe = &r
		return &r, p.runtime, statement, true
	}
	x := p.lowerer()
	arrayRegister := -1
	if initializer != nil && sourceArrayInitializerCall(initializer) != nil {
		if secondCall != nil || !p.mark(initializer.Initializer()) {
			return nil, nil, nil, false
		}
		p.recipe.hasArray = true
		arrayRegister = p.event(storageEvent{kind: "AllocateArray", node: initializer.Initializer()})
	}
	callee, acquired := x.callInputs(call)
	if !acquired {
		return nil, nil, nil, false
	}
	if initializer != nil {
		if call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 {
			symbol := q.owner.checker.GetSymbolAtLocation(call.Expression())
			if symbol == nil || !moduleActivationCaptureCreator(symbol.ValueDeclaration) || len(call.AsCallExpression().Arguments.Nodes) != 1 {
				return nil, nil, nil, false
			}
		}
		symbol := q.owner.checker.GetSymbolAtLocation(initializer.Name())
		value := p.event(storageEvent{kind: "InvokeAcquiredCall", node: call, a: callee})
		if arrayRegister >= 0 {
			// These are the existing array core events. The actual Call register is
			// never classified as a primitive/object static-domain substitute.
			p.event(storageEvent{kind: "DefineArraySlot", node: call, a: arrayRegister, b: value, key: languageStringKey("0"), keyProducerPC: -1})
			value = p.event(storageEvent{kind: "ArrayComplete", node: initializer.Initializer(), a: arrayRegister})
		}
		p.event(storageEvent{kind: "InitializeCell", node: initializer, a: value, cell: p.locals[ast.GetSymbolId(symbol)].cell})
	}
	if p.exhausted {
		return nil, nil, nil, false
	}
	if p.recipe.choiceSlots > 0 {
		if p.recipe.choiceSlots > p.recipe.registers || p.recipe.choiceSlots > len(p.recipe.events) {
			return nil, nil, nil, false
		}
		selectors := 0
		for pc, e := range p.recipe.events {
			if !p.discover() {
				return nil, nil, nil, false
			}
			if prefixChoiceSelector(e.kind) {
				selectors++
				if e.kind == "SelectConditional" {
					if _, ok := conditionalLayout(&p.recipe, pc); !ok {
						return nil, nil, nil, false
					}
					continue
				}
				if e.a < 0 || e.a >= p.recipe.registers || e.out < 0 || e.out >= p.recipe.registers || e.entry != pc+1 || e.entry >= e.merge || e.end != e.merge+1 || e.end > len(p.recipe.events) {
					return nil, nil, nil, false
				}
			}
		}
		if selectors != p.recipe.choiceSlots {
			return nil, nil, nil, false
		}
	}
	p.recipe.call = call
	p.recipe.declarations = append([]*ast.Node(nil), p.declarations...)
	r := p.recipe
	if secondCall != nil {
		// Both source sites are acquired independently. No callable body or
		// allocation is repeated by the successor acquisition recipe.
		if !ast.IsIdentifier(call.Expression()) || !ast.IsIdentifier(secondCall.Expression()) ||
			initializer == nil && call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 ||
			secondCall.AsCallExpression().Arguments != nil && len(secondCall.AsCallExpression().Arguments.Nodes) != 0 {
			return nil, nil, nil, false
		}
		firstSymbol := q.owner.checker.GetSymbolAtLocation(call.Expression())
		secondSymbol := q.owner.checker.GetSymbolAtLocation(secondCall.Expression())
		if firstSymbol == nil || initializer == nil && firstSymbol != secondSymbol || initializer != nil && (secondSymbol == nil || secondSymbol.ValueDeclaration != initializer || !moduleActivationCaptureCreator(firstSymbol.ValueDeclaration)) {
			return nil, nil, nil, false
		}
		next := closedPrefixBuilder{storageBuilder: storageBuilder{query: q, discovery: p.discovery, locals: p.locals, recipe: storageRecipe{body: source.AsNode(), prefix: true, locals: r.locals, constants: r.constants, declarations: r.declarations, call: secondCall}}, runtime: p.runtime, declarations: p.declarations}
		x := next.lowerer()
		if _, ok := x.callInputs(secondCall); !ok || next.exhausted {
			return nil, nil, nil, false
		}
		if !p.discover() || !p.discover() {
			return nil, nil, nil, false
		}
		r.callSites = []closedPrefixCallSite{{statement: statement, call: call, acquisition: &r}, {statement: secondStatement, call: secondCall, acquisition: &next.recipe}}
		if initializer != nil && !p.prepareActivationCallBody(&r) {
			return nil, nil, nil, false
		}
	}
	return &r, p.runtime, statement, true
}

// closedPrefixAssignmentStatement owns the finite ordered statement shapes.
// It grants no symbol or execution authority. The common lowerer authenticates
// the computed Symbol binding/member and resolves the Reference before RHS.
func closedPrefixAssignmentStatement(s *ast.Node) bool {
	if s == nil || !ast.IsExpressionStatement(s) || !ast.IsBinaryExpression(s.Expression()) {
		return false
	}
	b := s.Expression().AsBinaryExpression()
	if b.OperatorToken.Kind != ast.KindEqualsToken || ast.IsOptionalChain(b.Left) {
		return false
	}
	if ast.IsPropertyAccessExpression(b.Left) {
		return ast.IsIdentifier(b.Left.Expression()) && (ast.IsIdentifier(b.Right) || expressionLiteralNode(b.Right))
	}
	if !ast.IsElementAccessExpression(b.Left) || !ast.IsIdentifier(b.Left.Expression()) {
		return false
	}
	key := b.Left.AsElementAccessExpression().ArgumentExpression
	if key == nil || !ast.IsPropertyAccessExpression(key) || ast.IsOptionalChain(key) || !ast.IsIdentifier(key.Expression()) || key.Expression().Text() != "Symbol" || key.Name().Text() != "iterator" {
		return false
	}
	return b.Right.Kind == ast.KindNumericLiteral || ast.IsFunctionExpression(b.Right)
}
