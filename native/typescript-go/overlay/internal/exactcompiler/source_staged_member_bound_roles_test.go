package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original member owner supplies the candidate; sourceInputs comes from its
// original declaration/Call source owner. Data projection does not activate it.
func TestStagedMemberBoundRolesOriginalData(t *testing.T) {
	const fixture = `const box={run:()=>1};function put(target:typeof box,key:'run',value:()=>number){target[key]=value}export function invoke(key:'run',value:()=>number){put(box,key,value);return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
		var creating *ast.Node
		walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "put" {
				creating = node
			}
			return true
		})
		source, ok := describeStagedInputSubstitution(creating, enclosingCallableNode(reader), query.executable)
		if !ok {
			t.Fatal("original creating association missing")
		}
		facts := installationSourceFacts(query)
		request, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, query.effectOwner)], reader, relativeDemandEffects, "bound-member-data")
		if !issued {
			t.Fatal("original source request missing")
		}
		seen := false
		revoke, installed := query.beginStagedMemberSource(request, func(candidate sourceStagedMemberCandidate) bool {
			if candidate.protocol {
				return true
			}
			roles, valid := describeStagedMemberSourceRoles(candidate, query.executable)
			if !valid {
				t.Fatal("original source roles missing")
			}
			plan, valid := describeStagedMemberBoundRoles(candidate, roles, source.bindings, query.executable)
			if !valid {
				t.Fatal("original data role vector refused")
			}
			seen = true
			if !sameOperationEndpoint(plan.source.target, candidate.target) || !sameOperationEndpoint(plan.source.key, candidate.key) || !sameOperationEndpoint(plan.source.value, candidate.value) {
				t.Fatal("original candidate observation lost")
			}
			for index, projection := range []sourceRelativeInputPlan{plan.target, plan.key, plan.value} {
				if projection.unsupported != relativeInputsSupported || len(projection.bindings) != 1 || projection.bindings[0].target.slot != index || len(projection.bindings[0].sources) != 1 {
					t.Fatal("own formal data binding lost")
				}
			}
			missing, valid := describeStagedMemberBoundRoles(candidate, roles, sourceRelativeBoundInputs{}, query.executable)
			if !valid || missing.target.unsupported != relativeInputsUnsupportedCapture || len(missing.target.bindings[0].pending) != 1 {
				t.Fatal("unavailable creating inputs became empty or runtime unknown")
			}
			// A payload variation checks clone preservation only, not graph admission.
			varied := cloneSourceRelativeBoundInputs(source.bindings)
			for index := range varied.bindings {
				if varied.bindings[index].target.kind == relativeRoleFormal && varied.bindings[index].target.slot == 2 {
					varied.bindings[index].unknown = true
					varied.bindings[index].pending = []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(candidate.value)}
				}
			}
			partial, valid := describeStagedMemberBoundRoles(candidate, roles, varied, query.executable)
			if !valid || !partial.value.bindings[0].unknown || len(partial.value.bindings[0].pending) != 1 || len(partial.value.bindings[0].sources) != 1 {
				t.Fatal("known/unknown/pending data channels conflated")
			}
			partial.value.bindings[0].pending[0].expression = reader
			if varied.bindings[len(varied.bindings)-1].pending[0].expression == reader {
				t.Fatal("pending binding borrowed mutable slice")
			}
			wrong := roles
			wrong.value.expression = reader
			if _, valid := describeStagedMemberBoundRoles(candidate, wrong, source.bindings, query.executable); valid {
				t.Fatal("wrong source vector admitted")
			}
			return true
		}, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("original observer missing")
		}
		defer revoke()
		query.receiverCandidates(reader, nil)
		if !seen {
			t.Fatal("original candidate not published")
		}
	})
}

func TestStagedMemberBoundRolesStaticAndWrittenStayPending(t *testing.T) {
	const fixture = `const box={run:()=>1};function put(target:typeof box,next:()=>number){next=()=>9;target.run=next}export function invoke(){put(box,()=>3);return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, reader *ast.Node) {
		facts := installationSourceFacts(query)
		request, _ := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, query.effectOwner)], reader, relativeDemandEffects, "bound-member-written")
		seen := false
		revoke, installed := query.beginStagedMemberSource(request, func(candidate sourceStagedMemberCandidate) bool {
			if candidate.protocol {
				return true
			}
			roles, valid := describeStagedMemberSourceRoles(candidate, query.executable)
			if !valid {
				t.Fatal("source roles missing")
			}
			plan, valid := describeStagedMemberBoundRoles(candidate, roles, sourceRelativeBoundInputs{}, query.executable)
			if !valid || plan.key.unsupported != relativeInputsUnsupportedCapture || plan.value.unsupported != relativeInputsUnsupportedCapture || len(plan.key.bindings[0].pending) != 1 || len(plan.value.bindings[0].pending) != 1 {
				t.Fatal("written formal/static key gained a lexical data value")
			}
			seen = true
			return true
		}, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("observer missing")
		}
		defer revoke()
		query.receiverCandidates(reader, nil)
		if !seen {
			t.Fatal("original written candidate missing")
		}
	})
}
