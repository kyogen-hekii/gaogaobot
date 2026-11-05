// Small JSONC reader with offsets, so editing one setting preserves other text.
export function parseJsonc(source) {
  let offset = 0;
  function skip() {
    while (offset < source.length) {
      if (/\s/.test(source[offset]) || source.charCodeAt(offset) === 0xfeff) { offset++; continue; }
      if (source.slice(offset, offset + 2) === '//') { while (offset < source.length && source[offset] !== '\n') offset++; continue; }
      if (source.slice(offset, offset + 2) === '/*') {
        const end = source.indexOf('*/', offset + 2);
        if (end < 0) throw new Error('Unterminated JSONC comment');
        offset = end + 2; continue;
      }
      break;
    }
  }
  function expect(char) { skip(); if (source[offset++] !== char) throw new Error(`Expected ${char} at ${offset - 1}`); }
  function value() {
    skip(); const start = offset; const char = source[offset];
    if (char === '{' || char === '[') {
      offset++; const object = char === '{'; const result = object ? Object.create(null) : [];
      const properties = new Map(); const close = object ? '}' : ']'; let trailingComma = false;
      skip();
      while (source[offset] !== close) {
        let key;
        if (object) { key = value().value; if (typeof key !== 'string') throw new Error('Invalid object key'); expect(':'); }
        const item = value();
        if (object) { if (properties.has(key)) throw new Error(`Duplicate JSONC key: ${key}`); result[key] = item.value; properties.set(key, item); }
        else result.push(item.value);
        skip(); trailingComma = false;
        if (source[offset] !== ',') break;
        offset++; skip(); trailingComma = source[offset] === close;
      }
      const closeOffset = offset; expect(close);
      return { value: result, start, end: offset, closeOffset, properties, trailingComma };
    }
    if (char === '"') {
      offset++;
      while (offset < source.length) {
        if (source[offset] === '\\') { offset += 2; continue; }
        if (source[offset++] === '"') return { value: JSON.parse(source.slice(start, offset)), start, end: offset };
      }
      throw new Error('Unterminated JSONC string');
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(offset));
    if (!token) throw new Error(`Invalid JSONC value at ${offset}`);
    offset += token[0].length;
    return { value: JSON.parse(token[0]), start, end: offset };
  }
  const root = value(); skip(); if (offset !== source.length) throw new Error('Unexpected trailing JSONC content');
  return root;
}

export function setTopLevel(source, key, value) {
  const root = parseJsonc(source);
  if (!root.properties) throw new Error('Settings must be a JSON object');
  const old = root.properties.get(key);
  const rendered = JSON.stringify(value, null, 2).replaceAll('\n', '\n  ');
  if (old) return source.slice(0, old.start) + rendered + source.slice(old.end);
  // Insert after the final value, before its trailing comment/comma if any.
  const last = [...root.properties.values()].at(-1);
  if (last) return source.slice(0, last.end) + `,\n  ${JSON.stringify(key)}: ${rendered}` + source.slice(last.end);
  return source.slice(0, root.closeOffset) + `\n  ${JSON.stringify(key)}: ${rendered}\n` + source.slice(root.closeOffset);
}
