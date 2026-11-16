package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceComponentAssignmentScope lends same-definition assignment SOURCE while
// the original component's actual helper-use population is active. This is a
// conditional MAY supplier, not runtime receiver identity, an invocation of the
// component, performed mutation, selected Get, BODY/normal/current/APPLIED loan.
// Its own issuer checks remain independent of conditional DEFAULT admission.
type sourceComponentAssignmentScope struct {
	issuer                                   *sourceValueQuery
	population                               *sourceBoundComponentProtocol
	inputs                                   *sourceValueInputs
	publisher                                *sourcePendingMemberPublisher
	writerInputs                             *sourceWriterInputGraph
	generation                               *projectGeneration
	component, receiver, member, call, outer *ast.Node
	cut                                      sourceRelativeCut
	read                                     *sourceMemberWriterReadCut
}

// Each row belongs to one original assignment and reader; it cannot be reused
// for another writer or copied query. Existing scope restoration owns captures.
type sourceComponentAssignmentInput struct {
	scope *sourceComponentAssignmentScope
	left  *ast.Node
	read  *sourceMemberWriterReadCut
}

func (s *sourceComponentAssignmentScope) live(q *sourceValueQuery) bool {
	if s == nil || q == nil || s.issuer != q || q.componentContextSource != s.population || s.population == nil || s.population.issuer != q || s.population.assignmentSources != s || q.inputs != s.inputs || q.effectOwner != s.component || q.installedMemberIssuer != q || q.protectedMember != s.member || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || q.owner == nil || q.executable == nil || s.inputs == nil || !q.active[s.inputs.declaration] || q.inputs.invocation != s.outer || q.invoking != s.outer {
		return false
	}
	g := s.generation
	if g == nil || !g.active || g.project == nil || g.project.abandoned || g.project.activeGeneration != g || g.project.program != g.program || q.owner.generation != g || q.owner.program != g.program || q.owner.checker != g.checker || q.executable.values == nil || q.executable.values.generation != g || q.executable.values.program != g.program || q.executable.checker != g.checker || q.executable.pendingMemberPublishers[s.component] != s.publisher || s.publisher == nil || !s.publisher.live || s.publisher.fact == nil || s.publisher.fact.node != s.component || s.publisher.fact.writerInputs != s.writerInputs || q.executable.writerInputFacts[s.component] != s.writerInputs {
		return false
	}
	if _, owned := q.owner.components[s.component]; !owned {
		return false
	}
	actual := q.relativeInputCut(s.member)
	if actual == s.cut {
		return true
	}
	if s.read == nil {
		return false
	}
	physical := s.cut
	physical.reading, physical.returning = s.read.use, nil
	return actual == physical
}

