package exactcompiler

import (
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
	if len(local.RawHTML) != 0 && !request.Capabilities.UnsafeHTML.Enabled {
		diagnostics = append(diagnostics, capabilityDiagnostic(
			"EXACT4001",
			"error: unsafeHtml capability is used but the application has not explicitly enabled it",
		))
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
