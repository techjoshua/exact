package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

func taskDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	tasks []Task,
	stateWrites []StateWrite,
	target Target,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, task := range tasks {
		if task.Placement == "server" && task.Invoked {
			diagnostics = append(diagnostics, taskOptimisticCaptureDiagnostics(sourceFile, typeChecker, task)...)
		}
		if task.Placement == "server" || task.Placement == "isomorphic" {
			workStart, workLength := task.Start, task.Length
			if task.FunctionDefined {
				workStart, workLength = task.WorkStart, task.WorkLength
			}
			for _, write := range task.Writes {
				// A server-local setup task never serializes a patch. Invokable work and
				// client projections still need representable continuation paths.
				if target == TargetServer && !task.Invoked {
					continue
				}
				for _, segment := range write.pathSegments {
					if strings.Contains(segment, ".") || segment == "" {
						diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001", Message: "error: a server continuation cannot publish a literal state key containing a dot or an empty key. Assign its enclosing statically named state value", Start: task.Start, Length: task.Length})
						break
					}
				}
				if write.Receiver != nil && (write.Operation == "map" || write.Operation == "set") {
					diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001", Message: "error: a server continuation cannot publish Map or Set mutations through a parameter helper. Mutate the component collection directly in the task", Start: task.Start, Length: task.Length})
				}
				if !strings.Contains(write.Path, "*") {
					continue
				}
				diagnostics = append(diagnostics, Diagnostic{
					Severity: "error",
					Code:     "EXACT2001",
					Message: "error: a server continuation cannot publish a state write through a dynamic computed path or opaque helper (" +
						write.Path + "); write an enclosing statically named state value or keep the mutation client-side",
					Start:  task.Start,
					Length: task.Length,
				})
			}
			for _, write := range stateWrites {
				if write.Operation == "opaque-mutation" &&
					write.Start >= workStart && write.Start+write.Length <= workStart+workLength &&
					(target != TargetServer || task.Invoked) {
					diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001", Message: "error: a server continuation requires a statically known Array, Map or Set receiver for a collection mutation. Preserve its collection type or assign an enclosing statically named state value", Start: write.Start, Length: write.Length})
				}
				if write.Operation != "map-mutation" ||
					write.Start < workStart ||
					write.Start+write.Length > workStart+workLength {
					continue
				}
				if key := collectionMutationKeyAt(
					sourceFile,
					write,
				); key != nil && definitelyNonTransportableMapKey(
					typeChecker.GetTypeAtLocation(key), typeChecker,
				) {
					diagnostics = append(diagnostics, Diagnostic{
						Severity: "error",
						Code:     "EXACT2001",
						Message: "error: a server continuation Map key must be null, boolean, a finite number, or a string. Received " +
							typeChecker.TypeToString(typeChecker.GetTypeAtLocation(key)),
						Start:  key.Pos(),
						Length: key.End() - key.Pos(),
					})
				}
			}
		}
		for _, message := range task.Diagnostics {
			severity, code := "error", "EXACT2001"
			if strings.HasPrefix(message, "warning:") {
				severity, code = "warning", "EXACT2003"
			} else if !strings.HasPrefix(message, "error:") {
				continue
			}
			start := task.Start
			if sourceFile != nil {
				start = scanner.SkipTrivia(sourceFile.Text(), start)
			}

			diagnostics = append(diagnostics, Diagnostic{
				Severity: severity,
				Code:     code,
				Message:  message,
				Start:    start,
				Length:   task.Length,
			})
		}
	}
	return diagnostics
}

func collectionMutationKeyAt(
	sourceFile *ast.SourceFile,
	write StateWrite,
) *ast.Node {
	var key *ast.Node
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() != write.Start || node.End()-node.Pos() != write.Length ||
			!ast.IsCallExpression(node) {
			return key == nil
		}
		call := node.AsCallExpression()
		if call.Arguments != nil && len(call.Arguments.Nodes) > 0 {
			key = call.Arguments.Nodes[0]
		}
		return false
	})
	return key
}

// definitelyNonTransportableMapKey uses checker categories rather than type
// display text. Uncertain types retain runtime validation. Primitive branded
// intersections remain primitive keys, while wholly invalid unions are rejected.
func definitelyNonTransportableMapKey(value *checker.Type, typeChecker *checker.Checker) bool {
	flags := value.Flags()
	if flags&checker.TypeFlagsUnionOrIntersection != 0 {
		for _, member := range value.Types() {
			if !definitelyNonTransportableMapKey(member, typeChecker) {
				return false
			}
		}
		return true
	}
	if flags&checker.TypeFlagsTypeParameter != 0 {
		constraint := typeChecker.GetBaseConstraintOfType(value)
		return constraint != nil && constraint != value && definitelyNonTransportableMapKey(constraint, typeChecker)
	}
	return flags&(checker.TypeFlagsObject|checker.TypeFlagsNonPrimitive|checker.TypeFlagsESSymbolLike|checker.TypeFlagsBigIntLike|checker.TypeFlagsUndefined) != 0
}
