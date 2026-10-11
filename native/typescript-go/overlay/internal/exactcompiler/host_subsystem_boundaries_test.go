package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHostSubsystemRequestRejection(t *testing.T) {
	for name, request := range map[string]Request{
		"kind":                 {Kind: "unknown"},
		"extension":            {Kind: "extension"},
		"extension-namespace":  {Kind: "extension", Extension: &ExtensionRequest{}},
		"target":               {Kind: "compile", Target: "unknown"},
		"check-target":         {Kind: "check", Target: TargetClient},
		"projection":           {Kind: "compile", ComponentContractProjection: "unknown"},
		"diagnostics":          {Kind: "compile", Diagnostics: "unknown"},
		"package":              {Kind: "compile", PackageType: "unknown"},
		"interop-module":       {Kind: "compile", JSXInterop: &JSXInterop{AdapterExport: "Adapter"}},
		"interop-export":       {Kind: "compile", JSXInterop: &JSXInterop{AdapterModule: "adapter"}},
		"source-id":            {Kind: "compile"},
		"enhancement-offset":   {Kind: "compile", ID: "/virtual/test.ts", Source: "😀", PackageEnhancementBoundary: 1},
		"synchronize-empty":    {Kind: "synchronize"},
		"synchronize-id":       {Kind: "synchronize", Sources: []ProjectSource{{Source: "export {};"}}},
		"synchronize-offset":   {Kind: "synchronize", Sources: []ProjectSource{{ID: "/virtual/test.ts", Source: "😀", PackageEnhancementBoundary: 1}}},
		"project-files-config": {Kind: "project-files"},
	} {
		t.Run(name, func(t *testing.T) {
			response := NewSession().Execute(request)
			if response.Error == "" {
				t.Fatal("invalid host request was accepted")
			}
		})
	}
}

func TestHostSubsystemProjectFileSelection(t *testing.T) {
	root := t.TempDir()
	for path, source := range map[string]string{"tsconfig.json": `{"include":["src/**/*.ts"],"exclude":["src/skip.ts"]}`, "src/include.ts": "export const included=1;", "src/skip.ts": "export const skipped=2;", "outside.ts": "export const outside=3;"} {
		filename := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(filename), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{Kind: "project-files", Root: root, ConfigFile: "tsconfig.json"})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("selection failed: %#v", response)
	}
	if len(response.ProjectFiles) != 1 || response.ProjectFiles[0] != filepath.Join(root, "src/include.ts") {
		t.Fatalf("configuration selection changed: %#v", response.ProjectFiles)
	}
	for _, kind := range []string{"compile", "synchronize", "project-files"} {
		request := Request{Kind: kind, Root: root, ConfigFile: "missing.json", ID: filepath.Join(root, "missing.ts"), Source: "export {};", Sources: []ProjectSource{{ID: filepath.Join(root, "missing.ts"), Source: "export {};"}}}
		response = NewSession().Execute(request)
		if len(response.Diagnostics) == 0 {
			t.Fatalf("%s lost invalid config diagnostics", kind)
		}
	}
}

func TestHostSubsystemAssetMetadata(t *testing.T) {
	for _, mode := range []string{"module", "raw", "inline", "worker", "side-effect"} {
		t.Run(mode, func(t *testing.T) {
			source := `import value from "./asset.bin?RAW=&"; import duplicate from "./asset.bin?RAW=&"; export { value, duplicate };`
			if mode == "side-effect" {
				source = `import "./asset.bin?RAW=&"; import "./asset.bin?RAW=&";`
			}
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/assets.ts", Source: source, AssetRules: []AssetRule{{Extensions: []string{"BIN"}, Queries: []string{"?raw"}, Kind: "binary", ImportMode: mode}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Assets) != 1 {
				t.Fatalf("identical assets were not deduplicated: %#v", response.Analysis.Assets)
			}
			asset := response.Analysis.Assets[0]
			delivery, evaluation := "client", "both"
			if mode == "raw" || mode == "inline" {
				delivery = "embedded"
			}
			if mode == "worker" || mode == "side-effect" {
				evaluation = "client"
			}
			if asset.DeliveryTarget != delivery || asset.EvaluationTarget != evaluation {
				t.Fatalf("wrong asset ownership: %#v", asset)
			}
		})
	}
}

