package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

type continuationContextAlias struct {
	Name      string
	Token     *ast.Node
	TokenName string
}

// componentContextAliases finds setup-scope aliases whose values must be
// reconstructed rather than closing over a component instance on the server.
func componentContextAliases(component *ast.Node) []continuationContextAlias {
	body := component.Body()
	if body == nil || !ast.IsBlock(body) {
		return nil
	}
	aliases := []continuationContextAlias{}
	for _, statement := range body.AsBlock().Statements.Nodes {
		if !ast.IsVariableStatement(statement) {
			continue
		}
		list := statement.AsVariableStatement().DeclarationList.
			AsVariableDeclarationList()
		for _, node := range list.Declarations.Nodes {
			declaration := node.AsVariableDeclaration()
			name := declaration.Name()
			if name == nil || !ast.IsIdentifier(name) ||
				declaration.Initializer == nil {
				continue
			}
			token := continuationContextLookup(declaration.Initializer)
			tokenName := stableContextToken(token)
			if token == nil || tokenName == "" {
				continue
			}
			aliases = append(aliases, continuationContextAlias{
				Name:      name.Text(),
				Token:     token,
				TokenName: tokenName,
			})
		}
	}
	return aliases
}

func continuationContextLookup(expression *ast.Node) *ast.Node {
	if expression == nil || !ast.IsCallExpression(expression) {
		return nil
	}
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return nil
	}
	member := call.Expression.AsPropertyAccessExpression()
	arguments := callArguments(expression)
	if member.Expression == nil ||
		member.Expression.Kind != ast.KindThisKeyword ||
		member.Name().Text() != "getContext" ||
		len(arguments) != 1 {
		return nil
	}
	return arguments[0]
}

// stableContextToken reproduces the authored protocol key accepted by context
// analysis without depending on mutable source positions after transformation.
func stableContextToken(node *ast.Node) string {
	if node == nil {
		return ""
	}
	if ast.IsIdentifier(node) {
		return node.Text()
	}
	if ast.IsPropertyAccessExpression(node) {
		member := node.AsPropertyAccessExpression()
		left := stableContextToken(member.Expression)
		if left == "" || member.Name() == nil {
			return ""
		}
		return left + "." + member.Name().Text()
	}
	return ""
}

func continuationContextValue(
	factory *printer.NodeFactory,
	token *ast.Node,
	continuation Continuation,
	activation *ast.Node,
	execution *ast.Node,
) *ast.Node {
	tokenName := stableContextToken(token)
	if continuationHasContext(
		continuation.Activation.PublicContexts,
		tokenName,
	) {
		return factory.NewElementAccessExpression(
			factory.NewPropertyAccessExpression(
				activation,
				nil,
				factory.NewIdentifier("publicContext"),
				ast.NodeFlagsNone,
			),
			nil,
			contractString(factory, tokenName),
			ast.NodeFlagsNone,
		)
	}
	if continuationHasContext(
		continuation.Activation.ServerContexts,
		tokenName,
	) {
		return factory.NewCallExpression(
			factory.NewPropertyAccessExpression(
				execution,
				nil,
				factory.NewIdentifier("getContext"),
				ast.NodeFlagsNone,
			),
			nil,
			nil,
			factory.NewNodeList([]*ast.Node{
				token,
				contractString(factory, tokenName),
			}),
			ast.NodeFlagsNone,
		)
	}
	return nil
}

func continuationHasContext(
	effects []ContextEffect,
	token string,
) bool {
	for _, effect := range effects {
		if effect.Token == token {
			return true
		}
	}
	return false
}

// continuationReferencedNames identifies setup aliases captured anywhere
// beneath a task callback, including compiler-created lazy write closures.
func continuationReferencedNames(work *ast.Node) map[string]struct{} {
	declared := map[string]struct{}{}
	for _, parameter := range work.Parameters() {
		for _, name := range policyBindingNames(parameter.Name()) {
			if ast.IsIdentifier(name) {
				declared[name.Text()] = struct{}{}
			}
		}
	}
	var collectDeclarations func(*ast.Node)
	collectDeclarations = func(node *ast.Node) {
		if node == nil {
			return
		}
		if ast.IsVariableDeclaration(node) {
			for _, name := range policyBindingNames(node.Name()) {
				if ast.IsIdentifier(name) {
					declared[name.Text()] = struct{}{}
				}
			}
		}
		if ast.IsFunctionDeclaration(node) && node.Name() != nil {
			declared[node.Name().Text()] = struct{}{}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			collectDeclarations(child)
			return false
		})
	}
	collectDeclarations(work.Body())

	referenced := map[string]struct{}{}
	var collectReferences func(*ast.Node)
	collectReferences = func(node *ast.Node) {
		if node == nil {
			return
		}
		if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
			!isStaticPropertyName(node) {
			if _, local := declared[node.Text()]; !local &&
				!strings.HasPrefix(node.Text(), "__exact") {
				referenced[node.Text()] = struct{}{}
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			collectReferences(child)
			return false
		})
	}
	collectReferences(work.Body())
	return referenced
}
