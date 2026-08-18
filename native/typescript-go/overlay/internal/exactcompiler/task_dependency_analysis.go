package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func taskDependencyRecords(
	work *ast.Node,
	component string,
	requiredReads []StateEffect,
	stateReads []StateRead,
	reactiveNames []string,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
	excluded []taskCaptureRange,
) []TaskDependency {
	required := make(map[string]struct{}, len(requiredReads))
	for _, read := range requiredReads {
		if read.Kind == "read" {
			required[read.Path] = struct{}{}
		}
	}
	updateTargets := stateUpdateTargetSpans(work)
	type positionedDependency struct {
		position   int
		dependency TaskDependency
	}
	positioned := []positionedDependency{}
	seenPaths := make(map[string]struct{})
	stateCaptureSpans := make([][2]int, 0)
	for _, read := range stateReads {
		if read.Component != component ||
			read.Start < work.Pos() ||
			read.Start+read.Length > work.End() {
			continue
		}
		if spanInsideTaskCapture(read.Start, read.Start+read.Length, excluded) {
			continue
		}
		path := strings.Join(read.Path, ".")
		if _, needed := required[path]; !needed {
			continue
		}
		if _, updated := updateTargets[[2]int{read.Start, read.Start + read.Length}]; updated {
			continue
		}
		key := path
		if read.Confidence != "exact" {
			key = fmt.Sprintf("%s@%d", path, read.Start)
		}
		if _, duplicate := seenPaths[key]; duplicate {
			continue
		}
		seenPaths[key] = struct{}{}
		stateCaptureSpans = append(
			stateCaptureSpans,
			[2]int{read.Start, read.Start + read.Length},
		)
		positioned = append(positioned, positionedDependency{
			position: read.Start,
			dependency: TaskDependency{
				Source: "state",
				Path:   "this.state." + path,
			},
		})
	}
	byName := make(map[string]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == component {
			byName[binding.Name] = binding
		}
	}
	for _, name := range reactiveNames {
		binding, exists := byName[name]
		if !exists {
			continue
		}
		source := binding.Provenance
		switch source {
		case "state", "props", "context", "derived":
		default:
			source = "derived"
		}
		position := reactiveDependencyReferenceStart(
			work,
			binding,
			typeChecker,
		)
		contained := false
		for _, span := range stateCaptureSpans {
			if position >= span[0] && position < span[1] {
				contained = true
				break
			}
		}
		if contained {
			continue
		}
		positioned = append(positioned, positionedDependency{
			position: position,
			dependency: TaskDependency{
				Source:       source,
				Path:         binding.Name,
				ContextToken: binding.ContextToken,
			},
		})
	}
	sort.SliceStable(positioned, func(left int, right int) bool {
		return positioned[left].position < positioned[right].position
	})
	result := make([]TaskDependency, len(positioned))
	for index := range positioned {
		result[index] = positioned[index].dependency
		result[index].Index = index
	}
	return result
}

// stateUpdateTargetSpans separates mutation input from scheduling input.
// Increment and decrement still read their previous value for effect and
// continuation contracts, but subscribing a task to the value it increments
// would make the task immediately invalidate itself.
func stateUpdateTargetSpans(work *ast.Node) map[[2]int]struct{} {
	result := make(map[[2]int]struct{})
	walkNode(work, func(node *ast.Node) bool {
		var operand *ast.Node
		switch {
		case ast.IsPrefixUnaryExpression(node):
			expression := node.AsPrefixUnaryExpression()
			if expression.Operator == ast.KindPlusPlusToken ||
				expression.Operator == ast.KindMinusMinusToken {
				operand = expression.Operand
			}
		case ast.IsPostfixUnaryExpression(node):
			expression := node.AsPostfixUnaryExpression()
			if expression.Operator == ast.KindPlusPlusToken ||
				expression.Operator == ast.KindMinusMinusToken {
				operand = expression.Operand
			}
		}
		if operand != nil {
			result[[2]int{operand.Pos(), operand.End()}] = struct{}{}
		}
		return true
	})
	return result
}