func TestHostSubsystemAssetPlacementValidation(t *testing.T) {
	for _, source := range []string{
		`import first from "asset" with {exact:"client"}; import second from "asset" with {exact:"server"};`,
		`import first from "asset" with {exact:"client",exact:"client"};`,
		`import type { First } from "asset" with {exact:"client"};`,
		`import first from "asset" with {exact:"both"};`,
		`import first from "asset" with {exact:123};`,
	} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/assets.ts", Source: source})
		found := false
		for _, diagnostic := range response.Diagnostics {
			found = found || strings.HasPrefix(diagnostic.Code, "EXACT500")
		}
		if !found {
			t.Fatalf("invalid placement accepted: %s %#v", source, response)
		}
	}
	for _, source := range []string{
		`import "asset" with {exact:"client"};`,
		`import first from "asset" with {exact:"client",type:"json"}; export const value=first;`,
		`import * as asset from "asset" with {exact:"server"}; export const value=asset;`,
	} {
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetDefault, ID: "/virtual/assets.ts", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, "exact:") {
			t.Fatalf("compiler placement leaked into emitted import: %s", response.Code)
		}
	}
}

func TestHostSubsystemUnsafeHTMLShadowing(t *testing.T) {
	for _, source := range []string{
		`import {unsafeHtml} from "@exactjs/core"; export function ordinary(unsafeHtml: (s:string)=>string) {return unsafeHtml("text");}`,
		`import * as core from "@exactjs/core"; export function ordinary(core: {unsafeHtml(s:string):string}) {return core.unsafeHtml("text");}`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", PackageType: "application", ID: "/virtual/safe.ts", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if len(response.Analysis.Capabilities.RawHTML) != 0 {
			t.Fatalf("ordinary local callback acquired a privileged capability: %#v", response.Analysis.Capabilities)
		}
	}
}

func TestHostSubsystemImportedCapabilityAuthorization(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, enabled := range []bool{false, true} {
			request := Request{Kind: "analyze", Target: target, PackageType: "application", ID: "/virtual/capability.ts", Source: `import {unsafeHtml} from "@exactjs/core";export const html=unsafeHtml("safe");`}
			request.Capabilities.UnsafeHTML.Enabled = enabled
			response := NewSession().Execute(request)
			if response.Error != "" || len(response.Analysis.Capabilities.RawHTML) != 1 {
				t.Fatalf("real imported capability was lost: %#v", response)
			}
			denied := false
			for _, diagnostic := range response.Diagnostics {
				denied = denied || diagnostic.Code == "EXACT4001"
			}
			if denied == enabled {
				t.Fatalf("capability authorization changed: enabled=%t %#v", enabled, response.Diagnostics)
			}
		}
	}
}

func TestHostSubsystemLoweredCapabilityRuntime(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		request := Request{Kind: "compile", Target: target, PackageType: "application", ID: "/virtual/raw-html.tsx", Source: `import {unsafeHtml as raw} from "@exactjs/core";import * as core from "@exactjs/core";export function Article(){return ()=> <main>{raw("<b>head</b>")}{core.unsafeHtml("<i>tail</i>")}</main>;}`}
		request.Capabilities.UnsafeHTML.Enabled = true
		response := NewSession().Execute(request)
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if found := strings.Contains(response.Code, "@exactjs/dom/runtime/unsafe-html"); found != (target != TargetServer) {
			t.Fatalf("lowered capability runtime was selected incorrectly: %s", response.Code)
		}
		if len(response.Analysis.Capabilities.RawHTML) != 2 {
			t.Fatalf("real call identities were lost: %#v", response.Analysis.Capabilities)
		}
	}
}
