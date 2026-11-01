package exactcompiler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// authoredValidation retains only diagnostics, never an acquired checker or emitted tree.
type authoredValidation struct {
	error       string
	diagnostics []Diagnostic
}

// authoredCheckProgress is scoped to one private checking execution. A framework
// refusal before generated validation cannot become a cached TypeScript proof.
type authoredCheckProgress struct {
	validated bool
}

// hasFrameworkAdmissionError preserves requested-target diagnostic precedence.
// Ordinary TypeScript errors still require the independent authored type proof.
func hasFrameworkAdmissionError(diagnostics []Diagnostic) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == "error" && strings.HasPrefix(diagnostic.Code, "EXACT") {
			return true
		}
	}
	return false
}

// checkExecutableAuthoredTypes coordinates requested-target admission with the
// independent neutral type proof. It reports whether a proof was applied so the
// public request owner can include that work in its existing total timing.
func (s *Session) checkExecutableAuthoredTypes(request Request, response *Response) bool {
	// Task captures also transform authored type context without mutating state.
	needsAuthoredProof := len(response.Analysis.StateWrites) != 0 || len(response.Analysis.Tasks) != 0 || len(response.Analysis.ValueBindings) != 0
	for _, element := range response.Analysis.JSX {
		if !jsxIntrinsic(element.Tag) {
			needsAuthoredProof = true
			break
		}
	}
	isolatedProof := false
	for _, project := range s.projects {
		if project.program == s.validationProgram {
			isolatedProof = project.executionRoots
			break
		}
	}
	requiresProof := (request.Kind == "compile" && request.Target != TargetDefault && needsAuthoredProof) || (isolatedProof && (request.Kind == "analyze" || request.Kind == "compile"))
	if response.Error == "" && !hasFrameworkAdmissionError(response.Diagnostics) && request.Diagnostics == "semantic" && requiresProof {
		checking := request
		checking.Kind = "check"
		// JavaScript keeps its authored checkJs and pragma policy in an isolated
		// source check. A generated .ts projection would strengthen that policy.
		if request.Kind == "analyze" && isJavaScriptFile(request.ID) {
			checking.Kind = "analyze"
		}
		checking.Target = TargetDefault
		checking.ModuleRewrite = nil
		checking.SourceMap = false
		checked := s.validateAuthored(checking)
		if checked.Error != "" {
			response.Error = checked.Error
		}
		for _, diagnostic := range checked.Diagnostics {
			// Neutral validation supplies authored TypeScript proof. Framework
			// contracts are already checked for the requested executable target.
			if strings.HasPrefix(diagnostic.Code, "EXACT") {
				continue
			}

			duplicate := false
			for _, existing := range response.Diagnostics {
				if existing.Code == diagnostic.Code && existing.Start == diagnostic.Start && existing.Message == diagnostic.Message {
					duplicate = true
					break
				}
			}
			if !duplicate {
				response.Diagnostics = append(response.Diagnostics, diagnostic)
			}
		}
		response.Timings.CheckMicroseconds += checked.Timings.TotalMicroseconds
		return true
	}
	return false
}

// validateAuthored shares the neutral proof across executable targets of the same
// program generation. A dependency update changes the program identity, even when
// the requested source is unchanged. All remaining request options belong to the key.
func (s *Session) validateAuthored(request Request) Response {
	program := s.validationProgram
	encoded, err := json.Marshal(request)
	if err != nil || program == nil {
		return s.executeProjection(request, &authoredCheckProgress{})
	}
	key := sha256.Sum256(encoded)
	if cached, ok := s.authoredValidations[program][key]; ok {
		return Response{Error: cached.error, Diagnostics: append([]Diagnostic(nil), cached.diagnostics...)}
	}
	var checked Response
	progress := &authoredCheckProgress{}
	if request.Kind == "analyze" {
		checked = s.checkAuthoredJavaScript(request, progress)
	} else {
		checked = s.executeProjection(request, progress)
	}
	if !progress.validated || s.validationProgram != program {
		return checked
	}
	if s.authoredValidations == nil {
		s.authoredValidations = make(map[*compiler.Program]map[[32]byte]authoredValidation)
	}
	if s.authoredValidations[program] == nil {
		s.authoredValidations[program] = make(map[[32]byte]authoredValidation)
	}
	s.authoredValidations[program][key] = authoredValidation{
		error: checked.Error, diagnostics: append([]Diagnostic(nil), checked.Diagnostics...),
	}
	return checked
}

// pruneAuthoredValidations releases obsolete programs even when the next request has no writes.
func (s *Session) pruneAuthoredValidations() {
	if len(s.authoredValidations) == 0 {
		return
	}

	live := make(map[*compiler.Program]bool, len(s.projects))
	for _, project := range s.projects {
		live[project.program] = true
	}
	for program := range s.authoredValidations {
		if !live[program] {
			delete(s.authoredValidations, program)
		}
	}
}

func isJavaScriptFile(filename string) bool {
	return strings.HasSuffix(filename, ".js") || strings.HasSuffix(filename, ".jsx") || strings.HasSuffix(filename, ".mjs") || strings.HasSuffix(filename, ".cjs")
}

// validateAuthoredJavaScript retains the authored script kind and TypeScript checking
// policy while excluding execution-only roots. The existing Program-keyed proof cache
// owns its diagnostics. No generated TypeScript diagnostics are filtered afterward.
func (s *Session) validateAuthoredJavaScript(request Request) Response {
	return s.checkAuthoredJavaScript(request, &authoredCheckProgress{})
}

// checkAuthoredJavaScript records completion only after the isolated source's
// ordinary TypeScript policy has been applied, including an intentional checkJs skip.
func (s *Session) checkAuthoredJavaScript(request Request, progress *authoredCheckProgress) Response {
	response := Response{}
	filename, err := normalizeFileName(request.ID, request.Root)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	var sources map[string]string
	for _, project := range s.projects {
		if project.program == s.validationProgram {
			sources = project.fs.files
			break
		}
	}
	project, diagnostics, err := newProjectStateWithSources(request, filename, sources)
	for _, diagnostic := range diagnostics {
		response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
	}
	if err != nil {
		response.Error = err.Error()
		return response
	}
	if project == nil {
		return response
	}
	normalization, err := normalizeAuthoredSource(filename, request.Source)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	generation, err := project.advance(context.Background(), filename, normalization.text)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	defer generation.release()
	if !generation.program.SkipTypeChecking(generation.sourceFile, false) {
		for _, diagnostic := range generation.program.GetExactSemanticDiagnostics(context.Background(), generation.checker, generation.sourceFile) {
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
	}
	progress.validated = true
	remapDiagnosticLocations(response.Diagnostics, filename, normalization, 0)
	return response
}
