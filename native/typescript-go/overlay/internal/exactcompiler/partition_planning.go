package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

const partitionPlanVersion = 1

type partitionPlanBuilder struct {
	filename        string
	sourceFile      *ast.SourceFile
	plan            PartitionPlan
	nodeIndices     map[string]int
	componentNodes  map[string]string
	islandNodes     []partitionIslandNode
	seenEdges       map[string]struct{}
	renderNodes     map[string]*ast.Node
	continuations   []Continuation
	structuralNodes map[string]string
	registries      []ComponentRegistry
	clientRegions   map[string]string
}

type partitionIslandNode struct {
	componentID string
	start       int
	end         int
	nodeID      string
	priority    int
}

type partitionEdgeInput struct {
	parent      string
	child       string
	kind        string
	cardinality string
	fallback    string
	sourceID    string
	start       int
	length      int
	renderPath  []string
}

type partitionStructuralFrame struct {
	node        *ast.Node
	kind        string
	edgeKind    string
	cardinality string
	reason      string
}

// createPartitionPlan constructs the build-scoped recursive partition graph
// consumed by target lowering, range contracts, runtime authority, and tooling.
func createPartitionPlan(
	sourceFile *ast.SourceFile,
	buildKey string,
	components []Component,
	clientIslands map[*ast.Node]clientElementIsland,
	enhancements enhancementImports,
	continuations []Continuation,
	registries []ComponentRegistry,
) PartitionPlan {
	if buildKey == "" {
		buildKey = exactStableID(
			sourceFile.FileName(),
			"partition-build",
			strconv.Itoa(partitionPlanVersion),
		)
	}
	builder := &partitionPlanBuilder{
		filename:        sourceFile.FileName(),
		sourceFile:      sourceFile,
		plan:            PartitionPlan{Version: partitionPlanVersion, BuildKey: buildKey},
		nodeIndices:     make(map[string]int),
		componentNodes:  make(map[string]string),
		seenEdges:       make(map[string]struct{}),
		renderNodes:     indexJSXRenderNodes(sourceFile),
		continuations:   continuations,
		structuralNodes: make(map[string]string),
		registries:      registries,
		clientRegions:   make(map[string]string),
	}
	for _, component := range components {
		builder.addComponent(component)
	}
	builder.addEnhancementComponents(sourceFile, components, enhancements)
	builder.addClientIslands(clientIslands)
	builder.addRenderEdges(components)
	builder.addClientBoundaryChildRegions(components)
	builder.finish()
	return builder.plan
}

func (builder *partitionPlanBuilder) addComponent(component Component) string {
	if existing := builder.componentNodes[component.ID]; existing != "" {
		return existing
	}
	id := exactStableID(builder.filename, "partition", component.ID, "component")
	placement, conservative, reason := partitionPlacement(component.Placement)
	node := PartitionPlanNode{
		ID:                id,
		Kind:              "component",
		ComponentContract: component.ID,
		OwnerComponent:    id,
		Placement:         placement,
		ArtifactTargets:   partitionArtifactTargets(component.ArtifactTargets, placement),
		Activation:        partitionActivation(placement),
		RefreshAuthority:  partitionRefreshAuthority(placement),
		Start:             component.Start,
		Length:            component.Length,
		Conservative:      conservative,
		Reason:            reason,
	}
	builder.addNode(node)
	builder.componentNodes[component.ID] = id
	builder.plan.Roots = append(builder.plan.Roots, id)
	return id
}

func (builder *partitionPlanBuilder) addExternalComponent(edge RenderEdge) string {
	edgeStart, edgeLength := builder.renderSpan(edge.Path)
	contract := edge.ComponentID
	if contract == "" {
		contract = exactStableID(builder.filename, "partition", edge.ID, "unresolved-component")
	}
	if existing := builder.componentNodes[contract]; existing != "" {
		return existing
	}
	placement, conservative, reason := partitionPlacement(edge.Placement)
	if edge.ComponentID == "" {
		conservative = true
		if edge.ModuleSpecifier != "" {
			// Static package edges are deliberately opaque to the per-module compiler.
			// The shared build host validates their published component catalogs before
			// execution, so absence of an in-module contract is not itself actionable.
			reason = "external render edge awaits build-host component catalog resolution"
		} else {
			reason = "render edge has no compiler-branded native component contract"
		}
	}
	if conservative && edge.ModuleSpecifier == "" {
		reason = "unresolved foreign render edge " + edge.Name + ": " + reason
	}
	id := exactStableID(builder.filename, "partition", contract, "component")
	builder.addNode(PartitionPlanNode{
		ID:                id,
		Kind:              "component",
		ComponentContract: contract,
		OwnerComponent:    id,
		Placement:         placement,
		ArtifactTargets:   partitionArtifactTargets(nil, placement),
		Activation:        partitionActivation(placement),
		RefreshAuthority:  partitionRefreshAuthority(placement),
		Conservative:      conservative,
		Reason:            reason,
		Start:             edgeStart,
		Length:            edgeLength,
		RenderPath:        nonemptyPartitionPath(edge.Path),
	})
	builder.componentNodes[contract] = id
	return id
}

