package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Project relinking must retain a collector's original lexical Call. Exported
// declarations have separate local/export symbols; syntactic per-file resolution
// cannot compensate once project resolution rebuilds the canonical edge.
func TestProjectCanonicalExportedCalls(t *testing.T) {
	for _, row := range []struct{ name, source, caller, target string }{
		{"exported declaration", `export function factory(){return 1}export function invoke(){return factory()}`, "invoke", "factory"},
		{"local declaration", `function factory(){return 1}export function invoke(){return factory()}`, "invoke", "factory"},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, anchor *ast.Node) {
				file := ast.GetSourceFileOfNode(anchor)
				original := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
				if len(original.pending) != 0 {
					t.Fatal("original collector pending")
				}
				assertEdge := func(facts []callableFacts) (*ast.Node, *ast.Node) {
					var caller, target *callableFacts
					for i := range facts {
						if facts[i].summary.Name == row.caller {
							caller = &facts[i]
						}
						if facts[i].summary.Name == row.target {
							target = &facts[i]
						}
					}
					if caller == nil || target == nil {
						t.Fatal("original caller or target missing")
					}
					for _, edge := range caller.summary.Calls {
						if edge.Resolved && edge.TargetID == target.summary.ID && caller.fieldEdgeOperations[edge.ID] != nil {
							return caller.node, caller.fieldEdgeOperations[edge.ID]
						}
					}
					t.Fatalf("canonical Call lost: %s -> %s: %#v", row.caller, row.target, caller.summary.Calls)
					return nil, nil
				}
				assertEdge(original.facts)
				// This is the production pending-analysis boundary: actual collected
				// facts survive, while public summaries/symbol indexes are absent.
				unpublished := callableAnalysis{facts: original.facts}
				merged := mergeProjectCallableEffects(file, []callableAnalysis{unpublished}, owner)
				caller, call := assertEdge(merged.facts)
				if row.name != "exported declaration" {
					return
				}
				// This source description cannot manufacture the witnessed edge. The
				// assertion above established it through actual collection and relinking.
				work := registerCallableEffectWork(merged.facts)
				restore := registerWriterInputFacts(owner, merged.facts)
				defer restore()
				request, registered := work.registerStagedDeclarationCallEffects(merged.facts, work.memberNodes[caller], call, owner)
				if !registered {
					t.Fatal("original passive source registration")
				}
				if _, current := work.currentDeclarationCallEffects(work.operationRecipes[request.producer]); !current {
					t.Fatal("actual canonical Call cannot witness its Effects source")
				}
			})
		})
	}
}
