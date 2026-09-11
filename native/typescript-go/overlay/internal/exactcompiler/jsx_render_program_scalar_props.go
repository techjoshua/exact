package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// scalarServerPropsProof admits only fresh empty or single-field data bags. The generated
// runtime checks actual values: a scalar TypeScript annotation cannot exclude task sources.
// Larger bags retain ordinary preparation until their proof overhead is measured separately.
func (lowering *jsxLowering) scalarServerPropsProof(reader *ast.Node) *ast.Node {
	if reader == nil || !ast.IsObjectLiteralExpression(reader) {
		return nil
	}
	properties := reader.AsObjectLiteralExpression().Properties.Nodes
	f := lowering.factory
	if len(properties) == 0 {
		return f.NewKeywordExpression(ast.KindNullKeyword)
	}
	if len(properties) != 1 || !ast.IsPropertyAssignment(properties[0]) {
		return nil
	}
	name := properties[0].Name()
	if !ast.IsIdentifier(name) && !ast.IsStringLiteral(name) {
		return nil
	}
	switch name.Text() {
	case "__proto__", "key", "__exactEnhancements":
		return nil
	}
	return f.NewStringLiteral(name.Text(), ast.TokenFlagsNone)
}
