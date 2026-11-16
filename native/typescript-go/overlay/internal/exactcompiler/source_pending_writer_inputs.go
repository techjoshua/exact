package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceWriterCaptureKey names a relative writer use, not effective query
// equality. No current value, active guard, borrowed scope or verdict is cached.
type sourceWriterCaptureKey struct {
	consumer, writer, write, receiver, origin, get, use *ast.Node
	cuts                                                [4]*ast.Node
}

// sourceWriterCapture owns declaration templates and ordered formal slots.
// A captured global receiver does not require any of these actual inputs. Its
// current value is still acquired by every original Get before transfer ACK.
type sourceWriterCapture struct {
	key         sourceWriterCaptureKey
	root        *ast.Node
	rhs         *ast.Node
	aliases     []*ast.Node
	formals     []sourceMemberEndpoint
	publication uint64
}

// sourceWriterCapturePublication is a synchronous original-Get contribution.
// It is never stored on a fact. Completeness and receiver matching must be
// requalified at this use, even if the declaration template already exists.
type sourceWriterCapturePublication struct {
	complete, matches bool
	relativeRHS       *ast.Node
}

// pendingWriterCapture transfers only an input-independent lexical receiver.
// The existing origin/match owner supplies the result at the same original cut.
// Matching captures also require an input-independent RHS source role. The
// original RHS visitor remains responsible for every donor and uncertainty.
func (q *sourceValueQuery) pendingWriterCapture(assignment sourceValueAssignment, origin *ast.Node, bindings sourceValueBindings, result *accessorCandidates, get *sourceGetInputs, beforeAdmission bool) (*sourceMemberWriterInput, bool) {
	if !q.dependenciesOnly || q.executable == nil || runtimeModuleEvaluation(q.effectOwner) || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || q.argumentPrefix != nil || q.returnObservation != nil || get == nil || get.receiver.native == nil || (!standardNativeLookup(get) && get.receiver.native.kind != sourceNativeWeakMapSourceInstance) || origin == nil {
		return nil, false
	}
	if assignment.left == nil || assignment.left.Parent == nil || !ast.IsBinaryExpression(assignment.left.Parent) || assignment.left.Parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return nil, false
	}
	if request := q.pendingMemberRequest; request != nil && (!request.live || request.issuer != q) {
		return nil, false
	}
	member := q.protectedMember
	writer := enclosingCallableNode(assignment.left)
	if member == nil || member.Parent == nil || !ast.IsCallExpression(member.Parent) || writer == nil || writer == q.effectOwner || enclosingCallableNode(member) != q.effectOwner {
		return nil, false
	}
	if _, ordinary := ordinaryResultCategory(writer); !ordinary {
		return nil, false
	}
	for _, parameter := range writer.Parameters() {
		if !ast.IsIdentifier(parameter.Name()) || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return nil, false
		}
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return nil, false
	}
	receiver, _ := accessorReceiver(assignment.left)
	root, aliases := q.writerGlobalCapture(receiver, writer)
	if root == nil {
		return nil, false
	}
	key := sourceWriterCaptureKey{consumer: q.effectOwner, writer: writer, write: assignment.left, receiver: receiver, origin: origin, get: member, use: q.effectUse(), cuts: [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}}
	if publisher.fact.pendingMembers == nil {
		publisher.fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	ledger := publisher.fact.pendingMembers
	if ledger.writerCaptures == nil {
		ledger.writerCaptures = make(map[sourceWriterCaptureKey]*sourceWriterCapture)
	}
	relation := ledger.writerCaptures[key]
	if relation == nil {
		relation = &sourceWriterCapture{key: key, root: root, aliases: aliases}
		position := 0
		for _, parameter := range writer.Parameters() {
			if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			// Rest/default syntax remains explicit on the declaration endpoint.
			// No joined rest alternatives or current inputs enter this template.
			relation.formals = append(relation.formals, sourceMemberEndpoint{kind: memberFormal, expression: parameter.Name(), declaration: parameter, owner: writer, position: position})
			position++
		}
		ledger.writerCaptures[key] = relation
		ledger.revision++
		ledger.stats.Revisions++
		ledger.stats.WriterInputsRegistered++
		progressPendingMemberDeclaration(q, member.Parent, "writer-input-registered", ledger.stats)
	}
	// This is the original receiver acquisition moved before input discovery.
	// Its alias chain was proved independent of writer inputs. No query or body
	// is reconstructed by the fact consumer, and current results are not retained.
	part := accessorCandidates{}
	values := q.occurrenceOrigins(receiver, assignment.left, origin, bindings, &part)
	publication := sourceWriterCapturePublication{complete: len(values) != 0 && !part.opaque && !part.valueIncomplete && !part.receiverIncomplete}
	for _, value := range values {
		if value.node == nil || value.capture != nil || value.instance != nil || value.normal != nil || value.bound != nil || value.rest != nil || value.copied != nil || len(value.path) != 0 {
			publication.complete = false
		}
		publication.matches = publication.matches || value.node == origin || q.nativeReceiverMatches(value, get.descriptorReceiver()) || sourceFunctionPrototype(value, q.owner.checker)
	}
	// Effect admission can settle this exact write's receiver obligation before
	// reconstructing earlier statement completions. A matching receiver still
	// needs the original reachability/input/RHS owner. No value-selection ACK,
	// normal output or absence premise follows from this independent transfer.
	if beforeAdmission && (!publication.complete || publication.matches) {
		return nil, false
	}
	mergeAccessorCandidates(result, candidatePublisherPayload(part))
	ledger.stats.WriterInputPublications++
	progressPendingMemberDeclaration(q, member.Parent, "writer-input-published", ledger.stats)
	if publication.complete && publication.matches {
		publication.relativeRHS = q.writerIndependentConstruction(assignment.right, writer)
		if publication.relativeRHS == nil {
			return nil, false
		}
		relation.rhs = publication.relativeRHS // immutable source role, never a value/result
	}
	if !consumeWriterCapture(relation, publication) {
		return nil, false
	}
	var relative *sourceMemberWriterInput
	if publication.matches {
		// The original RHS visitor consumes the construction source. Every actual
		// formal is unknown, and there is no invented performed Call/creator.
		scope := acquiredCallableScope{bindings: make(sourceValueBindings)}
		for _, parameter := range writer.Parameters() {
			if symbol := q.owner.checker.GetSymbolAtLocation(parameter.Name()); symbol != nil {
				scope.bindings[ast.GetSymbolId(symbol)] = []sourceValue{{}}
			}
		}
		relative = &sourceMemberWriterInput{scope: scope, incomplete: true}
	}
	if relation.publication == 0 {
		relation.publication = 1 // source capture edge, never a cached matching verdict
		ledger.revision++
		ledger.stats.Revisions++
	}
	ledger.stats.WriterInputConsumed++
	ledger.stats.WriterInputScopesRetired++
	if beforeAdmission {
		ledger.stats.WriterAdmissionRetired++
		progressPendingMemberDeclaration(q, member.Parent, "writer-admission-retired", ledger.stats)
	}
	// Preserve independent Get/operation uncertainty. This is neither NoWrites
	// nor a performed replacement, and the original assignment still owns effects.
	result.opaque = result.opaque || publication.matches
	progressPendingMemberDeclaration(q, member.Parent, "writer-input-consumed", ledger.stats)
	return relative, true
}

