package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Tokens identify one construction or alternative, without retaining installed
// frames, bindings, operation maps or a capability to replay an invocation.
type sourceNormalViewIdentity struct{ identity byte }
type sourceWriteOperationIdentity struct{ identity byte }
type sourceNormalSourceIdentity struct {
	plan       sourceValueSummary
	dataGets   []sourceCompletedDataGet
	source     *ast.SourceFile
	population *sourceNormalPopulation
	domains    map[*ast.Node]*sourceNormalPopulation
	cyclic     bool
}
type sourceWriteAlternative struct {
	declaration *ast.Node
	eligible    bool
}
type sourceWriteBody struct {
	alternative *sourceWriteAlternative
	verdict     sourceWriteVerdict
}
type sourceCompletedWriteOutcome struct {
	view              *sourceNormalViewIdentity
	source            *sourceNormalSourceIdentity
	root, effectOwner *ast.Node
	entry             *sourceNormalOccurrence
	population        *sourceNormalPopulation
	operation         *sourceWriteOperationIdentity
	verdict           sourceWriteVerdict
}

func (query *sourceValueQuery) prepareWriteAlternatives(slot *sourceNormalOperation, node *ast.Node, selected sourcePreparedInvocation, result *accessorCandidates) {
	if slot == nil || slot.entry == nil || !slot.entry.once || slot.population == nil || query.inputs == nil {
		return
	}
	slot.writeCallee = query.inputs.writeComponents[node.AsCallExpression().Expression]
	// Routing alone supplies no body purity. Adapter populations additionally
	// require this actual callee Get's independent NoWrites component below.
	if selected.base.opaque || selected.acquired.opaque || selected.acquired.valueIncomplete || selected.acquired.receiverIncomplete {
		return
	}
	declarations := selected.declarations
	if len(selected.acquired.ordinaryBodies) > 0 {
		declaration := query.ordinaryAdapterWriteDeclaration(slot, node, selected, result)
		if declaration == nil {
			return
		}
		declarations = []*ast.Node{declaration}
	} else if !selected.base.selected && selected.acquired.sourceCallable {
		declarations = nil
		for _, value := range selected.acquired.values {
			if !query.charge(result, value.node) {
				return
			}
			if value.node == nil || len(value.path) != 0 || value.native != nil || value.adapter != nil || value.bound != nil {
				return
			}
			declarations = append(declarations, value.node)
		}
	}
	if len(declarations) == 0 {
		return
	}
	for _, declaration := range declarations {
		if !query.charge(result, declaration) {
			return
		}
		if ast.IsVariableDeclaration(declaration) {
			declaration = declaration.Initializer()
		}
		alternative := &sourceWriteAlternative{declaration: declaration}
		if declaration != nil && (ast.IsArrowFunction(declaration) || ast.IsFunctionExpression(declaration) || ast.IsFunctionDeclaration(declaration)) {
			async, ordinary := ordinaryResultCategory(declaration)
			alternative.eligible = ordinary && !async && declaration.Body() != nil
			for _, parameter := range declaration.Parameters() {
				if !query.charge(result, parameter) {
					alternative.eligible = false
					break
				}
				alternative.eligible = alternative.eligible && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() != "this" && parameter.Initializer() == nil && parameter.AsParameterDeclaration().DotDotDotToken == nil
			}
		}
		slot.writeAlternatives = append(slot.writeAlternatives, alternative)
	}
	slot.writePopulationComplete = len(slot.writeAlternatives) == len(declarations)
}

