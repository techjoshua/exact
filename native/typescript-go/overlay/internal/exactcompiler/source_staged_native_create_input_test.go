package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The source/checker supplies actual formal symbols. No native selection or
// runtime prototype is supplied or inferred by these association controls.
func TestStagedCreatePrototypeInputOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		want         bool
		slot         int
	}{
		{"null", `function other(){}export function invoke(){return Object.create(null)}`, true, -1},
		{"inert literal", `export function invoke(){return Object.create({value:1,get dormant(){return document.title}})}`, true, -1},
		{"formal", `export function invoke(prototype:object){return Object.create(prototype)}`, true, 0},
		{"this excluded from slot", `export function invoke(this:void,first:object,prototype:object){return Object.create(prototype)}`, true, 1},
		{"written formal", `export function invoke(prototype:object){prototype={};return Object.create(prototype)}`, false, -1},
		{"default formal", `export function invoke(prototype:object={}){return Object.create(prototype)}`, false, -1},
		{"rest formal", `export function invoke(...prototype:object[]){return Object.create(prototype)}`, false, -1},
		{"local binding", `export function invoke(){const prototype={};return Object.create(prototype)}`, false, -1},
		{"outer formal", `export function outer(prototype:object){function invoke(){return Object.create(prototype)}return invoke}`, false, -1},
		{"callable literal", `export function invoke(){return Object.create(()=>document.title)}`, false, -1},
		{"class literal", `export function invoke(){return Object.create(class{})}`, false, -1},
		{"primitive non-null", `declare function consume(value:unknown):unknown;export function invoke(){return consume(1)}`, false, -1},
		{"array literal", `export function invoke(){return Object.create([])}`, false, -1},
		{"spread literal", `export function invoke(value:object){return Object.create({...value})}`, false, -1},
		{"computed literal", `export function invoke(){const key='value';return Object.create({[key]:1})}`, false, -1},
		{"spread argument", `export function invoke(values:[object]){return Object.create(...values)}`, false, -1},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				declaration := enclosingCallableNode(call)
				arguments := restrictedInvocationArguments(call.AsCallExpression())
				input := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
				association, described := describeStagedCreatePrototypeInput(input, declaration, query.owner)
				if described != row.want {
					t.Fatalf("input association=%t want=%t", described, row.want)
				}
				if !described {
					return
				}
				if !sameOperationEndpoint(association.input, input) {
					t.Fatal("association retargeted original input endpoint")
				}
				expected := sourceRelativeRole{}
				if row.slot >= 0 {
					expected = sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: row.slot}
				}
				if association.formal != expected {
					t.Fatal("association invented a formal or counted this as an ordinary slot")
				}
				for _, mode := range []string{"cut", "get", "creation", "returning", "role", "rest", "projection", "other-declaration", "missing-owner"} {
					wrong := input
					owner, decl := query.owner, declaration
					switch mode {
					case "cut":
						wrong.cut.use = nil
					case "get":
						wrong.get = call
					case "creation":
						wrong.creation = call
					case "returning":
						wrong.returning = call
					case "role":
						wrong.role.declaration = declaration
					case "rest":
						wrong.restPosition = 1
					case "projection":
						wrong.projection = []string{"value"}
					case "other-declaration":
						decl = ast.GetSourceFileOfNode(call).AsNode()
					case "missing-owner":
						owner = nil
					}
					if _, accepted := describeStagedCreatePrototypeInput(wrong, decl, owner); accepted {
						t.Fatalf("invalid %s input accepted", mode)
					}
				}
				walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
					if ast.IsFunctionDeclaration(node) && node.Name() != nil && callableNameText(node.Name()) == "other" {
						if _, accepted := describeStagedCreatePrototypeInput(input, node, query.owner); accepted {
							t.Fatal("other source declaration inherited formal association")
						}
					}
					return true
				})
				// A different real program/checker cannot consume this source endpoint.
				withSourceCalleeWriteQuery(t, `export function invoke(prototype:object){return Object.create(prototype)}`, func(other *sourceValueQuery, _ *ast.Node) {
					if _, accepted := describeStagedCreatePrototypeInput(input, declaration, other.owner); accepted {
						t.Fatal("another program inherited source input association")
					}
				})
			})
		})
	}
}
