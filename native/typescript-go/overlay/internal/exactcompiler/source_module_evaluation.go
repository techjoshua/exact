package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// runtimeVariableInitializer identifies eager source evaluation independently of
// its result shape or precision admission. Ambient declarations emit no work.
func runtimeVariableInitializer(statement *ast.Node) bool {
	if statement == nil || !ast.IsVariableStatement(statement) || ast.HasSyntacticModifier(statement, ast.ModifierFlagsAmbient) {
		return false
	}
	source := ast.GetSourceFileOfNode(statement)
	if source == nil || source.IsDeclarationFile || statement.Parent != source.AsNode() {
		return false
	}
	for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
		if declaration.Initializer() != nil {
			return true
		}
	}
	return false
}
