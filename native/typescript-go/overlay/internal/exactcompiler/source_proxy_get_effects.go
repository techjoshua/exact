package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// sourcePossibleProxyGetOrigin is detached EFFECT-ONLY acquisition metadata.
// Existing initializer envelope fields own source/checker/generation/mode. This
// row has no value, frame, scope snapshot, constructor completion or native ID.
type sourcePossibleProxyGetOrigin struct {
	Site, Constructor, ConstructorRead, Target, Handler *ast.Node
	Entry                                               *sourceNormalOccurrence
}

// possibleProxyLiteralOrigin limits the detached source inventory. The original
// New producer owns argument acquisition, and later Gets retain their own effects.
func possibleProxyLiteralOrigin(node *ast.Node) bool {
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return false
	}
	audit := ownGetterAudit{remaining: 4096}
	return audit.eagerLiteral(node)
}

// possibleProxyReference is discovery eligibility, not selected native identity.
// Actual acquisition still uses nativeEntryValues and all current writes.
func possibleProxyReference(v *sourceValueOwner, n *ast.Node) bool {
	if v == nil || n == nil || !ast.IsIdentifier(n) {
		return false
	}
	symbol := v.checker.GetSymbolAtLocation(n)
	global := v.checker.GetGlobalSymbol("Proxy", ast.SymbolFlagsValue, nil)
	return global != nil && global.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(global.ValueDeclaration)) && symbol == global
}
func possibleProxyInitializer(v *sourceValueOwner, s *ast.Node) *ast.Node {
	d := moduleInitializerDeclaration(v, s)
	if d == nil || !ast.IsNewExpression(d.Initializer()) || !possibleProxyReference(v, d.Initializer().Expression()) {
		return nil
	}
	site := d.Initializer()
	args := site.AsNewExpression().Arguments
	if args == nil || len(args.Nodes) != 2 || ast.IsSpreadElement(args.Nodes[0]) || ast.IsSpreadElement(args.Nodes[1]) {
		return nil
	}
	index := v.indexes[ast.GetSourceFileOfNode(site)]
	e := index.normalOccurrences[site]
	if e == nil || e.node != site || e.statement != s || !e.once || e.region != nil || e.callOwner != nil {
		return nil
	}
	return d
}

