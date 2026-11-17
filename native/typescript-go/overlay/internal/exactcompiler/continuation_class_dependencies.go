package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskReconstructedClasses admits only fresh, nonescaping class identities needed
// by this task. It describes lexical reconstruction, never constructor transport.
// Replaying definition effects or sharing an identity with setup is not permitted.
func taskReconstructedClasses(work, component *ast.Node, c *checker.Checker) ([]*ast.Node, string) {
	if c == nil || component.Body() == nil {
		return nil, ""
	}
	local := map[*ast.Node]bool{}
	for _, statement := range component.Body().AsBlock().Statements.Nodes {
		if ast.IsClassDeclaration(statement) {
			local[statement] = true
		}
	}
	if len(local) == 0 {
		return nil, ""
	}
	selected := map[*ast.Node]bool{}
	roots := map[*ast.Node]bool{}
	var visit func(*ast.Node)
	visit = func(root *ast.Node) {
		if root == nil || roots[root] {
			return
		}
		roots[root] = true
		walkNode(root, func(n *ast.Node) bool {
			if ast.IsPartOfTypeNode(n) && !ast.IsExpressionWithTypeArgumentsInClassExtendsClause(n) {
				return false
			}
			if !ast.IsIdentifier(n) || ast.IsDeclarationName(n) || isStaticPropertyName(n) {
				return true
			}
			symbol := c.GetSymbolAtLocation(n)
			if symbol == nil {
				return true
			}
			declaration := symbol.ValueDeclaration
			if local[declaration] && !selected[declaration] {
				selected[declaration] = true
				visit(declaration)
			}
			if declaration != nil && component.Contains(declaration) && !work.Contains(declaration) {
				if helper := taskHelperCallable(declaration, c, map[*ast.Node]bool{}); helper != nil {
					visit(helper)
				}
			}
			return true
		})
	}
	visit(work)
	if len(selected) == 0 {
		return nil, ""
	}
	refuse := func() ([]*ast.Node, string) {
		return nil, "error: a server continuation cannot safely reconstruct this setup-local class: definition effects, inheritance, captures or escaped class identity are not preserved. Keep the class identity in its original execution scope; no constructor is transported"
	}
	for declaration := range selected {
		if ast.HasDecorators(declaration) {
			return refuse()
		}
		for _, member := range declaration.Members() {
			if ast.HasDecorators(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || ast.IsClassStaticBlockDeclaration(member) || member.Name() != nil && ast.IsComputedPropertyName(member.Name()) {
				return refuse()
			}
			// Instance fields/constructors can retain or expose the new identity. This
			// bounded definition route supports implicit constructors and method bodies.
			if !ast.IsMethodDeclaration(member) && !ast.IsGetAccessorDeclaration(member) && !ast.IsSetAccessorDeclaration(member) {
				return refuse()
			}
			// Await must not hand this fresh identity to a foreign callable returned
			// by a then getter. Authored then methods retain their own checked body.
			if ast.IsGetAccessorDeclaration(member) && member.Name().Text() == "then" {
				value := c.GetTypeAtLocation(member.Name())
				if value == nil {
					return refuse()
				}
				for _, t := range value.Distributed() {
					if t.Flags()&(checker.TypeFlagsUndefined|checker.TypeFlagsNull) == 0 {
						return refuse()
					}
				}
			}
		}
		class := declaration.AsClassDeclaration()
		if class.HeritageClauses != nil {
			for _, clause := range class.HeritageClauses.Nodes {
				if clause.AsHeritageClause().Token != ast.KindExtendsKeyword {
					continue
				}
				for _, base := range clause.AsHeritageClause().Types.Nodes {
					expression := base.Expression()
					if !ast.IsIdentifier(expression) {
						return refuse()
					}
					symbol := c.GetSymbolAtLocation(expression)
					if symbol == nil || !selected[symbol.ValueDeclaration] || symbol.ValueDeclaration.Pos() >= declaration.Pos() {
						return refuse()
					}
				}
			}
		}
	}
	valid := true
	walkNode(component, func(n *ast.Node) bool {
		if !valid {
			return false
		}
		// Direct eval/with can observe a lexical identity without a source reference.
		if secretArtifactDirectEval(n) || ast.IsWithStatement(n) {
			valid = false
			return false
		}
		// The existing lowered definition selector is name-based. Do not admit a
		// required class if another lexical declaration could mask that original name.
		if ast.IsIdentifier(n) && ast.IsDeclarationName(n) {
			for d := range selected {
				if n.Text() == d.Name().Text() && c.GetSymbolAtLocation(n) != c.GetSymbolAtLocation(d.Name()) {
					valid = false
					return false
				}
			}
		}
		if ast.IsPartOfTypeNode(n) && !ast.IsExpressionWithTypeArgumentsInClassExtendsClause(n) {
			return false
		}
		if ast.IsIdentifier(n) && !ast.IsDeclarationName(n) && !isStaticPropertyName(n) {
			symbol := c.GetSymbolAtLocation(n)
			if symbol != nil && selected[symbol.ValueDeclaration] {
				p := n.Parent
				if p != nil && ast.IsExpressionWithTypeArguments(p) && p.Expression() == n && p.Parent != nil && p.Parent.Parent != nil && selected[p.Parent.Parent] {
					return true
				}
				inside := false
				for r := range roots {
					inside = inside || r.Contains(n)
				}
				if !inside || p == nil || !ast.IsNewExpression(p) || p.Expression() != n {
					valid = false
					return false
				}
				use := p.Parent
				// Await assimilates the original instance but the expression statement
				// discards it. No instance is captured, returned or stored across requests.
				if use != nil && ast.IsAwaitExpression(use) && use.Parent != nil && ast.IsExpressionStatement(use.Parent) {
					return true
				}
				// Immediate method use is allowed only with a checked primitive result.
				if use != nil && ast.IsPropertyAccessExpression(use) && use.Expression() == p && use.Name().Text() != "constructor" && use.Parent != nil && ast.IsCallExpression(use.Parent) && use.Parent.Expression() == use {
					value := c.GetTypeAtLocation(use.Parent)
					primitive := value != nil
					if value != nil {
						for _, t := range value.Distributed() {
							primitive = primitive && t.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsBooleanLike|checker.TypeFlagsBigIntLike|checker.TypeFlagsESSymbolLike|checker.TypeFlagsNull|checker.TypeFlagsUndefined|checker.TypeFlagsVoid|checker.TypeFlagsNever) != 0
						}
					}
					symbol := c.GetSymbolAtLocation(use.Name())
					if primitive && symbol != nil && symbol.ValueDeclaration != nil && ast.IsMethodDeclaration(symbol.ValueDeclaration) && selected[symbol.ValueDeclaration.Parent] {
						return true
					}
				}
				valid = false
				return false
			}
		}
		if n.Kind == ast.KindThisKeyword || n.Kind == ast.KindSuperKeyword {
			owned := false
			for d := range selected {
				owned = owned || d.Contains(n)
			}
			if owned {
				p := n.Parent
				// Preserve class this/super only as a direct authored method receiver;
				// passing/returning it, constructor access and computed lookup expose identity.
				valid = p != nil && ast.IsPropertyAccessExpression(p) && p.Expression() == n && p.Name().Text() != "constructor" && p.Parent != nil && ast.IsCallExpression(p.Parent) && p.Parent.Expression() == p
				if valid {
					symbol := c.GetSymbolAtLocation(p.Name())
					valid = symbol != nil && symbol.ValueDeclaration != nil && ast.IsMethodDeclaration(symbol.ValueDeclaration) && selected[symbol.ValueDeclaration.Parent]
				}
			}
		}
		return valid
	})
	if !valid {
		return refuse()
	}
	result := []*ast.Node{}
	for _, statement := range component.Body().AsBlock().Statements.Nodes {
		if selected[statement] {
			result = append(result, statement)
		}
	}
	return result, ""
}