// consumeWriterCapture accepts the complete receiver contribution into its
// owning relative obligation. The publication is current-use only. An unknown
// formal is not empty. Matching receivers also require the published relative
// construction role, whose original RHS visitor still owns all alternatives.
func consumeWriterCapture(relation *sourceWriterCapture, publication sourceWriterCapturePublication) bool {
	return relation != nil && relation.root != nil && publication.complete && (!publication.matches || publication.relativeRHS != nil && publication.relativeRHS == relation.rhs)
}

// writerGlobalCapture admits only readonly lexical aliases ending at the binder's
// genuine globalThis reference. Parameters, this, projections, mutable bindings,
// imported/factory captures and arbitrary initializer results stay unsupported.
// This is an input-dependence proof, not a current global value or identity proof.
func (q *sourceValueQuery) writerGlobalCapture(node, writer *ast.Node) (*ast.Node, []*ast.Node) {
	var aliases []*ast.Node
	var storage [8]*ast.Node
	seen := storage[:0]
	for {
		node = unwrapSourceCallableReference(node)
		if node == nil || !ast.IsIdentifier(node) {
			return nil, nil
		}
		for _, prior := range seen {
			if prior == node {
				return nil, nil
			}
		}
		seen = append(seen, node)
		q.recordEstimatedCost(1)
		symbol := q.owner.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return nil, nil
		}
		if symbol == q.owner.checker.GetGlobalSymbol("globalThis", ast.SymbolFlagsValue, nil) {
			return node, aliases
		}
		declaration := symbol.ValueDeclaration
		if symbol.Flags&ast.SymbolFlagsAlias != 0 || declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() == nil || q.owner.bindingWritten(symbol) {
			return nil, nil
		}
		if owner := enclosingCallableNode(declaration); owner != nil && owner != writer {
			return nil, nil
		}
		aliases = append(aliases, declaration)
		node = declaration.Initializer()
	}
}

// writerIndependentConstruction names a source construction whose constructor
// reference and empty input vector do not depend on writer formals or captures.
// It grants no instance, callable absence, normal output or creator identity.
// The original RHS consumer retains all constructor/member alternatives.
func (q *sourceValueQuery) writerIndependentConstruction(node, writer *ast.Node) *ast.Node {
	var storage [8]*ast.Node
	seen := storage[:0]
	for {
		node = unwrapSourceCallableReference(node)
		if node == nil {
			return nil
		}
		for _, prior := range seen {
			if prior == node {
				return nil
			}
		}
		seen = append(seen, node)
		if ast.IsNewExpression(node) {
			creation := node.AsNewExpression()
			if creation.Arguments != nil && len(creation.Arguments.Nodes) != 0 {
				return nil
			}
			root := unwrapSourceCallableReference(creation.Expression)
			if root == nil || !ast.IsIdentifier(root) {
				return nil
			}
			symbol := q.owner.checker.GetSymbolAtLocation(root)
			if symbol == nil {
				return nil
			}
			_, kind := q.nativeRootDeclaration(symbol.ValueDeclaration)
			if kind == sourceNativeWeakMapConstructor {
				return node
			}
			return nil
		}
		if !ast.IsIdentifier(node) {
			return nil
		}
		symbol := q.owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || q.owner.bindingWritten(symbol) {
			return nil
		}
		declaration := symbol.ValueDeclaration
		if owner := enclosingCallableNode(declaration); owner != nil && owner != writer {
			return nil
		}
		node = declaration.Initializer()
	}
}
