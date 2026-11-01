package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// secretArtifactPlan binds qualified runtime expressions before lowering changes
// parentage. Retention checks use original AST identity, never payload text or
// post-lowering checker queries. Unknown types do not establish secret data.
type secretArtifactPlan struct {
	values         map[*ast.Node]struct{}
	references     map[*ast.Node]ast.SymbolId
	declarations   map[*ast.Node]ast.SymbolId
	pure           map[ast.SymbolId]bool
	names          map[string]ast.SymbolId
	deadProjection bool
	privateSource  bool
}

func planSecretArtifactDefinitions(source *ast.SourceFile, c *checker.Checker, subjects policySubjects) secretArtifactPlan {
	p := secretArtifactPlan{values: make(map[*ast.Node]struct{}), references: make(map[*ast.Node]ast.SymbolId), declarations: make(map[*ast.Node]ast.SymbolId), pure: make(map[ast.SymbolId]bool), names: make(map[string]ast.SymbolId), deadProjection: source.ExternalModuleIndicator != nil}
	// Completed roots belong to this unchanged checker only. Incomplete roots
	// retain protection and are not published as completed qualification facts.
	qualifiedTypes := make(map[checker.TypeId]bool)
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if annotations := policyNodeAnnotations(node, source); annotations.policy != nil && annotations.policy.Secret {
			p.privateSource = true
		}
		if ast.IsPartOfTypeNode(node) || ast.IsTypeAliasDeclaration(node) || ast.IsInterfaceDeclaration(node) {
			// Type-only references still need their declarations in emitted TS.
			// Keep bindings conservatively rather than publish dangling types.
			walkNode(node, func(reference *ast.Node) bool {
				if annotations := policyNodeAnnotations(reference, source); annotations.policy != nil && annotations.policy.Secret {
					p.privateSource = true
				}
				if ast.IsIdentifier(reference) && !ast.IsDeclarationName(reference) {
					if symbol := c.GetSymbolAtLocation(reference); symbol != nil {
						p.references[reference] = ast.GetSymbolId(c.GetExportSymbolOfSymbol(symbol))
					}
				}
				return true
			})
			return false
		}
		shorthand := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) && node.Parent.Name() == node
		// A qualified assertion introduces a runtime representation. References to
		// ambient credentials have no initializer payload to publish here.
		if ast.IsAsExpression(node) || ast.IsTypeAssertion(node) {
			if secretArtifactOwnDataQualified(c.GetTypeAtLocation(node), c, make(map[checker.TypeId]bool)) {
				p.values[node] = struct{}{}
			}
		}
		// Contextual contracts survive an inferred any or a nested aggregate
		// return. Inspect stored-data obligations separately from deferred
		// whole-value disclosure, unknown effects and display-name approximations.
		if ast.IsExpression(node) && (shorthand || !ast.IsDeclarationName(node) && !isStaticPropertyName(node)) {
			contextual := c.GetContextualType(node, checker.ContextFlagsNone)
			if shorthand {
				contextual = c.GetContextualTypeForObjectLiteralElement(node.Parent, checker.ContextFlagsNone)
			}
			if secretArtifactOwnDataQualified(contextual, c, make(map[checker.TypeId]bool)) {
				p.values[node] = struct{}{}
			}
		}
		if node.Parent != nil && ast.IsObjectLiteralExpression(node.Parent) && node.Name() != nil {
			receiver := c.GetContextualType(node.Parent, checker.ContextFlagsNone)
			key := c.GetExactPolicyPropertyKey(node.Name())
			if secretArtifactKeyQualified(receiver, key, c, func(property *ast.Symbol) bool { return property != nil && checkerPropertyHasSecretPolicy(property) }) {
				if ast.IsPropertyAssignment(node) {
					p.values[node.AsPropertyAssignment().Initializer] = struct{}{}
				}
				if ast.IsShorthandPropertyAssignment(node) {
					p.values[node.Name()] = struct{}{}
				}
				if ast.IsFunctionLike(node) && node.Body() != nil {
					p.values[node.Body()] = struct{}{}
				}
			}
		}
		if ast.IsFunctionLike(node) && node.Body() != nil {
			annotations := policyNodeAnnotations(node, source)
			qualified := annotations.policy != nil && annotations.policy.Secret
			if node.Type() != nil {
				qualified = qualified || secretArtifactOwnDataQualified(c.GetTypeAtLocation(node.Type()), c, make(map[checker.TypeId]bool))
			}
			if qualified {
				p.values[node.Body()] = struct{}{}
			}
		}
		if ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind) {
			assignment := node.AsBinaryExpression()
			qualified := false
			policyAssignmentTargets(assignment.Left, func(target *ast.Node) {
				qualified = qualified || secretArtifactAssignmentQualified(target, c, qualifiedTypes)
			})
			if qualified {
				p.values[assignment.Right] = struct{}{}
			}
		}
		if ast.IsForInOrOfStatement(node) {
			loop := node.AsForInOrOfStatement()
			qualified := false
			policyAssignmentTargets(loop.Initializer, func(target *ast.Node) {
				qualified = qualified || secretArtifactAssignmentQualified(target, c, qualifiedTypes)
			})
			if qualified {
				p.values[loop.Expression] = struct{}{}
			}
		}
		// Deferred defaults still embed payload in retained definitions. Binding
		// elements consume the existing propagated subject, since an input's
		// explicit policy need not appear in the binding's inferred checker type.
		if ast.IsVariableDeclaration(node) || ast.IsPropertyDeclaration(node) || ast.IsParameterDeclaration(node) || ast.IsBindingElement(node) {
			if initializer := node.Initializer(); initializer != nil {
				annotations := policyNodeAnnotations(node, source)
				if annotations.policy != nil && annotations.policy.Secret {
					p.values[initializer] = struct{}{}
				}
				if secretArtifactOwnDataQualified(c.GetTypeAtLocation(node), c, make(map[checker.TypeId]bool)) {
					p.values[initializer] = struct{}{}
				}
				if ast.IsBindingElement(node) && ast.IsIdentifier(node.Name()) {
					if symbol := c.GetSymbolAtLocation(node.Name()); symbol != nil {
						if subject, found := subjects.symbols[ast.GetSymbolId(symbol)]; found && subject.Policy.Secret {
							p.values[initializer] = struct{}{}
						}
					}
				}
			}
		}
		if ast.IsExportSpecifier(node) {
			if symbol := c.GetExportSpecifierLocalTargetSymbol(node); symbol != nil {
				p.references[node] = ast.GetSymbolId(c.GetExportSymbolOfSymbol(symbol))
			}
		}
		if ast.IsIdentifier(node) && (shorthand || !ast.IsDeclarationName(node) && !isStaticPropertyName(node)) {
			symbol := c.GetSymbolAtLocation(node)
			if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
				symbol = c.GetShorthandAssignmentValueSymbol(node.Parent)
			}
			if symbol != nil {
				p.references[node] = ast.GetSymbolId(c.GetExportSymbolOfSymbol(symbol))
			}
		}
		return true
	})
	for _, statement := range source.Statements.Nodes {
		if ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) {
			continue
		}
		add := func(declaration *ast.Node, pure bool) {
			name := declaration.Name()
			if name == nil || !ast.IsIdentifier(name) {
				return
			}
			symbol := c.GetSymbolAtLocation(name)
			if symbol == nil {
				return
			}
			id := ast.GetSymbolId(c.GetExportSymbolOfSymbol(symbol))
			p.declarations[declaration] = id
			p.pure[id] = pure
			p.names[name.Text()] = id
		}
		if ast.IsFunctionDeclaration(statement) {
			add(statement, true)
		}
		if ast.IsClassDeclaration(statement) {
			add(statement, secretArtifactPureClass(statement))
		}
		if ast.IsVariableStatement(statement) {
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				add(declaration, secretArtifactPureValue(declaration.Initializer()))
			}
		}
	}
	p.privateSource = p.privateSource || len(p.values) != 0
	return p
}

