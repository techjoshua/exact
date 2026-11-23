package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type preparedSetupCalls struct {
	fields map[sourceFieldDemand]*ast.Node
	calls  map[*ast.Node]*ast.Node
}

// preparedSetupCallsFor reads completed source descriptions within their
// original checker generation. Publication retains no execution work owner.
func (analysis callableAnalysis) preparedSetupCallsFor(source *ast.SourceFile, c *checker.Checker) preparedSetupCalls {
	if callableSourceProjectionCurrent(analysis, source) && analysis.owner.checker == c {
		return analysis.setupCalls
	}
	return preparedSetupCalls{}
}

// setupCallCandidates belongs to a single settled summary publication.
type setupCallCandidates struct {
	owner   *executableBodyOwner
	targets map[string]setupCallCandidate
}

type setupCallCandidate struct {
	helper, component *ast.Node
	fact              *callableFacts
	symbol            *ast.Symbol
	fields            []sourceFieldDemand
	blocked           bool
}

// collect records source Gets while the direct summary is being published.
func (c *setupCallCandidates) collect(fact *callableFacts, field *sourceFieldDemand) {
	if field == nil || field.operation == nil || field.declaration != fact.node || field.consumer != fact.node {
		return
	}
	helper := fact.node
	source := fact.sourceFile
	if source == nil || !callableSourceProjectionCurrent(callableAnalysis{owner: c.owner}, source) {
		return
	}
	component := enclosingCallableNode(helper)
	if _, owned := c.owner.values.components[component]; !owned ||
		!isScalarComponentPropGet(component, field, c.owner, c.owner.checker) {
		return
	}
	row := c.targets[fact.summary.ID]
	if row.blocked {
		return
	}
	if row.helper == nil {
		symbol := callableDeclarationSymbol(helper, c.owner.checker)
		if symbol == nil || len(symbol.Declarations) != 1 || c.owner.values.bindingWritten(symbol) ||
			ast.HasSyntacticModifier(helper, ast.ModifierFlagsAsync) ||
			ast.IsFunctionDeclaration(helper) && helper.AsFunctionDeclaration().AsteriskToken != nil ||
			ast.IsFunctionExpression(helper) && helper.AsFunctionExpression().AsteriskToken != nil {
			return
		}
		row = setupCallCandidate{fact: fact, helper: helper, component: component, symbol: symbol}
	} else if row.fact != fact {
		row.blocked = true
	}
	row.fields = append(row.fields, *field)
	if c.targets == nil {
		c.targets = make(map[string]setupCallCandidate)
	}
	c.targets[fact.summary.ID] = row
}

// prepare checks the final edge rows only when a candidate exists. The
// propagation reverse index schedules revisions and can miss late original
// Get dependencies. Summary paths can coalesce uses, so every ordinary edge
// must qualify before the component projection can remove a forwarded Get.
func (c *setupCallCandidates) prepare(facts []callableFacts) preparedSetupCalls {
	targets := c.targets
	if len(targets) == 0 {
		return preparedSetupCalls{}
	}

	type use struct {
		operation *ast.Node
		target    string
	}
	var uses []use
	for i := range facts {
		fact := &facts[i]
		var counts map[*ast.Node]int
		for _, edge := range fact.summary.Calls {
			target, found := targets[edge.TargetID]
			if !found || target.blocked {
				continue
			}
			if edge.componentReactiveProducer && fact.node == target.component {
				continue // Existing producer ownership is projected separately.
			}
			operation := fact.fieldEdgeOperations[edge.ID]
			if !edge.Resolved || edge.sourceUse != nil || fact.node != target.component ||
				operation == nil || !ast.IsCallExpression(operation) ||
				enclosingCallableNode(operation) != target.component || !setupCallConsumesSynchronousResult(operation) {
				target.blocked = true
				targets[edge.TargetID] = target
				continue
			}
			if counts == nil {
				counts = make(map[*ast.Node]int)
				for _, alternative := range fact.summary.Calls {
					site := alternative.sourceUse
					if site == nil {
						site = fact.fieldEdgeOperations[alternative.ID]
					}
					if site != nil {
						counts[site]++
					}
				}
			}
			if counts[operation] == 1 {
				callee := unwrapSourceCallableReference(operation.Expression())
				if callee != nil && ast.IsIdentifier(callee) && c.owner.checker.GetSymbolAtLocation(callee) == target.symbol {
					uses = append(uses, use{operation, edge.TargetID})
					continue
				}
			}
			target.blocked = true
			targets[edge.TargetID] = target
		}
	}

	var prepared preparedSetupCalls
	for _, use := range uses {
		target := targets[use.target]
		if target.blocked {
			continue
		}
		if prepared.calls == nil {
			prepared.calls = make(map[*ast.Node]*ast.Node)
			prepared.fields = make(map[sourceFieldDemand]*ast.Node)
		}
		prepared.calls[use.operation] = target.helper
		if target.fields != nil {
			for _, field := range target.fields {
				prepared.fields[field] = target.component
			}
			target.fields = nil
			targets[use.target] = target
		}
	}
	return prepared
}

