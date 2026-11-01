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
	if invoke.kind != "InvokeAcquiredCall" || invoke.node != r.call || invoke.out != pc || finish.kind != "FinalizeCallInputs" || finish.node != r.call || finish.cell != 1 || invoke.a != finish.a || invoke.a < 0 || invoke.a >= pc || define.kind != "DefineArraySlot" || define.node != r.call || define.out != pc+1 || define.b != pc || define.a < 0 || define.a >= pc || define.key != languageStringKey("0") || define.keyProducerPC != -1 || complete.kind != "ArrayComplete" || complete.node != d.Initializer() || complete.a != define.a || complete.out != pc+2 || init.kind != "InitializeCell" || init.node != d || init.a != pc+2 || init.out != pc+3 || init.cell < 0 || init.cell >= r.locals || r.declarations[init.cell] != d {
		return nil, 0, false
	}
	allocation := r.events[define.a]
	if allocation.kind != "AllocateArray" || allocation.node != d.Initializer() || allocation.out != define.a {
		return nil, 0, false
	}
	return d, pc, true
}

// arrayInitializerReady reads the actual pre-Call array from current registers.
// It cannot allocate, replace a value or initialize a destination on refusal.
func arrayInitializerReady(r *storageRecipe, pc int, a languageAlternative, values []languageValue, ready []bool, work *languageCopyWork) bool {
	reg := r.events[pc+1].a
	if reg < 0 || reg >= len(values) || !ready[reg] || values[reg].object == nil || !values[reg].object.array || values[reg].object.origin != r.events[reg].node {
		return false
	}
	object := values[reg].object
	o := a.branch.owner
	if o == nil || object.id.owner != o {
		return false
	}
	// Quote both canonical own-record scans, without a semantic cost cutoff.
	for row := a.branch.state.storage; row != nil; row = row.previous {
		work.spend(2)
	}
	_, present, complete, _ := o.readOwnRecord(a.branch, object, languageStringKey("0"))
	length, lp, lc, _ := o.readOwnRecord(a.branch, object, languageStringKey("length"))
	number, known := numericNumberPayload(length.value)
	return !present && complete && lp && lc && !length.accessor && length.writable && !length.enumerable && !length.configurable && known && float64(number) == 0
}

// arrayInitializerBindingResult authenticates performed slot/length/Cell rows
// after the immutable original Call receipt. It never relabels that receipt or
// derives the callable from the array's syntax or a source-observation tuple.
func (h *closedPrefixHistory) arrayInitializerBindingResult(a, call languageAlternative, d *ast.Node, pc int, work *languageCopyWork) bool {
	s := a.storage
	r := h.recipe
	if !activationCapturedReturn(call, work) || s.recipe != r || s.pc != len(r.events) || s.entry != nil || s.childBranch != a.branch || len(s.cells) != r.locals || len(s.values) != r.registers || len(s.ready) != r.registers {
		return false
	}
	for _, n := range []int{pc, pc + 1, pc + 2, pc + 3, r.events[pc+1].a} {
		if n < 0 || n >= len(s.ready) || !s.ready[n] {
			return false
		}
	}
	array := a.value.object
	arrayreg := r.events[pc+1].a
	ordinal := r.events[pc+3].cell
	if array == nil || !array.array || array.origin != d.Initializer() || array.id.owner != call.branch.owner || s.values[arrayreg] != a.value || s.values[pc] != call.value || s.values[pc+1] != call.value || s.values[pc+2] != a.value || s.values[pc+3] != a.value || ordinal < 0 || ordinal >= len(s.cells) || len(call.callInputs.lexicals) != len(s.cells) {
		return false
	}
	c := s.cells[ordinal]
	if call.callInputs.lexicals[ordinal] != (languageLexical{declaration: d, cell: c}) || !c.immutable || c.summary || c.environment != call.branch.env.id || a.branch.owner != call.branch.owner || a.branch.env != call.branch.env || a.branch.guard != call.branch.guard || a.branch.generation != call.branch.generation || a.branch.cursor != call.branch.cursor+3 {
		return false
	}
	state := a.branch.state
	for i := 0; i < 3; i++ {
		work.spend(1)
		if state == nil || state.previous == nil {
			return false
		}
		state = state.previous
	}
	if state != call.branch.state {
		return false
	}
	cell := a.branch.state.storage
	if cell == nil || cell.cell != c || !cell.initialized || cell.value != a.value || cell.object != nil {
		return false
	}
	length := cell.previous
	if length == nil || length.object != array || length.key != languageStringKey("length") || !length.initialized || length.deleted || length.descriptor.accessor || !length.descriptor.writable || length.descriptor.enumerable || length.descriptor.configurable {
		return false
	}
	n, known := numericNumberPayload(length.descriptor.value)
	if !known || float64(n) != 1 {
		return false
	}
	slot := length.previous
	return slot != nil && slot.previous == call.branch.state.storage && slot.object == array && slot.key == languageStringKey("0") && slot.initialized && !slot.deleted && !slot.descriptor.accessor && slot.descriptor.value == call.value && slot.descriptor.writable && slot.descriptor.enumerable && slot.descriptor.configurable
}
