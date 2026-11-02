package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// captureLayoutValid separates the existing empty environment from the finite
// one-module-const domain, plus the selected deferred formal-capture layout.
// A static layout is not acquisition or entry authority.
func (p *closedCallableProof) captureLayoutValid() bool {
	if p == nil {
		return false
	}
	if p.empty {
		return len(p.captureDeclarations) == 0 && len(p.captureReferences) == 0
	}
	if (!ast.IsArrowFunction(p.arrow) && !moduleFunctionDeclaration(p.arrow)) || p.parameters != 0 || len(p.captureDeclarations) != 1 || len(p.captureReferences) == 0 {
		return false
	}
	d := p.captureDeclarations[0]
	if d != nil && ast.IsParameterDeclaration(d) {
		return activationCaptureLayout(p, d.Parent)
	}
	if d == nil || !ast.IsVariableDeclaration(d) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 || d.Initializer() == nil || !ast.IsObjectLiteralExpression(d.Initializer()) {
		return false
	}
	for n, i := range p.captureReferences {
		if n == nil || !ast.IsIdentifier(n) || i != 0 {
			return false
		}
	}
	return true
}

// callableCaptureState validates only immutable capture membership and current
// storage ancestry. It never resolves a source name or revives a disposed owner.
func (o *languageOwner) callableCaptureState(b languageBranch, f *languageCallable) bool {
	if !o.live(b) || f == nil || f.id.owner != o || f.proof == nil || !f.proof.captureLayoutValid() || f.captures == nil || f.captures.id.owner != o {
		return false
	}
	if f.proof.empty {
		if moduleActivationCaptureCreator(f.proof.arrow) {
			if len(f.capturedLexicals) != 0 || f.captures.outer != nil {
				return false
			}
			for r := b.state.storage; r != nil; r = r.previous {
				if moduleFunctionMarker(r, f) {
					return true
				}
			}
			return false
		}
		return len(f.capturedLexicals) == 0 && f.captures.outer == nil
	}
	if activationParameterProof(f.proof) {
		return o.activationCaptureState(b, f)
	}
	if !f.proof.finalizedBodyProof(o) || len(f.capturedLexicals) != 1 || f.captures.outer != nil || b.env != f.captures && b.env.outer != f.captures {
		return false
	}
	v := f.capturedLexicals[0]
	if v.declaration != f.proof.captureDeclarations[0] || v.cell.id.owner != o || v.cell.environment != f.captures.id || v.cell.summary || !v.cell.immutable {
		return false
	}
	for row := b.state.storage; row != nil; row = row.previous {
		if moduleFunctionDeclaration(f.proof.arrow) {
			if moduleFunctionMarker(row, f) {
				return true
			}
		} else if row.value.callable == f && row.cell == v.cell && row.object == nil && !row.initialized {
			return true
		}
	}
	return false
}

// readModuleCapturedCell is distinct from local-cell access. Only an actual
// source entry's capture tuple can name the cell, and reads use current storage.
// The global local-environment equality law remains unchanged.
func (o *languageOwner) readModuleCapturedCell(b languageBranch, e *languageCallEntryInput, index int) languageAlternative {
	if e != nil && activationParameterProof(e.proof) {
		return storageResidual(b, "module capture cannot read activation formal")
	}
	if e == nil || index != 0 || e.callable == nil || e.callable.proof == nil || e.callable.proof.empty || !e.valid(o, e.activation) || !o.callableCaptureState(b, e.callable) || b.env != e.activation.env || b.env.outer != e.callable.captures || b.guard != e.activation.guard || b.generation != e.activation.generation {
		return storageResidual(b, "captured cell entry")
	}
	ancestor := false
	for state := b.state; state != nil; state = state.previous {
		if state == e.activation.state {
			ancestor = true
			break
		}
	}
	if !ancestor {
		return storageResidual(b, "captured cell branch")
	}
	c := e.callable.capturedLexicals[index].cell
	for row := b.state.storage; row != nil; row = row.previous {
		if row.cell == c && row.initialized {
			return languageAlternative{branch: b, value: row.value}
		}
	}
	if moduleFunctionDeclaration(e.proof.arrow) {
		return languageAlternative{branch: b, completion: languageThrow, value: languageValue{text: "ReferenceError"}}
	}
	return storageResidual(b, "captured cell initialization")
}
