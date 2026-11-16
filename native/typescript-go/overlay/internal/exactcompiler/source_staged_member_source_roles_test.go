package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Original member candidate publication precedes input/receiver/RHS recovery.
// Mapping those source roles does not consume a candidate or grant coverage.
func TestStagedMemberSourceRolesOriginalPublication(t *testing.T) {
	const fixture = `const box={run:()=>1};function put(target:typeof box,key:'run',value:()=>number){target[key]=value}function install(){Object.defineProperty(box,'run',{value:()=>2})}export function invoke(){put(box,'run',()=>3);install();return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		request, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, query.effectOwner)], call, relativeDemandEffects, "member-roles-source")
		if !issued {
			t.Fatal("original request unavailable")
		}
		assignment, reflective := false, false
		revoke, installed := query.beginStagedMemberSource(request, func(candidate sourceStagedMemberCandidate) bool {
			if candidate.protocol {
				if _, valid := describeStagedMemberSourceRoles(candidate, query.executable); valid {
					t.Fatal("operator protocol acquired assignment/reflective roles")
				}
				return true
			}
			before := query.owner.work
			plan, valid := describeStagedMemberSourceRoles(candidate, query.executable)
			if !valid || plan.operation != candidate.operation || plan.region != candidate.region {
				t.Fatal("original source role association refused")
			}
			if query.owner.work != before {
				t.Fatal("descriptive roles acquired source values")
			}
			if candidate.reflective {
				reflective = true
				if plan.target.kind != memberCapture || plan.target.expression != candidate.target.expression || plan.key.kind != memberUnresolved || plan.value.kind != memberUnresolved {
					t.Fatal("reflective source vector reinterpreted or upgraded")
				}
			} else {
				assignment = true
				if plan.target.kind != memberFormal || plan.target.position != 0 || plan.key.kind != memberFormal || plan.key.position != 1 || plan.value.kind != memberFormal || plan.value.position != 2 {
					t.Fatal("original lexical formal source roles lost")
				}
			}
			for _, alter := range []func(*sourceStagedMemberCandidate){
				func(c *sourceStagedMemberCandidate) { c.region = nil },
				func(c *sourceStagedMemberCandidate) { c.target.expression = call },
				func(c *sourceStagedMemberCandidate) { c.key.creation = call },
				func(c *sourceStagedMemberCandidate) { c.value.cut.reading = nil },
				func(c *sourceStagedMemberCandidate) { c.origin = nil },
			} {
				wrong := candidate
				alter(&wrong)
				if _, valid := describeStagedMemberSourceRoles(wrong, query.executable); valid {
					t.Fatal("altered original vector/region admitted")
				}
			}
			return true
		}, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("original member observer unavailable")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		if !assignment || !reflective {
			t.Fatal("original assignment/reflective source candidates missing")
		}
	})
}

func TestStagedMemberSourceRolesWrittenAndStaticBoundaries(t *testing.T) {
	const fixture = `const box={run:()=>1};function put(target:typeof box,next:()=>number){next=()=>9;target.run=next}export function invoke(){put(box,()=>3);return box.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		request, issued := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, query.effectOwner)], call, relativeDemandEffects, "member-roles-written")
		if !issued {
			t.Fatal("original request unavailable")
		}
		seen := false
		revoke, installed := query.beginStagedMemberSource(request, func(candidate sourceStagedMemberCandidate) bool {
			if candidate.protocol {
				if _, valid := describeStagedMemberSourceRoles(candidate, query.executable); valid {
					t.Fatal("operator protocol acquired assignment/reflective roles")
				}
				return true
			}
			plan, valid := describeStagedMemberSourceRoles(candidate, query.executable)
			if !valid {
				t.Fatal("written source association lost")
			}
			seen = true
			if plan.value.kind != memberLocal || plan.value.declaration == nil || plan.value.position != -1 {
				t.Fatal("written formal became supplied entry value")
			}
			if plan.key.kind != memberUnresolved || plan.key.declaration != nil || plan.key.expression != candidate.key.expression {
				t.Fatal("static member name became lexical Get/key identity")
			}
			return true
		}, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("original observer unavailable")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		if !seen {
			t.Fatal("original writer candidate missing")
		}
	})
}

// Supplied candidate metadata tests exercise source description, not live
// publication authority. The same memberEndpoint owns result/New/assignment.
func TestStagedMemberSourceRolesExistingEndpointCategories(t *testing.T) {
	const fixture = `class Box{run=()=>1}function make(){return new Box()}const local=new Box();export function invoke(next:()=>number){make().run=next;new Box().run=next;(local.run=next);local.run=(next=()=>2);return local.run()}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		index := query.owner.index(file)
		kinds := map[sourceMemberEndpointKind]bool{}
		walkNode(enclosingCallableNode(call).Body(), func(node *ast.Node) bool {
			if !ast.IsBinaryExpression(node) || node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || !ast.IsPropertyAccessExpression(node.AsBinaryExpression().Left) {
				return true
			}
			left := node.AsBinaryExpression().Left
			cut := query.relativeInputCut(call)
			candidate := sourceStagedMemberCandidate{operation: node, region: index.normalOccurrences[node].region, origin: node, target: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: left.Expression(), producer: node, cut: cut}, key: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: left.Name(), producer: node, cut: cut}, value: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: node.AsBinaryExpression().Right, producer: node, get: left, cut: cut}, cut: cut}
			plan, valid := describeStagedMemberSourceRoles(candidate, query.executable)
			if !valid {
				t.Fatal("original source vector rejected")
			}
			kinds[plan.target.kind] = true
			kinds[plan.value.kind] = true
			return true
		})
		if !kinds[memberResult] || !kinds[memberConstruction] || !kinds[memberCapture] || !kinds[memberAssignment] {
			t.Fatal("shared endpoint categories lost")
		}
	})
}
