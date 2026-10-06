package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sort"
)

// blockingTaskLocals carries ordered authored reads of locally assigned values without publishing
// those values to other component consumers before the blocking generation succeeds.
type blockingTaskLocal struct {
	value, ready *ast.Node
	suffix       []string
	fallback     *blockingTaskLocal
	descendants  []*blockingTaskLocal
}
type blockingTaskLocals struct {
	paths  map[string]*blockingTaskLocal
	writes map[string]*blockingTaskLocal
	reads  map[string]*blockingTaskLocal
}

func (lowering *jsxLowering) planBlockingTaskLocals(task Task) *blockingTaskLocals {
	plan := &blockingTaskLocals{writes: map[string]*blockingTaskLocal{}, reads: map[string]*blockingTaskLocal{}}
	if lowering.checking || lowering.target == TargetServer || task.Readiness != "blocking" || len(lowering.mutationFrames) == 0 {
		return plan
	}
	paths := map[string]*blockingTaskLocal{}
	segmentsByPath := map[string][]string{}
	eligible := map[string]StateWrite{}
	for _, write := range lowering.writes {
		if write.Component == task.Component && write.Start >= task.WorkStart && write.Start+write.Length <= task.WorkStart+task.WorkLength && len(write.DynamicSegments) == 0 && (write.Operation == "assignment" || write.Operation == "update") {
			path := statePathIdentity(write.Path)
			if previous, exists := eligible[path]; !exists || write.Start < previous.Start {
				eligible[path] = write
			}
		}
	}
	localReads := map[string]bool{}
	for _, span := range task.potentialLocalReads {
		localReads[fmt.Sprintf("%d:%d", span.start, span.end-span.start)] = true
	}

	for _, read := range lowering.stateReads {
		if read.Component != task.Component || !localReads[fmt.Sprintf("%d:%d", read.Start, read.Length)] {
			continue
		}
		for length := 1; length <= len(read.Path); length++ {
			path := statePathIdentity(read.Path[:length])
			write, exists := eligible[path]
			if !exists || paths[path] != nil {
				continue
			}
			source := lowering.mutationSource(write.Start, write.Length)
			if source == nil {
				continue
			}
			value := lowering.mutationTemporary(source)
			frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
			frame.declarations[len(frame.declarations)-1] = lowering.factory.NewVariableDeclaration(value, lowering.factory.NewToken(ast.KindExclamationToken), lowering.mutationFacts.at(nodeSpanKey(source)).destination, nil)
			ready := lowering.mutationTemporary(source)
			frame.declarations[len(frame.declarations)-1] = lowering.factory.NewVariableDeclaration(ready, nil, lowering.factory.NewKeywordTypeNode(ast.KindBooleanKeyword), lowering.factory.NewFalseExpression())
			paths[path] = &blockingTaskLocal{value: value, ready: ready}
			segmentsByPath[path] = append([]string(nil), read.Path[:length]...)
		}
	}
	pathNames := make([]string, 0, len(paths))
	for path := range paths {
		pathNames = append(pathNames, path)
	}
	sort.Strings(pathNames)
	for _, childPath := range pathNames {
		child := paths[childPath]
		segments := segmentsByPath[childPath]
		for length := 1; length < len(segments); length++ {
			if parent := paths[statePathIdentity(segments[:length])]; parent != nil {
				parent.descendants = append(parent.descendants, child)
			}
		}
	}
	for key, write := range lowering.writes {
		if write.Component == task.Component && write.Start >= task.WorkStart && write.Start+write.Length <= task.WorkStart+task.WorkLength {
			plan.writes[key] = paths[statePathIdentity(write.Path)]
		}
	}

	for _, read := range lowering.stateReads {
		if read.Component != task.Component || !localReads[fmt.Sprintf("%d:%d", read.Start, read.Length)] {
			continue
		}
		var chain *blockingTaskLocal
		for length := 1; length <= len(read.Path); length++ {
			if local := paths[statePathIdentity(read.Path[:length])]; local != nil {
				chain = &blockingTaskLocal{value: local.value, ready: local.ready, suffix: read.Path[length:], fallback: chain}
			}
		}
		plan.reads[fmt.Sprintf("%d:%d", read.Start, read.Length)] = chain
	}
	plan.paths = paths
	return plan
}

func (lowering *jsxLowering) blockingLocalRead(local *blockingTaskLocal, fallback *ast.Node) *ast.Node {
	if local.fallback != nil {
		fallback = lowering.blockingLocalRead(local.fallback, fallback)
	}
	value := local.value
	for _, segment := range local.suffix {
		value = lowering.factory.NewElementAccessExpression(value, nil, lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone), ast.NodeFlagsNone)
	}
	return lowering.factory.NewParenthesizedExpression(lowering.conditional(local.ready, value, fallback))
}

func (lowering *jsxLowering) rememberBlockingLocal(local *blockingTaskLocal, value *ast.Node) *ast.Node {
	result := lowering.binary(lowering.binary(local.value, ast.KindEqualsToken, value), ast.KindCommaToken, lowering.binary(local.ready, ast.KindEqualsToken, lowering.factory.NewTrueExpression()))
	for _, descendant := range local.descendants {
		result = lowering.binary(result, ast.KindCommaToken, lowering.binary(descendant.ready, ast.KindEqualsToken, lowering.factory.NewFalseExpression()))
	}
	return result
}

// blockingLocalForPath composes child values with locally replaced ancestor containers.
func (lowering *jsxLowering) blockingLocalForPath(path []string) *blockingTaskLocal {
	if len(lowering.blockingLocals) == 0 {
		return nil
	}
	paths := lowering.blockingLocals[len(lowering.blockingLocals)-1].paths
	var chain *blockingTaskLocal
	for length := 1; length <= len(path); length++ {
		if local := paths[statePathIdentity(path[:length])]; local != nil {
			chain = &blockingTaskLocal{value: local.value, ready: local.ready, suffix: path[length:], fallback: chain}
		}
	}
	return chain
}

func (lowering *jsxLowering) blockingLocalReady(local *blockingTaskLocal) *ast.Node {
	result := local.ready
	if local.fallback != nil {
		result = lowering.binary(result, ast.KindBarBarToken, lowering.blockingLocalReady(local.fallback))
	}
	return result
}
