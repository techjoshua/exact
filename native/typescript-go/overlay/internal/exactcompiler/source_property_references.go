package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"sort"
)

type sourcePropertyViewState uint8

const (
	sourcePropertyUnpublished sourcePropertyViewState = iota
	sourcePropertyDiscovering
	sourcePropertyComplete
	sourcePropertyRefused
	sourcePropertyDisposed
)

// A view belongs to one live construction. Complete publishes finite MAY
// coverage, not execution or absence. Contributions publish independently after
// actual acquisition. No live view is retained in generation/callable caches.
type sourcePropertyReferenceView struct {
	preservation        *sourceDemandPreservation
	normalSelectionDone bool
	normalIdentity      *sourceNormalViewIdentity
	normalSources       map[*ast.SourceFile]*sourceNormalSourceIdentity
	writeOutcomes       []sourceCompletedWriteOutcome

	initializers                    []sourceModuleInitializer
	converting                      *sourceReflectiveOperation
	state                           sourcePropertyViewState
	program                         *compiler.Program
	checker                         *checker.Checker
	generation                      *projectGeneration
	owner                           *sourceValueOwner
	executable                      *executableBodyOwner
	root                            *ast.Node
	frame                           *sourceValueInputs
	source                          *ast.SourceFile
	sources                         []*ast.SourceFile
	edges                           []sourcePropertyDependency
	entries                         []*sourcePropertyEntry
	operations                      []*sourceReflectiveOperation
	references                      []sourceThenReference
	incomplete, producing, produced bool
}
type sourcePropertyDependency struct {
	target *sourceNormalSourceIdentity

	edge   *ast.Node
	source *ast.SourceFile
	state  sourceDependencyState
}
type sourcePropertyEntry struct {
	normalOnly           bool
	normalOwner          *ast.Node
	normalFrame          *sourceValueInputs
	operation, region    *ast.Node
	source               *ast.SourceFile
	resolved, incomplete bool
}

// propertyOperationAfterRoot excludes only a later once-only module statement
// from this construction's prefix. Deferred bodies, dependencies and work in
// the current statement remain relevant. The later statement keeps its own
// normal producer and cannot lend a refusal backwards to an earlier conversion.
func propertyOperationAfterRoot(v *sourcePropertyReferenceView, node *ast.Node) bool {
	if v == nil || v.root == nil || v.source == nil || node == nil || ast.GetSourceFileOfNode(node) != v.source {
		return false
	}
	boundary := v.root
	if ast.IsFunctionLike(boundary) {
		entry := enteredPropertyCallPrefix(v, v.converting)
		if entry == nil {
			return false
		}
		boundary = entry.statement
	}
	if (!ast.IsExpressionStatement(boundary) && !ast.IsVariableStatement(boundary)) || boundary.Parent != v.source.AsNode() {
		return false
	}
	source := v.normalSources[v.source]
	if source == nil || source.cyclic || source.population == nil {
		return false
	}
	root, entry := source.population.entries[boundary], source.population.entries[node]
	return root != nil && root.once && root.region == nil && entry != nil && entry.once && entry.region == nil && entry.statement != nil && entry.statement != boundary && entry.statement.Parent == v.source.AsNode() && entry.statement.Pos() >= boundary.End()
}

// enteredPropertyCallPrefix reads the installed entry's original caller slot.
// It grants no authority to a generic callable definition, conditional input
// plan or another invocation at the same AST. Body and caller frames stay distinct.
func enteredPropertyCallPrefix(view *sourcePropertyReferenceView, op *sourceReflectiveOperation) *sourceNormalOccurrence {
	if view == nil || op == nil || op.frame == nil || op.frame.properties != view || op.owner != op.frame.declaration || op.frame.population == nil || op.frame.population.root != op.owner {
		return nil
	}
	call := op.frame.consumedCall
	if call == nil || !call.entered || call.conditional || call.inputs != op.frame || call.declaration != op.owner || call.parent == nil || call.operation == nil || !ast.IsCallExpression(call.operation) || ast.GetSourceFileOfNode(call.operation) != view.source {
		return nil
	}
	source := view.normalSources[view.source]
	if source == nil || source.cyclic || source.population == nil {
		return nil
	}
	// Auxiliary source-file execution is an existing normal projection into
	// this live producer, not a borrowed definition or a same-AST activation.
	projected := view.producing && call.parent.properties == view && call.parent.declaration == view.source.AsNode() && call.parent.population == source.population && source.domains[call.parent.declaration] == source.population
	if !(view.frame == op.frame && view.root == op.owner) && !(view.frame == call.parent && view.root == call.parent.declaration) && !projected {
		return nil
	}
	slot := call.parent.operations[call.operation]
	if slot == nil || slot.state != sourceOperationInProgress || slot.population == nil || slot.population != call.parent.population || slot.population.root != call.parent.declaration || slot.entry == nil || slot.population.moduleEntry(call.operation, slot.entry.statement) != slot.entry {
		return nil
	}
	authority := slot.authority
	if authority.owner != view.owner || authority.program != view.program || authority.checker != view.checker || authority.generation == nil || authority.generation != view.generation || !authority.generation.active || authority.executable != view.executable {
		return nil
	}
	if source.population.entries[call.operation] != slot.entry || slot.entry.region != nil || !slot.entry.once || slot.entry.callOwner != nil {
		return nil
	}
	return slot.entry
}

