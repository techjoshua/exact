package exactcompiler

import (
	"fmt"
	"regexp"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/scanner"
)

var exactDirectivePattern = regexp.MustCompile(
	`@exact\s+([A-Za-z_$][A-Za-z0-9_$-]*)(?:\.([A-Za-z_$][A-Za-z0-9_$-]*))?` +
		`(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][A-Za-z0-9_$]*)))?`,
)

var exactCoreDirectives = map[string]struct{}{
	"key":     {},
	"cleanup": {},
	"own":     {},
	"track":   {},
	"client":  {},
	"server":  {},
	"shared":  {},
	"keep":    {},
	"pure":    {},
	"dynamic": {},
}

func collectDirectives(source string) []Directive {
	lexer := scanner.NewScanner()
	lexer.SetText(source)
	lexer.SetSkipTrivia(false)
	var directives []Directive
	for token := lexer.Scan(); token != ast.KindEndOfFile; token = lexer.Scan() {
		if token != ast.KindSingleLineCommentTrivia && token != ast.KindMultiLineCommentTrivia {
			continue
		}
		text := lexer.TokenText()
		for _, match := range exactDirectivePattern.FindAllStringSubmatchIndex(text, -1) {
			namespace := "exact"
			name := text[match[2]:match[3]]
			if match[4] >= 0 {
				namespace = name
				name = text[match[4]:match[5]]
			}
			argument, hasArgument := directiveArgument(text, match)
			start := lexer.TokenStart() + match[0]
			directives = append(directives, Directive{
				Namespace:   namespace,
				Name:        name,
				Argument:    argument,
				HasArgument: hasArgument,
				Start:       start,
				Length:      match[1] - match[0],
			})
		}
	}
	return directives
}

func directiveArgument(text string, match []int) (string, bool) {
	for index := 6; index <= 10; index += 2 {
		if match[index] >= 0 {
			return text[match[index]:match[index+1]], true
		}
	}
	return "", false
}

func validateCoreDirectives(directives []Directive) []Diagnostic {
	var diagnostics []Diagnostic
	for _, directive := range directives {
		if directive.Namespace != "exact" {
			continue
		}
		if _, supported := exactCoreDirectives[directive.Name]; !supported {
			diagnostics = append(diagnostics, directiveDiagnostic(
				directive,
				fmt.Sprintf(
					"unknown @exact directive '%s'; supported directives are key, cleanup, own, track, client, server, shared, keep, pure, and dynamic",
					directive.Name,
				),
			))
			continue
		}
		switch directive.Name {
		case "keep":
			if !directive.HasArgument {
				diagnostics = append(diagnostics, directiveDiagnostic(
					directive,
					"@exact keep requires one of server, client, or secret",
				))
			} else if directive.Argument != "server" &&
				directive.Argument != "client" &&
				directive.Argument != "secret" {
				message := fmt.Sprintf(
					"unknown @exact keep policy %q; expected server, client, or secret",
					directive.Argument,
				)
				if directive.Argument == "isomorphic" {
					message = "@exact keep=isomorphic is not supported; safe isomorphic residency is inferred"
				}
				diagnostics = append(diagnostics, directiveDiagnostic(directive, message))
			}
		case "own", "track", "client", "server", "shared", "pure", "dynamic":
			if directive.HasArgument {
				diagnostics = append(diagnostics, directiveDiagnostic(
					directive,
					fmt.Sprintf("@exact %s does not accept a value", directive.Name),
				))
			}
		}
	}
	return diagnostics
}

func validateNamespacedDirectives(directives []Directive) []Diagnostic {
	var diagnostics []Diagnostic
	for _, directive := range directives {
		if directive.Namespace == "exact" {
			continue
		}
		diagnostics = append(diagnostics, directiveDiagnostic(
			directive,
			fmt.Sprintf("unknown @exact directive namespace %q", directive.Namespace),
		))
	}
	return diagnostics
}

func directiveDiagnostic(directive Directive, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT1001",
		Message:  message,
		Start:    directive.Start,
		Length:   directive.Length,
	}
}
