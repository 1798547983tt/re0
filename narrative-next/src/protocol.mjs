import { matchesStoryHeading } from './titles.mjs';

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
});

function isSafeUnicodeScalar(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
    return false;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return false;
  }
  if ((codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint)) || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return false;
  }
  if (
    codePoint === 0x061c
    || (codePoint >= 0x200e && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
  ) {
    return false;
  }
  const lowWord = codePoint % 0x10000;
  if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || lowWord === 0xfffe || lowWord === 0xffff) {
    return false;
  }
  return true;
}

function decodeXmlEntities(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return source ?? '';
  }

  return source.replace(/&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9A-Fa-f]+);/gu, (entity) => {
    const body = entity.slice(1, -1);
    if (!body.startsWith('#')) {
      return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : entity;
    }

    const hexadecimal = body[1] === 'x' || body[1] === 'X';
    const digits = body.slice(hexadecimal ? 2 : 1);
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
    return isSafeUnicodeScalar(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function decodeXmlAttributeValue(source) {
  let value = '';
  let cursor = 0;
  while (cursor < source.length) {
    const ampersand = source.indexOf('&', cursor);
    if (ampersand === -1) {
      value += source.slice(cursor);
      break;
    }
    value += source.slice(cursor, ampersand);
    const semicolon = source.indexOf(';', ampersand + 1);
    if (semicolon === -1) {
      return { ok: false, value: '' };
    }
    const body = source.slice(ampersand + 1, semicolon);
    if (Object.hasOwn(NAMED_ENTITIES, body)) {
      value += NAMED_ENTITIES[body];
      cursor = semicolon + 1;
      continue;
    }

    const decimal = /^#[0-9]+$/u.test(body);
    const hexadecimal = /^#[xX][0-9A-Fa-f]+$/u.test(body);
    if (!decimal && !hexadecimal) {
      return { ok: false, value: '' };
    }
    const digits = body.slice(hexadecimal ? 2 : 1);
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
    if (!isSafeUnicodeScalar(codePoint)) {
      return { ok: false, value: '' };
    }
    value += String.fromCodePoint(codePoint);
    cursor = semicolon + 1;
  }
  return { ok: true, value };
}

const LIMITS = Object.freeze({
  SOURCE: 256 * 1024,
  ATTRIBUTE: 512,
  BLOCK_TEXT: 32 * 1024,
  BLOCKS: 512,
});

const ABILITY_KINDS = new Set(['一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技']);
const AFFINITY_ORDER = ['火', '水', '风', '土', '阴', '阳'];
const SUPPORTED_PLOT_CHILD_NAMES = new Set(['scene', 'ability', 'check', 'restart']);
const TIME_METADATA_VALUES = Object.freeze({
  period: new Set(['黎明', '清晨', '上午', '正午', '下午', '傍晚', '夜间', '深夜', '凌晨', '时段未详']),
  layer: new Set(['主线', '轮回分支', '历史回溯', '试炼幻境']),
  basis: new Set(['编辑演算', '历史估算']),
});

const DIAGNOSTIC_MESSAGES = Object.freeze({
  'attribute-too-long': 'An attribute exceeded the protocol limit.',
  'block-count-exceeded': 'The response exceeded the structured block limit.',
  'block-too-long': 'A text block exceeded the protocol limit.',
  'incomplete-update-variable': 'The trailing variable block is incomplete.',
  'invalid-content-attributes': 'The content attributes are invalid.',
  'invalid-now-plot-attributes': 'The now_plot attributes are invalid.',
  'invalid-root-structure': 'The required root structure is invalid.',
  'invalid-source': 'The source must be a string.',
  'invalid-story-attributes': 'The story attributes are invalid.',
  'invalid-story-content': 'The story heading is missing or does not match its volume.',
  'invalid-time-attributes': 'The time attributes are invalid.',
  'invalid-time-content': 'The time text is invalid.',
  'invalid-trailing-content': 'Unexpected content follows the content root.',
  'invalid-update-variable': 'The trailing variable block is invalid.',
  'invalid-update-variable-trailing-content': 'Unexpected content follows the trailing variable block.',
  'multiple-update-variable': 'More than one trailing variable block was found.',
  'source-too-long': 'The source exceeded the protocol limit.',
  'stream-incomplete-special': 'A structured block is still incomplete.',
  'unsupported-child': 'An unsupported child block was kept inert.',
});

function diagnostic(code) {
  return { code, message: DIAGNOSTIC_MESSAGES[code] ?? 'The protocol input is invalid.' };
}

function diagnostics(codes) {
  return [...new Set(codes)].map(diagnostic);
}

function isProtocolWhitespace(character) {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

function isWhitespaceOnly(source) {
  for (const character of source) {
    if (!isProtocolWhitespace(character)) {
      return false;
    }
  }
  return true;
}

function skipWhitespace(source, start) {
  let cursor = start;
  while (cursor < source.length && isProtocolWhitespace(source[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function containsAttributeControl(source) {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(source);
}

function containsUnsafeUnicodeScalar(source) {
  for (const character of source) {
    if (!isSafeUnicodeScalar(character.codePointAt(0))) {
      return true;
    }
  }
  return false;
}

function containsUnsafeTextControl(source) {
  return containsUnsafeUnicodeScalar(source);
}

function lineBreakEnd(source, start) {
  if (source[start] === '\n') {
    return start + 1;
  }
  if (source[start] === '\r') {
    return source[start + 1] === '\n' ? start + 2 : start + 1;
  }
  return -1;
}

function blankLineBoundaryEnd(source, start) {
  let style;
  let cursor;
  if (source[start] === '\n') {
    style = 'lf';
    cursor = start + 1;
  } else if (source[start] === '\r' && source[start + 1] === '\n') {
    style = 'crlf';
    cursor = start + 2;
  } else if (source[start] === '\r') {
    style = 'cr';
    cursor = start + 1;
  } else {
    return -1;
  }
  while (source[cursor] === ' ' || source[cursor] === '\t') {
    cursor += 1;
  }
  if (style === 'lf') {
    return source[cursor] === '\n' ? cursor + 1 : -1;
  }
  if (style === 'cr') {
    return source[cursor] === '\r' ? cursor + 1 : -1;
  }
  return source[cursor] === '\r' && source[cursor + 1] === '\n' ? cursor + 2 : -1;
}

function firstBlankLineBoundary(source, start) {
  for (let cursor = start; cursor < source.length; cursor += 1) {
    if (source[cursor] !== '\r' && source[cursor] !== '\n') {
      continue;
    }
    const boundaryEnd = blankLineBoundaryEnd(source, cursor);
    if (boundaryEnd !== -1) {
      return { start: cursor, end: boundaryEnd };
    }
    cursor = lineBreakEnd(source, cursor) - 1;
  }
  return null;
}

const STRUCTURAL_TAG_LIMIT = LIMITS.BLOCKS * 8 + 64;
const STRUCTURAL_TAG_TAIL_LIMIT = 64;
const UPDATE_VARIABLE_OPENING = '<UpdateVariable>';
const UPDATE_VARIABLE_CLOSING = '</UpdateVariable>';

function isPartialUpdateVariableOpening(source, start) {
  if (source.length - start >= UPDATE_VARIABLE_OPENING.length) {
    return false;
  }
  const suffix = source.slice(start);
  return suffix.length > 0 && UPDATE_VARIABLE_OPENING.startsWith(suffix);
}

function readInertMarkupEnd(source, start) {
  let prefixLength;
  let terminator;
  let quoteAware = false;
  let bracketAware = false;
  if (source.startsWith('<!--', start)) {
    prefixLength = 4;
    terminator = '-->';
  } else if (source.startsWith('<![CDATA[', start)) {
    prefixLength = 9;
    terminator = ']]>';
  } else if (source.startsWith('<?', start) && /[A-Za-z]/u.test(source[start + 2] ?? '')) {
    prefixLength = 2;
    terminator = '?>';
  } else if (source.startsWith('<!', start) && /[A-Za-z]/u.test(source[start + 2] ?? '')) {
    prefixLength = 2;
    terminator = '>';
    quoteAware = true;
    bracketAware = true;
  } else {
    return null;
  }

  let quote = null;
  let bracketDepth = 0;
  let embeddedTerminator = null;
  for (let cursor = start + prefixLength; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\r' || source[cursor] === '\n') {
      const boundaryEnd = blankLineBoundaryEnd(source, cursor);
      if (boundaryEnd !== -1) {
        return {
          state: 'recoverable-malformed',
          end: boundaryEnd,
          tag: {
            kind: 'open',
            name: '#inert',
            start,
            end: boundaryEnd,
            raw: source.slice(start, boundaryEnd),
            rawAttributes: '',
            selfClosing: false,
            malformed: true,
            recoveryBoundaryFound: true,
            recoveryStart: cursor,
          },
        };
      }
    }
    if (embeddedTerminator !== null) {
      if (source.startsWith(embeddedTerminator, cursor)) {
        cursor += embeddedTerminator.length - 1;
        embeddedTerminator = null;
      }
      continue;
    }
    const character = source[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (quoteAware && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }
    if (bracketAware && bracketDepth > 0 && source.startsWith('<!--', cursor)) {
      embeddedTerminator = '-->';
      cursor += 3;
      continue;
    }
    if (bracketAware
      && bracketDepth > 0
      && source.startsWith('<?', cursor)
      && /[A-Za-z]/u.test(source[cursor + 2] ?? '')) {
      embeddedTerminator = '?>';
      cursor += 1;
      continue;
    }
    if (bracketAware && character === '[') {
      bracketDepth += 1;
      continue;
    }
    if (bracketAware && character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0) {
      continue;
    }
    if (source.startsWith(terminator, cursor)) {
      return { state: 'complete', end: cursor + terminator.length };
    }
  }
  return { state: 'open-incomplete', end: source.length };
}

function readStructuralTag(source, start) {
  if (source[start] !== '<') {
    return null;
  }
  const closing = source[start + 1] === '/';
  const nameStart = start + (closing ? 2 : 1);
  const namePattern = /[A-Za-z][A-Za-z0-9_-]*/uy;
  namePattern.lastIndex = nameStart;
  const nameMatch = namePattern.exec(source);
  if (!nameMatch) {
    return null;
  }

  const name = nameMatch[0];
  const nameEnd = nameStart + name.length;
  const boundary = source[nameEnd];
  if (closing) {
    if (boundary !== '>') {
      return null;
    }
    return {
      kind: 'close',
      name,
      start,
      end: nameEnd + 1,
      raw: source.slice(start, nameEnd + 1),
      malformed: false,
      selfClosing: false,
    };
  }
  if (boundary !== '>' && boundary !== '/' && !isProtocolWhitespace(boundary)) {
    return null;
  }

  let quote = null;
  let close = -1;
  let malformedEnd = source.length;
  let recoveryStart = -1;
  let recoveryBoundaryFound = false;
  for (let cursor = nameEnd; cursor < source.length; cursor += 1) {
    const boundaryEnd = (source[cursor] === '\r' || source[cursor] === '\n')
      ? blankLineBoundaryEnd(source, cursor)
      : -1;
    if (boundaryEnd !== -1) {
      recoveryStart = cursor;
      malformedEnd = boundaryEnd;
      recoveryBoundaryFound = true;
      break;
    }
    const character = source[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '<') {
      malformedEnd = cursor;
      recoveryStart = cursor;
      recoveryBoundaryFound = true;
      break;
    } else if (character === '>') {
      close = cursor;
      break;
    }
  }

  if (close === -1 || quote !== null) {
    return {
      kind: 'open',
      name,
      start,
      end: malformedEnd,
      raw: source.slice(start, malformedEnd),
      rawAttributes: source.slice(nameEnd, malformedEnd),
      selfClosing: false,
      malformed: true,
      recoveryBoundaryFound,
      recoveryStart,
    };
  }

  let attributeEnd = close;
  let marker = close - 1;
  while (marker >= nameEnd && isProtocolWhitespace(source[marker])) {
    marker -= 1;
  }
  const selfClosing = source[marker] === '/';
  if (selfClosing) {
    attributeEnd = marker;
  }

  return {
    kind: 'open',
    name,
    start,
    end: close + 1,
    raw: source.slice(start, close + 1),
    rawAttributes: source.slice(nameEnd, attributeEnd),
    selfClosing,
    malformed: false,
    recoveryBoundaryFound: false,
  };
}

function lowerBoundByStart(items, position) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].start < position) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function indexMatchingCloses(tagGroups) {
  const matchingCloses = new Map();
  const matchingOpenings = new Map();
  for (const tags of tagGroups) {
    const openingsByName = new Map();
    for (const tag of tags) {
      if (tag.malformed) {
        continue;
      }
      if (tag.kind === 'open' && !tag.selfClosing) {
        const openings = openingsByName.get(tag.name) ?? [];
        openings.push(tag);
        openingsByName.set(tag.name, openings);
        continue;
      }
      if (tag.kind !== 'close') {
        continue;
      }
      const openings = openingsByName.get(tag.name);
      const opening = openings?.pop() ?? null;
      if (opening) {
        matchingCloses.set(opening, tag);
        matchingOpenings.set(tag, opening);
      }
    }
  }
  return { matchingCloses, matchingOpenings };
}

function scanStructure(source) {
  const headTags = [];
  const tailTags = [];
  const boundaries = [];
  const completedInertRanges = [];
  const lexicalOpeningStarts = new Map();
  let overflowStart = -1;
  let overflowTagCount = 0;
  let tailWriteIndex = 0;
  let opaqueUpdateVariableStart = -1;
  let nextUpdateVariableCloseStart = source.indexOf(UPDATE_VARIABLE_CLOSING);
  // Only a non-revoked lexical root candidate may make the immediate suffix opaque.
  // Revocation restores its lightweight opening offsets before the current byte is scanned.
  let pendingTerminalPlotOpeningStart;
  let terminalRootCandidate = null;
  let terminalEnd = source.length;
  while (terminalEnd > 0 && isProtocolWhitespace(source[terminalEnd - 1])) {
    terminalEnd -= 1;
  }
  let cursor = 0;

  function firstUpdateVariableCloseStart(start) {
    while (nextUpdateVariableCloseStart !== -1 && nextUpdateVariableCloseStart < start) {
      nextUpdateVariableCloseStart = source.indexOf(
        UPDATE_VARIABLE_CLOSING,
        nextUpdateVariableCloseStart + UPDATE_VARIABLE_CLOSING.length,
      );
    }
    return nextUpdateVariableCloseStart;
  }

  function restoreLexicalOpening(name, openingStart) {
    if (openingStart === undefined) {
      return;
    }
    const openings = lexicalOpeningStarts.get(name) ?? [];
    openings.push(openingStart);
    lexicalOpeningStarts.set(name, openings);
  }

  function revokeTerminalRootCandidate() {
    if (!terminalRootCandidate) {
      return;
    }
    restoreLexicalOpening('content', terminalRootCandidate.contentOpeningStart);
    restoreLexicalOpening('now_plot', terminalRootCandidate.plotOpeningStart);
    terminalRootCandidate = null;
    pendingTerminalPlotOpeningStart = undefined;
  }

  while (cursor < source.length) {
    if (source[cursor] === '\r' || source[cursor] === '\n') {
      const boundaryEnd = blankLineBoundaryEnd(source, cursor);
      if (boundaryEnd !== -1) {
        boundaries.push({ start: cursor, end: boundaryEnd });
        cursor = boundaryEnd;
        continue;
      }
    }
    if (source[cursor] !== '<') {
      if (terminalRootCandidate && !isProtocolWhitespace(source[cursor])) {
        revokeTerminalRootCandidate();
      }
      cursor += 1;
      continue;
    }

    const completeUpdateVariableOpening = source.startsWith(UPDATE_VARIABLE_OPENING, cursor);
    const opaqueLocalCloseStart = completeUpdateVariableOpening
      ? firstUpdateVariableCloseStart(cursor + UPDATE_VARIABLE_OPENING.length)
      : -1;
    if (terminalRootCandidate) {
      if (completeUpdateVariableOpening) {
        const opaqueUpdateVariableEnd = opaqueLocalCloseStart === -1
          ? source.length
          : opaqueLocalCloseStart + UPDATE_VARIABLE_CLOSING.length;
        if (opaqueLocalCloseStart === -1 || opaqueUpdateVariableEnd === terminalEnd) {
          opaqueUpdateVariableStart = cursor;
          cursor = opaqueUpdateVariableEnd;
          continue;
        }
      } else if (isPartialUpdateVariableOpening(source, cursor)) {
        opaqueUpdateVariableStart = cursor;
        cursor = source.length;
        continue;
      }
      revokeTerminalRootCandidate();
    }

    const inert = readInertMarkupEnd(source, cursor);
    if (inert?.state === 'complete') {
      completedInertRanges.push({ start: cursor, end: inert.end });
    }
    if (inert && inert.state !== 'recoverable-malformed') {
      cursor = inert.end;
      continue;
    }
    const tag = inert?.tag ?? readStructuralTag(source, cursor);
    if (!tag) {
      cursor += 1;
      continue;
    }
    if (
      !tag.malformed
      && tag.kind === 'open'
      && tag.selfClosing
      && tag.name === 'content'
      && (lexicalOpeningStarts.get('content')?.length ?? 0) === 0
      && (lexicalOpeningStarts.get('now_plot')?.length ?? 0) === 0
    ) {
      terminalRootCandidate = {
        contentOpeningStart: undefined,
        plotOpeningStart: undefined,
      };
    } else if (!tag.malformed && tag.kind === 'open' && !tag.selfClosing) {
      const openings = lexicalOpeningStarts.get(tag.name) ?? [];
      openings.push(tag.start);
      lexicalOpeningStarts.set(tag.name, openings);
    } else if (!tag.malformed && tag.kind === 'close') {
      const openings = lexicalOpeningStarts.get(tag.name);
      const outerContentStillOwnsPlot = tag.name === 'content'
        && openings?.length === 1
        && (lexicalOpeningStarts.get('now_plot')?.length ?? 0) > 0;
      const openingStart = outerContentStillOwnsPlot ? undefined : openings?.pop();
      if (openingStart !== undefined) {
        tag.lexicalOpeningStart = openingStart;
      }
      if (
        tag.name === 'now_plot'
        && openingStart !== undefined
        && openings.length === 0
      ) {
        pendingTerminalPlotOpeningStart = openingStart;
      }
      if (
        tag.name === 'content'
        && openingStart !== undefined
        && openings.length === 0
      ) {
        terminalRootCandidate = {
          contentOpeningStart: openingStart,
          plotOpeningStart: (lexicalOpeningStarts.get('now_plot')?.length ?? 0) === 0
            ? pendingTerminalPlotOpeningStart
            : undefined,
        };
        pendingTerminalPlotOpeningStart = undefined;
      }
    }
    if (headTags.length < STRUCTURAL_TAG_LIMIT) {
      headTags.push(tag);
    } else {
      if (overflowStart === -1) {
        overflowStart = tag.start;
      }
      overflowTagCount += 1;
      if (tailTags.length < STRUCTURAL_TAG_TAIL_LIMIT) {
        tailTags.push(tag);
      } else {
        tailTags[tailWriteIndex] = tag;
        tailWriteIndex = (tailWriteIndex + 1) % STRUCTURAL_TAG_TAIL_LIMIT;
      }
    }
    if (tag.recoveryBoundaryFound && tag.recoveryStart < tag.end) {
      boundaries.push({ start: tag.recoveryStart, end: tag.end });
    }
    if (completeUpdateVariableOpening) {
      tag.opaqueUpdateVariableCloseStart = opaqueLocalCloseStart;
    }
    if (opaqueLocalCloseStart !== -1) {
      cursor = opaqueLocalCloseStart;
    } else if (completeUpdateVariableOpening) {
      const recoveryBoundary = firstBlankLineBoundary(source, tag.end);
      if (recoveryBoundary) {
        boundaries.push(recoveryBoundary);
      }
      cursor = recoveryBoundary?.end ?? source.length;
    } else {
      cursor = Math.max(tag.end, cursor + 1);
    }
  }

  const orderedTailTags = overflowTagCount <= STRUCTURAL_TAG_TAIL_LIMIT
    ? tailTags
    : [...tailTags.slice(tailWriteIndex), ...tailTags.slice(0, tailWriteIndex)];
  const tags = [...headTags, ...orderedTailTags];
  const tagByStart = new Map();
  const closingTagsByName = new Map();
  const incompleteOpaqueUpdateVariables = [];
  const attemptedDialogueContentStarts = new Map();
  const attemptedDialogueClosingOwners = new Map();
  const attemptedDialogueRanges = new Map();
  for (const tag of tags) {
    tagByStart.set(tag.start, tag);
    if (tag.opaqueUpdateVariableCloseStart === -1) {
      incompleteOpaqueUpdateVariables.push(tag);
    }
    if (tag.kind !== 'close') {
      continue;
    }
    const closingTags = closingTagsByName.get(tag.name) ?? [];
    closingTags.push(tag);
    closingTagsByName.set(tag.name, closingTags);
  }
  const { matchingCloses } = indexMatchingCloses(
    overflowTagCount > STRUCTURAL_TAG_TAIL_LIMIT ? [headTags, orderedTailTags] : [tags],
  );

  function tagAt(start, kind = null, name = null) {
    const tag = tagByStart.get(start) ?? null;
    if (!tag || (kind && tag.kind !== kind) || (name && tag.name !== name)) {
      return null;
    }
    return tag;
  }

  function nextTag(start, end) {
    const tag = tags[lowerBoundByStart(tags, start)] ?? null;
    return tag && tag.start < end ? tag : null;
  }

  function previousTag(end) {
    const tag = tags[lowerBoundByStart(tags, end) - 1] ?? null;
    return tag && tag.end <= end ? tag : null;
  }

  function nextClosingTag(name, start, end) {
    const closingTags = closingTagsByName.get(name) ?? [];
    const tag = closingTags[lowerBoundByStart(closingTags, start)] ?? null;
    return tag && tag.start < end ? tag : null;
  }

  function nextIncompleteOpaqueUpdateVariable(start, end) {
    const tag = incompleteOpaqueUpdateVariables[
      lowerBoundByStart(incompleteOpaqueUpdateVariables, start)
    ] ?? null;
    return tag && tag.start < end ? tag : null;
  }

  function nextCompletedInert(start, end) {
    const range = completedInertRanges[lowerBoundByStart(completedInertRanges, start)] ?? null;
    return range && range.start < end ? range : null;
  }

  function matchingClose(opening, end) {
    const closing = matchingCloses.get(opening) ?? null;
    return closing && closing.start < end ? closing : null;
  }

  function firstBoundary(start, end) {
    const index = lowerBoundByStart(boundaries, start);
    const boundary = boundaries[index] ?? null;
    return boundary && boundary.start < end ? boundary : null;
  }

  function lastBoundaryEnd(start, end) {
    let index = lowerBoundByStart(boundaries, end) - 1;
    while (index >= 0) {
      const boundary = boundaries[index];
      if (boundary.start < start) {
        return -1;
      }
      return boundary.end;
    }
    return -1;
  }

  function terminalRootPair(end, contentOpening, plotOpening) {
    if (overflowStart === -1) {
      return null;
    }
    for (let index = orderedTailTags.length - 1; index > 0; index -= 1) {
      const contentClose = orderedTailTags[index];
      const plotClose = orderedTailTags[index - 1];
      if (
        contentClose.kind === 'close'
        && contentClose.name === 'content'
        && contentClose.end <= end
        && plotClose.kind === 'close'
        && plotClose.name === 'now_plot'
        && isWhitespaceOnly(source.slice(plotClose.end, contentClose.start))
        && canFollowRecoveredRoot(source, contentClose.end)
        && (
          contentClose.lexicalOpeningStart === undefined
          || contentClose.lexicalOpeningStart === contentOpening.start
        )
        && (
          plotClose.lexicalOpeningStart === undefined
          || plotClose.lexicalOpeningStart === plotOpening.start
        )
      ) {
        return { plotClose, contentClose };
      }
    }
    return null;
  }

  return {
    source,
    tags,
    overflowStart,
    opaqueUpdateVariableStart,
    tagAt,
    nextTag,
    previousTag,
    nextClosingTag,
    nextIncompleteOpaqueUpdateVariable,
    nextCompletedInert,
    matchingClose,
    firstBoundary,
    lastBoundaryEnd,
    terminalRootPair,
    attemptedDialogueContentStarts,
    attemptedDialogueClosingOwners,
    attemptedDialogueRanges,
  };
}

function parseAttributes(opening, allowedNames, requiredNames = []) {
  if (!opening || opening.malformed) {
    return { ok: false, code: 'malformed-attributes', values: Object.create(null) };
  }

  const allowed = new Set(allowedNames);
  const values = Object.create(null);
  const source = opening.rawAttributes;
  let cursor = 0;

  while (cursor < source.length) {
    if (!isProtocolWhitespace(source[cursor])) {
      return { ok: false, code: 'malformed-attributes', values };
    }
    cursor = skipWhitespace(source, cursor);
    if (cursor === source.length) {
      break;
    }

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/u.exec(source.slice(cursor));
    if (!nameMatch) {
      return { ok: false, code: 'malformed-attributes', values };
    }
    const name = nameMatch[0];
    cursor += name.length;
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] !== '=') {
      return { ok: false, code: 'malformed-attributes', values };
    }
    cursor += 1;
    cursor = skipWhitespace(source, cursor);

    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") {
      return { ok: false, code: 'malformed-attributes', values };
    }
    cursor += 1;
    const closingQuote = source.indexOf(quote, cursor);
    if (closingQuote === -1) {
      return { ok: false, code: 'malformed-attributes', values };
    }
    const rawValue = source.slice(cursor, closingQuote);
    cursor = closingQuote + 1;

    if (!allowed.has(name) || Object.hasOwn(values, name)) {
      return { ok: false, code: 'invalid-attribute-name', values };
    }
    if (rawValue.length > LIMITS.ATTRIBUTE) {
      return { ok: false, code: 'attribute-too-long', values };
    }
    const decoded = decodeXmlAttributeValue(rawValue);
    if (!decoded.ok) {
      return { ok: false, code: 'invalid-attribute-entity', values };
    }
    const { value } = decoded;
    if (value.length > LIMITS.ATTRIBUTE) {
      return { ok: false, code: 'attribute-too-long', values };
    }
    if (
      rawValue.includes('<')
      || containsAttributeControl(rawValue)
      || containsAttributeControl(value)
      || containsUnsafeUnicodeScalar(rawValue)
      || containsUnsafeUnicodeScalar(value)
    ) {
      return { ok: false, code: 'invalid-attribute-control', values };
    }
    values[name] = value;
  }

  for (const required of requiredNames) {
    if (!Object.hasOwn(values, required)) {
      return { ok: false, code: 'missing-attribute', values };
    }
  }
  return { ok: true, code: null, values };
}

function attributeErrorCodes(primaryCode, result) {
  return result.code === 'attribute-too-long' ? [primaryCode, 'attribute-too-long'] : [primaryCode];
}

function emptyResult(errorCodes, updateVariable = null) {
  return {
    ok: false,
    protocol: 'current',
    player: null,
    story: { volume: null, heading: null },
    time: { period: null, layer: null, basis: null, text: null },
    blocks: [],
    updateVariable,
    errors: diagnostics(errorCodes),
  };
}

function splitUpdateVariableFromScan(source, scanner, root = parseRootContext(scanner)) {
  const opening = UPDATE_VARIABLE_OPENING;
  const closing = UPDATE_VARIABLE_CLOSING;
  const contentEnd = root.contentEnd;
  if (contentEnd === -1) {
    return { ok: true, content: source, separator: '', updateVariable: null, errors: [] };
  }
  const first = skipWhitespace(source, contentEnd);
  const suffix = source.slice(first);
  if (suffix.length > 0 && suffix.length < opening.length && opening.startsWith(suffix)) {
    return { ok: false, content: null, separator: '', updateVariable: null, errors: diagnostics(['incomplete-update-variable']) };
  }
  if (!source.startsWith(opening, first)) {
    return { ok: true, content: source, separator: '', updateVariable: null, errors: [] };
  }

  const closeStart = source.indexOf(closing, first + opening.length);
  if (closeStart === -1) {
    return { ok: false, content: null, separator: '', updateVariable: null, errors: diagnostics(['incomplete-update-variable']) };
  }
  const end = closeStart + closing.length;
  if (source.indexOf(opening, end) !== -1) {
    return { ok: false, content: null, separator: '', updateVariable: null, errors: diagnostics(['multiple-update-variable']) };
  }
  if (!isWhitespaceOnly(source.slice(end))) {
    return {
      ok: false,
      content: null,
      separator: '',
      updateVariable: null,
      errors: diagnostics(['invalid-update-variable-trailing-content']),
    };
  }

  let separatorStart = first;
  while (separatorStart > 0 && isProtocolWhitespace(source[separatorStart - 1])) {
    separatorStart -= 1;
  }
  return {
    ok: true,
    content: source.slice(0, separatorStart),
    separator: source.slice(separatorStart, first),
    updateVariable: source.slice(first),
    errors: [],
  };
}

export function splitUpdateVariable(source) {
  if (typeof source !== 'string') {
    return { ok: false, content: null, separator: '', updateVariable: null, errors: diagnostics(['invalid-source']) };
  }
  if (source.length > LIMITS.SOURCE) {
    return { ok: false, content: null, separator: '', updateVariable: null, errors: diagnostics(['source-too-long']) };
  }
  const { scanner, root } = scanOwnedStructure(source);
  return splitUpdateVariableFromScan(source, scanner, root);
}

function parseHeaderPrefix(scanner, end = scanner.source.length) {
  const { source } = scanner;
  const content = scanner.tagAt(0, 'open', 'content');
  if (!content || content.name !== 'content' || content.selfClosing) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const contentAttributes = parseAttributes(content, ['player']);
  if (!contentAttributes.ok) {
    return { ok: false, errors: attributeErrorCodes('invalid-content-attributes', contentAttributes) };
  }

  let cursor = skipWhitespace(source, content.end);
  const story = scanner.tagAt(cursor, 'open', 'story');
  if (!story || story.name !== 'story' || story.selfClosing) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const storyAttributes = parseAttributes(story, ['volume'], ['volume']);
  if (!storyAttributes.ok || !/^(?:0[1-9]|[12][0-9]|3[0-9])$/u.test(storyAttributes.values.volume ?? '')) {
    return { ok: false, errors: attributeErrorCodes('invalid-story-attributes', storyAttributes) };
  }
  const storyClose = scanner.matchingClose(story, end);
  if (!storyClose || storyClose.end > end) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const rawStoryHeading = source.slice(story.end, storyClose.start).trim();
  const storyHeading = decodeXmlEntities(rawStoryHeading);
  if (
    !rawStoryHeading
    || rawStoryHeading.includes('<')
    || rawStoryHeading.length > LIMITS.ATTRIBUTE
    || containsUnsafeTextControl(rawStoryHeading)
    || !matchesStoryHeading(storyAttributes.values.volume, storyHeading)
  ) {
    const codes = rawStoryHeading.length > LIMITS.ATTRIBUTE
      ? ['invalid-story-content', 'attribute-too-long']
      : ['invalid-story-content'];
    return { ok: false, errors: codes };
  }

  cursor = skipWhitespace(source, storyClose.end);
  const time = scanner.tagAt(cursor, 'open', 'time');
  if (!time || time.name !== 'time' || time.selfClosing) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const timeAttributes = parseAttributes(time, ['period', 'layer', 'basis'], ['period', 'layer', 'basis']);
  const normalizedTime = timeAttributes.ok
    ? requiredTrimmedAttributes(timeAttributes.values, ['period', 'layer', 'basis'])
    : null;
  if (
    !timeAttributes.ok
    || !normalizedTime
    || Object.entries(TIME_METADATA_VALUES).some(([name, values]) => !values.has(normalizedTime[name]))
  ) {
    return { ok: false, errors: attributeErrorCodes('invalid-time-attributes', timeAttributes) };
  }
  const timeClose = scanner.matchingClose(time, end);
  if (!timeClose) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const rawTimeText = source.slice(time.end, timeClose.start).trim();
  if (!rawTimeText || rawTimeText.includes('<') || rawTimeText.length > LIMITS.BLOCK_TEXT || containsUnsafeTextControl(rawTimeText)) {
    const codes = rawTimeText.length > LIMITS.BLOCK_TEXT ? ['invalid-time-content', 'block-too-long'] : ['invalid-time-content'];
    return { ok: false, errors: codes };
  }
  const timeText = decodeXmlEntities(rawTimeText);
  if (!/^魔女历[0-9]{4}年(?:0[1-9]|1[0-2])月(?:0[1-9]|[12][0-9]|30)日$/u.test(timeText)) {
    return { ok: false, errors: ['invalid-time-content'] };
  }

  cursor = skipWhitespace(source, timeClose.end);
  const nowPlot = scanner.tagAt(cursor, 'open', 'now_plot');
  if (!nowPlot || nowPlot.name !== 'now_plot' || nowPlot.selfClosing) {
    return { ok: false, errors: ['invalid-root-structure'] };
  }
  const nowPlotAttributes = parseAttributes(nowPlot, []);
  if (!nowPlotAttributes.ok) {
    return { ok: false, errors: attributeErrorCodes('invalid-now-plot-attributes', nowPlotAttributes) };
  }

  return {
    ok: true,
    cursor: nowPlot.end,
    nowPlot,
    player: (contentAttributes.values.player ?? '').trim() || null,
    story: { volume: storyAttributes.values.volume, heading: storyHeading },
    time: {
      period: normalizedTime.period,
      layer: normalizedTime.layer,
      basis: normalizedTime.basis,
      text: timeText,
    },
  };
}

function emptyRootContext() {
  return {
    contentOpening: null,
    contentClose: null,
    contentEnd: -1,
    nowPlotOpening: null,
    nowPlotClose: null,
  };
}

function parseRootContextFromOpening(scanner, content, end = scanner.source.length) {
  const { source } = scanner;
  const root = emptyRootContext();
  if (!content || content.end > end) {
    return root;
  }
  root.contentOpening = content;
  if (content.malformed) {
    return root;
  }
  if (content.selfClosing) {
    root.contentClose = content;
    root.contentEnd = content.end;
    return root;
  }

  let cursor = skipWhitespace(source, content.end);
  const story = scanner.tagAt(cursor, 'open', 'story');
  if (!story || story.malformed || story.end > end) {
    return recoverRootContext(scanner, root, content.end, end);
  }
  if (story.selfClosing) {
    cursor = story.end;
  } else {
    const storyClose = scanner.matchingClose(story, end);
    if (!storyClose || storyClose.end > end) {
      return recoverRootContext(scanner, root, content.end, end);
    }
    cursor = storyClose.end;
  }

  cursor = skipWhitespace(source, cursor);
  const time = scanner.tagAt(cursor, 'open', 'time');
  if (!time || time.malformed || time.end > end) {
    return recoverRootContext(scanner, root, content.end, end);
  }
  if (time.selfClosing) {
    cursor = time.end;
  } else {
    const timeClose = scanner.matchingClose(time, end);
    if (!timeClose) {
      return recoverRootContext(scanner, root, content.end, end);
    }
    cursor = timeClose.end;
  }

  cursor = skipWhitespace(source, cursor);
  const contentCloseWithoutPlot = scanner.tagAt(cursor, 'close', 'content');
  if (contentCloseWithoutPlot && contentCloseWithoutPlot.end <= end) {
    root.contentClose = contentCloseWithoutPlot;
    root.contentEnd = contentCloseWithoutPlot.end;
    return root;
  }

  const nowPlot = scanner.tagAt(cursor, 'open', 'now_plot');
  if (!nowPlot || nowPlot.malformed || nowPlot.end > end) {
    return recoverRootContext(scanner, root, content.end, end);
  }
  root.nowPlotOpening = nowPlot;
  if (nowPlot.selfClosing) {
    cursor = skipWhitespace(source, nowPlot.end);
  } else {
    const nowPlotClose = findTopLevelPlotClose(scanner, nowPlot.end, end, content, nowPlot);
    if (!nowPlotClose) {
      const terminalPair = scanner.terminalRootPair(end, content, nowPlot);
      if (terminalPair && terminalPair.plotClose.start >= nowPlot.end) {
        root.nowPlotClose = terminalPair.plotClose;
        root.contentClose = terminalPair.contentClose;
        root.contentEnd = terminalPair.contentClose.end;
        return root;
      }
      const contentClose = findContentCloseAfterCompletedPlotElement(scanner, nowPlot.end, end);
      if (contentClose) {
        root.contentClose = contentClose;
        root.contentEnd = contentClose.end;
      }
      return root;
    }
    root.nowPlotClose = nowPlotClose;
    cursor = skipWhitespace(source, nowPlotClose.end);
  }

  const contentClose = scanner.tagAt(cursor, 'close', 'content')
    ?? findTopLevelContentClose(scanner, cursor, end);
  if (contentClose && contentClose.end <= end) {
    root.contentClose = contentClose;
    root.contentEnd = contentClose.end;
  }
  return root;
}

function canFollowRecoveredRoot(source, contentEnd) {
  const suffixStart = skipWhitespace(source, contentEnd);
  const suffix = source.slice(suffixStart);
  return suffix.length === 0
    || source.startsWith('<UpdateVariable', suffixStart)
    || UPDATE_VARIABLE_OPENING.startsWith(suffix);
}

function recoverClosedRootAfterLeadingText(scanner, end) {
  const { source } = scanner;
  let segmentStart = 0;
  let cursor = 0;

  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return null;
    }

    const attemptedDialogue = attemptedDialogueRange(scanner, segmentStart, tag.start, end);
    if (attemptedDialogue) {
      segmentStart = attemptedDialogue.paragraphEnd;
      cursor = attemptedDialogue.paragraphEnd;
      continue;
    }

    if (tag.kind !== 'open') {
      cursor = tag.end;
      continue;
    }
    if (tag.name === 'content' && !tag.malformed) {
      const structuralClose = tag.selfClosing ? tag : scanner.matchingClose(tag, end);
      if (
        (structuralClose && canFollowRecoveredRoot(source, structuralClose.end))
        || (!structuralClose && scanner.overflowStart !== -1)
      ) {
        const root = parseRootContextFromOpening(scanner, tag, end);
        if (root.contentEnd !== -1 && canFollowRecoveredRoot(source, root.contentEnd)) {
          return root;
        }
      }
    }

    const extent = elementExtent(scanner, tag, end);
    if (!extent.complete && !extent.recoveryBoundaryFound) {
      return null;
    }
    segmentStart = extent.end;
    cursor = extent.end;
  }
  return null;
}

