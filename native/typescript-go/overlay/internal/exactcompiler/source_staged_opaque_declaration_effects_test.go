package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A source Effects demand may classify an original ambient Call without
// acquiring its result. Reachability and actual output consumers remain separate.
func TestSourceOpaqueDeclarationEffectsDemand(t *testing.T) {
	for _, row := range []struct {
		name, body string
		normal     bool
		runtime    bool
		pending    bool
	}{
		{"statement", `foreign();`, false, true, false},
		{"parenthesized-statement", `((foreign()));`, false, true, false},
		{"unreachable", `if(false){foreign()}`, false, false, false},
		{"return-output", `return foreign();`, false, false, true},
		{"normal-consumer", `foreign();`, true, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():unknown;export function invoke(){` + row.body + `}`
			withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
				declaration := enclosingCallableNode(call)
				effect, supported := sourceOpaqueDeclarationEffect(call, declaration, "invoke", query.executable)
				if !supported || effect.Environment != "unknown" || !effect.Opaque || effect.provenanceIncomplete || effect.callOrigin == nil || effect.callOrigin.operation != call || effect.callOrigin.declaration != declaration {
					t.Fatal("original runtime Effect lost its authenticated source", supported, effect)
				}
				if source, supported := sourceOpaqueDeclarationEffect(call, nil, "invoke", query.executable); supported || source.callOrigin != nil {
					t.Fatal("missing original declaration supplied an Effect")
				}
				query.dependenciesOnly = !row.normal
				result := accessorCandidates{}
				query.executeDemand(call, declaration, nil, &result, nil, nil)
				if (len(result.environmentEffects) != 0) != row.runtime || result.opaque != row.pending {
					t.Fatalf("Effects/output scope changed: effects=%#v opaque=%t", result.environmentEffects, result.opaque)
				}
				if len(result.values) != 0 || len(result.normalCalls) != 0 || len(result.nativeCalls) != 0 || result.invocationOwned {
					t.Fatal("runtime Effect acquired a value or invocation receipt")
				}
			})
		})
	}
}
