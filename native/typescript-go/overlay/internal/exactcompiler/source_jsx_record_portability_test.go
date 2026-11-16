package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Uses the real PackageType/parent-first Session comparison from the bounded
// component-package parity owner, with this bridge's own ordinary record Get.
func TestJSXRecordPortableDefinitionContext(t *testing.T) {
	const childSource = `/// <reference path="./jsx-types.d.ts" />
function select(value:number){return {value}}export function Child(){return()=> <p>{select(1).value}</p>}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			for _, row := range []struct{ name, body, placement string }{{"safe", `return <Child/>`, "isomorphic"}, {"browser", `document.title;return <Child/>`, "client"}} {
				t.Run(row.name, func(t *testing.T) {
					root := t.TempDir()
					child := filepath.Join(root, "child.tsx")
					parent := filepath.Join(root, "parent.tsx")
					for name, source := range map[string]string{child: childSource, filepath.Join(root, "jsx-types.d.ts"): `declare namespace JSX {interface Element {} interface IntrinsicElements {p:{children?:unknown}}}`} {
						if err := os.WriteFile(name, []byte(source), 0600); err != nil {
							t.Fatal(err)
						}
					}
					parentSource := `/// <reference path="./jsx-types.d.ts" />
import{Child}from'./child.js';export function Parent(){return()=>{` + row.body + `}}`
					if err := os.WriteFile(parent, []byte(parentSource), 0600); err != nil {
						t.Fatal(err)
					}
					baseline := NewSession().Execute(Request{Kind: "compile", ID: child, Root: root, Source: childSource, Target: target, PackageType: "application"})
					if baseline.Error != "" || hasErrorDiagnostic(baseline.Diagnostics) || baseline.Code == "" {
						t.Fatal("isolated bridge child", baseline.Error, baseline.Diagnostics)
					}
					var applicationParent Response
					for _, packageType := range []string{"application", "library"} {
						session := NewSession()
						caller := session.Execute(Request{Kind: "compile", ID: parent, Root: root, Source: parentSource, Target: target, PackageType: packageType})
						if caller.Error != "" || hasErrorDiagnostic(caller.Diagnostics) || caller.Code == "" {
							t.Fatal("parent-first entry", packageType, caller.Error, caller.Diagnostics)
						}
						definition := session.Execute(Request{Kind: "compile", ID: child, Root: root, Source: childSource, Target: target, PackageType: packageType})
						if definition.Error != "" || hasErrorDiagnostic(definition.Diagnostics) || definition.Code == "" {
							t.Fatal("child definition entry", packageType, definition.Error, definition.Diagnostics)
						}
						component := findComponent(t, caller.Analysis.Components, "Parent")
						if component.SubgraphPlacement != row.placement {
							t.Fatal("parent context not reached", component.SubgraphPlacement, row.placement)
						}
						if baseline.Code != definition.Code || !reflect.DeepEqual(baseline.Analysis.Components, definition.Analysis.Components) || !reflect.DeepEqual(baseline.Diagnostics, definition.Diagnostics) {
							t.Fatal("parent/package specialized child implementation or portable contract", packageType)
						}
						if packageType == "application" {
							applicationParent = caller
						} else if !reflect.DeepEqual(applicationParent.Diagnostics, caller.Diagnostics) {
							t.Fatal("package mode changed parent diagnostics")
						}
					}
				})
			}
		})
	}
}
