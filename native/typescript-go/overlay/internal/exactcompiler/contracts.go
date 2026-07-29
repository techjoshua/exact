package exactcompiler

import (
	"encoding/json"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/compiler"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/printer"
	"github.com/microsoft/typescript-go/internal/sourcemap"
)

// ProtocolVersion identifies the process request and response contract.
const ProtocolVersion = "1.24.0"

// BackendVersion identifies the eXact-owned native implementation.
const BackendVersion = ProtocolVersion

// Target identifies the eXact artifact being compiled.
type Target string

const (
	// TargetDefault compiles an artifact without client/server specialization.
	TargetDefault Target = "default"
	// TargetClient compiles a browser-owned artifact.
	TargetClient Target = "client"
	// TargetServer compiles a server-owned artifact.
	TargetServer Target = "server"
)

// Request is one newline-delimited command accepted by a Session.
type Request struct {
	ID                         string                     `json:"id,omitempty"`
	Kind                       string                     `json:"kind"`
	Source                     string                     `json:"source,omitempty"`
	Root                       string                     `json:"root,omitempty"`
	ConfigFile                 string                     `json:"configFile,omitempty"`
	Target                     Target                     `json:"target,omitempty"`
	ServerComponents           bool                       `json:"serverComponents,omitempty"`
	PreserveComponentHoisting  bool                       `json:"preserveComponentHoisting,omitempty"`
	Diagnostics                string                     `json:"diagnostics,omitempty"`
	SourceMap                  bool                       `json:"sourceMap,omitempty"`
	PackageType                string                     `json:"packageType,omitempty"`
	PackageName                string                     `json:"packageName,omitempty"`
	Capabilities               CapabilityPolicy           `json:"capabilities,omitempty"`
	AssetRules                 []AssetRule                `json:"assetRules,omitempty"`
	PreserveClientAssetImports bool                       `json:"preserveClientAssetImports,omitempty"`
	JSXInterop                 *JSXInterop                `json:"jsxInterop,omitempty"`
	Manifests                  []ExternalManifest         `json:"manifests,omitempty"`
	Extensions                 map[string]json.RawMessage `json:"extensions,omitempty"`
	CompatibilityExtensions    map[string][]string        `json:"compatibilityExtensions,omitempty"`
	ModuleRewrite              *ModuleRewrite             `json:"moduleRewrite,omitempty"`
	InstrumentInspection       bool                       `json:"instrumentInspection,omitempty"`
}

// ModuleRewrite contains host-planned aliases applied before native printing.
type ModuleRewrite struct {
	ModuleAliases map[string]string         `json:"moduleAliases"`
	Replacements  []ModuleExportReplacement `json:"replacements"`
}

// ModuleExportReplacement redirects one runtime export to an adapter module.
type ModuleExportReplacement struct {
	SourceModule string `json:"sourceModule"`
	SourceExport string `json:"sourceExport"`
	TargetModule string `json:"targetModule"`
	TargetExport string `json:"targetExport"`
}

// JSXInterop identifies the host-owned runtime brand adapter for component
// values that cannot be proven to be local native eXact components.
type JSXInterop struct {
	AdapterModule string `json:"adapterModule"`
	AdapterExport string `json:"adapterExport"`
}

// ExternalManifest is the compact, compiler-owned interface of an imported
// eXact module. It intentionally excludes emitted artifact representation.
type ExternalManifest struct {
	Filename     string                    `json:"filename"`
	PackageName  string                    `json:"packageName,omitempty"`
	Components   []ExternalComponentExport `json:"components"`
	Callables    []CallableSummary         `json:"callables"`
	Policy       PolicyManifest            `json:"policy"`
	Capabilities CapabilityRequirements    `json:"capabilities"`
}

// ExternalComponentExport maps an imported export to its component contract.
type ExternalComponentExport struct {
	ExportName  string `json:"exportName"`
	Name        string `json:"name"`
	ComponentID string `json:"componentId,omitempty"`
	Placement   string `json:"placement"`
}

// CapabilityPolicy contains application-owned grants for privileged features.
type CapabilityPolicy struct {
	UnsafeHTML UnsafeHTMLPolicy `json:"unsafeHtml"`
	Secrets    SecretPolicy     `json:"secrets"`
}

// UnsafeHTMLPolicy controls local use and package grants for unsafeHtml.
type UnsafeHTMLPolicy struct {
	Enabled bool     `json:"enabled"`
	Grants  []string `json:"grants"`
}

// SecretPolicy controls which dependency packages may consume secrets.
type SecretPolicy struct {
	AllowPackages []string `json:"allowPackages"`
}

