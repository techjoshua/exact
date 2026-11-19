package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strconv"
	"unsafe"
)

// A component demand is immutable declaration-relative evidence. It certifies
// neither a supplied value nor successful delivery and retains no live frame.
type sourceComponentInputDemand struct {
	field     sourceFieldDemand
	member    *ast.Node
	authority sourceDescriptorEffectAuthority
}

// A literal input recipe composes one source delivery with a declaration demand.
// It is not an actual invocation receipt and never enters ordinary fieldCalls.
type sourceComponentInputAdoption struct {
	demand              sourceComponentInputDemand
	site, target, input *ast.Node
	edge                string
}

// namedJSXStringInput is the ordinary lowering producer's exact literal rule.
func namedJSXStringInput(node *ast.Node) (string, bool) {
	if node == nil || !ast.IsJsxAttribute(node) {
		return "", false
	}
	value := node.AsJsxAttribute().Initializer
	if value == nil || !ast.IsStringLiteral(value) {
		return "", false
	}
	return value.AsStringLiteral().Text, true
}

func (query *sourceValueQuery) retainComponentInputDemand(member *ast.Node, parent, child *sourceNormalOperation, observed sourceResultObservation, result *accessorCandidates) bool {
	inputs := query.inputs
	if inputs == nil || inputs.ownedFact == nil || child == nil || child.state != sourceOperationConsumed || child.population != parent.population || child.entry == nil || !child.entry.once || child.entry.structural || child.entry.region != inputs.declaration || len(observed.values) != 1 {
		return false
	}
	receiver, key := accessorReceiver(child.entry.node)
	field, symbol := query.fieldDemand(child.entry.node, receiver, key)
	if field.declaration != inputs.declaration || field.slot == nil || !ast.IsParameterDeclaration(field.slot) || symbol == nil || symbol.ValueDeclaration != field.slot || field.slot.AsParameterDeclaration().QuestionToken != nil {
		return false
	}
	name := componentPropsParameterIdentifier(field.declaration)
	if name == nil || query.owner.checker.GetSymbolAtLocation(name) != symbol || query.owner.bindingWritten(symbol) {
		return false
	}
	genuine := false
	for _, candidate := range componentCandidates(ast.GetSourceFileOfNode(member)) {
		genuine = genuine || candidate.node == field.declaration
	}
	if !genuine {
		return false
	}
	value := observed.values[0]
	if value.inputs != inputs || value.value.node != receiver || len(value.value.path) != 1 || value.value.path[0] != key || value.value.acquired != nil || value.value.instance != nil || value.value.native != nil {
		return false
	}
	return query.publishComponentInputDemand(inputs.ownedFact, field, member, result)
}

// retainComponentPropKey connects the receiver's existing unresolved prop read
// to one checked lifecycle call. Only an individual JSX delivery can cover it.
func (query *sourceValueQuery) retainComponentPropKey(fact *callableFacts, key *ast.Node, result *accessorCandidates) {
	if len(result.fieldFallbacks) == 0 || key.Parent == nil || !ast.IsElementAccessExpression(key.Parent) || key.Parent.AsElementAccessExpression().ArgumentExpression != key {
		return
	}
	member := key.Parent
	if _, selected := query.owner.components[fact.node]; !selected || !ordinaryComponentLifecycleCall(normalCalleeGetOwner(member), query.owner.checker, query.executable) {
		return
	}
	_, receiver, direct := directPropsRead(key)
	if !direct || checkedNonliteralComponentProtocolGet(member, query.owner.checker) == nil {
		return
	}
	props := componentPropsSymbol(fact.node, query.owner.checker)
	if props == nil || props != query.owner.checker.GetSymbolAtLocation(receiver) || query.owner.bindingWritten(props) {
		return
	}
	for _, field := range result.fieldFallbacks {
		if field.declaration == fact.node && field.operation == key && field.slot == props.ValueDeclaration && ast.IsParameterDeclaration(field.slot) && field.slot.AsParameterDeclaration().QuestionToken == nil {
			query.publishComponentInputDemand(fact, field, member, result)
		}
	}
}

// publishComponentInputDemand preserves only the original declaration and generation.
func (query *sourceValueQuery) publishComponentInputDemand(fact *callableFacts, field sourceFieldDemand, member *ast.Node, result *accessorCandidates) bool {
	row := sourceComponentInputDemand{field: field, member: member, authority: query.descriptorEffectAuthority(member)}
	row.authority.prefixMode = fact.descriptorMode
	if !row.authority.live() || !query.descriptorEffectAllocation(len(fact.componentInputDemands)+1, unsafe.Sizeof(row), result, member) {
		return false
	}
	for _, old := range fact.componentInputDemands {
		if old == row {
			return true
		}
	}
	fact.componentInputDemands = append(fact.componentInputDemands, row)
	return true
}

