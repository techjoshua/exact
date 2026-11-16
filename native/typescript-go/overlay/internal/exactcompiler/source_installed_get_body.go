package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInstalledGetBody borrows one original SOURCE getter binder. It is not
// an invocation, normal Get lifetime or cached source-frame description.
type sourceInstalledGetBody struct {
	mutationRequired []sourceStagedOperationRequest
	mutationInputs   *sourceRelativeInputEdge // detached description issued at this real Get binder, never a Call
	issuer           *sourceValueQuery
	get              *sourceGetInputs
	inputs           *sourceValueInputs
	body             *ast.Node
	generation       *projectGeneration
	live             bool
}

// transferInstalledSourceGetter is called by executeGetEffects at the actual
// Get owner before its normal wrapper. It uses the existing zero-actual binder
// and SOURCE body owner, without beginNormalOperations or a synthetic Call.
// The initial domain is an authored zero-parameter getter declaration; other
// callback/normal variants retain their unchanged original owner.
func (q *sourceValueQuery) transferInstalledSourceGetter(body *ast.Node, get *sourceGetInputs, scope acquiredCallableScope, result *accessorCandidates) bool {
	if q == nil || result == nil || get == nil || body == nil || !ast.IsGetAccessorDeclaration(body) || body.Body() == nil || len(body.Parameters()) != 0 || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || get.ownedRequest != nil || !q.installedMemberSourceOwned(body, get.operation, q.effectOwner) {
		return false
	}
	if _, _, owned := q.installedSourceMemberReadOwner(get); !owned {
		return false
	}
	priorCreators := q.creators
	q.creators = scope.creators
	defer func() { q.creators = priorCreators }()
	inputs := q.bindGetInputs(body, get.operation, get.receiver, scope.bindings, result)
	if inputs == nil || inputs.declaration != body || inputs.invocation != nil || inputs.get == nil || inputs.get.operation != get.operation || inputs.operationLifetime != nil || inputs.storage != nil || inputs.population != nil {
		return false
	}
	prior := q.installedGetBody
	borrow := &sourceInstalledGetBody{issuer: q, get: get, inputs: inputs, body: body, generation: q.owner.generation, live: true}
	q.installedGetBody = borrow
	defer func() {
		borrow.live = false
		if q.installedGetBody == borrow {
			q.installedGetBody = prior
		}
		borrow.issuer, borrow.get, borrow.inputs, borrow.body = nil, nil, nil, nil
		borrow.mutationInputs = nil
		borrow.mutationRequired = nil
	}()
	// The selected native SOURCE owner can describe this already-bound getter's
	// actual zero-argument inputs. This lends no trap binding or BODY authority.
	if phase := q.installedMemberNativePhase; phase != nil && phase.mutationGetInputs != nil {
		borrow.mutationInputs = phase.mutationGetInputs(q, inputs, get)
	}
	result.retainCallableEffect(get.operation, body)
	q.consumeSourceBodyEffects(get.operation, body, inputs.bindings, inputs, nil, result)
	return true
}

// installedSourceGetterObservation runs at the existing body outcome publisher.
// It returns the borrowed original Get only while that real producer is live.
// The observation stays stack-only alongside the existing borrowed inputs.
func (q *sourceValueQuery) installedSourceGetterObservation(body, operation *ast.Node, inputs *sourceValueInputs) *sourceGetInputs {
	if q == nil || inputs == nil {
		return nil
	}
	b := q.installedGetBody
	if b == nil || !b.live || b.issuer != q || b.inputs != inputs || b.body != body || b.generation != q.owner.generation || b.get == nil || b.get.operation != operation || inputs.get == nil || inputs.get.operation != operation || inputs.invocation != nil || inputs.declaration != body || inputs.operationLifetime != nil || inputs.storage != nil || inputs.population != nil {
		return nil
	}
	if _, _, owned := q.installedSourceMemberReadOwner(b.get); !owned {
		return nil
	}
	return b.get
}