function parseRootContext(scanner, end = scanner.source.length) {
  const content = scanner.tagAt(0, 'open', 'content');
  if (content) {
    return parseRootContextFromOpening(scanner, content, end);
  }
  return recoverClosedRootAfterLeadingText(scanner, end) ?? emptyRootContext();
}

function scanOwnedStructure(source) {
  const scanner = scanStructure(source);
  return { scanner, root: parseRootContext(scanner) };
}

function recoverRootContext(scanner, root, start, end) {
  const { source } = scanner;
  let cursor = start;

  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return root;
    }
    if (tag.kind === 'close' && tag.name === 'content') {
      root.contentClose = tag;
      root.contentEnd = tag.end;
      return root;
    }
    if (tag.kind !== 'open') {
      cursor = tag.end;
      continue;
    }
    if (tag.name === 'now_plot' && !tag.malformed) {
      root.nowPlotOpening = tag;
      if (tag.selfClosing) {
        cursor = skipWhitespace(source, tag.end);
      } else {
        const nowPlotClose = findTopLevelPlotClose(scanner, tag.end, end, root.contentOpening, tag);
        if (!nowPlotClose) {
          const contentClose = findContentCloseAfterCompletedPlotElement(scanner, tag.end, end);
          if (contentClose) {
            root.contentClose = contentClose;
            root.contentEnd = contentClose.end;
          }
          return root;
        }
        root.nowPlotClose = nowPlotClose;
        cursor = skipWhitespace(source, nowPlotClose.end);
      }
      const contentClose = scanner.tagAt(cursor, 'close', 'content')
        ?? findTopLevelContentClose(scanner, cursor, end);
      if (contentClose && contentClose.end <= end) {
        root.contentClose = contentClose;
        root.contentEnd = contentClose.end;
      }
      return root;
    }

    const extent = elementExtent(scanner, tag, end);
    cursor = extent.complete || extent.recoveryBoundaryFound
      ? extent.end
      : Math.max(tag.end, cursor + 1);
  }
  return root;
}

