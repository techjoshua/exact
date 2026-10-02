package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Registry facts must identify the same imported artifact as direct component compilation.
func TestRegistryImportedComponentProvenance(t *testing.T) {
	for _, value := range []string{"Named", "Alias", "Namespace.Row", "Default", "lazy(()=>import('./Row.js').then(module=>module.Row))", "lazy(()=>import('./Row.js').then(({Row})=>Row))", "lazy(()=>import('./Row.js').then(module=>module.default))"} {
		t.Run(value, func(t *testing.T) {
			root := t.TempDir()
			child := filepath.Join(root, "Row.tsx")
			source := `export function Row(){return()=> <p>row</p>;} export default Row;`
			if err := os.WriteFile(child, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			page := filepath.Join(root, "Page.tsx")
			pageSource := `import {createComponentRegistry} from '@exactjs/core';import Default,{Row as Named} from './Row.js';import * as Namespace from './Row.js';const Alias=Named;const Views=createComponentRegistry(({lazy})=>({row:` + value + `}));export function Page(){return()=> <Views.row/>;}`
			if err := os.WriteFile(page, []byte(pageSource), 0600); err != nil {
				t.Fatal(err)
			}
			session := NewSession()
			component := session.Execute(Request{Kind: "analyze", ID: child, Root: root, Source: source})
			response := session.Execute(Request{Kind: "analyze", ID: page, Root: root, Source: pageSource})
			if component.Error != "" || response.Error != "" {
				t.Fatalf("analysis errors: %s, %s", component.Error, response.Error)
			}
			if len(component.Analysis.Components) != 1 || len(response.Analysis.Registries) != 1 {
				t.Fatalf("missing component/registry facts: %#v", response.Analysis.Registries)
			}
			entry := response.Analysis.Registries[0].Entries[0]
			exported := "Row"
			if value == "Default" || value == "lazy(()=>import('./Row.js').then(module=>module.default))" {
				exported = "default"
			}
			if entry.ModuleSpecifier != "./Row.js" || entry.ExportName != exported || entry.ComponentID != component.Analysis.Components[0].ID {
				t.Fatalf("registry lost canonical provenance: %#v, expected %s", entry, component.Analysis.Components[0].ID)
			}
		})
	}
}

func TestRegistryLocalAliasPreservesRequestedComponentIdentity(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "analyze", ID: "local-alias.tsx", Source: `import {createComponentRegistry} from '@exactjs/core';function Row(){return()=> <p>row</p>;}const Alias=Row;const Views=createComponentRegistry(()=>({row:Alias}));export function Page(){return()=> <Views.row/>;}`})
	if response.Error != "" || len(response.Analysis.Registries) != 1 {
		t.Fatalf("registry analysis failed: %#v", response)
	}
	entry := response.Analysis.Registries[0].Entries[0]
	for _, component := range response.Analysis.Components {
		if component.Name == "Row" {
			if component.ID != entry.ComponentID {
				t.Fatalf("local alias lost authored component identity: %s != %s", entry.ComponentID, component.ID)
			}
			return
		}
	}
	t.Fatal("missing local component")
}

func TestRegistryFactoryImportIdentity(t *testing.T) {
	cases := []struct {
		name, prefix, factory string
		expected              int
	}{
		{"direct", `import {createComponentRegistry} from '@exactjs/core';`, "createComponentRegistry", 1},
		{"renamed", `import {createComponentRegistry as registry} from '@exactjs/core';`, "registry", 1},
		{"namespace", `import * as Core from '@exactjs/core';`, "Core.createComponentRegistry", 1},
		{"namespace element", `import * as Core from '@exactjs/core';`, "Core['createComponentRegistry']", 1},
		{"immutable alias", `import {createComponentRegistry} from '@exactjs/core';const registry=createComponentRegistry;`, "registry", 1},
		{"wrapped alias", `import {createComponentRegistry} from '@exactjs/core';const registry=(createComponentRegistry as typeof createComponentRegistry)!;`, "registry", 1},
		{"satisfies alias", `import {createComponentRegistry} from '@exactjs/core';const registry=createComponentRegistry satisfies typeof createComponentRegistry;`, "registry", 1},
		{"namespace alias", `import * as Core from '@exactjs/core';const Framework=Core;`, "Framework.createComponentRegistry", 1},
		{"ordinary same name", `function createComponentRegistry(define:()=>unknown){return define();}`, "createComponentRegistry", 0},
		{"foreign import", `import {createComponentRegistry} from 'ordinary-package';`, "createComponentRegistry", 0},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "factory-identity.tsx", Source: item.prefix + `function Row(){return()=> <p>row</p>;}const Views=` + item.factory + `(()=>({row:Row}));export const result=Views;`})
			if response.Error != "" || len(response.Analysis.Registries) != item.expected {
				t.Fatalf("registry import identity was not preserved: %#v", response.Analysis.Registries)
			}
		})
	}
}

// Reexported API values retain Core identity without trusting another module's spelling.
func TestRegistryFactoryReexportIdentity(t *testing.T) {
	for _, item := range []struct {
		name, barrel, prefix, factory string
		expected                      int
	}{
		{"named", `export {createComponentRegistry as registry} from '@exactjs/core';`, `import {registry} from './barrel.js';`, "registry", 1},
		{"namespace", `export {createComponentRegistry as registry} from '@exactjs/core';`, `import * as Barrel from './barrel.js';`, "Barrel.registry", 1},
		{"local alias", `import {createComponentRegistry} from '@exactjs/core';export const registry=createComponentRegistry;`, `import {registry} from './barrel.js';`, "registry", 1},
		{"ordinary", `export function registry(define:()=>unknown){return define();}`, `import {registry} from './barrel.js';`, "registry", 0},
	} {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, "barrel.ts"), []byte(item.barrel), 0600); err != nil {
				t.Fatal(err)
			}
			page := filepath.Join(root, "Page.tsx")
			source := item.prefix + `function Row(){return()=> <p>row</p>;}const Views=` + item.factory + `(()=>({row:Row}));export const result=Views;`
			if err := os.WriteFile(page, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{Kind: "analyze", ID: page, Root: root, Source: source})
			if response.Error != "" || len(response.Analysis.Registries) != item.expected {
				t.Fatalf("reexport identity mismatch: %#v", response.Analysis.Registries)
			}
		})
	}
}
