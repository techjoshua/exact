package exactcompiler

import (
	"reflect"
	"strings"
	"unicode/utf8"
)

// remapAuthoredLocations translates public analysis and source diagnostics
// from the normalized compiler buffer back to the source supplied by the
// caller. Internal lowering continues to use normalized coordinates.
func remapAuthoredLocations(
	response *Response,
	source normalizedSource,
	sourceDiagnosticCount int,
) {
	remapLocationValue(reflect.ValueOf(&response.Analysis), source)
	if sourceDiagnosticCount > len(response.Diagnostics) {
		sourceDiagnosticCount = len(response.Diagnostics)
	}
	for index := 0; index < sourceDiagnosticCount; index++ {
		start, length := source.authoredSpan(
			response.Diagnostics[index].Start,
			response.Diagnostics[index].Length,
		)
		response.Diagnostics[index].Start = start
		response.Diagnostics[index].Length = length
	}
	for index := range response.Analysis.Capabilities.RawHTML {
		remapLineColumn(
			&response.Analysis.Capabilities.RawHTML[index].Line,
			&response.Analysis.Capabilities.RawHTML[index].Column,
			source,
		)
	}
	for index := range response.Analysis.Policy.SecretConsumers {
		remapLineColumn(
			&response.Analysis.Policy.SecretConsumers[index].Line,
			&response.Analysis.Policy.SecretConsumers[index].Column,
			source,
		)
	}
	if response.SourceMap != nil {
		response.SourceMap.Mappings = remapSourceMapMappings(
			response.SourceMap.Mappings,
			source,
		)
		authored := source.authored
		response.SourceMap.SourcesContent = []*string{&authored}
	}
}

func remapLocationValue(value reflect.Value, source normalizedSource) {
	if !value.IsValid() {
		return
	}
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return
		}
		remapLocationValue(value.Elem(), source)
		return
	}
	switch value.Kind() {
	case reflect.Slice, reflect.Array:
		for index := 0; index < value.Len(); index++ {
			remapLocationValue(value.Index(index), source)
		}
		return
	case reflect.Struct:
		start := value.FieldByName("Start")
		length := value.FieldByName("Length")
		if start.IsValid() && length.IsValid() &&
			start.CanSet() && length.CanSet() &&
			start.Kind() == reflect.Int && length.Kind() == reflect.Int {
			nextStart, nextLength := source.authoredSpan(
				int(start.Int()),
				int(length.Int()),
			)
			start.SetInt(int64(nextStart))
			length.SetInt(int64(nextLength))
		}
		nodeStart := value.FieldByName("NodeStart")
		nodeEnd := value.FieldByName("NodeEnd")
		if nodeStart.IsValid() && nodeEnd.IsValid() &&
			nodeStart.CanSet() && nodeEnd.CanSet() &&
			nodeStart.Kind() == reflect.Int && nodeEnd.Kind() == reflect.Int {
			nextStart := source.authoredOffset(int(nodeStart.Int()))
			nextEnd := source.authoredOffset(int(nodeEnd.Int()))
			if nextEnd < nextStart {
				nextEnd = nextStart
			}
			nodeStart.SetInt(int64(nextStart))
			nodeEnd.SetInt(int64(nextEnd))
		}
		for index := 0; index < value.NumField(); index++ {
			remapLocationValue(value.Field(index), source)
		}
	}
}

func remapLineColumn(line *int, column *int, source normalizedSource) {
	offset := sourceOffsetForLineColumn(source.text, *line, *column)
	authoredLine, authoredColumn := sourceLineAndColumn(
		source.authored,
		source.authoredOffset(offset),
	)
	*line = authoredLine
	*column = authoredColumn
}

func sourceOffsetForLineColumn(source string, line int, column int) int {
	if line < 1 {
		line = 1
	}
	if column < 1 {
		column = 1
	}
	currentLine, currentColumn := 1, 1
	for offset := 0; offset < len(source); {
		if currentLine == line && currentColumn == column {
			return offset
		}
		r, size := utf8.DecodeRuneInString(source[offset:])
		if r == '\n' {
			currentLine++
			currentColumn = 1
		} else {
			currentColumn++
		}
		offset += size
	}
	return len(source)
}

const sourceMapBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

func remapSourceMapMappings(mappings string, source normalizedSource) string {
	inputPreviousSource := 0
	inputPreviousLine := 0
	inputPreviousColumn := 0
	inputPreviousName := 0
	outputPreviousSource := 0
	outputPreviousLine := 0
	outputPreviousColumn := 0
	outputPreviousName := 0
	lines := strings.Split(mappings, ";")
	for lineIndex, line := range lines {
		if line == "" {
			continue
		}
		segments := strings.Split(line, ",")
		inputGeneratedColumn := 0
		outputGeneratedColumn := 0
		for segmentIndex, segment := range segments {
			values, valid := decodeSourceMapSegment(segment)
			if !valid || len(values) == 0 {
				return mappings
			}
			inputGeneratedColumn += values[0]
			outputValues := []int{inputGeneratedColumn - outputGeneratedColumn}
			outputGeneratedColumn = inputGeneratedColumn
			if len(values) >= 4 {
				inputPreviousSource += values[1]
				inputPreviousLine += values[2]
				inputPreviousColumn += values[3]
				authoredOffset := source.authoredOffset(
					sourceOffsetForUTF16LineColumn(
						source.text,
						inputPreviousLine,
						inputPreviousColumn,
					),
				)
				authoredLine, authoredColumn := sourceUTF16LineColumn(
					source.authored,
					authoredOffset,
				)
				outputValues = append(
					outputValues,
					inputPreviousSource-outputPreviousSource,
					authoredLine-outputPreviousLine,
					authoredColumn-outputPreviousColumn,
				)
				outputPreviousSource = inputPreviousSource
				outputPreviousLine = authoredLine
				outputPreviousColumn = authoredColumn
				if len(values) >= 5 {
					inputPreviousName += values[4]
					outputValues = append(
						outputValues,
						inputPreviousName-outputPreviousName,
					)
					outputPreviousName = inputPreviousName
				}
			}
			segments[segmentIndex] = encodeSourceMapSegment(outputValues)
		}
		lines[lineIndex] = strings.Join(segments, ",")
	}
	return strings.Join(lines, ";")
}

func decodeSourceMapSegment(segment string) ([]int, bool) {
	values := []int{}
	for index := 0; index < len(segment); {
		value, shift := 0, 0
		for {
			if index >= len(segment) {
				return nil, false
			}
			digit := strings.IndexByte(sourceMapBase64, segment[index])
			index++
			if digit < 0 {
				return nil, false
			}
			value |= (digit & 31) << shift
			shift += 5
			if digit&32 == 0 {
				break
			}
		}
		negative := value&1 != 0
		value >>= 1
		if negative {
			value = -value
		}
		values = append(values, value)
	}
	return values, true
}

func encodeSourceMapSegment(values []int) string {
	var result strings.Builder
	for _, value := range values {
		encoded := value << 1
		if value < 0 {
			encoded = ((-value) << 1) | 1
		}
		for {
			digit := encoded & 31
			encoded >>= 5
			if encoded != 0 {
				digit |= 32
			}
			result.WriteByte(sourceMapBase64[digit])
			if encoded == 0 {
				break
			}
		}
	}
	return result.String()
}

func sourceOffsetForUTF16LineColumn(source string, line int, column int) int {
	currentLine, currentColumn := 0, 0
	for offset := 0; offset < len(source); {
		if currentLine == line && currentColumn >= column {
			return offset
		}
		r, size := utf8.DecodeRuneInString(source[offset:])
		if r == '\n' {
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

func sourceUTF16LineColumn(source string, position int) (int, int) {
	line, column := 0, 0
	if position > len(source) {
		position = len(source)
	}
	for offset := 0; offset < position; {
		r, size := utf8.DecodeRuneInString(source[offset:])
		if r == '\n' {
			line++
			column = 0
		} else if r > 0xffff {
			column += 2
		} else {
			column++
		}
		offset += size
	}
	return line, column
}
