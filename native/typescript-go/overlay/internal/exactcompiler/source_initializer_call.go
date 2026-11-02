package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInitializerCallLayout identifies the one final, original const binding.
// Existing event registers and lexical cells carry its result. There is no
// detached Call value or resumable historical entry in this source subset.
func sourceInitializerCallLayout(r *storageRecipe) (*ast.Node, int, bool) {
	if d, pc, ok := sourceArrayInitializerCallLayout(r); ok {
		return d, pc, true
	}
	if r == nil || !r.prefix || r.callBody || r.binding != nil || r.call == nil || !ast.IsCallExpression(r.call) || ast.IsOptionalChain(r.call) || r.call.Parent == nil || !ast.IsVariableDeclaration(r.call.Parent) || len(r.events) < 3 || r.registers != len(r.events) {
		return nil, 0, false
	}
	d := r.call.Parent
	if d.Initializer() != r.call || !ast.IsIdentifier(d.Name()) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 || d.Parent.Parent == nil || !ast.IsVariableStatement(d.Parent.Parent) || d.Parent.Parent.Parent != r.body || r.locals != len(r.declarations) || len(d.Parent.AsVariableDeclarationList().Declarations.Nodes) != 1 {
		return nil, 0, false
	}
	argumentCount := 0
	if r.call.AsCallExpression().Arguments != nil {
		argumentCount = len(r.call.AsCallExpression().Arguments.Nodes)
	}
	if argumentCount > 1 {
		return nil, 0, false
	}
	pc := len(r.events) - 2
	invoke, init, finish := r.events[pc], r.events[pc+1], r.events[pc-1]
	if invoke.kind != "InvokeAcquiredCall" || invoke.node != r.call || invoke.out != pc || init.kind != "InitializeCell" || init.node != d || init.out != pc+1 || init.a != pc || init.cell < 0 || init.cell >= len(r.declarations) || r.declarations[init.cell] != d || finish.kind != "FinalizeCallInputs" || finish.node != r.call || finish.cell != argumentCount || invoke.a != finish.a || invoke.a < 0 || invoke.a >= pc {
		return nil, 0, false
	}
	return d, pc, true
}