func (builder *partitionPlanBuilder) addClientIslands(
	clientIslands map[*ast.Node]clientElementIsland,
) {
	islands := make([]clientElementIsland, 0, len(clientIslands))
	for _, island := range clientIslands {
		islands = append(islands, island)
	}
	sort.Slice(islands, func(left int, right int) bool {
		if islands[left].node.Pos() != islands[right].node.Pos() {
			return islands[left].node.Pos() < islands[right].node.Pos()
		}
		return islands[left].id < islands[right].id
	})
	for _, island := range islands {
		owner := builder.componentNodes[island.component.ID]
		if owner == "" {
			continue
		}
		activation := "eager"
		if island.interaction {
			activation = "interaction"
		}
		id := exactStableID(builder.filename, "partition", island.id, "client-region")
		builder.addNode(PartitionPlanNode{
			ID:                 id,
			Kind:               "region",
			OwnerComponent:     owner,
			Placement:          "client",
			ArtifactTargets:    []string{"client"},
			Activation:         activation,
			RefreshAuthority:   "client",
			Start:              island.node.Pos(),
			Length:             island.node.End() - island.node.Pos(),
			RenderPath:         []string{strconv.Itoa(island.node.Pos())},
			ActivationDecision: &island.activation,
		})
		builder.addEdge(partitionEdgeInput{
			parent: owner, child: id, kind: "client-range", cardinality: "one",
			fallback: owner, sourceID: island.id, start: island.node.Pos(),
			length:     island.node.End() - island.node.Pos(),
			renderPath: []string{strconv.Itoa(island.node.Pos())},
		})
		builder.islandNodes = append(builder.islandNodes, partitionIslandNode{
			componentID: island.component.ID,
			start:       island.node.Pos(),
			end:         island.node.End(),
			nodeID:      id,
			priority:    2,
		})
	}
}

func (builder *partitionPlanBuilder) addRenderEdges(components []Component) {
	for _, component := range components {
		owner := builder.componentNodes[component.ID]
		if owner == "" {
			continue
		}
		for _, edge := range component.RenderEdges {
			edgeStart, edgeLength := builder.renderSpan(edge.Path)
			child := builder.componentNodes[edge.ComponentID]
			if child == "" {
				child = builder.addExternalComponent(edge)
			}
			parent := builder.containingIsland(component.ID, edge.Path)
			if parent == "" {
				parent = owner
			}
			structuralKind := ""
			structuralCardinality := "one"
			parent, structuralKind, structuralCardinality = builder.structuralParent(
				owner,
				parent,
				builder.renderNodes[edge.Path],
			)
			parent, structuralKind, structuralCardinality = builder.registryParent(
				owner, parent, edge, structuralKind, structuralCardinality,
			)
			parentPlacement := builder.plan.Nodes[builder.nodeIndices[parent]].Placement
			childPlacement, _, _ := partitionPlacement(edge.Placement)
			if childPlacement != "either" && childPlacement != parentPlacement {
				regionID := exactStableID(
					builder.filename,
					"partition",
					edge.ID,
					childPlacement+"-region",
				)
				activation := partitionActivation(childPlacement)
				if childPlacement == "server" {
					activation = "inert"
				}
				builder.addNode(PartitionPlanNode{
					ID:               regionID,
					Kind:             "region",
					OwnerComponent:   owner,
					Placement:        childPlacement,
					ArtifactTargets:  partitionArtifactTargets(nil, childPlacement),
					Activation:       activation,
					RefreshAuthority: partitionRefreshAuthority(childPlacement),
					Start:            edgeStart,
					Length:           edgeLength,
					RenderPath:       nonemptyPartitionPath(edge.Path),
				})
				kind := childPlacement + "-range"
				cardinality := "one"
				if structuralKind != "" {
					kind = structuralKind
					cardinality = structuralCardinality
					structuralKind = ""
				}
				builder.addEdge(partitionEdgeInput{
					parent: parent, child: regionID, kind: kind, cardinality: cardinality,
					fallback: parent, sourceID: edge.ID, start: edgeStart,
					length: edgeLength, renderPath: nonemptyPartitionPath(edge.Path),
				})
				if edgeLength > 0 {
					builder.islandNodes = append(builder.islandNodes, partitionIslandNode{
						componentID: component.ID,
						start:       edgeStart,
						end:         edgeStart + edgeLength,
						nodeID:      regionID,
						priority:    2,
					})
				}
				parent = regionID
			}
			if childPlacement == "client" {
				builder.clientRegions[edge.ID] = parent
			}
			componentKind := "component"
			componentCardinality := "one"
			if structuralKind != "" {
				componentKind = structuralKind
				componentCardinality = structuralCardinality
			}
			builder.addEdge(partitionEdgeInput{
				parent: parent, child: child, kind: componentKind, cardinality: componentCardinality,
				fallback: parent, sourceID: edge.ID, start: edgeStart,
				length: edgeLength, renderPath: nonemptyPartitionPath(edge.Path),
			})
		}
	}
}