func (q *sourceValueQuery) beginComponentAssignmentSources(receiver, member, call *ast.Node, bindings sourceValueBindings, result *accessorCandidates, read *sourceMemberWriterReadCut) func() {
	noop := func() {}
	population := q.componentContextSource
	if population == nil || population.issuer != q || population.inputs != q.inputs || population.member != member || !q.pendingBoundComponentContextRead(receiver, member, bindings) {
		return noop
	}
	// Without original supplier ownership, retain compiler debt even if the
	// independently admitted DEFAULT arm can describe its nominal bookkeeping.
	refuse := func() func() { result.fieldReceiverIncomplete = true; return noop }
	if q.executable == nil || q.owner == nil || q.inputs == nil || q.inputs.operationLifetime != nil || q.inputs.storage != nil || q.inputs.deferredBody || q.inputs.invocation == nil || q.inputs.invocation != q.invoking || call == nil || call != normalCalleeGetOwner(member) || !ast.IsCallExpression(call) || call.Expression() != member || enclosingCallableNode(q.inputs.invocation) != q.effectOwner || !helperOwnsReceiver(receiver, q.effectOwner) {
		return refuse()
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	g := q.owner.generation
	if publisher == nil || publisher.fact == nil || publisher.fact.writerInputs == nil || publisher.fact.sourceFile != ast.GetSourceFileOfNode(q.effectOwner) {
		return refuse()
	}
	s := &sourceComponentAssignmentScope{issuer: q, population: population, inputs: q.inputs, publisher: publisher, writerInputs: publisher.fact.writerInputs, generation: g, component: q.effectOwner, receiver: receiver, member: member, call: call, outer: q.inputs.invocation, cut: q.relativeInputCut(member), read: read}
	previous := population.assignmentSources
	population.assignmentSources = s
	if !s.live(q) {
		population.assignmentSources = previous
		return refuse()
	}
	for _, node := range []*ast.Node{s.component, s.receiver, s.member, s.outer} {
		file := ast.GetSourceFileOfNode(node)
		if file == nil || g.program.GetSourceFile(file.FileName()) != file {
			population.assignmentSources = previous
			return refuse()
		}
	}
	return func() {
		if population.assignmentSources == s {
			population.assignmentSources = previous
		}
		*s = sourceComponentAssignmentScope{}
	}
}

// componentAssignmentWriterInput supplies only a source capture row for a
// direct same-component assignment. No component Call, creator or receiver
// binding is created. Marking the row incomplete prevents replacement precision
// and keeps the original unordered MAY capture through ordinary RHS acquisition.
func (q *sourceValueQuery) componentAssignmentWriterInput(left *ast.Node, bindings sourceValueBindings, result *accessorCandidates, read *sourceMemberWriterReadCut) (sourceMemberWriterInput, bool) {
	if q.componentContextSource == nil {
		return sourceMemberWriterInput{}, false
	}
	s := q.componentContextSource.assignmentSources
	if !s.live(q) || left == nil || !ast.IsPropertyAccessExpression(left) || left.Name().Text() != "hasContext" || left.Expression().Kind != ast.KindThisKeyword || !helperOwnsReceiver(left.Expression(), s.component) || enclosingCallableNode(left) != s.component || !plainStagedAssignment(left.Parent) || left.Parent.AsBinaryExpression().Left != left || ast.GetSourceFileOfNode(left) != ast.GetSourceFileOfNode(s.component) || read == nil || read.use != q.reading || s.read != nil && s.read != read {
		return sourceMemberWriterInput{}, false
	}
	// Definition-relative order applies to this actual outer helper use. A later
	// assignment cannot supply an earlier read; this says nothing about execution.
	if left.Pos() >= s.outer.Pos() {
		return sourceMemberWriterInput{}, false
	}
	scope := q.acquireCallableScope(bindings, result)
	return sourceMemberWriterInput{scope: scope, incomplete: true, componentSource: &sourceComponentAssignmentInput{scope: s, left: left, read: read}}, true
}

// componentAssignmentReceiverSource relates two lexical-this SOURCE occurrences
// in the same component definition. Original nodes remain distinct; only this
// assignment's MAY RHS route is admitted, never value identity or replacement.
func (q *sourceValueQuery) componentAssignmentReceiverSource(input sourceMemberWriterInput, left, origin *ast.Node, value sourceValue, read *sourceMemberWriterReadCut) bool {
	row := input.componentSource
	if row == nil || row.left != left || row.read != read || !row.scope.live(q) || origin != row.scope.receiver || value.node == nil || value.node.Kind != ast.KindThisKeyword || len(value.path) != 0 || !helperOwnsReceiver(value.node, row.scope.component) || ast.GetSourceFileOfNode(value.node) != ast.GetSourceFileOfNode(row.scope.component) {
		return false
	}
	return true
}

// componentAssignmentEffectUse describes the actual enclosing source use while
// its independently owned supplier population is live. Both a member getter and
// authored invocation retain their original child operation; no value/normal or
// current/APPLIED receipt follows from this parent association.
func (q *sourceValueQuery) componentAssignmentEffectUse(operation *ast.Node) *ast.Node {
	if q == nil || q.componentContextSource == nil {
		return nil
	}
	s := q.componentContextSource.assignmentSources
	if !s.live(q) || (operation != s.member && operation != s.call) {
		return nil
	}
	return s.outer
}