// secretArtifactPureValue proves only creation without reads, calls, coercion,
// spreads or abrupt binding effects. Deferred bodies are not executed by creation.
func secretArtifactPureValue(node *ast.Node) bool {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return false
	}
	if ast.IsFunctionExpression(node) || ast.IsArrowFunction(node) || ast.IsStringLiteral(node) || ast.IsNumericLiteral(node) || ast.IsNoSubstitutionTemplateLiteral(node) || node.Kind == ast.KindTrueKeyword || node.Kind == ast.KindFalseKeyword || node.Kind == ast.KindNullKeyword {
		return true
	}
	if ast.IsClassExpression(node) {
		return secretArtifactPureClass(node)
	}
	if ast.IsObjectLiteralExpression(node) {
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) {
				return false
			}
			if ast.IsPropertyAssignment(property) {
				if !secretArtifactPureValue(property.AsPropertyAssignment().Initializer) {
					return false
				}
			} else if !ast.IsMethodDeclaration(property) && !ast.IsGetAccessorDeclaration(property) && !ast.IsSetAccessorDeclaration(property) {
				return false
			}
		}
		return true
	}
	return false
}

func secretArtifactPureClass(node *ast.Node) bool {
	if ast.HasDecorators(node) {
		return false
	}
	var class *ast.ClassLikeBase
	if ast.IsClassDeclaration(node) {
		class = &node.AsClassDeclaration().ClassLikeBase
	} else {
		class = &node.AsClassExpression().ClassLikeBase
	}
	if class.HeritageClauses != nil {
		return false
	}
	for _, member := range class.Members.Nodes {
		if ast.HasDecorators(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || member.Name() != nil && ast.IsComputedPropertyName(member.Name()) || ast.IsClassStaticBlockDeclaration(member) {
			return false
		}
	}
	return true
}

// pruneDeadSecretDefinitions removes unreachable pure module definitions in the
// dependency closure of protected expressions. Roots include effects, exports,
// emitted type references and unknown generated references. Reachability handles
// dead recursive definitions without executing their bodies. Both graph closures
// and the retained AST scan are linear in nodes and binding-reference edges.
func pruneDeadSecretDefinitions(file *ast.SourceFile, emit *printer.EmitContext, p secretArtifactPlan) *ast.SourceFile {
	if !p.deadProjection || len(p.values) == 0 {
		return file
	}
	// Only delivered dynamic scope can reach otherwise unreferenced bindings.
	// Server-projected bodies must not prevent safe client definition pruning.
	dynamicScope := false
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		dynamicScope = dynamicScope || secretArtifactDirectEval(node) || ast.IsWithStatement(node)
		return !dynamicScope
	})
	if dynamicScope {
		return file
	}
	dependencies := make(map[ast.SymbolId][]ast.SymbolId)
	dependents := make(map[ast.SymbolId][]ast.SymbolId)
	sensitive := make(map[ast.SymbolId]bool)
	roots := []ast.SymbolId{}
	var visit func(*ast.Node, ast.SymbolId)
	visit = func(node *ast.Node, owner ast.SymbolId) {
		if id, exists := p.declarations[emit.MostOriginal(node)]; exists && p.pure[id] {
			owner = id
			if retainedSecretExpression(node, emit, p) != nil {
				sensitive[id] = true
			}
		}
		id, exists := p.references[emit.MostOriginal(node)]
		if !exists && ast.IsIdentifier(node) && ast.NodeIsSynthesized(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) {
			id, exists = p.names[node.Text()]
		}
		if exists {
			if owner == 0 {
				roots = append(roots, id)
			} else {
				dependencies[owner] = append(dependencies[owner], id)
				dependents[id] = append(dependents[id], owner)
			}
		}
		node.ForEachChild(func(child *ast.Node) bool { visit(child, owner); return false })
	}
	visit(file.AsNode(), 0)
	// A dead wrapper must disappear with the private definition it references.
	// Otherwise an emitted but uncalled wrapper would retain a dangling binding.
	private := []ast.SymbolId{}
	for id := range sensitive {
		private = append(private, id)
	}
	for i := 0; i < len(private); i++ {
		for _, id := range dependents[private[i]] {
			if !sensitive[id] {
				sensitive[id] = true
				private = append(private, id)
			}
		}
	}
	reachable := make(map[ast.SymbolId]bool)
	for i := 0; i < len(roots); i++ {
		id := roots[i]
		if reachable[id] {
			continue
		}
		reachable[id] = true
		roots = append(roots, dependencies[id]...)
	}
	removable := func(node *ast.Node) bool {
		id, exists := p.declarations[emit.MostOriginal(node)]
		return exists && p.pure[id] && sensitive[id] && !reachable[id]
	}
	factory := emit.Factory
	statements := make([]*ast.Node, 0, len(file.Statements.Nodes))
	changed := false
	for _, statement := range file.Statements.Nodes {
		if (ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement)) && removable(statement) {
			changed = true
			continue
		}
		if ast.IsVariableStatement(statement) {
			list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
			for _, declaration := range list.Declarations.Nodes {
				if removable(declaration) {
					changed = true
				} else {
					declarations = append(declarations, declaration)
				}
			}
			if len(declarations) == 0 {
				continue
			}
			if len(declarations) != len(list.Declarations.Nodes) {
				statement = factory.UpdateVariableStatement(statement.AsVariableStatement(), statement.Modifiers(), factory.UpdateVariableDeclarationList(list, factory.NewNodeList(declarations), list.Flags))
			}
		}
		statements = append(statements, statement)
	}
	if !changed {
		return file
	}
	return factory.UpdateSourceFile(file, factory.NewNodeList(statements), file.EndOfFileToken).AsSourceFile()
}