func (builder *partitionPlanBuilder) addClientBoundaryChildRegions(components []Component) {
	for _, component := range components {
		owner := builder.componentNodes[component.ID]
		for _, renderEdge := range component.RenderEdges {
			if renderEdge.Placement != "client" {
				continue
			}
			node := builder.renderNodes[renderEdge.Path]
			if node == nil || !ast.IsJsxElement(node) ||
				!jsxChildrenRequireServerSlot(node.AsJsxElement().Children) {
				continue
			}
			parent := builder.clientRegions[renderEdge.ID]
			if parent == "" {
				parent = owner
			}
			for _, child := range ast.GetSemanticJsxChildren(node.AsJsxElement().Children.Nodes) {
				start, end, retained := partitionChildSpan(child)
				if !retained || builder.hasPartitionRangeAt(start) {
					continue
				}
				placement := "server"
				artifactTargets := []string{"server"}
				activation := "inert"
				refreshAuthority := "server"
				kind := "server-range"
				unknownName, unknown := builder.unknownPartitionComponentChild(child, start)
				conservative := builder.hasConservativeComponentAt(start) || unknown
				reason := ""
				if conservative {
					placement = "either"
					artifactTargets = []string{"client", "server"}
					activation = "eager"
					refreshAuthority = "none"
					kind = "region"
					reason = "unknown child remains in the narrowest unsplit region"
				}
				regionID := exactStableID(
					builder.filename,
					"partition",
					renderEdge.ID,
					"server-child",
					strconv.Itoa(start),
				)
				builder.addNode(PartitionPlanNode{
					ID: regionID, Kind: "region", OwnerComponent: owner,
					Placement: placement, ArtifactTargets: artifactTargets,
					Activation: activation, RefreshAuthority: refreshAuthority,
					Start: start, Length: end - start, RenderPath: []string{strconv.Itoa(start)},
					Conservative: conservative, Reason: reason,
				})
				builder.addEdge(partitionEdgeInput{
					parent: parent, child: regionID, kind: kind, cardinality: "one",
					fallback: parent, sourceID: renderEdge.ID + ":child:" + strconv.Itoa(start),
					start: start, length: end - start, renderPath: []string{strconv.Itoa(start)},
				})
				if unknown {
					componentID := exactStableID(
						builder.filename, "partition", renderEdge.ID,
						"unknown-component", strconv.Itoa(start),
					)
					builder.addNode(PartitionPlanNode{
						ID: componentID, Kind: "component", ComponentContract: componentID,
						OwnerComponent: componentID, Placement: "either",
						ArtifactTargets: []string{"client", "server"}, Activation: "eager",
						RefreshAuthority: "none", Start: start, Length: end - start,
						RenderPath: []string{strconv.Itoa(start)}, Conservative: true,
						Reason: "unresolved foreign render edge " + unknownName +
							": render edge has no compiler-branded native component contract",
					})
					builder.addEdge(partitionEdgeInput{
						parent: regionID, child: componentID, kind: "component", cardinality: "one",
						fallback: regionID, sourceID: componentID, start: start, length: end - start,
						renderPath: []string{strconv.Itoa(start)},
					})
				}
			}
		}
	}
}

func partitionChildSpan(child *ast.Node) (int, int, bool) {
	if ast.IsJsxText(child) {
		if normalizeJSXText(child.AsJsxText().Text) == "" {
			return 0, 0, false
		}
		return child.Pos(), child.End(), true
	}
	if ast.IsJsxExpression(child) {
		expression := child.AsJsxExpression().Expression
		if expression == nil {
			return 0, 0, false
		}
		return expression.Pos(), expression.End(), true
	}
	return child.Pos(), child.End(), true
}