// enteredPropertyConstructionPrefix bounds auxiliary module preparation by
// the original live New publisher. The field owns its existing actual inputs,
// while the unfinished allocation keeps every field effect and output claim.
// This caller cut supplies no descriptor conversion or absence completion.
func (query *sourceValueQuery) enteredPropertyConstructionPrefix(view *sourcePropertyReferenceView, op *sourceReflectiveOperation) *sourceNormalOccurrence {
	if view == nil || op == nil || op.frame == nil || query.inputs != op.frame || view.frame != op.frame || view.root != op.owner || op.frame.properties != view || op.frame.declaration != op.owner || !ast.IsPropertyDeclaration(op.owner) || op.frame.operationLifetime == nil || !query.constructionFieldDomain(op.frame, op.operation) {
		return nil
	}
	instance := op.frame.bindings[0][0].instance
	parent, slot := instance.inputs, instance.publisher
	if instance.state != sourceOperationInProgress || slot.state != sourceOperationInProgress || op.frame.invocation != instance.site || !ast.IsNewExpression(instance.site) || ast.GetSourceFileOfNode(instance.site) != view.source || parent.population == nil || parent.population.root != parent.declaration || slot.selected == nil || len(slot.selected.declarations) != 1 || slot.selected.declarations[0] != instance.target {
		return nil
	}
	fieldSlot := op.frame.operations[op.operation]
	if fieldSlot == nil || fieldSlot.state != sourceOperationInProgress || !fieldSlot.authority.valid(query) || fieldSlot.population != op.frame.population || fieldSlot.entry != op.frame.population.entries[op.operation] {
		return nil
	}
	source := view.normalSources[view.source]
	entry := slot.entry
	if source == nil || source.cyclic || source.population == nil || source.population.entries[instance.site] != entry || entry.region != nil || !entry.once || entry.callOwner != nil || slot.population.moduleEntry(instance.site, entry.statement) != entry {
		return nil
	}
	return entry
}

// associatePropertyBody records the actual installed body's existing population
// in this live construction. It neither completes a MAY entry nor lends caller
// inputs to the body. A definition or another Call at the same AST cannot issue it.
func associatePropertyBody(view *sourcePropertyReferenceView, op *sourceReflectiveOperation) {
	if enteredPropertyCallPrefix(view, op) == nil {
		return
	}
	source := view.normalSources[ast.GetSourceFileOfNode(op.operation)]
	if source == nil || source.cyclic || source.population == nil || op.frame.population.entries[op.operation] != source.population.entries[op.operation] {
		return
	}
	source.domains[op.owner] = op.frame.population
	for _, existing := range view.operations {
		if existing == op {
			return
		}
	}
	view.operations = append(view.operations, op)
}

// activePropertyBodyEntry accounts only for this issued conversion's pending
// nominal write. Other contributions were inspected independently, and their
// uncertainty remains. The generic deferred row is never marked resolved.
func (query *sourceValueQuery) activePropertyBodyEntry(view *sourcePropertyReferenceView, entry *sourcePropertyEntry, op *sourceReflectiveOperation) bool {
	if op == nil || view.converting != op || entry.operation != op.operation || entry.region != op.owner || entry.incomplete || enteredPropertyCallPrefix(view, op) == nil {
		return false
	}
	source := view.normalSources[entry.source]
	slot := op.frame.operations[op.operation]
	return source != nil && !source.cyclic && source.domains[op.owner] == op.frame.population && slot != nil && slot.state == sourceOperationInProgress && slot.authority.valid(query) && slot.population == op.frame.population && slot.entry != nil && slot.entry == source.population.entries[entry.operation] && slot.entry == op.frame.population.moduleEntry(op.operation, op.owner)
}

// sourcePropertyReadInspection borrows an already admitted conversion view for
// one selected receiver/key. It grants no bindings, operation creation or completion.
// It lives only on the local Get and is not stored in observations or getter inputs.
type sourcePropertyReadInspection struct {
	operation *sourceReflectiveOperation
	view      *sourcePropertyReferenceView
	receiver  *sourceObservedValue
	key       string
	lookup    *sourceValue
}

// issuePropertyInspection runs before original value projection changes inputs.
// A module construction can legitimately borrow a view rooted in another frame.
func (query *sourceValueQuery) issuePropertyInspection(op *sourceReflectiveOperation, receiver *sourceObservedValue, key string, result *accessorCandidates) *sourcePropertyReadInspection {
	if op == nil || !query.charge(result, op.operation) || !reflectiveNative(op.native) || op.operation == nil || op.frame == nil || query.inputs != op.frame || query.operation == nil || query.operation.node != op.operation || query.operation.owner != op.owner || query.operation.inputs != op.frame || receiver == nil {
		return nil
	}
	v := query.propertyView()
	if v == nil || v.frame == nil || v.frame.properties != v || v.frame.declaration != v.root || op.frame.properties != v || v.converting != op {
		return nil
	}
	return &sourcePropertyReadInspection{operation: op, view: v, receiver: receiver, key: key}
}

