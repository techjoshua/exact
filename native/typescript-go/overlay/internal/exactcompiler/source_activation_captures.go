package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// moduleActivationCaptureCreator is finite syntax eligibility, not entry proof.
// The inner arrow is a deferred function expression with exactly one free formal.
func moduleActivationCaptureCreator(n *ast.Node) bool {
	if n == nil || !ast.IsFunctionDeclaration(n) || len(n.Parameters()) != 1 || n.Body() == nil || !ast.IsBlock(n.Body()) {
		return false
	}
	p := n.Parameters()[0]
	if !ast.IsIdentifier(p.Name()) || p.Initializer() != nil || p.QuestionToken() != nil || p.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(p) {
		return false
	}
	statements := n.Body().AsBlock().Statements.Nodes
	if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return false
	}
	inner := statements[0].Expression()
	if inner == nil || !ast.IsArrowFunction(inner) || ast.HasSyntacticModifier(inner, ast.ModifierFlagsAsync) || len(inner.Parameters()) != 0 || ast.HasDecorators(inner) || inner.Body() == nil || !ast.IsPropertyAccessExpression(inner.Body()) || ast.IsOptionalChain(inner.Body()) {
		return false
	}
	return ast.IsIdentifier(inner.Body().Expression()) && ast.IsIdentifier(inner.Body().Name())
}

// activationCaptureInner requires the finite creator syntax checked by its caller.
func activationCaptureInner(n *ast.Node) *ast.Node {
	return n.Body().AsBlock().Statements.Nodes[0].Expression()
}

// activationCaptureLayout carries checker-qualified free-set provenance only.
// Creation-only proofs have no body recipe. The mixed source layout may add a
// separately indexed deferred recipe, which still grants no current Call.
func activationCaptureLayout(p *closedCallableProof, outer *ast.Node) bool {
	if p == nil || !moduleFunctionDeclaration(outer) || !moduleActivationCaptureCreator(outer) || p.arrow != activationCaptureInner(outer) || p.empty || p.parameters != 0 || !activationInnerRecipe(p) || len(p.captureDeclarations) != 1 || p.captureDeclarations[0] != outer.Parameters()[0] || len(p.captureReferences) != 1 {
		return false
	}
	slot, ok := p.captureReferences[p.arrow.Body().Expression()]
	return ok && slot == 0
}

// finalizeActivationCreation stamps a copied construction proof. It supplies no
// normal operation or receipt to the deferred inner function. An optional
// independently qualified inner plan receives the same immutable source stamp.
func finalizeActivationCreation(f *closedCallableProof) {
	if !moduleActivationCaptureCreator(f.arrow) {
		return
	}
	r := *f.entry
	r.events = append([]storageEvent(nil), r.events...)
	inner := *r.events[2].callable
	inner.namespace, inner.generation, inner.source = f.namespace, f.generation, f.source
	if inner.plan != nil {
		inner.mapping = inner.plan.parameters
	}
	r.events[2].callable = &inner
	plan := *f.plan
	plan.recipe = &r
	f.entry, f.plan = &r, &plan
}

// createActivationCapturedCallable executes only the creation expression. The
// formal is acquired from this actual entry's cell vector, never a source tuple.
func (o *languageOwner) createActivationCapturedCallable(b languageBranch, p *closedCallableProof, cells []languageCell, e *languageCallEntryInput) languageAlternative {
	if !o.live(b) || !o.canAdvance(b, 3) || e == nil || !e.valid(o, e.activation) || b.env != e.activation.env || !activationCaptureLayout(p, e.proof.arrow) || p.namespace != o || p.generation != o.generation || p.source != e.proof.source || !callFormalCellsMatch(e, cells) || len(cells) != 1 || len(e.inputs.arguments) != 1 || e.inputs.arguments[0].value.object == nil || len(e.proof.entry.events) != 4 || e.proof.entry.events[2].callable != p {
		return storageResidual(b, "activation capture creating entry")
	}
	cell := cells[0]
	if cell.id.owner != o || cell.environment != e.activation.env.id || cell.summary || cell.immutable {
		return storageResidual(b, "activation capture formal cell")
	}
	// Exactly one formal Initialize precedes this creation in the selected
	// four-event body. A completed creation branch cannot issue another one.
	head := b.state.storage
	if b.state.previous != e.activation.state || b.cursor != e.activation.cursor+1 || b.guard != e.activation.guard || b.generation != e.activation.generation || head == nil || head.cell != cell || !head.initialized || head.previous != e.activation.state.storage {
		return storageResidual(b, "activation capture original Initialize predecessor")
	}
	value := o.readLocal(b, cell)
	if value.completion != languageNormal || value.value.object != e.inputs.arguments[0].value.object {
		return storageResidual(b, "activation capture initialized formal")
	}
	f := &languageCallable{id: o.identity(), proof: p, captures: b.env, capturedLexicals: []languageLexical{{declaration: e.proof.arrow.Parameters()[0], cell: cell}}}
	return languageAlternative{branch: o.storageStep(b, languageStorage{cell: cell, value: languageValue{callable: f}}), value: languageValue{callable: f, node: p.arrow}}
}

