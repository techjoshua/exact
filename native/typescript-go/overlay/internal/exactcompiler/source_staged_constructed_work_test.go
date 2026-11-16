package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original New and native member owners publish before recursive member
// inventory. The queue receives the conditional method and required producers,
// not a reconstructed instance or a completed member/result selection.
func TestStagedConstructedMemberOriginalSourceQueue(t *testing.T) {
	for _, method := range []string{"get", "set"} {
		source := `const table=new WeakMap<object,object>();export function invoke(key:object){return table.` + method + `(key`
		if method == "set" {
			source += `,()=>document.title`
		}
		source += `)}`
		t.Run(method, func(t *testing.T) {
			withActiveStandardConstructionSource(t, source, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
				file := ast.GetSourceFileOfNode(call)
				var site *ast.Node
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if ast.IsNewExpression(n) {
						site = n
					}
					return true
				})
				nodes := collectCallableNodes(file)
				facts := make([]callableFacts, len(nodes))
				for i, n := range nodes {
					facts[i] = callableFacts{node: n, sourceFile: file, summary: CallableSummary{ID: fmt.Sprintf("source:%d", n.Pos())}}
				}
				restore := registerPendingMemberFacts(q.executable, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				visitImplicitAccessors(site, q.owner.checker, nil, q.executable, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
				consumer := work.memberNodes[q.effectOwner]
				request, ok := sourceStagedOccurrenceRequest(&facts[consumer], call, relativeDemandEffects, "original-member")
				if !ok {
					t.Fatal("original request unavailable")
				}
				q.initializing, q.protectedMember = call, call.Expression()
				publications := 0
				revoke, installed := q.beginStagedConstructedMemberSource(request, site, func(selection sourceStagedConstructedMember, _ []*ast.SourceFile, _ bool) bool {
					publications++
					if len(work.operations) != 0 {
						t.Fatal("member work preceded original source handoff")
					}
					return work.registerConstructedMemberSource(facts, selection)
				})
				if !installed {
					t.Fatal("reached construction did not install source sink")
				}
				drive := func(query *sourceValueQuery, staged bool) {
					result := accessorCandidates{}
					query.standardConstructionMember(sourceConstructedMemberDemand{source: site, projection: []string{method}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) {
						if staged {
							t.Fatal("legacy recursive origin path")
						}
					}, func([]sourceValue, []string, bool) {
						if staged {
							t.Fatal("source method escaped queue")
						}
					})
					if staged && len(result.values) != 0 {
						t.Fatal("source transfer supplied normal member values")
					}
				}
				copied := *q
				drive(&copied, false)
				if publications != 0 {
					t.Fatal("copied query used original member sink")
				}
				drive(q, true)
				if publications != 1 {
					t.Fatal("original member did not publish", publications)
				}
				root := work.operationIDs[request.producer]
				if root.index == 0 || len(work.operations[root.index].dependencies) != 1 {
					t.Fatal("source publication omitted required membership")
				}
				for {
					task, more := work.nextExtraction()
					if !more {
						break
					}
					if task.operation.index != 0 {
						work.extractOperation(facts, task, q.executable)
					}
				}
				calleeRequest := constructedMemberRequest(work.operationRecipes[request.producer].constructed, "callee")
				callee := work.operations[work.operationIDs[calleeRequest.producer].index]
				if callee.revision == 0 || len(callee.delta.exposures) != 1 || callee.delta.extracted || len(callee.delta.invoked) != 0 || len(callee.delta.effects) != 0 {
					t.Fatal("known method prefix was lost or executed", callee.delta)
				}
				endpoint := callee.delta.exposures[0].endpoint
				if endpoint.get != call.Expression() || endpoint.producer != call || endpoint.expression == nil || !standardLibrarySource(ast.GetSourceFileOfNode(endpoint.expression)) {
					t.Fatal("method source/cuts were retargeted")
				}
				if work.closedOperationDependencies()[root.index] {
					t.Fatal("known native method paid unrepresented own-writer/eager/result debt")
				}
				for _, role := range []string{"own-writers", "eager-inputs"} {
					debt := constructedMemberRequest(work.operationRecipes[request.producer].constructed, role)
					state := work.operations[work.operationIDs[debt.producer].index]
					if state.revision != 0 || state.delta.extracted {
						t.Fatal("empty pending producer became runtime unknown or covered empty", role)
					}
				}
				if len(facts[consumer].summary.DirectEffectSources) != 0 {
					t.Fatal("stored callback was activated")
				}
				// No issuer capability survives the source query. Descriptions and pending
				// source membership can be cloned without carrying the borrowed Get.
				revoke()
				drive(q, false)
				if publications != 1 || q.stagedConstructedMember != nil {
					t.Fatal("revoked source sink survived")
				}
			})
		})
	}
}