func retainedSecretExpression(node *ast.Node, emit *printer.EmitContext, p secretArtifactPlan) *ast.Node {
	var found *ast.Node
	walkNode(node, func(candidate *ast.Node) bool {
		if found != nil || ast.IsPartOfTypeNode(candidate) {
			return false
		}
		original := emit.MostOriginal(candidate)
		if _, secret := p.values[original]; secret {
			found = original
			return false
		}
		return true
	})
	return found
}

// retainedSecretArtifactDiagnostic runs before printing or source-map publication.
// A public leaf does not release qualified code retained by its containing definition.
func retainedSecretArtifactDiagnostic(file *ast.SourceFile, emit *printer.EmitContext, p secretArtifactPlan) *Diagnostic {
	if expression := retainedSecretExpression(file.AsNode(), emit, p); expression != nil {
		return &Diagnostic{Severity: "error", Code: "EXACT3022", Message: "error: client artifact retains an initializer with a secret containment obligation. Keep its owning definition in server-owned work or provide a public projection whose retained definition contains no secret initializer", Start: expression.Pos(), Length: expression.End() - expression.Pos()}
	}
	return nil
}

// omitSecretArtifactSourceContent preserves mappings without publishing the
// authored private definitions removed by projection or dead-definition pruning.
func omitSecretArtifactSourceContent(response *Response, target Target, p secretArtifactPlan) {
	if target == TargetClient && p.privateSource && response.SourceMap != nil {
		response.SourceMap.SourcesContent = nil
	}
}

