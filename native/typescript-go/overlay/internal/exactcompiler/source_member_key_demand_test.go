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
  function install(){box.other={get value(){return document.title}}}
  EXECUTE
  const selected=box.field;
  this.state.label=selected.value;
 };
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			for _, row := range []struct {
				name, slot, execute string
				fieldUnknown        bool
			}{
				{"escaped setter", `set other(value:{value:string}){this.field=value}`, "foreign(install);", true},
				{"neutral setter", `set other(value:{value:string}){this.field={value:"neutral"}}`, "install();", false},
				{"disjoint data", `other:{value:"initial"}`, "install();", false},
				{"revert", `set other(value:{value:string}){this.field=value}`, "foreign(install);", true},
			} {
				t.Run(row.name, func(t *testing.T) {
					source := strings.NewReplacer("SLOT", row.slot, "EXECUTE", row.execute).Replace(fixture)
					response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
					if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Tasks) != 1 {
						t.Fatal(response.Error, response.Diagnostics, response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					fieldUnknown := false
					for _, effect := range task.EffectSources {
						fieldUnknown = fieldUnknown || effect.Environment == "unknown" && strings.HasSuffix(effect.Description, fmt.Sprintf(":%d", strings.Index(source, "box.field")))
					}
					if fieldUnknown != row.fieldUnknown || task.BrowserEffects {
						t.Fatal("unexpected field or browser effects", task.EffectSources)
					}
				})
			}
		})
	}
}
