package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// planSecretQualifications reconstructs types while source nodes still belong to the checker.
// Lowering reparents shared nodes, so its application phase must not query lexical type scope.
func planSecretQualifications(sites []*ast.Node, typeChecker *checker.Checker) map[string]*ast.Node {
	result := make(map[string]*ast.Node, len(sites))
	for _, site := range sites {
		result[nodeSpanKey(site)] = typeChecker.TypeToTypeNode(
			typeChecker.GetTypeAtLocation(site), site, nodebuilder.FlagsNoTruncation, nil,
		)
	}
	return result
}

// lowerSecretQualifications preserves planned secret types without changing runtime values.
func lowerSecretQualifications(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	types map[string]*ast.Node,
) *ast.SourceFile {
	if len(types) == 0 {
		return sourceFile
	}
	alias := secretTypeAlias(sourceFile)
	used := false
	qualifications := 0
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			before := qualifications
			visited := visitor.VisitEachChild(node)
			underlying, qualify := types[nodeSpanKey(node)]
			if !qualify || !ast.IsExpression(visited) {
				return visited
			}
			if underlying == nil {
				underlying = factory.NewKeywordTypeNode(ast.KindUnknownKeyword)
			}
			used = true
			// Child qualifications can replace plain fields with opaque Secret values.
			// The original checker type then intentionally differs from this derived shape.
			if qualifications != before {
				visited = factory.NewAsExpression(visited, factory.NewKeywordTypeNode(ast.KindUnknownKeyword))
			}
			qualifications++
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