func (builder *partitionPlanBuilder) hasPartitionRangeAt(start int) bool {
	for _, edge := range builder.plan.Edges {
		if edge.Start == start && edge.Kind != "component" && edge.Kind != "enhancement" {
			return true
		}
	}
	return false
}

func (builder *partitionPlanBuilder) hasConservativeComponentAt(start int) bool {
	for _, edge := range builder.plan.Edges {
		if edge.Start != start || edge.Kind != "component" {
			continue
		}
		if index, exists := builder.nodeIndices[edge.Child]; exists &&
			builder.plan.Nodes[index].Conservative {
			return true
		}
	}
	return false
}

func (builder *partitionPlanBuilder) unknownPartitionComponentChild(
	child *ast.Node,
	start int,
) (string, bool) {
	var tag *ast.Node
	if ast.IsJsxElement(child) {
		tag = child.AsJsxElement().OpeningElement.TagName()
	} else if ast.IsJsxSelfClosingElement(child) {
		tag = child.AsJsxSelfClosingElement().TagName
	} else {
		return "", false
	}
	name := sourceText(builder.sourceFile, tag)
	if name == "" || name[0] < 'A' || name[0] > 'Z' {
		return "", false
	}
	for _, edge := range builder.plan.Edges {
		if edge.Start == start && edge.Kind == "component" {
			return "", false
		}
	}
	return name, true
}

func (builder *partitionPlanBuilder) registryParent(
	owner string,
	parent string,
	edge RenderEdge,
	outgoingKind string,
	outgoingCardinality string,
) (string, string, string) {
	for _, registry := range builder.registries {
		matches := false
		for _, entry := range registry.Entries {
			if entry.ComponentID == edge.ComponentID {
				matches = true
				break
			}
		}
		if !matches || len(registry.Entries) < 2 {
			continue
		}
		key := owner + ":registry:" + registry.ID + ":" + edge.Path
		id := builder.structuralNodes[key]
		if id == "" {
			id = exactStableID(builder.filename, "partition", key)
			builder.structuralNodes[key] = id
			start, length := builder.renderSpan(edge.Path)
			parentNode := builder.plan.Nodes[builder.nodeIndices[parent]]
			builder.addNode(PartitionPlanNode{
				ID: id, Kind: "conditional-template", OwnerComponent: owner,
				Placement:       parentNode.Placement,
				ArtifactTargets: append([]string(nil), parentNode.ArtifactTargets...),
				Activation:      parentNode.Activation, RefreshAuthority: parentNode.RefreshAuthority,
				Start: start, Length: length, RenderPath: nonemptyPartitionPath(edge.Path),
				Reason: "finite component registry " + registry.Name,
			})
			kind := outgoingKind
			cardinality := outgoingCardinality
			if kind == "" {
				kind = "region"
				cardinality = "one"
			}
			builder.addEdge(partitionEdgeInput{
				parent: parent, child: id, kind: kind, cardinality: cardinality,
				fallback: parent, sourceID: key, start: start, length: length,
				renderPath: nonemptyPartitionPath(edge.Path),
			})
		}
		return id, "branch", "branch"
	}
	return parent, outgoingKind, outgoingCardinality
}