// activationCreationMarker is a callable-origin row, never a property write.
func activationCreationMarker(row *languageStorage, cell languageCell, f *languageCallable) bool {
	return row != nil && f != nil && row.cell == cell && row.object == nil &&
		row.key == (languagePropertyKey{}) && row.descriptor == (languageDescriptor{}) &&
		row.value == (languageValue{callable: f}) && !row.initialized && !row.deleted
}

// activationCapturedReturn is narrow output validation using the ORIGINAL Call
// history. It neither executes the inner body nor authorizes a later Call/Get.
func activationCapturedReturn(call languageAlternative, work *languageCopyWork) bool {
	if call.callHistory == nil || !call.callHistory.validResult(call) || call.value.callable == nil {
		return false
	}
	e := call.callHistory.entry
	raw := call.callHistory.raw.alternatives[0]
	f := call.value.callable
	o := call.branch.owner
	if !moduleActivationCaptureCreator(e.proof.arrow) || !activationCaptureLayout(f.proof, e.proof.arrow) || f.id.owner != o || f.proof.namespace != o || f.proof.generation != o.generation || f.proof.source != e.proof.source || f.captures != e.activation.env || len(f.capturedLexicals) != 1 || raw.storage == nil || len(raw.storage.cells) != 1 || len(e.proof.entry.events) != 4 || e.proof.entry.events[2].callable != f.proof || len(e.inputs.arguments) != 1 || e.inputs.arguments[0].value.object == nil {
		return false
	}
	cell := raw.storage.cells[0]
	if f.capturedLexicals[0] != (languageLexical{declaration: e.proof.arrow.Parameters()[0], cell: cell}) || cell.environment != f.captures.id || cell.id.owner != o || cell.summary || cell.immutable {
		return false
	}
	if raw.storage.pc != 4 || len(raw.storage.values) != 4 || len(raw.storage.ready) != 4 || !raw.storage.ready[2] || !raw.storage.ready[3] || raw.storage.values[2] != raw.value || raw.storage.values[3] != raw.value {
		return false
	}
	head := raw.branch.state.storage
	if !activationCreationMarker(head, cell, f) {
		return false
	}
	markers, initialized := 0, false
	for r := raw.branch.state.storage; r != nil; r = r.previous {
		work.spend(1)
		if r.cell != cell {
			continue
		}
		if r.initialized {
			if initialized || r.value.object != e.inputs.arguments[0].value.object {
				return false
			}
			initialized = true
		}
		if r.value == (languageValue{callable: f}) && !r.initialized {
			if !activationCreationMarker(r, cell, f) {
				return false
			}
			markers++
		}
	}
	return markers == 1 && initialized
}

// initializerReturnSupported adds only the original creator's authenticated
// callable Return to existing scalars. It supplies no inner entry authority.
func initializerReturnSupported(call languageAlternative, work *languageCopyWork) bool {
	return strictFunctionScalar(call.value) || activationCapturedReturn(call, work)
}

