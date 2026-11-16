package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original collector associations must retain DATA-only literal transport through
// the same erased wrappers as a direct formal reference. Independent Effects
// source registration still requires that actual collector edge.
func TestStagedTransparentLiteralInputConsumer(t *testing.T) {
	for _, row := range []struct{ name, expression string }{
		{"bare", `{value}`},
		{"asserted", `{value} as {value:T}`},
		{"parenthesized", `(({value}))`},
		{"satisfies", `({value} satisfies {value:T})`},
		{"nonnull", `({value})!`},
		{"nested", `({box: (({value} as {value:T}) satisfies {value:T})} as {box:{value:T}})`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function factory<T>(value:T){return ` + row.expression + `}export function invoke(){return factory(1)}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
				file := ast.GetSourceFileOfNode(call)
				original := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
				if len(original.pending) != 0 {
					t.Fatal("original collector source pending", original.pending)
				}
				work := registerCallableEffectWork(original.facts)
				caller := work.memberNodes[enclosingCallableNode(call)]
				reached := false
				for _, association := range original.facts[caller].staged.calls {
					if association.invocation.operation != call {
						continue
					}
					reached = true
					if association.legacyInputs || association.sourceInputs == nil || association.inputs != nil || association.inputConsumerWait != nil {
						t.Fatal("typed returned literal lost original source DATA association")
					}
				}
				if !reached {
					t.Fatal("UNREACHED: original factory collector association")
				}
				restore := registerWriterInputFacts(owner, original.facts)
				defer restore()
				request, registered := work.registerStagedDeclarationCallEffects(original.facts, caller, call, owner)
				if !registered {
					t.Fatal("original declaration Effects source refused")
				}
				recipe := work.operationRecipes[request.producer]
				if _, current := work.currentDeclarationCallEffects(recipe); !current {
					t.Fatal("original source association did not reach Effects consumer")
				}
				// The observed source/Call edge is not a newly adopted body-delivery receipt.
				if len(work.operationIDs) != 0 {
					t.Fatal("source check adopted or executed canonical body")
				}
			})
		})
	}
}