// propertyInspectionView validates an issued read-only relation independently of
// the installed original value inputs, including nil and output-only context copies.
func (query *sourceValueQuery) propertyInspectionView(get *sourceGetInputs, key string, result *accessorCandidates) (*sourcePropertyReferenceView, bool) {
	if get == nil || get.inspection == nil {
		return nil, false
	}
	r := get.inspection
	op, v := r.operation, r.view
	if !query.charge(result, get.operation) || op == nil || v == nil || r.receiver == nil || get.reflective != op || get.operation != op.operation || !reflectiveNative(op.native) || op.frame == nil || query.operation == nil || query.operation.node != op.operation || query.operation.owner != op.owner || query.operation.inputs != op.frame || get.propertyKey != key || r.key != key || get.receiver.acquired != r.receiver || get.lookupOwner != r.lookup {
		return nil, false
	}
	if query.owner == nil || v.owner != query.owner || v.program != query.owner.program || v.checker != query.owner.checker || v.generation != query.owner.generation || v.executable != query.executable || v.state == sourcePropertyDisposed || v.frame == nil || v.frame.properties != v || v.frame.declaration != v.root || op.frame.properties != v || v.converting != op {
		return nil, false
	}
	expected := r.receiver.value
	expected.acquired = r.receiver
	if !query.explicitGetProjection(get, expected, []string{key}, "", result) {
		return nil, false
	}
	return v, true
}

func (query *sourceValueQuery) propertyView() *sourcePropertyReferenceView {
	if query.inputs == nil {
		return nil
	}
	v := query.inputs.properties
	if v == nil || v.owner != query.owner || v.program != query.owner.program || v.checker != query.owner.checker || v.generation != query.owner.generation || v.executable != query.executable || v.state == sourcePropertyDisposed || v.frame == nil || v.frame.properties != v || v.root != v.frame.declaration {
		return nil
	}
	return v
}

// preparePropertyReferences is a NORMAL-consumer capability. An installed map
// alone cannot enter modules. Reentry reads pending MAY entries, never an empty
// proof. Discovery uses only selected edges and existing source indexes.
func (query *sourceValueQuery) preparePropertyReferences(owner *ast.Node, result *accessorCandidates, current ...*sourceReflectiveOperation) *sourcePropertyReferenceView {
	return query.preparePropertyReferencesBefore(owner, result, nil, current...)
}

