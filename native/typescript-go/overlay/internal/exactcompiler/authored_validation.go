package exactcompiler

import (
	"crypto/sha256"
	"encoding/json"

	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// authoredValidation retains only diagnostics, never an acquired checker or emitted tree.
type authoredValidation struct {
	error       string
	diagnostics []Diagnostic
}

// validateAuthored shares the neutral proof across executable targets of the same
// program generation. A dependency update changes the program identity, even when
// the requested source is unchanged. All remaining request options belong to the key.
func (s *Session) validateAuthored(request Request) Response {
	program := s.validationProgram
	encoded, err := json.Marshal(request)
	if err != nil || program == nil {
		return s.executeLocked(request)
	}
	key := sha256.Sum256(encoded)
	if cached, ok := s.authoredValidations[program][key]; ok {
		return Response{Error: cached.error, Diagnostics: append([]Diagnostic(nil), cached.diagnostics...)}
	}
	checked := s.executeLocked(request)
	if s.validationProgram != program {
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
