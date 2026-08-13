package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/internal/ast"
)

func TestPartitionPlanEmitsIndependentServerRangesInsideClientIsland(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-siblings.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ServerSummary() {
				const load = async (_task: TaskContext = TaskContext.server()) => fetchSummary();
				load();
				return () => <p>Summary</p>;
			}
			function ServerPermissions() {
				const load = async (_task: TaskContext = TaskContext.server()) => fetchPermissions();
				load();
				return () => <p>Permissions</p>;
			}
			export function Workspace(this: Component<{ editing: boolean }>) {
				return () => (
					<section onClick={() => this.state.editing = true}>
						<ServerSummary />
						<button onClick={() => undefined}>Edit</button>
						<ServerPermissions />
					</section>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if response.Analysis.PartitionPlan.Version != partitionPlanVersion {
		t.Fatalf("unexpected partition plan version: %#v", response.Analysis.PartitionPlan)
	}
	serverRanges := []PartitionPlanEdge{}
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "server-range" {
			serverRanges = append(serverRanges, edge)
		}
	}
	if len(serverRanges) != 2 {
		t.Fatalf(
			"expected two independent server ranges, received %d: %#v",
			len(serverRanges),
			response.Analysis.PartitionPlan,
		)
	}
	if serverRanges[0].Parent != serverRanges[1].Parent ||
		serverRanges[0].Child == serverRanges[1].Child {
		t.Fatalf("server ranges do not share one client parent with distinct ranges: %#v", serverRanges)
	}
	parent := partitionNodeByID(t, response.Analysis.PartitionPlan, serverRanges[0].Parent)
	if parent.Placement != "client" || parent.Kind != "region" {
		t.Fatalf("server ranges are not nested beneath the client island: %#v", parent)
	}
	for _, edge := range serverRanges {
		node := partitionNodeByID(t, response.Analysis.PartitionPlan, edge.Child)
		if node.Placement != "server" || node.RefreshAuthority != "server" || node.Activation != "inert" {
			t.Fatalf("unexpected server range contract: %#v", node)
		}
	}
}

func TestPartitionPlanNestsServerRangesInsideExplicitClientComponent(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-explicit-client.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ClientShell(props: { children?: unknown }) {
				return () => <div onClick={() => undefined}>{props.children}</div>;
			}
			function ServerSummary() {
				const load = async (_task: TaskContext = TaskContext.server()) => summary();
				load();
				return () => <p>Summary</p>;
			}
			function ServerPermissions() {
				const load = async (_task: TaskContext = TaskContext.server()) => permissions();
				load();
				return () => <p>Permissions</p>;
			}
			export function Workspace() {
				return () => (
					<ClientShell>
						<ServerSummary />
						<button onClick={() => undefined}>Edit</button>
						<ServerPermissions />
					</ClientShell>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	serverRanges := []PartitionPlanEdge{}
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "server-range" {
			serverRanges = append(serverRanges, edge)
		}
	}
	if len(serverRanges) != 2 || serverRanges[0].Parent != serverRanges[1].Parent {
		t.Fatalf("explicit client component did not retain sibling server ranges: %#v", response.Analysis.PartitionPlan)
	}
	parent := partitionNodeByID(t, response.Analysis.PartitionPlan, serverRanges[0].Parent)
	if parent.Placement != "client" {
		t.Fatalf("server ranges escaped their explicit client region: %#v", parent)
	}
}

func TestPartitionPlanLowersIndependentServerRangesIntoClientBoundary(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-lowering.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ClientShell(props: { children?: unknown }) {
				return () => <div onClick={() => undefined}>{props.children}</div>;
			}
			function ServerSummary() {
				const load = async (_task: TaskContext = TaskContext.server()) => summary();
				load();
				return () => <p>Summary</p>;
			}
			function ServerPermissions() {
				const load = async (_task: TaskContext = TaskContext.server()) => permissions();
				load();
				return () => <p>Permissions</p>;
			}
			export function Workspace() {
				return () => (
					<ClientShell>
						<ServerSummary />
						<ServerPermissions />
					</ClientShell>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	ranges := []string{}
	partitionBoundaries := []Boundary{}
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "server-range" {
			ranges = append(ranges, edge.ID)
		}
	}
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Kind == "partition-range" {
			partitionBoundaries = append(partitionBoundaries, boundary)
		}
	}
	if len(ranges) != 2 {
		t.Fatalf("expected two lowered server ranges: %#v", response.Analysis.PartitionPlan)
	}
	if len(partitionBoundaries) != 2 {
		t.Fatalf("partition ranges were not projected into artifact contracts: %#v", response.Analysis.Boundaries)
	}
	for _, boundary := range partitionBoundaries {
		if boundary.PlanVersion != partitionPlanVersion || boundary.BuildKey == "" ||
			len(boundary.PatchTargets) != 1 || boundary.PatchTargets[0] != boundary.ID {
			t.Fatalf("partition boundary omitted exact authority: %#v", boundary)
		}
	}
	for _, expected := range append([]string{
		`__exactServerSlots: [`, `kind: "partition-range"`, `patchTargets: [`,
	}, ranges...) {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("partition-derived server boundary omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestPartitionPlanLowersMixedStaticChildrenIntoIndependentRanges(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "partition-static-children.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			function ClientShell(props: { children?: unknown }) {
				window.addEventListener("resize", () => undefined);
				return () => <section>{props.children}</section>;
			}
			export function Page() {
				const label = "details";
				return () => <ClientShell>Summary <strong>{label}</strong></ClientShell>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `__exactServerSlots: [`) {
		t.Fatalf("mixed static children did not retain independent partition identities:\n%s", response.Code)
	}
	serverRanges := 0
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "server-range" {
			serverRanges++
		}
	}
	if serverRanges != 2 {
		t.Fatalf("expected text and intrinsic child ranges, received %d: %#v", serverRanges, response.Analysis.PartitionPlan)
	}
}

func TestPartitionPlanPreservesRepeatedRenderEdgeIdentity(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-repeated-child.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			function ClientButton() {
				return () => <button onClick={() => undefined}>Open</button>;
			}
			export function Page() {
				return () => (
					<main>
						<ClientButton />
						<ClientButton />
					</main>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	clientContract := ""
	for _, component := range response.Analysis.Components {
		if component.Name == "ClientButton" {
			clientContract = component.ID
			break
		}
	}
	if clientContract == "" {
		t.Fatalf("missing ClientButton component: %#v", response.Analysis.Components)
	}
	clientNode := builderPartitionNodeByContract(
		t,
		response.Analysis.PartitionPlan,
		clientContract,
	)
	edges := []PartitionPlanEdge{}
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "component" && edge.Child == clientNode.ID {
			edges = append(edges, edge)
		}
	}
	if len(edges) != 2 {
		t.Fatalf("expected two authored render edges, received %d: %#v", len(edges), edges)
	}
	if edges[0].ID == edges[1].ID || edges[0].Start == edges[1].Start {
		t.Fatalf("repeated render uses collapsed to one source identity: %#v", edges)
	}
	for _, edge := range edges {
		if edge.Length <= 0 || len(edge.RenderPath) == 0 {
			t.Fatalf("render edge omitted source evidence: %#v", edge)
		}
	}
}

func TestPartitionPlanDeclaresServerRangeDataSlots(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-data.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ServerResults(this: Component<{ query: string; count: number }>) {
				const load = async (_task: TaskContext = TaskContext.server()) => {
					const result = await search(this.state.query);
					this.state.count = result.length;
				};
				load();
				return () => <p>{this.state.count}</p>;
			}
			export function Search(this: Component<{ editing: boolean }>) {
				return () => (
					<section onClick={() => this.state.editing = true}>
						<ServerResults />
					</section>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var serverRange PartitionPlanEdge
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Kind == "server-range" {
			serverRange = edge
			break
		}
	}
	if serverRange.ID == "" {
		t.Fatalf("missing server range: %#v", response.Analysis.PartitionPlan)
	}
	directions := make(map[string]bool)
	paths := make(map[string]bool)
	for _, slot := range serverRange.Data {
		directions[slot.Direction] = true
		if slot.Kind == "state" {
			paths[slot.ID] = slot.Residency == "either" && !slot.Secret
		}
	}
	if !directions["client-to-server"] || !directions["server-to-client"] || len(paths) < 2 {
		t.Fatalf("server range omitted bounded state input/output slots: %#v", serverRange.Data)
	}
}

func TestPartitionPlanRetainsConditionalBranchPlacement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-conditional.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ClientShell(props: { children?: unknown }) {
				return () => <section onClick={() => undefined}>{props.children}</section>;
			}
			function ServerReport() {
				const load = async (_task: TaskContext = TaskContext.server()) => report();
				load();
				return () => <p>Remote</p>;
			}
			function LocalReport() {
				return () => <button onClick={() => undefined}>Local</button>;
			}
			export function Reports(this: Component<{ remote: boolean }>) {
				return () => (
					<ClientShell>
						{this.state.remote ? <ServerReport /> : <LocalReport />}
					</ClientShell>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	template := partitionNodeByKind(t, response.Analysis.PartitionPlan, "conditional-template")
	branches := partitionEdgesFrom(response.Analysis.PartitionPlan, template.ID, "branch")
	if len(branches) != 2 {
		t.Fatalf("expected two conditional branch edges: template=%#v plan=%#v", template, response.Analysis.PartitionPlan)
	}
	placements := map[string]bool{}
	for _, edge := range branches {
		placements[partitionNodeByID(t, response.Analysis.PartitionPlan, edge.Child).Placement] = true
		if edge.Cardinality != "branch" {
			t.Fatalf("conditional edge omitted branch cardinality: %#v", edge)
		}
	}
	if !placements["server"] || !placements["client"] {
		t.Fatalf("conditional alternatives lost independent placement: %#v", placements)
	}
	branchBoundary := false
	structuralBoundary := Boundary{}
	structuralEdgeID := ""
	for _, edge := range response.Analysis.PartitionPlan.Edges {
		if edge.Child == template.ID {
			structuralEdgeID = edge.ID
			break
		}
	}
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Kind == "partition-range" && boundary.DiscriminatorKind == "branch" {
			branchBoundary = true
			if boundary.ID == structuralEdgeID {
				structuralBoundary = boundary
			}
		}
	}
	if !branchBoundary {
		t.Fatalf("server conditional alternative omitted branch-local authority: %#v", response.Analysis.Boundaries)
	}
	if len(structuralBoundary.DiscriminatorValues) != 2 {
		t.Fatalf("conditional range omitted its finite branch identities: %#v", structuralBoundary)
	}
	if !strings.Contains(response.Code, `discriminator: { kind: "branch", branch:`) ||
		!strings.Contains(response.Code, structuralEdgeID) ||
		!strings.Contains(response.Code, branches[0].ID) ||
		!strings.Contains(response.Code, branches[1].ID) {
		t.Fatalf("conditional slot omitted the selected branch discriminator:\n%s", response.Code)
	}
}

func TestPartitionPlanRetainsKeyedAndReadinessContainment(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-structures.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { Activity, Suspense, TaskContext } from "@exactjs/core";
			function ServerRow() {
				const load = async (_task: TaskContext = TaskContext.server()) => row();
				load();
				return () => <p>Remote</p>;
			}
			export function Rows(this: Component<{ visible: boolean; items: Array<{ id: string }> }>) {
				return () => (
					<Activity mode={this.state.visible ? "visible" : "hidden"}>
						<Suspense fallback={<p>Loading</p>}>
							<section onClick={() => this.state.visible = false}>
								{this.state.items.map((item) => <ServerRow key={item.id} />)}
							</section>
						</Suspense>
					</Activity>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	keyed := partitionNodeByKind(t, response.Analysis.PartitionPlan, "keyed-template")
	items := partitionEdgesFrom(response.Analysis.PartitionPlan, keyed.ID, "keyed-item")
	if len(items) != 1 || items[0].Cardinality != "many-keyed" {
		t.Fatalf("keyed template omitted item multiplicity: %#v", response.Analysis.PartitionPlan)
	}
	keyedBoundary := false
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Kind == "partition-range" && boundary.DiscriminatorKind == "keyed" {
			keyedBoundary = true
			break
		}
	}
	if !keyedBoundary {
		t.Fatalf("server keyed item omitted item-local authority: %#v", response.Analysis.Boundaries)
	}
	readiness := partitionNodeByKind(t, response.Analysis.PartitionPlan, "readiness-boundary")
	if len(partitionEdgesFrom(response.Analysis.PartitionPlan, readiness.ID, "readiness")) == 0 {
		t.Fatalf("readiness boundary did not retain nested keyed structure: %#v", response.Analysis.PartitionPlan)
	}
	activityFound := false
	for _, node := range response.Analysis.PartitionPlan.Nodes {
		if node.Kind == "region" && node.Reason == "Activity retention boundary" {
			activityFound = true
		}
	}
	if !activityFound {
		t.Fatalf("Activity retention boundary was flattened: %#v", response.Analysis.PartitionPlan)
	}
}

func TestPartitionPlanRetainsFiniteRegistryAlternatives(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-registry.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { createComponentRegistry, TaskContext, type KeyOf } from "@exactjs/core";
			function Local() {
				return () => <button onClick={() => undefined}>Local</button>;
			}
			function Remote() {
				const load = async (_task: TaskContext = TaskContext.server()) => remote();
				load();
				return () => <p>Remote</p>;
			}
			const Widget = createComponentRegistry(() => ({ local: Local, remote: Remote }));
			export function Host(this: Component<{ kind: KeyOf<typeof Widget> }>) {
				const Current = Widget[this.state.kind];
				return () => <Current />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var registryTemplate PartitionPlanNode
	for _, node := range response.Analysis.PartitionPlan.Nodes {
		if node.Kind == "conditional-template" && len(node.Reason) >= 25 && node.Reason[:25] == "finite component registry" {
			registryTemplate = node
			break
		}
	}
	if registryTemplate.ID == "" {
		t.Fatalf("registry alternatives were flattened: %#v", response.Analysis.PartitionPlan)
	}
	branches := partitionEdgesFrom(response.Analysis.PartitionPlan, registryTemplate.ID, "branch")
	placements := map[string]bool{}
	for _, edge := range branches {
		placements[partitionNodeByID(t, response.Analysis.PartitionPlan, edge.Child).Placement] = true
	}
	if len(branches) != 2 || !placements["client"] || !placements["server"] {
		t.Fatalf("registry alternatives lost placement: %#v", response.Analysis.PartitionPlan)
	}
}

func TestPartitionPlanLowersKeyedServerItemsIntoRuntimeRanges(t *testing.T) {
	source := `
		import { TaskContext } from "@exactjs/core";
		function ServerRow(props: { item: { id: number } }) {
			const load = async (_task: TaskContext = TaskContext.server()) => row(props.item.id);
			load();
			return () => <p>{props.item.id}</p>;
		}
		export function Rows(this: Component<{ items: Array<{ id: number }> }>) {
			const loadRows = async (_task: TaskContext = TaskContext.server()) => rows();
			loadRows();
			return () => (
				<section onClick={() => undefined}>
					{this.state.items.map((item) => <ServerRow key={item.id} item={item} />)}
				</section>
			);
		}
	`
	server := NewSession().Execute(Request{
		ID: "partition-keyed-lowering.tsx", Kind: "compile", Target: TargetServer,
		ServerComponents: true, Source: source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	keyed := partitionNodeByKind(t, server.Analysis.PartitionPlan, "keyed-template")
	items := partitionEdgesFrom(server.Analysis.PartitionPlan, keyed.ID, "keyed-item")
	if len(items) != 1 {
		t.Fatalf("expected one keyed item template edge: %#v", server.Analysis.PartitionPlan)
	}
	for _, expected := range []string{
		`createKeyedServerSlot as __exactKeyedServerSlot`,
		`__exactKeyedServerSlot("` + items[0].ID + `", "` + keyed.ID + `", item.id`,
		`__exactComponentVNode(ServerRow`,
		`discriminator: { kind: "single" }`,
	} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf("server keyed range lowering omitted %q:\n%s", expected, server.Code)
		}
	}
	client := NewSession().Execute(Request{
		ID: "partition-keyed-lowering.tsx", Kind: "compile", Target: TargetClient,
		ServerComponents: true, Source: source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	if !strings.Contains(client.Code, `props.children`) || strings.Contains(client.Code, `__exactVNode(ServerRow`) {
		t.Fatalf("client keyed range did not retain the server-provided item placeholders:\n%s", client.Code)
	}
}

func TestPartitionPlanDefersStaticPackageChildResolutionToBuildHost(t *testing.T) {
	source := `
		import { UnknownLibraryValue } from "unknown-component-library";
		function ClientShell(props: { children?: unknown }) {
			window.addEventListener("resize", () => undefined);
			return () => <section>{props.children}</section>;
		}
		export function Page() {
			return () => (
				<ClientShell>
					<UnknownLibraryValue />
					<button onClick={() => undefined}>Edit</button>
				</ClientShell>
			);
		}
	`
	response := NewSession().Execute(Request{
		ID: "partition-unknown-child.tsx", Kind: "analyze", ServerComponents: true,
		Source: source,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	conservativeComponent := false
	conservativeRegion := false
	for _, node := range response.Analysis.PartitionPlan.Nodes {
		if node.Kind == "component" && node.Conservative &&
			strings.Contains(node.Reason, "awaits build-host component catalog resolution") {
			conservativeComponent = true
		}
		if node.Kind == "region" && node.Conservative && node.Placement == "either" {
			conservativeRegion = true
		}
	}
	if !conservativeComponent || !conservativeRegion {
		t.Fatalf("unknown child did not retain one narrow conservative region: %#v", response.Analysis.PartitionPlan)
	}
	diagnostic := false
	for _, entry := range response.Diagnostics {
		if entry.Code == "EXACT2212" {
			diagnostic = true
		}
	}
	if diagnostic {
		t.Fatalf("host-resolvable package child produced a premature partition diagnostic: %#v", response.Diagnostics)
	}
	compiled := NewSession().Execute(Request{
		ID: "partition-unknown-child.tsx", Kind: "compile", Target: TargetClient,
		ServerComponents: true, Source: source,
	})
	if compiled.Error != "" {
		t.Fatal(compiled.Error)
	}
	if !strings.Contains(compiled.Code, "Page") {
		t.Fatalf("partition warning suppressed the generated artifact (%#v):\n%s", compiled.Diagnostics, compiled.Code)
	}
}

func TestPartitionPlanKeepsCoTargetedEnhancementsAsOrderedComponentOwners(t *testing.T) {
	source := `
		import { TaskContext } from "@exactjs/core";
		function ServerBadge() {
			const load = async (_task: TaskContext = TaskContext.server()) => badge();
			load();
			return () => <span>Badge</span>;
		}
		export function Card() {
			return () => (
				<article physics:body={body} motion:layout={layout}>
					<ServerBadge />
				</article>
			);
		}
	`
	response := NewSession().Execute(Request{
		ID: "partition-enhancements.tsx", Kind: "analyze", ServerComponents: true, Source: source,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	parsed := parseNormalizationSource("C:/partition-enhancements.tsx", source)
	enhancements := enhancementImports{applications: make(map[int]enhancementApplication)}
	walkNode(parsed.AsNode(), func(node *ast.Node) bool {
		attributes := jsxOpeningAttributes(node)
		if attributes == nil || len(attributes.AsJsxAttributes().Properties.Nodes) != 2 {
			return true
		}
		enhancements.applications[attributes.Pos()] = enhancementApplication{components: []enhancementComponent{
			{identity: "@fixture/physics#body", canonical: "@fixture/physics#body"},
			{identity: "@fixture/motion#layout", canonical: "@fixture/motion#layout"},
		}}
		return true
	})
	plan := createPartitionPlan(
		parsed,
		"enhancement-build",
		response.Analysis.Components,
		nil,
		enhancements,
		response.Analysis.Continuations,
		response.Analysis.Registries,
	)
	enhancementNodes := []PartitionPlanNode{}
	for _, node := range plan.Nodes {
		if node.Kind == "enhancement-component" {
			enhancementNodes = append(enhancementNodes, node)
			if node.OwnerComponent != node.ID || node.ComponentContract == "" {
				t.Fatalf("enhancement lost ordinary component ownership: %#v", node)
			}
		}
	}
	if len(enhancementNodes) != 2 {
		t.Fatalf("expected two ordinary enhancement component nodes: %#v", plan)
	}
	physics := partitionNodeByContract(t, plan, "@fixture/physics#body")
	motion := partitionNodeByContract(t, plan, "@fixture/motion#layout")
	if !partitionHasEdge(plan, physics.ID, motion.ID, "enhancement") {
		t.Fatalf("co-targeted enhancement order was not retained: %#v", plan.Edges)
	}
	serverBadge := partitionNodeByComponentName(t, plan, response.Analysis.Components, "ServerBadge")
	if !partitionDescendsFrom(plan, serverBadge.ID, motion.ID) {
		t.Fatalf("nested server output escaped the nearest enhancement owner: %#v", plan)
	}
}

func TestPartitionPlanRetainsRecursivePlacementAlternation(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "partition-recursive.tsx",
		Kind:             "analyze",
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ClientShell(props: { children?: unknown }) {
				return () => <div onClick={() => undefined}>{props.children}</div>;
			}
			function ServerPanel(props: { children?: unknown }) {
				const load = async (_task: TaskContext = TaskContext.server()) => panel();
				load();
				return () => <section>{props.children}</section>;
			}
			function ClientControls(props: { children?: unknown }) {
				return () => <nav onClick={() => undefined}>{props.children}</nav>;
			}
			function ServerPermissions() {
				const load = async (_task: TaskContext = TaskContext.server()) => permissions();
				load();
				return () => <p>Permissions</p>;
			}
			export function Workspace() {
				return () => (
					<ClientShell>
						<ServerPanel>
							<ClientControls>
								<ServerPermissions />
							</ClientControls>
						</ServerPanel>
					</ClientShell>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	workspaceContract := ""
	for _, component := range response.Analysis.Components {
		if component.Name == "Workspace" {
			workspaceContract = component.ID
		}
	}
	root := builderPartitionNodeByContract(t, response.Analysis.PartitionPlan, workspaceContract)
	placements := []string{}
	parent := root.ID
	for _, expectedKind := range []string{"client-range", "server-range", "client-range", "server-range"} {
		edges := partitionEdgesFrom(response.Analysis.PartitionPlan, parent, expectedKind)
		if len(edges) != 1 {
			t.Fatalf("recursive alternation omitted %s below %s: %#v", expectedKind, parent, response.Analysis.PartitionPlan)
		}
		child := partitionNodeByID(t, response.Analysis.PartitionPlan, edges[0].Child)
		placements = append(placements, child.Placement)
		parent = child.ID
	}
	if strings.Join(placements, ",") != "client,server,client,server" {
		t.Fatalf("recursive placement ancestry was flattened: %#v", placements)
	}
}

func TestPartitionPlanRepresentsRecursiveComponentsAsFiniteCycles(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "partition-cycle.tsx",
		Kind: "analyze",
		Source: `
			export function Tree(props: { depth: number }) {
				return () => props.depth > 0 ? <Tree depth={props.depth - 1} /> : <span>Leaf</span>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	plan := response.Analysis.PartitionPlan
	componentNodes := []PartitionPlanNode{}
	for _, node := range plan.Nodes {
		if node.Kind == "component" {
			componentNodes = append(componentNodes, node)
		}
	}
	if len(componentNodes) != 1 {
		t.Fatalf("recursive component expanded its static plan: %#v", plan)
	}
	cycle := false
	for _, edge := range plan.Edges {
		if edge.Child == componentNodes[0].ID &&
			partitionHasDirectedPath(plan, componentNodes[0].ID, edge.Parent) {
			cycle = true
			break
		}
	}
	if !cycle {
		t.Fatalf("recursive component did not retain a finite plan cycle: %#v", plan)
	}
}

func partitionNodeByKind(t *testing.T, plan PartitionPlan, kind string) PartitionPlanNode {
	t.Helper()
	for _, node := range plan.Nodes {
		if node.Kind == kind {
			return node
		}
	}
	t.Fatalf("partition plan omitted %s node: %#v", kind, plan)
	return PartitionPlanNode{}
}

func partitionEdgesFrom(plan PartitionPlan, parent string, kind string) []PartitionPlanEdge {
	result := []PartitionPlanEdge{}
	for _, edge := range plan.Edges {
		if edge.Parent == parent && edge.Kind == kind {
			result = append(result, edge)
		}
	}
	return result
}

func builderPartitionNodeByContract(
	t *testing.T,
	plan PartitionPlan,
	contract string,
) PartitionPlanNode {
	t.Helper()
	for _, node := range plan.Nodes {
		if node.ComponentContract == contract {
			return node
		}
	}
	t.Fatalf("partition plan omitted component contract %q: %#v", contract, plan)
	return PartitionPlanNode{}
}

func partitionNodeByContract(
	t *testing.T,
	plan PartitionPlan,
	contract string,
) PartitionPlanNode {
	return builderPartitionNodeByContract(t, plan, contract)
}

func partitionNodeByComponentName(
	t *testing.T,
	plan PartitionPlan,
	components []Component,
	name string,
) PartitionPlanNode {
	t.Helper()
	for _, component := range components {
		if component.Name == name {
			return builderPartitionNodeByContract(t, plan, component.ID)
		}
	}
	t.Fatalf("analysis omitted component %q: %#v", name, components)
	return PartitionPlanNode{}
}

func partitionHasEdge(plan PartitionPlan, parent string, child string, kind string) bool {
	for _, edge := range plan.Edges {
		if edge.Parent == parent && edge.Child == child && edge.Kind == kind {
			return true
		}
	}
	return false
}

func partitionDescendsFrom(plan PartitionPlan, child string, ancestor string) bool {
	parents := make(map[string][]string)
	for _, edge := range plan.Edges {
		parents[edge.Child] = append(parents[edge.Child], edge.Parent)
	}
	queue := []string{child}
	seen := map[string]struct{}{}
	for len(queue) != 0 {
		current := queue[0]
		queue = queue[1:]
		if current == ancestor {
			return true
		}
		if _, exists := seen[current]; exists {
			continue
		}
		seen[current] = struct{}{}
		queue = append(queue, parents[current]...)
	}
	return false
}

func partitionHasDirectedPath(plan PartitionPlan, start string, target string) bool {
	children := make(map[string][]string)
	for _, edge := range plan.Edges {
		children[edge.Parent] = append(children[edge.Parent], edge.Child)
	}
	queue := []string{start}
	seen := map[string]struct{}{}
	for len(queue) != 0 {
		current := queue[0]
		queue = queue[1:]
		if current == target {
			return true
		}
		if _, exists := seen[current]; exists {
			continue
		}
		seen[current] = struct{}{}
		queue = append(queue, children[current]...)
	}
	return false
}

func partitionNodeByID(
	t *testing.T,
	plan PartitionPlan,
	id string,
) PartitionPlanNode {
	t.Helper()
	for _, node := range plan.Nodes {
		if node.ID == id {
			return node
		}
	}
	t.Fatalf("partition plan omitted node %q: %#v", id, plan)
	return PartitionPlanNode{}
}
