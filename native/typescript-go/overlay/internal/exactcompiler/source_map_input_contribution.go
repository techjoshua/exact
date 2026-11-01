package exactcompiler

import (
	"crypto/sha256"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

const sourceMapInputMode = "map-item-may-v1"

type sourceMapInputDomain uint8

const (
	sourceMapInputOpen sourceMapInputDomain = iota
	sourceMapInputClosed
	sourceMapInputNoItems
)

// sourceMapInputContribution is a published MAY-input domain, not a callback
// invocation or Get receipt. No frame, query, scope or checker lease survives.
type sourceMapInputContribution struct {
	owner, operation, collection *ast.Node
	occurrence                   *sourceNormalOccurrence
	source                       *ast.SourceFile
	program                      *compiler.Program
	checker                      *checker.Checker
	namespace                    *languageOwner
	generation                   uint64
	mode                         string
	sourceDigest                 [32]byte
	analysisMode                 [32]byte
	domain                       sourceMapInputDomain
	reason                       string
	futureReadonly               bool
	items                        []sourceMapItemAlternative
	roles                        []sourceMapInputRole
	published                    bool
	publication                  *sourceMapInputContribution
}
type sourceMapItemAlternative struct {
	origin      *ast.Node
	descriptors []*ast.Node
}
type sourceMapInputRole struct {
	ordinal           int
	edge              string
	target, parameter *ast.Node
	demands           []sourceFieldDemand
}

// observeMapInput uses the original analysis argument observation, before the
// normal Call releases its actual vector. This mints no runtime Call authority.
func (query *sourceValueQuery) observeMapInput(call *ast.Node, slot *sourceNormalOperation, observed sourceResultObservation) {
	if query.inputs == nil || query.inputs.ownedFact == nil || slot == nil || query.operation == nil || query.operation.node != call || query.operation.inputs != query.inputs || slot.population != query.inputs.population || slot.entry == nil || !slot.authority.valid(query) || !ast.IsCallExpression(call) {
		return
	}
	expression := call.AsCallExpression().Expression
	name, member, dynamic := checkedComponentProtocolMember(expression, query.owner.checker)
	if !member || dynamic || name != "map" || !componentProtocolReceiverOwned(expression, query.owner.checker) || !portableDeclaredMethod(nativeReceiverMemberSymbol(expression, query.owner.checker)) {
		return
	}
	args := call.AsCallExpression().Arguments
	if args == nil || len(args.Nodes) < 3 {
		return
	}
	fact := query.inputs.ownedFact
	for _, old := range fact.mapInputs {
		if old.operation == call {
			return
		}
	}
	source := ast.GetSourceFileOfNode(call)
	c := &sourceMapInputContribution{owner: fact.node, operation: call, collection: args.Nodes[0], occurrence: slot.entry, source: source, program: query.owner.program, checker: query.owner.checker, namespace: query.owner.language, analysisMode: fact.descriptorMode, mode: sourceMapInputMode, domain: sourceMapInputOpen, reason: "collection observation incomplete"}
	if source != nil {
		c.sourceDigest = sha256.Sum256([]byte(source.Text()))
	}
	if c.namespace != nil {
		c.generation = c.namespace.generation
	}
	if len(observed.values) > 0 {
		if !observed.incomplete {
			c.reason = "iterator domain not covered by retained analysis input"
		}
		c.futureReadonly = true
		for _, value := range observed.values {
			origin := value.value.node
			if origin == nil || len(value.value.path) != 0 || !ast.IsArrayLiteralExpression(origin) {
				c.reason = "collection has an unknown/nonliteral alternative"
				c.futureReadonly = false
				continue
			}
			for _, element := range origin.AsArrayLiteralExpression().Elements.Nodes {
				if !ast.IsObjectLiteralExpression(element) {
					c.reason = "item has an unknown/nonliteral alternative"
					continue
				}
				c.items = append(c.items, sourceMapItemAlternative{origin: element, descriptors: append([]*ast.Node(nil), element.AsObjectLiteralExpression().Properties.Nodes...)})
			}
			c.futureReadonly = query.mapInputReadonlyUses(c, origin) && c.futureReadonly
		}
	}
	// Even a closed future-use inventory cannot certify the inherited iterator.
	// The existing normal input observation has no such effect-domain proof.
	fact.mapInputs = append(fact.mapInputs, c)
}

// mapInputReadonlyUses checks only a finite observation-only source domain.
// It never turns const, an initial empty list or a source prefix into a freeze.
func (query *sourceValueQuery) mapInputReadonlyUses(c *sourceMapInputContribution, origin *ast.Node) bool {
	if !ast.IsIdentifier(c.collection) || origin.Parent == nil || !ast.IsVariableDeclaration(origin.Parent) || origin.Parent.Initializer() != origin || enclosingCallableNode(origin.Parent) != nil {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(c.collection)
	if symbol == nil || symbol.ValueDeclaration != origin.Parent || query.owner.bindingWritten(symbol) {
		return false
	}
	index := query.owner.index(c.source)
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || index.normalExported[ast.GetSymbolId(symbol)] {
		return false
	}
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if use.node != c.collection {
			return false
		}
	}
	for _, argument := range c.operation.AsCallExpression().Arguments.Nodes[1:3] {
		if !ast.IsArrowFunction(argument) || len(argument.Parameters()) != 1 || !ast.IsIdentifier(argument.Parameters()[0].Name()) {
			return false
		}
		safe := true
		walkNode(argument, func(node *ast.Node) bool {
			if ast.IsCallExpression(node) || ast.IsNewExpression(node) || ast.IsAssignmentExpression(node, false) || ast.IsAwaitExpression(node) || ast.IsDeleteExpression(node) {
				safe = false
			}
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && query.owner.checker.GetSymbolAtLocation(node) == query.owner.checker.GetSymbolAtLocation(argument.Parameters()[0].Name()) {
				parent := node.Parent
				if parent == nil || !ast.IsPropertyAccessExpression(parent) || parent.AsPropertyAccessExpression().Expression != node {
					safe = false
				} else {
					read, write := accessorEvaluationMode(parent)
					safe = safe && read && !write
				}
			}
			return true
		})
		if !safe {
			return false
		}
	}
	for _, item := range c.items {
		for _, field := range item.descriptors {
			if !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) == "__proto__" || !sourcePrimitiveValue(field.Initializer()) {
				return false
			}
		}
	}
	return true
}