// activationInnerRecipe distinguishes the original creation-only layout from
// the finite, separately indexed deferred body. Neither grants a current Call.
func activationInnerRecipe(p *closedCallableProof) bool {
	if p.entry == nil {
		return p.plan == nil && p.mapping == nil
	}
	if p.plan == nil || p.plan.recipe != p.entry || p.plan.parameters == nil || p.plan.parameters.arrow != p.arrow || !p.plan.parameters.validProjection() || len(p.plan.parameters.declarations) != 0 || p.mapping != nil && p.mapping != p.plan.parameters {
		return false
	}
	r := p.entry
	if r.body != p.arrow || !r.callBody || r.prefix || r.locals != 0 || len(r.events) != 4 || r.registers != 4 {
		return false
	}
	base := p.arrow.Body().Expression()
	a, b, c, d := r.events[0], r.events[1], r.events[2], r.events[3]
	return a.kind == "ReadCapturedCell" && a.cell == 0 && a.node == base && a.out == 0 && b.kind == "Member" && b.node == p.arrow.Body() && b.a == 0 && b.out == 1 && b.key == languageStringKey(p.arrow.Body().Name().Text()) && c.kind == "GetValue" && c.node == p.arrow.Body() && c.a == 1 && c.out == 2 && d.kind == "Return" && d.node == p.arrow.Body() && d.a == 2 && d.out == 3
}

// activationParameterProof recognizes only the original creator's checker
// qualified free formal. Source/current entry authority remains independent.
func activationParameterProof(p *closedCallableProof) bool {
	return p != nil && len(p.captureDeclarations) == 1 && p.captureDeclarations[0] != nil && ast.IsParameterDeclaration(p.captureDeclarations[0]) && activationCaptureLayout(p, p.captureDeclarations[0].Parent)
}

// activationCaptureState validates actual storage issuance, not a captured
// value snapshot. The live original successor candidate supplies Call authority.
func (o *languageOwner) activationCaptureState(b languageBranch, f *languageCallable) bool {
	if !o.live(b) || f == nil || !activationParameterProof(f.proof) || !f.proof.finalizedBodyProof(o) || f.id.owner != o || f.captures == nil || f.captures.id.owner != o || f.captures.outer == nil || len(f.capturedLexicals) != 1 || b.env != f.captures.outer && b.env.outer != f.captures {
		return false
	}
	v := f.capturedLexicals[0]
	if v.declaration != f.proof.captureDeclarations[0] || v.cell.id.owner != o || v.cell.environment != f.captures.id || v.cell.immutable || v.cell.summary {
		return false
	}
	marker, initialized := false, false
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell != v.cell {
			continue
		}
		if row.initialized {
			if initialized || row.value.object == nil {
				return false
			}
			initialized = true
		}
		if row.value.callable != nil {
			if marker || !activationCreationMarker(row, v.cell, f) {
				return false
			}
			marker = true
		}
	}
	return marker && initialized
}

// readActivationCapturedCell uses the fresh actual entry and CURRENT storage.
// It cannot weaken local-environment equality or module-root capture admission.
func (o *languageOwner) readActivationCapturedCell(b languageBranch, e *languageCallEntryInput, index int) languageAlternative {
	if e == nil || index != 0 || !e.valid(o, e.activation) || !o.activationCaptureState(b, e.callable) || b.env != e.activation.env || b.env.outer != e.callable.captures || b.guard != e.activation.guard || b.generation != e.activation.generation {
		return storageResidual(b, "activation captured cell entry")
	}
	ancestor := false
	for state := b.state; state != nil; state = state.previous {
		if state == e.activation.state {
			ancestor = true
			break
		}
	}
	if !ancestor {
		return storageResidual(b, "activation captured cell branch")
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == e.callable.capturedLexicals[0].cell && row.initialized {
			return languageAlternative{branch: b, value: row.value}
		}
	}
	return storageResidual(b, "activation captured cell unavailable")
}

// activationCapturedDemand names one UNKNOWN lexical input obligation. Naming
// neither resolves a value nor proves a Get, Call, descriptor or effect coverage.
func activationCapturedDemand(inner, member, parameter *ast.Node, key string) bool {
	if parameter == nil || !ast.IsParameterDeclaration(parameter) || !moduleActivationCaptureCreator(parameter.Parent) || parameter != parameter.Parent.Parameters()[0] || inner != activationCaptureInner(parameter.Parent) || member != inner.Body() || key != member.Name().Text() {
		return false
	}
	return ast.GetSourceFileOfNode(inner) == ast.GetSourceFileOfNode(parameter)
}
