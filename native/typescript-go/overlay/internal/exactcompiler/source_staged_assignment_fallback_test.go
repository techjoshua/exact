package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The ordinary original Set traversal must retain a positively reached external
// terminal without any staged assignment borrow, adopted IDs or source closure.
func TestStagedAssignmentOrdinaryExternalFallback(t *testing.T) {
	for _, row := range []struct {
		name, source string
		external     bool
	}{
		{"global alias", `export function invoke(){const target=globalThis as Record<string,unknown>;target.slot=1;return 2}`, true},
		{"ambient receiver", `declare const target:Record<string,unknown>;export function invoke(){target.slot=1;return 2}`, true},
		{"mixed setter and external", `declare const choose:boolean;const setter={set slot(_value:unknown){window.name}};export function invoke(){const target=choose?setter:globalThis as Record<string,unknown>;target.slot=1;return 2}`, true},
		{"authored data", `export function invoke(){const target={slot:0};target.slot=1;return 2}`, false},
		{"unprovided formal", `export function invoke(target:Record<string,unknown>){target.slot=1;return 2}`, false},
		{"shadow global", `export function invoke(){const globalThis={slot:0};globalThis.slot=1;return 2}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedAssignmentSource(t, row.source, func(query *sourceValueQuery, operation *ast.Node, _ []callableFacts) {
				left := operation.AsBinaryExpression().Left
				q := newSourceDependencyQuery(left, query.owner.checker, query.executable, query.effectOwner)
				defer q.publishDependencyStatistics()
				result := q.evaluatedSourceAccessors(left, nil)
				found := false
				prefix := "original external property Set"
				if row.name == "mixed setter and external" {
					prefix = "original external receiver Get"
				}
				for _, effect := range result.environmentEffects {
					if effect.Description == prefix {
						if effect.Environment != "unknown" || !effect.Opaque {
							t.Fatal("reached external Set lost its unknown execution channel")
						}
						found = true
					}
				}
				if found != row.external || q.liveStagedAssignment() != nil {
					t.Fatal("external terminal depended on adoption or came from an unavailable receiver")
				}
				if row.name == "mixed setter and external" {
					known := false
					for _, effect := range result.effects {
						known = known || effect.declaration != nil && ast.IsSetAccessorDeclaration(effect.declaration)
					}
					if !known || !result.valueIncomplete {
						t.Fatal("external receiver Get lost the known setter or completed its unavailable value")
					}
				}
			})
		})
	}
}