func (builder *partitionPlanBuilder) structuralParent(
	owner string,
	parent string,
	renderNode *ast.Node,
) (string, string, string) {
	if renderNode == nil {
		return parent, "", "one"
	}
	frames := []partitionStructuralFrame{}
	for current := renderNode.Parent; current != nil; current = current.Parent {
		if ast.IsConditionalExpression(current) {
			frames = append(frames, partitionStructuralFrame{
				node: current, kind: "conditional-template", edgeKind: "branch", cardinality: "branch",
			})
			continue
		}
		if ast.IsCallExpression(current) && partitionMapCall(current) {
			frames = append(frames, partitionStructuralFrame{
				node: current, kind: "keyed-template", edgeKind: "keyed-item", cardinality: "many-keyed",
			})
			continue
		}
		if ast.IsJsxElement(current) {
			tag := sourceText(builder.sourceFile, current.AsJsxElement().OpeningElement.TagName())
			switch tag {
			case "Suspense":
				frames = append(frames, partitionStructuralFrame{
					node: current, kind: "readiness-boundary", edgeKind: "readiness", cardinality: "branch",
				})
			case "Activity":
				frames = append(frames, partitionStructuralFrame{
					node: current, kind: "region", edgeKind: "region", cardinality: "one",
					reason: "Activity retention boundary",
				})
			}
		}
	}
	for left, right := 0, len(frames)-1; left < right; left, right = left+1, right-1 {
		frames[left], frames[right] = frames[right], frames[left]
	}
	outgoingKind := "region"
	outgoingCardinality := "one"
	for _, frame := range frames {
		key := owner + ":" + frame.kind + ":" + strconv.Itoa(frame.node.Pos())
		id := builder.structuralNodes[key]
		if id == "" {
			id = exactStableID(builder.filename, "partition", key)
			builder.structuralNodes[key] = id
			placement := "either"
			artifacts := []string{"client", "server"}
			activation := "eager"
			refreshAuthority := "none"
			if parentIndex, exists := builder.nodeIndices[parent]; exists {
				parentNode := builder.plan.Nodes[parentIndex]
				placement = parentNode.Placement
				artifacts = append([]string(nil), parentNode.ArtifactTargets...)
				activation = parentNode.Activation
				refreshAuthority = parentNode.RefreshAuthority
			}
			builder.addNode(PartitionPlanNode{
				ID: id, Kind: frame.kind, OwnerComponent: owner, Placement: placement,
				ArtifactTargets: artifacts, Activation: activation,
				RefreshAuthority: refreshAuthority, Start: frame.node.Pos(),
				Length:     frame.node.End() - frame.node.Pos(),
				RenderPath: []string{strconv.Itoa(frame.node.Pos())}, Reason: frame.reason,
			})
		}
		builder.addEdge(partitionEdgeInput{
			parent: parent, child: id, kind: outgoingKind, cardinality: outgoingCardinality,
			fallback: parent, sourceID: key, start: frame.node.Pos(),
			length:     frame.node.End() - frame.node.Pos(),
			renderPath: []string{strconv.Itoa(frame.node.Pos())},
		})
		parent = id
		outgoingKind = frame.edgeKind
		outgoingCardinality = frame.cardinality
	}
	if len(frames) == 0 {
		return parent, "", "one"
	}
	return parent, outgoingKind, outgoingCardinality
}

func partitionMapCall(node *ast.Node) bool {
	call := node.AsCallExpression()
	return ast.IsPropertyAccessExpression(call.Expression) &&
		call.Expression.AsPropertyAccessExpression().Name().Text() == "map"
}

func (builder *partitionPlanBuilder) containingIsland(
	componentID string,
	path string,
) string {
	position, err := strconv.Atoi(path)
	if err != nil {
		return ""
	}
	best := ""
	width := int(^uint(0) >> 1)
	priority := -1
	for _, island := range builder.islandNodes {
		if island.componentID != componentID || position < island.start || position >= island.end {
			continue
		}
		if candidate := island.end - island.start; candidate < width ||
			(candidate == width && island.priority > priority) {
			best = island.nodeID
			width = candidate
			priority = island.priority
		}
	}
	return best
}

func (builder *partitionPlanBuilder) addEnhancementComponents(
	sourceFile *ast.SourceFile,
	components []Component,
	enhancements enhancementImports,
) {
	if len(enhancements.applications) == 0 {
		return
	}
	candidates := activeComponentCandidates(sourceFile)
	if len(candidates) != len(components) {
		return
	}
	for _, element := range collectComponentElements(sourceFile, nil) {
		ownerIndex := componentOwnerIndex(element.node, candidates)
		if ownerIndex < 0 || ownerIndex >= len(components) {
			continue
		}
		owner := builder.componentNodes[components[ownerIndex].ID]
		parent := owner
		priority := 1
		attributes := jsxOpeningAttributes(element.node)
		if attributes == nil {
			continue
		}
		application := enhancements.applications[attributes.Pos()]
		for _, component := range application.components {
			id := exactStableID(
				builder.filename,
				"partition",
				component.identity,
				strconv.Itoa(element.node.Pos()),
			)
			builder.addNode(PartitionPlanNode{
				ID:                id,
				Kind:              "enhancement-component",
				ComponentContract: component.identity,
				OwnerComponent:    id,
				Placement:         "either",
				ArtifactTargets:   []string{"client", "server"},
				Activation:        "eager",
				RefreshAuthority:  "none",
				Start:             element.fullStart,
				Length:            element.fullEnd - element.fullStart,
				RenderPath:        []string{strconv.Itoa(element.node.Pos())},
				Optional:          true,
				ActivationDecision: &ActivationDecision{
					Mode: "eager",
					Reasons: []ActivationReason{{
						Code: "enhancement-setup", Start: element.fullStart,
						Length: element.fullEnd - element.fullStart,
					}},
					Targets: []ActivationTarget{},
				},
			})
			builder.addEdge(partitionEdgeInput{
				parent: parent, child: id, kind: "enhancement", cardinality: "optional",
				fallback: parent, sourceID: id, start: element.fullStart,
				length:     element.fullEnd - element.fullStart,
				renderPath: []string{strconv.Itoa(element.node.Pos())},
			})
			builder.islandNodes = append(builder.islandNodes, partitionIslandNode{
				componentID: components[ownerIndex].ID,
				start:       element.fullStart,
				end:         element.fullEnd,
				nodeID:      id,
				priority:    priority,
			})
			parent = id
			priority++
		}
	}
}

