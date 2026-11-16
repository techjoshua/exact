package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Storage substitution selects only the original writer RHS role. Written
// formals and captures never borrow the initial entry binding.
func describeStagedWriterStoredRHS(rhs, declaration *ast.Node, bound sourceRelativeBoundInputs, owner *sourceValueOwner) sourceRelativeInputPlan {
	result := sourceRelativeInputPlan{unsupported: bound.unsupported}
	if ast.IsIdentifier(rhs) {
		if selected, own := describeStagedStoredFormal(rhs, declaration, bound, owner); own {
			return selected
		}

		result.unsupported = relativeInputsUnsupportedCapture
	} else if !sourceInertValueCreation(rhs) {
		result.unsupported = relativeInputsUnsupportedCapture
	}
	return result
}

// describeStagedStoredFormal selects dormant DATA from an own unwritten formal.
// True identifies the formal even when default/rest/written/missing inputs keep
// it unsupported. It never substitutes an invoked role or acquires a value.
func describeStagedStoredFormal(rhs, declaration *ast.Node, bound sourceRelativeBoundInputs, owner *sourceValueOwner) (sourceRelativeInputPlan, bool) {
	result := sourceRelativeInputPlan{unsupported: bound.unsupported}
	if rhs == nil || !ast.IsIdentifier(rhs) || owner == nil || owner.checker == nil || declaration == nil {
		return result, false
	}
	selected := owner.checker.GetSymbolAtLocation(rhs)
	if selected != nil && selected.ValueDeclaration != nil && ast.IsParameterDeclaration(selected.ValueDeclaration) && enclosingCallableNode(selected.ValueDeclaration) == declaration {
		position := 0
		for _, parameter := range declaration.Parameters() {
			if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			if parameter == selected.ValueDeclaration {
				if parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil || owner.bindingWritten(selected) {
					result.unsupported = relativeInputsUnsupportedCapture
					return result, true
				}
				role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: position}
				for _, binding := range bound.bindings {
					if binding.target == role {
						result.bindings = append(result.bindings, cloneSourceRelativeBinding(binding))
					}
				}
				if len(result.bindings) == 0 {
					result.unsupported = relativeInputsUnsupportedCapture
				}
				// A data-role consumer does not demand another role's receiver
				// or capture projection. The original binder has already supplied
				// this unmodified formal's own complete source alternatives.
				if result.unsupported == relativeInputsUnsupportedActual || result.unsupported == relativeInputsUnsupportedCapture || result.unsupported == relativeInputsUnsupportedReceiver {
					complete := len(result.bindings) != 0
					for _, binding := range result.bindings {
						complete = complete && !binding.unknown && len(binding.pending) == 0 && len(binding.sources) != 0
					}
					if complete {
						result.unsupported = relativeInputsSupported
					}
				}

				return result, true
			}
			position++
		}
	}
	return result, false
}