// RawHTMLCapability identifies one compile-time unsafeHtml requirement.
type RawHTMLCapability struct {
	Source  string   `json:"source"`
	Line    int      `json:"line"`
	Column  int      `json:"column"`
	Symbol  string   `json:"symbol"`
	Targets []string `json:"targets"`
}

// CapabilityRequirements are portable privileged-feature requirements.
type CapabilityRequirements struct {
	RawHTML []RawHTMLCapability `json:"rawHtml"`
}

// AssetRule classifies imports handled by a bundler or deployment adapter.
type AssetRule struct {
	Extensions       []string `json:"extensions"`
	Queries          []string `json:"queries"`
	Kind             string   `json:"kind"`
	ImportMode       string   `json:"importMode,omitempty"`
	EvaluationTarget string   `json:"evaluationTarget,omitempty"`
	DeliveryTarget   string   `json:"deliveryTarget,omitempty"`
}

// AssetDependency is one normalized build-asset edge.
type AssetDependency struct {
	Specifier        string `json:"specifier"`
	Kind             string `json:"kind"`
	ImportMode       string `json:"importMode"`
	EvaluationTarget string `json:"evaluationTarget"`
	DeliveryTarget   string `json:"deliveryTarget"`
}

// Diagnostic is an implementation-independent compiler diagnostic.
type Diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	FileName string `json:"filename,omitempty"`
	Start    int    `json:"start,omitempty"`
	Length   int    `json:"length,omitempty"`
}

// Directive is one compiler directive found in source trivia.
type Directive struct {
	Namespace   string
	Name        string
	Argument    string
	HasArgument bool
	Start       int
	Length      int
}

// Import describes one static ECMAScript import declaration.
type Import struct {
	ModuleSpecifier string `json:"moduleSpecifier"`
	TypeOnly        bool   `json:"typeOnly"`
	SideEffectOnly  bool   `json:"sideEffectOnly"`
	RuntimeBinding  bool   `json:"runtimeBinding"`
	Start           int    `json:"start"`
	Length          int    `json:"length"`
}

// Component identifies a native eXact component declaration.
type Component struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	Start             int             `json:"start"`
	Length            int             `json:"length"`
	Exported          bool            `json:"exported"`
	Signals           []string        `json:"signals"`
	Placement         string          `json:"placement"`
	SubgraphPlacement string          `json:"subgraphPlacement"`
	EnvironmentEffect string          `json:"environmentEffect"`
	ArtifactTargets   []string        `json:"artifactTargets"`
	RenderEdges       []RenderEdge    `json:"renderEdges"`
	ClientIslandCount int             `json:"clientIslandCount"`
	Contexts          []ContextEffect `json:"contexts"`
	SplitBoundaries   []string        `json:"splitBoundaries"`
	Diagnostics       []string        `json:"diagnostics"`
}

// RenderEdge describes one local component dependency authored as a JSX tag.
type RenderEdge struct {
	ID          string `json:"id"`
	NodeID      string `json:"nodeId,omitempty"`
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	ComponentID string `json:"componentId,omitempty"`
	Placement   string `json:"placement"`
	Boundary    string `json:"boundary"`
	Index       int    `json:"index"`
	Path        string `json:"path"`
}

// SymbolRecord identifies one authored or compiler-generated artifact export.
type SymbolRecord struct {
	ID            string `json:"id"`
	ComponentID   string `json:"componentId,omitempty"`
	ExportName    string `json:"exportName,omitempty"`
	LocalName     string `json:"localName"`
	GeneratedName string `json:"generatedName"`
	DebugName     string `json:"debugName"`
	Kind          string `json:"kind"`
	Role          string `json:"role"`
	Target        string `json:"target"`
	Placement     string `json:"placement"`
}

// ExportRecord describes one runtime value exposed by the authored module.
// Exports are separate from SymbolRecord because ordinary values do not
// necessarily produce a compiler-owned artifact symbol.
type ExportRecord struct {
	Name      string `json:"name"`
	LocalName string `json:"-"`
	Kind      string `json:"kind"`
	Placement string `json:"placement"`
}

// Boundary identifies one runtime split owned by a durable component.
type Boundary struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	ComponentID      string `json:"componentId,omitempty"`
	OwnerComponentID string `json:"ownerComponentId,omitempty"`
	RenderEdgeID     string `json:"renderEdgeId,omitempty"`
	RenderEdgeIndex  int    `json:"renderEdgeIndex,omitempty"`
	RenderPath       string `json:"renderPath,omitempty"`
	Kind             string `json:"kind"`
}

