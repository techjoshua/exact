package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceNativeInstallationMutationSource is the conditional SOURCE owner of one
// genuinely selected installation. It supplies no acquired operand, performed
// write, normal result, identity, or completion receipt. Actual component Gets,
// input/BODY delivery and final native currency remain independent requirements.
type sourceNativeInstallationMutationSource struct {
	request, algorithm sourceStagedOperationRequest
	method             *ast.Node
	kind               sourceNativeKind
	generation         *projectGeneration
	installation       sourceStagedNativeInstallation
}

// sourceNativeInstallationMutationDescription carries only the original
// selected description across the existing returned-Get/adoption boundary.
// Its issuer is the exact ephemeral occurrence, so copying the carrier cannot
// confer event authority. It is never put in facts, recipes or cached summaries.
// No acquired value, query, borrow, input frame or phase observation survives.
type sourceNativeInstallationMutationDescription struct {
	issuer *sourceStagedNativeOccurrence
	epoch  *sourceStagedOperationEpoch
	source *sourceNativeInstallationMutationSource
}

// These records are graph-local observations of the original source intervals.
// They are not copied with recipes or retained input summaries. A pending or
// missing component never denotes an empty mutation output.
type sourceNativeInstallationMutationEnumeration struct {
	source     sourceNativeInstallationMutationSource
	components []sourceNativeInstallationMutationComponent
	sealed     bool
}

type sourceNativeInstallationMutationComponentKind uint8

const (
	nativeInstallationMutationCallee sourceNativeInstallationMutationComponentKind = iota + 1
	nativeInstallationMutationTarget
	nativeInstallationMutationFieldPhase
)

type sourceNativeInstallationMutationComponent struct {
	kind            sourceNativeInstallationMutationComponentKind
	ordinal         int
	phase           sourceStagedFieldObservationPhase
	field           sourceStagedOperationRequest
	member          sourceStagedOperationRequest
	effects         sourceStagedOperationRequest
	source          *sourceOriginalGetMutationSource
	intrinsicSource *sourceOriginalGetMutationSource // Current graph original primitive event only; not cloned with descriptions.
	ownSource       *sourceOriginalGetMutationSource // actual selected literal data terminal; not inferred from syntax
	interest        *sourceOriginalGetMutationInterest
	absent          bool // positive original Has observation; never inferred from outputs
	enumerated      bool
}

func cloneNativeInstallationMutationSource(s *sourceNativeInstallationMutationSource) *sourceNativeInstallationMutationSource {
	if s == nil {
		return nil
	}
	out := *s
	out.installation.target = cloneSourceRelativeEndpoint(s.installation.target)
	out.installation.key = cloneSourceRelativeEndpoint(s.installation.key)
	out.installation.descriptor = cloneSourceRelativeEndpoint(s.installation.descriptor)
	return &out
}

func sameNativeInstallationMutationSource(a, b *sourceNativeInstallationMutationSource) bool {
	return a == b || a != nil && b != nil && a.method == b.method && a.kind == b.kind && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.algorithm, b.algorithm) && sameOperationRequest(a.installation.request, b.installation.request) && sameOperationEndpoint(a.installation.target, b.installation.target) && sameOperationEndpoint(a.installation.key, b.installation.key) && sameOperationEndpoint(a.installation.descriptor, b.installation.descriptor)
}

// This first output domain is an original direct literal descriptor. Other
// source forms retain their existing Effects and remain pending for mutation
// DATA. Static spelling here only bounds an already selected native relation.
func validNativeInstallationMutationSource(s *sourceNativeInstallationMutationSource) bool {
	if s == nil || s.generation == nil || s.kind != sourceNativeObjectDefineProperty || s.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(s.method)) || !sameOperationRequest(s.request, s.installation.request) {
		return false
	}
	r := s.request
	call := r.producer.operation
	if call == nil || !ast.IsCallExpression(call) || r.producer.declaration == nil || r.producer.kind != relativeDemandEffects || r.producer.selector != (sourceStagedOperationSelector{}) || r.consumer != r.producer.declaration || r.inputs != nil || r.reading != (sourceStagedOperationKey{}) || r.use != call || r.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || !sourceStagedOccurrenceOwned(call, r.producer.declaration) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || !ast.IsStringLiteralLike(actuals[1]) || !ast.IsObjectLiteralExpression(actuals[2]) || !sameOperationRequest(s.algorithm, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: r, get: call.Expression()}, "algorithm")) {
		return false
	}
	for index, endpoint := range []sourceRelativeEndpoint{s.installation.target, s.installation.key, s.installation.descriptor} {
		expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals[index], producer: call, cut: r.cut}
		if !sameOperationEndpoint(endpoint, expected) {
			return false
		}
	}
	for _, property := range actuals[2].AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" || !sourceInertValueCreation(property.AsPropertyAssignment().Initializer) {
			return false
		}
	}
	return true
}