// before is an actual normal Get's indexed boundary. Its original installed
// statement driver owns current work, while this construction prepares only
// predecessor statements and dependencies. Read-only lookups never call this.
func (query *sourceValueQuery) preparePropertyReferencesBefore(owner *ast.Node, result *accessorCandidates, before *sourceNormalOccurrence, current ...*sourceReflectiveOperation) *sourcePropertyReferenceView {
	if owner == nil || query.operation == nil || query.operation.owner != owner || query.effectOwner == nil || query.inputs == nil || query.operation.inputs != nil && query.operation.inputs != query.inputs {
		return nil
	}
	if v := query.propertyView(); v != nil && v.state != sourcePropertyUnpublished {
		found := false
		for _, source := range v.sources {
			if !query.charge(result, owner) {
				v.incomplete = true
				v.state = sourcePropertyRefused
				return v
			}
			found = found || source == ast.GetSourceFileOfNode(owner)
		}
		if !found {
			v.incomplete = true
			v.state = sourcePropertyRefused
		}
		if found && len(current) == 1 {
			associatePropertyBody(v, current[0])
		}
		return v
	}
	v := query.inputs.properties
	if v != nil && v.state != sourcePropertyUnpublished {
		return nil
	}
	if v == nil {
		v = &sourcePropertyReferenceView{frame: query.inputs}
		query.inputs.properties = v
	}
	root := v.frame.declaration
	if root == nil {
		return nil
	}
	v.owner, v.executable, v.program, v.checker, v.generation = query.owner, query.executable, query.owner.program, query.owner.checker, query.owner.generation
	v.root, v.source, v.state = root, ast.GetSourceFileOfNode(root), sourcePropertyDiscovering
	query.inputs.properties = v
	if len(current) == 1 && current[0].operation == query.operation.node && current[0].owner == owner && current[0].frame == query.inputs {
		v.operations = append(v.operations, current[0])
	}
	query.ensureNormalSourceSelection(v, result)
	if len(current) == 1 {
		// Fresh views need the same actual-entry association as reused views.
		// The canonical helper refuses generic, foreign and cyclic callers.
		associatePropertyBody(v, current[0])
	}
	if ast.IsFunctionLike(root) {
		// A definition's MAY conversion cannot execute module Calls to recover
		// its own proof. Actual entry instead supplies the caller's indexed cut.
		if len(current) != 1 {
			v.incomplete, v.state = true, sourcePropertyRefused
			return v
		}
		before = enteredPropertyCallPrefix(v, current[0])
		if before == nil {
			if source := v.normalSources[v.source]; source != nil && !source.cyclic && source.population != nil && !v.incomplete {
				query.retainDescriptorEffectFallback(current[0], result)
			}
			v.incomplete, v.state = true, sourcePropertyRefused
			return v
		}
		source := v.normalSources[v.source]
		source.domains[root] = query.inputs.population
		parent := query.inputs.consumedCall.parent
		source.domains[parent.declaration] = parent.population
	}
	if ast.IsPropertyDeclaration(root) {
		// A field conversion cannot prepare its allocating New to establish
		// its own inputs. Only the live original construction supplies the cut.
		if len(current) != 1 {
			v.incomplete, v.state = true, sourcePropertyRefused
			return v
		}
		before = query.enteredPropertyConstructionPrefix(v, current[0])
		if before == nil {
			v.incomplete, v.state = true, sourcePropertyRefused
			return v
		}
		source := v.normalSources[v.source]
		source.domains[root] = query.inputs.population
		parent := query.inputs.bindings[0][0].instance.inputs
		source.domains[parent.declaration] = parent.population
	}
	for _, s := range v.sources {
		idx := query.owner.index(s)
		// Deferred regions are MAY entries only. Their original input relation must
		// be supplied by actual normal entry before a consumer can close them.
		regions := make([]*ast.Node, 0, len(idx.operationRegions))
		for region := range idx.operationRegions {
			if !query.charge(result, s.AsNode()) {
				v.incomplete = true
				v.state = sourcePropertyRefused
				return v
			}
			regions = append(regions, region)
		}
		// Deterministic inventory order is not a runtime ordering proof.
		sort.Slice(regions, func(i, j int) bool {
			if regions[i] == nil {
				return regions[j] != nil
			}
			if regions[j] == nil {
				return false
			}
			return regions[i].Pos() < regions[j].Pos()
		})
		for _, region := range regions {
			ops := idx.operationRegions[region]
			for _, node := range ops.thenOperations {
				if !query.charge(result, node) {
					v.incomplete = true
					v.state = sourcePropertyRefused
					return v
				}
				entry := &sourcePropertyEntry{operation: node, region: region, source: s}
				if before != nil && s == v.source && region == nil && idx.normalOccurrences[node] != nil && idx.normalOccurrences[node].statement == before.statement {
					entry.normalOnly, entry.normalOwner, entry.normalFrame = true, v.root, v.frame
				}
				v.entries = append(v.entries, entry)
			}

			if len(ops.openCalls) > 0 || len(ops.hazards) > 0 {
				// Existing normal entry may retain known effects, but no absent prototype
				// property is certified through unaccounted native/implicit work.
				if region == nil {
					v.incomplete = true
				}
			}
		}
	}
	if v.incomplete {
		v.state = sourcePropertyRefused
	} else {
		v.state = sourcePropertyComplete
	}
	v.producing = true
	defer func() { v.producing = false; v.produced = true }()
	query.consumePropertyModules(v, result, before)
	v.preservation = query.checkDemandPreservation(v, result)
	return v
}

// prepareNormalGetProperties requires the installed producer and exact indexed
// statement ownership, including expression statements with their original
// normal fact. Its InProgress slot prevents recursive acquisition. The
// current driver keeps every current-statement effect and publication claim.
func (query *sourceValueQuery) prepareNormalGetProperties(node *ast.Node, slot *sourceNormalOperation, result *accessorCandidates) {
	if slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(query) || query.inputs == nil || query.operation == nil || query.operation.node != node || query.operation.inputs != query.inputs || normalCalleeGetOwner(node) == nil {
		return
	}
	frame := query.inputs
	root := frame.declaration
	if root == nil || frame.ownedFact == nil || frame.ownedFact.node != root || frame.ownedFact.normalInputs != frame || query.effectOwner != root || query.operation.owner != root || !ast.IsExpressionStatement(root) && moduleCallInitializer(query.owner, root) == nil || frame.population != slot.population || frame.population == nil || frame.population.root != root || frame.population.moduleEntry(node, root) != slot.entry {
		return
	}
	view := query.propertyView()
	if view == nil || view.state != sourcePropertyUnpublished || view.frame != frame || slot.entry == nil {
		return
	}
	query.preparePropertyReferencesBefore(root, result, slot.entry)
}

func disposePropertyReferences(inputs *sourceValueInputs) {
	if inputs != nil {
		if history := inputs.priorPropertyFacts; history != nil {
			history.active, history.facts, history.current = false, nil, nil
			inputs.priorPropertyFacts = nil
		}
		inputs.operations = nil
		inputs.operationLifetime = nil
		inputs.cells = nil
		inputs.consumedWrites = nil
		inputs.consumedCall = nil
		inputs.lexicalGets = nil
		inputs.writeComponents = nil
		inputs.installedFormals = nil
		inputs.writeAlternative = nil
		releaseNormalDispatcher(inputs)
	}
	if inputs == nil || inputs.properties == nil {
		return
	}
	v := inputs.properties
	if v.frame == inputs {
		v.state = sourcePropertyDisposed
		v.preservation = nil
		v.initializers = nil
		v.writeOutcomes = nil
		for _, source := range v.normalSources {
			source.dataGets = nil
			source.domains = nil
			source.plan = sourceValueSummary{}
		}
		v.normalSources = nil
		v.normalIdentity = nil
		v.normalSelectionDone = false
		v.entries = nil
		v.operations = nil
		v.references = nil
		v.edges = nil
		v.sources = nil
	}
	inputs.properties = nil
}