func (query *sourceValueQuery) hasComponentInputDemand(member *ast.Node) bool {
	if query.inputs == nil || query.inputs.ownedFact == nil {
		return false
	}
	for _, row := range query.inputs.ownedFact.componentInputDemands {
		if row.member == member && row.field.declaration == query.inputs.declaration && row.authority.live() && row.authority.program == query.owner.program && row.authority.checker == query.owner.checker && row.authority.prefixMode == query.inputs.ownedFact.descriptorMode {
			return true
		}
	}
	return false
}

func componentInputDemandsFor(fact *callableFacts, owner *executableBodyOwner) []sourceComponentInputDemand {
	node := fact.node
	rows := []sourceComponentInputDemand{}
	for _, row := range fact.componentInputDemands {
		if row.field.declaration == node && row.authority.valid() && owner != nil && owner.values != nil && row.authority.program == owner.values.program && row.authority.checker == owner.values.checker && row.authority.source == ast.GetSourceFileOfNode(node) && row.authority.prefixMode == fact.descriptorMode {
			rows = append(rows, row)
		}
	}
	return rows
}

// Only the private body projection removes its exact own input obligations.
// Public component and ordinary callable summaries are never rewritten here.
func componentInputBodyPlacement(record projectComponent, matches []*callableFacts) string {
	if len(record.inputDemands) == 0 || record.component.Placement != "unknown" || len(record.component.RenderEdges) != 0 {
		return ""
	}
	for _, fact := range matches {
		retained := []EnvironmentEffectSource{}
		for _, effect := range fact.summary.EffectSources {
			matched := false
			for _, row := range record.inputDemands {
				matched = matched || row.authority.valid() && effect.fieldOrigin != nil && !effect.fieldForwarded && *effect.fieldOrigin == row.field && effect.Environment == "unknown" && effect.Opaque && effect.provenanceIncomplete
			}
			if !matched {
				retained = append(retained, effect)
			}
		}
		if environmentEffectFor(retained) == "neutral" {
			return "isomorphic"
		}
	}
	return ""
}

// The same resolved target used by the render linker selects the recipe. Only
// an explicit named literal with no spread/override/operand is admitted initially.
// componentInputLiteralRecipe authenticates the complete source recipe at both
// issuance and adoption. Source membership alone cannot bind an input to its site.
func componentInputLiteralRecipe(site, input, target *ast.Node, demand sourceComponentInputDemand, c *checker.Checker) bool {
	if site == nil || input == nil || target == nil || c == nil || site.Attributes() == nil {
		return false
	}
	tag := jsxTagNode(site)
	if tag == nil {
		return false
	}
	selected := resolvedCallableSymbol(c.GetSymbolAtLocation(jsxTagSymbolNode(tag)), c)
	if selected == nil || selected != resolvedCallableSymbol(callableDeclarationSymbol(target, c), c) {
		return false
	}
	properties := site.Attributes().AsJsxAttributes().Properties.Nodes
	if len(properties) != 1 || properties[0] != input {
		return false
	}
	literal, known := namedJSXStringInput(input)
	if !known {
		return false
	}
	operation, _, dynamic := checkedComponentProtocolMember(demand.member, c)
	return !dynamic && jsxAttributeText(input.AsJsxAttribute().Name()) == demand.field.key && literal == operation
}

func attachComponentInputAdoptions(project *projectState, records []projectComponent, c *checker.Checker) {
	for _, record := range records {
		links := project.componentLinks[record.candidate.node]
		links.demands = append([]sourceComponentInputDemand(nil), record.inputDemands...)
		project.componentLinks[record.candidate.node] = links
	}
	for _, record := range records {
		links := project.componentLinks[record.candidate.node]
		links.inputs = nil
		walkNode(record.candidate.node, func(site *ast.Node) bool {
			tag := jsxTagNode(site)
			if tag == nil {
				return true
			}
			symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(jsxTagSymbolNode(tag)), c)
			for _, target := range records {
				if target.conditionalInputPlacement == "" || symbol == nil || symbol != resolvedCallableSymbol(callableDeclarationSymbol(target.candidate.node, c), c) {
					continue
				}
				opening := site
				if opening == nil || opening.Attributes() == nil {
					continue
				}
				properties := opening.Attributes().AsJsxAttributes().Properties.Nodes
				if len(properties) != 1 {
					continue
				}
				input := properties[0]
				_, ok := namedJSXStringInput(input)
				if !ok {
					continue
				}
				for _, edge := range links.edges {
					if edge.ComponentID != target.component.ID || edge.Path != strconv.Itoa(site.Pos()) {
						continue
					}
					for _, demand := range target.inputDemands {
						if demand.authority.valid() && componentInputLiteralRecipe(site, input, target.candidate.node, demand, c) {
							links.inputs = append(links.inputs, sourceComponentInputAdoption{demand: demand, site: site, target: target.candidate.node, input: input, edge: edge.ID})
						}
					}
				}
			}
			return true
		})
		project.componentLinks[record.candidate.node] = links
	}
}