// constructPossibleProxyGet consumes the ORIGINAL New slot and observed args.
// It publishes only possible Get effects. No handler is read or executed now.
func (q *sourceValueQuery) constructPossibleProxyGet(site *ast.Node, result *accessorCandidates) bool {
	slot := q.normalOperation(site, false)
	if slot == nil || slot.selected == nil {
		return false
	}
	possible := false
	var constructor, read *ast.Node
	for _, v := range slot.selected.acquired.values {
		if v.native != nil && v.native.kind == sourceNativePossibleProxyConstructor {
			possible = true
			constructor, read = v.node, v.native.acquired
		}
	}
	if !possible {
		return false
	}
	result.opaque, result.valueIncomplete = true, true
	if q.inputs == nil || q.inputs.operationLifetime == nil || q.inputs.ownedFact == nil || q.operation == nil || q.operation.node != site || q.operation.inputs != q.inputs || slot.state != sourceOperationInProgress || !slot.authority.valid(q) || slot.entry == nil || !slot.entry.once || slot.entry.region != nil || slot.entry.node != site || slot.population != q.inputs.population || slot.population == nil || slot.population.entries[site] != slot.entry || slot.population.root != q.inputs.declaration || len(slot.actuals) != 2 {
		return true
	}
	fact := q.inputs.ownedFact
	d := possibleProxyInitializer(q.owner, fact.node)
	if d == nil || d.Initializer() != site || fact.normalInputs != q.inputs || fact.initializerDraft != nil || ast.GetSourceFileOfNode(site) != fact.sourceFile {
		return true
	}
	global := q.owner.checker.GetGlobalSymbol("Proxy", ast.SymbolFlagsValue, nil)
	if global == nil || constructor != global.ValueDeclaration || read != site.Expression() {
		return true
	}
	origins := [2]*ast.Node{}
	for i, a := range slot.actuals {
		if a.node != site.AsNewExpression().Arguments.Nodes[i] || a.observed.effects != sourceEffectsAccounted || a.observed.incomplete || len(a.observed.values) != 1 {
			return true
		}
		observed := a.observed.values[0]
		value := observed.value
		if observed.inputs != q.inputs || observed.returned != nil || value.node == nil || ast.GetSourceFileOfNode(value.node) != fact.sourceFile || !possibleProxyLiteralOrigin(value.node) || len(value.path) != 0 || value.acquired != nil || value.normal != nil || value.instance != nil || value.native != nil || len(observed.scope.bindings) != 0 || len(observed.scope.creators) != 0 {
			return true
		}
		origins[i] = value.node
	}
	if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourcePossibleProxyGetOrigin{})+unsafe.Sizeof(moduleInitializerDraft{})+unsafe.Sizeof(moduleInitializerCompletion{}), result, site) {
		return true
	}
	row := sourcePossibleProxyGetOrigin{Site: site, Constructor: constructor, ConstructorRead: read, Target: origins[0], Handler: origins[1], Entry: slot.entry}
	draft := &moduleInitializerDraft{Source: fact.sourceFile, Statement: fact.node, Declaration: d, Program: q.owner.program, Checker: q.owner.checker, FactID: fact.summary.ID, Stamp: initializerSourceStamp(fact.sourceFile), Mode: "PossibleProxyGetOrigin:" + descriptorEffectMode, Status: "AwaitingGraph", OriginGeneration: q.owner.generation, OriginMode: fact.descriptorMode, PossibleProxyGets: []sourcePossibleProxyGetOrigin{row}, Rows: []moduleInitializerCompletion{{Completion: "unrepresented", Domain: "Unrepresented", Remaining: "possible constructor/Get effects only"}}}
	draft.signature = initializerHash([]interface{}{draft.Mode, draft.Stamp, site.Pos(), constructor.Pos(), read.Pos(), origins[0].Pos(), origins[1].Pos()})
	fact.initializerDraft = draft
	installAwaitingInitializer(q.owner, draft)
	return true
}

// possibleProxyGetEffects requests the CURRENT handler member only after an
// original property Get reaches this possible result. Unknown is never paid.
func (q *sourceValueQuery) possibleProxyGetEffects(site *ast.Node, path []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) bool {
	if q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || q.owner.program == nil || site.Parent == nil || !ast.IsVariableDeclaration(site.Parent) {
		return false
	}
	p := q.owner.initializerDeclarations[site.Parent]
	if p == nil || p.Draft == nil {
		return false
	}
	d := p.Draft
	if d.Mode != "PossibleProxyGetOrigin:"+descriptorEffectMode || len(d.PossibleProxyGets) != 1 || d.Program != q.owner.program || d.Checker != q.owner.checker || d.Source != ast.GetSourceFileOfNode(site) || d.OriginGeneration != q.owner.generation || d.OriginMode != possibleProxyOriginMode(q.owner, d.Source) || d.Stamp != initializerSourceStamp(d.Source) || d.Declaration != site.Parent || possibleProxyInitializer(q.owner, d.Statement) != d.Declaration {
		return false
	}
	row := d.PossibleProxyGets[0]
	index := q.owner.indexes[d.Source]
	if row.Site != site || row.Entry != index.normalOccurrences[site] || row.Entry == nil || !row.Entry.once || row.Entry.region != nil || row.ConstructorRead != site.Expression() || row.Handler == nil || ast.GetSourceFileOfNode(row.Handler) != d.Source || !possibleProxyLiteralOrigin(row.Handler) || row.Target == nil || ast.GetSourceFileOfNode(row.Target) != d.Source || !possibleProxyLiteralOrigin(row.Target) {
		return false
	}
	result.opaque, result.valueIncomplete = true, true
	// Definition-only queries with no reached operation cannot consume the row.
	operation, call, frame := q.possibleProxyGetRecipient(d)
	if operation == nil {
		return true
	}
	if mode&accessorSet != 0 || mode&accessorNoGet != 0 {
		return true
	}
	// This supplied-input context borrows the caller while inspecting a body
	// demand. It is NOT a completed/entered normal Get frame. Handler lookup
	// uses the current caller cut, and only its MAY effects leave this scope.
	previousOperation, previousReading, previousInputs := q.operation, q.reading, q.inputs
	q.operation, q.reading, q.inputs = nil, call, frame
	defer func() { q.operation, q.reading, q.inputs = previousOperation, previousReading, previousInputs }()
	part := q.accessors(row.Handler, []string{"get"}, "", accessorAcquire, bindings, nil)
	// Missing, noncallable or unresolved handlers retain the possible target Get.
	// This is MAY effects only, including target accessors. No target value leaves.
	target := q.accessors(row.Target, path, name, accessorRead, bindings, nil)
	q.adoptConstructionMayEffects(operation, target, result)
	q.adoptConstructionMayEffects(operation, part, result)
	for _, body := range part.declarations {
		result.retainCallableEffect(nil, body)
	}
	for _, v := range part.values {
		if v.node != nil && ast.IsFunctionLike(v.node) && v.node.Body() != nil {
			result.retainCallableEffect(nil, v.node)
		}
	}
	return true
}