func (query *sourceValueQuery) finishPropertyEntry(v *sourcePropertyReferenceView, node *ast.Node, result *accessorCandidates, complete bool) {
	if v == nil {
		return
	}
	for i := range v.entries {
		if !query.charge(result, node) {
			v.incomplete = true
			return
		}
		e := v.entries[i]
		if e.operation == node && e.region == nil {
			e.resolved = true
			e.incomplete = e.incomplete || !complete || result.thenIncomplete
		}
	}
	for _, outcome := range result.writeOutcomes {
		if v.incomplete {
			v.incomplete = true
			return
		}
		if !query.charge(result, node) {
			v.incomplete = true
			return
		}
		if outcome.view != v.normalIdentity || outcome.source == nil || v.normalSources[outcome.source.source] != outcome.source || outcome.entry == nil || outcome.entry.node != node || outcome.verdict != sourceWriteNoWrites {
			v.incomplete = true
			continue
		}
		duplicate := false
		for _, old := range v.writeOutcomes {
			if !query.charge(result, node) {
				v.incomplete = true
				return
			}
			if old.operation == outcome.operation {
				duplicate = true
				if old != outcome {
					v.incomplete = true
				}
			}
		}
		if !duplicate {
			v.writeOutcomes = append(v.writeOutcomes, outcome)
		}
	}
	for _, op := range result.reflective {
		found := false
		for _, old := range v.operations {
			found = found || old == op
		}
		if !found {
			v.operations = append(v.operations, op)
		}
	}
}

// propertyReferenceEffects consumes a complete MAY view for this field operation.
// Pending candidates are not executed or discarded by source order. A current
// native conversion omits ONLY its own later nominal DefineOwnProperty step.
func (query *sourceValueQuery) propertyReferenceEffects(get *sourceGetInputs, key string, bindings sourceValueBindings, result *accessorCandidates, physical ...*sourceMemberWriterReadCut) sourcePropertyPresence {
	if get.operation == nil || !query.charge(result, get.operation) {
		result.opaque = true
		return propertyUnknown
	}
	if query.liveStagedFieldGet(get) && !get.hasOnly && get.stagedEffects.prototype != nil {
		get.stagedEffects.prototype(query, get)
	}
	v := query.propertyView()
	issued := false
	if get.inspection != nil {
		v, issued = query.propertyInspectionView(get, key, result)
	}
	if v == nil || v.state == sourcePropertyDiscovering || v.state == sourcePropertyUnpublished {
		if len(physical) == 1 {
			query.observeStagedFieldIntrinsicMutation(get, key, physical[0])
		}
		query.observeStagedFieldIntrinsicEntry(get, key)
		if query.observeStagedFieldSourceCoverage(get) {
			// The original Effects owner has represented its source alternatives
			// and required children. Normal field selection is still unavailable.
			result.valueIncomplete = true
			return propertyUnknown
		}
		if query.observeStagedHasInstanceInheritedSource(get) {
			result.valueIncomplete = true
			return propertyUnknown
		}
		// A fresh descriptor's Effects-only reader already retained indexed
		// authored alternatives. It needs no normal prototype absence result.
		if !get.freshDescriptorEffects {
			result.opaque = true
		}
		return propertyUnknown
	}
	presence := propertyUnknown
	switch key {
	case "enumerable", "configurable", "value", "writable", "get", "set", "then":
		if v.state == sourcePropertyComplete && !v.incomplete {
			presence = propertyAbsent
		}
	}
	for _, entry := range v.entries {
		if entry.normalOnly || propertyOperationAfterRoot(v, entry.operation) {
			continue
		}
		if !query.charge(result, entry.operation) {
			return propertyUnknown
		}
		// Issuance precedes outward publication. Only this validated active
		// contribution supplies self identity, never another same-AST record.
		self := issued && get.inspection.operation.operation == entry.operation && get.inspection.operation.covered
		matched := false
		for _, op := range v.operations {
			if !query.charge(result, entry.operation) {
				return propertyUnknown
			}
			if op.operation != entry.operation {
				continue
			}
			if issued && op == get.inspection.operation && op.covered {
				// Omit only this active contribution's later nominal installation.
				// Another construction at the same source Call remains inspected.
				continue
			}
			matched = true
			if !op.finalized {
				presence = propertyUnknown
				continue
			}
			unrelated := query.reflectivePrototypeDisjoint(op, get, result)
			if unrelated {
				continue
			}
			if op.key != "" && op.key != key && !op.residualMutation && !op.conversionIncomplete {
				continue
			}
			presence = propertyUnknown
			if !get.hasOnly && op.key == key {
				query.convertedPropertyGet(op, get, result)
			}
		}
		if entry.region != nil {
			if self && query.activePropertyBodyEntry(v, entry, get.inspection.operation) {
				continue
			}
			if query.deferredCandidateExcluded(entry.operation, result) || query.demandFamilyPreserved(v, entry, key, result) {
				continue
			}
			// Finite contributions do not discharge a relevant unresolved remainder.
			// Relevance belongs to this read, independently of matching or self.
			if (!entry.resolved || entry.incomplete || !matched && !self) && query.propertyEntryMayReachPrototype(entry.operation) {
				presence = propertyUnknown
			}
			continue
		}
		if !self && (!entry.resolved || entry.incomplete) {
			presence = propertyUnknown
		}
		if !ast.IsCallExpression(entry.operation) && query.propertyEntryMayReachPrototype(entry.operation) {
			presence = propertyUnknown
		}
	}
	if presence == propertyUnknown {
		result.opaque = true
	}
	return presence
}