func (builder *partitionPlanBuilder) addNode(node PartitionPlanNode) {
	if _, exists := builder.nodeIndices[node.ID]; exists {
		return
	}
	node.ArtifactTargets = nonNilSlice(node.ArtifactTargets)
	node.RenderPath = nonNilSlice(node.RenderPath)
	node.ChildEdges = []string{}
	builder.plan.Nodes = append(builder.plan.Nodes, node)
	builder.nodeIndices[node.ID] = len(builder.plan.Nodes) - 1
}

func (builder *partitionPlanBuilder) addEdge(input partitionEdgeInput) {
	id := exactStableID(
		builder.filename,
		"partition-edge",
		input.parent,
		input.child,
		input.kind,
		input.sourceID,
	)
	if _, exists := builder.seenEdges[id]; exists {
		return
	}
	builder.seenEdges[id] = struct{}{}
	builder.plan.Edges = append(builder.plan.Edges, PartitionPlanEdge{
		ID:          id,
		Parent:      input.parent,
		Child:       input.child,
		Kind:        input.kind,
		Cardinality: input.cardinality,
		Data:        []PartitionPlanDataSlot{},
		Fallback:    input.fallback,
		Start:       input.start,
		Length:      input.length,
		RenderPath:  nonNilSlice(input.renderPath),
	})
}

func (builder *partitionPlanBuilder) renderSpan(path string) (int, int) {
	node := builder.renderNodes[path]
	if node == nil {
		return 0, 0
	}
	return node.Pos(), node.End() - node.Pos()
}

func (builder *partitionPlanBuilder) finish() {
	builder.populateCrossingDataSlots()
	sort.Strings(builder.plan.Roots)
	sort.Slice(builder.plan.Nodes, func(left int, right int) bool {
		return builder.plan.Nodes[left].ID < builder.plan.Nodes[right].ID
	})
	sort.Slice(builder.plan.Edges, func(left int, right int) bool {
		return builder.plan.Edges[left].ID < builder.plan.Edges[right].ID
	})
	children := make(map[string][]string)
	for _, edge := range builder.plan.Edges {
		children[edge.Parent] = append(children[edge.Parent], edge.ID)
	}
	for index := range builder.plan.Nodes {
		builder.plan.Nodes[index].ChildEdges = nonNilSlice(children[builder.plan.Nodes[index].ID])
		sort.Strings(builder.plan.Nodes[index].ChildEdges)
	}
}

func (builder *partitionPlanBuilder) populateCrossingDataSlots() {
	placements := partitionNodePlacements(builder.plan.Nodes)
	for edgeIndex := range builder.plan.Edges {
		edge := &builder.plan.Edges[edgeIndex]
		if !partitionEdgeCrossesIntoServer(*edge, placements) {
			continue
		}
		contracts := builder.descendantComponentContracts(edge.Child)
		slots := make(map[string]PartitionPlanDataSlot)
		for _, continuation := range builder.continuations {
			if _, relevant := contracts[continuation.ComponentID]; !relevant {
				continue
			}
			for _, read := range continuation.Activation.StateReads {
				builder.addDataSlot(slots, edge.ID, "state", read.Path, "client-to-server", "snapshot", "either")
			}
			for _, dependency := range continuation.Activation.Dependencies {
				kind := "capture"
				name := dependency.Path
				if dependency.Source == "prop" {
					kind = "prop"
				}
				if name == "" {
					name = dependency.Source + ":" + strconv.Itoa(dependency.Index)
				}
				builder.addDataSlot(slots, edge.ID, kind, name, "client-to-server", "snapshot", "either")
			}
			for _, context := range continuation.Activation.PublicContexts {
				builder.addDataSlot(slots, edge.ID, "public-context", context.Token, "client-to-server", "snapshot", "either")
			}
			for _, context := range continuation.Activation.ServerContexts {
				builder.addDataSlot(slots, edge.ID, "server-context-name", context.Token, "host-resolved", "context-lookup", "server")
			}
			for _, write := range continuation.Effects.StateWrites {
				builder.addDataSlot(slots, edge.ID, "state", write.Path, "server-to-client", "ordered-delta", "either")
			}
			for _, context := range continuation.Effects.ContextWrites {
				builder.addDataSlot(slots, edge.ID, "public-context", context.Token, "server-to-client", "ordered-delta", "either")
			}
		}
		edge.Data = make([]PartitionPlanDataSlot, 0, len(slots))
		for _, slot := range slots {
			edge.Data = append(edge.Data, slot)
		}
		sort.Slice(edge.Data, func(left int, right int) bool {
			return edge.Data[left].ID < edge.Data[right].ID
		})
	}
}