// possibleProxyGetRecipient authenticates only a live original caller's MAY Get
// demand. Supplied origins can borrow that caller's frame while the operation
// names a deferred body. This relation creates no normal body/Get authority.
func (q *sourceValueQuery) possibleProxyGetRecipient(d *moduleInitializerDraft) (*ast.Node, *ast.Node, *sourceValueInputs) {
	operation, call := q.protectedMember, q.invoking
	if operation == nil || call == nil || !ast.IsCallExpression(call) || q.operation == nil || q.operation.node != operation || ast.GetSourceFileOfNode(operation) != d.Source || ast.GetSourceFileOfNode(call) != d.Source || call.Pos() <= d.Declaration.End() {
		return nil, nil, nil
	}
	body := enclosingCallableNode(operation)
	current := q.operation.inputs
	if body == nil || body != q.operation.owner || body.Body() == nil || current == nil || current.operationLifetime == nil || current.declaration != body {
		return nil, nil, nil
	}
	consumed := current.consumedCall
	if consumed == nil || consumed.inputs != current || consumed.declaration != body || consumed.operation != call || !consumed.entered || consumed.conditional {
		return nil, nil, nil
	}
	// The active body can carry captured input provenance, but its original
	// pending caller owns effect adoption and the current handler-read cut.
	// This synchronous parent relation grants no normal body/Get completion.
	frame := consumed.parent
	if frame == nil || frame.operationLifetime == nil || frame.ownedFact == nil || frame.ownedFact.normalInputs != frame || frame.ownedFact.node != q.effectOwner || q.effectOwner != frame.declaration || frame.ownedFact.descriptorMode != d.OriginMode {
		return nil, nil, nil
	}
	index := q.owner.indexes[d.Source]
	getEntry := index.normalOccurrences[operation]
	if index.incomplete || getEntry == nil || getEntry.node != operation || getEntry.region != body {
		return nil, nil, nil
	}
	slot := frame.operations[call]
	if slot == nil || slot.state != sourceOperationInProgress || slot.selected == nil || !slot.authority.valid(q) || slot.population != frame.population || frame.population == nil || slot.entry == nil || slot.entry.node != call || !slot.entry.once || slot.entry.region != nil || frame.population.entries[call] != slot.entry {
		return nil, nil, nil
	}
	selected := false
	for _, target := range slot.selected.declarations {
		q.charge(nil, call)
		if target == body {
			selected = true
		}
	}
	for _, target := range slot.selected.bodies {
		q.charge(nil, call)
		if target.declaration == body {
			selected = true
		}
	}
	for _, target := range slot.selected.acquired.values {
		q.charge(nil, call)
		if target.node == body && len(target.path) == 0 {
			selected = true
		}
	}
	if !selected {
		return nil, nil, nil
	}
	return operation, call, frame
}