func (prepared preparedSetupCalls) covers(component *ast.Node, effect EnvironmentEffectSource) bool {
	return effect.fieldOrigin != nil && effect.Environment == "unknown" && effect.Opaque &&
		effect.provenanceIncomplete && prepared.fields[*effect.fieldOrigin] == component
}

// project retains effects of argument evaluation, getters and
// other ordinary work. Only the original helper Get on this edge is projected.
func (prepared preparedSetupCalls) project(effects callableCallEffects, component, operation *ast.Node) callableCallEffects {
	helper := prepared.calls[operation]
	if helper == nil || effects.Effect != "unknown" {
		return effects
	}
	var retained []EnvironmentEffectSource
	for i, effect := range effects.EffectSources {
		if effect.fieldOrigin != nil && effect.fieldOrigin.declaration == helper && effect.fieldForwarded &&
			!effect.componentReactiveField && prepared.covers(component, effect) {
			if retained == nil {
				retained = make([]EnvironmentEffectSource, 0, len(effects.EffectSources)-1)
				retained = append(retained, effects.EffectSources[:i]...)
			}
		} else if retained != nil {
			retained = append(retained, effect)
		}
	}
	if retained != nil {
		effects.Effect, effects.EffectSources = environmentEffectFor(retained), retained
		return effects
	}
	return effects
}

// orderedSetupDescriptorCall relates a known descriptor Get to the direct,
// synchronous setup helper that owns it. The selected local definition and
// existing write index preserve lexical identity. The decision grants no
// invocation or binder authority.
func orderedSetupDescriptorCall(call *ast.Node, component *ast.Node, target *callableFacts, symbol *ast.Symbol, owner *executableBodyOwner) bool {
	if !target.orderedSetupDescriptor || owner == nil || owner.values == nil ||
		call.AsCallExpression().QuestionDotToken != nil || !ast.IsIdentifier(call.Expression()) ||
		!ast.IsFunctionDeclaration(target.node) || enclosingCallableNode(target.node) != component ||
		enclosingCallableNode(call) != component || !envelopeSynchronousFunction(target.node) {
		return false
	}
	source := ast.GetSourceFileOfNode(call)
	if !callableSourceProjectionCurrent(callableAnalysis{owner: owner}, source) {
		return false
	}
	if symbol == nil {
		symbol = owner.checker.GetSymbolAtLocation(call.Expression())
	}
	if symbol == nil || symbol.ValueDeclaration != target.node || len(symbol.Declarations) != 1 {
		return false
	}
	// Only eligibility introduced by this conversion keeps the call in setup.
	// Independent sources continue through the existing task classification.
	if len(componentStateEffects(target.summary.StateWrites)) != 0 || len(target.summary.Contexts) != 0 {
		return false
	}
	for _, effect := range target.summary.EffectSources {
		if !effect.orderedSetupDescriptor {
			switch effect.Environment {
			case "browser", "server", "unknown":
				return false
			}
		}
	}
	index := owner.values.index(source)
	return !index.incomplete && !index.normalDynamicScope && len(index.bindings[ast.GetSymbolId(symbol)]) == 0
}