// DataPolicy is the normalized residency and secrecy contract for one value.
type DataPolicy struct {
	Residency string `json:"residency"`
	Secret    bool   `json:"secret"`
}

// PolicySubject describes one source or inferred value governed by a data policy.
type PolicySubject struct {
	ID             string     `json:"id"`
	Kind           string     `json:"kind"`
	Name           string     `json:"name"`
	Path           string     `json:"path,omitempty"`
	ComponentID    string     `json:"componentId,omitempty"`
	CallableID     string     `json:"callableId,omitempty"`
	ParameterIndex int        `json:"parameterIndex,omitempty"`
	Policy         DataPolicy `json:"policy"`
	Source         string     `json:"source"`
}

// PolicyFlow describes one checked propagation or transfer between policy subjects.
type PolicyFlow struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	From       []string   `json:"from"`
	To         string     `json:"to"`
	Policy     DataPolicy `json:"policy"`
	Boundary   string     `json:"boundary,omitempty"`
	Authorized bool       `json:"authorized"`
	Reason     string     `json:"reason,omitempty"`
}

// SecretConsumer identifies one audited consume() boundary without containing secret data.
type SecretConsumer struct {
	ID            string               `json:"id"`
	Selector      string               `json:"selector,omitempty"`
	Dynamic       bool                 `json:"dynamic"`
	Source        string               `json:"source"`
	Line          int                  `json:"line"`
	Column        int                  `json:"column"`
	Caller        string               `json:"caller"`
	Consumer      SecretConsumerTarget `json:"consumer"`
	Target        string               `json:"target"`
	Authorization string               `json:"authorization"`
	Reason        string               `json:"reason,omitempty"`
}

// SecretConsumerTarget identifies the package API receiving a qualified value.
type SecretConsumerTarget struct {
	Package   string `json:"package"`
	Symbol    string `json:"symbol"`
	Parameter int    `json:"parameter"`
}

// PolicyManifest is the native compiler's portable residency and secrecy graph.
type PolicyManifest struct {
	Version         int              `json:"version"`
	Subjects        []PolicySubject  `json:"subjects"`
	Flows           []PolicyFlow     `json:"flows"`
	SecretConsumers []SecretConsumer `json:"secretConsumers"`
}

// JSXAttribute describes one authored JSX attribute without exposing AST nodes.
type JSXAttribute struct {
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name,omitempty"`
	ValueKind string `json:"valueKind"`
	Start     int    `json:"start"`
	Length    int    `json:"length"`
}

// JSXElement describes one authored JSX opening element.
type JSXElement struct {
	Tag        string         `json:"tag"`
	Intrinsic  bool           `json:"intrinsic"`
	Start      int            `json:"start"`
	Length     int            `json:"length"`
	Attributes []JSXAttribute `json:"attributes"`
}

// StateWrite identifies one direct write to component-owned state.
type StateWrite struct {
	Component       string            `json:"component"`
	Path            []string          `json:"path"`
	Operation       string            `json:"operation"`
	Start           int               `json:"start"`
	Length          int               `json:"length"`
	RootAlias       string            `json:"-"`
	RootDepth       int               `json:"-"`
	DynamicSegments map[int]*ast.Node `json:"-"`
}

// StateAlias identifies one lexical alias for a component-state path.
type StateAlias struct {
	Component string   `json:"component"`
	Name      string   `json:"name"`
	Path      []string `json:"path"`
	Start     int      `json:"start"`
	Length    int      `json:"length"`
	InvalidAt int      `json:"invalidAt,omitempty"`
}

// StateRead identifies one component-state dependency.
type StateRead struct {
	Component  string   `json:"component"`
	Path       []string `json:"path"`
	Confidence string   `json:"confidence"`
	Start      int      `json:"start"`
	Length     int      `json:"length"`
}

// StateEffect describes one task read or write against component state.
type StateEffect struct {
	Path       string         `json:"path"`
	Kind       string         `json:"kind"`
	Confidence string         `json:"confidence"`
	Operation  string         `json:"operation,omitempty"`
	Receiver   *StateReceiver `json:"receiver,omitempty"`
}

// StateReceiver identifies the component or callable parameter owning state.
type StateReceiver struct {
	Kind  string `json:"kind"`
	Index int    `json:"index,omitempty"`
}

// ContextEffect describes one callable read or write against a component context token.
type ContextEffect struct {
	Token      string `json:"token"`
	Kind       string `json:"kind"`
	Confidence string `json:"confidence"`
}

// EnvironmentEffectSource explains one browser, server, or unresolved placement requirement.
type EnvironmentEffectSource struct {
	Environment string   `json:"environment"`
	Description string   `json:"description"`
	Path        []string `json:"path"`
	Opaque      bool     `json:"-"`
}

