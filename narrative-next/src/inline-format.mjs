function pushToken(tokens, type, text) {
  if (text.length === 0) {
    return;
  }
  const previous = tokens.at(-1);
  if (type === 'text' && previous?.type === 'text') {
    previous.text += text;
    return;
  }
  tokens.push({ type, text });
}

function nestedMarkerRanges(source, inertRanges) {
  const runs = [];
  let rangeIndex = 0;
  for (let cursor = 0; cursor < source.length;) {
    while (inertRanges[rangeIndex] && cursor >= inertRanges[rangeIndex].end) {
      rangeIndex += 1;
    }
    const inertRange = inertRanges[rangeIndex];
    if (inertRange && cursor >= inertRange.start) {
      cursor = inertRange.end;
      continue;
    }
    if (source[cursor] !== '*') {
      cursor += 1;
      continue;
    }
    const start = cursor;
    while (source[cursor] === '*') {
      cursor += 1;
    }
    const length = cursor - start;
    if (length === 1 || length === 2) {
      runs.push({ start, end: cursor, length });
    }
  }

  const pending = new Map();
  const ranges = [];
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const openingIndex = pending.get(run.length);
    if (openingIndex === undefined) {
      pending.set(run.length, index);
      continue;
    }
    if (index > openingIndex + 1) {
      ranges.push({ start: runs[openingIndex].start, end: run.end });
    }
    pending.delete(run.length);
  }
  return ranges;
}

function quoteAwareMarkupEnd(source, start, bracketAware = false) {
  let end = start + 2;
  let quote = null;
  let bracketDepth = 0;
  let embeddedTerminator = null;
  while (end < source.length) {
    if (embeddedTerminator !== null) {
      if (source.startsWith(embeddedTerminator, end)) {
        end += embeddedTerminator.length;
        embeddedTerminator = null;
      } else {
        end += 1;
      }
      continue;
    }
    const character = source[end];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (bracketAware && bracketDepth > 0 && source.startsWith('<!--', end)) {
      embeddedTerminator = '-->';
      end += 4;
      continue;
    } else if (bracketAware
      && bracketDepth > 0
      && source.startsWith('<?', end)
      && /[A-Za-z]/u.test(source[end + 2] ?? '')) {
      embeddedTerminator = '?>';
      end += 2;
      continue;
    } else if (bracketAware && character === '[') {
      bracketDepth += 1;
    } else if (bracketAware && character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === '>' && bracketDepth === 0) {
      return end + 1;
    }
    end += 1;
  }
  return source.length;
}

function lexicalMarkupRanges(source) {
  const ranges = [];
  const openingsByName = new Map();
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) {
      break;
    }

    let end = null;
    if (source.startsWith('<!--', start)) {
      const closing = source.indexOf('-->', start + 4);
      end = closing === -1 ? source.length : closing + 3;
    } else if (source.startsWith('<![CDATA[', start)) {
      const closing = source.indexOf(']]>', start + 9);
      end = closing === -1 ? source.length : closing + 3;
    } else if (source.startsWith('<?', start) && /[A-Za-z]/u.test(source[start + 2] ?? '')) {
      const closing = source.indexOf('?>', start + 2);
      end = closing === -1 ? source.length : closing + 2;
    } else if (source.startsWith('<!', start) && /[A-Za-z]/u.test(source[start + 2] ?? '')) {
      end = quoteAwareMarkupEnd(source, start, true);
    }

    if (end !== null) {
      ranges.push({ start, end });
      cursor = end;
      continue;
    }

    const closing = source[start + 1] === '/';
    const nameStart = closing ? start + 2 : start + 1;
    if (!/[A-Za-z]/u.test(source[nameStart] ?? '')) {
      cursor = start + 1;
      continue;
    }
    let nameEnd = nameStart + 1;
    while (/[A-Za-z0-9_-]/u.test(source[nameEnd] ?? '')) {
      nameEnd += 1;
    }
    const boundary = source[nameEnd];
    const validBoundary = boundary === undefined
      || boundary === '>'
      || boundary === '/'
      || /[\t\r\n ]/u.test(boundary);
    if (!validBoundary) {
      cursor = start + 1;
      continue;
    }
    const name = source.slice(nameStart, nameEnd).toLowerCase();
    end = quoteAwareMarkupEnd(source, start);
    if (source[end - 1] === '>') {
      const tagEnd = end;
      ranges.push({ start, end: tagEnd });

      const tail = source.slice(nameEnd, end - 1);
      if (closing && validBoundary && tail.trim() === '') {
        const openings = openingsByName.get(name);
        const opening = openings?.pop() ?? null;
        if (opening) {
          ranges.push({ start: opening.start, end: tagEnd });
        }
      } else if (!closing && validBoundary && !tail.trimEnd().endsWith('/')) {
        const openings = openingsByName.get(name) ?? [];
        openings.push({ start });
        openingsByName.set(name, openings);
      }
      cursor = tagEnd;
    } else {
      ranges.push({ start, end });
      cursor = end;
    }
  }
  return ranges;
}

