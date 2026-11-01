package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourcePrefixRefusalCoverage is immutable source accounting, never execution
// authority. stamp.owner is deliberately nil. The other stamp pointers and mode
// identify the producing analysis, not a live lease. The maps are borrowed only
// after discovery/index qualification publishes them read-only. No frame, query,
// candidate, mutable values owner, branch or semantic receipt is retained.
type sourcePrefixRefusalCoverage struct {
	stamp       sourceNormalAuthority
	mode        [32]byte
	source      *ast.SourceFile
	terminal    *sourceNormalOccurrence
	runtime     map[*ast.Node]bool
	occurrences map[*ast.Node]*sourceNormalOccurrence
}

// coveredModule is historical metadata inspection. It does not call a live
// authority validator or use the stamp to enter/reconstruct an operation.
func (c *sourcePrefixRefusalCoverage) coveredModule(f *callableFacts, mode [32]byte) bool {
	if c == nil || f == nil || c.mode != mode || c.stamp.owner != nil || c.stamp.program == nil || c.stamp.checker == nil || c.stamp.generation == nil || c.stamp.executable == nil || c.source == nil || c.stamp.program.GetSourceFile(c.source.FileName()) != c.source || f.sourceFile != c.source || f.node == nil || f.node.Parent != c.source.AsNode() || ast.IsFunctionLike(f.node) || !c.runtime[f.node] || c.terminal == nil || c.terminal.node == nil || !supportedBindingDeclaration(c.terminal.node) || c.terminal.statement == nil || c.terminal.statement.Parent != c.source.AsNode() || c.terminal.region != nil || !c.terminal.once || c.occurrences[c.terminal.node] != c.terminal || !c.runtime[c.terminal.node] {
		return false
	}
	e := c.occurrences[f.node]
	return e != nil && e.node == f.node && e.statement == f.node && e.region == nil && e.once && e.parent == c.occurrences[c.source.AsNode()] && c.terminal.parent == c.occurrences[c.terminal.node.Parent]
}
func (c *sourcePrefixRefusalCoverage) finalOwner(f *callableFacts, mode [32]byte) bool {
	return c.coveredModule(f, mode) && f.node == c.terminal.statement && f.initializerDeclaration == c.terminal.node
}

// detachPrefixRefusalCoverage runs before routing removal. Only the actual
// authenticated, qualified and wholly unentered binding reservation can produce
// this pending source relation. Repeated release cannot replace it.
func (p *closedPrefixCandidate) detachPrefixRefusalCoverage() {
	if p == nil || p.history == nil || p.history.state != prefixQualified || !p.authenticated || p.released || p.owner == nil || p.source == nil || p.generation == nil || !p.generation.active || p.owner.generation != p.generation || p.owner.program != p.program || p.owner.checker != p.checker || p.history.recipe == nil || p.history.recipe.binding == nil || p.call != p.history.recipe.binding.declaration || p.entry == nil || p.frame == nil || p.slot == nil || p.frame.ownedFact == nil || p.frame.declaration != p.statement || p.frame.operations[p.call] != p.slot || p.slot.entry != p.entry || p.slot.state != sourceOperationPending || p.slot.population != p.frame.population || p.frame.population == nil || p.frame.population.entries[p.call] != p.entry || p.frame.ownedFact.node != p.statement || p.frame.ownedFact.initializerDeclaration != p.call || p.history.roots != 0 || p.history.publications != 0 || p.history.receipt != nil {
		return
	}
	a := p.history.authority
	if a.owner != p.owner || a.program != p.program || a.checker != p.checker || a.generation != p.generation || a.executable != p.executable {
		return
	}
	index, ok := p.owner.indexes[p.source]
	if !ok || index.incomplete || p.owner.indexPreparing[p.source] || index.normalOccurrences[p.call] != p.entry {
		return
	}
	f := p.frame.ownedFact
	if f.pendingPrefixCoverage != nil || f.prefixCoverage != nil {
		return
	}
	a.owner = nil
	c := &sourcePrefixRefusalCoverage{stamp: a, mode: p.history.mode, source: p.source, terminal: p.entry, runtime: p.history.runtime, occurrences: index.normalOccurrences}
	if !c.finalOwner(f, p.history.mode) {
		return
	}
	f.pendingPrefixCoverage = c
}

