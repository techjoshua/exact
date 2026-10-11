package exactcompiler

import (
	"sort"
	"unicode/utf8"
)

type sourceCoordinate struct{ offset, line, column int }

// sourceLocationIndex records line starts and sparse rune checkpoints for source-map queries.
// Forward rounding inside UTF-8 runes and CRLF matches the scanner. Queries scan at most
// 64 rune boundaries after binary search, without allocating a coordinate for every byte.
type sourceLocationIndex struct {
	source string
	points []sourceCoordinate
	lines  []int
}

func indexSourceLocations(source string) sourceLocationIndex {
	result := sourceLocationIndex{source: source}
	point := sourceCoordinate{}
	for count := 0; point.offset < len(source); count++ {
		if point.column == 0 {
			result.lines = append(result.lines, len(result.points))
		}
		if point.column == 0 || count%64 == 0 {
			result.points = append(result.points, point)
		}
		point = advanceSourceCoordinate(source, point)
	}
	if point.column == 0 {
		result.lines = append(result.lines, len(result.points))
	}
	result.points = append(result.points, point)
	return result
}

func advanceSourceCoordinate(source string, point sourceCoordinate) sourceCoordinate {
	r, size := utf8.DecodeRuneInString(source[point.offset:])
	if lineBreak := sourceLineBreakSize(source, point.offset); lineBreak != 0 {
		size = lineBreak
		point.line++
		point.column = 0
	} else if r > 0xffff {
		point.column += 2
	} else {
		point.column++
	}
	point.offset += size
	return point
}

func (index sourceLocationIndex) offset(line, column int) int {
	if line < 0 || line >= len(index.lines) {
		return len(index.source)
	}
	start, end := index.lines[line], len(index.points)
	if line+1 < len(index.lines) {
		end = index.lines[line+1]
	}
	position := sort.Search(end-start, func(i int) bool { return index.points[start+i].column > column }) - 1
	point := index.points[start+max(0, position)]
	for point.offset < len(index.source) && point.line == line {
		if point.column >= column {
			return point.offset
		}
		point = advanceSourceCoordinate(index.source, point)
	}
	return len(index.source)
}

func (index sourceLocationIndex) lineColumn(offset int) (int, int) {
	offset = max(0, min(offset, len(index.source)))
	position := sort.Search(len(index.points), func(i int) bool { return index.points[i].offset > offset }) - 1
	point := index.points[max(0, position)]
	for point.offset < offset {
		point = advanceSourceCoordinate(index.source, point)
	}
	return point.line, point.column
}
