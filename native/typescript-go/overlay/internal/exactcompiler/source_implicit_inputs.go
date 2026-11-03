package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceReceiverInputs is a synchronous borrow issued by a selected source
// operation's input owner. Operation syntax is descriptive data, not activation
// identity. The exact issuer and input pointers prevent copied queries or inputs
// from inheriting the association. Revocation runs on nested and panic exits.
// This permits receiver write mapping only, never normal or descriptor proof.
type sourceReceiverInputs struct {
	owner           *sourceValueQuery
	inputs          *sourceValueInputs
	issuer          *sourceReceiverInputs
	body, operation *ast.Node
	live            bool
}

func (query *sourceValueQuery) sourceReceiverInputsLive(inputs *sourceValueInputs, body *ast.Node) bool {
	if !query.dependenciesOnly || inputs == nil || query.inputs != inputs || inputs.declaration != body {
		return false
	}
	stamp := query.sourceReceiver
	return stamp != nil && stamp.issuer == stamp && stamp.live && stamp.owner == query && stamp.inputs == inputs && stamp.body == body && stamp.operation != nil
}

// withSourceReceiverInputs lends a source operation's already bound receiver
// only while its selected body is consumed. It neither supplies bindings nor
// enters a normal operation lifetime. Prior borrows and inputs survive nesting.
func (query *sourceValueQuery) withSourceReceiverInputs(operation, body *ast.Node, inputs *sourceValueInputs, result *accessorCandidates, consume func()) {
	if !query.dependenciesOnly || operation == nil || body == nil || inputs == nil || inputs.declaration != body || inputs.population != nil || inputs.operationLifetime != nil || inputs.get != nil || inputs.invocation != nil || inputs.implicit != nil {
		result.opaque = true
		return
	}
	priorInputs, priorStamp := query.inputs, query.sourceReceiver
	stamp := sourceReceiverInputs{owner: query, inputs: inputs, body: body, operation: operation, live: true}
	stamp.issuer = &stamp
	query.inputs, query.sourceReceiver = inputs, &stamp
	defer func() {
		stamp = sourceReceiverInputs{}
		query.sourceReceiver = priorStamp
		query.inputs = priorInputs
	}()
	consume()
}
