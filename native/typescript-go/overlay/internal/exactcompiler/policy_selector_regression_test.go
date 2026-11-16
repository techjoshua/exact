package exactcompiler

import (
	"strings"
	"testing"
)

// Typed subject discovery must not suppress selector provenance or grant consumption authority.
func TestSessionSecretSelectorProvenance(t *testing.T) {
	const prelude = `
		import { consume, secret } from "@exactjs/secrets";
		/** @exact keep=secret */
		type Secret<T> = T & { readonly __secret: unique symbol };
		declare const secrets: { require(name: string): Secret<string>; optional(name: string): Secret<string> };
		declare const selectorName: string;
	`
	for _, test := range []struct {
		name     string
		source   string
		selector string
	}{
		{"known-source", `const apiKey = secret("API_KEY", "value"); export const result = consume(apiKey);`, "API_KEY"},
		{"inferred", `const apiKey = secrets.require("API_KEY"); export const result = consume(apiKey);`, ""},
		{"typed", `const apiKey: Secret<string> = secrets.require("API_KEY"); export const result = consume(apiKey);`, ""},
		{"annotated", `/** @exact keep=secret */ const apiKey = secrets.require("API_KEY"); export const result = consume(apiKey);`, ""},
		{"optional", `const apiKey = secrets.optional("API_KEY"); export const result = consume(apiKey);`, ""},
		{"saved-alias", `const apiKey = secret("API_KEY", "value"); const saved = apiKey; export const result = consume(saved);`, "API_KEY"},
		{"typed-saved-alias", `const apiKey = secret("API_KEY", "value"); const saved: typeof apiKey = apiKey; export const result = consume(saved);`, "API_KEY"},
		{"dynamic", `const apiKey = secrets.require(selectorName); export const result = consume(apiKey);`, ""},
		{"mixed-known-unknown", `const known = secret("API_KEY", "value"); const unknown = secrets.require(selectorName); export const result = consume(known + unknown);`, ""},
		{"different-known", `const one = secret("ONE", "one"); const two = secret("TWO", "two"); export const result = consume(one + two);`, ""},
		{"field-policy", `declare const record: { token: Secret<string> }; const saved = record.token; export const result = consume(saved);`, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "selector.ts", Kind: "analyze", PackageType: "application", PackageName: "@acme/app", Target: TargetServer, Source: prelude + test.source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			consumers := response.Analysis.Policy.SecretConsumers
			if len(consumers) != 1 || consumers[0].Selector != test.selector || consumers[0].Dynamic != (test.selector == "") || consumers[0].Authorization != "implicit-application-owner" {
				t.Fatalf("unexpected selector provenance: %#v", consumers)
			}
			if containsDiagnosticCode(response.Diagnostics, "EXACT3002") || containsDiagnosticCode(response.Diagnostics, "EXACT3004") {
				t.Fatalf("valid secret consumption rejected: %#v", response.Diagnostics)
			}
		})
	}
}

func TestSessionSecretSelectorDoesNotAuthorizeOrdinaryFacade(t *testing.T) {
	for _, resultType := range []string{"string", "unknown"} {
		t.Run(resultType, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "ordinary.ts", Kind: "analyze", PackageType: "application", Target: TargetServer, Source: `
 import { consume } from "@exactjs/secrets";
 declare const ordinary: { require(name: string): ` + resultType + ` };
 const apiKey = ordinary.require("API_KEY");
 export const result = consume(apiKey);
 `})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Policy.SecretConsumers) != 0 || !containsDiagnosticCode(response.Diagnostics, "EXACT3002") {
				t.Fatalf("selector syntax granted secret authority: %#v %#v", response.Analysis.Policy.SecretConsumers, response.Diagnostics)
			}
		})
	}
}

// Compilation retains ordinary facade calls and sensitivity without inventing selector metadata.
func TestSessionCompilesTypedSecretSelector(t *testing.T) {
	response := NewSession().Execute(Request{ID: "selector.ts", Kind: "compile", PackageType: "application", PackageName: "@acme/app", Target: TargetServer, Source: `
 import { consume } from "@exactjs/secrets";
 /** @exact keep=secret */
 type Secret<T> = T & { readonly __secret: unique symbol };
 declare const secrets: { require(name: string): Secret<string> };
 /** @exact server */
 export function client() {
  const apiKey = secrets.require("STRIPE_SECRET_KEY");
  return consume(apiKey);
 }
 `})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 || !consumers[0].Dynamic || consumers[0].Selector != "" {
		t.Fatalf("compiled facade invented selector metadata: %#v", consumers)
	}
	if containsDiagnosticCode(response.Diagnostics, "EXACT3002") || containsDiagnosticCode(response.Diagnostics, "EXACT3004") || !strings.Contains(response.Code, "STRIPE_SECRET_KEY") || !strings.Contains(response.Code, "consume(apiKey)") {
		t.Fatalf("secret consumption was not retained in server output: %s %#v", response.Code, response.Diagnostics)
	}
}

func TestSessionSecretSelectorDoesNotAuthorizeClientConsumption(t *testing.T) {
	response := NewSession().Execute(Request{ID: "client-selector.ts", Kind: "analyze", PackageType: "application", Target: TargetClient, Source: `
		import { consume } from "@exactjs/secrets";
		/** @exact keep=secret */
		type Secret<T> = T & { readonly __secret: unique symbol };
		declare const secrets: { require(name: string): Secret<string> };
		const apiKey = secrets.require("API_KEY");
		export const result = consume(apiKey);
	`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 || consumers[0].Selector != "" || !consumers[0].Dynamic || consumers[0].Authorization != "denied" || !containsDiagnosticCode(response.Diagnostics, "EXACT3004") {
		t.Fatalf("selector metadata changed client authority: %#v %#v", consumers, response.Diagnostics)
	}
}

// A method name and a literal argument cannot prove the identity of a qualified return value.
func TestSessionDoesNotInventFacadeSelector(t *testing.T) {
	const prelude = `
		import { consume, secret, type Secret } from "@exactjs/secrets";
		const actual = secret<string>("ACTUAL", "value");
		const other = secret<string>("OTHER", "other");
		declare const unknown: Secret<string>;
	`
	for _, test := range []struct {
		name string
		body string
	}{
		{"passthrough", `const facade = { require(_name: string): Secret<string> { return actual; } };`},
		{"different-secret", `const facade = { optional(_name: string): Secret<string> { return other; }, require(_name: string): Secret<string> { return other; } };`},
		{"conflicting", `const facade = { require(_name: string): Secret<string> { return (actual + other) as Secret<string>; } };`},
		{"unknown", `const facade = { require(_name: string): Secret<string> { return unknown; } };`},
		{"opaque", `declare const facade: { require(name: string): Secret<string> };`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "facade.ts", Kind: "analyze", PackageType: "application", Target: TargetServer, Source: prelude + test.body + `
				const token: Secret<string> = facade.require("CLAIMED");
				export const result = consume(token);
			`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			consumers := response.Analysis.Policy.SecretConsumers
			if len(consumers) != 1 || consumers[0].Selector != "" || !consumers[0].Dynamic || consumers[0].Authorization != "implicit-application-owner" {
				t.Fatalf("facade syntax invented selector identity: %#v", consumers)
			}
			if containsDiagnosticCode(response.Diagnostics, "EXACT3002") || containsDiagnosticCode(response.Diagnostics, "EXACT3004") {
				t.Fatalf("qualification or authority changed: %#v", response.Diagnostics)
			}
		})
	}
}
