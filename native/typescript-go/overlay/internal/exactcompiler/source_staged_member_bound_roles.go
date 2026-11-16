package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberBoundRoles retains the original source observation beside
// detached dormant input projections. No plan supplies activation or readiness.
type sourceStagedMemberBoundRoles struct {
	source             sourceStagedMemberCandidate
	target, key, value sourceRelativeInputPlan
}

// describeStagedMemberBoundRoles maps source roles through a supplied creating
// association. Central must authenticate that association's exact current-work
// pointer. The boolean validates the original candidate vector only. Missing or
// unsupported inputs retain explicit pending source dependencies, never runtime
// unknown, execution, entry snapshots or completion.
func describeStagedMemberBoundRoles(candidate sourceStagedMemberCandidate, roles sourceStagedMemberSourceRoles, bound sourceRelativeBoundInputs, owner *executableBodyOwner) (sourceStagedMemberBoundRoles, bool) {
	var plan sourceStagedMemberBoundRoles
	expected, valid := describeStagedMemberSourceRoles(candidate, owner)
	if !valid || roles != expected {
		return plan, false
	}
	plan.source = candidate
	plan.source.target = cloneSourceRelativeEndpoint(candidate.target)
	plan.source.key = cloneSourceRelativeEndpoint(candidate.key)
	plan.source.value = cloneSourceRelativeEndpoint(candidate.value)
	plan.source.request = cloneOperationDelta(sourceStagedOperationDelta{required: []sourceStagedOperationRequest{candidate.request}}).required[0]
	associated := bound.declaration == roles.region && roles.region != nil && bound.operation != nil && ast.IsCallExpression(bound.operation) && bound.cut.operation == bound.operation && bound.cut.reading == bound.operation && bound.cut.use == bound.use
	if associated {
		file := ast.GetSourceFileOfNode(bound.operation)
		associated = file != nil && owner.values.program.GetSourceFile(file.FileName()) == file
	}
	project := func(role sourceMemberEndpoint, endpoint sourceRelativeEndpoint) sourceRelativeInputPlan {
		result := sourceRelativeInputPlan{unsupported: relativeInputsUnsupportedCapture}
		if role.kind == memberFormal && associated {
			selected, own := describeStagedStoredFormal(role.expression, roles.region, bound, owner.values)
			if own {
				result = selected
			}
		} else if role.expression != nil && !ast.IsIdentifier(role.expression) && sourceInertValueCreation(role.expression) {
			result.unsupported = relativeInputsSupported
			result.bindings = []sourceRelativeBinding{{sources: []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(endpoint)}}}
		}
		if result.unsupported != relativeInputsSupported {
			if endpoint.expression != nil {
				if len(result.bindings) == 0 {
					result.bindings = []sourceRelativeBinding{{}}
				}
				result.bindings[0].pending = append(result.bindings[0].pending, cloneSourceRelativeEndpoint(endpoint))
			}
		}
		return result
	}
	plan.target = project(roles.target, candidate.target)
	plan.key = project(roles.key, candidate.key)
	plan.value = project(roles.value, candidate.value)
	return plan, true
}