// CallEdge describes one statically resolved or unresolved callable dependency.
type CallEdge struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	TargetID         string            `json:"targetId,omitempty"`
	ModuleSpecifier  string            `json:"moduleSpecifier,omitempty"`
	ExportName       string            `json:"exportName,omitempty"`
	Resolved         bool              `json:"resolved"`
	ReceiverBindings []ReceiverBinding `json:"receiverBindings,omitempty"`
}

// ReceiverBinding maps a callee state-owning parameter into its caller.
type ReceiverBinding struct {
	ParameterIndex       int    `json:"parameterIndex"`
	Source               string `json:"source"`
	SourceParameterIndex int    `json:"sourceParameterIndex,omitempty"`
}

// CallableSummary is the process-safe effect graph for one source callable.
type CallableSummary struct {
	ID                  string                    `json:"id"`
	Name                string                    `json:"name"`
	Kind                string                    `json:"kind"`
	ExportNames         []string                  `json:"exportNames"`
	DirectEffect        string                    `json:"directEffect"`
	Effect              string                    `json:"effect"`
	DirectEffectSources []EnvironmentEffectSource `json:"directEffectSources"`
	EffectSources       []EnvironmentEffectSource `json:"effectSources"`
	Calls               []CallEdge                `json:"calls"`
	ArtifactTargets     []string                  `json:"artifactTargets"`
	StateReads          []StateEffect             `json:"stateReads"`
	StateWrites         []StateEffect             `json:"stateWrites"`
	Contexts            []ContextEffect           `json:"contexts"`
	ReevaluationSafe    bool                      `json:"reevaluationSafe"`
}

// TaskResource describes one value whose lifetime belongs to a task generation.
type TaskResource struct {
	Kind        string `json:"kind"`
	Disposal    string `json:"disposal,omitempty"`
	Description string `json:"description,omitempty"`
	Start       int    `json:"start"`
	Length      int    `json:"length"`
}

// TaskSignalCall describes one call which receives the task abort signal.
type TaskSignalCall struct {
	Parameter    int    `json:"parameter"`
	Mode         string `json:"mode"`
	EventOptions bool   `json:"eventOptions,omitempty"`
	Start        int    `json:"start"`
	Length       int    `json:"length"`
}

// TaskDependency describes one compiler-captured task input in callback order.
type TaskDependency struct {
	Index        int    `json:"index"`
	Source       string `json:"source"`
	ContextToken string `json:"contextToken,omitempty"`
}

// ReactiveBinding describes the provenance of one component lexical binding.
type ReactiveBinding struct {
	Component        string   `json:"component"`
	Name             string   `json:"name"`
	Provenance       string   `json:"provenance"`
	ContextToken     string   `json:"contextToken,omitempty"`
	Dependencies     []string `json:"dependencies"`
	SafeToReevaluate bool     `json:"safeToReevaluate"`
	Start            int      `json:"start"`
	Length           int      `json:"length"`
}

// Task identifies one component task registration and its authored facets.
type Task struct {
	ID                   string                    `json:"id"`
	Component            string                    `json:"component"`
	Facets               []string                  `json:"facets"`
	RequestedPlacement   string                    `json:"requestedPlacement,omitempty"`
	Priority             string                    `json:"priority"`
	Readiness            string                    `json:"readiness"`
	Placement            string                    `json:"placement"`
	Async                bool                      `json:"async"`
	BrowserEffects       bool                      `json:"browserEffects"`
	ServerEffects        bool                      `json:"serverEffects"`
	EnvironmentEffect    string                    `json:"environmentEffect"`
	ReactiveDependencies []string                  `json:"reactiveDependencies"`
	Dependencies         []TaskDependency          `json:"dependencies"`
	Reads                []StateEffect             `json:"reads"`
	Writes               []StateEffect             `json:"writes"`
	ResultWritePath      []string                  `json:"resultWritePath,omitempty"`
	Contexts             []ContextEffect           `json:"contexts"`
	EffectSources        []EnvironmentEffectSource `json:"effectSources"`
	Resources            []TaskResource            `json:"resources"`
	SignalCalls          []TaskSignalCall          `json:"signalCalls"`
	Diagnostics          []string                  `json:"diagnostics"`
	Start                int                       `json:"start"`
	Length               int                       `json:"length"`
	SyntheticSetup       bool                      `json:"-"`
}

