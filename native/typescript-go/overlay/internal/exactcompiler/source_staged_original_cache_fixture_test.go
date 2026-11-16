package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Keep both original cache bodies, module partitions and imports byte-for-byte.
// Only G4's separate shared-store declaration/Call is omitted. The companion
// driver supplies real callback/domain inputs for runtime cache and dormancy.
func stagedOriginalCacheCompositionSource(t *testing.T) string {
	t.Helper()
	end := strings.Index(writerInputOpaqueComposition, "/** Returns one private redemption table")
	driver := strings.Index(writerInputOpaqueComposition, "\n\nexport function invoke()")
	if end < 0 || driver < end {
		t.Fatal("original cache/source boundaries absent")
	}
	return writerInputOpaqueComposition[:end] + strings.Replace(writerInputOpaqueComposition[driver:], "sharedOpaqueOperationStore('fixture');", "", 1) + `
export function probe(execute:ExactOpaqueOperationExecutor|undefined,domain:ComponentDomain){return domainOperationPrototype(operationPrototype(execute),domain)}
`
}

func newStagedOriginalCacheFixture(t *testing.T) *executableFixture {
	t.Helper()
	source := stagedOriginalCacheCompositionSource(t)
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke,probe} from './component-abi/opaque-operation.js';`})
	for name, contents := range map[string]string{
		"component-abi/opaque-operation.ts": source,
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = contents
	}
	return f
}