function truncateScalarPrefix(source, limit) {
  if (source.length <= limit) {
    return source;
  }
  const finalCodeUnit = source.charCodeAt(limit - 1);
  const nextCodeUnit = source.charCodeAt(limit);
  const endsBeforeLowSurrogate = finalCodeUnit >= 0xd800
    && finalCodeUnit <= 0xdbff
    && nextCodeUnit >= 0xdc00
    && nextCodeUnit <= 0xdfff;
  return source.slice(0, endsBeforeLowSurrogate ? limit - 1 : limit);
}

function invalidBlock(reason, rawText) {
  return {
    type: 'invalid',
    status: 'invalid',
    reason,
    rawText: truncateScalarPrefix(rawText, LIMITS.BLOCK_TEXT),
  };
}

function decodeSafeTextContent(rawText) {
  const trimmed = rawText.trim();
  if (
    !trimmed
    || trimmed.includes('<')
    || containsUnsafeTextControl(trimmed)
  ) {
    return { ok: false, reason: 'invalid-text-content', text: '' };
  }
  if (trimmed.length > LIMITS.BLOCK_TEXT) {
    return { ok: false, reason: 'block-too-long', text: '' };
  }
  const text = decodeXmlEntities(trimmed);
  if (text.length > LIMITS.BLOCK_TEXT) {
    return { ok: false, reason: 'block-too-long', text: '' };
  }
  return { ok: true, reason: null, text };
}

