package exactcompiler

import (
	"context"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The new observation is limited to direct nonliteral package operations. It
// must not replace an already supported literal Get or authorize a foreign one.
func TestNonliteralComponentGetClassifierScope(t *testing.T) {
	for _, c := range []struct {
		name, setup, receiver, props, member string
		accepted                             bool
	}{
		{"dot-unchanged", "", "Component<{}>", "{}", "this.onMount", false},
		{"literal-unchanged", "", "Component<{}>", "{}", "this['onMount']", false},
		{"local", "const key='onMount' as const;", "Component<{}>", "{}", "this[key]", true},
		{"ordinary", "const key='onMount' as const;const foreign={onMount(callback:()=>void){callback()}};", "Component<{}>", "{}", "foreign[key]", false},
		{"structural", "const key='onMount' as const;", "{onMount(callback:()=>void):void}", "{}", "this[key]", false},
		{"multi-key", "", "Component<{}>", "{operation:'onMount'|'onActivate'}", "this[props.operation]", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			filename, err := normalizeFileName("nonliteral-component-get-contract.tsx", "")
			if err != nil {
				t.Fatal(err)
			}
			source := `import type {Component} from '@exactjs/core';export function Page(this:` + c.receiver + `,props:` + c.props + `){` + c.setup + `const invoked=` + c.member + `(()=>{});return()=> <p>Ready</p>}`
			if c.name == "structural" {
				// The ordinary receiver is not itself a rendered component. Keep
				// its explicit this contract inside a valid framework owner.
				source = `import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){` + c.setup + `function foreign(this:` + c.receiver + `){const invoked=` + c.member + `(()=>{})}return()=> <p>Ready</p>}`
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: filename, Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid source: %s %#v", response.Error, response.Diagnostics)
			}
			var project *projectState
			for _, candidate := range session.projects {
				project = candidate
			}
			if project == nil {
				t.Fatal("source project missing")
			}
			currentChecker, release := project.program.GetCheckerPool().GetChecker(context.Background(), nil)
			defer release()
			file := project.program.GetSourceFile(filename)
			if file == nil {
				t.Fatal("source file missing")
			}
			var member *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "invoked" {
					member = node.Initializer().AsCallExpression().Expression
				}
				return true
			})
			if member == nil {
				t.Fatal("actual member missing")
			}
			selected := checkedNonliteralComponentProtocolGet(member, currentChecker)
			if (selected != nil) != c.accepted {
				t.Fatalf("selected=%v, expected=%v", selected != nil, c.accepted)
			}
			if selected == nil {
				return
			}
			if !portableDeclaredMethod(selected) {
				t.Fatal("selected operation lost package contract")
			}
			if sourceMemberKey(member.AsElementAccessExpression().ArgumentExpression).resolved {
				t.Fatal("generic key rule broadened")
			}
			detached := ast.NewNodeFactory(ast.NodeFactoryHooks{}).DeepCloneNode(member)
			detached.Parent = nil
			if checkedNonliteralComponentProtocolGet(detached, currentChecker) != nil || checkedNonliteralComponentProtocolGet(member, nil) != nil {
				t.Fatal("detached selection granted contract")
			}
		})
	}
}

// Original authored key evaluation must survive both client registration and
// server callback erasure. This exercises the actual Session acquisition path.
func TestNonliteralComponentGetLocalSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "nonliteral-component-local.tsx", Target: target, Diagnostics: "semantic", Source: `import type {Component} from '@exactjs/core';const key='onMount' as const;export function Page(this:Component<{}>){this[key](()=>window.alert('mounted'));return()=> <p>Ready</p>}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("local source rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
			t.Fatalf("local operation lost placement: %#v", response.Analysis.Components)
		}
		if strings.Contains(response.Code, "window.alert") != (target == TargetClient) {
			t.Fatal("callback crossed target boundary")
		}
		if !strings.Contains(response.Code, "void key") {
			t.Fatal("authored key evaluation erased")
		}
	}
}

// Resolving a finite operation cannot suppress execution of its authored key.
func TestNonliteralComponentGetPreservesKeyEffects(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "component-key-effect.tsx", Diagnostics: "semantic", Source: `import type {Component} from '@exactjs/core';function key(){document.title;return 'onMount' as const}export function Page(this:Component<{}>){this[key()](()=>{});return()=> <p>Ready</p>}`})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid key-effect source: %s %#v", response.Error, response.Diagnostics)
	}
	if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "client" {
		t.Fatalf("key browser effect disappeared: %#v", response.Analysis.Components)
	}
}