// The source-producing Get and Set owners feed the same queue. Data delivery
// retains the writer's formal/creation association and never calls that value.
// Unknown execution/own-writer coverage remains required, not closed empty.
func TestStagedConstructedPayloadOriginalSourceDelivery(t *testing.T) {
	for _, formal := range []bool{false, true} {
		source := `const table=new WeakMap<object,()=>string>();export function invoke(key:object,value:()=>string){table.set(key,`
		if formal {
			source += `value`
		} else {
			source += `()=>window.name`
		}
		source += `);return table.get(key)}`
		withActiveStandardConstructionSource(t, source, func(q *sourceValueQuery, readCall *ast.Node, _ *sourceWriterInputGraph) {
			file := ast.GetSourceFileOfNode(readCall)
			var site, writeCall *ast.Node
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsNewExpression(n) {
					site = n
				}
				if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
					_, name := accessorReceiver(n.Expression())
					if name == "set" {
						writeCall = n
					}
				}
				return true
			})
			facts := []callableFacts{}
			for _, node := range collectCallableNodes(file) {
				facts = append(facts, callableFacts{node: node, sourceFile: file, summary: CallableSummary{ID: fmt.Sprintf("source:%d", node.Pos())}})
			}
			restore := registerPendingMemberFacts(q.executable, facts)
			defer restore()
			work := registerCallableEffectWork(facts)
			visitImplicitAccessors(site, q.owner.checker, nil, q.executable, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
			var reader, writer *sourceStagedConstructedMember
			observe := func(call *ast.Node, method string) *sourceStagedConstructedMember {
				query := newSourceDependencyQuery(call, q.owner.checker, q.executable, q.effectOwner)
				query.initializing, query.protectedMember = call, call.Expression()
				request, ok := sourceStagedOccurrenceRequest(&facts[work.memberNodes[q.effectOwner]], call, relativeDemandEffects, method)
				if !ok {
					t.Fatal("source request")
				}
				revoke, ok := query.beginStagedConstructedMemberSource(request, site, func(source sourceStagedConstructedMember, _ []*ast.SourceFile, _ bool) bool {
					return work.registerConstructedMemberSource(facts, source)
				})
				if !ok {
					t.Fatal("source sink")
				}
				defer revoke()
				result := accessorCandidates{}
				query.standardConstructionMember(sourceConstructedMemberDemand{source: site, projection: []string{method}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) { t.Fatal("legacy recovery") }, func([]sourceValue, []string, bool) { t.Fatal("legacy selected source") })
				receipt := work.operationRecipes[request.producer].constructed
				if receipt == nil {
					t.Fatal("original source did not register")
				}
				return receipt
			}
			// Reader first represents a genuinely late writer prefix. No original Get
			// is replayed when the source delivery arrives.
			reader = observe(readCall, "get")
			writer = observe(writeCall, "set")
			if !work.registerConstructedPayloadUse(facts, reader, writer) || !work.registerConstructedPayloadUse(facts, reader, writer) {
				t.Fatal("typed original result relation refused")
			}
			request := constructedPayloadRequest(reader, writer)
			for {
				task, more := work.nextExtraction()
				if !more {
					break
				}
				if task.operation.index != 0 {
					work.extractOperation(facts, task, q.executable)
				}
			}
			id := work.operationIDs[request.producer]
			state := work.operations[id.index]
			subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
			if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || len(subscriber.constructed) != 1 || state.delta.extracted {
				t.Fatal("known data prefix not consumed independently from required work", state.revision, subscriber)
			}
			endpoint := subscriber.constructed[0].endpoint
			actual := restrictedInvocationArguments(writeCall.AsCallExpression())[1]
			if endpoint.producer != writeCall || endpoint.cut.operation != writeCall || endpoint.cut.reading != actual || endpoint.creation != nil || subscriber.constructed[0].creating != nil {
				t.Fatal("writer acquisition/creation was retargeted", endpoint)
			}
			if formal {
				if endpoint.kind != relativeEndpointRole || endpoint.role.kind != relativeRoleFormal || endpoint.role.declaration != q.effectOwner || endpoint.role.slot != 1 {
					t.Fatal("formal payload closed or collapsed", endpoint)
				}
			} else if endpoint.kind != relativeEndpointExpression || endpoint.expression != actual {
				t.Fatal("known dormant callback dropped", endpoint)
			}
			if len(facts[work.memberNodes[q.effectOwner]].summary.DirectEffectSources) != 0 || work.closedOperationDependencies()[id.index] {
				t.Fatal("data prefix invoked callback or settled pending writer/eager work")
			}
			before := len(subscriber.constructed)
			work.deliverOperationSubscribers(facts, id, q.executable)
			if len(subscriber.constructed) != before {
				t.Fatal("unchanged revision replayed payload")
			}
			bad := request
			bad.reading.operation = writeCall
			if _, ok := work.requireOperation(facts, bad); ok {
				t.Fatal("wrong original reading accepted")
			}
		})
	}
}
