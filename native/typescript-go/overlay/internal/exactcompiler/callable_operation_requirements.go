package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedOperationEpoch identifies one work graph, not a source generation's
// cached query results. Operation IDs and delivery cursors expire with this token.
// A cloned graph must allocate another token and rebuild IDs from source keys.
type sourceStagedOperationEpoch struct{ identity byte }

// sourceStagedOperationID is issued only by the callable effect work owner after
// authenticating a source key. Index zero is absent. An ID has no acquisition,
// normal completion, value, descriptor, mutation or policy authority.
type sourceStagedOperationID struct {
	epoch *sourceStagedOperationEpoch
	index uint32
}

// sourceStagedOperationSelector names original projection syntax or one fixed
// semantic field selected by an algorithm owner. Field is never a synthesized
// recursive path or runtime property value. The zero selector is direct exposure.
type sourceStagedOperationSelector struct {
	occurrence  *ast.Node
	association *ast.Node // original owning source anchor for a finite writer/read relation
	field       string
}

// sourceStagedOperationKey names a declaration-relative producer. Selector is an
// original Get/projection occurrence or fixed field role, with zero for direct
// result exposure. It is never a concatenated recursion path or an application's current input vector.
// Exact-proof demands remain with their existing owner and are not admitted by
// the effect/exposure operation protocol.
type sourceStagedOperationKey struct {
	declaration, operation *ast.Node
	selector               sourceStagedOperationSelector
	kind                   sourceRelativeDemandKind
}

// sourceStagedOperationRequest separates producer identity from its issuing use.
// Inputs, when present, are the sealed descriptive A/C edge, not binder authority.
// A nil inputs edge means a definition-relative request, never empty actuals or
// a license to substitute the current caller. All cuts remain descriptive.
type sourceStagedOperationRequest struct {
	producer sourceStagedOperationKey
	consumer *ast.Node
	edge     string
	use      *ast.Node
	cut      sourceRelativeCut
	inputs   *sourceRelativeInputEdge
	// Reading identifies a separately issued original field Get consuming a
	// conditional installation's field exposure. It is descriptive source
	// identity, never an installed frame or authority to execute a stored value.
	reading sourceStagedOperationKey
}

// sourceStagedOperationAlternative keeps one exposed source with its composition
// association. The work owner seals endpoint slices and assigns an alternative
// identity without separating correlated receiver/actual/capture contributions.
// Creating is the original factory edge. A later invocation supplies its own
// separate input edge. Receiving this record does not invoke its callable.
type sourceStagedOperationAlternative struct {
	endpoint sourceRelativeEndpoint
	creating *sourceRelativeInputEdge
}

// sourceStagedOperationInvocation is issued by an actual reached operation,
// including an implicit getter Call. Storage and exposure cannot issue it.
// Its declaration selects an existing callable summary, not another body driver.
type sourceStagedOperationInvocation struct {
	declaration, operation *ast.Node
	alternative            sourceStagedOperationAlternative
	inputs                 *sourceRelativeInputEdge // Later Call, distinct from alternative.creating.
}

// sourceStagedOperationResidual preserves a dynamic source alternative beside
// known contributions. A role stays declaration-relative. An empty or absent
// record is not proof of empty callable exposure or completed compiler work.
type sourceStagedOperationResidual struct {
	mutation  *sourceRelativeFieldMutation // Explicit symbolic/terminal mutation, never an invocation role.
	operation *ast.Node
	role      sourceRelativeRole
}

// sourceStagedOperationDelta is a cumulative, append-only immutable source prefix.
// Every atom must belong to the registered recipe envelope, in source order.
// Extraction may transition from pending to ready without adding an atom.
// A ready empty prefix is not coverage unless a nonempty recipe has been delivered.
// Local extraction may finish with required dependencies still pending. Only the
// work owner's closure phase settles them. The normal descriptor/result owners
// do not consume this as an output, successful execution or NoWrites receipt.
// Existing summary edges transport state/context effects from invoked bodies.
type sourceStagedOperationDelta struct {
	readWrites []sourceQualifiedReadWrite // SOURCE-qualified conditional BODY effects, never DATA/current mutation.
	exposures  []sourceStagedOperationAlternative
	invoked    []sourceStagedOperationInvocation
	relative   []sourceRelativeInvokedInput
	effects    []EnvironmentEffectSource
	required   []sourceStagedOperationRequest
	residuals  []sourceStagedOperationResidual
	extracted  bool
}

