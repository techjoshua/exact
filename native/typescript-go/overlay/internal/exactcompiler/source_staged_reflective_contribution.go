package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// sourceStagedReflectiveContribution is a conditional SOURCE membership for one
// original member reader. It is not an executed installation, a selected value,
// a NoUser law or a substitute for descriptor/callable DATA. All stored fields
// are detached descriptions; graph observations remain on the existing owner.
type sourceStagedReflectiveContribution struct {
	request, parent, root, algorithm sourceStagedOperationRequest
	installation                     sourceStagedNativeInstallation
	method                           *ast.Node
	kind                             sourceNativeKind
	generation                       *projectGeneration
	purpose                          sourceReflectiveContributionPurpose
	reader                           sourceStagedOperationRequest
	data                             []sourceStagedOperationRequest
}
type sourceReflectiveContributionPurpose uint8

const (
	reflectiveContributionHas sourceReflectiveContributionPurpose = iota + 1
	reflectiveContributionFieldGet
	reflectiveContributionRecordGet
)

func cloneReflectiveContribution(s *sourceStagedReflectiveContribution) *sourceStagedReflectiveContribution {
	if s == nil {
		return nil
	}
	out := *s
	out.installation.target = cloneSourceRelativeEndpoint(s.installation.target)
	out.installation.key = cloneSourceRelativeEndpoint(s.installation.key)
	out.installation.descriptor = cloneSourceRelativeEndpoint(s.installation.descriptor)
	out.data = cloneOperationDelta(sourceStagedOperationDelta{required: s.data}).required
	return &out
}
func sameReflectiveContribution(a, b *sourceStagedReflectiveContribution) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && a.method == b.method && a.kind == b.kind && a.purpose == b.purpose && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.parent, b.parent) && sameOperationRequest(a.root, b.root) && sameOperationRequest(a.algorithm, b.algorithm) && sameOperationRequest(a.reader, b.reader) && sameOperationRequest(a.installation.request, b.installation.request) && sameOperationEndpoint(a.installation.target, b.installation.target) && sameOperationEndpoint(a.installation.key, b.installation.key) && sameOperationEndpoint(a.installation.descriptor, b.installation.descriptor) && operationPrefix(a.data, b.data, sameOperationRequest) && operationPrefix(b.data, a.data, sameOperationRequest)
}
func validReflectiveContributionRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	if s == nil || s.reflectiveContribution == nil {
		return false
	}
	d := s.reflectiveContribution
	c := s.candidate
	if !c.reflective || c.protocol || c.getContribution || c.invoking || c.runtimeUnknown || c.operation == nil || !ast.IsCallExpression(c.operation) || c.region != s.parent.consumer || !stagedMemberFactoryParent(s) || !stagedMemberFactoryObservation(s, c.cut) || !sameOperationRequest(s.request, stagedMemberCandidateRequest(s.parent, c)) || recipe.key != s.request.producer || !sameOperationRequest(d.request, s.request) || !sameOperationRequest(d.parent, s.parent) || d.generation == nil || d.generation != s.generation || d.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(d.method)) || !reflectiveNative(d.kind) {
		return false
	}
	if recipe.nativeGet != nil || recipe.constructed != nil || recipe.writer != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || s.frameworkRead != nil || s.coverage != nil || s.call != nil || s.getEffects != nil || s.protocolSource != nil || s.targetSource != nil || s.nativeWriter != nil || s.globalWrite != nil || s.hasFreshTarget != nil || s.descriptorStrong != nil || s.writeEffects || s.moduleExcluded != nil || s.installedMember != nil || s.installedCallSelection != nil || len(s.values)+len(s.moduleImports)+len(recipe.writerRequired)+len(recipe.delta.exposures)+len(recipe.delta.effects)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if s.extraction == nil || s.extraction.generation != s.generation || !sameOperationRequest(s.extraction.request, s.parent) || s.extraction.cut != c.cut || s.extraction.delta.extracted {
		return false
	}
	call := c.operation
	if d.root.producer != (sourceStagedOperationKey{declaration: c.region, operation: call, kind: relativeDemandEffects}) || d.root.consumer != c.region || d.root.inputs != nil || d.root.use != call || d.root.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || !sameOperationRequest(d.installation.request, d.root) || len(recipe.delta.required) < 1 || !sameOperationRequest(recipe.delta.required[0], d.root) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || d.installation.target.expression != actuals[0] || d.installation.key.expression != actuals[1] || d.installation.descriptor.expression != actuals[2] || c.target.expression != actuals[0] || c.key.expression != actuals[1] || c.value.expression != actuals[2] || !ast.IsStringLiteralLike(actuals[1]) {
		return false
	}
	for _, endpoint := range []sourceRelativeEndpoint{d.installation.target, d.installation.key, d.installation.descriptor} {
		if endpoint.kind != relativeEndpointExpression || endpoint.producer != call || endpoint.cut != d.root.cut || len(endpoint.projection) != 0 {
			return false
		}
	}
	if !sameOperationRequest(d.algorithm, nativeRootDebtRequest(&sourceStagedNativeGetSource{request: d.root, get: call.Expression()}, "algorithm")) {
		return false
	}
	if d.purpose != reflectiveContributionHas && d.purpose != reflectiveContributionFieldGet && d.purpose != reflectiveContributionRecordGet {
		return false
	}
	if d.purpose == reflectiveContributionHas && len(d.data) != 0 || d.purpose != reflectiveContributionHas && len(d.data) != 1 {
		return false
	}
	field, phase, isField := stagedFieldMemberParent(s.parent)
	if d.purpose == reflectiveContributionRecordGet {
		if isField || !sameOperationRequest(d.reader, descriptorRecordGetEffectsRequest(s.parent)) {
			return false
		}
	} else if !isField || !sameOperationRequest(d.reader, field) || (d.purpose == reflectiveContributionHas) != (phase == stagedFieldObservationHas) || (d.purpose == reflectiveContributionFieldGet) != (phase == stagedFieldObservationGet) {
		return false
	}
	if len(d.data) != 0 {
		original := &sourceStagedNativeGetSource{request: d.root, descriptorGet: actuals[2]}
		if !sameOperationRequest(d.data[0], nativeFieldExposureRequest(original, "get", d.reader)) {
			return false
		}
	}
	if len(recipe.delta.required) > 1+len(d.data) {
		return false
	}
	for index, r := range recipe.delta.required[1:] {
		if !sameOperationRequest(r, d.data[index]) {
			return false
		}
	}
	// A pending reader description may precede its actual registration. Its DATA
	// tail must be enrolled before local extraction, never appended after sealing.
	return !recipe.delta.extracted || len(recipe.delta.required) == 1+len(d.data)
}
func (work *callableEffectWork) reflectiveContributionCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validReflectiveContributionRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	d := recipe.memberSource.reflectiveContribution
	root := work.operationRecipes[d.root.producer].nativeGet
	source := work.operationRecipes[d.algorithm.producer].nativeGet
	if root == nil || source == nil || !validNativeGetRecipe(work.operationRecipes[d.algorithm.producer]) {
		return false
	}
	for _, request := range recipe.delta.required[1:] {
		child, registered := work.operationRecipes[request.producer]
		if !registered || !validNativeFieldExposureRecipe(child) || !sameNativeGetSource(source, child.nativeGet) || !sameOperationRequest(request, nativeFieldExposureRequest(child.nativeGet, "get", d.reader)) {
			return false
		}
	}
	return sameNativeGetSource(root, source) && sameOperationRequest(source.request, d.root) && source.kind == d.kind && source.method == d.method && source.installation != nil && sameOperationRequest(source.installation.request, d.installation.request) && sameOperationEndpoint(source.installation.target, d.installation.target) && sameOperationEndpoint(source.installation.key, d.installation.key) && sameOperationEndpoint(source.installation.descriptor, d.installation.descriptor)
}
func (work *callableEffectWork) publishReflectiveContribution(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	return work.reflectiveContributionCurrent(recipe) && recipe.delta.extracted && work.publishOperation(id, recipe.delta)
}

// Fingerprinting retains detached reader/source correspondence only. Live
// publisher observations remain generation-local and are not serialized here.
func reflectiveContributionFingerprint(d *sourceStagedReflectiveContribution, result *strings.Builder) {
	if d == nil {
		return
	}
	result.WriteString(fmt.Sprintf("|reflective-contribution:%d:%p:%p:%d:%#v:%#v:%#v:%#v:%#v:%#v", d.purpose, d.generation, d.method, d.kind, d.request, d.parent, d.root, d.algorithm, d.reader, d.data))
	descriptorFingerprintEndpoint(d.installation.target, result)
	descriptorFingerprintEndpoint(d.installation.key, result)
	descriptorFingerprintEndpoint(d.installation.descriptor, result)
}