// ordinaryAdapterWriteDeclaration enrolls one actual source body, not an
// intrinsic by spelling. The live completed Get and complete output population
// authenticate routing. Its body must still produce its own write verdict.
// Bound construction and ambiguous/mixed populations remain Top.
func (query *sourceValueQuery) ordinaryAdapterWriteDeclaration(slot *sourceNormalOperation, node *ast.Node, selected sourcePreparedInvocation, result *accessorCandidates) *ast.Node {
	if slot.writeCallee != sourceWriteNoWrites || selected.base.selected || len(selected.acquired.ordinaryBodies) != 1 || len(selected.acquired.values) == 0 {
		return nil
	}
	body := selected.acquired.ordinaryBodies[0]
	if body.invocation != node || body.binding != nil || len(body.actuals) != 0 {
		return nil
	}
	_, method := restrictedInvocationMember(node.AsCallExpression().Expression, query.owner.checker)
	if method != "call" && method != "apply" {
		return nil
	}
	var original *sourceOrdinaryAdapter
	for _, value := range selected.acquired.values {
		if !query.charge(result, node) {
			return nil
		}
		header := value.adapter
		if header == nil || header.frame != query.inputs || header.operation != node.AsCallExpression().Expression || header.body.invocation != node || header.body.declaration != body.declaration || header.body.binding != nil || len(value.path) != 0 || value.native != nil || value.bound != nil {
			return nil
		}
		if original != nil && original != header {
			return nil
		}
		original = header
	}
	get := query.normalOperation(original.operation, false)
	if get == nil || get.state != sourceOperationConsumed || get.output.incomplete || !get.authority.valid(query) {
		return nil
	}
	return body.declaration
}

func (query *sourceValueQuery) selectedWriteAlternative(slot *sourceNormalOperation, body *ast.Node, result *accessorCandidates) *sourceWriteAlternative {
	if slot == nil || !slot.writePopulationComplete {
		return nil
	}
	var selected *sourceWriteAlternative
	for _, alternative := range slot.writeAlternatives {
		if !query.charge(result, body) {
			return nil
		}
		if alternative.declaration != body {
			continue
		}
		if selected != nil {
			return nil
		}
		selected = alternative
	}
	if selected == nil || !selected.eligible {
		return nil
	}
	return selected
}

// finishWriteOutcome requires the complete operand and selected-alternative
// population. Repeated copies deduplicate by issued identity, never by row count.
func (query *sourceValueQuery) finishWriteOutcome(node *ast.Node, complete bool, result *accessorCandidates) {
	slot := query.normalOperation(node, false)
	if slot == nil || slot.writeIdentity == nil {
		return
	}
	slot.writeEffect = sourceWriteTop
	if !query.charge(result, node) || !complete || !slot.writePopulationComplete || slot.writeCallee != sourceWriteNoWrites || result.opaque {
		return
	}
	if query.invocationValueConsumed(node, result) && !query.completedScalarCallOutput(node, slot, result) {
		return
	}
	arguments := node.AsCallExpression().Arguments
	expected := 0
	if arguments != nil {
		expected = len(arguments.Nodes)
	}
	if len(slot.actuals) != expected {
		return
	}
	for ordinal, actual := range slot.actuals {
		if !query.charge(result, actual.node) || actual.node != arguments.Nodes[ordinal] || actual.footprint != sourceWriteNoWrites {
			return
		}
	}
	if !query.writeBodiesComplete(slot.writeAlternatives, result.writeBodies, result, node) {
		return
	}
	if len(slot.writeAlternatives) == 0 {
		return
	}
	slot.writeEffect = sourceWriteNoWrites
	v := query.propertyView()
	if v == nil || v.normalIdentity == nil || slot.population == nil || slot.entry == nil {
		return
	}
	source := v.normalSources[ast.GetSourceFileOfNode(node)]
	if source == nil || source.cyclic || source.domains[query.inputs.declaration] != slot.population {
		return
	}
	outcome := sourceCompletedWriteOutcome{view: v.normalIdentity, source: source, root: query.inputs.declaration, effectOwner: slot.entry.statement, entry: slot.entry, population: slot.population, operation: slot.writeIdentity, verdict: sourceWriteNoWrites}
	result.writeOutcomes = append(result.writeOutcomes, outcome)
}

