package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func collectCapabilityRequirements(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	request Request,
) (CapabilityRequirements, []Diagnostic) {
	requirements := CapabilityRequirements{RawHTML: []RawHTMLCapability{}}
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		reference, exists := externalImportForExpression(
			call.Expression,
			bindings,
			typeChecker,
		)
		if !exists || reference.moduleSpecifier != "@exactjs/core" ||
			reference.exportName != "unsafeHtml" {
			return true
		}
		line, column := sourceLocation(sourceFile, call.Expression.Pos())
		targets := []string{"client", "server"}
		if request.Target == TargetClient || request.Target == TargetServer {
			targets = []string{string(request.Target)}
		}
		requirements.RawHTML = append(requirements.RawHTML, RawHTMLCapability{
			Source:  request.ID,
			Line:    line,
			Column:  column,
			Symbol:  nearestPolicyCallableName(node),
			Targets: targets,
		})
		return true
	})
	diagnostics := validateCapabilityRequirements(requirements, request)
	return requirements, diagnostics
}

func validateCapabilityRequirements(
	local CapabilityRequirements,
	request Request,
) []Diagnostic {
	if request.PackageType == "library" {
		return []Diagnostic{}
	}
	diagnostics := []Diagnostic{}
	importedRawHTML := 0
	for _, manifest := range request.Manifests {
		importedRawHTML += len(manifest.Capabilities.RawHTML)
	}
	if (len(local.RawHTML) != 0 || importedRawHTML != 0) &&
		!request.Capabilities.UnsafeHTML.Enabled {
		diagnostics = append(diagnostics, capabilityDiagnostic(
			"EXACT4001",
			"error: unsafeHtml capability is used but the application has not explicitly enabled it",
		))
	}
	grants := stringSet(request.Capabilities.UnsafeHTML.Grants)
	for _, manifest := range request.Manifests {
		for _, requirement := range manifest.Capabilities.RawHTML {
			if manifest.PackageName == request.PackageName {
				continue
			}
			if manifest.PackageName == "" {
				diagnostics = append(diagnostics, capabilityDiagnostic(
					"EXACT4002",
					fmt.Sprintf(
						"error: unsafeHtml requirement at %s:%d:%d has no package identity and cannot be granted",
						requirement.Source,
						requirement.Line,
						requirement.Column,
					),
				))
			} else if _, granted := grants[manifest.PackageName]; !granted {
				diagnostics = append(diagnostics, capabilityDiagnostic(
					"EXACT4003",
					fmt.Sprintf(
						"error: dependency %s uses unsafeHtml at %s:%d:%d without an application grant",
						manifest.PackageName,
						requirement.Source,
						requirement.Line,
						requirement.Column,
					),
				))
			}
		}
	}
	allowedSecrets := stringSet(request.Capabilities.Secrets.AllowPackages)
	for _, manifest := range request.Manifests {
		for _, use := range manifest.Policy.SecretConsumers {
			if use.Consumer.Package == request.PackageName {
				continue
			}
			message := ""
			switch {
			case use.Authorization == "denied":
				reason := use.Reason
				if reason == "" {
					reason = "unresolved policy violation"
				}
				message = fmt.Sprintf(
					"error: dependency secret use at %s:%d:%d is denied: %s",
					use.Source, use.Line, use.Column, reason,
				)
			case use.Target == "client":
				message = fmt.Sprintf(
					"error: dependency secret use at %s:%d:%d is retained in a client artifact",
					use.Source, use.Line, use.Column,
				)
			default:
				if _, allowed := allowedSecrets[use.Consumer.Package]; !allowed {
					message = fmt.Sprintf(
						"error: dependency %s consumes a secret at %s:%d:%d but is not in secrets.allowPackages",
						use.Consumer.Package, use.Source, use.Line, use.Column,
					)
				}
			}
			if message != "" {
				diagnostics = append(diagnostics, capabilityDiagnostic("EXACT4010", message))
			}
		}
	}
	sort.Slice(diagnostics, func(left int, right int) bool {
		return diagnostics[left].Message < diagnostics[right].Message
	})
	return diagnostics
}

func stringSet(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func capabilityDiagnostic(code string, message string) Diagnostic {
	return Diagnostic{Severity: "error", Code: code, Message: message}
}
