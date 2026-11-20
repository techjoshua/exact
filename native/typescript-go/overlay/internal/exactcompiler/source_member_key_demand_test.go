package exactcompiler

import (
	"fmt"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Early key rejection must retain donors at every demanded depth and through
// unknown keys. An unrelated RHS does not become a donor for another field.
func TestMemberWriterKeyDemand(t *testing.T) {
	for _, row := range []struct {
		name, put, read string
		browser         bool
	}{
		{"first segment", `box.field={get value(){return document.title}}`, `box.field.value`, true},
		{"nested segment", `box.nested.field={get value(){return document.title}}`, `box.nested.field.value`, true},
		{"unknown key", `box[key]={get value(){return document.title}}`, `box.field.value`, true},
		{"unrelated", `box.other={get value(){return document.title}}`, `box.field.value`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare const key:string;const box:{[key:string]:any}={field:{value:'safe'},nested:{field:{value:'safe'}},other:{value:'safe'}};declare function foreign(value:object):void;foreign(box);function put(){` + row.put + `};put();export const value=` + row.read + `;`
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatal("member key donor", summary.EffectSources)
			}
		})
	}
}

// A key disjoint from the demanded path can invoke a setter that writes it.
// Refused callback inputs must retain that independent uncertainty.
func TestMemberKeyAcquisitionRetainsCapturedSetterUnknown(t *testing.T) {
	const source = `declare function foreign(write:()=>void):void;const box={field:{value:"safe"},set other(value:{value:string}){this.field=value}};function install(){box.other={get value(){return document.title}}}foreign(install);const selected=box.field;export const value=selected.value;`
	const id = "/virtual/member-key-captured-setter.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var operation *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "selected" {
				operation = node.Initializer()
			}
			return true
		})
		if operation == nil || !ast.IsPropertyAccessExpression(operation) {
			t.Fatal("missing original binding Get")
		}
		found = true
		query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, nil)
		acquired := query.sourceAccessorOperationCandidates(operation, nil, "", accessorAcquire, nil, operation)
		if !sourceResidualOpaque(acquired) {
			t.Fatal("source acquisition discarded possible captured setter effects")
		}
	}
	if !found {
		t.Fatal("missing source acquisition witness")
	}
}

// The task inspection must retain uncertainty from the field Get even when
// the original Call contributes its own independent unknown effect.
func TestMemberKeyAcquisitionComponentFieldEffects(t *testing.T) {
	const id = "captured-setter-field.tsx"
	const fixture = `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign(write:()=>void):void;
export function Page(this:Component<{label:string}>){
 this.state.label='';
 const run=(task:TaskContext=TaskContext.server())=>{
  const box={field:{value:"safe"},SLOT};
  ALIAS
  function install(){RECEIVER.other={get value(){return document.title}}}
  EXECUTE
  const selected=box.field;
  this.state.label=selected.value;
  AFTER
 };
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			const setter = `set other(value:{value:string}){this.field=value}`
			for _, row := range []struct {
				name, slot, execute string
				alias, after        string
				fieldUnknown        bool
				browser             bool
			}{
				{name: "escaped setter", slot: setter, execute: "foreign(install);", fieldUnknown: true},
				{name: "neutral setter", slot: `set other(value:{value:string}){this.field={value:"neutral"}}`, execute: "install();"},
				{name: "disjoint data", slot: `other:{value:"initial"}`, execute: "install();"},
				{name: "escaped alias", slot: setter, alias: "const alias=box;", execute: "foreign(install);", fieldUnknown: true},
				{name: "later alias write", slot: setter, alias: "const alias=box;", after: "install();"},
				{name: "known setter with independent unknown", slot: `set other(value:{value:string}){this.field={value:document.title}}`, execute: "install();foreign(()=>{});", browser: true},
				{name: "revert", slot: setter, execute: "foreign(install);", fieldUnknown: true},
			} {
				t.Run(row.name, func(t *testing.T) {
					receiver := "box"
					if row.alias != "" {
						receiver = "alias"
					}
					source := strings.NewReplacer("SLOT", row.slot, "EXECUTE", row.execute, "AFTER", row.after, "ALIAS", row.alias, "RECEIVER", receiver).Replace(fixture)
					response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
					if response.Error != "" || len(response.Analysis.Tasks) != 1 || len(response.Analysis.Components) != 1 {
						t.Fatal(response.Error, response.Diagnostics, response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					if task.Placement != "server" || response.Analysis.Components[0].Placement != "isomorphic" {
						t.Fatal("unexpected public placement", task.Placement, response.Analysis.Components[0].Placement)
					}
					if row.browser {
						denied := false
						for _, diagnostic := range response.Diagnostics {
							denied = denied || diagnostic.Code == "EXACT2001"
						}
						if !denied || response.Code != "" {
							t.Fatal("known browser setter did not block server placement", response.Diagnostics)
						}
					} else if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
						t.Fatal(response.Diagnostics)
					}
					fieldUnknown, independentUnknown, namedSetter := false, false, false
					for _, effect := range task.EffectSources {
						fieldUnknown = fieldUnknown || effect.Environment == "unknown" && strings.HasSuffix(effect.Description, fmt.Sprintf(":%d", strings.Index(source, "box.field")))
						independentUnknown = independentUnknown || effect.Environment == "unknown" && strings.HasSuffix(effect.Description, fmt.Sprintf(":%d", strings.Index(source, "foreign(()=>")))
						namedSetter = namedSetter || effect.Environment == "browser" && effect.Description == "document" && strings.Join(effect.Path, "/") == "run/other/document"
					}
					if fieldUnknown != row.fieldUnknown || task.BrowserEffects != row.browser ||
						row.browser && (!independentUnknown || !namedSetter) ||
						!row.fieldUnknown && !row.browser && task.EnvironmentEffect != "neutral" {
						t.Fatal("unexpected field or browser effects", task.EffectSources)
					}
				})
			}
		})
	}
}