function validateTextContent(rawText) {
  const content = decodeSafeTextContent(rawText);
  if (!content.ok) {
    return content;
  }
  const { text } = content;
  if (hasStandaloneDialogueParagraph(text)) {
    return { ok: false, reason: 'invalid-text-content', text: '' };
  }
  return content;
}

function requiredTrimmedAttributes(values, names) {
  const normalized = Object.create(null);
  for (const name of names) {
    const value = (values[name] ?? '').trim();
    if (!value) {
      return null;
    }
    normalized[name] = value;
  }
  return normalized;
}

function isAsciiLetter(character) {
  return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z');
}

const COMMON_ASCII_ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e',
]);
const MAX_ASCII_ABBREVIATION_LENGTH = Math.max(
  ...Array.from(COMMON_ASCII_ABBREVIATIONS, (abbreviation) => abbreviation.length),
);

function isSentenceCloser(character) {
  return '"\'”’」』）)]}】》〉〕］'.includes(character);
}

function asciiDotBoundaryEnd(text, index) {
  if (text[index - 1] === '.' || text[index + 1] === '.') {
    return -1;
  }

  let cursor = index + 1;
  while (cursor < text.length && isSentenceCloser(text[cursor])) {
    cursor += 1;
  }
  return cursor === text.length || isProtocolWhitespace(text[cursor]) ? cursor : -1;
}

function countNonemptySentences(text) {
  let count = 0;
  let hasContent = false;
  let cursor = 0;
  let abbreviation = '';
  let abbreviationOverflow = false;
  let dottedSegmentCount = 0;
  let dottedSegmentsAreInitials = true;
  let segmentLength = 0;

  function resetAsciiToken() {
    abbreviation = '';
    abbreviationOverflow = false;
    dottedSegmentCount = 0;
    dottedSegmentsAreInitials = true;
    segmentLength = 0;
  }

  function appendAbbreviationCharacter(character) {
    if (abbreviationOverflow) {
      return;
    }
    if (abbreviation.length >= MAX_ASCII_ABBREVIATION_LENGTH) {
      abbreviationOverflow = true;
      return;
    }
    abbreviation += character.toLowerCase();
  }

  while (cursor < text.length) {
    const character = text[cursor];
    const hardTerminator = character === '。' || character === '！' || character === '？'
      || character === '!' || character === '?';
    if (hardTerminator) {
      if (hasContent) {
        count += 1;
      }
      hasContent = false;
      resetAsciiToken();
      cursor += 1;
      while (
        cursor < text.length
        && (text[cursor] === '。' || text[cursor] === '！' || text[cursor] === '？'
          || text[cursor] === '!' || text[cursor] === '?')
      ) {
        cursor += 1;
      }
      while (cursor < text.length && isSentenceCloser(text[cursor])) {
        cursor += 1;
      }
      continue;
    }

    if (character === '.') {
      const boundaryEnd = asciiDotBoundaryEnd(text, cursor);
      const commonAbbreviation = !abbreviationOverflow && COMMON_ASCII_ABBREVIATIONS.has(abbreviation);
      const quoteClosedBoundary = boundaryEnd > cursor + 1;
      const dottedInitial = !quoteClosedBoundary
        && segmentLength === 1
        && dottedSegmentCount > 0
        && dottedSegmentsAreInitials;
      if (boundaryEnd !== -1 && !commonAbbreviation && !dottedInitial) {
        if (hasContent) {
          count += 1;
        }
        hasContent = false;
        resetAsciiToken();
        cursor = boundaryEnd;
        continue;
      }

      hasContent = true;
      appendAbbreviationCharacter(character);
      dottedSegmentCount += 1;
      dottedSegmentsAreInitials = dottedSegmentsAreInitials && segmentLength === 1;
      segmentLength = 0;
      cursor += 1;
      continue;
    }

    if (isAsciiLetter(character)) {
      hasContent = true;
      segmentLength = Math.min(segmentLength + 1, 2);
      appendAbbreviationCharacter(character);
      cursor += 1;
      continue;
    }

    if (!isProtocolWhitespace(character)) {
      hasContent = true;
    }
    resetAsciiToken();
    cursor += 1;
  }

  return count + (hasContent ? 1 : 0);
}

function elementExtent(scanner, opening, end) {
  const { source } = scanner;
  if (opening.malformed) {
    return {
      complete: false,
      end: opening.end,
      recoveryBoundaryFound: opening.recoveryBoundaryFound,
    };
  }
  if (opening.selfClosing) {
    return {
      complete: true,
      end: opening.end,
      innerStart: opening.end,
      innerEnd: opening.end,
      recoveryBoundaryFound: false,
    };
  }
  const closing = scanner.matchingClose(opening, end);
  if (closing) {
    return {
      complete: true,
      end: closing.end,
      innerStart: opening.end,
      innerEnd: closing.start,
      recoveryBoundaryFound: false,
    };
  }
  const boundary = scanner.firstBoundary(opening.end, end);
  return boundary
    ? { complete: false, end: boundary.end, recoveryBoundaryFound: true }
    : { complete: false, end, recoveryBoundaryFound: false };
}

function parseSimpleElement(scanner, opening, extent, rawText, specification) {
  if (opening.selfClosing) {
    return invalidBlock(`invalid-${opening.name}`, rawText);
  }
  const attributes = parseAttributes(opening, specification.allowed, specification.required);
  const normalized = attributes.ok ? requiredTrimmedAttributes(attributes.values, specification.required) : null;
  const content = validateTextContent(scanner.source.slice(extent.innerStart, extent.innerEnd));
  if (!attributes.ok || !normalized || !content.ok) {
    return invalidBlock(content.reason === 'block-too-long' ? 'block-too-long' : `invalid-${opening.name}`, rawText);
  }
  return specification.build(normalized, content.text);
}

function validateAffinities(value) {
  if (value === undefined) {
    return { ok: true, affinities: [] };
  }
  if (!value) {
    return { ok: false, affinities: [] };
  }
  const affinities = value.split(',');
  let previous = -1;
  for (const affinity of affinities) {
    const index = AFFINITY_ORDER.indexOf(affinity);
    if (index === -1 || index <= previous) {
      return { ok: false, affinities: [] };
    }
    previous = index;
  }
  return { ok: true, affinities };
}

function readAbilityChild(scanner, start, end, name) {
  const { source } = scanner;
  const cursor = skipWhitespace(source, start);
  const opening = scanner.tagAt(cursor, 'open', name);
  if (!opening || opening.name !== name || opening.selfClosing) {
    return { ok: false };
  }
  const attributes = parseAttributes(opening, []);
  if (!attributes.ok) {
    return { ok: false };
  }
  const extent = elementExtent(scanner, opening, end);
  if (!extent.complete) {
    return { ok: false };
  }
  const content = validateTextContent(source.slice(extent.innerStart, extent.innerEnd));
  if (!content.ok) {
    return { ok: false, reason: content.reason };
  }
  return { ok: true, cursor: extent.end, text: content.text };
}

function parseAbility(scanner, opening, extent, rawText) {
  const { source } = scanner;
  const inner = source.slice(extent.innerStart, extent.innerEnd);
  if (opening.selfClosing) {
    return invalidBlock('invalid-ability', rawText);
  }
  const attributes = parseAttributes(opening, ['user', 'name', 'kind', 'affinity', 'desc'], ['user', 'name', 'kind']);
  const normalized = attributes.ok ? requiredTrimmedAttributes(attributes.values, ['user', 'name', 'kind']) : null;
  if (!attributes.ok || !normalized || !ABILITY_KINDS.has(normalized.kind)) {
    return invalidBlock('invalid-ability', rawText);
  }
  const affinity = validateAffinities(attributes.values.affinity);
  if (!affinity.ok) {
    return invalidBlock('invalid-ability', rawText);
  }

  if (Object.hasOwn(attributes.values, 'desc')) {
    const description = attributes.values.desc.trim();
    const effect = validateTextContent(inner);
    if (!description || description.length > LIMITS.ATTRIBUTE || inner.includes('<') || !effect.ok) {
      return invalidBlock(effect.reason === 'block-too-long' ? 'block-too-long' : 'invalid-ability', rawText);
    }
    return {
      type: 'ability',
      user: normalized.user,
      name: normalized.name,
      kind: normalized.kind,
      affinities: affinity.affinities,
      effect: effect.text,
      description,
      protocol: 'legacy-readonly',
    };
  }

  const effect = readAbilityChild(scanner, extent.innerStart, extent.innerEnd, 'effect');
  if (!effect.ok) {
    return invalidBlock(effect.reason === 'block-too-long' ? 'block-too-long' : 'invalid-ability', rawText);
  }
  const description = readAbilityChild(scanner, effect.cursor, extent.innerEnd, 'description');
  if (!description.ok || skipWhitespace(source, description.cursor ?? 0) !== extent.innerEnd) {
    return invalidBlock(description.reason === 'block-too-long' ? 'block-too-long' : 'invalid-ability', rawText);
  }
  const sentenceCount = countNonemptySentences(description.text);
  if (sentenceCount < 1 || sentenceCount > 3) {
    return invalidBlock('invalid-ability', rawText);
  }
  return {
    type: 'ability',
    user: normalized.user,
    name: normalized.name,
    kind: normalized.kind,
    affinities: affinity.affinities,
    effect: effect.text,
    description: description.text,
    protocol: 'current',
  };
}

