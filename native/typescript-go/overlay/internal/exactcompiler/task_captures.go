package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type taskCaptureRange struct {
	start     int
	end       int
	parameter int
}

// taskCaptureRanges identifies the default initializers whose reads are
// generation snapshots rather than task activation dependencies.
func taskCaptureRanges(work *ast.Node, argumentCount int) []taskCaptureRange {
	parameters := work.Parameters()
	count := min(argumentCount, len(parameters))
	result := []taskCaptureRange{}
	for index, node := range parameters[:count] {
		initializer := node.AsParameterDeclaration().Initializer
		if initializer == nil {
			continue
		}
		result = append(result, taskCaptureRange{
			start:     initializer.Pos(),
			end:       initializer.End(),
			parameter: index,
		})
	}
	return result
}

func spanInsideTaskCapture(start int, end int, captures []taskCaptureRange) bool {
	for _, capture := range captures {
		if start >= capture.start && end <= capture.end {
			return true
		}
	}
	return false
}

// taskCallableReadsWithoutCapturedDefaults removes direct default-initializer
// reads from the callable summary while retaining same-path body or child reads.
func taskCallableReadsWithoutCapturedDefaults(
	direct []StateEffect,
	summary []StateEffect,
	captured []TaskCapturedInput,
	work *ast.Node,
	callables callableAnalysis,
) []StateEffect {
	capturedPaths := make(map[string]struct{})
	for _, input := range captured {
		if input.Source == "state" &&
			strings.HasPrefix(input.Path, "this.state.") {
			capturedPaths[strings.TrimPrefix(input.Path, "this.state.")] = struct{}{}
		}
	}
	if len(capturedPaths) == 0 {
		return summary
	}
	retained := make(map[string]struct{})
	for _, read := range direct {
		retained[read.Path] = struct{}{}
	}
	for index := range callables.facts {
		fact := &callables.facts[index]
		if fact.node != work {
			continue
		}
		for _, target := range fact.targets {
			if target < 0 || target >= len(callables.facts) {
				continue
			}
			for _, read := range callables.facts[target].summary.StateReads {
				retained[read.Path] = struct{}{}
			}
		}
		for _, target := range fact.externalTargets {
			for _, read := range target.StateReads {
				retained[read.Path] = struct{}{}
			}
		}
		break
	}
	result := make([]StateEffect, 0, len(summary))
	for _, read := range summary {
		if _, capture := capturedPaths[read.Path]; capture {
			if _, keep := retained[read.Path]; !keep {
				continue
			}
		}
		result = append(result, read)
	}
	return result
}

// collectTaskCapturedInputs records reactive source reads used by defaulted
// parameters separately from dependencies that can reactivate the task.
func collectTaskCapturedInputs(
	work *ast.Node,
	argumentCount int,
	component string,
	sourceFile *ast.SourceFile,
	stateReads []StateRead,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
) []TaskCapturedInput {
	captures := taskCaptureRanges(work, argumentCount)
	if len(captures) == 0 {
		return nil
	}
	result := []TaskCapturedInput{}
	seen := make(map[string]struct{})
	appendInput := func(input TaskCapturedInput) {
		key := fmt.Sprintf(
			"%d:%s:%s:%s",
			input.Parameter,
			input.Source,
			input.Path,
			input.ContextToken,
		)
		if _, duplicate := seen[key]; duplicate {
			return
		}
		seen[key] = struct{}{}
		result = append(result, input)
	}
	for _, read := range stateReads {
		if read.Component != component {
			continue
		}
		for _, capture := range captures {
			if read.Start >= capture.start &&
				read.Start+read.Length <= capture.end {
				appendInput(TaskCapturedInput{
					Parameter: capture.parameter,
					Source:    "state",
					Path:      "this.state." + strings.Join(read.Path, "."),
				})
				break
			}
		}
	}
	byStart := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == component {
			byStart[binding.Start] = binding
		}
	}
	for _, capture := range captures {
		initializer := nodeAtSpan(
			work,
			capture.start,
			capture.end-capture.start,
		)
		if initializer == nil {
			continue
		}
		walkNode(initializer, func(node *ast.Node) bool {
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
				source := binding.Provenance
				switch source {
				case "state", "props", "context", "derived":
				default:
					source = "derived"
				}
				captureNode := node
				for captureNode.Parent != nil {
					parent := captureNode.Parent
					if ast.IsPropertyAccessExpression(parent) &&
						parent.AsPropertyAccessExpression().Expression == captureNode {
						captureNode = parent
						continue
					}
					if ast.IsElementAccessExpression(parent) &&
						parent.AsElementAccessExpression().Expression == captureNode {
						captureNode = parent
						continue
					}
					break
				}
				appendInput(TaskCapturedInput{
					Parameter:    capture.parameter,
					Source:       source,
					Path:         strings.TrimSpace(sourceText(sourceFile, captureNode)),
					ContextToken: binding.ContextToken,
				})
				break
			}
			return true
		})
	}
	return result
}