// This is a relevance fence only, never a positive descriptor/absence proof.
// Actual alias/receiver alternatives are retained by normal acquisition.
func (query *sourceValueQuery) propertyEntryMayReachPrototype(node *ast.Node) bool {
	if ast.IsCallExpression(node) {
		return query.owner.reflectiveMutation(node.AsCallExpression().Expression)
	}
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		return true
	}
	return false
}

func (query *sourceValueQuery) reflectivePrototypeDisjoint(op *sourceReflectiveOperation, get *sourceGetInputs, result *accessorCandidates) bool {
	if len(op.targets) == 0 {
		return false
	}
	for _, observed := range op.targets {
		if !query.charge(result, op.operation) {
			return false
		}
		value := observed.value
		if value.node == get.receiver.node && sourceProjectionOverlap(value.path, get.receiver.path) {
			return false
		}
		if value.native != nil && (value.native.kind == sourceNativePromisePrototype || value.native.kind == sourceNativePromiseConstructor) {
			continue
		}
		if value.node != nil && len(value.path) == 0 && (ast.IsObjectLiteralExpression(value.node) || ast.IsArrayLiteralExpression(value.node) || ast.IsFunctionLike(value.node)) {
			continue
		}
		if value.native != nil && value.native.kind == sourceNativeFunctionPrototype || value.node != nil && ast.IsIdentifier(value.node) && sourceFunctionPrototype(value, query.owner.checker) && value.node.Text() == "Function" {
			continue
		}
		return false
	}
	return !op.referencesIncomplete && !op.conversionIncomplete && !op.residualMutation
}

// A converted descriptor contains actual field outputs. Reading an installed
// getter is a new Get, not replay of the converter that produced that function.
func (query *sourceValueQuery) convertedPropertyGet(op *sourceReflectiveOperation, get *sourceGetInputs, result *accessorCandidates) {
	result.opaque = result.opaque || !op.covered || op.conversionIncomplete || op.residualMutation
	if data, ok := op.fields["value"]; ok && data.presence != propertyAbsent {
		for _, value := range data.values {
			if !query.charge(result, op.operation) {
				return
			}
			result.values = append(result.values, value.value)
			if result.callableScopes == nil {
				result.callableScopes = make(map[int]acquiredCallableScope)
			}
			result.callableScopes[len(result.values)-1] = value.scope
		}
	}
	if field, ok := op.fields["get"]; ok && field.presence != propertyAbsent {
		for _, value := range field.values {
			if !query.charge(result, op.operation) {
				return
			}
			if value.value.undefined {
				result.values = append(result.values, value.value)
				continue
			}
			body := value.value.node
			if body == nil || len(value.value.path) != 0 || !ast.IsFunctionLike(body) || body.Body() == nil {
				result.opaque = true
				continue
			}
			beforeWrites, beforeRefs := len(result.writes), len(result.thenReferences)
			observed := query.acquireGetResult(body, get, value.scope, result)
			result.opaque = result.opaque || len(result.writes) > beforeWrites || len(result.thenReferences) > beforeRefs
			result.opaque = result.opaque || observed.incomplete
			for _, v := range observed.values {
				// Transfer this Get's original inputs and scope with each value.
				value := v.value
				value.acquired = &v
				result.values = append(result.values, value)
				if result.callableScopes == nil {
					result.callableScopes = make(map[int]acquiredCallableScope)
				}
				result.callableScopes[len(result.values)-1] = v.scope
			}
		}
	}
}

