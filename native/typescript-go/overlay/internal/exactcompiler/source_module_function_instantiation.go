package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// moduleFunctionDeclaration is syntax eligibility only. Checker/index proof and
// actual module instantiation must independently authorize creation and entry.
func moduleFunctionDeclaration(n *ast.Node) bool {
	return envelopeSynchronousFunction(n) && n.Name() != nil && ast.IsIdentifier(n.Name()) &&
		n.Parent == ast.GetSourceFileOfNode(n).AsNode() && ast.IsExternalModule(ast.GetSourceFileOfNode(n)) &&
		!ast.HasSyntacticModifier(n, ast.ModifierFlagsExport|ast.ModifierFlagsDefault|ast.ModifierFlagsAmbient) &&
		!ast.HasDecorators(n) && (len(n.Parameters()) == 0 || moduleActivationCaptureCreator(n)) && len(n.TypeParameters()) == 0
}

// moduleFunctionMarker is a creation-origin record, not a lexical initialization
// or property row. In particular it cannot occupy the captured TDZ cell and
// prevent its later ordinary InitializeCell operation.
func moduleFunctionMarker(row *languageStorage, f *languageCallable) bool {
	return row != nil && f != nil && row.cell == (languageCell{}) && row.object == nil &&
		row.key == (languagePropertyKey{}) && row.descriptor == (languageDescriptor{}) &&
		row.value == (languageValue{callable: f}) && !row.initialized && !row.deleted
}
