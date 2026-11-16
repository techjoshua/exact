package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These controls classify supplied single events on source nodes. They do not
// prove a module prefix, child evaluation, import initialization or admission.
func TestStagedModuleIntrinsicEntryLocalLaws(t *testing.T) {
	const fixture = `declare function foreign():number;const primitive=1;const simple={field:foreign(),get value(){window.name;return 1},method(){document.title}};const computed={['field']:1};const special={__proto__:{}};const spread={...simple};const {field:destructured}=simple;const callable=()=>window.name;class Quiet{method(){window.name}}class Static{static field=foreign()}const coercion=String(simple);const read=simple.field;const made=new Quiet();const template=String.raw` + "`key`" + `;export async function invoke(){await foreign();return Object.freeze({})}`
	withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		declarations := make(map[string]*ast.Node)
		var property, computed, special, spread, await *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) {
				declarations[node.Name().Text()] = node
			}
			if ast.IsClassDeclaration(node) {
				declarations[node.Name().Text()] = node
			}
			if ast.IsPropertyAssignment(node) {
				if ast.IsComputedPropertyName(node.Name()) {
					computed = node
				} else if callableNameText(node.Name()) == "__proto__" {
					special = node
				} else if callableNameText(node.Name()) == "field" {
					property = node
				}
			}
			if ast.IsSpreadAssignment(node) {
				spread = node
			}
			if ast.IsAwaitExpression(node) {
				await = node
			}
			return true
		})
		accepted := []*ast.Node{file.AsNode(), declarations["primitive"], declarations["primitive"].Initializer(), declarations["simple"].Initializer(), property, declarations["callable"].Initializer(), declarations["Quiet"], declarations["simple"].Name()}
		for _, node := range accepted {
			accounted, admitted := stagedModuleIntrinsicEntry(sourceNormalDemand{node: node})
			if !admitted || !accounted {
				t.Fatalf("intrinsic single event refused: %v", node.Kind)
			}
		}
		refused := []*ast.Node{computed, special, spread, await, declarations["Static"], declarations["coercion"].Initializer(), declarations["read"].Initializer(), declarations["made"].Initializer(), declarations["template"].Initializer()}
		for _, node := range refused {
			if accounted, admitted := stagedModuleIntrinsicEntry(sourceNormalDemand{node: node}); accounted || admitted {
				t.Fatalf("operation/protocol event admitted intrinsically: %v", node.Kind)
			}
			if accounted, admitted := stagedModuleIntrinsicEntry(sourceNormalDemand{node: node, fold: &sourceNormalFold{node: node, kind: sourceNormalEnter}}); !accounted || !admitted {
				t.Fatal("nonexecuting enter marker was treated as its operation")
			}
		}
		// The initializer's identifier is a read, while its binding name is syntax.
		identifier := declarations["spread"].Initializer().AsObjectLiteralExpression().Properties.Nodes[0].AsSpreadAssignment().Expression
		if accounted, admitted := stagedModuleIntrinsicEntry(sourceNormalDemand{node: identifier}); accounted || admitted {
			t.Fatal("nonstructural identifier read supplied a no-entry law")
		}
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && !ast.IsIdentifier(node.Name()) {
				if a, b := stagedModuleIntrinsicEntry(sourceNormalDemand{node: node}); a || b {
					t.Fatal("destructuring binding protocol admitted")
				}
			}
			if ast.IsMethodDeclaration(node) || ast.IsGetAccessorDeclaration(node) {
				if a, b := stagedModuleIntrinsicEntry(sourceNormalDemand{node: node}); !a || !b {
					t.Fatal("deferred callable creation invoked its body")
				}
			}
			return true
		})
	})
}

func TestStagedModuleIntrinsicEntryEventDistinctions(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const value=1;export function invoke(){const local=1;return Object.freeze({})}`, func(query *sourceValueQuery, call *ast.Node) {
		var binding, local *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && node.Name() != nil {
				if node.Name().Text() == "value" {
					binding = node
				}
				if node.Name().Text() == "local" {
					local = node
				}
			}
			return true
		})
		for _, role := range []sourceNormalPhaseRole{sourceNormalAdmit, sourceNormalSelect} {
			if a, b := stagedModuleIntrinsicEntry(sourceNormalDemand{node: binding, phase: &sourceNormalPhase{node: binding, role: role}}); !a || !b {
				t.Fatal("simple module binding bookkeeping refused")
			}
		}
		events := []sourceNormalDemand{
			{node: binding, operand: &sourceNormalOperand{node: binding, pattern: true}},
			{node: binding, phase: &sourceNormalPhase{node: binding, role: sourceNormalArgumentEnd}},
			{node: call, phase: &sourceNormalPhase{node: call, role: sourceNormalAdmit}},
			{node: local, operand: &sourceNormalOperand{node: local}},
			{node: binding, fold: &sourceNormalFold{node: call, kind: sourceNormalEnter}},
			{node: binding, fold: &sourceNormalFold{node: binding, kind: sourceNormalEnter}, phase: &sourceNormalPhase{node: binding}},
		}
		for _, event := range events {
			if a, b := stagedModuleIntrinsicEntry(event); a || b {
				t.Fatal("nonintrinsic or malformed event admitted")
			}
		}
		list := binding.Parent
		original := list.Flags
		list.Flags |= ast.NodeFlagsUsing
		defer func() { list.Flags = original }()
		if a, b := stagedModuleIntrinsicEntry(sourceNormalDemand{node: binding}); a || b {
			t.Fatal("using binding acquired a disposal-free law")
		}
		if a, b := stagedModuleIntrinsicEntry(sourceNormalDemand{node: list}); a || b {
			t.Fatal("using list hid disposal protocol")
		}
	})
}
