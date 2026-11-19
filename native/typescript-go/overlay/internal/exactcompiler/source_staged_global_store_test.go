package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// G4 keeps the original imports, module prefix and store body byte-for-byte.
// The independent G2 function definitions and metadata type belong to G5's
// later combined acceptance, not this declaration partition.
func stagedOriginalGlobalStoreSource(t *testing.T) string {
	t.Helper()
	functions := strings.Index(writerInputOpaqueComposition, "/** Shares immutable dispatch descriptors")
	store := strings.Index(writerInputOpaqueComposition, "/** Returns one private redemption table")
	driver := strings.Index(writerInputOpaqueComposition, "\n\nexport function invoke()")
	if functions < 0 || store <= functions || driver <= store {
		t.Fatal("original G4 declaration boundaries missing")
	}
	prefix := writerInputOpaqueComposition[:functions]
	body := writerInputOpaqueComposition[store:driver]
	if !strings.Contains(prefix, "import type { ComponentDomain }") || !strings.Contains(prefix, "const domainOperationPrototypes = new WeakMap") || !strings.Contains(body, "const existing = scope[key];") || !strings.Contains(body, "scope[key] = store;") || strings.Contains(body, "function domainOperationPrototype") {
		t.Fatal("original G4 partition anchors changed")
	}
	return prefix + body + `
export function invoke(){return sharedOpaqueOperationStore('fixture')}
`
}

func newStagedGlobalStoreFixture(t *testing.T) *executableFixture {
	t.Helper()
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke} from './component-abi/opaque-operation.js';`})
	for name, source := range map[string]string{
		"component-abi/opaque-operation.ts": stagedOriginalGlobalStoreSource(t),
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomain={readonly executionRoot:string};`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = source
	}
	return f
}