function parseElement(scanner, opening, extent, rawText) {
  if (opening.name === 'scene') {
    return parseSimpleElement(scanner, opening, extent, rawText, {
      allowed: ['location', 'time', 'mood'],
      required: ['location', 'time', 'mood'],
      build: (values, text) => ({ type: 'scene', location: values.location, time: values.time, mood: values.mood, text }),
    });
  }
  if (opening.name === 'check') {
    return parseSimpleElement(scanner, opening, extent, rawText, {
      allowed: ['type', 'actor', 'target'],
      required: ['type', 'actor', 'target'],
      build: (values, text) => ({ type: 'check', checkType: values.type, actor: values.actor, target: values.target, text }),
    });
  }
  if (opening.name === 'restart') {
    return parseSimpleElement(scanner, opening, extent, rawText, {
      allowed: ['deathId', 'checkpoint'],
      required: ['deathId', 'checkpoint'],
      build: (values, text) => ({ type: 'restart', deathId: values.deathId, checkpoint: values.checkpoint, text }),
    });
  }
  if (opening.name === 'ability') {
    return parseAbility(scanner, opening, extent, rawText);
  }
  return invalidBlock('unsupported-child', rawText);
}

function isValidSupportedPlotElement(scanner, opening, extent) {
  if (!extent.complete || !SUPPORTED_PLOT_CHILD_NAMES.has(opening.name)) {
    return false;
  }
  const rawText = scanner.source.slice(opening.start, extent.end);
  return parseElement(scanner, opening, extent, rawText).type === opening.name;
}

function dialogueBlock(paragraph) {
  const dialogue = /^\{([^{}\r\n]+)\}「([\s\S]+)」$/u.exec(paragraph);
  if (!dialogue) {
    return null;
  }
  const rawSpeaker = dialogue[1].trim();
  const literalPlayer = rawSpeaker === '#';
  const speaker = decodeXmlEntities(rawSpeaker).trim();
  const text = decodeXmlEntities(dialogue[2]).trim();
  if (
    !speaker
    || !text
    || (!literalPlayer && (/[#{}<>\r\n]/u.test(speaker) || containsUnsafeTextControl(speaker)))
  ) {
    return null;
  }
  return literalPlayer
    ? { type: 'player-dialogue', speaker: '#', text }
    : { type: 'dialogue', speaker, text };
}

function hasStandaloneDialogueParagraph(rawText) {
  const paragraphs = rawText.replace(/\r\n?/gu, '\n').split(/\n(?:[ \t]*\n)+/gu);
  return paragraphs.some((paragraph) => {
    const dialogue = /^\{([^{}\r\n]+)\}「([\s\S]+)」$/u.exec(paragraph.trim());
    return Boolean(dialogue?.[1].trim() && dialogue[2].trim());
  });
}

function paragraphBlocks(rawText, maxBlocks = Number.POSITIVE_INFINITY) {
  const blocks = [];
  const errors = [];
  const paragraphs = rawText.replace(/\r\n?/gu, '\n').split(/\n(?:[ \t]*\n)+/gu);
  for (const rawParagraph of paragraphs) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) {
      continue;
    }
    if (blocks.length >= maxBlocks) {
      return { blocks, errors, exceeded: true };
    }
    if (paragraph.length > LIMITS.BLOCK_TEXT) {
      blocks.push(invalidBlock('block-too-long', paragraph));
      errors.push('block-too-long');
      continue;
    }
    if (containsUnsafeTextControl(paragraph)) {
      blocks.push(invalidBlock('invalid-text-content', paragraph));
      errors.push('invalid-text-content');
      continue;
    }

    const dialogue = dialogueBlock(paragraph);
    if (dialogue) {
      blocks.push(dialogue);
      continue;
    }
    blocks.push({ type: 'narration', text: decodeXmlEntities(paragraph) });
  }
  return { blocks, errors, exceeded: false };
}

function appendBlockCountExceeded(blocks, errorCodes, rawText) {
  blocks.push(invalidBlock('block-count-exceeded', rawText));
  errorCodes.push('block-count-exceeded');
}

function blockLimitSentinelRawText() {
  return '[block-count-exceeded]';
}

function completedDialoguePrefixEnd(scanner, segmentStart, suffixStart) {
  const { source } = scanner;
  const priorBoundaryEnd = scanner.lastBoundaryEnd(segmentStart, suffixStart);
  const paragraphStart = priorBoundaryEnd === -1 ? segmentStart : priorBoundaryEnd;
  let contentStart;
  if (scanner.attemptedDialogueContentStarts.has(paragraphStart)) {
    contentStart = scanner.attemptedDialogueContentStarts.get(paragraphStart);
  } else {
    contentStart = paragraphStart;
    while (contentStart < suffixStart && source[contentStart]?.trim() === '') {
      contentStart += 1;
    }
    scanner.attemptedDialogueContentStarts.set(paragraphStart, contentStart);
  }
  let contentEnd = suffixStart;
  while (contentEnd > contentStart && source[contentEnd - 1]?.trim() === '') {
    contentEnd -= 1;
  }
  if (source[contentStart] !== '{' || source[contentEnd - 1] !== '」') {
    return -1;
  }
  return dialogueBlock(source.slice(contentStart, contentEnd))
    ? suffixStart
    : -1;
}

function startsUnsafeLexicalUnit(scanner, segmentStart, candidate) {
  return scanner.source[candidate] === '<'
    && completedDialoguePrefixEnd(scanner, segmentStart, candidate) !== -1;
}

function nextUnsafeLexicalUnitStart(scanner, segmentStart, searchStart, end) {
  const { source } = scanner;
  for (
    let candidate = source.indexOf('<', searchStart);
    candidate !== -1 && candidate < end;
    candidate = source.indexOf('<', candidate + 1)
  ) {
    if (startsUnsafeLexicalUnit(scanner, segmentStart, candidate)) {
      return candidate;
    }
  }
  return -1;
}

function ownedParagraphBlocks(scanner, start, end, maxBlocks = Number.POSITIVE_INFINITY) {
  const { source } = scanner;
  const blocks = [];
  const errors = [];
  let chunkStart = start;
  let searchStart = start;

  while (chunkStart < end) {
    const unsafeStart = nextUnsafeLexicalUnitStart(
      scanner,
      chunkStart,
      searchStart,
      end,
    );
    const chunkEnd = unsafeStart === -1 ? end : unsafeStart;
    const direct = paragraphBlocks(
      source.slice(chunkStart, chunkEnd),
      maxBlocks - blocks.length,
    );
    blocks.push(...direct.blocks);
    errors.push(...direct.errors);
    if (direct.exceeded) {
      return { blocks, errors, exceeded: true };
    }
    if (unsafeStart === -1) {
      return { blocks, errors, exceeded: false };
    }
    chunkStart = unsafeStart;
    searchStart = unsafeStart + 1;
  }
  return { blocks, errors, exceeded: false };
}

function splitCompleteParagraphPrefix(scanner, start, end, incompleteStart = -1) {
  const boundaryEnd = scanner.lastBoundaryEnd(start, end);
  const searchStart = boundaryEnd === -1 ? start : boundaryEnd;
  const anchoredUnsafeStart = incompleteStart >= searchStart
    && startsUnsafeLexicalUnit(scanner, start, incompleteStart)
    ? incompleteStart
    : -1;
  const unsafeStart = anchoredUnsafeStart === -1
    ? nextUnsafeLexicalUnitStart(scanner, start, searchStart, end)
    : anchoredUnsafeStart;
  if (unsafeStart !== -1) {
    return { prefixEnd: unsafeStart, remainderStart: unsafeStart };
  }
  return boundaryEnd === -1
    ? { prefixEnd: start, remainderStart: start }
    : { prefixEnd: boundaryEnd, remainderStart: boundaryEnd };
}

function attemptedDialogueParagraphStart(scanner, segmentStart, tokenStart) {
  const { source } = scanner;
  if (completedDialoguePrefixEnd(scanner, segmentStart, tokenStart) !== -1) {
    return -1;
  }
  const priorBoundaryEnd = scanner.lastBoundaryEnd(segmentStart, tokenStart);
  const paragraphStart = priorBoundaryEnd === -1 ? segmentStart : priorBoundaryEnd;
  let contentStart;
  if (scanner.attemptedDialogueContentStarts.has(paragraphStart)) {
    contentStart = scanner.attemptedDialogueContentStarts.get(paragraphStart);
  } else {
    contentStart = paragraphStart;
    while (contentStart < source.length && source[contentStart]?.trim() === '') {
      contentStart += 1;
    }
    scanner.attemptedDialogueContentStarts.set(paragraphStart, contentStart);
  }
  if (source[contentStart] !== '{') {
    return -1;
  }
  return paragraphStart;
}

function attemptedDialogueRange(scanner, segmentStart, tokenStart, end) {
  const { source } = scanner;
  const paragraphStart = attemptedDialogueParagraphStart(scanner, segmentStart, tokenStart);
  if (paragraphStart === -1) {
    return null;
  }
  const nextBoundary = scanner.firstBoundary(tokenStart, end);
  const paragraphTextEnd = nextBoundary ? nextBoundary.start : end;
  const paragraphEnd = nextBoundary ? nextBoundary.end : paragraphTextEnd;
  const cacheKey = `${paragraphStart}:${paragraphTextEnd}:${paragraphEnd}`;
  if (scanner.attemptedDialogueRanges.has(cacheKey)) {
    return scanner.attemptedDialogueRanges.get(cacheKey);
  }
  const rawText = source.slice(paragraphStart, paragraphTextEnd).trim();
  const range = /^\{[^{}\r\n]+\}「[\s\S]*」$/u.test(rawText) ? {
    paragraphStart,
    paragraphEnd,
    rawText,
  } : null;
  scanner.attemptedDialogueRanges.set(cacheKey, range);
  return range;
}

function unfinishedAttemptedDialogueRange(scanner, segmentStart, tokenStart, end) {
  const { source } = scanner;
  const paragraphStart = attemptedDialogueParagraphStart(scanner, segmentStart, tokenStart);
  if (paragraphStart === -1) {
    return null;
  }
  const attemptedPrefix = source.slice(paragraphStart, tokenStart).trim();
  if (!/^\{[^{}\r\n]+\}「[\s\S]*$/u.test(attemptedPrefix)) {
    return null;
  }
  const nextBoundary = scanner.firstBoundary(tokenStart, end);
  const paragraphTextEnd = nextBoundary ? nextBoundary.start : end;
  return {
    paragraphStart,
    paragraphEnd: nextBoundary ? nextBoundary.end : paragraphTextEnd,
    rawText: source.slice(paragraphStart, paragraphTextEnd).trim(),
  };
}

function attemptedDialogueBeforeClosingTag(scanner, segmentStart, tokenStart, end, closingName) {
  const { source } = scanner;
  const paragraphStart = attemptedDialogueParagraphStart(scanner, segmentStart, tokenStart);
  if (paragraphStart === -1) {
    return null;
  }

  const nextBoundary = scanner.firstBoundary(tokenStart, end);
  const paragraphTextEnd = nextBoundary ? nextBoundary.start : end;
  const paragraphEnd = nextBoundary ? nextBoundary.end : paragraphTextEnd;
  const cacheKey = `${paragraphStart}:${paragraphTextEnd}:${paragraphEnd}:${closingName}`;
  if (scanner.attemptedDialogueClosingOwners.has(cacheKey)) {
    return scanner.attemptedDialogueClosingOwners.get(cacheKey);
  }

  const contentStart = scanner.attemptedDialogueContentStarts.get(paragraphStart);
  let openingEnd = contentStart + 1;
  while (
    openingEnd < paragraphTextEnd
    && source[openingEnd] !== '}'
    && source[openingEnd] !== '{'
    && source[openingEnd] !== '\r'
    && source[openingEnd] !== '\n'
  ) {
    openingEnd += 1;
  }
  if (
    openingEnd === contentStart + 1
    || source[openingEnd] !== '}'
    || source[openingEnd + 1] !== '「'
  ) {
    scanner.attemptedDialogueClosingOwners.set(cacheKey, null);
    return null;
  }

  const firstTag = scanner.nextTag(contentStart, paragraphTextEnd);
  let candidateCursor = (firstTag?.start ?? tokenStart) + 1;
  let scanCursor = openingEnd + 2;
  let lastNonWhitespace = null;
  let range = null;
  while (candidateCursor < paragraphTextEnd) {
    const candidate = scanner.nextClosingTag(closingName, candidateCursor, paragraphTextEnd);
    if (!candidate) {
      break;
    }
    while (scanCursor < candidate.start) {
      if (source[scanCursor]?.trim() !== '') {
        lastNonWhitespace = source[scanCursor];
      }
      scanCursor += 1;
    }
    if (lastNonWhitespace === '」') {
      range = {
        paragraphStart,
        paragraphEnd: candidate.start,
        rawText: source.slice(paragraphStart, candidate.start).trim(),
      };
      break;
    }
    candidateCursor = candidate.end;
  }
  scanner.attemptedDialogueClosingOwners.set(cacheKey, range);
  return range;
}

function consumeLiteralPrefix(source, start, end, literal) {
  const available = end - start;
  const compared = Math.min(available, literal.length);
  if (source.slice(start, start + compared) !== literal.slice(0, compared)) {
    return { state: 'invalid', cursor: start };
  }
  return available < literal.length
    ? { state: 'partial', cursor: end }
    : { state: 'complete', cursor: start + literal.length };
}

function consumeEmptyAttributeOpeningPrefix(source, start, end, name) {
  const head = consumeLiteralPrefix(source, start, end, `<${name}`);
  if (head.state !== 'complete') {
    return head;
  }

  let cursor = head.cursor;
  if (cursor === end) {
    return { state: 'partial', cursor };
  }
  if (source[cursor] === '>') {
    return { state: 'complete', cursor: cursor + 1 };
  }
  if (!isProtocolWhitespace(source[cursor])) {
    return { state: 'invalid', cursor };
  }
  while (cursor < end && isProtocolWhitespace(source[cursor])) {
    if (
      (source[cursor] === '\r' || source[cursor] === '\n')
      && blankLineBoundaryEnd(source, cursor) !== -1
    ) {
      return { state: 'invalid', cursor };
    }
    cursor += 1;
  }
  if (cursor === end) {
    return { state: 'partial', cursor };
  }
  return source[cursor] === '>'
    ? { state: 'complete', cursor: cursor + 1 }
    : { state: 'invalid', cursor };
}

function consumeTextAndCloserPrefix(source, start, end, name, sentenceBounded = false) {
  const closerStart = source.indexOf('<', start);
  if (closerStart === -1 || closerStart >= end) {
    const rawText = source.slice(start, end);
    if (!rawText.trim()) {
      return { state: 'partial', cursor: end };
    }
    const decoded = decodeSafeTextContent(rawText);
    if (!decoded.ok) {
      return { state: 'invalid', cursor: start };
    }
    let content = decoded;
    if (hasStandaloneDialogueParagraph(decoded.text)) {
      // A terminal dialogue-looking paragraph can become ordinary owner text
      // when streaming appends more text before the missing close.
      content = validateTextContent(`${rawText}续`);
    }
    if (!content.ok || (sentenceBounded && countNonemptySentences(content.text) > 3)) {
      return { state: 'invalid', cursor: start };
    }
    return { state: 'partial', cursor: end };
  }

  const content = validateTextContent(source.slice(start, closerStart));
  if (!content.ok) {
    return { state: 'invalid', cursor: start };
  }
  if (sentenceBounded) {
    const sentenceCount = countNonemptySentences(content.text);
    if (sentenceCount < 1 || sentenceCount > 3) {
      return { state: 'invalid', cursor: start };
    }
  }
  return consumeLiteralPrefix(source, closerStart, end, `</${name}>`);
}

function simpleStreamingElementCanStillComplete(scanner, opening, end) {
  const attributeRules = {
    scene: [['location', 'time', 'mood'], ['location', 'time', 'mood']],
    check: [['type', 'actor', 'target'], ['type', 'actor', 'target']],
    restart: [['deathId', 'checkpoint'], ['deathId', 'checkpoint']],
  };
  const rules = attributeRules[opening.name];
  if (!rules) {
    return false;
  }
  const attributes = parseAttributes(opening, rules[0], rules[1]);
  if (!attributes.ok || !requiredTrimmedAttributes(attributes.values, rules[1])) {
    return false;
  }
  return consumeTextAndCloserPrefix(
    scanner.source,
    opening.end,
    end,
    opening.name,
  ).state === 'partial';
}

function abilityStreamingElementCanStillComplete(scanner, opening, end) {
  const { source } = scanner;
  const attributes = parseAttributes(opening, ['user', 'name', 'kind', 'affinity', 'desc'], ['user', 'name', 'kind']);
  const normalized = attributes.ok ? requiredTrimmedAttributes(attributes.values, ['user', 'name', 'kind']) : null;
  const affinity = attributes.ok ? validateAffinities(attributes.values.affinity) : { ok: false };
  if (!attributes.ok || !normalized || !ABILITY_KINDS.has(normalized.kind) || !affinity.ok) {
    return false;
  }

  if (Object.hasOwn(attributes.values, 'desc')) {
    if (!attributes.values.desc.trim()) {
      return false;
    }
    return consumeTextAndCloserPrefix(source, opening.end, end, 'ability').state === 'partial';
  }

  let cursor = skipWhitespace(source, opening.end);
  const effectOpening = consumeEmptyAttributeOpeningPrefix(source, cursor, end, 'effect');
  if (effectOpening.state !== 'complete') {
    return effectOpening.state === 'partial';
  }
  cursor = effectOpening.cursor;

  const effect = consumeTextAndCloserPrefix(source, cursor, end, 'effect');
  if (effect.state !== 'complete') {
    return effect.state === 'partial';
  }
  cursor = skipWhitespace(source, effect.cursor);

  const descriptionOpening = consumeEmptyAttributeOpeningPrefix(source, cursor, end, 'description');
  if (descriptionOpening.state !== 'complete') {
    return descriptionOpening.state === 'partial';
  }
  cursor = descriptionOpening.cursor;

  const description = consumeTextAndCloserPrefix(source, cursor, end, 'description', true);
  if (description.state !== 'complete') {
    return description.state === 'partial';
  }
  cursor = skipWhitespace(source, description.cursor);

  return consumeLiteralPrefix(source, cursor, end, '</ability>').state === 'partial';
}

function streamingElementCanStillComplete(scanner, opening, end) {
  return opening.name === 'ability'
    ? abilityStreamingElementCanStillComplete(scanner, opening, end)
    : simpleStreamingElementCanStillComplete(scanner, opening, end);
}

function findContentCloseAfterCompletedPlotElement(scanner, start, end) {
  const { source } = scanner;
  let segmentStart = start;
  let cursor = start;
  let completedElementSeen = false;

  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return null;
    }

    const attemptedDialogue = attemptedDialogueRange(scanner, segmentStart, tag.start, end)
      ?? attemptedDialogueBeforeClosingTag(scanner, segmentStart, tag.start, end, 'content');
    if (attemptedDialogue) {
      segmentStart = attemptedDialogue.paragraphEnd;
      cursor = attemptedDialogue.paragraphEnd;
      continue;
    }
    if (tag.kind === 'close' && tag.name === 'content') {
      return completedElementSeen && isWhitespaceOnly(source.slice(segmentStart, tag.start)) ? tag : null;
    }
    if (tag.kind !== 'open') {
      cursor = tag.end;
      continue;
    }

    const extent = elementExtent(scanner, tag, end);
    if (!extent.complete) {
      return null;
    }
    completedElementSeen = true;
    segmentStart = extent.end;
    cursor = extent.end;
  }
  return null;
}

