package exactcompiler

import "unicode/utf8"

// The original linear conversion remains a differential oracle for the sparse source index.
func sourceOffsetForUTF16LineColumn(source string, line int, column int) int {
	currentLine, currentColumn := 0, 0
	for offset := 0; offset < len(source); {
		if currentLine == line && currentColumn >= column {
			return offset
		}
		r, size := utf8.DecodeRuneInString(source[offset:])
		if lineBreak := sourceLineBreakSize(source, offset); lineBreak != 0 {
			size = lineBreak
			currentLine++
			currentColumn = 0
		} else if r > 0xffff {
			currentColumn += 2
		} else {
			currentColumn++
		}
		offset += size
	}
	return len(source)
}
