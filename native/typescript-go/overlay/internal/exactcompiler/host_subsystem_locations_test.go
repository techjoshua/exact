package exactcompiler

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/microsoft/TypeScript/tsc/internal/sourcemap"
)

func TestHostSubsystemAuthoredLineTerminators(t *testing.T) {
	for _, separator := range []string{"\n", "\r\n", "\r", "\u2028", "\u2029"} {
		t.Run(separator, func(t *testing.T) {
			source := `const prefix="😀";` + separator + `export const value: number = "wrong";`
			response := NewSession().Execute(Request{Kind: "check", ID: "/virtual/locations.ts", Diagnostics: "semantic", Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "TS2322" {
					found = true
					if diagnostic.Line != 2 || diagnostic.Column != 14 {
						t.Fatalf("authored diagnostic lost line boundary: %#v", diagnostic)
					}
				}
			}
			if !found {
				t.Fatalf("missing type error: %#v", response.Diagnostics)
			}
			source = `const prefix="😀";` + separator + `export function Page(){return ()=> <p>text</p>;}`
			response = NewSession().Execute(Request{Kind: "compile", ID: "/virtual/locations.tsx", Target: TargetClient, SourceMap: true, Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if response.SourceMap == nil {
				t.Fatal("missing source map")
			}
			decoder := sourcemap.DecodeMappings(response.SourceMap.Mappings)
			mapped := false
			for entry := range decoder.Values() {
				if entry.IsSourceMapping() && entry.SourceLine == 1 {
					mapped = true
				}
				if entry.IsSourceMapping() && entry.SourceLine > 1 {
					t.Fatalf("mapping exceeds authored source line count: %#v", entry)
				}
			}
			if decoder.Error() != nil || !mapped {
				t.Fatalf("second authored line disappeared from map: %s", response.SourceMap.Mappings)
			}
		})
	}
}

func TestHostSubsystemMissingTagLocations(t *testing.T) {
	source := `const prefix="😀"; export function Other(){return ()=> <p/>;} export function Page(){return ()=> <><Missing></Missing><Missing /></>;}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/tags.tsx", Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	found := false
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT2201" {
			found = true
			expected := utf16Length(source[:strings.Index(source, "Missing")])
			if diagnostic.Start != expected || diagnostic.Length != len("Missing") {
				t.Fatalf("missing tag diagnostic points at another source location: %#v", diagnostic)
			}
		}
	}
	if !found {
		t.Fatalf("missing JSX binding was accepted: %#v", response.Diagnostics)
	}
}

func TestHostSubsystemUnicodePolicyLocations(t *testing.T) {
	for _, marker := range []string{"plain", "€", "😀"} {
		for _, separator := range []string{"", "\n", "\r\n", "\r", "\u2028", "\u2029"} {
			source := `import {unsafeHtml} from "@exactjs/core";const marker="` + marker + `";` + separator + `export const html=unsafeHtml("safe");`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/locations.ts", PackageType: "application", Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			start := strings.LastIndex(source, "unsafeHtml")
			line, column := 1, utf8.RuneCountInString(source[:start])+1
			if separator != "" {
				line, column = 2, len("export const html=")+1
			}
			if len(response.Analysis.Capabilities.RawHTML) != 1 {
				t.Fatalf("missing capability: %#v", response.Analysis.Capabilities)
			}
			capability := response.Analysis.Capabilities.RawHTML[0]
			if capability.Line != line || capability.Column != column {
				t.Fatalf("capability location shifted: marker=%s separator=%q %#v expected %d:%d", marker, separator, capability, line, column)
			}
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT4001" {
					found = true
					if diagnostic.Start != utf16Length(source[:start]) || diagnostic.Length != len("unsafeHtml") {
						t.Fatalf("Unicode diagnostic missed its token: %#v", diagnostic)
					}
				}
			}
			if !found {
				t.Fatalf("missing capability diagnostic: %#v", response.Diagnostics)
			}
			secret := `import {consume} from "@exactjs/secrets";declare const secrets:{require(name:string):string};` + "\n" + `/** @exact keep=secret */ const token=secrets.require("API_KEY");` + "\n" + `const marker="` + marker + `";` + separator + `function load(){return(consume(token));}`
			response = NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/policy.ts", Source: secret})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Policy.SecretConsumers) != 1 {
				t.Fatalf("missing consumer: %#v", response.Analysis.Policy)
			}
			line, column = 3, utf8.RuneCountInString(`const marker="`+marker+`";function load(){return(`)+1
			if separator != "" {
				line, column = 4, len("function load(){return(")+1
			}
			consumer := response.Analysis.Policy.SecretConsumers[0]
			if consumer.Line != line || consumer.Column != column {
				t.Fatalf("secret location shifted: %#v expected %d:%d", consumer, line, column)
			}
		}
	}
}
