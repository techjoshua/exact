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

// moduleFunctionPrelude authenticates one declaration-instantiation donor before
// source-ordered evaluation. It never rewrites the declaration/body once flags.
func (p *shortCircuitPopulationProof) moduleFunctionPrelude() bool {
	c := p.candidate
	if c == nil || c.history == nil || c.history.recipe == nil {
		return false
	}
	r := c.history.recipe
	count := 0
	for cell, d := range r.declarations {
		if !p.spend() {
			return false
		}
		if !ast.IsFunctionDeclaration(d) {
			continue
		}
		count++
		if count != 1 || !moduleFunctionDeclaration(d) || r.binding != nil || cell >= len(r.constants) || r.constants[cell] || len(r.events) == 0 {
			return false
		}
		e := r.events[0]
		if e.kind != "InstantiateModuleFunction" || e.node != d || e.out != 0 || e.cell != cell || e.callable == nil || e.callable.arrow != d || e.callable.empty && !moduleActivationCaptureCreator(d) || !e.callable.captureLayoutValid() {
			return false
		}
		if d.Name().Parent != d || c.history.runtime[d.Name()] {
			return false
		}
		symbol := c.checker.GetSymbolAtLocation(d.Name())
		entry := p.index.normalOccurrences[d]
		if symbol == nil || symbol.ValueDeclaration != d || len(symbol.Declarations) != 1 || entry == nil || entry.node != d || entry.statement != d || entry.parent != p.index.normalOccurrences[c.source.AsNode()] || entry.region != nil || !entry.once {
			return false
		}
	}
	for pc, e := range r.events {
		if !p.spend() {
			return false
		}
		if e.kind == "InstantiateModuleFunction" && (count != 1 || pc != 0) {
			return false
		}
	}
	return true
}

// moduleFunctionMarker is a creation-origin record, not a lexical initialization
// or property row. In particular it cannot occupy the captured TDZ cell and
// prevent its later ordinary InitializeCell operation.
func moduleFunctionMarker(row *languageStorage, f *languageCallable) bool {
	return row != nil && f != nil && row.cell == (languageCell{}) && row.object == nil &&
		row.key == (languagePropertyKey{}) && row.descriptor == (languageDescriptor{}) &&
		row.value == (languageValue{callable: f}) && !row.initialized && !row.deleted
}

// instantiateModuleFunction borrows the actual module cell vector. It does not
// read a captured value or execute a body. The immutable tuple retains CellIds
// and the defining environment while ordinary storage owns later initialization.
func (o *languageOwner) instantiateModuleFunction(b languageBranch, p *closedCallableProof, lexicals []languageLexical, binding languageCell, candidate *closedPrefixCandidate) languageAlternative {
	if p != nil && moduleActivationCaptureCreator(p.arrow) {
		return o.instantiateActivationCreator(b, p, lexicals, binding, candidate)
	}
	if !o.live(b) || !o.canAdvance(b, 4) || p == nil || !moduleFunctionDeclaration(p.arrow) || p.empty || !p.captureLayoutValid() || !p.finalizedBodyProof(o) || candidate == nil || !candidate.enteredCallable(o, p) || !candidate.authoredEntry() || !candidate.sourceConstructs(p) || candidate.continuation != nil || candidate.history.recipe.binding != nil || b.env.outer != nil || binding.id.owner != o || binding.environment != b.env.id || binding.summary || binding.immutable || len(lexicals) != len(candidate.history.recipe.declarations) {
		return storageResidual(b, "module function instantiation association")
	}
	var capture languageLexical
	captures, bindings := 0, 0
	for i, v := range lexicals {
		if v.declaration != candidate.history.recipe.declarations[i] || v.cell.id.owner != o || v.cell.environment != b.env.id {
			return storageResidual(b, "module function original lexical vector")
		}
		if v.declaration == p.arrow && v.cell == binding {
			bindings++
		}
		if v.declaration == p.captureDeclarations[0] {
			capture = v
			captures++
		}
	}
	if captures != 1 || bindings != 1 || capture.cell.summary || !capture.cell.immutable {
		return storageResidual(b, "module function capture cell")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == binding {
			return storageResidual(b, "module function duplicate instantiation")
		}
	}
	f := &languageCallable{id: o.identity(), proof: p, captures: b.env, capturedLexicals: []languageLexical{capture}}
	created := o.storageStep(b, languageStorage{value: languageValue{callable: f}})
	return o.initializeLocal(created, binding, languageValue{callable: f, node: p.arrow})
}
