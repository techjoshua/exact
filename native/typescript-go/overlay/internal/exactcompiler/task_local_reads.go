package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type taskCommittedPaths struct{ exact, ancestors map[string]bool }
type taskLocalWrite struct {
	end   int
	path  []string
	scope *ast.Node
}

// taskLocalReadRanges identifies reads dominated by completed local writes. Facts are
// shared by activation contracts and both emitters, while authority retains complete effects.
func taskLocalReadRanges(work *ast.Node, component string, reads []StateRead, writes []StateWrite) []taskCaptureRange {
	nodes := map[string]*ast.Node{}
	walkNode(work, func(node *ast.Node) bool {
		nodes[fmt.Sprintf("%d:%d", node.Pos(), node.End()-node.Pos())] = node
		return true
	})
	owned := []taskLocalWrite{}
	for _, write := range writes {
		if write.Component != component || write.Start < work.Pos() || write.Start+write.Length > work.End() {
			continue
		}
		node := nodes[fmt.Sprintf("%d:%d", write.Start, write.Length)]
		if scope := taskCompletedWriteScope(node, work); scope != nil {
			owned = append(owned, taskLocalWrite{write.Start + write.Length, write.Path, scope})
		}
	}
	sort.Slice(owned, func(i, j int) bool { return owned[i].end < owned[j].end })
	scopes := map[*ast.Node]*taskCommittedPaths{}
	index := 0
	result := []taskCaptureRange{}
	for _, read := range reads {
		if read.Component != component || read.Start < work.Pos() || read.Start+read.Length > work.End() {
			continue
		}
		for index < len(owned) && owned[index].end <= read.Start {
			write := owned[index]
			paths := scopes[write.scope]
			if paths == nil {
				paths = &taskCommittedPaths{map[string]bool{}, map[string]bool{}}
				scopes[write.scope] = paths
			}
			for length := 1; length <= len(write.path); length++ {
				paths.ancestors[strings.Join(write.path[:length], ".")] = true
			}
			paths.exact[strings.Join(write.path, ".")] = true
			index++
		}
		node := nodes[fmt.Sprintf("%d:%d", read.Start, read.Length)]
		local := false
		for current := node; current != nil && !local; current = current.Parent {
			if paths := scopes[current]; paths != nil {
				local = paths.ancestors[strings.Join(read.Path, ".")]
				for length := 1; !local && length <= len(read.Path); length++ {
					local = paths.exact[strings.Join(read.Path[:length], ".")]
				}
			}
			if current == work {
				break
			}
		}
		if local {
			result = append(result, taskCaptureRange{start: read.Start, end: read.Start + read.Length})
		}
	}
	return result
}

// taskCompletedWriteScope rejects conditional expression arms, unbraced control bodies
// and nested function definitions. A block-local write can dominate only reads in that block.
func taskCompletedWriteScope(node, work *ast.Node) *ast.Node {
	if node == nil {
		return nil
	}
	var scope *ast.Node
	for current := node; current != nil && current != work; current = current.Parent {
		parent := current.Parent
		if parent == nil {
			return nil
		}
		if ast.IsFunctionLike(parent) && parent != work {
			return nil
		}
		if ast.IsConditionalExpression(parent) && parent.AsConditionalExpression().Condition != current {
			return nil
		}
		if ast.IsBinaryExpression(parent) {
			binary := parent.AsBinaryExpression()
			if binary.Right == current && (binary.OperatorToken.Kind == ast.KindAmpersandAmpersandToken || binary.OperatorToken.Kind == ast.KindBarBarToken || binary.OperatorToken.Kind == ast.KindQuestionQuestionToken) {
				return nil
			}
		}
		if ast.IsBlock(parent) && scope == nil {
			scope = parent
		}
		// Once inside a block, conditional ancestors do not invalidate domination within that block.
		if scope == nil {
			switch parent.Kind {
			case ast.KindIfStatement, ast.KindForStatement, ast.KindForInStatement, ast.KindForOfStatement, ast.KindWhileStatement, ast.KindDoStatement, ast.KindCaseClause, ast.KindDefaultClause:
				return nil
			}
		}
	}
	if scope == nil {
		scope = work
	}
	return scope
}

// taskPotentialLocalReadRanges retains readiness dependencies while keeping locally changed
// paths live. A closure may be declared before its writer and execute after it.
func taskPotentialLocalReadRanges(work *ast.Node, component string, reads []StateRead, writes []StateWrite) []taskCaptureRange {
	written := map[string]bool{}
	for _, write := range writes {
		if write.Component != component || write.Start < work.Pos() || write.Start+write.Length > work.End() {
			continue
		}
		written[strings.Join(write.Path, ".")] = true
	}
	result := []taskCaptureRange{}
	for _, read := range reads {
		if read.Component != component || read.Start < work.Pos() || read.Start+read.Length > work.End() {
			continue
		}
		for length := 1; length <= len(read.Path); length++ {
			if written[strings.Join(read.Path[:length], ".")] {
				result = append(result, taskCaptureRange{start: read.Start, end: read.Start + read.Length})
				break
			}
		}
	}
	return result
}

// taskEffectLocalReadRanges preserves invocation-time reads across proven helper effects.
// The activation dependency remains intact, including conditional and uncalled writers.
func taskEffectLocalReadRanges(work *ast.Node, component string, reads []StateRead, effects []StateEffect, result []taskCaptureRange) []taskCaptureRange {
	for _, read := range reads {
		if read.Component != component || read.Start < work.Pos() || read.Start+read.Length > work.End() {
			continue
		}
		if spanInsideTaskCapture(read.Start, read.Start+read.Length, result) {
			continue
		}
		for _, effect := range effects {
			if effect.Confidence == "exact" && statePathsAffectEachOther(read.Path, strings.Split(effect.Path, ".")) {
				result = append(result, taskCaptureRange{start: read.Start, end: read.Start + read.Length})
				break
			}
		}
	}
	return result
}