// ContinuationActivation describes values accepted by one server transition.
type ContinuationActivation struct {
	StateReads     []StateEffect    `json:"stateReads"`
	Dependencies   []TaskDependency `json:"dependencies"`
	ServerContexts []ContextEffect  `json:"serverContexts"`
	PublicContexts []ContextEffect  `json:"publicContexts"`
}

// ContinuationInvocation describes values accepted only when an action is invoked.
type ContinuationInvocation struct {
	Arguments   []TaskDependency `json:"arguments"`
	Concurrency string           `json:"concurrency"`
}

// ContinuationEffects bounds the mutations returned by one server transition.
type ContinuationEffects struct {
	StateWrites         []StateEffect   `json:"stateWrites"`
	ContextWrites       []ContextEffect `json:"contextWrites"`
	ServerContextWrites []ContextEffect `json:"serverContextWrites"`
	Boundaries          []string        `json:"boundaries"`
}

// ContinuationOwnership identifies the durable owner of one transition.
type ContinuationOwnership struct {
	ComponentID string `json:"componentId"`
	Lifetime    string `json:"lifetime"`
}

// Continuation is the compiler-owned cross-runtime task contract.
type Continuation struct {
	ID           string                  `json:"id"`
	Kind         string                  `json:"kind"`
	Label        string                  `json:"label,omitempty"`
	ComponentID  string                  `json:"componentId"`
	TaskID       string                  `json:"taskId"`
	Placement    string                  `json:"placement"`
	Readiness    string                  `json:"readiness"`
	Async        bool                    `json:"async"`
	Activation   ContinuationActivation  `json:"activation"`
	Effects      ContinuationEffects     `json:"effects"`
	Ownership    ContinuationOwnership   `json:"ownership"`
	Cancellation string                  `json:"cancellation"`
	Invocation   *ContinuationInvocation `json:"invocation,omitempty"`
}

// ServerRenderRecord contains server-only activation requirements.
type ServerRenderRecord struct {
	StateReads     []string        `json:"stateReads"`
	ServerContexts []ContextEffect `json:"serverContexts"`
}

// ClientResumptionRecord contains the durable browser-visible resume contract.
type ClientResumptionRecord struct {
	StatePaths    []string `json:"statePaths"`
	ValueCaptures []string `json:"valueCaptures"`
	Contexts      []string `json:"contexts"`
	Boundaries    []string `json:"boundaries"`
}

// ComponentResumption separates server activation from client resume data.
type ComponentResumption struct {
	ComponentID  string                 `json:"componentId"`
	ServerRender ServerRenderRecord     `json:"serverRender"`
	Client       ClientResumptionRecord `json:"client"`
}

// SemanticScope identifies one lexical scope in the checker-owned source tree.
type SemanticScope struct {
	ID       string `json:"id"`
	ParentID string `json:"parentId,omitempty"`
	Kind     string `json:"kind"`
	NodeKind string `json:"nodeKind"`
}

// SemanticDeclaration identifies a checker-resolved source declaration.
type SemanticDeclaration struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	ScopeID         string `json:"scopeId"`
	Kind            string `json:"kind"`
	NodeStart       int    `json:"nodeStart"`
	NodeEnd         int    `json:"nodeEnd"`
	ModuleSpecifier string `json:"moduleSpecifier,omitempty"`
	ImportedName    string `json:"importedName,omitempty"`
	TypeOnly        bool   `json:"typeOnly,omitempty"`
	ExportedName    string `json:"exportedName,omitempty"`
}

// SemanticReference records one identifier use and its resolved declaration.
type SemanticReference struct {
	Name            string `json:"name"`
	ScopeID         string `json:"scopeId"`
	Source          string `json:"source"`
	NodeStart       int    `json:"nodeStart"`
	NodeEnd         int    `json:"nodeEnd"`
	DeclarationID   string `json:"declarationId,omitempty"`
	DeclarationKind string `json:"declarationKind,omitempty"`
	ModuleSpecifier string `json:"moduleSpecifier,omitempty"`
	ImportedName    string `json:"importedName,omitempty"`
	TypeOnly        bool   `json:"typeOnly,omitempty"`
	ExportedName    string `json:"exportedName,omitempty"`
}

// SemanticExport records local exports and module re-exports.
type SemanticExport struct {
	ExportedName    string `json:"exportedName"`
	LocalName       string `json:"localName,omitempty"`
	ImportedName    string `json:"importedName,omitempty"`
	ModuleSpecifier string `json:"moduleSpecifier,omitempty"`
	TypeOnly        bool   `json:"typeOnly,omitempty"`
}