func (builder *partitionPlanBuilder) descendantComponentContracts(root string) map[string]struct{} {
	result := make(map[string]struct{})
	visited := make(map[string]struct{})
	var visit func(string)
	visit = func(id string) {
		if _, seen := visited[id]; seen {
			return
		}
		visited[id] = struct{}{}
		if index, exists := builder.nodeIndices[id]; exists {
			if contract := builder.plan.Nodes[index].ComponentContract; contract != "" {
				result[contract] = struct{}{}
			}
		}
		for _, edge := range builder.plan.Edges {
			if edge.Parent == id {
				visit(edge.Child)
			}
		}
	}
	visit(root)
	return result
}

func (builder *partitionPlanBuilder) addDataSlot(
	slots map[string]PartitionPlanDataSlot,
	edgeID string,
	kind string,
	name string,
	direction string,
	transfer string,
	residency string,
) {
	id := exactStableID(builder.filename, "partition-data", edgeID, kind, name, direction)
	slots[id] = PartitionPlanDataSlot{
		ID: id, Kind: kind, Direction: direction, Transfer: transfer, Residency: residency,
	}
}

func partitionPlacement(value string) (string, bool, string) {
	switch value {
	case "client":
		return "client", false, ""
	case "server":
		return "server", false, ""
	case "isomorphic":
		return "either", false, ""
	default:
		return "either", true, "placement remains unresolved; the enclosing region must stay conservative"
	}
}

func partitionPlanDiagnostics(plan PartitionPlan) []Diagnostic {
	diagnostics := []Diagnostic{}
	for _, node := range plan.Nodes {
		if node.Kind != "component" || !node.Conservative ||
			!strings.HasPrefix(node.Reason, "unresolved foreign render edge ") {
			continue
		}
		diagnostics = append(diagnostics, Diagnostic{
			Severity: "warning",
			Code:     "EXACT2212",
			Message: "warning: " + node.Reason +
				"; the narrowest enclosing region remains unsplit. Configure a compatibility adapter or use a compiler-branded native component contract",
			Start:  node.Start,
			Length: node.Length,
		})
	}
	return diagnostics
}

func partitionArtifactTargets(targets []string, placement string) []string {
	if len(targets) != 0 {
		result := append([]string(nil), targets...)
		sort.Strings(result)
		return result
	}
	switch placement {
	case "client":
		return []string{"client"}
	case "server":
		return []string{"server"}
	default:
		return []string{"client", "server"}
	}
}

func partitionActivation(placement string) string {
	if placement == "server" {
		return "server-only"
	}
	return "eager"
}

func partitionRefreshAuthority(placement string) string {
	switch placement {
	case "client", "server":
		return placement
	default:
		return "none"
	}
}

func nonemptyPartitionPath(path string) []string {
	if path == "" {
		return []string{}
	}
	return []string{path}
}

