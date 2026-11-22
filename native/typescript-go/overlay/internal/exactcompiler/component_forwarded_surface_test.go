package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

func TestSetupHelperReceiverForwardingRetainsContextSurface(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "forwarded-context.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			import {createContext, type Component} from '@exactjs/core';
			const locale = createContext('locale');
			function prepareMessage(this: Component<{}>, props: { value: string }, token: typeof locale) {
				const context = this.getContext(token);
				return () => <span>{props.value}{context}</span>;
			}
			export function Unit(this: Component<{}>, props: { value: string }) {
				return prepareMessage.call(this, props, locale);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	unit := findCallable(t, response.Analysis.Callables, "Unit")
	message := findCallable(t, response.Analysis.Callables, "prepareMessage")
	forwarded := false
	for _, edge := range unit.Calls {
		if !edge.Resolved || edge.TargetID != message.ID {
			continue
		}
		componentReceiver, propsReceiver := false, false
		for _, binding := range edge.ReceiverBindings {
			if len(binding.Path) != 0 {
				continue
			}
			componentReceiver = componentReceiver || binding.ParameterIndex == 0 && binding.Source == "component"
			propsReceiver = propsReceiver || binding.ParameterIndex == 1 && binding.Source == "parameter" && binding.SourceParameterIndex == 1
		}
		if componentReceiver && propsReceiver {
			forwarded = true
			break
		}
	}
	if !forwarded {
		t.Fatalf("setup helper receiver forwarding was not resolved: %#v", unit)
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "Unit" {
			t.Logf("Unit server contexts surface: %t", component.TargetPlan.ServerSurface.Contexts)
			if !component.TargetPlan.ServerSurface.Contexts {
				t.Fatalf("forwarded context capability was omitted: %#v", component.TargetPlan)
			}
			return
		}
	}
	t.Fatal("missing Unit component")
}

func TestOpaquePackageChildDoesNotInheritOwnerClientPlacement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "opaque-package-child.tsx", Kind: "compile", Target: TargetServer,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptComponent",
			ExactComponents: []JSXInteropExactComponent{{ModuleSpecifier: "@example/messages", ExportName: "Message"}},
		},
		Source: `
			import { Message } from "@example/messages";
			declare class Component { onMount(callback: () => void): void }
			export function Page(this: Component) {
				this.onMount(() => {});
				return () => <Message />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, "createServerBoundaryReceipt") || !strings.Contains(response.Code, "Message") {
		t.Fatalf("opaque dependency was converted into its owner's client boundary:\n%s", response.Code)
	}
}

// Ordinary parameter forwarding must retain focused capabilities without rebinding a helper's this.
func TestOrdinaryHelperParameterSurfaceForwarding(t *testing.T) {
	for _, use := range []struct {
		name, expression string
		accepts          func(ComponentSurfacePlan) bool
	}{
		{"contexts", `owner.hasContext(Symbol.for("locale"))`, func(s ComponentSurfacePlan) bool { return s.Contexts }},
		{"logging", `owner.log.info("message")`, func(s ComponentSurfacePlan) bool { return s.Logging }},
		{"localization", `owner.intl.number(1)`, func(s ComponentSurfacePlan) bool { return s.Localization }},
		{"refs", `owner.readRef("field")`, func(s ComponentSurfacePlan) bool { return s.Refs }},
		{"reactivity", `owner.reactive(()=>1)`, func(s ComponentSurfacePlan) bool { return s.Reactivity }},
		{"lifecycle", `owner.onRender(()=>{})`, func(s ComponentSurfacePlan) bool { return s.ServerLifecycle }},
	} {
		for _, shape := range []struct {
			name, body string
			forwarded  bool
		}{
			{"direct", `function helper(owner: Component) { return VALUE; }`, true},
			{"chain", `function leaf(owner: Component) { return VALUE; } function helper(input: Component) { const owner=input; return leaf(owner); }`, true},
			{"recursive", `function helper(owner: Component, depth=0): unknown { if(depth>0)return helper(owner,depth-1); return VALUE; }`, true},
			{"captured-chain", `function leaf(owner: Component) { return VALUE; } function helper(owner: Component) { return (()=>leaf(owner))(); }`, true},
			{"closure", `function helper(owner: Component) { return (()=>VALUE)(); }`, true},
			{"unrelated", `declare const owner: Component; function helper(input: Component) { return VALUE; }`, false},
			{"unrelated-this", `function helper(this: Component, input: Component) { return THIS_VALUE; }`, false},
		} {
			t.Run(use.name+"/"+shape.name, func(t *testing.T) {
				body := strings.ReplaceAll(shape.body, "THIS_VALUE", strings.ReplaceAll(use.expression, "owner.", "this."))
				body = strings.ReplaceAll(body, "VALUE", use.expression)
				response := NewSession().Execute(Request{ID: "parameter-surface.tsx", Kind: "compile", Target: TargetServer, Source: `declare class Component { hasContext(token:unknown):boolean;log:{info(value:string):void};intl:{number(value:number):string};readRef(name:string):unknown;reactive(fn:()=>number):unknown;onRender(fn:()=>void):void }` + body + `export function Page(this:Component){return()=> <span>{helper(this)}</span>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, component := range response.Analysis.Components {
					if component.Name == "Page" {
						if use.accepts(component.TargetPlan.ServerSurface) != shape.forwarded {
							t.Fatalf("incorrect %s forwarding: %#v", use.name, component.TargetPlan.ServerSurface)
						}
						return
					}
				}
				t.Fatal("missing Page component")
			})
		}
	}
}