func componentInputEdgeAdopted(project *projectState, record projectComponent, edge RenderEdge) bool {
	if project == nil {
		return false
	}
	rows := project.componentLinks[record.candidate.node].inputs
	found := false
	for _, row := range rows {
		if row.edge != edge.ID {
			continue
		}
		if !row.demand.authority.valid() || row.demand.field.declaration != row.target || row.site == nil || edge.Path != strconv.Itoa(row.site.Pos()) {
			return false
		}
		// Historical readability is not current-project adoption authority.
		// Match the retained source fact and read-only indexes owned by this
		// exact Program/checker. Never renew a disposed namespace or rebuild
		// a missing index while consuming an immutable delivery recipe.
		authority := row.demand.authority
		cache := project.callableCache
		if project.abandoned || project.program == nil || authority.program != project.program || !cache.ownsGeneration(project.program, authority.checker) || cache.owner.values.program != project.program || cache.owner.values.checker != authority.checker {
			return false
		}
		if generation := project.activeGeneration; generation != nil && (!generation.active || generation.project != project || generation.program != project.program || generation.checker != authority.checker) {
			return false
		}
		targetSource := ast.GetSourceFileOfNode(row.target)
		parentSource := ast.GetSourceFileOfNode(record.candidate.node)
		if targetSource == nil || parentSource == nil || targetSource != authority.source || project.program.GetSourceFile(targetSource.FileName()) != targetSource || project.program.GetSourceFile(parentSource.FileName()) != parentSource || ast.GetSourceFileOfNode(row.site) != parentSource || ast.GetSourceFileOfNode(row.input) != parentSource {
			return false
		}
		if !componentInputLiteralRecipe(row.site, row.input, row.target, row.demand, authority.checker) {
			return false
		}
		targetIndex, targetIndexed := cache.owner.values.indexes[targetSource]
		parentIndex, parentIndexed := cache.owner.values.indexes[parentSource]
		field := targetIndex.normalOccurrences[row.demand.field.operation]
		member := targetIndex.normalOccurrences[row.demand.member]
		site := parentIndex.normalOccurrences[row.site]
		if !targetIndexed || !parentIndexed || field == nil || field.node != row.demand.field.operation || field.region != row.target || !field.once || member == nil || member.node != row.demand.member || site == nil || site.node != row.site {
			return false
		}
		targetAnalysis, targetKnown := cache.bySource[targetSource]
		_, parentKnown := cache.bySource[parentSource]
		if !targetKnown || !parentKnown {
			return false
		}
		currentFact := false
		for _, fact := range targetAnalysis.facts {
			if fact.node != row.target || fact.sourceFile != targetSource || fact.descriptorMode != authority.prefixMode {
				continue
			}
			for _, demand := range fact.componentInputDemands {
				currentFact = currentFact || demand == row.demand
			}
		}
		if !currentFact {
			return false
		}
		issued := false
		for _, demand := range project.componentLinks[row.target].demands {
			issued = issued || demand == row.demand
		}
		if !issued {
			return false
		}
		found = true
	}
	return found
}

func applyComponentInputAdoptions(project *projectState, records []projectComponent) {
	for i := range records {
		for j := range records[i].component.RenderEdges {
			edge := &records[i].component.RenderEdges[j]
			if !componentInputEdgeAdopted(project, records[i], *edge) {
				continue
			}
			for _, target := range records {
				if edge.ComponentID != target.component.ID || len(target.inputDemands) == 0 {
					continue
				}
				complete := true
				for _, demand := range target.inputDemands {
					matched := false
					for _, row := range project.componentLinks[records[i].candidate.node].inputs {
						matched = matched || row.edge == edge.ID && row.target == target.candidate.node && row.demand == demand
					}
					complete = complete && matched
				}
				if complete {
					edge.Placement = target.conditionalInputPlacement
					edge.Boundary = edge.Placement
				}
			}
		}
	}
}
