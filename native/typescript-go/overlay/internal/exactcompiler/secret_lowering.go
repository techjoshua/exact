package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
	"github.com/microsoft/typescript-go/internal/printer"
)

// lowerSecretQualifications preserves compiler-proven secret types in emitted
// TypeScript without changing runtime values.
func lowerSecretQualifications(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	sites []*ast.Node,
	typeChecker *checker.Checker,
) *ast.SourceFile {
	if len(sites) == 0 {
		return sourceFile
	}
	bySpan := make(map[string]*ast.Node, len(sites))
	for _, site := range sites {
		bySpan[nodeSpanKey(site)] = site
	}
	alias := secretTypeAlias(sourceFile)
	used := false
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			visited := visitor.VisitEachChild(node)
			site, qualify := bySpan[nodeSpanKey(node)]
			if !qualify || !ast.IsExpression(visited) {
				return visited
			}
			underlying := typeChecker.TypeToTypeNode(
				typeChecker.GetTypeAtLocation(site),
				site,
				nodebuilder.FlagsNoTruncation,
				nil,
			)
			if underlying == nil {
				underlying = factory.NewKeywordTypeNode(ast.KindUnknownKeyword)
			}
			used = true
			return factory.NewAsExpression(
				visited,
				factory.NewTypeReferenceNode(
					factory.NewIdentifier(alias),
					factory.NewNodeList([]*ast.Node{underlying}),
				),
			)
		},
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	transformed := visitor.VisitEachChild(sourceFile.AsNode()).AsSourceFile()
	if !used {
		return transformed
	}
	importDeclaration := factory.NewImportDeclaration(
		nil,
		factory.NewImportClause(
			ast.KindTypeKeyword,
			nil,
			factory.NewNamedImports(
				factory.NewNodeList([]*ast.Node{
					factory.NewImportSpecifier(
						false,
						factory.NewIdentifier("Secret"),
						factory.NewIdentifier(alias),
					),
				}),
			),
		),
		factory.NewStringLiteral("@exactjs/secrets", ast.TokenFlagsNone),
		nil,
	)
	statements := append([]*ast.Node(nil), transformed.Statements.Nodes...)
	insertion := 0
	for insertion < len(statements) &&
		isDirectiveStatement(statements[insertion]) {
		insertion++
	}
	statements = append(statements, nil)
	copy(statements[insertion+1:], statements[insertion:])
	statements[insertion] = importDeclaration
	result := factory.UpdateSourceFile(
		transformed,
		factory.NewNodeList(statements),
		transformed.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func secretTypeAlias(sourceFile *ast.SourceFile) string {
	used := sourceIdentifiers(sourceFile)
	if _, exists := used["__ExactSecret"]; !exists {
		return "__ExactSecret"
	}
	for suffix := 2; ; suffix++ {
		candidate := "__ExactSecret" + fmt.Sprintf("%d", suffix)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
}