func partitionBoundaryRecords(plan PartitionPlan) []Boundary {
	nodes := make(map[string]PartitionPlanNode, len(plan.Nodes))
	for _, node := range plan.Nodes {
		nodes[node.ID] = node
	}
	result := []Boundary{}
	placements := partitionNodePlacements(plan.Nodes)
	for _, edge := range plan.Edges {
		crossing := partitionEdgeCrossesIntoServer(edge, placements)
		structuralBranch := partitionStructuralBranchRange(edge, nodes, placements, plan.Edges)
		if !crossing && !structuralBranch {
			continue
		}
		region := nodes[edge.Child]
		owner := nodes[region.OwnerComponent]
		patchTargets := descendantPartitionRangeEdges(edge, placements, plan.Edges)
		discriminatorKind := "single"
		discriminatorValues := []string{}
		if edge.Kind == "branch" || structuralBranch {
			discriminatorKind = "branch"
			if structuralBranch {
				for _, branch := range plan.Edges {
					if branch.Parent == edge.Child && branch.Kind == "branch" {
						discriminatorValues = append(discriminatorValues, branch.ID)
					}
				}
			} else {
				discriminatorValues = append(discriminatorValues, edge.ID)
			}
			sort.Strings(discriminatorValues)
		} else if edge.Kind == "keyed-item" {
			discriminatorKind = "keyed"
		}
		result = append(result, Boundary{
			ID: edge.ID, Name: "partition-range", ComponentID: owner.ComponentContract,
			OwnerComponentID: owner.ComponentContract, RenderPath: firstPartitionPath(edge.RenderPath),
			Kind: "partition-range", PlanVersion: plan.Version, BuildKey: plan.BuildKey,
			PlanEdgeID: edge.ID, ParentPlanID: edge.Parent, FallbackPlanID: edge.Fallback,
			PatchTargets: patchTargets, DiscriminatorKind: discriminatorKind,
			DiscriminatorValues: discriminatorValues, Generation: 1,
		})
	}
	return result
}

func partitionStructuralBranchRange(
	edge PartitionPlanEdge,
	nodes map[string]PartitionPlanNode,
	placements map[string]string,
	edges []PartitionPlanEdge,
) bool {
	if nodes[edge.Child].Kind != "conditional-template" {
		return false
	}
	seen := map[string]struct{}{}
	queue := []string{edge.Child}
	for len(queue) != 0 {
		current := queue[0]
		queue = queue[1:]
		if _, exists := seen[current]; exists {
			continue
		}
		seen[current] = struct{}{}
		for _, candidate := range edges {
			if candidate.Parent != current {
				continue
			}
			if partitionEdgeCrossesIntoServer(candidate, placements) {
				return true
			}
			queue = append(queue, candidate.Child)
		}
	}
	return false
}

func partitionNodePlacements(nodes []PartitionPlanNode) map[string]string {
	placements := make(map[string]string, len(nodes))
	for _, node := range nodes {
		placements[node.ID] = node.Placement
	}
	return placements
}

func partitionEdgeCrossesIntoServer(edge PartitionPlanEdge, placements map[string]string) bool {
	return placements[edge.Parent] != "server" && placements[edge.Child] == "server"
}

func descendantPartitionRangeEdges(
	root PartitionPlanEdge,
	placements map[string]string,
	edges []PartitionPlanEdge,
) []string {
	result := []string{root.ID}
	seenNodes := map[string]struct{}{}
	queue := []string{root.Child}
	for len(queue) != 0 {
		node := queue[0]
		queue = queue[1:]
		if _, seen := seenNodes[node]; seen {
			continue
		}
		seenNodes[node] = struct{}{}
		for _, edge := range edges {
			if edge.Parent != node {
				continue
			}
			if partitionEdgeCrossesIntoServer(edge, placements) {
				result = append(result, edge.ID)
			}
			queue = append(queue, edge.Child)
		}
	}
	sort.Strings(result)
	return result
}

func firstPartitionPath(path []string) string {
	if len(path) == 0 {
		return ""
	}
	return path[0]
}

func attachPartitionBoundaries(
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
) {
	byComponent := make(map[string][]string)
	for _, boundary := range boundaries {
		if boundary.Kind == "partition-range" && boundary.ComponentID != "" {
			byComponent[boundary.ComponentID] = append(byComponent[boundary.ComponentID], boundary.ID)
		}
	}
	for index := range continuations {
		continuations[index].Effects.Boundaries = appendUniquePartitionStrings(
			continuations[index].Effects.Boundaries,
			byComponent[continuations[index].ComponentID]...,
		)
		sort.Strings(continuations[index].Effects.Boundaries)
	}
	for index := range resumptions {
		resumptions[index].Client.Boundaries = appendUniquePartitionStrings(
			resumptions[index].Client.Boundaries,
			byComponent[resumptions[index].ComponentID]...,
		)
		sort.Strings(resumptions[index].Client.Boundaries)
	}
}

func appendUniquePartitionStrings(values []string, additions ...string) []string {
	seen := make(map[string]struct{}, len(values)+len(additions))
	result := make([]string, 0, len(values)+len(additions))
	for _, value := range append(append([]string(nil), values...), additions...) {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