function findTopLevelContentClose(scanner, start, end) {
  let segmentStart = start;
  let cursor = start;

  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return null;
    }

    const attemptedDialogue = attemptedDialogueRange(scanner, segmentStart, tag.start, end)
      ?? attemptedDialogueBeforeClosingTag(scanner, segmentStart, tag.start, end, 'content');
    if (attemptedDialogue) {
      segmentStart = attemptedDialogue.paragraphEnd;
      cursor = attemptedDialogue.paragraphEnd;
      continue;
    }
    if (tag.kind === 'close' && tag.name === 'content') {
      return tag;
    }
    if (tag.kind !== 'open') {
      cursor = tag.end;
      continue;
    }

    const extent = elementExtent(scanner, tag, end);
    if (!extent.complete && !extent.recoveryBoundaryFound) {
      return null;
    }
    segmentStart = extent.end;
    cursor = extent.end;
  }
  return null;
}

function hasLaterPlotClose(scanner, start, end) {
  let cursor = start;
  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return false;
    }
    if (tag.kind === 'close' && tag.name === 'now_plot') {
      return true;
    }
    cursor = tag.end;
  }
  return false;
}

function opaqueAwareLocalElementExtent(scanner, opening, end) {
  const { source } = scanner;
  if (opening.malformed) {
    return {
      complete: false,
      end: opening.end,
      recoveryBoundaryFound: opening.recoveryBoundaryFound,
    };
  }
  if (opening.selfClosing) {
    return {
      complete: true,
      end: opening.end,
      innerStart: opening.end,
      innerEnd: opening.end,
      recoveryBoundaryFound: false,
    };
  }
  if (source.startsWith(UPDATE_VARIABLE_OPENING, opening.start)) {
    const closeStart = opening.opaqueUpdateVariableCloseStart ?? -1;
    if (closeStart !== -1 && closeStart + UPDATE_VARIABLE_CLOSING.length <= end) {
      return {
        complete: true,
        end: closeStart + UPDATE_VARIABLE_CLOSING.length,
        innerStart: opening.end,
        innerEnd: closeStart,
        recoveryBoundaryFound: false,
      };
    }
  }

  if (scanner.overflowStart === -1) {
    const closing = scanner.matchingClose(opening, end);
    const opaqueBarrier = closing
      ? scanner.nextIncompleteOpaqueUpdateVariable(opening.end, closing.start)
      : null;
    if (!opaqueBarrier) {
      return elementExtent(scanner, opening, end);
    }
    const boundary = scanner.firstBoundary(opening.end, end);
    return boundary
      ? { complete: false, end: boundary.end, recoveryBoundaryFound: true }
      : { complete: false, end, recoveryBoundaryFound: false };
  }

  let cursor = opening.end;
  let depth = 1;
  const retainedTagLimit = STRUCTURAL_TAG_LIMIT + STRUCTURAL_TAG_TAIL_LIMIT;
  for (let count = 0; count < retainedTagLimit && cursor < end; count += 1) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      break;
    }
    if (source.startsWith(UPDATE_VARIABLE_OPENING, tag.start)) {
      const closeStart = tag.opaqueUpdateVariableCloseStart ?? -1;
      if (closeStart === -1 || closeStart + UPDATE_VARIABLE_CLOSING.length > end) {
        break;
      }
      cursor = closeStart + UPDATE_VARIABLE_CLOSING.length;
      continue;
    }
    if (!tag.malformed && tag.name === opening.name) {
      if (tag.kind === 'open' && !tag.selfClosing) {
        depth += 1;
      } else if (tag.kind === 'close') {
        depth -= 1;
        if (depth === 0) {
          return {
            complete: true,
            end: tag.end,
            innerStart: opening.end,
            innerEnd: tag.start,
            recoveryBoundaryFound: false,
          };
        }
      }
    }
    cursor = tag.end;
  }

  const boundary = scanner.firstBoundary(opening.end, end);
  return boundary
    ? { complete: false, end: boundary.end, recoveryBoundaryFound: true }
    : { complete: false, end, recoveryBoundaryFound: false };
}

function isSemanticPlotTextEvidence(rawText) {
  const text = rawText.trim();
  if (!text) {
    return false;
  }
  if (dialogueBlock(text)) {
    return true;
  }
  if (
    text.length > LIMITS.BLOCK_TEXT
    || text.includes('<')
    || containsUnsafeTextControl(text)
  ) {
    return false;
  }
  const decodedText = decodeXmlEntities(text);
  return decodedText.length <= LIMITS.BLOCK_TEXT
    && !decodedText.includes('<')
    && !containsUnsafeTextControl(decodedText)
    && !text.startsWith('{')
    && !decodedText.startsWith('{');
}

