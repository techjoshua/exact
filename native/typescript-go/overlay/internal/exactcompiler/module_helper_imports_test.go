package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Ordinary render helpers must retain native JSX spans and binder-owned import identity.
// Adapter preflight consumes these facts even when the module defines no component owner.
func TestModuleHelperJSXImportIdentity(t *testing.T) {
	root := t.TempDir()
	response := NewSession().Execute(Request{ID: filepath.Join(root, "helper.tsx"), Root: root, Kind: "analyze", Source: `import {Card as NamedCard} from '@fixture/cards';import * as Cards from '@fixture/namespace';
 export function helper(){return <main><NamedCard/><Cards.Card/></main>;}
 export function shadow(NamedCard:unknown){return <NamedCard/>;}`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 0 || len(response.Analysis.JSX) != 4 {
		t.Fatalf("helper ownership changed: %#v", response.Analysis)
	}
	imported, local := 0, 0
	for _, reference := range response.Analysis.SemanticGraph.References {
		if reference.Name != "NamedCard" && reference.Name != "Cards" {
			continue
		}
		switch reference.Source {
		case "import":
			if reference.ModuleSpecifier == "" || reference.DeclarationID == "" {
				t.Fatalf("unbound import: %#v", reference)
			}
			imported++
		case "local":
			if reference.ModuleSpecifier != "" {
				t.Fatalf("shadowed parameter inherited import: %#v", reference)
			}
			local++
		}
	}
	if imported != 2 || local != 1 {
		t.Fatalf("wrong helper binding identities: %#v", response.Analysis.SemanticGraph.References)
	}
}