function lexicalCodeRanges(source) {
  const ranges = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('`', cursor);
    if (start === -1) {
      break;
    }
    let openingEnd = start + 1;
    while (source[openingEnd] === '`') {
      openingEnd += 1;
    }
    const marker = source.slice(start, openingEnd);
    const closing = source.indexOf(marker, openingEnd);
    const end = closing === -1 ? source.length : closing + marker.length;
    ranges.push({ start, end });
    cursor = end;
  }
  return ranges;
}

function lexicalMarkdownLinkRanges(source, ownedRanges) {
  const ranges = [];
  let cursor = 0;
  let ownedRangeIndex = 0;
  while (cursor < source.length) {
    let labelStart = source.indexOf('[', cursor);
    while (labelStart !== -1) {
      while (
        ownedRanges[ownedRangeIndex]
        && labelStart >= ownedRanges[ownedRangeIndex].end
      ) {
        ownedRangeIndex += 1;
      }
      const ownedRange = ownedRanges[ownedRangeIndex];
      if (!ownedRange || labelStart < ownedRange.start) {
        break;
      }
      cursor = ownedRange.end;
      labelStart = source.indexOf('[', cursor);
    }
    if (labelStart === -1) {
      break;
    }
    const rangeStart = labelStart > 0 && source[labelStart - 1] === '!'
      ? labelStart - 1
      : labelStart;
    let labelDepth = 1;
    let labelEnd = labelStart + 1;
    while (labelEnd < source.length && labelDepth > 0) {
      if (source[labelEnd] === '\\') {
        labelEnd += Math.min(2, source.length - labelEnd);
        continue;
      }
      if (source[labelEnd] === '[') {
        labelDepth += 1;
      } else if (source[labelEnd] === ']') {
        labelDepth -= 1;
      }
      labelEnd += 1;
    }
    if (labelDepth > 0) {
      ranges.push({ start: rangeStart, end: source.length });
      break;
    }
    const continuation = source[labelEnd];
    if (continuation !== '(' && continuation !== '[') {
      ranges.push({ start: rangeStart, end: labelEnd });
      cursor = labelEnd;
      continue;
    }

    const closing = continuation === '(' ? ')' : ']';
    let continuationDepth = 1;
    let continuationEnd = labelEnd + 1;
    while (continuationEnd < source.length && continuationDepth > 0) {
      if (source[continuationEnd] === '\\') {
        continuationEnd += Math.min(2, source.length - continuationEnd);
        continue;
      }
      if (source[continuationEnd] === continuation) {
        continuationDepth += 1;
      } else if (source[continuationEnd] === closing) {
        continuationDepth -= 1;
      }
      continuationEnd += 1;
    }
    if (continuationDepth > 0) {
      continuationEnd = source.length;
    }
    ranges.push({
      start: rangeStart,
      end: continuationEnd,
    });
    cursor = continuationEnd;
  }
  return ranges;
}