func retainMapInputRole(fact *callableFacts, call, target *ast.Node, ordinal int, edge string) {
	for _, c := range fact.mapInputs {
		if c.published || c.operation != call || ordinal != 1 && ordinal != 2 || target == nil || !ast.IsFunctionLike(target) {
			continue
		}
		duplicate := false
		for _, role := range c.roles {
			duplicate = duplicate || role.edge == edge
		}
		if duplicate {
			continue
		}
		var parameter *ast.Node
		if len(target.Parameters()) == 1 && ast.IsIdentifier(target.Parameters()[0].Name()) {
			parameter = target.Parameters()[0]
		}
		c.roles = append(c.roles, sourceMapInputRole{ordinal: ordinal, edge: edge, target: target, parameter: parameter})
	}
}

// sealMapInputs publishes immutable coverage only after all generic callback
// demands exist. Known getter dependencies are MAY edges, never body execution.
func sealMapInputs(facts []callableFacts, targets map[*ast.Node]int) {
	for i := range facts {
		fact := &facts[i]
		for _, c := range fact.mapInputs {
			if c.published {
				continue
			}
			for j := range c.roles {
				role := &c.roles[j]
				target, ok := targets[role.target]
				if !ok {
					continue
				}
				for _, effect := range facts[target].summary.DirectEffectSources {
					if d := effect.fieldOrigin; d != nil && d.declaration == role.target && d.slot == role.parameter {
						role.demands = append(role.demands, *d)
					}
				}
				for dependencyIndex, field := range mapInputGetterDependencies(c, *role) {
					getter, known := targets[field]
					if !known {
						continue
					}
					id := fmt.Sprintf("%s:map-item-may:%d:%d:%d", fact.summary.ID, c.operation.Pos(), role.ordinal, dependencyIndex)
					fact.summary.Calls = append(fact.summary.Calls, CallEdge{ID: id, Name: "map item getter MAY", Resolved: true, TargetID: facts[getter].summary.ID})
					fact.targets = append(fact.targets, getter)
				}
			}
			c.publication = c
			c.published = true
		}
	}
}

func cloneMapInput(c *sourceMapInputContribution) *sourceMapInputContribution {
	if c == nil {
		return nil
	}
	out := *c
	out.items = append([]sourceMapItemAlternative(nil), c.items...)
	for i := range out.items {
		out.items[i].descriptors = append([]*ast.Node(nil), c.items[i].descriptors...)
	}
	out.roles = append([]sourceMapInputRole(nil), c.roles...)
	for i := range out.roles {
		out.roles[i].demands = append([]sourceFieldDemand(nil), c.roles[i].demands...)
	}
	return &out
}

