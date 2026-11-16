package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sort"
)

// installedFieldGetReaderDemand preserves the original native field issuer and
// admits the separately authenticated returned-record Get as a second reader.
// It does not make arbitrary member effects into native conversion fields.
func (work *callableEffectWork) installedFieldGetReaderDemand(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) (sourceStagedFieldEffectsDemand, bool) {
	if demand, valid := work.issueFieldEffectsDemand(facts, id, owner); valid {
		return demand, true
	}
	return work.descriptorRecordGetDemand(facts, id, owner)
}

func descriptorRecordPrototypeTarget(source *sourceStagedNativeGetSource, reader *sourceDescriptorRecordGet, owner *executableBodyOwner) bool {
	if source == nil || source.installation == nil || reader == nil || owner == nil || owner.values == nil || source.installation.key.expression == nil || !ast.IsStringLiteralLike(source.installation.key.expression) || source.installation.key.expression.Text() != reader.field {
		return false
	}
	target := source.installation.target.expression
	if target == nil || !ast.IsPropertyAccessExpression(target) || callableNameText(target.Name()) != "prototype" || !ast.IsIdentifier(target.Expression()) || source.standard.root != reader.prototype.root || source.standard.prototype != reader.prototype.prototype || !source.standard.ordinaryLink {
		return false
	}
	root := owner.checker.GetSymbolAtLocation(target.Expression())
	return root != nil && root.ValueDeclaration == reader.prototype.root && owner.values.program.GetSourceFile(ast.GetSourceFileOfNode(target).FileName()) == ast.GetSourceFileOfNode(target)
}

// validDescriptorRecordInstallationReading validates an actual required DATA
// child. Selection, root Effects and exposure closure stay on that child and
// its existing installation publisher. This grants no target getter invocation.
func (work *callableEffectWork) validDescriptorRecordInstallationReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest, reader sourceStagedOperationRecipe) bool {
	if !validDescriptorRecordGetRecipe(reader) || !validNativeFieldExposureRecipe(recipe) || reader.memberSource.generation != work.operationGeneration || recipe.nativeGet.request.producer.declaration != reader.memberSource.request.consumer {
		return false
	}
	d := reader.memberSource.getEffects.descriptor
	if work.operationGeneration == nil || work.operationGeneration.program == nil || work.operationGeneration.checker == nil {
		return false
	}
	target := recipe.nativeGet.installation.target.expression
	if target == nil || !ast.IsPropertyAccessExpression(target) || callableNameText(target.Name()) != "prototype" || !ast.IsIdentifier(target.Expression()) || recipe.nativeGet.standard.root != d.prototype.root || recipe.nativeGet.standard.prototype != d.prototype.prototype || !recipe.nativeGet.standard.ordinaryLink {
		return false
	}
	root := work.operationGeneration.checker.GetSymbolAtLocation(target.Expression())
	if root == nil || root.ValueDeclaration != d.prototype.root || work.operationGeneration.program.GetSourceFile(ast.GetSourceFileOfNode(target).FileName()) != ast.GetSourceFileOfNode(target) {
		return false
	}
	if recipe.nativeGet.installation.key.expression.Text() != d.field || !sameOperationRequest(request, nativeFieldExposureRequest(recipe.nativeGet, recipe.key.selector.field, reader.memberSource.request)) {
		return false
	}
	for _, required := range reader.delta.required[2:] {
		if sameOperationRequest(required, request) {
			return true
		}
	}
	return false
}

// descriptorRecordInstallationRequirements runs during this real record Get,
// before its member-get-effects recipe seals. Source membership comes from the
// original prototype C, not from this narrower index of selected installations.
// Other source mappings remain required/pending even when one getter is known.
func (work *callableEffectWork) descriptorRecordInstallationRequirements(facts []callableFacts, q *sourceValueQuery, source *sourceDescriptorRecordGet, reader sourceStagedOperationRequest) ([]sourceStagedOperationRequest, bool) {
	if q == nil || q.stagedMember == nil || q.executable == nil || source == nil || !validDescriptorRecordGetUse(&source.use, q.stagedMember.request, q.stagedMember.observation) {
		return nil, false
	}
	var required []sourceStagedOperationRequest
	var installations []*sourceStagedNativeGetSource
	ready := true
	for declaration, fields := range work.nativeInstallations {
		for _, installation := range fields[source.field] {
			if runtimeModuleEvaluation(q.effectOwner) && q.afterRead(installation.request.producer.operation) {
				continue // The same original once-only prefix fence used by prototype C.
			}
			if !descriptorRecordPrototypeTarget(installation, source, q.executable) {
				continue
			}
			if declaration != reader.consumer {
				// The existing exposure factory owns same-declaration Get uses. A
				// known foreign prototype installation cannot become an empty
				// inherited branch just because its Call Effects are represented.
				ready = false
				continue
			}
			installations = append(installations, installation)
		}
	}
	sort.Slice(installations, func(i, j int) bool {
		return installations[i].request.producer.operation.Pos() < installations[j].request.producer.operation.Pos()
	})
	for _, installation := range installations {
		for _, field := range []string{"get"} {
			if _, admitted := work.ensureFieldExposure(facts, installation, field); !admitted {
				return required, false
			}
			required = appendEntryLawRequirement(required, nativeFieldExposureRequest(installation, field, reader))
		}
	}
	return required, ready
}

// subscribeDescriptorRecordInstallations uses existing exposure delivery and
// guarded getter-summary consumers. No descriptor is reconstructed and no body
// runs merely because its callable DATA is stored in an installation.
func (work *callableEffectWork) subscribeDescriptorRecordInstallations(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) bool {
	demand, valid := work.descriptorRecordGetDemand(facts, id, owner)
	if !valid {
		return false
	}
	recipe := work.operationRecipes[demand.request.producer]
	for _, request := range recipe.delta.required[2:] {
		child := work.operationRecipes[request.producer]
		if !work.validDescriptorRecordInstallationReading(child, request, recipe) {
			return false
		}
		use := sourceStagedOperationUse{request: request, installed: &sourceStagedInstalledFieldUse{receiver: cloneSourceRelativeEndpoint(demand.receiver), cut: recipe.memberSource.candidate.cut}}
		if !work.registerOperationUse(facts, use) {
			return false
		}
		work.attachInstalledFieldDependencies(id, child.nativeGet, request)
		childID := work.operationIDs[request.producer]
		work.registerOperationDependencies(facts, childID)
		if operationDeltaSize(child.delta) != 0 {
			work.publishOperation(childID, child.delta)
		}
	}
	return true
}
