package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Portable placement follows the framework facade declaration, including renamed and namespace imports.
func TestFrameworkIntlReceiverPlacement(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "core")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		filepath.Join(pkg, "package.json"): `{"name":"@exactjs/core","types":"index.d.ts"}`,
		filepath.Join(pkg, "index.d.ts"):   `export interface IntlFacade {DateTimeFormat(locale:string):unknown}export declare const intl:IntlFacade;`,
	} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, shape := range []struct {
		prefix, receiver string
		portable         bool
	}{
		{`import {intl} from '@exactjs/core';`, "intl", true},
		{`import {intl as facade} from '@exactjs/core';const alias=facade;`, "alias", true},
		{`import * as core from '@exactjs/core';`, "core.intl", true},
		{`interface IntlFacade {DateTimeFormat(locale:string):unknown}declare const local:IntlFacade;`, "local", false},
	} {
		result := NewSession().Execute(Request{Kind: "analyze", Root: root, ID: filepath.Join(root, "page.tsx"), Source: shape.prefix + `export function Page(){` + shape.receiver + `.DateTimeFormat('en');return()=> <p>ready</p>;}`})
		if result.Error != "" || len(result.Analysis.Components) != 1 {
			t.Fatalf("missing component: %#v", result)
		}
		if (result.Analysis.Components[0].Placement == "isomorphic") != shape.portable {
			t.Fatalf("incorrect receiver placement: %#v", result.Analysis.Components)
		}
	}
}