// mapInputFallbackFulfilled is separate from actual fieldCall completion.
// OPEN domains never discharge an abstract read, including initially empty ones.
func mapInputFallbackFulfilled(caller, target *callableFacts, edge CallEdge, source EnvironmentEffectSource, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || source.fieldOrigin == nil || source.fieldForwarded || source.Environment != "unknown" || !source.Opaque || !source.provenanceIncomplete || !edge.Resolved || edge.TargetID != target.summary.ID {
		return false
	}
	unique := 0
	for _, candidate := range caller.summary.Calls {
		if candidate.ID == edge.ID {
			unique++
		}
	}
	if unique != 1 {
		return false
	}
	for _, copy := range caller.mapInputs {
		c := currentMapInput(copy, caller, owner)
		if c == nil {
			continue
		}
		if c.domain == sourceMapInputOpen || !c.futureReadonly || c.reason != "" {
			continue
		}
		for _, role := range c.roles {
			if role.edge != edge.ID || role.target != target.node || caller.callExpressions[edge.ID] != role.target || source.fieldOrigin.declaration != role.target || source.fieldOrigin.slot != role.parameter {
				continue
			}
			demanded := false
			for _, d := range role.demands {
				demanded = demanded || d == *source.fieldOrigin
			}
			if !demanded {
				continue
			}
			if c.domain == sourceMapInputNoItems {
				return len(c.items) == 0
			}
			if c.domain != sourceMapInputClosed || len(c.items) == 0 {
				continue
			}
			covered := true
			for _, item := range c.items {
				matches := 0
				for _, field := range item.descriptors {
					if !ast.IsPropertyAssignment(field) || field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) == "__proto__" {
						covered = false
						continue
					}
					if callableNameText(field.Name()) == source.fieldOrigin.key {
						matches++
					}
				}
				covered = covered && matches == 1
			}
			if covered {
				return true
			}
		}
	}
	return false
}

// Copies preserve publication identity but own every mutable vector. No edited
// projection can strengthen its original immutable domain or role coverage.
func sameMapInputPublication(a, b *sourceMapInputContribution) bool {
	if a == nil || b == nil || a.owner != b.owner || a.operation != b.operation || a.collection != b.collection || a.occurrence != b.occurrence || a.source != b.source || a.program != b.program || a.checker != b.checker || a.namespace != b.namespace || a.generation != b.generation || a.mode != b.mode || a.sourceDigest != b.sourceDigest || a.analysisMode != b.analysisMode || a.domain != b.domain || a.reason != b.reason || a.futureReadonly != b.futureReadonly || a.published != b.published || len(a.items) != len(b.items) || len(a.roles) != len(b.roles) {
		return false
	}
	for i, item := range a.items {
		other := b.items[i]
		if item.origin != other.origin || len(item.descriptors) != len(other.descriptors) {
			return false
		}
		for j, d := range item.descriptors {
			if d != other.descriptors[j] {
				return false
			}
		}
	}
	for i, role := range a.roles {
		other := b.roles[i]
		if role.ordinal != other.ordinal || role.edge != other.edge || role.target != other.target || role.parameter != other.parameter || len(role.demands) != len(other.demands) {
			return false
		}
		for j, d := range role.demands {
			if d != other.demands[j] {
				return false
			}
		}
	}
	return true
}

// currentMapInput checks the existing publication and already-built index only.
// Detached analysis may inspect its original generation, never renew execution.
func currentMapInput(copy *sourceMapInputContribution, caller *callableFacts, owner *executableBodyOwner) *sourceMapInputContribution {
	if copy == nil || caller == nil || owner == nil || owner.values == nil {
		return nil
	}
	c := copy.publication
	if c == nil || !c.published || !sameMapInputPublication(copy, c) || c.owner != caller.node || c.mode != sourceMapInputMode || c.analysisMode != caller.descriptorMode || c.program == nil || c.checker == nil || c.program != owner.values.program || c.checker != owner.checker || c.namespace != owner.values.language || c.namespace == nil || c.source == nil || c.program.GetSourceFile(c.source.FileName()) != c.source || c.sourceDigest != sha256.Sum256([]byte(c.source.Text())) {
		return nil
	}
	generation := c.namespace.generation
	if c.namespace.disposed {
		if c.generation == ^uint64(0) || c.generation+1 != generation {
			return nil
		}
	} else if c.generation != generation {
		return nil
	}
	index, found := owner.values.indexes[c.source]
	if !found || index.normalOccurrences[c.operation] != c.occurrence {
		return nil
	}
	return c
}