// secretArtifactAssignmentQualified discharges a destination selection. A finite
// key or constraint uses native property identity. An unresolved key can reach
// every known qualified member of its receiver, without qualifying unknown data
// or copying a sibling policy onto a proven disjoint public selection.
func secretArtifactAssignmentQualified(target *ast.Node, c *checker.Checker, completed map[checker.TypeId]bool) bool {
	if checkerTypeIsSecret(c.GetTypeAtLocation(target), c, make(map[checker.TypeId]bool)) {
		return true
	}
	propertyQualified := func(property *ast.Symbol) bool {
		if property == nil {
			return false
		}
		if checkerPropertyHasSecretPolicy(property) {
			return true
		}
		// Retain incomplete destination protection without qualifying an
		// ordinary unknown value. Reuse the same root-query cache contract.
		_, qualified := cachedPolicyFromCheckerType(c.GetTypeOfSymbol(property), c, completed)
		return qualified
	}
	if propertyQualified(c.GetSymbolAtLocation(target)) {
		return true
	}
	for _, symbol := range policyMemberSymbols(target, c) {
		if propertyQualified(symbol) {
			return true
		}
	}
	if !ast.IsElementAccessExpression(target) {
		return false
	}
	access := target.AsElementAccessExpression()
	if access.ArgumentExpression == nil {
		return false
	}
	receiver := c.GetTypeAtLocation(access.Expression)
	if receiver == nil {
		return false
	}
	return secretArtifactKeyQualified(receiver, c.GetTypeAtLocation(access.ArgumentExpression), c, propertyQualified)
}

// secretArtifactKeyQualified applies a consumer's declaration contract to all
// possible selected keys. Unresolved keys retain known receiver obligations.
func secretArtifactKeyQualified(receiver, key *checker.Type, c *checker.Checker, propertyQualified func(*ast.Symbol) bool) bool {
	if receiver == nil {
		return false
	}
	active := make(map[checker.TypeId]bool)
	var keys func(*checker.Type) (bool, bool)
	keys = func(key *checker.Type) (bool, bool) {
		if key == nil || active[key.Id()] {
			return false, false
		}
		active[key.Id()] = true
		defer delete(active, key.Id())
		if key.Flags()&checker.TypeFlagsUnion != 0 {
			complete := true
			for _, member := range key.Types() {
				qualified, known := keys(member)
				if qualified {
					return true, true
				}
				complete = complete && known
			}
			return false, complete
		}
		if key.Flags()&checker.TypeFlagsTypeParameter != 0 {
			return keys(c.GetBaseConstraintOfType(key))
		}
		if key.Flags()&checker.TypeFlagsStringOrNumberLiteralOrUnique != 0 {
			return propertyQualified(c.GetExactPolicyPropertyForKey(receiver, key)), true
		}
		return false, false
	}
	if qualified, complete := keys(key); qualified || complete {
		return qualified
	}
	for _, property := range c.GetPropertiesOfType(receiver) {
		if propertyQualified(property) {
			return true
		}
	}
	return false
}

// secretArtifactDirectEval fences lexical reachability without interpreting
// source strings. Parentheses and erased assertions preserve the eval reference.
// Comma, assignment, member access and optional calls do not establish direct eval.
func secretArtifactDirectEval(node *ast.Node) bool {
	if !ast.IsCallExpression(node) || node.AsCallExpression().QuestionDotToken != nil {
		return false
	}
	callee := ast.SkipOuterExpressions(node.AsCallExpression().Expression, ast.OEKParentheses|ast.OEKAssertions)
	return ast.IsIdentifier(callee) && callee.Text() == "eval"
}
