package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// taskHelperIntrinsic selects compiler-owned built-ins independently of authored lexical names.
func (lowering *jsxLowering) taskHelperIntrinsic(path string) *ast.Node {
	if lowering.helperIntrinsicsName == "" {
		lowering.helperIntrinsicsName = lowering.uniqueMutationName("__exactHelperIntrinsics")
	}
	var expression *ast.Node = lowering.factory.NewIdentifier(lowering.helperIntrinsicsName)
	for _, member := range strings.Split(path, ".") {
		expression = lowering.factory.NewPropertyAccessExpression(expression, nil, lowering.factory.NewIdentifier(member), ast.NodeFlagsNone)
	}
	return expression
}

func (lowering *jsxLowering) taskHelperIntrinsicCall(path string, arguments []*ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(lowering.taskHelperIntrinsic(path), nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
}

// helperSymbolConstant declares each compiler-owned key as unique even though its native Symbol
// factory crosses an imported record. TypeScript's automatic uniqueness recognizes only global
// Symbol() syntax. The assertion addresses this generated fresh key, not an authored obligation.
func (lowering *jsxLowering) helperSymbolConstant(name *ast.Node) *ast.Node {
	unique := lowering.factory.NewTypeOperatorNode(ast.KindUniqueKeyword, lowering.factory.NewKeywordTypeNode(ast.KindSymbolKeyword))
	value := lowering.factory.NewAsExpression(lowering.taskHelperIntrinsicCall("Symbol", nil), lowering.factory.NewTypeQueryNode(name, nil))
	declaration := lowering.factory.NewVariableDeclaration(name, nil, unique, value)
	return lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{declaration}), ast.NodeFlagsConst))
}

// taskHelperImports keeps lightweight registration and built-in capture on one runtime boundary.
func (lowering *jsxLowering) taskHelperImports(transformed *ast.SourceFile) []*ast.Node {
	imports := []*ast.Node{}
	if lowering.helperRegistryName != "" && containsIdentifier(transformed.AsNode(), lowering.helperRegistryName) {
		imports = append(imports,
			lowering.factory.NewImportSpecifier(false, lowering.factory.NewIdentifier("registerTaskHelper"), lowering.factory.NewIdentifier(lowering.helperRegistryName)),
			lowering.factory.NewImportSpecifier(true, lowering.factory.NewIdentifier("CompiledTaskState"), lowering.factory.NewIdentifier(lowering.helperContextTypeName)),
		)
	}
	if lowering.helperIntrinsicsName != "" && containsIdentifier(transformed.AsNode(), lowering.helperIntrinsicsName) {
		imports = append(imports, lowering.factory.NewImportSpecifier(false, lowering.factory.NewIdentifier("taskHelperIntrinsics"), lowering.factory.NewIdentifier(lowering.helperIntrinsicsName)))
	}
	if len(imports) == 0 {
		return nil
	}
	return []*ast.Node{lowering.factory.NewImportDeclaration(nil,
		lowering.factory.NewImportClause(ast.KindUnknown, nil, lowering.factory.NewNamedImports(lowering.factory.NewNodeList(imports))),
		lowering.factory.NewStringLiteral("@exactjs/core/runtime/task-helpers", ast.TokenFlagsNone), nil)}
}