// sourceStagedOperationDelivery is one subscriber's unseen publication prefix.
// Revision includes disposition changes with no new atoms. Extracted is local
// producer readiness only. It cannot stand in for required-dependency closure.
type sourceStagedOperationDelivery struct {
	producer sourceStagedOperationID
	revision uint64
	delta    sourceStagedOperationDelta
}

// sourceStagedOperationRecipe is a sealed declaration-relative source template.
// Delta bounds the finite atom domain before delivery. A required request names
// an eager Effects producer for this declaration. It schedules and delivers to
// that exact issuing consumer, never invokes a stored exposure or merges an
// unrelated declaration body. Other dependency capabilities remain unadmitted.
// Registration alone queues no work and invokes no stored callable. Each graph
// reconstructs its index, while the source endpoints remain immutable.
type sourceStagedOperationRecipe struct {
	mutationData              *sourceFieldMutationData          // Conditional mutation SOURCE child, not Effects or stored value.
	installedMutationRHS      *sourceInstalledMutationRHS       // Actual implicit binding DATA; no ordinary Get guard loan.
	installedCall             *sourceInstalledCallPhase         // original conditional SOURCE Call observation
	installedMember           *sourceInstalledMemberApplication // original installed SOURCE phase, not definition-relative
	descriptorTarget          *sourceDescriptorTargetSource     // Original own-descriptor population and stored DATA; never [[Get]].
	descriptorSource          *sourceStagedDescriptorSource     // Original descriptor callee demand, never selected source authority.
	frameworkEffects          *sourceFrameworkStorageView       // Original declared framework Call Effects, separate from its DATA view.
	moduleArgument            *sourceStagedModuleArgumentSource // Demanded original module argument observation.
	declarationCall           *sourceStagedDeclarationCall      // Original direct lexical Call Effects, not DATA or actual entry.
	declarationCallGeneration *projectGeneration
	entryLaw                  *sourceStagedEntryLawSource      // Original implicit no-user-entry contribution, never Effects inference.
	constructionEffects       *sourceStagedConstructionEffects // Original New Effects, never output/category.
	assignment                *sourceStagedAssignment          // Original plain Set Effects, no write/value result.
	hasInstance               *sourceStagedHasInstanceSource   // Original operator protocol, not a normal result.
	callResult                *sourceStagedCallResultSource
	memberSource              *sourceStagedMemberSource // original pre-recovery writer relationship, never activation
	mapEntry                  *sourceStagedMapEntryContribution
	mapProtocol               *sourceStagedMapProtocolContribution

	writer         *sourceStagedWriterProjectionSource // detached original writer owner publication
	writerRequired []sourceStagedOperationRequest      // exact RHS obligations, independent of local writer coverage

	key                    sourceStagedOperationKey
	getter                 *ast.Node
	returning              *ast.Node                            // authenticated original return template, not a normal result
	constructedDisposition *sourceStagedConstructedDisposition  // independently owned Effects/source transport disposition
	constructedInputs      []sourceStagedOperationRequest       // independently issued result-data prerequisites
	constructedGroup       []sourceStagedConstructedMember      // sealed finite source alternatives of an original member occurrence
	constructed            *sourceStagedConstructedMember       // conditional original construction/member source, not output
	nativeGet              *sourceStagedNativeGetSource         // detached conditional branch with independent pending debts
	fieldMutationLinks     []sourceOriginalGetMutationFieldLink // exact same-field direct delivery, never materialized atoms
	fieldForwards          []sourceStagedFieldForward           // immutable original data-Get associations, never invocation
	delta                  sourceStagedOperationDelta
}

// sourceStagedOperationUse is the issuing consumer, separate from its producer.
// A nonnil call requests invocation of exposed alternatives. A nil call consumes
// eager effects only. The request retains its original creating association.
type sourceStagedOperationUse struct {
	installed *sourceStagedInstalledFieldUse // detached actual Get, separate from source projection
	request   sourceStagedOperationRequest
	call      *ast.Node
}
