package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// providerStateActivationInputs names the direct state initializers that prevent a mutable
// context provider from publishing an unconditional client implementation. The original
// prop slot must belong to this component even when normalization extracts the assignment.
func providerStateActivationInputs(record projectComponent, matches []*callableFacts) []string {
	if record.component.Placement != "unknown" || !slices.ContainsFunc(record.component.Contexts, func(c ContextEffect) bool { return c.Kind == "write" && c.Confidence == "exact" }) {
		return nil
	}
	props := componentPropsParameterIdentifier(record.candidate.node)
	if props == nil {
		return nil
	}
	var inputs []string
	for _, fact := range matches {
		for _, effect := range fact.summary.EffectSources {
			if effect.Environment == "neutral" {
				continue
			}
			field := effect.fieldOrigin
			if effect.Environment != "unknown" || !effect.provenanceIncomplete || !effect.Opaque || field == nil || field.slot != props.Parent || field.operation == nil || field.operation.Parent == nil || !ast.IsBinaryExpression(field.operation.Parent) {
				return nil
			}
			write := field.operation.Parent.AsBinaryExpression()
			if write.OperatorToken.Kind != ast.KindEqualsToken || write.Right != field.operation {
				return nil
			}
			if _, state := componentComputationStatePath(write.Left); !state {
				return nil
			}
			if !slices.Contains(inputs, field.key) {
				inputs = append(inputs, field.key)
			}
		}
	}
	return inputs
}

// The containing island receives only evaluated JSON scalars, so provider state and descendant
// context callbacks can be reconstructed together. The provider declaration remains portable.
func suppliedProviderStateInputs(site *ast.Node, keys []string) bool {
	if len(keys) == 0 || site.Attributes() == nil {
		return false
	}
	for _, key := range keys {
		s := selectComponentCallableInput(site, key)
		if s.unknown || len(s.values) != 1 {
			return false
		}
		v := unwrapSourceCallableReference(s.values[0])
		switch v.Kind {
		case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		default:
			return false
		}
	}
	return true
}
