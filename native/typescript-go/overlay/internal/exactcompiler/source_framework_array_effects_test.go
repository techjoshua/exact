package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The real ordinary lexical Call owner may extract [] creation Effects, not
// native input inertness, array identity, DATA or a reached/current Call. Other
// array argument forms keep their unrepresented evaluation pending.
func TestFrameworkBoundEmptyArrayEffectsOwner(t *testing.T) {
	for _, row := range []struct {
		name, argument string
		local          bool
	}{
		{"empty", "[]", true},
		{"element", "[1]", false},
		{"spread", "[...source]", false},
		{"call-element", "[element()]", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function target(value:unknown[]){return value}
function element(){return 1}
export function invoke(source:unknown[]){return target(` + row.argument + `)}`
			withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
				var call *ast.Node
				walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "target" {
						call = n
					}
					return true
				})
				if call == nil {
					t.Fatal("original source Call absent")
				}
				facts := stagedReturnSourceFacts(generation.sourceFile)
				restore := registerWriterInputFacts(owner, facts)
				defer restore()
				work := newCallableEffectWork(facts)
				caller := work.memberNodes[enclosingCallableNode(call)]
				request, registered := work.registerStagedDeclarationCallEffects(facts, caller, call, owner)
				if !registered {
					t.Fatal("genuine original source registrar refused")
				}
				recipe := work.operationRecipes[request.producer]
				if !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.delta.extracted != row.local {
					t.Fatal("local array creation/evaluation disposition", recipe.delta.extracted)
				}
				argument := restrictedInvocationArguments(call.AsCallExpression())[0]
				if sourceInertValueCreation(argument) || stagedLiteralInputEffects(argument, owner) {
					t.Fatal("declaration Effects clause broadened native/inert creation")
				}
				if _, current := work.currentDeclarationCallEffects(recipe); current || len(work.operationIDs) != 0 || len(facts[caller].summary.Calls) != 0 {
					t.Fatal("syntax/local Effects supplied reached Call, adopted IDs or canonical edge")
				}
				if _, paid := work.operationRecipes[stagedCallResultRequest(call, facts[caller].node).producer]; paid {
					t.Fatal("local creation Effects manufactured DATA")
				}
			})
		})
	}
}