func nativeInstallationMutationRequirements(s *sourceNativeInstallationMutationSource) []sourceStagedOperationRequest {
	if !validNativeInstallationMutationSource(s) {
		return nil
	}
	n := &sourceStagedNativeGetSource{request: s.request, get: s.request.producer.operation.Expression()}
	required := []sourceStagedOperationRequest{s.request, s.algorithm, nativeRootDebtRequest(n, "callee-get"), nativeRootDebtRequest(n, "eager-inputs")}
	for _, name := range reflectiveDescriptorKeys {
		field := s.request
		field.producer.selector = sourceStagedOperationSelector{occurrence: s.installation.descriptor.expression, field: name}
		required = appendEntryLawRequirement(required, field)
	}
	return required
}

// Current here authenticates an actual selected description in this graph. It
// deliberately asks neither component extraction nor parent Effects closure.
func (work *callableEffectWork) nativeInstallationMutationCurrent(s *sourceNativeInstallationMutationSource) bool {
	if !validNativeInstallationMutationSource(s) || s.generation != work.operationGeneration || !s.generation.active {
		return false
	}
	id, adopted := work.operationIDs[s.algorithm.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	e := state.installationMutations
	algorithm, registered := work.operationRecipes[s.algorithm.producer]
	n := algorithm.nativeGet
	if state.invalid || e == nil || !sameNativeInstallationMutationSource(&e.source, s) || !registered || !validNativeGetRecipe(algorithm) || n == nil || n.installation == nil || !sameOperationRequest(n.request, s.request) || n.kind != s.kind || n.method != s.method {
		return false
	}
	actual := sourceNativeInstallationMutationSource{request: n.request, algorithm: nativeRootDebtRequest(n, "algorithm"), kind: n.kind, method: n.method, generation: work.operationGeneration, installation: *n.installation}
	return sameNativeInstallationMutationSource(&actual, s)
}

func (work *callableEffectWork) nativeInstallationMutationSourceFor(n *sourceStagedNativeGetSource) (*sourceNativeInstallationMutationSource, bool) {
	if n == nil {
		return nil, false
	}
	id, adopted := work.operationIDs[nativeRootDebtRequest(n, "algorithm").producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].installationMutations == nil {
		return nil, false
	}
	s := &work.operations[id.index].installationMutations.source
	if !sameOperationRequest(s.request, n.request) || s.method != n.method || s.kind != n.kind || !work.nativeInstallationMutationCurrent(s) {
		return nil, false
	}
	return cloneNativeInstallationMutationSource(s), true
}

// Selection issues pending component interests only. It runs before callee Get
// completion and does not acquire operands or turn their AST endpoints into DATA.
func (work *callableEffectWork) observeNativeInstallationMutationSelection(facts []callableFacts, q *sourceValueQuery, source *sourceStagedNativeGetSource, selection *sourceStagedNativeSelection, occurrence *sourceStagedNativeOccurrence) bool {
	if q == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.stagedNativeGet == nil || source == nil || selection == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return false
	}
	b := q.stagedNativeGet
	if b.issuer != q || b.sourceWork != work || b.sourceEpoch != work.operationEpoch || b.owner != q.owner || b.generation != work.operationGeneration || b.generation != q.owner.generation || b.inputSelection != selection || !b.canonical || b.contextual || b.writerDependent || b.legacyPrepared || selection.selected.native == nil || selection.selected.native.kind != sourceNativeObjectDefineProperty || selection.selected.node != source.method || selection.call != b.call || selection.get != source.get || !sameOperationRequest(selection.request, source.request) {
		return false
	}
	actor, known := work.memberNodes[source.request.consumer]
	publisher := q.executable.pendingMemberPublishers[source.request.consumer]
	if !known || actor < 0 || actor >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[actor] || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.owner.program.GetSourceFile(facts[actor].sourceFile.FileName()) != facts[actor].sourceFile {
		return false
	}
	algorithm := nativeRootDebtRequest(source, "algorithm")
	recipe, registered := work.operationRecipes[algorithm.producer]
	n := recipe.nativeGet
	if !registered || !validNativeGetRecipe(recipe) || n == nil || n.installation == nil || !sameNativeGetSource(n, source) {
		return false
	}
	header := sourceNativeInstallationMutationSource{request: n.request, algorithm: algorithm, method: n.method, kind: n.kind, generation: work.operationGeneration, installation: *n.installation}
	if !work.nativeInstallationMutationDescriptionRegistered(facts, &header) {
		return false
	}
	if occurrence != nil {
		if occurrence.work != work || occurrence.generation != header.generation || occurrence.source == nil || !sameNativeGetSource(occurrence.source, source) {
			return false
		}
		if prior := occurrence.installationDescription; prior != nil {
			if prior.issuer != occurrence || prior.epoch != work.operationEpoch || !sameNativeInstallationMutationSource(prior.source, &header) {
				return false
			}
		} else {
			occurrence.installationDescription = &sourceNativeInstallationMutationDescription{issuer: occurrence, epoch: work.operationEpoch, source: cloneNativeInstallationMutationSource(&header)}
		}
	}
	id, adopted := work.operationIDs[header.algorithm.producer]
	if !adopted {
		return occurrence != nil // Description only; normal adoption remains its original owner's decision.
	}
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	return work.initializeNativeInstallationMutationDescription(facts, &header)
}