// convertedMemberAtGet consumes already acquired descriptor outputs at a later
// actual Get. The converter and its inputs are never entered from this lookup.
func (query *sourceValueQuery) convertedMemberAtGet(node, origin *ast.Node, projection []string, name string, mode accessorTraversal, get *sourceGetInputs, result *accessorCandidates) bool {
	v := query.propertyView()
	if v == nil || (v.state != sourcePropertyComplete && v.state != sourcePropertyRefused) {
		return false
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	handled := false
	for _, op := range v.operations {
		if !query.charge(result, node) {
			return handled
		}
		if op.operation != node || !op.finalized {
			continue
		}
		handled = true
		if op.key != "" && op.key != key {
			// Nominal disjointness never excludes converter/key/target residuals.
			result.opaque = result.opaque || !op.covered || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation
			continue
		}
		matching, unknown := false, op.referencesIncomplete || len(op.targets) == 0
		for _, target := range op.targets {
			if !query.charge(result, node) {
				return true
			}
			if get != nil && get.descriptorReceiver().native != nil {
				matching = matching || query.nativeReceiverMatches(target.value, get.descriptorReceiver())
			} else {
				matching = matching || target.value.node == origin && len(target.value.path) == 0
			}
			known := target.value.native != nil || target.value.node != nil && len(target.value.path) == 0 && (ast.IsObjectLiteralExpression(target.value.node) || ast.IsArrayLiteralExpression(target.value.node) || ast.IsFunctionLike(target.value.node)) || sourceFunctionPrototype(target.value, query.owner.checker)
			if !known {
				unknown = true
			}
		}
		if !matching && !unknown {
			continue
		}
		result.opaque = result.opaque || unknown || !op.covered || op.conversionIncomplete || op.residualMutation
		if matching && !unknown && op.covered && !op.conversionIncomplete && !op.residualMutation && (op.fields["get"].presence == propertyPresent || op.fields["value"].presence == propertyPresent) {
			// This converted installation replaces this lookup's original slot.
			// Getter effects and output completeness remain separate obligations.
			result.ownOperation = true
		}
		actual := get
		if actual == nil {
			actual = &sourceGetInputs{operation: query.reading, receiver: sourceValue{node: origin}}
		}
		if mode&accessorNoGet == 0 {
			query.convertedPropertyGet(op, actual, result)
		}
	}
	return handled
}

// functionPrototypeLookup consumes an already acquired intrinsic prototype
// carrier in a complete predecessor construction. Ordinary authored functions
// have that intrinsic prototype initially. Unaccounted chain mutation leaves
// the view incomplete, so neither names nor declared callable types suffice.
// The actual function remains this for the selected getter.
func (query *sourceValueQuery) functionPrototypeLookup(get *sourceGetInputs, function *ast.Node, result *accessorCandidates) *sourceGetInputs {
	if get == nil || get.lookupOwner != nil || get.receiver.node != function || len(get.receiver.path) != 0 || function == nil || !ast.IsFunctionLike(function) || function.Body() == nil || get.operation != query.protectedMember {
		return get
	}
	view := query.propertyView()
	if view == nil || view.state != sourcePropertyComplete || view.incomplete || !view.produced {
		return get
	}
	var lookup *sourceValue
	for _, op := range view.operations {
		if !query.charge(result, get.operation) || !op.finalized || !op.covered || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation {
			return get
		}
		if op.key != get.propertyKey {
			continue
		}
		for _, target := range op.targets {
			value := target.value
			if value.node == function && len(value.path) == 0 {
				// An own installation wins over the inherited slot.
				return get
			}
			if value.native == nil || value.native.kind != sourceNativeFunctionPrototype || value.native.referencesIncomplete || len(value.path) != 0 {
				continue
			}
			if lookup != nil && lookup.native.kind != value.native.kind {
				return get
			}
			copy := value
			lookup = &copy
		}
	}
	if lookup == nil {
		return get
	}
	actual := *get
	actual.lookupOwner = lookup
	return &actual
}

// beginPropertyModuleOperation records the actual normal producer already owned
// by this module construction. It is not a prototype-neutrality disposition.
func (query *sourceValueQuery) beginPropertyModuleOperation(node *ast.Node) *sourcePropertyEntry {
	if query.inputs == nil || query.operation == nil || query.operation.owner != query.inputs.declaration || enclosingCallableNode(node) != nil {
		return nil
	}
	v := query.inputs.properties
	if v == nil || v.frame != query.inputs || v.state == sourcePropertyDisposed {
		return nil
	}
	if !query.charge(&accessorCandidates{}, node) {
		return nil
	}
	entry := &sourcePropertyEntry{operation: node, source: ast.GetSourceFileOfNode(node), normalOnly: true, normalOwner: query.operation.owner, normalFrame: query.inputs}
	v.entries = append(v.entries, entry)
	return entry
}

// ensureNormalSourceSelection issues V/S and dependency associations without
// consuming predecessor work. Direct statement projections and eager execution
// reuse this same closure. No consumer constructs it from a completed outcome.
func (query *sourceValueQuery) ensureNormalSourceSelection(v *sourcePropertyReferenceView, result *accessorCandidates) {
	if v == nil || v.normalSelectionDone {
		return
	}
	v.normalSelectionDone = true
	seen := make(map[*ast.SourceFile]uint8)
	var stack []*ast.SourceFile
	if v.normalIdentity == nil {
		v.normalIdentity = &sourceNormalViewIdentity{}
	}
	v.normalSources = make(map[*ast.SourceFile]*sourceNormalSourceIdentity)
	var discover func(*ast.SourceFile)
	discover = func(s *ast.SourceFile) {
		if s == nil {
			return
		}
		if seen[s] == 1 {
			v.incomplete = true
			active := false
			for _, item := range stack {
				active = active || item == s
				if active {
					v.normalSources[item].cyclic = true
				}
			}
			return
		}
		if seen[s] == 2 {
			return
		}
		if !query.charge(result, s.AsNode()) {
			v.incomplete = true
			return
		}
		seen[s] = 1
		stack = append(stack, s)
		defer func() { stack = stack[:len(stack)-1]; seen[s] = 2 }()
		population := query.owner.normalPopulation(s.AsNode())
		v.normalSources[s] = &sourceNormalSourceIdentity{source: s, population: population, plan: query.owner.summary(s.AsNode()), domains: map[*ast.Node]*sourceNormalPopulation{s.AsNode(): population}}
		if population == nil {
			v.incomplete = true
			return
		}
		idx := query.owner.index(s)
		if idx.incomplete {
			v.incomplete = true
			return
		}
		v.sources = append(v.sources, s)
		for _, edge := range idx.runtimeImports {
			selected, state := query.operationDependencyState(edge, result)
			edgeIndex := len(v.edges)
			v.edges = append(v.edges, sourcePropertyDependency{edge: edge, source: selected, state: state})
			switch state {
			case sourceDependencyAvailable:
				discover(selected)
				v.edges[edgeIndex].target = v.normalSources[selected]
			case sourceDependencyErased:
			default:
				v.incomplete = true
			}
		}

	}
	discover(v.source)
}

// prepareNormalStatementSelection binds the direct driver's statement projection
// before its first event. It performs source selection, never module consumption.
func (query *sourceValueQuery) prepareNormalStatementSelection(result *accessorCandidates) {
	if query.inputs == nil || query.inputs.population == nil {
		return
	}
	root := query.inputs.declaration
	if root == nil || query.effectOwner != root || query.inputs.population.root != root || enclosingCallableNode(root) != nil || ast.IsSourceFile(root) {
		return
	}
	v := query.inputs.properties
	if v == nil {
		v = &sourcePropertyReferenceView{frame: query.inputs, state: sourcePropertyUnpublished}
		query.inputs.properties = v
	}
	v.owner, v.executable, v.program, v.checker, v.generation = query.owner, query.executable, query.owner.program, query.owner.checker, query.owner.generation
	v.root, v.source = root, ast.GetSourceFileOfNode(root)
	query.ensureNormalSourceSelection(v, result)
	if source := v.normalSources[v.source]; source != nil {
		source.domains[root] = query.inputs.population
	}
}

// convertedOwnMemberInterference delegates one actual, completed own installation
// to convertedMemberAtGet. The mutation stays real and that consumer still owns
// its selected value/getter effects. Generic calls and incomplete records cannot
// use this relation as NoWrites, absence, body purity or invocation authority.
func (query *sourceValueQuery) convertedOwnMemberInterference(call, origin *ast.Node, projection []string, name string, mode accessorTraversal, result *accessorCandidates) bool {
	if query.inputs == nil || query.protectedMember == nil || mode != accessorAcquire || origin == nil || !ast.IsFunctionLike(origin) || origin.Body() == nil {
		return false
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	slot := query.inputs.operations[query.protectedMember]
	if slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(query) || slot.population != query.inputs.population || slot.entry == nil || slot.entry.region != nil || !slot.entry.once || slot.population.moduleEntry(query.protectedMember, slot.entry.statement) != slot.entry {
		return false
	}
	view := query.propertyView()
	if view == nil || view.state != sourcePropertyComplete || view.incomplete || !view.produced {
		return false
	}
	source := view.normalSources[ast.GetSourceFileOfNode(call)]
	if source == nil || source.cyclic || source.population == nil || source.source != ast.GetSourceFileOfNode(query.protectedMember) {
		return false
	}
	at := source.population.entries[query.protectedMember]
	if at == nil || at.region != nil || !at.once {
		return false
	}
	matched := false
	for _, op := range view.operations {
		if !query.charge(result, call) {
			return false
		}
		if op.operation != call {
			continue
		}
		if !op.finalized || !op.covered || op.referencesIncomplete || op.conversionIncomplete || op.residualMutation || !op.normal || op.key != key || op.frame == nil || op.frame.properties != view || op.frame.population == nil || source.domains[op.frame.declaration] != op.frame.population {
			return false
		}
		entry := op.frame.population.entries[call]
		if entry == nil || source.population.entries[call] != entry || entry.region != nil || !entry.once || entry.statement != op.owner || entry.ordinal >= at.ordinal || len(op.targets) != 1 || op.targets[0].value.node != origin || len(op.targets[0].value.path) != 0 || op.targets[0].value.native != nil {
			return false
		}
		for _, field := range reflectiveDescriptorKeys {
			f, ok := op.fields[field]
			if !ok || f.presence == propertyUnknown || f.incomplete {
				return false
			}
		}
		if op.fields["value"].presence != propertyPresent && op.fields["get"].presence != propertyPresent {
			return false
		}
		matched = true
	}
	return matched
}