// SemanticGraph is the portable binder identity and reference graph.
type SemanticGraph struct {
	Scopes       []SemanticScope       `json:"scopes"`
	Declarations []SemanticDeclaration `json:"declarations"`
	References   []SemanticReference   `json:"references"`
	Exports      []SemanticExport      `json:"exports"`
}

// ComponentRegistryEntry is one finite target in a compiler-owned registry.
type ComponentRegistryEntry struct {
	Key             string   `json:"key"`
	Mode            string   `json:"mode"`
	ComponentID     string   `json:"componentId"`
	ComponentName   string   `json:"componentName"`
	Placement       string   `json:"placement"`
	ModuleSpecifier string   `json:"moduleSpecifier,omitempty"`
	ExportName      string   `json:"exportName,omitempty"`
	Ownership       string   `json:"ownership"`
	ArtifactTargets []string `json:"artifactTargets"`
}

// ComponentRegistry is the process-safe finite registry analysis contract.
type ComponentRegistry struct {
	ID      string                   `json:"id"`
	Name    string                   `json:"name"`
	Entries []ComponentRegistryEntry `json:"entries"`
}

// Analysis contains eXact-owned semantic facts returned by the native host.
type Analysis struct {
	Imports          []Import               `json:"imports"`
	Components       []Component            `json:"components"`
	JSX              []JSXElement           `json:"jsx"`
	StateAliases     []StateAlias           `json:"stateAliases"`
	StateReads       []StateRead            `json:"stateReads"`
	StateWrites      []StateWrite           `json:"stateWrites"`
	ReactiveBindings []ReactiveBinding      `json:"reactiveBindings"`
	Callables        []CallableSummary      `json:"callables"`
	Tasks            []Task                 `json:"tasks"`
	Actions          []Action               `json:"actions"`
	Exports          []ExportRecord         `json:"exports"`
	Symbols          []SymbolRecord         `json:"symbols"`
	Boundaries       []Boundary             `json:"boundaries"`
	Continuations    []Continuation         `json:"continuations"`
	Registries       []ComponentRegistry    `json:"registries"`
	Resumptions      []ComponentResumption  `json:"resumptions"`
	Policy           PolicyManifest         `json:"policy"`
	Capabilities     CapabilityRequirements `json:"requiredCapabilities"`
	Assets           []AssetDependency      `json:"assets"`
	SemanticGraph    SemanticGraph          `json:"semanticGraph"`
}

// NewAnalysis creates a protocol-safe result whose collections encode as JSON
// arrays even when a source file contains no eXact constructs.
func NewAnalysis(
	imports []Import,
	components []Component,
	jsx []JSXElement,
	stateAliases []StateAlias,
	stateReads []StateRead,
	stateWrites []StateWrite,
	reactiveBindings []ReactiveBinding,
	callables []CallableSummary,
	tasks []Task,
	actions []Action,
	exports []ExportRecord,
	symbols []SymbolRecord,
	boundaries []Boundary,
	continuations []Continuation,
	registries []ComponentRegistry,
	resumptions []ComponentResumption,
	policy PolicyManifest,
	capabilities CapabilityRequirements,
	assets []AssetDependency,
	semanticGraph SemanticGraph,
) Analysis {
	return Analysis{
		Imports:          nonNilSlice(imports),
		Components:       normalizedComponents(components),
		JSX:              normalizedJSX(jsx),
		StateAliases:     nonNilSlice(stateAliases),
		StateReads:       nonNilSlice(stateReads),
		StateWrites:      nonNilSlice(stateWrites),
		ReactiveBindings: nonNilSlice(reactiveBindings),
		Callables:        normalizedCallables(callables),
		Tasks:            normalizedTasks(tasks),
		Actions:          normalizedActions(actions),
		Exports:          nonNilSlice(exports),
		Symbols:          nonNilSlice(symbols),
		Boundaries:       nonNilSlice(boundaries),
		Continuations:    normalizedContinuations(continuations),
		Registries:       normalizedComponentRegistries(registries),
		Resumptions:      normalizedResumptions(resumptions),
		Policy:           normalizedPolicy(policy),
		Capabilities: CapabilityRequirements{
			RawHTML: nonNilSlice(capabilities.RawHTML),
		},
		Assets:        nonNilSlice(assets),
		SemanticGraph: normalizedSemanticGraph(semanticGraph),
	}
}

func normalizedActions(values []Action) []Action {
	values = nonNilSlice(values)
	for index := range values {
		values[index].Arguments = nonNilSlice(values[index].Arguments)
		values[index].Reads = nonNilSlice(values[index].Reads)
		values[index].Writes = nonNilSlice(values[index].Writes)
		values[index].Contexts = nonNilSlice(values[index].Contexts)
	}
	return values
}

