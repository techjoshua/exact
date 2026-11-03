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

// consumeSourceThenInputs binds the Await protocol's two defined but unknown
// arguments after the canonical Get has selected an authored then body. It
// retains captures and the actual receiver without claiming resolver identity,
// callback execution, Promise settlement or a successful output.
func (query *sourceValueQuery) consumeSourceThenInputs(operation, body *ast.Node, receiver sourceObservedValue, scope acquiredCallableScope, result *accessorCandidates) {
	value := receiver.value
	if !query.dependenciesOnly || operation == nil || query.reading != operation || !ast.IsAwaitExpression(operation) || body == nil || !ast.IsFunctionLike(body) || body.Body() == nil || receiver.inputs != nil || value.normal != nil || value.acquired != nil || value.native != nil || value.adapter != nil || value.bound != nil || value.awaited != nil || value.instance != nil || value.ownedGetRow != nil || value.entrySlot != nil || value.initializerUse != nil {
		result.opaque = true
		return
	}
	inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings, len(scope.bindings)+2), defaults: make(map[*ast.Node]sourceDefaultInput)}
	priorCreators := query.creators
	query.creators = scope.creators
	defer func() { query.creators = priorCreators }()
	for id, values := range scope.bindings {
		if !query.charge(result, operation) {
			return
		}
		inputs.bindings[id] = values
	}
	if !ast.IsArrowFunction(body) {
		inputs.bindings[0] = []sourceValue{value}
	}
	position := 0
	for _, parameter := range body.Parameters() {
		if !query.charge(result, parameter) {
			return
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		values := []sourceValue{{undefined: true}}
		rest := parameter.AsParameterDeclaration().DotDotDotToken != nil
		if rest {
			groups := make([][]sourceValue, 0)
			for i := position; i < 2; i++ {
				groups = append(groups, []sourceValue{{}})
			}
			values = []sourceValue{{node: parameter.Name(), rest: groups}}
		} else if position < 2 {
			values = []sourceValue{{}}
		}
		if position < 2 || rest {
			query.bindDefinedParameterInput(parameter, values, inputs, result)
		} else {
			query.installParameterInput(parameter, values, inputs, result)
		}
		position++
	}
	query.withSourceReceiverInputs(operation, body, inputs, result, func() {
		// Share ordinary async/generator category handling. Generator calls
		// initialize their parameters without executing the deferred body.
		query.consumeOrdinaryBody(operation, body, inputs.bindings, inputs, nil, result)
	})
}