function hasOuterPlotCloseAfterSemanticEvidence(scanner, opening, end) {
  let cursor = opening.start;
  let completedEvidence = false;
  let completedElementSeen = false;
  const retainedTagLimit = STRUCTURAL_TAG_LIMIT + STRUCTURAL_TAG_TAIL_LIMIT;

  for (let count = 0; count < retainedTagLimit && cursor < end; count += 1) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return false;
    }
    if (hasCompletedRecoveredPlotContent(scanner, cursor, tag.start)) {
      completedEvidence = true;
    }
    if (tag.kind === 'close') {
      if (tag.name === 'now_plot') {
        return completedEvidence;
      }
      cursor = tag.end;
      continue;
    }

    const extent = opaqueAwareLocalElementExtent(scanner, tag, end);
    if (extent.complete) {
      if (isValidSupportedPlotElement(scanner, tag, extent)) {
        completedEvidence = true;
      }
      if (tag.name !== 'UpdateVariable') {
        completedElementSeen = true;
      }
      cursor = extent.end;
      continue;
    }
    if (extent.recoveryBoundaryFound) {
      if (!completedElementSeen) {
        return false;
      }
      cursor = extent.end;
      continue;
    }
    return false;
  }
  return false;
}

function hasCompletedRecoveredPlotContent(scanner, start, end) {
  const { source } = scanner;
  let cursor = skipWhitespace(source, start);
  const advanceCursor = (nextCursor) => {
    if (nextCursor <= cursor) {
      return false;
    }
    cursor = nextCursor;
    return true;
  };

  // Every continuing branch advances an integer source offset, bounding this walk by end - start.
  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    const boundary = scanner.firstBoundary(cursor, end);
    const inert = scanner.nextCompletedInert(cursor, end);
    const attemptedDialogue = tag
      ? attemptedDialogueRange(scanner, cursor, tag.start, end)
      : null;
    if (attemptedDialogue) {
      if (attemptedDialogue.paragraphEnd >= end) {
        return false;
      }
      if (!advanceCursor(attemptedDialogue.paragraphEnd)) {
        return false;
      }
      continue;
    }
    const textEnd = Math.min(tag?.start ?? end, boundary?.start ?? end, inert?.start ?? end);
    const rawText = source.slice(cursor, textEnd).trim();
    if (rawText) {
      if (isSemanticPlotTextEvidence(rawText)) {
        return true;
      }
      if (!advanceCursor(textEnd)) {
        return false;
      }
      continue;
    }
    if (inert && inert.start === textEnd) {
      if (!advanceCursor(inert.end)) {
        return false;
      }
      continue;
    }
    if (boundary && boundary.start === textEnd) {
      if (!advanceCursor(boundary.end)) {
        return false;
      }
      continue;
    }
    if (!tag) {
      return false;
    }
    if (tag.kind !== 'open') {
      if (!advanceCursor(tag.end)) {
        return false;
      }
      continue;
    }
    const extent = opaqueAwareLocalElementExtent(scanner, tag, end);
    if (extent.complete) {
      if (isValidSupportedPlotElement(scanner, tag, extent)) {
        return true;
      }
      if (!advanceCursor(extent.end)) {
        return false;
      }
      continue;
    }
    if (!extent.recoveryBoundaryFound) {
      return false;
    }
    if (!advanceCursor(extent.end)) {
      return false;
    }
  }
  return false;
}

function hasCompletedLaterPlotContent(scanner, start, end) {
  const { source } = scanner;
  let cursor = skipWhitespace(source, start);
  const pairedContentClose = scanner.tagAt(cursor, 'close', 'content');
  let evidenceEnd = end;
  let laterPlotClose = null;
  if (pairedContentClose) {
    cursor = skipWhitespace(source, pairedContentClose.end);
    laterPlotClose = scanner.nextClosingTag('now_plot', cursor, end);
    if (!laterPlotClose || cursor >= laterPlotClose.start) {
      return false;
    }
    evidenceEnd = laterPlotClose.start;
  } else if (cursor >= end) {
    return false;
  }

  const tag = scanner.nextTag(cursor, evidenceEnd);
  const boundary = scanner.firstBoundary(cursor, evidenceEnd);
  if (boundary && (!tag || boundary.start < tag.start)) {
    return hasCompletedRecoveredPlotContent(scanner, cursor, evidenceEnd);
  }
  if (tag) {
    if (hasCompletedRecoveredPlotContent(scanner, cursor, tag.start)) {
      return true;
    }
    if (tag.kind !== 'open') {
      return false;
    }
    if (pairedContentClose) {
      if (SUPPORTED_PLOT_CHILD_NAMES.has(tag.name)) {
        const extent = opaqueAwareLocalElementExtent(scanner, tag, evidenceEnd);
        return isValidSupportedPlotElement(scanner, tag, extent)
          || (extent.complete
            && hasCompletedRecoveredPlotContent(scanner, extent.end, evidenceEnd))
          || (tag.malformed
            && extent.recoveryBoundaryFound
            && hasCompletedRecoveredPlotContent(scanner, extent.end, evidenceEnd));
      }
      return hasOuterPlotCloseAfterSemanticEvidence(scanner, tag, end);
    }
  }
  return hasCompletedRecoveredPlotContent(scanner, cursor, evidenceEnd);
}

function hasNonWhitespacePlotContent(source, start, end) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (!isProtocolWhitespace(source[cursor])) {
      return true;
    }
  }
  return false;
}

function hasClosedNowPlotOwnerEvidence(scanner, plotStart, opening, recoveryBoundary, extent) {
  const { source } = scanner;
  const followingContentClose = scanner.tagAt(
    skipWhitespace(source, extent.end),
    'close',
    'content',
  );
  if (hasNonWhitespacePlotContent(source, plotStart, opening.start) && followingContentClose) {
    return false;
  }
  const recoveredText = source.slice(recoveryBoundary.end, extent.innerEnd);
  return hasStandaloneDialogueParagraph(recoveredText);
}

function hasCompletedStructuredChild(scanner, opening, extent, name = null) {
  let cursor = opening.end;
  while (cursor < extent.innerEnd) {
    const child = scanner.nextTag(cursor, extent.innerEnd);
    if (!child) {
      return false;
    }
    if (
      child.kind === 'open'
      && (!name || child.name === name)
      && elementExtent(scanner, child, extent.innerEnd).complete
    ) {
      return true;
    }
    cursor = child.end;
  }
  return false;
}

function findTopLevelPlotClose(scanner, start, end, contentOpening, plotOpening) {
  const { source } = scanner;
  let segmentStart = start;
  let cursor = start;

  while (cursor < end) {
    const tag = scanner.nextTag(cursor, end);
    if (!tag) {
      return null;
    }

    const attemptedDialogue = attemptedDialogueRange(scanner, segmentStart, tag.start, end)
      ?? attemptedDialogueBeforeClosingTag(scanner, segmentStart, tag.start, end, 'now_plot');
    if (attemptedDialogue) {
      segmentStart = attemptedDialogue.paragraphEnd;
      cursor = attemptedDialogue.paragraphEnd;
      continue;
    }
    if (tag.kind === 'close' && tag.name === 'now_plot') {
      if (
        scanner.overflowStart !== -1
        && tag.start >= scanner.overflowStart
        && scanner.terminalRootPair(end, contentOpening, plotOpening)?.plotClose !== tag
      ) {
        return null;
      }
      if (
        hasLaterPlotClose(scanner, tag.end, end)
        && hasCompletedLaterPlotContent(scanner, tag.end, end)
      ) {
        cursor = tag.end;
        continue;
      }
      return tag;
    }
    if (tag.kind !== 'open') {
      cursor = tag.end;
      continue;
    }

    const extent = scanner.overflowStart === -1
      ? opaqueAwareLocalElementExtent(scanner, tag, end)
      : elementExtent(scanner, tag, end);
    const recoveryBoundary = tag.name === 'now_plot' && extent.complete
      ? scanner.firstBoundary(tag.end, extent.innerEnd)
      : null;
    const localContentBoundary = tag.name === 'content' && extent.complete
      ? scanner.firstBoundary(tag.end, extent.innerEnd)
      : null;
    const precedingContentCloseTag = localContentBoundary
      ? scanner.previousTag(extent.innerEnd)
      : null;
    const localContentOwnsItsPlot = localContentBoundary
      && hasCompletedStructuredChild(scanner, tag, extent, 'now_plot');
    if (
      localContentBoundary
      && !localContentOwnsItsPlot
      && precedingContentCloseTag?.kind === 'close'
      && precedingContentCloseTag.name === 'now_plot'
      && precedingContentCloseTag.start >= localContentBoundary.end
      && isWhitespaceOnly(source.slice(precedingContentCloseTag.end, extent.innerEnd))
      && canFollowRecoveredRoot(source, extent.end)
    ) {
      segmentStart = localContentBoundary.end;
      cursor = localContentBoundary.end;
      continue;
    }
    const closingBelongsToEstablishedPlot = tag.name === 'now_plot'
      && !tag.selfClosing
      && extent.complete
      && recoveryBoundary
      && hasNonWhitespacePlotContent(source, recoveryBoundary.end, extent.innerEnd)
      && !hasCompletedStructuredChild(scanner, tag, extent)
      && !hasClosedNowPlotOwnerEvidence(scanner, start, tag, recoveryBoundary, extent)
      && !hasLaterPlotClose(scanner, extent.end, end)
      && !(
        hasCompletedLaterPlotContent(scanner, extent.end, end)
        && !findTopLevelContentClose(scanner, extent.end, end)
      );
    if (closingBelongsToEstablishedPlot) {
      segmentStart = recoveryBoundary.end;
      cursor = recoveryBoundary.end;
      continue;
    }
    if (extent.complete || extent.recoveryBoundaryFound) {
      segmentStart = extent.end;
      cursor = extent.end;
    } else {
      cursor = Math.max(tag.end, cursor + 1);
    }
  }
  return null;
}

function completedDialogueBeforeTag(source, segmentStart, tagStart) {
  const paragraphs = source
    .slice(segmentStart, tagStart)
    .replace(/\r\n?/gu, '\n')
    .split(/\n(?:[ \t]*\n)+/gu);
  let index = paragraphs.length - 1;
  while (index >= 0 && !paragraphs[index].trim()) {
    index -= 1;
  }
  return dialogueBlock(paragraphs[index]?.trim() ?? '') !== null;
}

function plotResult(blocks, errorCodes, legacyUsed, progressText = '') {
  return {
    blocks,
    errors: diagnostics(errorCodes),
    legacyUsed,
    progressText,
  };
}