func normalizedComponentRegistries(
	registries []ComponentRegistry,
) []ComponentRegistry {
	registries = nonNilSlice(registries)
	for index := range registries {
		registries[index].Entries = nonNilSlice(registries[index].Entries)
		for entry := range registries[index].Entries {
			registries[index].Entries[entry].ArtifactTargets =
				nonNilSlice(registries[index].Entries[entry].ArtifactTargets)
		}
	}
	return registries
}

func normalizedSemanticGraph(graph SemanticGraph) SemanticGraph {
	graph.Scopes = nonNilSlice(graph.Scopes)
	graph.Declarations = nonNilSlice(graph.Declarations)
	graph.References = nonNilSlice(graph.References)
	graph.Exports = nonNilSlice(graph.Exports)
	return graph
}

func nonNilSlice[Value any](values []Value) []Value {
	if values == nil {
		return []Value{}
	}
	return values
}

func normalizedComponents(values []Component) []Component {
	values = nonNilSlice(values)
	for index := range values {
		values[index].ArtifactTargets = nonNilSlice(values[index].ArtifactTargets)
		values[index].RenderEdges = nonNilSlice(values[index].RenderEdges)
		values[index].Contexts = nonNilSlice(values[index].Contexts)
		values[index].SplitBoundaries = nonNilSlice(values[index].SplitBoundaries)
		values[index].Diagnostics = nonNilSlice(values[index].Diagnostics)
	}
	return values
}

func normalizedJSX(values []JSXElement) []JSXElement {
	values = nonNilSlice(values)
	for index := range values {
		values[index].Attributes = nonNilSlice(values[index].Attributes)
	}
	return values
}

func normalizedCallables(values []CallableSummary) []CallableSummary {
	values = nonNilSlice(values)
	for index := range values {
		values[index].ExportNames = nonNilSlice(values[index].ExportNames)
		values[index].DirectEffectSources = nonNilSlice(
			values[index].DirectEffectSources,
		)
		values[index].EffectSources = nonNilSlice(values[index].EffectSources)
		values[index].Calls = nonNilSlice(values[index].Calls)
		values[index].ArtifactTargets = nonNilSlice(values[index].ArtifactTargets)
		values[index].StateReads = nonNilSlice(values[index].StateReads)
		values[index].StateWrites = nonNilSlice(values[index].StateWrites)
		values[index].Contexts = nonNilSlice(values[index].Contexts)
	}
	return values
}

func normalizedTasks(values []Task) []Task {
	values = nonNilSlice(values)
	for index := range values {
		values[index].Facets = nonNilSlice(values[index].Facets)
		values[index].ReactiveDependencies = nonNilSlice(
			values[index].ReactiveDependencies,
		)
		values[index].Dependencies = nonNilSlice(values[index].Dependencies)
		values[index].Reads = nonNilSlice(values[index].Reads)
		values[index].Writes = nonNilSlice(values[index].Writes)
		values[index].Contexts = nonNilSlice(values[index].Contexts)
		values[index].EffectSources = nonNilSlice(values[index].EffectSources)
		values[index].Resources = nonNilSlice(values[index].Resources)
		values[index].SignalCalls = nonNilSlice(values[index].SignalCalls)
		values[index].Diagnostics = nonNilSlice(values[index].Diagnostics)
	}
	return values
}

func normalizedContinuations(values []Continuation) []Continuation {
	values = nonNilSlice(values)
	for index := range values {
		values[index].Activation.StateReads = nonNilSlice(
			values[index].Activation.StateReads,
		)
		values[index].Activation.Dependencies = nonNilSlice(
			values[index].Activation.Dependencies,
		)
		values[index].Activation.ServerContexts = nonNilSlice(
			values[index].Activation.ServerContexts,
		)
		values[index].Activation.PublicContexts = nonNilSlice(
			values[index].Activation.PublicContexts,
		)
		values[index].Effects.StateWrites = nonNilSlice(
			values[index].Effects.StateWrites,
		)
		values[index].Effects.ContextWrites = nonNilSlice(
			values[index].Effects.ContextWrites,
		)
		values[index].Effects.ServerContextWrites = nonNilSlice(
			values[index].Effects.ServerContextWrites,
		)
		values[index].Effects.Boundaries = nonNilSlice(
			values[index].Effects.Boundaries,
		)
	}
	return values
}