// Registered selected relationships can exist before any operation ID. These
// checks authenticate immutable description correspondence, never Get currency,
// output DATA, required closure or permission to schedule an unused producer.
func (work *callableEffectWork) nativeInstallationMutationDescriptionRegistered(facts []callableFacts, header *sourceNativeInstallationMutationSource) bool {
	if !validNativeInstallationMutationSource(header) || work.operationGeneration == nil || !work.operationGeneration.active || header.generation != work.operationGeneration || work.operationGeneration.program == nil || work.operationGeneration.checker == nil {
		return false
	}
	actor, known := work.memberNodes[header.request.consumer]
	if !known || actor < 0 || actor >= len(facts) || len(facts) != len(work.operationFacts) || &facts[actor] != &work.operationFacts[actor] || facts[actor].node != header.request.producer.declaration || facts[actor].sourceFile == nil || work.operationGeneration.program.GetSourceFile(facts[actor].sourceFile.FileName()) != facts[actor].sourceFile {
		return false
	}
	recipe := work.operationRecipes[header.algorithm.producer]
	n := recipe.nativeGet
	if !validNativeGetRecipe(recipe) || n == nil || n.installation == nil || n.kind != header.kind || n.method != header.method || !sameOperationRequest(n.request, header.request) {
		return false
	}
	actual := &sourceNativeInstallationMutationSource{request: n.request, algorithm: nativeRootDebtRequest(n, "algorithm"), method: n.method, kind: n.kind, generation: work.operationGeneration, installation: *n.installation}
	if !sameNativeInstallationMutationSource(actual, header) {
		return false
	}
	for ordinal := range reflectiveDescriptorKeys {
		field, issued := nativeInstallationMutationField(header, ordinal)
		registered := work.operationRecipes[field.producer]
		if !issued || !validNativeGetRequest(registered, field) || !sameNativeGetSource(registered.nativeGet, n) {
			return false
		}
	}
	return true
}

// Only actual adoption of the SAME original returned occurrence consumes this
// optional description. A clone or a cached use cannot initialize observation
// state. The pending enum supplies no Get/Has/BODY event or completion receipt.
func (work *callableEffectWork) completeNativeInstallationMutationOccurrence(facts []callableFacts, occurrence *sourceStagedNativeOccurrence) bool {
	if occurrence == nil || occurrence.installationDescription == nil || occurrence.work != work || occurrence.generation != work.operationGeneration || occurrence.source == nil {
		return false
	}
	description := occurrence.installationDescription
	header := description.source
	if description.issuer != occurrence || description.epoch != work.operationEpoch || header == nil || header.generation != occurrence.generation || !sameOperationRequest(occurrence.source.request, header.request) || occurrence.source.kind != header.kind || occurrence.source.method != header.method || !work.nativeInstallationMutationDescriptionRegistered(facts, header) {
		return false
	}
	return work.initializeNativeInstallationMutationDescription(facts, header)
}

// This materializes only a proven description after existing consumer adoption.
// Callers are the live selected interval or its exact returned-occurrence owner;
// no source traversal runs and no phase state is inferred from the header.
func (work *callableEffectWork) initializeNativeInstallationMutationDescription(facts []callableFacts, header *sourceNativeInstallationMutationSource) bool {
	if !work.nativeInstallationMutationDescriptionRegistered(facts, header) {
		return false
	}
	id, adopted := work.operationIDs[header.algorithm.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	if previous := work.operations[id.index].installationMutations; previous != nil {
		return sameNativeInstallationMutationSource(&previous.source, header)
	}
	enumeration := &sourceNativeInstallationMutationEnumeration{source: *cloneNativeInstallationMutationSource(header)}
	for ordinal, name := range reflectiveDescriptorKeys {
		field := header.request
		field.producer.selector = sourceStagedOperationSelector{occurrence: header.installation.descriptor.expression, field: name}
		if !validNativeGetRequest(work.operationRecipes[field.producer], field) {
			return false
		}
		for _, phase := range []sourceStagedFieldObservationPhase{stagedFieldObservationHas, stagedFieldObservationGet} {
			member, valid := stagedFieldMemberRequest(field, phase)
			if !valid {
				return false
			}
			h := &sourceOriginalGetNativeField{root: header.request, algorithm: header.algorithm, field: field, member: member, ordinal: ordinal, phase: phase, method: header.method, kind: header.kind, generation: header.generation}
			interest := &sourceOriginalGetMutationInterest{nativeField: h, origin: field, parent: member, operation: field.producer.operation, generation: h.generation}
			if !work.registerOriginalGetMutationInterest(facts, interest) {
				return false
			}
			enumeration.components = append(enumeration.components, sourceNativeInstallationMutationComponent{kind: nativeInstallationMutationFieldPhase, ordinal: ordinal, phase: phase, field: field, member: member, effects: field, interest: cloneOriginalGetMutationInterest(interest)})
		}
	}
	// Registration may append operation states; reborrow by immutable ID.
	work.operations[id.index].installationMutations = enumeration
	work.publishDeclaredNativeMutationData(facts, id)
	return true
}
