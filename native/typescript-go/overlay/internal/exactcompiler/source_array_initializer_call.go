package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceArrayInitializerCall names only one dense original Call element. This
// syntax classification supplies neither a callable nor an allocated array.
func sourceArrayInitializerCall(d *ast.Node) *ast.Node {
	if d == nil || !ast.IsVariableDeclaration(d) || d.Initializer() == nil || !ast.IsArrayLiteralExpression(d.Initializer()) {
		return nil
	}
	elements := d.Initializer().AsArrayLiteralExpression().Elements
	if elements == nil || len(elements.Nodes) != 1 || !ast.IsCallExpression(elements.Nodes[0]) || ast.IsOptionalChain(elements.Nodes[0]) {
		return nil
	}
	call := elements.Nodes[0]
	if !ast.IsIdentifier(call.Expression()) || call.AsCallExpression().Arguments == nil || len(call.AsCallExpression().Arguments.Nodes) != 1 {
		return nil
	}
	return call
}

// sourceArrayInitializerCallLayout is a finite destination recipe, not an
// execution certificate. Allocation precedes acquisition. Only actual Return
// resumes the existing array Define/Complete/Cell initialization tail.
func sourceArrayInitializerCallLayout(r *storageRecipe) (*ast.Node, int, bool) {
	if r == nil || !r.prefix || r.callBody || r.binding != nil || r.call == nil || r.call.Parent == nil || !ast.IsArrayLiteralExpression(r.call.Parent) || r.call.Parent.Parent == nil || len(r.events) < 5 || r.registers != len(r.events) || !r.hasArray {
		return nil, 0, false
	}
	d := r.call.Parent.Parent
	if sourceArrayInitializerCall(d) != r.call || !ast.IsIdentifier(d.Name()) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 || len(d.Parent.AsVariableDeclarationList().Declarations.Nodes) != 1 || d.Parent.Parent == nil || !ast.IsVariableStatement(d.Parent.Parent) || d.Parent.Parent.Parent != r.body || r.locals != len(r.declarations) {
		return nil, 0, false
	}
	pc := len(r.events) - 4
	invoke, define, complete, init, finish := r.events[pc], r.events[pc+1], r.events[pc+2], r.events[pc+3], r.events[pc-1]
	if invoke.kind != "InvokeAcquiredCall" || invoke.node != r.call || invoke.out != pc || finish.kind != "FinalizeCallInputs" || finish.node != r.call || finish.cell != 1 || invoke.a != finish.a || invoke.a < 0 || invoke.a >= pc || define.kind != "DefineArraySlot" || define.node != r.call || define.out != pc+1 || define.b != pc || define.a < 0 || define.a >= pc || define.key != languageStringKey("0") || complete.kind != "ArrayComplete" || complete.node != d.Initializer() || complete.a != define.a || complete.out != pc+2 || init.kind != "InitializeCell" || init.node != d || init.a != pc+2 || init.out != pc+3 || init.cell < 0 || init.cell >= r.locals || r.declarations[init.cell] != d {
		return nil, 0, false
	}
	allocation := r.events[define.a]
	if allocation.kind != "AllocateArray" || allocation.node != d.Initializer() || allocation.out != define.a {
		return nil, 0, false
	}
	return d, pc, true
}