// livePrefixRefusalCoverage is the sole late payload producer. The independent
// mode is captured by the actual source collector before history removal.
// Live frame/slot checks occur here, never in historical consumers.
func livePrefixRefusalCoverage(f *callableFacts, q *sourceValueQuery, phase sourceNormalPhase, frame *sourceValueInputs, result accessorCandidates, mode [32]byte) *sourcePrefixRefusalCoverage {
	if f == nil || f.pendingPrefixCoverage == nil || q == nil || q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || frame == nil || frame != f.normalInputs || frame.ownedFact != f || q.inputs != frame || q.operation == nil || q.operation.inputs != frame || q.operation.owner != f.node || q.operation.node != phase.node || phase.role != sourceNormalSelect || !result.opaque || !result.valueIncomplete {
		return nil
	}
	c := f.pendingPrefixCoverage
	if !c.finalOwner(f, mode) || c.stamp.program != q.owner.program || c.stamp.checker != q.owner.checker || c.stamp.generation != q.owner.generation || c.stamp.executable != q.executable || phase.node != c.terminal.node || result.cause != c.terminal.node || frame.declaration != c.terminal.statement || frame.population == nil || frame.population.entries[phase.node] != c.terminal || q.owner.closedPrefixes[c.source] != nil {
		return nil
	}
	slot := frame.operations[phase.node]
	if slot == nil || slot.state != sourceOperationRefused || slot.entry != c.terminal || slot.population != frame.population || !slot.authority.valid(q) {
		return nil
	}
	return c
}

// settlePrefixRefusalCoverage consumes one actual late refusal payload. The
// caller already checked its live producer. Copies retain metadata, not a lease.
func settlePrefixRefusalCoverage(f *callableFacts, result accessorCandidates) (settled, fresh bool) {
	c := result.prefixCoverage
	if c == nil || c.stamp.generation == nil || !c.stamp.generation.active || !c.finalOwner(f, c.mode) || !result.opaque || !result.valueIncomplete || result.cause != c.terminal.node {
		return false, false
	}
	if f.prefixCoverage == c && f.pendingPrefixCoverage == nil {
		return true, false
	}
	if f.pendingPrefixCoverage != c || f.prefixCoverage != nil {
		return false, false
	}
	f.prefixCoverage = c
	f.pendingPrefixCoverage = nil
	return true, true
}

// applyPrefixSourceCoverage is the existing fact/effect boundary's source
// consumer. It uses the collector's facts/nodeTargets, not another registry.
// A covered module cannot turn an unexecuted held region into independent
// neutral metadata. Function summaries and independent contributions stay owned
// separately. An undelivered pending relation remains explicitly incomplete.
func applyPrefixSourceCoverage(facts []callableFacts, nodeTargets map[*ast.Node]int, owner *executableBodyOwner, mode [32]byte) {
	for i := range facts {
		final := &facts[i]
		c := final.prefixCoverage
		settled := c != nil
		if c == nil {
			c = final.pendingPrefixCoverage
		}
		if c == nil {
			continue
		}
		if c.terminal == nil {
			appendOpaqueAccessorEffect(final, accessorCandidates{opaque: true, valueIncomplete: true, cause: final.node, closedPrefixReason: "source prefix coverage unavailable"})
			continue
		}
		if final.node != c.terminal.statement {
			continue
		}
		if !c.finalOwner(final, mode) || owner == nil || owner.values == nil || c.stamp.program != owner.values.program || c.stamp.checker != owner.checker || c.stamp.generation != owner.values.generation || c.stamp.executable != owner {
			continue
		}
		actual, ok := nodeTargets[c.terminal.statement]
		if !ok || actual != i {
			continue
		}
		reason := fmt.Sprintf("unexecuted prefix covered by %s refusal", final.summary.Name)
		if !settled {
			reason = fmt.Sprintf("unsettled prefix coverage owned by %s", final.summary.Name)
			appendOpaqueAccessorEffect(final, accessorCandidates{opaque: true, valueIncomplete: true, cause: c.terminal.node, closedPrefixReason: reason})
			final.summary.DirectEffectSources = uniqueEnvironmentSources(final.summary.DirectEffectSources)
		}
		for j := range facts {
			covered := &facts[j]
			if j == i || !c.coveredModule(covered, mode) {
				continue
			}
			if settled && covered.prefixCoverage == c || !settled && covered.pendingPrefixCoverage == c {
				continue
			}
			if covered.prefixCoverage != nil || covered.pendingPrefixCoverage != nil {
				continue
			}
			if settled {
				covered.prefixCoverage = c
			} else {
				covered.pendingPrefixCoverage = c
			}
			// Only the typed relation above identifies the source owner. The existing
			// opacity appender owns the conservative effect, with no invented Call edge.
			appendOpaqueAccessorEffect(covered, accessorCandidates{opaque: true, valueIncomplete: true, cause: c.terminal.node, closedPrefixReason: reason})
			covered.summary.DirectEffectSources = uniqueEnvironmentSources(covered.summary.DirectEffectSources)
		}
	}
}
