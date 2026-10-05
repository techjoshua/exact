package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Declaration-only package classes must retain their selected methods rather than native caches.
func TestIntlPrototypeCacheRequiresNativeMethod(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "helper.d.ts"), []byte(`export declare class Date {toLocaleString(locales?:string):string;toLocaleDateString(locales?:string):string;toLocaleTimeString(locales?:string):string}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"toLocaleString", "toLocaleDateString", "toLocaleTimeString"} {
		r := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "page.tsx"), Target: TargetClient, Source: `import {Date} from './helper.js';export function Page(value:Date){return()=> <p>{value.` + method + `('en-US')}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if strings.Contains(r.Code, ".formatDate(") {
			t.Fatalf("package method replaced by native cache: %s", r.Code)
		}
	}
}