// mapInputEffectsForCall projects the original owned map's MAY effects into
// placement. This is not a resolved source Call or evidence that an item/Get
// executed. Event callbacks remain outside this finite key/render contract.
func mapInputEffectsForCall(analysis callableAnalysis, source *ast.SourceFile, position int) (CallableSummary, bool) {
	for i := range analysis.facts {
		caller := &analysis.facts[i]
		if caller.sourceFile != source {
			continue
		}
		for _, copy := range caller.mapInputs {
			c := currentMapInput(copy, caller, analysis.owner)
			if c == nil || c.source != source || c.operation == nil || c.operation.Pos() != position {
				continue
			}
			var effects []EnvironmentEffectSource
			if c.domain == sourceMapInputOpen {
				incomplete := environmentSource("unknown", "map input domain open: "+c.reason, caller.summary.Name)
				incomplete.Opaque = true
				incomplete.provenanceIncomplete = true
				effects = append(effects, incomplete)
			}
			for _, role := range c.roles {
				var target *callableFacts
				matches := 0
				for _, edge := range caller.summary.Calls {
					if edge.ID == role.edge && edge.Resolved {
						for j := range analysis.facts {
							candidate := &analysis.facts[j]
							if candidate.node == role.target && edge.TargetID == candidate.summary.ID && caller.callExpressions[edge.ID] == role.target {
								matches++
								target = candidate
							}
						}
					}
				}
				if matches != 1 {
					incomplete := environmentSource("unknown", "map callback role unavailable", caller.summary.Name)
					incomplete.Opaque = true
					effects = append(effects, incomplete)
					continue
				}
				// Reuse the canonical fixed-point summary, including its independent
				// browser/write/Call effects. Abstract input coverage is a separate test.
				for _, effect := range target.summary.EffectSources {
					var edge CallEdge
					for _, candidate := range caller.summary.Calls {
						if candidate.ID == role.edge {
							edge = candidate
							break
						}
					}
					if !mapInputFallbackFulfilled(caller, target, edge, effect, analysis.owner) {
						effects = append(effects, effect)
					}
				}
				for _, field := range mapInputGetterDependencies(c, role) {
					for _, getter := range analysis.facts {
						if getter.node == field {
							effects = append(effects, getter.summary.EffectSources...)
						}
					}
				}
			}
			// Callee/key and argument evaluation are separate from MAY callbacks. Use
			// only this caller's original Get/Call edges within actual operands,
			// never re-evaluate the receiver or inspect an arbitrary body.
			for _, edge := range caller.summary.Calls {
				if !edge.Resolved {
					continue
				}
				operation := caller.fieldEdgeOperations[edge.ID]
				if operation == nil {
					operation = caller.callExpressions[edge.ID]
				}
				selected := mapInputContainsOperand(c.operation.AsCallExpression().Expression, operation)
				for _, argument := range c.operation.AsCallExpression().Arguments.Nodes {
					selected = selected || mapInputContainsOperand(argument, operation)
				}
				if !selected {
					continue
				}
				for _, target := range analysis.facts {
					if target.summary.ID == edge.TargetID {
						effects = append(effects, target.summary.EffectSources...)
					}
				}
			}
			effects = uniqueEnvironmentSources(effects)
			return CallableSummary{Effect: environmentEffectFor(effects), EffectSources: effects}, true
		}
	}
	return CallableSummary{}, false
}

// mapInputContainsOperand relates an existing producer edge to this authored
// operand. A deferred function body cannot become operand evaluation effects.
func mapInputContainsOperand(argument, operation *ast.Node) bool {
	for node := operation; node != nil; node = node.Parent {
		if node == argument {
			return true
		}
		if ast.IsFunctionLike(node) {
			return false
		}
	}
	return false
}

// mapInputGetterDependencies discovers the same retained possible descriptor
// bodies for graph propagation and placement. It grants no Get execution law.
func mapInputGetterDependencies(c *sourceMapInputContribution, role sourceMapInputRole) []*ast.Node {
	var getters []*ast.Node
	seen := make(map[*ast.Node]bool)
	for _, item := range c.items {
		for _, demand := range role.demands {
			for _, field := range item.descriptors {
				if !ast.IsGetAccessorDeclaration(field) || field.Name() == nil || seen[field] {
					continue
				}
				key := sourceKeySelection{name: callableNameText(field.Name()), resolved: true}
				if ast.IsComputedPropertyName(field.Name()) {
					key = sourceMemberKey(field.Name().AsComputedPropertyName().Expression)
				}
				if key.resolved && key.name != demand.key {
					continue
				}
				// An unresolved computed name may match. Preserve its known MAY
				// getter effects without claiming descriptor or input coverage.
				seen[field] = true
				getters = append(getters, field)
			}
		}
	}
	return getters
}