// taskCaptureArgumentResolver creates the compiler-owned argument normalizer
// that applies JavaScript defaults under the runtime's untracked capture scope.
func (lowering *jsxLowering) taskCaptureArgumentResolver(
	work *ast.Node,
	argumentOffset int,
	argumentCount int,
) *ast.Node {
	if len(taskCaptureRanges(work, argumentCount)) == 0 {
		return nil
	}
	used := make(map[string]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = struct{}{}
		}
		return true
	})
	allocate := func(base string) string {
		candidate := base
		for {
			if _, exists := used[candidate]; !exists {
				used[candidate] = struct{}{}
				return candidate
			}
			candidate += "_"
		}
	}
	argsName := allocate("__exactTaskArgs")
	args := lowering.factory.NewIdentifier(argsName)
	statements := []*ast.Node{}
	values := make([]*ast.Node, 0, argumentOffset+argumentCount)
	for index := 0; index < argumentOffset; index++ {
		values = append(values, lowering.taskCaptureArgument(args, index))
	}
	parameters := work.Parameters()
	for index, node := range parameters[:min(argumentCount, len(parameters))] {
		parameter := node.AsParameterDeclaration()
		argument := lowering.taskCaptureArgument(args, argumentOffset+index)
		value := argument
		if parameter.Initializer != nil {
			value = lowering.conditional(
				lowering.binary(
					argument,
					ast.KindEqualsEqualsEqualsToken,
					lowering.factory.NewVoidExpression(
						lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
					),
				),
				lowering.visitor.VisitNode(parameter.Initializer),
				argument,
			)
		}
		name := parameter.Name()
		if ast.IsIdentifier(name) {
			statements = append(statements, lowering.constStatement(name, value))
			values = append(values, lowering.factory.NewIdentifier(name.Text()))
			continue
		}
		valueName := allocate(fmt.Sprintf("__exactCapturedArgument%d", index))
		valueIdentifier := lowering.factory.NewIdentifier(valueName)
		statements = append(
			statements,
			lowering.constStatement(valueIdentifier, value),
			lowering.constStatement(name, valueIdentifier),
		)
		values = append(values, lowering.factory.NewIdentifier(valueName))
	}
	statements = append(
		statements,
		lowering.factory.NewReturnStatement(
			lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			),
		),
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewParameterDeclaration(
				nil,
				nil,
				args,
				nil,
				lowering.factory.NewArrayTypeNode(
					lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword),
				),
				nil,
			),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList(statements),
			true,
		),
	)
}

func (lowering *jsxLowering) taskCaptureArgument(args *ast.Node, index int) *ast.Node {
	return lowering.factory.NewElementAccessExpression(
		args,
		nil,
		lowering.factory.NewNumericLiteral(fmt.Sprintf("%d", index), ast.TokenFlagsNone),
		ast.NodeFlagsNone,
	)
}

// eraseTaskCapturedParameterDefaults prevents a captured initializer from
// executing again inside the task frame or on a remote continuation host.
func (lowering *jsxLowering) eraseTaskCapturedParameterDefaults(
	work *ast.Node,
	argumentCount int,
) *ast.Node {
	parameters := append([]*ast.Node(nil), work.Parameters()...)
	changed := false
	for index, node := range parameters[:min(argumentCount, len(parameters))] {
		parameter := node.AsParameterDeclaration()
		if parameter.Initializer == nil {
			continue
		}
		parameters[index] = lowering.factory.UpdateParameterDeclaration(
			parameter,
			parameter.Modifiers(),
			parameter.DotDotDotToken,
			parameter.Name(),
			parameter.QuestionToken,
			parameter.Type,
			nil,
		)
		changed = true
	}
	if !changed {
		return work
	}
	return lowering.updateTaskWorkParameters(work, parameters)
}