function parsePlot(scanner, start, end, streaming) {
  const { source } = scanner;
  const blocks = [];
  const errorCodes = [];
  let legacyUsed = false;
  let segmentStart = start;
  let inertAdjacencyStart = start;
  let cursor = start;

  while (cursor < end) {
    if (blocks.length >= LIMITS.BLOCKS) {
      appendBlockCountExceeded(blocks, errorCodes, blockLimitSentinelRawText(scanner, segmentStart, end));
      return plotResult(blocks, errorCodes, legacyUsed);
    }
    const tag = scanner.nextTag(cursor, end);
    const inert = scanner.nextCompletedInert(cursor, end);
    if (
      scanner.overflowStart !== -1
      && scanner.overflowStart >= cursor
      && scanner.overflowStart < end
      && (!tag || scanner.overflowStart < tag.start)
    ) {
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        scanner.overflowStart,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      appendBlockCountExceeded(
        blocks,
        errorCodes,
        blockLimitSentinelRawText(scanner, scanner.overflowStart, end),
      );
      return plotResult(blocks, errorCodes, legacyUsed);
    }
    if (!tag) {
      if (!inert) {
        break;
      }
    }

    if (inert && (!tag || inert.start < tag.start)) {
      const priorIsDialogue = completedDialogueBeforeTag(
        source,
        Math.max(segmentStart, inertAdjacencyStart),
        inert.start,
      );
      const nextTag = scanner.nextTag(inert.end, end);
      const nextInert = scanner.nextCompletedInert(inert.end, end);
      const nextBoundary = scanner.firstBoundary(inert.end, end);
      const followingEnd = Math.min(
        nextTag?.start ?? end,
        nextInert?.start ?? end,
        nextBoundary?.start ?? end,
      );
      const followingIsDialogue = dialogueBlock(
        source.slice(inert.end, followingEnd).trim(),
      ) !== null;
      if (!priorIsDialogue && !followingIsDialogue) {
        inertAdjacencyStart = inert.end;
        cursor = inert.end;
        continue;
      }
      const directEnd = priorIsDialogue ? inert.start : inert.end;
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        directEnd,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
        appendBlockCountExceeded(
          blocks,
          errorCodes,
          blockLimitSentinelRawText(scanner, inert.start, end),
        );
        return plotResult(blocks, errorCodes, legacyUsed);
      }
      if (priorIsDialogue) {
        blocks.push({ type: 'narration', text: source.slice(inert.start, inert.end) });
      }
      segmentStart = inert.end;
      inertAdjacencyStart = inert.end;
      cursor = inert.end;
      continue;
    }

    const attemptedDialogue = unfinishedAttemptedDialogueRange(scanner, segmentStart, tag.start, end)
      ?? attemptedDialogueRange(scanner, segmentStart, tag.start, end);
    if (attemptedDialogue) {
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        attemptedDialogue.paragraphStart,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
        appendBlockCountExceeded(
          blocks,
          errorCodes,
          blockLimitSentinelRawText(scanner, attemptedDialogue.paragraphStart, end),
        );
        return plotResult(blocks, errorCodes, legacyUsed);
      }
      blocks.push(invalidBlock('invalid-local-block', attemptedDialogue.rawText));
      errorCodes.push('invalid-local-block');
      segmentStart = attemptedDialogue.paragraphEnd;
      cursor = attemptedDialogue.paragraphEnd;
      continue;
    }
    if (tag.kind !== 'open') {
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        tag.start,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
        appendBlockCountExceeded(
          blocks,
          errorCodes,
          blockLimitSentinelRawText(scanner, tag.start, end),
        );
        return plotResult(blocks, errorCodes, legacyUsed);
      }
      blocks.push(invalidBlock('invalid-local-block', tag.raw));
      errorCodes.push('invalid-local-block');
      segmentStart = tag.end;
      cursor = tag.end;
      continue;
    }

    const opening = tag;
    const extent = scanner.overflowStart === -1
      ? opaqueAwareLocalElementExtent(scanner, opening, end)
      : elementExtent(scanner, opening, end);
    if (
      streaming
      && opening.name === 'now_plot'
      && extent.complete
      && isWhitespaceOnly(source.slice(extent.end, end))
      && hasCompletedStructuredChild(scanner, opening, extent)
    ) {
      const pending = splitCompleteParagraphPrefix(
        scanner,
        segmentStart,
        opening.start,
        opening.start,
      );
      const prefix = ownedParagraphBlocks(
        scanner,
        segmentStart,
        pending.prefixEnd,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...prefix.blocks);
      errorCodes.push(...prefix.errors, 'stream-incomplete-special');
      if (prefix.exceeded || blocks.length >= LIMITS.BLOCKS) {
        appendBlockCountExceeded(
          blocks,
          errorCodes,
          blockLimitSentinelRawText(scanner, pending.remainderStart, end),
        );
        return plotResult(blocks, errorCodes, legacyUsed);
      }
      return plotResult(
        blocks,
        errorCodes,
        legacyUsed,
        source.slice(pending.remainderStart, end).trim(),
      );
    }
    if (
      !extent.complete
      && scanner.overflowStart > opening.start
      && scanner.overflowStart < end
      && scanner.nextClosingTag(opening.name, scanner.overflowStart, end)
    ) {
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        opening.start,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      appendBlockCountExceeded(
        blocks,
        errorCodes,
        blockLimitSentinelRawText(scanner, opening.start, end),
      );
      return plotResult(blocks, errorCodes, legacyUsed);
    }
    if (!extent.complete) {
      const streamingTailCanComplete = streaming
        && !opening.malformed
        && streamingElementCanStillComplete(scanner, opening, end);
      if (extent.recoveryBoundaryFound && !streamingTailCanComplete) {
        const direct = ownedParagraphBlocks(
          scanner,
          segmentStart,
          opening.start,
          LIMITS.BLOCKS - blocks.length,
        );
        blocks.push(...direct.blocks);
        errorCodes.push(...direct.errors);
        if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
          appendBlockCountExceeded(
            blocks,
            errorCodes,
            blockLimitSentinelRawText(scanner, opening.start, end),
          );
          return plotResult(blocks, errorCodes, legacyUsed);
        }
        blocks.push(invalidBlock('invalid-local-block', source.slice(opening.start, extent.end)));
        errorCodes.push('invalid-local-block');
        segmentStart = extent.end;
        cursor = extent.end;
        continue;
      }
      if (streaming) {
        const pending = splitCompleteParagraphPrefix(
          scanner,
          segmentStart,
          opening.start,
          opening.start,
        );
        const prefix = ownedParagraphBlocks(
          scanner,
          segmentStart,
          pending.prefixEnd,
          LIMITS.BLOCKS - blocks.length,
        );
        blocks.push(...prefix.blocks);
        errorCodes.push(...prefix.errors, 'stream-incomplete-special');
        if (prefix.exceeded || blocks.length >= LIMITS.BLOCKS) {
          appendBlockCountExceeded(
            blocks,
            errorCodes,
            blockLimitSentinelRawText(scanner, pending.remainderStart, end),
          );
          return plotResult(blocks, errorCodes, legacyUsed);
        }
        return plotResult(
          blocks,
          errorCodes,
          legacyUsed,
          source.slice(pending.remainderStart, end).trim(),
        );
      }
      const direct = ownedParagraphBlocks(
        scanner,
        segmentStart,
        opening.start,
        LIMITS.BLOCKS - blocks.length,
      );
      blocks.push(...direct.blocks);
      errorCodes.push(...direct.errors);
      if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
        appendBlockCountExceeded(
          blocks,
          errorCodes,
          blockLimitSentinelRawText(scanner, opening.start, end),
        );
        return plotResult(blocks, errorCodes, legacyUsed);
      }
      blocks.push(invalidBlock('invalid-local-block', source.slice(opening.start, end)));
      errorCodes.push('invalid-local-block');
      return plotResult(blocks, errorCodes, legacyUsed);
    }

    const direct = ownedParagraphBlocks(
      scanner,
      segmentStart,
      opening.start,
      LIMITS.BLOCKS - blocks.length,
    );
    blocks.push(...direct.blocks);
    errorCodes.push(...direct.errors);
    if (direct.exceeded || blocks.length >= LIMITS.BLOCKS) {
      appendBlockCountExceeded(
        blocks,
        errorCodes,
        blockLimitSentinelRawText(scanner, opening.start, end),
      );
      return plotResult(blocks, errorCodes, legacyUsed);
    }
    const rawText = source.slice(opening.start, extent.end);
    const block = parseElement(scanner, opening, extent, rawText);
    blocks.push(block);
    if (block.type === 'invalid') {
      errorCodes.push(block.reason);
    } else if (block.protocol === 'legacy-readonly') {
      legacyUsed = true;
    }
    segmentStart = extent.end;
    cursor = extent.end;
  }

  const pending = streaming
    ? splitCompleteParagraphPrefix(
      scanner,
      segmentStart,
      end,
      -1,
    )
    : { prefixEnd: end, remainderStart: end };
  const direct = ownedParagraphBlocks(
    scanner,
    segmentStart,
    pending.prefixEnd,
    LIMITS.BLOCKS - blocks.length,
  );
  blocks.push(...direct.blocks);
  errorCodes.push(...direct.errors);
  if (direct.exceeded) {
    appendBlockCountExceeded(
      blocks,
      errorCodes,
      blockLimitSentinelRawText(scanner, segmentStart, end),
    );
    return plotResult(blocks, errorCodes, legacyUsed);
  }
  return plotResult(blocks, errorCodes, legacyUsed, source.slice(pending.remainderStart, end).trim());
}

function parseCompleteContent(scanner, end, updateVariable, root = parseRootContext(scanner, end)) {
  const { source } = scanner;
  const header = parseHeaderPrefix(scanner, end);
  if (!header.ok) {
    return emptyResult(header.errors, updateVariable);
  }

  const plotClose = root.nowPlotClose;
  const contentClose = root.contentClose;
  if (
    !plotClose
    && contentClose
    && root.nowPlotOpening === header.nowPlot
    && contentClose.kind === 'close'
    && contentClose.end <= end
    && isWhitespaceOnly(source.slice(contentClose.end, end))
  ) {
    const plot = parsePlot(scanner, header.cursor, contentClose.start, false);
    return {
      ok: false,
      protocol: plot.legacyUsed ? 'legacy-readonly' : 'current',
      player: header.player,
      story: header.story,
      time: header.time,
      blocks: plot.blocks,
      updateVariable,
      errors: diagnostics(['invalid-root-structure', ...plot.errors.map((error) => error.code)]),
    };
  }
  if (
    !plotClose
    || !contentClose
    || root.nowPlotOpening !== header.nowPlot
    || contentClose.kind !== 'close'
    || contentClose.end > end
  ) {
    return emptyResult(['invalid-root-structure'], updateVariable);
  }
  let cursor = skipWhitespace(source, plotClose.end);
  if (cursor !== contentClose.start) {
    return emptyResult(['invalid-root-structure'], updateVariable);
  }
  cursor = contentClose.end;
  if (!isWhitespaceOnly(source.slice(cursor, end))) {
    return emptyResult(['invalid-trailing-content'], updateVariable);
  }

  const plot = parsePlot(scanner, header.cursor, plotClose.start, false);
  return {
    ok: true,
    protocol: plot.legacyUsed ? 'legacy-readonly' : 'current',
    player: header.player,
    story: header.story,
    time: header.time,
    blocks: plot.blocks,
    updateVariable,
    errors: plot.errors,
  };
}

function parseNarrativeFromScan(scanner, root = parseRootContext(scanner)) {
  const split = splitUpdateVariableFromScan(scanner.source, scanner, root);
  if (!split.ok) {
    return {
      ...emptyResult([]),
      errors: split.errors,
    };
  }
  return parseCompleteContent(scanner, split.content.length, split.updateVariable, root);
}

export function parseNarrative(source) {
  if (typeof source !== 'string') {
    return emptyResult(['invalid-source']);
  }
  if (source.length > LIMITS.SOURCE) {
    return emptyResult(['source-too-long']);
  }
  const { scanner, root } = scanOwnedStructure(source);
  return parseNarrativeFromScan(scanner, root);
}

function incompleteUpdateVariableStart(source, contentEnd) {
  const start = skipWhitespace(source, contentEnd);
  const opening = '<UpdateVariable>';
  const suffix = source.slice(start);
  if (suffix.length > 0 && suffix.length < opening.length && opening.startsWith(suffix)) {
    return start;
  }
  if (!source.startsWith(opening, start)) {
    return -1;
  }
  return source.indexOf('</UpdateVariable>', start + opening.length) === -1 ? start : -1;
}

export function parseStreamingNarrative(source) {
  if (typeof source !== 'string') {
    return { ...emptyResult(['invalid-source']), streaming: true, complete: false, progressText: '' };
  }
  if (source.length > LIMITS.SOURCE) {
    return { ...emptyResult(['source-too-long']), streaming: true, complete: false, progressText: '' };
  }
  const { scanner, root } = scanOwnedStructure(source);
  const contentEnd = root.contentEnd;
  if (contentEnd !== -1) {
    const partialUpdateStart = incompleteUpdateVariableStart(source, contentEnd);
    if (partialUpdateStart !== -1) {
      const parsedContent = parseCompleteContent(scanner, contentEnd, null, root);
      return {
        ...parsedContent,
        updateVariable: null,
        errors: diagnostics([...parsedContent.errors.map((error) => error.code), 'incomplete-update-variable']),
        streaming: true,
        complete: false,
        progressText: source.slice(partialUpdateStart),
      };
    }
    return { ...parseNarrativeFromScan(scanner, root), streaming: false, complete: true, progressText: '' };
  }

  const header = parseHeaderPrefix(scanner);
  if (!header.ok) {
    return { ...emptyResult(header.errors), streaming: true, complete: false, progressText: '' };
  }
  if (root.nowPlotOpening === header.nowPlot && root.nowPlotClose) {
    const plot = parsePlot(scanner, header.cursor, root.nowPlotClose.start, false);
    return {
      ok: true,
      protocol: plot.legacyUsed ? 'legacy-readonly' : 'current',
      player: header.player,
      story: header.story,
      time: header.time,
      blocks: plot.blocks,
      updateVariable: null,
      errors: plot.errors,
      streaming: true,
      complete: false,
      progressText: source.slice(root.nowPlotClose.end).trim(),
    };
  }
  const plot = parsePlot(scanner, header.cursor, source.length, true);
  const opaqueStart = scanner.opaqueUpdateVariableStart;
  if (
    opaqueStart !== -1
    && source.startsWith(UPDATE_VARIABLE_OPENING, opaqueStart)
    && plot.progressText === source.slice(opaqueStart).trim()
  ) {
    const closeStart = source.indexOf(UPDATE_VARIABLE_CLOSING, opaqueStart + UPDATE_VARIABLE_OPENING.length);
    if (closeStart !== -1 && plot.blocks.length < LIMITS.BLOCKS) {
      const closeEnd = closeStart + UPDATE_VARIABLE_CLOSING.length;
      plot.blocks.push(invalidBlock('unsupported-child', source.slice(opaqueStart, closeEnd)));
      plot.errors = diagnostics([...plot.errors.map((error) => error.code), 'unsupported-child']);
      plot.progressText = '';
    }
  }
  return {
    ok: true,
    protocol: plot.legacyUsed ? 'legacy-readonly' : 'current',
    player: header.player,
    story: header.story,
    time: header.time,
    blocks: plot.blocks,
    updateVariable: null,
    errors: plot.errors,
    streaming: true,
    complete: false,
    progressText: plot.progressText,
  };
}
