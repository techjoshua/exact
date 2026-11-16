package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceOpaqueDeclarationEffect retains the existing lexical runtime Call's
// uncertainty and original source association. It supplies only MAY Effects,
// including Throw, never a value, successful invocation or acquired callee.
func sourceOpaqueDeclarationEffect(call, declaration *ast.Node, name string, owner *executableBodyOwner) (EnvironmentEffectSource, bool) {
	if !sourceStagedOccurrenceOwned(call, declaration) || !sourceOpaqueDeclarationCall(call, owner) {
		return EnvironmentEffectSource{}, false
	}
	effect := environmentSource("unknown", "unresolved call "+strings.TrimSpace(sourceText(ast.GetSourceFileOfNode(call), call.Expression())), name)
	effect.Opaque = true
	effect.callOrigin = &sourceCallOutcome{declaration: declaration, operation: call}
	return effect, true
}

// sourceOpaqueDeclarationCall identifies only a zero-actual lexical invocation
// of an unwritten same-source ambient function binding. This classifies an
// opaque runtime invocation, not a native, pure call, normal result or NoWrites
// proof. All known implementations, aliases and writable alternatives retain
// their original collectors and donors. No acquired selection is reconstructed.
func sourceOpaqueDeclarationCall(call *ast.Node, owner *executableBodyOwner) bool {
	if call == nil || !ast.IsCallExpression(call) || owner == nil || owner.checker == nil || owner.values == nil {
		return false
	}
	invocation := call.AsCallExpression()
	if !ast.IsIdentifier(invocation.Expression) || invocation.QuestionDotToken != nil || invocation.Arguments != nil && len(invocation.Arguments.Nodes) != 0 {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(invocation.Expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || len(symbol.Declarations) == 0 {
		return false
	}
	source := ast.GetSourceFileOfNode(call)
	if source == nil || source.IsDeclarationFile || standardLibrarySource(source) || ast.GetSourceFileOfNode(symbol.ValueDeclaration) != source {
		return false
	}
	valueSeen := false
	for _, declaration := range symbol.Declarations {
		if declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Body() != nil || declaration.Parent != source.AsNode() || ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsAmbient == 0 {
			return false
		}
		valueSeen = valueSeen || declaration == symbol.ValueDeclaration
	}
	if !valueSeen {
		return false
	}
	if _, classified := declarationCallEnvironment(symbol); classified {
		return false
	}
	return !owner.values.bindingWritten(symbol)
}
