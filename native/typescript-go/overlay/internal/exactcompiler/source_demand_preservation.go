package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDemandStandardPremises explicitly separates standard descriptor axioms
// from native value identity. They are conditional seeds for I(P), established
// by the compilation-owned standard definition model, then preserved by all
// admitted source recipes. No polyfill implementation or consumer history is
// certified here.
type sourceDemandStandardPremises struct {
	root, member, prototype                                         *ast.Node
	rootData, memberData, prototypeData, ordinaryLink, terminalNull bool
}

// sourceDemandPreservation is a sealed, view-owned induction result. It retains
// no frame, callbacks or active proof state. Conditional standard descriptor
// premises are valid only for the exact source selection checked below.
type sourceDemandPreservation struct {
	property        *sourcePropertyReferenceView
	view            *sourceNormalViewIdentity
	prototype       *ast.Node
	standard        sourceDemandStandardPremises
	edges           []sourcePropertyDependency
	owner           *sourceValueOwner
	generation      *projectGeneration
	seeds           map[*ast.Node]sourceNativeKind
	sources         map[*ast.SourceFile]*sourceNormalSourceIdentity
	fields          map[string]bool
	calls           map[*ast.Node]*ast.Node
	staticIntrinsic map[*ast.Node]bool
}

// checkDemandPreservation checks the finite demand dependency closure against
// every selected initialization and regional recipe. The entry invariant is a
// checker-local assumption. Only the final return can publish a certificate.
// Every recipe event and join is charged. There is no fixed point or body replay.
// This restricted slice refuses writes, mutable aliases and opaque work.
// Ordinary source declarations compose only after a completed acyclic check.
func (query *sourceValueQuery) checkDemandPreservation(v *sourcePropertyReferenceView, result *accessorCandidates) *sourceDemandPreservation {
	if v == nil || v.state != sourcePropertyComplete || v.incomplete || !v.normalSelectionDone || v.normalIdentity == nil || len(v.sources) == 0 {
		return nil
	}
	candidate := &sourceDemandPreservation{property: v, view: v.normalIdentity, owner: query.owner, generation: query.owner.generation, seeds: map[*ast.Node]sourceNativeKind{}, sources: map[*ast.SourceFile]*sourceNormalSourceIdentity{}, fields: map[string]bool{}, calls: map[*ast.Node]*ast.Node{}}
	// The conversion contract supplies all six dependent absence demands, rather
	// than seeding a single occurrence's currently requested field.
	for _, key := range reflectiveDescriptorKeys {
		candidate.fields[key] = true
	}
	for _, edge := range v.edges {
		if !query.charge(result, edge.edge) {
			return nil
		}
		if edge.state == sourceDependencyErased {
			if edge.source != nil || edge.target != nil {
				return nil
			}
			continue
		}
		if edge.state != sourceDependencyAvailable || edge.source == nil || edge.target == nil || v.normalSources[edge.source] != edge.target || edge.target.cyclic {
			return nil
		}
	}
	// These standard seeds are selected through the existing native seed owners.
	// They are assumptions only while the complete source inventory is checked.
	seedQuery := sourceValueQuery{owner: query.owner}
	nativeMember := func(node *ast.Node) bool {
		if node == nil || !(ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) || !query.charge(result, node) {
			return false
		}
		receiver, key := accessorReceiver(node)
		if receiver == nil || key == "" || !ast.IsIdentifier(receiver) {
			return false
		}
		root, path := seedQuery.nativePromiseEntry(node, receiver, []string{key})
		if root == nil || root.native == nil || len(path) != 1 || root.native.kind != sourceNativeObjectConstructor {
			return false
		}
		temporary := accessorCandidates{}
		_, member, ok := seedQuery.nativeMemberSeed(*root, key, nil, &temporary)
		if !ok || temporary.opaque || member.native == nil || member.native.kind != sourceNativeObjectDefineProperty {
			return false
		}
		// Object.prototype is the dependency of an ordinary literal's default
		// prototype edge. Its descriptor and terminal intrinsic chain are explicit
		// conditional standard seeds, covered by the same global preservation check.
		global, _ := seedQuery.nativeRootDeclaration(root.node)
		if global == nil {
			return false
		}
		prototype := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeOfSymbol(global), "prototype")
		if prototype == nil || prototype.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(prototype.ValueDeclaration)) {
			return false
		}
		if candidate.prototype != nil && candidate.prototype != prototype.ValueDeclaration {
			return false
		}
		candidate.prototype = prototype.ValueDeclaration
		candidate.standard = sourceDemandStandardPremises{root: root.node, member: member.node, prototype: prototype.ValueDeclaration, rootData: true, memberData: true, prototypeData: true, ordinaryLink: true, terminalNull: true}
		candidate.seeds[root.node] = root.native.kind
		candidate.seeds[member.node] = member.native.kind
		return true
	}
	// This map records use of the separately authorized static-intrinsic premise.
	staticIntrinsic := map[*ast.Node]bool{}
	roots := map[*ast.Node]bool{}
	for _, source := range v.sources {
		selected := v.normalSources[source]
		if selected == nil || selected.source != source || selected.cyclic || selected.population == nil || !query.charge(result, source.AsNode()) {
			return nil
		}
		index := query.owner.index(source)
		if index.incomplete || index.normalDynamicScope {
			return nil
		}
		roots[source.AsNode()] = true
		for _, entry := range index.normalOccurrences {
			if !query.charge(result, entry.node) {
				return nil
			}
			if entry.region != nil {
				roots[entry.region] = true
			}
		}
		for _, region := range index.operationRegions {
			if !query.charge(result, source.AsNode()) {
				return nil
			}
			// A possible alias write is not proved disjoint by an empty origin list.
			if len(region.writes) != 0 || len(region.openCalls) != 0 {
				return nil
			}
			for _, hazard := range region.hazards {
				if !query.admitStaticIntrinsicPreservation(hazard, staticIntrinsic, result) {
					return nil
				}
			}
		}
		candidate.sources[source] = selected
	}
	// Active obligations are not memoized successes. Each root is checked once,
	// with source-call edges charged by their callers. A cycle refuses the whole
	// candidate, including any completed siblings, before outward publication.
	states := map[*ast.Node]uint8{}
	var checkRoot func(*ast.Node) bool
	checkRoot = func(root *ast.Node) (complete bool) {
		if !roots[root] || !query.charge(result, root) {
			return false
		}
		if states[root] != 0 {
			return states[root] == 2
		}
		states[root] = 1
		defer func() {
			if complete {
				states[root] = 2
			} else {
				states[root] = 3
			}
		}()

		async, ordinary := ordinaryResultCategory(root)
		if !ast.IsSourceFile(root) && (!ordinary || async || len(root.Parameters()) != 0) {
			return false
		}
		components := map[*ast.Node]bool{}
		readPreserves := func(node *ast.Node) bool {
			// A standard binding read is a data-descriptor premise, conditional on
			// preservation of the same root/member dependencies across this family.
			parent := node.Parent
			if parent != nil && (ast.IsPropertyAccessExpression(parent) || ast.IsElementAccessExpression(parent)) && parent.Expression() == node && nativeMember(parent) {
				return true
			}
			if query.preservationDeclarationRead(node, v, result) != nil {
				return true
			}
			return false
		}
		operationPreserves := func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
				if nativeMember(node) {
					return true
				}
				return false
			}
			if !ast.IsCallExpression(node) {
				return false
			}
			call := node.AsCallExpression()
			args := restrictedInvocationArguments(call)
			if !components[call.Expression] {
				return false
			}
			for _, arg := range args {
				if !query.charge(result, arg) || ast.IsSpreadElement(arg) || !components[arg] {
					return false
				}
			}
			if !nativeMember(call.Expression) {
				body := query.preservationDeclarationRead(call.Expression, v, result)
				if body == nil || !checkRoot(body) {
					return false
				}
				candidate.calls[node] = body
				return true
			}
			if len(args) != 3 {
				return false
			}
			target, descriptor := unwrapSourceCallableReference(args[0]), unwrapSourceCallableReference(args[2])
			// The nominal target is a new ordinary allocation. No alias or returned
			// target recipe is guessed here. Key/descriptor conversion stays separate.
			if target == nil || !ast.IsObjectLiteralExpression(target) || descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) || !sourceMemberKey(args[1]).resolved {
				return false
			}
			// All accessor regions are independently checked by the outer loop.
			// Cached construction folds refuse computed/spread/prototype overrides.
			return true
		}
		for _, demand := range query.owner.summary(root).normal {
			if !query.charge(result, demand.node) {
				return false
			}
			if demand.fold == nil {
				continue
			}
			fold := *demand.fold
			if fold.kind == sourceNormalEnter {
				continue
			}
			components[demand.node] = query.preservationFold(fold, components, staticIntrinsic, readPreserves, operationPreserves, result)
			if !components[demand.node] {
				return false
			}
		}
		if !components[root] || !ast.IsSourceFile(root) && !components[root.Body()] {
			return false
		}
		return true
	}
	for root := range roots {
		if !checkRoot(root) {
			return nil
		}
	}

	if len(candidate.seeds) == 0 || candidate.prototype == nil || len(candidate.sources) != len(v.normalSources) {
		return nil
	}
	candidate.staticIntrinsic = staticIntrinsic
	candidate.edges = append([]sourcePropertyDependency(nil), v.edges...)
	return candidate
}