func reactiveDependencyReferenceStart(
	work *ast.Node,
	binding ReactiveBinding,
	typeChecker *checker.Checker,
) int {
	position := work.End()
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		for _, declaration := range symbol.Declarations {
			name := declaration.Name()
			if name != nil && name.Pos() == binding.Start && node.Pos() < position {
				position = node.Pos()
			}
		}
		return true
	})
	return position
}

func taskReactiveDependencies(
	work *ast.Node,
	component string,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
	diagnostics []string,
	excluded []taskCaptureRange,
) ([]string, []string) {
	byStart := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == component && reactiveProvenance(binding.Provenance) {
			byStart[binding.Start] = binding
		}
	}
	var dependencies []string
	seen := make(map[int]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if spanInsideTaskCapture(node.Pos(), node.End(), excluded) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		for _, declaration := range symbol.Declarations {
			name := declaration.Name()
			if name == nil {
				continue
			}
			binding, exists := byStart[name.Pos()]
			if !exists {
				continue
			}
			if name.Pos() >= work.Pos() && name.End() <= work.End() {
				// A binding declared by the task body (including a nested event
				// callback) is generation-local work, not an activation input.
				break
			}
			if _, duplicate := seen[binding.Start]; duplicate {
				break
			}
			seen[binding.Start] = struct{}{}
			dependencies = append(dependencies, binding.Name)
			if binding.Provenance == "derived" && !binding.SafeToReevaluate {
				diagnostics = append(diagnostics, fmt.Sprintf(
					"error: task reads derived local %s, which cannot be safely reevaluated; capture an explicit reactive value or move the effectful expression into the task function body",
					binding.Name,
				))
			}
			break
		}
		return true
	})
	return dependencies, diagnostics
}

func taskEnvironmentEffects(
	work *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (bool, bool) {
	browser := false
	server := false
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		name := node.Text()
		symbol := typeChecker.GetSymbolAtLocation(node)
		if _, candidate := browserGlobals[name]; candidate &&
			symbolIsOutsideSource(symbol, sourceFile) {
			browser = true
		}
		if _, candidate := serverGlobals[name]; candidate &&
			symbolIsOutsideSource(symbol, sourceFile) {
			server = true
		}
		if serverOnlyImportSymbol(symbol) {
			server = true
		}
		return true
	})
	return browser, server
}

func isStaticPropertyName(node *ast.Node) bool {
	return node.Parent != nil &&
		ast.IsPropertyAccessExpression(node.Parent) &&
		node.Parent.AsPropertyAccessExpression().Name() == node
}

func symbolIsOutsideSource(symbol *ast.Symbol, sourceFile *ast.SourceFile) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if ast.GetSourceFileOfNode(declaration) == sourceFile {
			return false
		}
	}
	return true
}

func serverOnlyImportSymbol(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		typeOnly := false
		for current := declaration; current != nil; current = current.Parent {
			if ast.IsImportSpecifier(current) &&
				current.AsImportSpecifier().IsTypeOnly {
				typeOnly = true
			}
			if ast.IsImportClause(current) &&
				current.AsImportClause().PhaseModifier == ast.KindTypeKeyword {
				typeOnly = true
			}
			if ast.IsImportDeclaration(current) {
				if typeOnly {
					return false
				}
				return serverOnlyModule(
					current.AsImportDeclaration().ModuleSpecifier.Text(),
				)
			}
			if ast.IsSourceFile(current) {
				break
			}
		}
	}
	return false
}

func serverOnlyModule(specifier string) bool {
	if strings.HasPrefix(specifier, "node:") {
		return true
	}
	root := specifier
	if slash := strings.IndexByte(root, '/'); slash >= 0 {
		root = root[:slash]
	}
	_, builtin := nodeBuiltinModules[root]
	return builtin
}
