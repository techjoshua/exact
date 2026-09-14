package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

func TestSsrPlanIdentifiesOrderedWritesAndSettledCharacterAssignments(t *testing.T) {
	for _, kind := range []string{"child", "text"} {
		t.Run(kind, func(t *testing.T) {
			context := printer.NewEmitContext()
			lowering := jsxLowering{factory: context.Factory}
			plan := lowering.directRenderProgramSsrPlan(&renderProgramBuild{
				serverSegments: []string{"<main>", "</main>"},
				serverSlots:    []int{0},
				slots:          []renderProgramSlot{{kind: kind, id: "content"}},
			})
			assignments := 0
			previous := -1
			for _, write := range plan.writes {
				if write.statement <= previous || write.method == "begin" {
					t.Fatal("preparation was classified as output or write order changed")
				}
				previous = write.statement
				expression := plan.statements[write.statement].AsExpressionStatement().Expression
				if write.assignsCharacters {
					if !ast.IsBinaryExpression(expression) {
						t.Fatal("settled character assignment lost its target")
					}
					expression = expression.AsBinaryExpression().Right
					assignments++
				}
				if !ast.IsCallExpression(expression) || expression.AsCallExpression().Expression.AsPropertyAccessExpression().Name().Text() != write.method {
					t.Fatal("write metadata disagrees with emitted operation")
				}
			}
			if assignments != 1 || len(plan.writes) == 0 {
				t.Fatal("content write was not recorded")
			}
		})
	}
}
