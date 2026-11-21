package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A retained project must observe edits to the callback captured by the native
// snapshot, including a revert to an earlier source version.
func TestLocalConstructionCanonicalEventReissue(t *testing.T) {
	root, config := formsSourceFixture(t)
	entry := filepath.Join(root, "Page.tsx")
	session := NewSession()
	for _, body := range []string{"value()", "'portable'", "value()"} {
		source := strings.Replace(storedDescriptorComponent, "BODY", "descriptorOf({value:()=>"+body+"})?.value()", 1)
		if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			req := Request{Kind: "compile", Target: target, ConfigFile: config, ID: entry, Source: source, Diagnostics: "semantic"}
			for _, s := range []*Session{session, NewSession()} {
				assertComponentCallbackPolicy(t, s.Execute(req), body == "value()")
			}
		}
	}
}