function lexicalUrlRanges(source) {
  const ranges = [];
  const schemeCharacter = /[A-Za-z0-9+.-]/u;
  const fixedIntroducers = ['www.', 'mailto:', 'javascript:', 'data:'];
  let cursor = 0;
  while (cursor < source.length) {
    if (cursor > 0 && /[A-Za-z0-9]/u.test(source[cursor - 1])) {
      cursor += 1;
      continue;
    }

    let introducerEnd = -1;
    for (const fixed of fixedIntroducers) {
      if (source.slice(cursor, cursor + fixed.length).toLowerCase() === fixed) {
        introducerEnd = cursor + fixed.length;
        break;
      }
    }

    if (introducerEnd === -1 && /[A-Za-z]/u.test(source[cursor])) {
      let schemeEnd = cursor;
      while (schemeCharacter.test(source[schemeEnd] ?? '')) {
        schemeEnd += 1;
      }
      if (source.startsWith('://', schemeEnd)) {
        introducerEnd = schemeEnd + 3;
      } else {
        cursor = Math.max(cursor + 1, schemeEnd);
        continue;
      }
    }
    if (introducerEnd === -1) {
      cursor += 1;
      continue;
    }

    let end = introducerEnd;
    while (end < source.length && !/[\s<>"'`]/u.test(source[end])) {
      end += 1;
    }
    ranges.push({ start: cursor, end });
    cursor = end;
  }
  return ranges;
}

function mergeRanges(ranges) {
  const merged = [];
  for (const range of ranges.sort((left, right) => left.start - right.start || left.end - right.end)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function starRunEnd(source, start) {
  let end = start;
  while (source[end] === '*') {
    end += 1;
  }
  return end;
}

function nextMarkerOutsideRanges(source, start, ranges, initialRangeIndex) {
  let rangeIndex = initialRangeIndex;
  let marker = source.indexOf('*', start);
  while (marker !== -1) {
    while (ranges[rangeIndex] && marker >= ranges[rangeIndex].end) {
      rangeIndex += 1;
    }
    const range = ranges[rangeIndex];
    if (!range || marker < range.start) {
      return marker;
    }
    marker = source.indexOf('*', range.end);
  }
  return -1;
}

export function tokenizeInlineText(source) {
  const input = typeof source === 'string' ? source : '';
  const tokens = [];
  const ownedLexicalRanges = mergeRanges([
    ...lexicalMarkupRanges(input),
    ...lexicalCodeRanges(input),
    ...lexicalUrlRanges(input),
  ]);
  const lexicalRanges = mergeRanges([
    ...ownedLexicalRanges,
    ...lexicalMarkdownLinkRanges(input, ownedLexicalRanges),
  ]);
  const inertRanges = mergeRanges([
    ...lexicalRanges,
    ...nestedMarkerRanges(input, lexicalRanges),
  ]);
  let rangeIndex = 0;
  let textStart = 0;
  let cursor = 0;

  while (cursor < input.length) {
    while (inertRanges[rangeIndex] && cursor >= inertRanges[rangeIndex].end) {
      rangeIndex += 1;
    }
    const inertRange = inertRanges[rangeIndex];
    if (inertRange && cursor >= inertRange.start) {
      cursor = inertRange.end;
      rangeIndex += 1;
      continue;
    }
    if (input[cursor] !== '*') {
      cursor += 1;
      continue;
    }

    const opening = cursor;
    const openingEnd = starRunEnd(input, opening);
    const markerLength = openingEnd - opening;
    if (markerLength !== 1 && markerLength !== 2) {
      cursor = openingEnd;
      continue;
    }

    const closing = nextMarkerOutsideRanges(input, openingEnd, inertRanges, rangeIndex);
    if (closing !== -1) {
      const closingEnd = starRunEnd(input, closing);
      const closingLength = closingEnd - closing;
      const crossesInertRange = inertRange && inertRange.start < closingEnd;
      if (closingLength === markerLength && closing > openingEnd) {
        cursor = closingEnd;
        if (!crossesInertRange) {
          pushToken(tokens, 'text', input.slice(textStart, opening));
          pushToken(tokens, markerLength === 2 ? 'strong' : 'em', input.slice(openingEnd, closing));
          textStart = cursor;
        }
        continue;
      }
    }
    cursor = openingEnd;
  }

  pushToken(tokens, 'text', input.slice(textStart));
  return tokens;
}