// demandFamilyPreserved validates the sealed result independently of installed
// activation identity. It excludes only the unresolved family remainder. Actual
// contributions, their conversion residuals and known MAY effects remain owned.
func (query *sourceValueQuery) demandFamilyPreserved(v *sourcePropertyReferenceView, entry *sourcePropertyEntry, key string, result *accessorCandidates) bool {
	if v == nil || entry == nil || !query.charge(result, entry.operation) {
		return false
	}
	proof := v.preservation
	if proof == nil || proof.property != v || proof.prototype == nil || len(proof.seeds) == 0 || v.owner != query.owner || v.program != query.owner.program || v.checker != query.owner.checker || v.generation != query.owner.generation || proof.owner != query.owner || proof.generation != query.owner.generation || proof.view != v.normalIdentity || !proof.fields[key] || proof.sources[entry.source] != v.normalSources[entry.source] {
		return false
	}
	if len(proof.sources) != len(v.normalSources) || len(proof.edges) != len(v.edges) {
		return false
	}
	for source, selected := range proof.sources {
		if !query.charge(result, source.AsNode()) || v.normalSources[source] != selected {
			return false
		}
	}
	for i, edge := range proof.edges {
		if !query.charge(result, edge.edge) || edge != v.edges[i] {
			return false
		}
	}
	seeds := proof.standard
	if seeds.root == nil || seeds.member == nil || seeds.prototype != proof.prototype || !seeds.rootData || !seeds.memberData || !seeds.prototypeData || !seeds.ordinaryLink || !seeds.terminalNull {
		return false
	}
	return v.state == sourcePropertyComplete && !v.incomplete
}
