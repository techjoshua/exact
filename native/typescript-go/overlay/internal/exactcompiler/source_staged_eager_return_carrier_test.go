package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Every creating association comes from the actual eager Call binder. Equal
// copied metadata remains descriptive only. Graph pointer admission is central.
func TestStagedEagerReturnCarriersRealCreatingInputs(t *testing.T) {
	for _, row := range []struct {
		name, source string
		known        int
	}{
		{"two creations", `function makeValue(){return()=>document.title}export function invoke(){return Object.defineProperty({},'run',{value:makeValue(),get:makeValue()})}`, 1},
		{"known beside captured and unknown", `function makeValue(){const captured=1;if(Math.random())return()=>captured;if(Math.random())return 1;return()=>document.title}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 1},
		{"captured only", `function makeValue(){const captured=1;return()=>captured}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(parent *sourceValueQuery, candidate *ast.Node) {
				var outer *ast.Node
				walkNode(enclosingCallableNode(candidate).Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
						outer = node
					}
					return !ast.IsFunctionLike(node)
				})
				if outer == nil {
					t.Fatal("missing original native operation")
				}
				query := newSourceDependencyQuery(outer, parent.owner.checker, parent.executable, enclosingCallableNode(outer))
				defer query.publishDependencyStatistics()
				facts := installationSourceFacts(query)
				work := callableEffectWork{extracting: -1}
				registerInstallationSource(t, &work, facts, query, outer)
				work.prepareOperationUses(facts, query.executable)
				key := sourceStagedOperationKey{declaration: enclosingCallableNode(outer), operation: outer, kind: relativeDemandEffects, selector: sourceStagedOperationSelector{occurrence: outer.Expression(), field: "eager-inputs"}}
				id, registered := work.operationIDs[key]
				if !registered {
					t.Fatal("missing original eager producer")
				}
				requirements := work.operations[id.index].eagerCalls
				if len(requirements) == 0 {
					t.Fatal("no original initializer B associations")
				}
				var first sourceRelativeEndpoint
				for index, requirement := range requirements {
					creating := requirement.inputs
					alternatives, valid := describeStagedEagerReturnCarriers(requirement.call, creating, query.owner)
					if !valid || len(alternatives) != row.known {
						t.Fatalf("creating association=%t known=%d want=%d", valid, len(alternatives), row.known)
					}
					for _, alternative := range alternatives {
						endpoint := alternative.endpoint
						if alternative.creating != creating || endpoint.producer != requirement.call.invocation.declaration || endpoint.creation != requirement.call.invocation.operation || endpoint.returning == nil || endpoint.cut != creating.relative.cut || endpoint.creation == outer || endpoint.get != nil {
							t.Fatal("returned carrier retargeted original producer/creation/return/cut")
						}
						if index == 0 {
							first = endpoint
						} else if endpoint.expression != first.expression || endpoint.creation == first.creation || sameOperationEndpoint(endpoint, first) {
							t.Fatal("two factory Calls lost their distinct creating associations")
						}
					}
					for _, mode := range []string{"nil", "undelivered", "wrong-call", "bound-cut", "relative-cut", "graph-use"} {
						wrong := *creating
						switch mode {
						case "nil":
						case "undelivered":
							wrong.delivered = false
						case "wrong-call":
							wrong.request.operation = outer
						case "bound-cut":
							wrong.bound.cut.operation = outer
						case "relative-cut":
							wrong.relative.cut.reading = outer
						case "graph-use":
							wrong.request.use = requirement.call.invocation.use
							wrong.request.cut = requirement.call.invocation.cut
							wrong.bound.use = wrong.request.use
							wrong.bound.cut = wrong.request.cut
							wrong.relative.use = wrong.request.use
							wrong.relative.cut = wrong.request.cut
						}
						pointer := &wrong
						if mode == "nil" {
							pointer = nil
						}
						if prefix, accepted := describeStagedEagerReturnCarriers(requirement.call, pointer, query.owner); accepted || len(prefix) != 0 {
							t.Fatalf("invalid %s creating association authorized prefix", mode)
						}
					}
					if len(requirements) > 1 {
						other := requirements[(index+1)%len(requirements)].inputs
						if _, valid := describeStagedEagerReturnCarriers(requirement.call, other, query.owner); valid {
							t.Fatal("another Call's real B associated with this initializer")
						}
					}
					copied := *creating
					copiedPrefix, valid := describeStagedEagerReturnCarriers(requirement.call, &copied, query.owner)
					if !valid || len(copiedPrefix) != row.known {
						t.Fatal("equal descriptive copy changed representability")
					}
					for _, alternative := range copiedPrefix {
						if alternative.creating != &copied || alternative.creating == creating {
							t.Fatal("helper manufactured original graph identity for copied metadata")
						}
					}
				}
			})
		})
	}
}