// completedScalarCallOutput permits observation of a synchronous primitive
// result already produced by every enrolled body. This neither enters a body
// nor derives purity from its declared return type. Body and argument NoWrites
// obligations remain separate requirements in finishWriteOutcome.
func (query *sourceValueQuery) completedScalarCallOutput(node *ast.Node, slot *sourceNormalOperation, result *accessorCandidates) bool {
	for _, alternative := range slot.writeAlternatives {
		found := false
		for _, receipt := range result.normalCalls {
			if !query.charge(result, node) {
				return false
			}
			if receipt.operation != node || receipt.declaration != alternative.declaration || receipt.frame != query.inputs {
				continue
			}
			if !receipt.entered || receipt.async || receipt.raw.effects != sourceEffectsAccounted || receipt.raw.incomplete || len(receipt.raw.values) == 0 {
				return false
			}
			for _, observed := range receipt.raw.values {
				if !query.charge(result, node) {
					return false
				}
				value := observed.value
				if len(value.path) != 0 || value.native != nil || value.normal != nil || value.bound != nil || value.adapter != nil || value.rest != nil {
					return false
				}
				if value.undefined {
					if value.node != nil && (!ast.IsIdentifier(value.node) || !query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(value.node))) {
						return false
					}
				} else if !sourcePrimitiveValue(value.node) {
					return false
				}
			}
			found = true
		}
		if !found {
			return false
		}
	}
	return len(slot.writeAlternatives) != 0
}

func (query *sourceValueQuery) completedInvocationExcluded(node *ast.Node, result *accessorCandidates) bool {
	v := query.propertyView()
	if v == nil || v.normalIdentity == nil || v.incomplete || (!v.produced && !v.producing) {
		return false
	}
	source := v.normalSources[ast.GetSourceFileOfNode(node)]
	if source == nil || source.source != ast.GetSourceFileOfNode(node) || source.cyclic || source.population == nil || source.population.root != source.source.AsNode() {
		return false
	}
	entry := source.population.entries[node]
	if entry == nil || source.population.moduleEntry(node, entry.statement) == nil {
		return false
	}
	var identity *sourceWriteOperationIdentity
	for _, outcome := range v.writeOutcomes {
		if !query.charge(result, node) {
			return false
		}
		if outcome.entry != entry {
			continue
		}
		if outcome.view != v.normalIdentity || outcome.source != source || (outcome.root != source.source.AsNode() && outcome.root != v.root) || outcome.population == nil || source.domains[outcome.root] != outcome.population || outcome.population.entries[node] != entry || outcome.effectOwner != entry.statement || outcome.operation == nil || outcome.verdict != sourceWriteNoWrites {
			return false
		}
		if identity != nil && identity != outcome.operation {
			return false
		}
		identity = outcome.operation
	}
	return identity != nil
}

// writeBodiesComplete joins issued alternatives, keeping duplicate copies from
// paying for another alternative and treating conflicting copies as Top.
func (query *sourceValueQuery) writeBodiesComplete(alternatives []*sourceWriteAlternative, bodies []sourceWriteBody, result *accessorCandidates, node *ast.Node) bool {
	if len(alternatives) == 0 {
		return false
	}
	for _, alternative := range alternatives {
		if !query.charge(result, node) || alternative == nil || !alternative.eligible {
			return false
		}
		found := false
		for _, body := range bodies {
			if !query.charge(result, node) {
				return false
			}
			if body.alternative != alternative {
				continue
			}
			if body.verdict != sourceWriteNoWrites {
				return false
			}
			found = true
		}
		if !found {
			return false
		}
	}
	return true
}

// constructedModuleCall identifies the indexed population governed by this
// view's new outcome path. Its missing Q cannot fall through to the legacy
// empty-region shortcut, which supplies no component or category coverage.
func (query *sourceValueQuery) constructedModuleCall(node *ast.Node) bool {
	view := query.propertyView()
	if view == nil || !view.normalSelectionDone {
		return false
	}
	source := view.normalSources[ast.GetSourceFileOfNode(node)]
	if source == nil || source.population == nil {
		return false
	}
	entry := source.population.entries[node]
	return entry != nil && entry.node == node && entry.region == nil
}