// Imported helpers and recursion share parameter ownership without widening unrelated arguments.
func TestImportedComponentParameterForwarding(t *testing.T) {
	root := t.TempDir()
	helper := `export function read(owner: {getContext(token:unknown):unknown}) { return leaf(owner); } function leaf(owner: {getContext(token:unknown):unknown}) { return owner.getContext(Symbol.for("locale")); }`
	if err := os.WriteFile(filepath.Join(root, "helper.ts"), []byte(helper), 0600); err != nil {
		t.Fatal(err)
	}
	source := `import {read} from './helper.js';declare class Component {getContext(token:unknown):unknown}export function Page(this:Component){return()=> <span>{read(this)}</span>;}`
	response := NewSession().Execute(Request{ID: filepath.Join(root, "page.tsx"), Root: root, Kind: "compile", Target: TargetServer, Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "Page" {
			if !component.TargetPlan.ServerSurface.Contexts {
				t.Fatalf("imported parameter lost context: %#v", component.TargetPlan)
			}
			return
		}
	}
	t.Fatal("missing Page")
}

// Computed keys retain conservative capability selection without requiring the key to be a literal.
func TestForwardedDynamicCapabilityKey(t *testing.T) {
	response := NewSession().Execute(Request{ID: "dynamic-surface.tsx", Kind: "analyze", Target: TargetServer, Source: `declare class Component { [key:string]:unknown } function helper(owner:Component,key:{value:string}) { return owner[key.value]; } export function Page(this:Component,props:{key:{value:string}}){return()=> <span>{helper(this,props.key)}</span>;}`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "Page" {
			surface := component.TargetPlan.ServerSurface
			if !surface.Contexts || !surface.Logging || !surface.Refs || !surface.Localization || !surface.Reactivity || !surface.ServerLifecycle {
				t.Fatalf("computed receiver lost conservative capabilities: %#v", surface)
			}
			return
		}
	}
	t.Fatal("missing Page")
}

func TestComponentPropReceiptRequiresRegisteredLexicalReceiver(t *testing.T) {
	text := `import type {Component} from '@exactjs/core';
function Leaf(props:{value:number}){return()=> <b>{props.value}</b>}
export function Owner(this:Component<{count:number}>,props:{value:number}){
 this.state.count=0;
 function ordinary(this:Component<{count:number}>){return <Leaf data-case="ordinary" value={props.value+this.state.count}/>}
 return()=> <Leaf data-case="owned" value={props.value+this.state.count}/>;
}`
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/receiver.tsx", Path: tspath.Path("/receiver.tsx")}, text, core.ScriptKindTSX)
	lowering := jsxLowering{components: componentIndexByName(collectComponents(source)), target: TargetClient}
	seen := 0
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if node.Kind != ast.KindJsxSelfClosingElement {
			return true
		}
		part := text[node.Pos():node.End()]
		if !strings.Contains(part, "data-case=") {
			return true
		}
		seen++
		actual := lowering.hasRegisteredComponentReceiver(node)
		expected := strings.Contains(part, `data-case="owned"`)
		t.Logf("%s: receiver=%v expected=%v", part, actual, expected)
		if actual != expected {
			t.Errorf("ordinary explicit this must not redeem enclosing durable supplier")
		}
		return true
	})
	if seen != 2 {
		t.Fatalf("expected two actual authored JSX sites, got %d", seen)
	}
}