func normalizedResumptions(values []ComponentResumption) []ComponentResumption {
	values = nonNilSlice(values)
	for index := range values {
		values[index].ServerRender.StateReads = nonNilSlice(
			values[index].ServerRender.StateReads,
		)
		values[index].ServerRender.ServerContexts = nonNilSlice(
			values[index].ServerRender.ServerContexts,
		)
		values[index].Client.StatePaths = nonNilSlice(
			values[index].Client.StatePaths,
		)
		values[index].Client.ValueCaptures = nonNilSlice(
			values[index].Client.ValueCaptures,
		)
		values[index].Client.Contexts = nonNilSlice(values[index].Client.Contexts)
		values[index].Client.Boundaries = nonNilSlice(
			values[index].Client.Boundaries,
		)
	}
	return values
}

func normalizedPolicy(value PolicyManifest) PolicyManifest {
	value.Subjects = nonNilSlice(value.Subjects)
	value.Flows = nonNilSlice(value.Flows)
	for index := range value.Flows {
		value.Flows[index].From = nonNilSlice(value.Flows[index].From)
	}
	value.SecretConsumers = nonNilSlice(value.SecretConsumers)
	return value
}

// Timings reports native work without exposing TypeScript implementation data.
type Timings struct {
	ParseMicroseconds       int64 `json:"parseMicroseconds"`
	ProgramMicroseconds     int64 `json:"programMicroseconds"`
	AnalysisMicroseconds    int64 `json:"analysisMicroseconds"`
	SourceMicroseconds      int64 `json:"sourceMicroseconds"`
	CallableMicroseconds    int64 `json:"callableMicroseconds"`
	PolicyTaskMicroseconds  int64 `json:"policyTaskMicroseconds"`
	ProjectLinkMicroseconds int64 `json:"projectLinkMicroseconds"`
	CheckMicroseconds       int64 `json:"checkMicroseconds"`
	LoweringMicroseconds    int64 `json:"loweringMicroseconds"`
	ExtensionMicroseconds   int64 `json:"extensionMicroseconds"`
	PrintMicroseconds       int64 `json:"printMicroseconds"`
	TotalMicroseconds       int64 `json:"totalMicroseconds"`
}

// Response is one newline-delimited result emitted by a Session.
type Response struct {
	ID                string                     `json:"id,omitempty"`
	ProtocolVersion   string                     `json:"protocolVersion"`
	TypeScriptVersion string                     `json:"typescriptVersion"`
	BackendVersion    string                     `json:"backendVersion"`
	Code              string                     `json:"code"`
	SourceMap         *sourcemap.RawSourceMap    `json:"sourceMap,omitempty"`
	Diagnostics       []Diagnostic               `json:"diagnostics"`
	ManifestData      map[string]json.RawMessage `json:"manifestData,omitempty"`
	Analysis          Analysis                   `json:"analysis"`
	Timings           Timings                    `json:"timings"`
	CacheHit          bool                       `json:"cacheHit,omitempty"`
	Error             string                     `json:"error,omitempty"`
}

// NewResponseVersionFields returns the versions required on every response,
// including malformed-request and early-failure responses.
func NewResponseVersionFields(response *Response) {
	response.ProtocolVersion = ProtocolVersion
	response.TypeScriptVersion = core.Version()
	response.BackendVersion = BackendVersion
}

// Module is the native state made available to an extension for one request.
//
// SourceFile and Factory are snapshot-local. Extensions must not retain them
// after Transform returns.
type Module struct {
	ID               string
	Target           Target
	SourceFile       *ast.SourceFile
	Program          *compiler.Program
	Checker          *checker.Checker
	Factory          *printer.NodeFactory
	Directives       []Directive
	Imports          []Import
	Components       []Component
	JSX              []JSXElement
	StateAliases     []StateAlias
	StateReads       []StateRead
	StateWrites      []StateWrite
	ReactiveBindings []ReactiveBinding
	Callables        []CallableSummary
	Tasks            []Task
	Symbols          []SymbolRecord
	Boundaries       []Boundary
	Continuations    []Continuation
	Resumptions      []ComponentResumption
	Policy           PolicyManifest
	Config           json.RawMessage
}

// Contribution is the bounded, serializable result of one extension.
type Contribution struct {
	SourceFile   *ast.SourceFile
	Diagnostics  []Diagnostic
	ManifestData json.RawMessage
}

// Extension is a statically linked native compiler extension.
//
// Namespace is a stable manifest and configuration key. Transform may return
// the input SourceFile when it has no work. Implementations must be
// deterministic and must not retain snapshot-local AST nodes.
type Extension interface {
	Namespace() string
	Transform(module Module) (Contribution, error)
}

// DirectiveExtension declares the namespaced directives owned by an extension.
type DirectiveExtension interface {
	Extension
	Directives() []string
}
