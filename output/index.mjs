import { fileURLToPath } from 'node:url';
import { win32, posix } from 'node:path';
import { realpathSync as realpathSync$1, lstatSync, readdir, readdirSync, readlinkSync } from 'fs';
import * as actualFS from 'node:fs';
import { readFileSync } from 'node:fs';
import { lstat, readdir as readdir$1, readlink, realpath } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import Stream from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

let tracing = false;
let logger = console.log;
const noLog = () => {
};
let parserLog = noLog;
const withTraceLogging = () => stubTraceLogging;
function stubTraceLogging(ctx, trace, fn2) {
  return fn2(ctx);
}
function srcLog(src, pos, ...msgs) {
  logInternal(logger, src, pos, ...msgs);
}
function srcTrace(src, pos, ...msgs) {
  logInternal(parserLog, src, pos, ...msgs);
}
function resultLog(result, ...msgs) {
  const { src, srcMap, start, end } = result;
  srcLog(srcMap ?? src, [start, end - 1], ...msgs);
}
function ctxLog(ctx, ...msgs) {
  const src = ctx.srcMap ?? ctx.lexer.src;
  srcLog(src, ctx.lexer.position(), ...msgs);
}
function logInternal(log, srcOrSrcMap, destPos, ...msgs) {
  if (typeof srcOrSrcMap === "string") {
    logInternalSrc(log, srcOrSrcMap, destPos, ...msgs);
    return;
  }
  const { src, positions } = mapSrcPositions(srcOrSrcMap, destPos);
  logInternalSrc(log, src, positions, ...msgs);
}
function mapSrcPositions(srcMap, destPos) {
  var _a;
  const srcPos = srcMap.mapPositions(...[destPos].flat());
  const { src } = srcPos[0];
  let positions;
  if (((_a = srcPos[1]) == null ? void 0 : _a.src) === src) {
    positions = srcPos.map((p) => p.position);
  } else {
    positions = srcPos[0].position;
  }
  return { src, positions };
}
function logInternalSrc(log, src, pos, ...msgs) {
  log(...msgs);
  const { line: line2, lineNum, linePos, linePos2 } = srcLine(src, pos);
  log(line2, `  Ln ${lineNum}`);
  const caret = carets(linePos, linePos2);
  log(caret);
}
function carets(linePos, linePos2) {
  const firstCaret = " ".repeat(linePos) + "^";
  let secondCaret = "";
  if (linePos2 && linePos2 > linePos) {
    secondCaret = " ".repeat(linePos2 - linePos - 1) + "^";
  }
  return firstCaret + secondCaret;
}
const startCache = /* @__PURE__ */ new Map();
function srcLine(src, position) {
  let pos;
  let pos2;
  if (typeof position === "number") {
    pos = position;
  } else {
    [pos, pos2] = position;
  }
  const starts = getStarts(src);
  let start = 0;
  let end = starts.length - 1;
  if (pos >= starts[end]) {
    start = end;
  }
  while (start + 1 < end) {
    const mid = start + end >> 1;
    if (pos >= starts[mid]) {
      start = mid;
    } else {
      end = mid;
    }
  }
  let linePos2;
  if (pos2 !== void 0 && pos2 >= starts[start] && pos2 < starts[end]) {
    linePos2 = pos2 - starts[start];
  }
  const lineNl = src.slice(starts[start], starts[start + 1] || src.length);
  const line2 = lineNl.slice(-1) === "\n" ? lineNl.slice(0, -1) : lineNl;
  return { line: line2, linePos: pos - starts[start], linePos2, lineNum: start + 1 };
}
function getStarts(src) {
  const found = startCache.get(src);
  if (found)
    return found;
  const starts = [...src.matchAll(/\n/g)].map((m) => m.index + 1);
  starts.unshift(0);
  startCache.set(src, starts);
  return starts;
}
function matchingLexer(src, rootMatcher, ignore = /* @__PURE__ */ new Set(["ws"]), srcMap) {
  let matcher = rootMatcher;
  const matcherStack = [];
  matcher.start(src);
  function next() {
    const start = matcher.position();
    const { token } = toNextToken();
    if (token && tracing) {
      const text2 = quotedText(token == null ? void 0 : token.text);
      srcTrace(src, start, `: ${text2} (${token == null ? void 0 : token.kind})`);
    }
    return token;
  }
  function skipIgnored() {
    const { p } = toNextToken();
    matcher.position(p);
    return p;
  }
  function toNextToken() {
    let p = matcher.position();
    if (eof2())
      return { p };
    let token = matcher.next();
    while (token && ignore.has(token.kind)) {
      p = matcher.position();
      if (eof2())
        return { p };
      token = matcher.next();
    }
    return { p, token };
  }
  function pushMatcher(newMatcher, newIgnore) {
    const position2 = matcher.position();
    matcherStack.push({ matcher, ignore });
    newMatcher.start(src, position2);
    matcher = newMatcher;
    ignore = newIgnore;
  }
  function popMatcher() {
    const position2 = matcher.position();
    const elem = matcherStack.pop();
    if (!elem) {
      console.error("too many pops");
      return;
    }
    matcher = elem.matcher;
    ignore = elem.ignore;
    matcher.position(position2);
  }
  function position(pos) {
    if (pos !== void 0) {
      matcher.start(src, pos);
    }
    return matcher.position();
  }
  function withMatcher(newMatcher, fn2) {
    return withMatcherIgnore(newMatcher, ignore, fn2);
  }
  function withIgnore(newIgnore, fn2) {
    return withMatcherIgnore(matcher, newIgnore, fn2);
  }
  function withMatcherIgnore(tokenMatcher2, ignore2, fn2) {
    pushMatcher(tokenMatcher2, ignore2);
    const result = fn2();
    popMatcher();
    return result;
  }
  function eof2() {
    return matcher.position() === src.length;
  }
  return {
    next,
    position,
    withMatcher,
    withIgnore,
    eof: eof2,
    skipIgnored,
    src
  };
}
function quotedText(text2) {
  return text2 ? `'${text2.replace(/\n/g, "\\n")}'` : "";
}
function mergeTags(a, b) {
  const aKeys = Reflect.ownKeys(a);
  const sharedKeys = aKeys.filter((k) => b[k]);
  const sharedEntries = sharedKeys.map((k) => [
    k,
    [...a[k] ?? [], ...b[k] ?? []]
  ]);
  const shared = Object.fromEntries(sharedEntries);
  return { ...a, ...b, ...shared };
}
class ParseError extends Error {
  constructor(msg) {
    super(msg);
  }
}
function kind(kindStr) {
  return simpleParser(
    `kind '${kindStr}'`,
    (state) => {
      const next = state.lexer.next();
      return (next == null ? void 0 : next.kind) === kindStr ? next.text : null;
    }
  );
}
function text(value) {
  return simpleParser(
    `text ${quotedText(value)}'`,
    (state) => {
      const next = state.lexer.next();
      return (next == null ? void 0 : next.text) === value ? next.text : null;
    }
  );
}
function seq(...args) {
  const parsers = args.map(parserArg);
  const result = parser("seq", (ctx) => {
    const values = [];
    let tagged = {};
    for (const p of parsers) {
      const result2 = p._run(ctx);
      if (result2 === null)
        return null;
      tagged = mergeTags(tagged, result2.tags);
      values.push(result2.value);
    }
    return { value: values, tags: tagged };
  });
  return result;
}
function or(...args) {
  const parsers = args.map(parserArg);
  const result = parser("or", (state) => {
    for (const p of parsers) {
      const result2 = p._run(state);
      if (result2 !== null) {
        return result2;
      }
    }
    return null;
  });
  return result;
}
const undefinedResult = {
  value: void 0,
  tags: {}
};
function opt(arg) {
  const p = parserArg(arg);
  const result = parser(
    "opt",
    (state) => {
      const result2 = p._run(state);
      return result2 || undefinedResult;
    }
  );
  return result;
}
function not(arg) {
  const p = parserArg(arg);
  return parser("not", (state) => {
    const pos = state.lexer.position();
    const result = p._run(state);
    if (!result) {
      return { value: true, tags: {} };
    }
    state.lexer.position(pos);
    return null;
  });
}
function any() {
  return simpleParser("any", (state) => {
    const next = state.lexer.next();
    return next || null;
  });
}
function anyNot(arg) {
  return seq(not(arg), any()).map((r) => r.value[1]).traceName("anyNot");
}
function anyThrough(arg) {
  const p = parserArg(arg);
  const result = seq(repeat(anyNot(p)), p).traceName(
    `anyThrough ${p.debugName}`
  );
  return result;
}
function repeat(arg) {
  return parser("repeat", repeatWhileFilter(arg));
}
function repeatWhileFilter(arg, filterFn = () => true) {
  const p = parserArg(arg);
  return (ctx) => {
    const values = [];
    let results = {};
    for (; ; ) {
      const result = runExtended(ctx, p);
      if (result !== null && filterFn(result)) {
        values.push(result.value);
        results = mergeTags(results, result.tags);
      } else {
        const r = { value: values, tags: results };
        return r;
      }
    }
  };
}
function eof() {
  return simpleParser(
    "eof",
    (state) => state.lexer.eof() || null
  );
}
function req(arg, msg) {
  const p = parserArg(arg);
  return parser("req", (ctx) => {
    const result = p._run(ctx);
    if (result === null) {
      ctxLog(ctx, msg ?? `expected ${p.debugName}`);
      throw new ParseError();
    }
    return result;
  });
}
function yes() {
  return simpleParser("yes", () => true);
}
function withSep(sep, p, opts = {}) {
  const elem = Symbol();
  const { trailing = true, requireOne = false } = opts;
  const first = requireOne ? p : opt(p);
  const last2 = trailing ? opt(sep) : yes();
  return seq(first.tag(elem), repeat(seq(sep, p.tag(elem))), last2).map((r) => {
    const tags = r.tags;
    return tags[elem];
  }).traceName("withSep");
}
function tokens(matcher, arg) {
  const p = parserArg(arg);
  return parser(`tokens ${matcher._traceName}`, (state) => {
    return state.lexer.withMatcher(matcher, () => {
      return p._run(state);
    });
  });
}
function makeEolf(matcher, ws) {
  return tokens(
    matcher,
    tokenSkipSet(
      null,
      // disable automatic ws skipping so we can match newline
      seq(
        opt(kind(ws)),
        or("\n", eof())
      )
    )
  ).traceName("eolf");
}
function parserArg(arg) {
  if (typeof arg === "string") {
    return text(arg);
  } else if (arg instanceof Parser) {
    return arg;
  }
  return fn(arg);
}
function fn(fn2) {
  return parser("fn", (state) => {
    const stage = fn2();
    return stage._run(state);
  });
}
class Parser {
  constructor(args) {
    this.tracingName = args.traceName;
    this.tagName = args.tag;
    this.traceOptions = args.trace;
    this.terminal = args.terminal;
    this.preDisabled = args.preDisabled;
    this.clearTags = args.clearTags;
    this.fn = args.fn;
  }
  /** copy this parser with slightly different settings */
  _cloneWith(p) {
    return new Parser({
      traceName: this.tracingName,
      tag: this.tagName,
      trace: this.traceOptions,
      terminal: this.terminal,
      preDisabled: this.preDisabled,
      fn: this.fn,
      ...p
    });
  }
  /** run the parser given an already created parsing context */
  _run(context) {
    return runParser(this, context);
  }
  /**
   * tag results with a name,
   *
   * tagged results can be retrived with map(r => r.tags.myName)
   * note that tagged results are collected into an array,
   * multiple matches with the same name (even from different nested parsers) accumulate
   */
  tag(name) {
    const p = this._cloneWith({ tag: name });
    return p;
  }
  /** record a name for debug tracing */
  traceName(name) {
    return this._cloneWith({ traceName: name });
  }
  /** trigger tracing for this parser (and by default also this parsers descendants) */
  trace(opts = {}) {
    return this._cloneWith({ trace: opts });
  }
  /** map results to a new value, or add to app state as a side effect */
  map(fn2) {
    return map(this, fn2);
  }
  /** switch next parser based on results */
  toParser(fn2) {
    return toParser(this, fn2);
  }
  /** start parsing */
  parse(init) {
    try {
      const {
        lexer,
        maxParseCount,
        srcMap,
        app = { context: {}, state: [] }
      } = init;
      return this._run({
        lexer,
        app,
        srcMap,
        _preParse: [],
        _parseCount: 0,
        _preCacheFails: /* @__PURE__ */ new Map(),
        maxParseCount
      });
    } catch (e) {
      if (!(e instanceof ParseError)) {
        console.error(e);
      }
      return null;
    }
  }
  get debugName() {
    var _a;
    return this.tracingName ?? ((_a = this.tagName) == null ? void 0 : _a.toString()) ?? "parser";
  }
}
function parser(traceName, fn2, terminal) {
  const terminalArg = terminal ? { terminal } : {};
  return new Parser({ fn: fn2, traceName, ...terminalArg });
}
function simpleParser(traceName, fn2) {
  const parserFn = (ctx) => {
    const r = fn2(ctx);
    if (r == null || r === void 0)
      return null;
    return { value: r, tags: {} };
  };
  return parser(traceName, parserFn, true);
}
function runParser(p, context) {
  const { lexer, _parseCount = 0, maxParseCount } = context;
  context._parseCount = _parseCount + 1;
  if (maxParseCount && _parseCount > maxParseCount) {
    srcLog(lexer.src, lexer.position(), "infinite loop? ", p.debugName);
    return null;
  }
  const origAppContext = context.app.context;
  const origPosition = lexer.position();
  const result = withTraceLogging()(
    context,
    p.traceOptions,
    runInContext
  );
  function runInContext(tContext) {
    var _a;
    const traceSuccessOnly = (_a = tContext._trace) == null ? void 0 : _a.successOnly;
    if (!p.terminal && tracing && !traceSuccessOnly)
      parserLog(`..${p.tracingName}`);
    if (!p.preDisabled) {
      execPreParsers(tContext);
    } else {
      tContext._preParse = [];
    }
    const result2 = p.fn(tContext);
    if (result2 === null || result2 === void 0) {
      lexer.position(origPosition);
      context.app.context = origAppContext;
      return null;
    } else {
      const value = result2.value;
      let tags;
      if (p.clearTags) {
        tags = {};
      } else if (p.tagName && result2.value !== void 0) {
        tags = mergeTags(result2.tags, {
          [p.tagName]: [result2.value]
        });
      } else {
        tags = result2.tags;
      }
      return { value, tags };
    }
  }
  return result;
}
function execPreParsers(ctx) {
  const { _preParse, _preCacheFails, lexer } = ctx;
  const ctxNoPre = { ...ctx, _preParse: [] };
  _preParse.forEach((pre) => {
    const failCache = _preCacheFails.get(pre) || /* @__PURE__ */ new Set();
    _preCacheFails.set(pre, failCache);
    let position;
    let preResult;
    do {
      position = lexer.position();
      if (failCache.has(position))
        break;
      preResult = pre._run(ctxNoPre);
    } while (preResult !== null && preResult !== void 0);
    failCache.add(position);
    lexer.position(position);
  });
}
function map(p, fn2) {
  return parser(`map`, (ctx) => {
    const extended = runExtended(ctx, p);
    if (!extended)
      return null;
    const mappedValue = fn2(extended);
    if (mappedValue === null)
      return null;
    return { value: mappedValue, tags: extended.tags };
  });
}
function toParser(p, toParserFn) {
  return parser("toParser", (ctx) => {
    const extended = runExtended(ctx, p);
    if (!extended)
      return null;
    const newParser = toParserFn(extended);
    if (newParser === void 0) {
      return extended;
    }
    const nextResult = newParser._run(ctx);
    return nextResult;
  });
}
const emptySet = /* @__PURE__ */ new Set();
function tokenSkipSet(ignore, mainParser) {
  const ignoreSet = emptySet;
  return parser(
    `tokenIgnore ${[...ignoreSet.values()]}`,
    (ctx) => ctx.lexer.withIgnore(ignoreSet, () => mainParser._run(ctx))
  );
}
function preParse(pre, mainParser) {
  return parser("preParse", (ctx) => {
    const newCtx = { ...ctx, _preParse: [pre, ...ctx._preParse] };
    return mainParser._run(newCtx);
  });
}
function disablePreParse(parser2) {
  return parser2._cloneWith({ preDisabled: true });
}
function runExtended(ctx, p) {
  const origStart = ctx.lexer.position();
  const origResults = p._run(ctx);
  if (origResults === null) {
    ctx.lexer.position(origStart);
    return null;
  }
  const end = ctx.lexer.position();
  const src = ctx.lexer.src;
  ctx.lexer.position(origStart);
  const start = ctx.lexer.skipIgnored();
  ctx.lexer.position(end);
  const { app, srcMap } = ctx;
  return { ...origResults, start, end, app, src, srcMap, ctx };
}
class SrcMap {
  constructor(dest, entries = []) {
    this.dest = dest;
    this.entries = entries;
  }
  /** add a new mapping from src to dest ranges.
   * entries must be non-overlapping in the destination
   */
  addEntries(newEntries) {
    this.entries.push(...newEntries);
  }
  /** given positions in the dest string,
   * @return corresponding positions in the src strings */
  mapPositions(...positions) {
    return positions.map((p) => this.destToSrc(p));
  }
  /** internally compress adjacent entries where possible */
  compact() {
    if (!this.entries.length)
      return;
    let prev = this.entries[0];
    const newEntries = [prev];
    for (let i = 1; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.src === prev.src && prev.destEnd === e.destStart && prev.srcEnd === e.srcStart) {
        prev.destEnd = e.destEnd;
        prev.srcEnd = e.srcEnd;
      } else {
        newEntries.push(e);
        prev = e;
      }
    }
    this.entries = newEntries;
  }
  /** sort in destination order */
  sort() {
    this.entries.sort((a, b) => a.destStart - b.destStart);
  }
  /** This SrcMap's destination is a src for the other srcmap,
   * so combine the two and return the result.
   *
   */
  merge(other) {
    if (other === this)
      return this;
    const mappedEntries = other.entries.filter((e) => e.src === this.dest);
    if (mappedEntries.length === 0) {
      console.log("other source map does not link to this one");
      return other;
    }
    sortSrc(mappedEntries);
    const newEntries = mappedEntries.map((e) => {
      const { src, position: srcStart } = this.destToSrc(e.srcStart);
      const { src: endSrc, position: srcEnd } = this.destToSrc(e.srcEnd);
      if (endSrc !== src)
        throw new Error("NYI, need to split");
      const newEntry = {
        src,
        srcStart,
        srcEnd,
        destStart: e.destStart,
        destEnd: e.destEnd
      };
      return newEntry;
    });
    const otherSources = other.entries.filter((e) => e.src !== this.dest);
    const newMap = new SrcMap(other.dest, [...otherSources, ...newEntries]);
    newMap.sort();
    return newMap;
  }
  /**
   * @param entries should be sorted in destStart order
   * @return the source position corresponding to a provided destination position
   *
   */
  destToSrc(destPos) {
    const entry = this.entries.find(
      (e) => e.destStart <= destPos && e.destEnd >= destPos
    );
    if (!entry) {
      console.log(`no SrcMapEntry for dest position: ${destPos}`);
      return {
        src: this.dest,
        position: destPos
      };
    }
    return {
      src: entry.src,
      position: entry.srcStart + destPos - entry.destStart
    };
  }
}
function sortSrc(entries) {
  entries.sort((a, b) => a.srcStart - b.srcStart);
}
class Cache extends Map {
  constructor(max) {
    super();
    this.max = max;
  }
  set(k, v) {
    if (this.size > this.max) {
      this.delete(this.keys().next().value);
    }
    return super.set(k, v);
  }
}
function tokenMatcher(matchers, traceName = "matcher") {
  const groups = Object.keys(matchers);
  let src;
  const cache = new Cache(5);
  const expParts = Object.entries(matchers).map(toRegexSource).join("|");
  const exp = new RegExp(expParts, "midg");
  function start(text2, position2 = 0) {
    if (src !== text2) {
      cache.clear();
    }
    src = text2;
    exp.lastIndex = position2;
  }
  function next() {
    if (src === void 0) {
      throw new Error("start() first");
    }
    const startPos = exp.lastIndex;
    const found = cache.get(startPos);
    if (found) {
      exp.lastIndex += found.text.length;
      return found;
    }
    const matches = exp.exec(src);
    const matchedIndex = findGroupDex(matches == null ? void 0 : matches.indices);
    if (matchedIndex) {
      const { startEnd, groupDex } = matchedIndex;
      const kind2 = groups[groupDex];
      const text2 = src.slice(startEnd[0], startEnd[1]);
      const token = { kind: kind2, text: text2 };
      if (startPos != startEnd[0]) {
        srcLog(
          src,
          startPos,
          `skipped: '${src.slice(startPos, startEnd[0])}' to get to: '${text2}'`
        );
      }
      cache.set(startPos, token);
      return token;
    }
  }
  function position(pos) {
    if (pos !== void 0) {
      exp.lastIndex = pos;
    }
    return exp.lastIndex;
  }
  const keyEntries = groups.map((k) => [k, k]);
  const keys = Object.fromEntries(keyEntries);
  return {
    ...keys,
    start,
    next,
    position,
    _traceName: traceName
  };
}
function findGroupDex(indices) {
  if (indices) {
    for (let i = 1; i < indices.length; i++) {
      const startEnd = indices[i];
      if (startEnd) {
        return { startEnd, groupDex: i - 1 };
      }
    }
  }
}
function toRegexSource(nameExp) {
  const [name, e] = nameExp;
  if (typeof e === "string") {
    const expSrc = `(${escapeRegex(e)})`;
    verifyNonCapturing(name, new RegExp(expSrc));
    return expSrc;
  } else {
    verifyNonCapturing(name, e);
    return `(${e.source})`;
  }
}
function verifyNonCapturing(name, exp) {
  const willMatch = new RegExp("|" + exp.source);
  const result = willMatch.exec("");
  if (result.length > 1) {
    throw new Error(
      `match expression groups must be non-capturing: ${name}: /${exp.source}/. Use (?:...) instead.`
    );
  }
}
const regexSpecials = /[$+*.?|(){}[\]\\/^]/g;
function escapeRegex(s) {
  return s.replace(regexSpecials, "\\$&");
}
function matchOneOf(syms) {
  const symbolList = syms.split(" ").sort((a, b) => b.length - a.length);
  const escaped = symbolList.map(escapeRegex);
  return new RegExp(escaped.join("|"));
}
function refLog(ref, ...msgs) {
  if (ref.kind !== "gen") {
    moduleLog(ref.expMod, [ref.elem.start, ref.elem.end], ...msgs);
  } else {
    logger(ref.name, ...msgs);
  }
}
function moduleLog(mod, pos, ...msgs) {
  const { src, srcMap } = mod;
  srcLog(
    srcMap ?? src,
    pos,
    ...msgs,
    ` module: ${mod.name} ${mod.fileName || ""}`
  );
}
const tokenRegex = /\b(\w+)\b/gi;
function replaceWords(text2, replace) {
  return text2.replaceAll(tokenRegex, (s) => s in replace ? replace[s] : s);
}
function groupBy(a, key) {
  const groups = /* @__PURE__ */ new Map();
  for (const t of a) {
    const k = key(t);
    const group = groups.get(k) || [];
    group.push(t);
    groups.set(k, group);
  }
  return groups;
}
function partition(a, partFn) {
  const yesPart = [];
  const noPart = [];
  for (const t of a) {
    partFn(t) ? yesPart.push(t) : noPart.push(t);
  }
  return [yesPart, noPart];
}
function scan(array, fn2, zero) {
  const result = [zero];
  let current = zero;
  for (let i = 0; i < array.length; i++) {
    current = fn2(array[i], current);
    result.push(current);
  }
  return result;
}
function last(a) {
  return a[a.length - 1];
}
function sliceReplace(src, slices, start = 0, end = src.length) {
  const sorted = [...slices].sort((a, b) => a.start - b.start);
  const initProgress = { srcPos: start, destPos: 0, results: [], entries: [] };
  const slicePogress = scan(sorted, oneSlice, initProgress);
  const lastProgress = finalProgress2(slicePogress);
  const { results, entries } = lastProgress;
  const text2 = results.join("");
  const srcMap = new SrcMap(text2, entries);
  return srcMap;
  function oneSlice(slice, progress) {
    const copyText = src.slice(progress.srcPos, slice.start);
    const copied = replaceOne(copyText, slice.start, progress);
    const replaced = replaceOne(slice.replacement, slice.end, copied);
    return replaced;
  }
  function replaceOne(replacement, newSrcPos, progress) {
    const { destPos, entries: entries2 } = progress;
    const newDestPos = destPos + replacement.length;
    let newEntries = entries2;
    if (replacement) {
      const { srcPos } = progress;
      newEntries = entries2.concat({
        src,
        srcStart: srcPos,
        srcEnd: newSrcPos,
        destStart: destPos,
        destEnd: newDestPos
      });
    }
    const { results: results2 } = progress;
    const newResults = replacement ? results2.concat(replacement) : results2;
    return {
      srcPos: newSrcPos,
      destPos: newDestPos,
      results: newResults,
      entries: newEntries
    };
  }
  function finalProgress2(progress) {
    const lastProgress2 = last(progress) ?? initProgress;
    const { srcPos } = lastProgress2;
    return replaceOne(src.slice(srcPos, end), end, lastProgress2);
  }
}
function traverseRefs(srcModule, registry, fn2) {
  const { aliases, fns, structs, vars } = srcModule;
  const expMod = srcModule;
  const srcRefs = [...structs, ...vars, ...fns, ...aliases].map(
    (elem) => ({
      kind: "txt",
      proposedName: elem.name,
      expMod,
      elem
    })
  );
  srcRefs.forEach((ref) => fn2(ref));
  if (!srcRefs.length)
    return;
  const nonGenRefs = textRefs(srcRefs);
  const childRefs = nonGenRefs.flatMap(
    (srcRef) => elemRefs(srcRef, srcModule, registry)
  );
  recursiveRefs(childRefs, registry, fn2);
}
function recursiveRefs(refs, registry, fn2) {
  const filtered = refs.filter((r) => fn2(r));
  const nonGenRefs = textRefs(filtered);
  const modGroups = groupBy(nonGenRefs, (r) => r.expMod);
  [...modGroups.entries()].forEach(([mod, refs2]) => {
    if (refs2.length) {
      const childRefs = refs2.flatMap((r) => elemRefs(r, mod, registry));
      const noRepeats = childRefs.filter((r) => !includesRef(r, refs2));
      recursiveRefs(noRepeats, registry, fn2);
    }
  });
}
function includesRef(r, refs) {
  return !!refs.find((a) => matchRef(r, a));
}
function matchRef(a, b) {
  if (a.expMod.name !== b.expMod.name)
    return false;
  if (a.kind === "txt" && b.kind === "txt") {
    return a.elem.name == b.elem.name;
  }
  if (a.kind === "gen" && b.kind === "gen") {
    return a.name === b.name;
  }
  return false;
}
function textRefs(refs) {
  return refs.filter(textRef);
}
function textRef(ref) {
  return ref.kind !== "gen";
}
function elemRefs(srcRef, mod, registry) {
  const { elem } = srcRef;
  let fnRefs = [];
  let mergeRefs = [];
  if (elem.kind === "fn") {
    const userCalls = elem.calls.filter(
      (call) => !stdFn(call.name) && call.name !== elem.name
    );
    fnRefs = elemChildrenRefs(srcRef, userCalls, mod, registry);
  } else if (elem.kind === "struct") {
    mergeRefs = extendsRefs(srcRef, elem, mod, registry);
  }
  const userTypeRefs = elemTypeRefs(elem);
  const tRefs = elemChildrenRefs(srcRef, userTypeRefs, mod, registry);
  return [...fnRefs, ...tRefs, ...mergeRefs];
}
function elemTypeRefs(elem) {
  var _a;
  let typeRefs;
  const { kind: kind2 } = elem;
  if (kind2 === "fn" || kind2 === "var" || kind2 === "alias" || kind2 === "member") {
    typeRefs = elem.typeRefs;
  } else if (kind2 === "struct") {
    typeRefs = ((_a = elem.members) == null ? void 0 : _a.flatMap((m) => m.typeRefs)) || [];
  } else {
    console.error("unexpected kind", elem);
    typeRefs = [];
  }
  const userTypeRefs = typeRefs.filter((ref) => !stdType(ref.name));
  return userTypeRefs;
}
function elemChildrenRefs(srcRef, children, mod, registry) {
  return children.flatMap((elem) => elemRef(elem, srcRef, mod, registry));
}
function elemRef(elem, srcRef, mod, registry) {
  const { name } = elem;
  if (importArgRef(srcRef, name))
    return [];
  const foundRef = importRef(srcRef, name, mod, registry) ?? importingRef(srcRef, name, mod, registry) ?? localRef(name, mod);
  if (foundRef) {
    if (["typeRef", "call"].includes(elem.kind)) {
      elem.ref = foundRef;
    } else {
      console.error("unexpected kind", elem);
    }
  }
  if (foundRef)
    return [foundRef];
  moduleLog(srcRef.expMod, elem.start, `reference not found: ${name}`);
  return [];
}
function extendsRefs(srcRef, elem, mod, registry) {
  const merges = elem.extendsElems;
  if (!merges)
    return [];
  return merges.flatMap((merge) => {
    const foundRef = importRef(srcRef, merge.name, mod, registry);
    if (foundRef)
      return [foundRef];
    moduleLog(srcRef.expMod, merge.start, `import merge reference not found`);
    return [];
  });
}
function importArgRef(srcRef, name) {
  if (srcRef.expInfo) {
    return !!srcRef.expInfo.expImpArgs.find(([expArg]) => expArg === name);
  }
}
function importRef(fromRef, name, impMod, registry) {
  const fromImport = impMod.imports.find((imp) => importName(imp) == name);
  const modExp = matchingExport(fromImport, impMod, registry);
  if (!modExp || !fromImport)
    return;
  const expMod = modExp.module;
  const expImpArgs = matchImportExportArgs(
    impMod,
    fromImport,
    expMod,
    modExp.export
  );
  const expInfo = {
    fromImport,
    fromRef,
    expImpArgs
  };
  if (expMod.kind === "text") {
    const exp = modExp.export;
    return {
      kind: "txt",
      expInfo,
      expMod,
      elem: exp.ref,
      proposedName: fromImport.as ?? exp.ref.name
    };
  } else if (expMod.kind === "generator") {
    const exp = modExp.export;
    return {
      kind: "gen",
      expInfo,
      expMod,
      proposedName: fromImport.as ?? exp.name,
      name: exp.name
    };
  }
}
function matchImportExportArgs(impMod, imp, expMod, exp) {
  const impArgs = imp.args ?? [];
  const expArgs = exp.args ?? [];
  if (expArgs.length !== impArgs.length) {
    impMod.kind === "text" && moduleLog(impMod, imp.start, "mismatched import and export params");
    expMod.kind === "text" && moduleLog(expMod, exp.start);
  }
  return expArgs.map((p, i) => [p, impArgs[i]]);
}
function importingRef(srcRef, name, impMod, registry) {
  let fromImport;
  impMod.exports.find((exp) => {
    var _a;
    fromImport = (_a = exp.importing) == null ? void 0 : _a.find((i) => i.name === name);
    return !!fromImport;
  });
  const modExp = matchingExport(fromImport, impMod, registry);
  if (!modExp)
    return;
  if (srcRef.kind !== "txt") {
    refLog(srcRef, "unexpected srcRef", srcRef.kind);
    return;
  }
  const expImpArgs = importingArgs(fromImport, modExp.export, srcRef);
  const expInfo = {
    fromRef: srcRef,
    fromImport,
    expImpArgs
  };
  if (modExp.kind === "text") {
    const exp = modExp.export;
    return {
      kind: "txt",
      expInfo,
      expMod: modExp.module,
      elem: exp.ref,
      proposedName: fromImport.as ?? exp.ref.name
    };
  } else if (modExp.kind === "function") {
    const exp = modExp.export;
    return {
      kind: "gen",
      expInfo,
      expMod: modExp.module,
      proposedName: fromImport.as ?? exp.name,
      name: exp.name
    };
  }
  return void 0;
}
function importingArgs(imp, exp, srcRef) {
  if (srcRef.expInfo === void 0)
    return [];
  const expImp = matchImportExportArgs(
    srcRef.expInfo.fromRef.expMod,
    imp,
    srcRef.expMod,
    exp
  );
  const srcExpImp = srcRef.expInfo.expImpArgs;
  return expImp.flatMap(([iExp, iImp]) => {
    const pair = srcExpImp.find(([srcExpArg]) => srcExpArg === iImp);
    if (!pair) {
      moduleLog(srcRef.expMod, imp.start, "importing arg doesn't match export");
      return [];
    }
    const [, impArg] = pair;
    return [[iExp, impArg]];
  });
}
function matchingExport(imp, mod, registry) {
  if (!imp)
    return;
  const modExp = registry.getModuleExport(mod, imp.name, imp.from);
  if (!modExp) {
    moduleLog(mod, imp.start, "export not found for import");
  }
  return modExp;
}
function localRef(name, mod) {
  const elem = mod.fns.find((fn2) => fn2.name === name) ?? mod.structs.find((s) => s.name === name);
  if (elem) {
    return {
      kind: "txt",
      expMod: mod,
      elem,
      proposedName: elem.name,
      expInfo: void 0
    };
  }
}
function importName(asNamed) {
  return asNamed.as || asNamed.name;
}
const stdFns = `bitcast all any select arrayLength 
  abs acos acosh asin asinh atan atanh atan2 ceil clamp cos cosh 
  countLeadingZeros countOneBits countTrailingZeros cross 
  degrees determinant distance dot dot4UI8Packed dot4I8Packed 
  exp exp2 extractBits faceForward firstLeadingBit firstTrailingBit 
  floor fma fract frexp inserBits inverseSqrt ldexp length log log2
  max min mix modf normalize pow quantizeToF16 radians reflect refract
  reverseBits round saturate sin sinh smoothstep sqrt step tan tanh
  transpose trunc
  dpdx dpdxCoarse dpdxFine dpdy dpdyCoarse dpdyFine fwidth 
  fwdithCoarse fwidthFine
  textureDimensions textureGather textureGatherCompare textureLoad
  textureNumLayers textureNumLevels textureNumSamples
  textureSample textureSampleBias textureSampleCompare textureSampleCompareLevel
  textureSampleGrad textureSampleLevel textureSampleBaseClampToEdge
  textureStore
  atomicLoad atomicStore atomicAdd atomicSub atomicMax atomicMin
  atomicOr atomicXor atomicExchange atomicCompareExchangeWeak
  pack4x8snorm pack4x8unorm pack4xI8 pack4xU8 pack4xI8Clamp pack4xU8Clamp
  pack2x16snorm pack2x16unorm pack2x16float
  unpack4x8snorm unpack4x8unorm unpack4xI8 unpack4xU8 
  unpack2x16snorm unpack2x16unorm unpack2x16float
  storageBarrier textureBarrier workgroupBarrier workgroupUniformLoad
  `.split(/\s+/);
const stdTypes = `array atomic bool f16 f32 i32 
  mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4
  mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f mat3x4f
  mat4x2f mat4x3f mat4x4f
  mat2x2h mat2x3h mat2x4h mat3x2h mat3x3h mat3x4h
  mat4x2h mat4x3h mat4x4h
  u32 vec2 vec3 vec4 ptr
  vec2i vec3i vec4i vec2u vec3u vec4u
  vec2f vec3f vec4f vec2h vec3h vec4h
  texture_1d texture_2d texture_2d_array texture_3d 
  texture_cube texture_cube_array
  texture_multisampled texture_depth_multisampled_2d
  texture_external
  texture_storage_1d texture_storage_2d texture_storage_2d_array
  texture_storage_3d
  texture_depth_2d texture_depth_2d_array texture_depth_cube
  texture_depth_cube_array
  sampler sampler_comparison
  rgba8unorm rgba8snorm rgba8uint rgba8sint
  rgba16uint rgba16sint rgba16float 
  r32uint r32sint r32float rg32uint rg32sint rg32float
  rgba32uint rgba32sint rgba32float
  bgra8unorm 
  `.split(/\s+/);
function stdType(name) {
  return stdTypes.includes(name);
}
function refName(ref) {
  return ref.kind === "gen" ? ref.name : ref.elem.name;
}
function stdFn(name) {
  return stdFns.includes(name) || stdType(name);
}
function linkWgslModule(srcModule, registry, runtimeParams = {}) {
  const refs = findReferences(srcModule, registry);
  const loadRefs = prepRefsMergeAndLoad(refs);
  const directiveRefs = globalDirectiveRefs(srcModule);
  const extractRefs = [...loadRefs, ...directiveRefs];
  const rewriting = { extParams: runtimeParams, registry };
  return extractTexts(extractRefs, rewriting);
}
function findReferences(srcModule, registry) {
  const visited = /* @__PURE__ */ new Map();
  const found = [];
  const rootNames = /* @__PURE__ */ new Set();
  traverseRefs(srcModule, registry, handleRef);
  return found;
  function handleRef(ref) {
    let continueTraverse = false;
    const fullName = refFullName(ref);
    let linkName = visited.get(fullName);
    if (!linkName) {
      linkName = uniquifyName(ref.proposedName, rootNames);
      visited.set(fullName, linkName);
      rootNames.add(linkName);
      found.push(ref);
      continueTraverse = true;
    }
    if (refName(ref) !== linkName) {
      if (ref.rename)
        console.error("rename already?", ref.rename, linkName);
      ref.rename = linkName;
    }
    return continueTraverse;
  }
}
function uniquifyName(proposedName, rootNames) {
  let renamed = proposedName;
  let conflicts = 0;
  while (rootNames.has(renamed)) {
    renamed = proposedName + conflicts++;
  }
  return renamed;
}
function refFullName(ref) {
  var _a;
  const expImpArgs = ((_a = ref.expInfo) == null ? void 0 : _a.expImpArgs) ?? [];
  const impArgs = expImpArgs.map(([, arg]) => arg);
  const argsStr = "(" + impArgs.join(",") + ")";
  return ref.expMod.name + "." + refName(ref) + argsStr;
}
function prepRefsMergeAndLoad(refs) {
  const { generatorRefs, mergeRefs, nonMergeRefs } = partitionRefTypes(refs);
  const expRefs = combineMergeRefs(mergeRefs, nonMergeRefs);
  return [...generatorRefs, ...expRefs];
}
function combineMergeRefs(mergeRefs, nonMergeRefs) {
  const mergeMap = /* @__PURE__ */ new Map();
  mergeRefs.forEach((r) => {
    if (r.expInfo) {
      const fullName = refFullName(r.expInfo.fromRef);
      const merges = mergeMap.get(fullName) || [];
      merges.push(r);
      mergeMap.set(fullName, merges);
    }
  });
  const expRefs = nonMergeRefs.map((ref) => ({
    ...ref,
    mergeRefs: recursiveMerges(ref)
  }));
  return expRefs;
  function recursiveMerges(ref) {
    const fullName = refFullName(ref);
    const merges = mergeMap.get(fullName) ?? [];
    const transitiveMerges = merges.flatMap(recursiveMerges);
    return [...merges, ...transitiveMerges];
  }
}
function partitionRefTypes(refs) {
  const txt = refs.filter((r) => r.kind === "txt");
  const gen = refs.filter((r) => r.kind === "gen");
  const [merge, nonMerge] = partition(
    txt,
    (r) => {
      var _a;
      return ((_a = r.expInfo) == null ? void 0 : _a.fromImport.kind) === "extends";
    }
  );
  return {
    generatorRefs: gen,
    mergeRefs: merge,
    nonMergeRefs: nonMerge
  };
}
function globalDirectiveRefs(srcModule) {
  const directiveRefs = srcModule.globalDirectives.map(
    (e) => toDirectiveRef(e, srcModule)
  );
  return directiveRefs;
}
function toDirectiveRef(elem, expMod) {
  return {
    kind: "dir",
    elem,
    expMod
  };
}
function loadOtherElem(ref, rewriting) {
  const { expMod, elem } = ref;
  const typeRefs = elem.typeRefs ?? [];
  const slicing = typeRefSlices(typeRefs);
  const srcMap = sliceReplace(expMod.preppedSrc, slicing, elem.start, elem.end);
  return applyExpImp(srcMap.dest, ref, rewriting);
}
function loadGeneratedElem(ref, rewriting) {
  const genExp = ref.expMod.exports.find((e) => e.name === ref.name);
  if (!genExp) {
    refLog(ref, "missing generator", ref.name);
    return "//?";
  }
  const { extParams } = rewriting;
  const fnName = ref.rename ?? ref.proposedName ?? ref.name;
  const params = refExpImp(ref, extParams);
  const text2 = genExp == null ? void 0 : genExp.generate(fnName, params);
  return text2;
}
function extractTexts(refs, rewriting) {
  return refs.map((r) => {
    if (r.kind === "gen") {
      return loadGeneratedElem(r, rewriting);
    }
    if (r.kind === "txt") {
      const elemKind = r.elem.kind;
      if (elemKind === "fn") {
        return loadFnText(r.elem, r, rewriting);
      }
      if (elemKind === "struct") {
        return loadStruct(r, rewriting);
      }
      if (elemKind === "var" || elemKind === "alias") {
        return loadOtherElem(r, rewriting);
      }
      console.warn("can't extract. unexpected elem kind:", elemKind, r.elem);
    }
    if (r.kind === "dir") {
      return loadOtherElem(r, rewriting);
    }
  }).join("\n\n");
}
function loadStruct(ref, rewriting) {
  var _a, _b;
  const structElem = ref.elem;
  const rootMembers = ((_a = structElem.members) == null ? void 0 : _a.map((m) => loadMemberText(m, ref, rewriting))) ?? [];
  const newMembers = ((_b = ref.mergeRefs) == null ? void 0 : _b.flatMap((mergeRef) => {
    var _a2;
    const mergeStruct = mergeRef.elem;
    return (_a2 = mergeStruct.members) == null ? void 0 : _a2.map(
      (member) => loadMemberText(member, mergeRef, rewriting)
    );
  })) ?? [];
  const allMembers = [rootMembers, newMembers].flat().map((m) => "  " + m);
  const membersText = allMembers.join(",\n");
  const name = ref.rename || structElem.name;
  return `struct ${name} {
${membersText}
}`;
}
function loadMemberText(member, ref, rewriting) {
  const newRef = { ...ref, elem: member };
  return loadOtherElem(newRef, rewriting);
}
function refExpImp(ref, extParams) {
  var _a;
  const expImp = ((_a = ref.expInfo) == null ? void 0 : _a.expImpArgs) ?? [];
  const entries = expImp.map(([exp, imp]) => {
    if (imp.startsWith("ext.")) {
      const value = extParams[imp.slice(4)];
      if (value)
        return [exp, value];
      refLog(ref, "missing ext param", imp, extParams);
    }
    return [exp, imp];
  });
  return Object.fromEntries(entries);
}
function loadFnText(elem, ref, rewriting) {
  const { rename } = ref;
  const slicing = [];
  if (rename) {
    const { start, end } = elem.nameElem;
    slicing.push({ start, end, replacement: rename });
  }
  elem.calls.forEach((call) => {
    var _a;
    const rename2 = (_a = call == null ? void 0 : call.ref) == null ? void 0 : _a.rename;
    if (rename2) {
      const { start, end } = call;
      slicing.push({ start, end, replacement: rename2 });
    }
  });
  slicing.push(...typeRefSlices(elem.typeRefs));
  const srcMap = sliceReplace(
    ref.expMod.preppedSrc,
    slicing,
    elem.start,
    elem.end
  );
  return applyExpImp(srcMap.dest, ref, rewriting);
}
function applyExpImp(src, ref, rewriting) {
  const { extParams } = rewriting;
  const params = ref.kind === "txt" ? refExpImp(ref, extParams) : {};
  return replaceWords(src, params);
}
function typeRefSlices(typeRefs) {
  const slicing = [];
  typeRefs.forEach((typeRef) => {
    var _a;
    const rename = (_a = typeRef == null ? void 0 : typeRef.ref) == null ? void 0 : _a.rename;
    if (rename) {
      const { start, end } = typeRef;
      slicing.push({ start, end, replacement: rename });
    }
  });
  return slicing;
}
const eol = /\n/;
const directive$1 = /#[a-zA-Z_]\w*/;
const notDirective = /[^#\n]+/;
const symbolSet = "& && -> @ / ! [ ] { } : , = == != > >= < << <= % - -- . + ++ | || ( ) ; * ~ ^ // /* */ += -= *= /= %= &= |= ^= >>= <<= <<";
const symbol = matchOneOf(symbolSet);
const mainTokens = tokenMatcher(
  {
    directive: directive$1,
    attr: /@[a-zA-Z_]\w*/,
    word: /[a-zA-Z_]\w*/,
    // LATER consider making this 'ident' per wgsl spec (incl. non-ascii)   word,
    digits: /(?:0x)?[\d.]+[iuf]?/,
    // LATER parse more wgsl number variants
    symbol,
    ws: /\s+/
  },
  "main"
);
const moduleTokens = tokenMatcher(
  {
    ws: /\s+/,
    moduleName: /[a-zA-Z_][\w./-]*/
  },
  "moduleName"
);
const lineCommentTokens = tokenMatcher(
  {
    directive: directive$1,
    ws: /[ \t]+/,
    // note ws must be before notDirective
    notDirective,
    eol
  },
  "lineComment"
);
const argsTokens = tokenMatcher(
  {
    directive: directive$1,
    relPath: /[.][/\w._-]+/,
    arg: /[\w._-]+/,
    symbol,
    ws: /[ \t]+/,
    // don't include \n, so we can find eol separately
    eol
  },
  "argsTokens"
);
const conditionalsTokens = tokenMatcher(
  {
    directive: directive$1,
    eol,
    ws: /[ \t]+/,
    symbol: matchOneOf("// !"),
    word: /[^\s\n]+/
  },
  "conditionals"
);
const eolf$1 = makeEolf(conditionalsTokens, conditionalsTokens.ws);
const ifDirective = seq(
  "#if",
  seq(
    opt("!").tag("invert"),
    req(kind(conditionalsTokens.word).tag("name")),
    eolf$1
  )
).map((r) => {
  var _a, _b;
  const ifArg = (_a = r.tags["name"]) == null ? void 0 : _a[0];
  const invert = ((_b = r.tags["invert"]) == null ? void 0 : _b[0]) === "!";
  const { params } = r.app.state;
  const arg = !!params[ifArg];
  const truthy = invert ? !arg : arg;
  pushIfState(r, truthy);
});
const elseDirective = seq("#else", eolf$1).map((r) => {
  const oldTruth = popIfState(r);
  if (oldTruth === void 0)
    resultLog(r, "unmatched #else");
  pushIfState(r, !oldTruth);
});
const endifDirective = seq("#endif", eolf$1).map((r) => {
  const oldTruth = popIfState(r);
  if (oldTruth === void 0)
    resultLog(r, "unmatched #endif");
});
const directiveLine = seq(
  opt("//"),
  or(ifDirective, elseDirective, endifDirective)
);
const simpleLine = anyThrough("\n");
const lastLine = seq(any(), repeat(any()), eolf$1);
const regularLine = or(simpleLine, lastLine).map((r) => {
  if (!skippingIfBody(r)) {
    pushLine(r);
  }
});
const line = tokenSkipSet(null, regularLine);
const srcLines = seq(repeat(or(directiveLine, line)), eof());
function skippingIfBody(r) {
  const ifStack = r.app.state.ifStack;
  return !ifStack.every(({ truthy }) => truthy);
}
function pushIfState(r, truthy) {
  r.app.state.ifStack.push({ truthy, pos: r });
}
function popIfState(r) {
  const ifStack = r.app.state.ifStack;
  const result = ifStack.pop();
  return result == null ? void 0 : result.truthy;
}
function pushLine(r) {
  const line2 = r.src.slice(r.start, r.end);
  const { state } = r.app;
  const entry = {
    src: r.src,
    srcStart: r.start,
    srcEnd: r.end,
    destStart: state.destLength,
    destEnd: state.destLength + line2.length
  };
  state.srcMapEntries.push(entry);
  state.destLength += line2.length;
  state.lines.push(line2);
}
function processConditionals(src, params) {
  const lines = [];
  const srcMapEntries = [];
  const ifStack = [];
  srcLines.parse({
    lexer: matchingLexer(src, conditionalsTokens),
    app: {
      context: {},
      state: { ifStack, lines, srcMapEntries, destLength: 0, params }
    },
    maxParseCount: 1e6
  });
  if (ifStack.length > 0) {
    const { pos } = ifStack.slice(-1)[0];
    srcLog(src, [pos.start, pos.end], "unmatched #if/#else");
  }
  const text2 = lines.join("");
  const srcMap = new SrcMap(text2);
  srcMap.addEntries(srcMapEntries);
  srcMap.compact();
  return srcMap;
}
const word = kind(mainTokens.word);
const wordNum = or(word, kind(mainTokens.digits));
const unknown = any().map((r) => {
  const { kind: kind2, text: text2 } = r.value;
  resultLog(r, `??? ${kind2}: '${text2}'`);
});
const blockComment = seq(
  "/*",
  repeat(or(() => blockComment, anyNot("*/"))),
  req("*/")
);
const comment = or(() => lineCommentOptDirective, blockComment);
const eolf = disablePreParse(
  makeEolf(argsTokens, argsTokens.ws)
);
const wordNumArgs = seq(
  "(",
  withSep(",", wordNum),
  req(")")
).map((r) => r.value[1]);
function makeElem(kind2, er, tags = [], tagArrays = []) {
  const { start, end } = er;
  const nv = mapIfDefined(tags, er.tags, true);
  const av = mapIfDefined(tagArrays, er.tags);
  return { kind: kind2, start, end, ...nv, ...av };
}
function mapIfDefined(keys, array, firstElemOnly) {
  const entries = keys.flatMap((k) => {
    const ak = array[k];
    const v = firstElemOnly ? ak == null ? void 0 : ak[0] : ak;
    if (v === void 0)
      return [];
    else
      return [[k, v]];
  });
  return Object.fromEntries(entries);
}
const argsWord = kind(argsTokens.arg);
const fromWord = or(argsWord, kind(argsTokens.relPath));
const directiveArgs = seq(
  "(",
  withSep(",", argsWord),
  req(")")
).map((r) => r.value[1]);
function importPhrase(kind2) {
  const p = seq(
    argsWord.tag("name"),
    opt(directiveArgs.tag("args")),
    opt(seq("as", argsWord.tag("as"))),
    opt(seq("from", fromWord.tag("from")))
  ).map((r) => {
    const named = ["name", "from", "as", "args"];
    return makeElem(kind2, r, named, []);
  });
  return p;
}
const importElemPhrase = importPhrase("import");
const extendsElemPhrase = importPhrase("extends");
const importing = seq(
  "importing",
  seq(importElemPhrase.tag("importing")),
  repeat(seq(",", importElemPhrase.tag("importing")))
);
const importDirective = seq(
  "#import",
  seq(importElemPhrase.tag("i"), eolf)
).map((r) => {
  const imp = r.tags.i[0];
  imp.start = r.start;
  r.app.state.push(imp);
});
const extendsTag = "-extends-";
const extendsDirective = seq(
  "#extends",
  seq(extendsElemPhrase.tag(extendsTag), eolf)
).map((r) => {
  const imp = r.tags[extendsTag][0];
  imp.start = r.start;
  r.app.state.push(imp);
});
const exportDirective = seq(
  "#export",
  seq(opt(directiveArgs.tag("args")), opt(importing), eolf)
).map((r) => {
  const e = makeElem("export", r, ["args"], ["importing"]);
  r.app.state.push(e);
});
const moduleDirective = oneArgDirective("module");
const templateDirective = oneArgDirective("template");
function oneArgDirective(elemKind) {
  return seq(
    `#${elemKind}`,
    tokens(moduleTokens, req(kind(moduleTokens.moduleName).tag("name"))),
    eolf
  ).map((r) => {
    const e = makeElem(elemKind, r, ["name"]);
    r.app.state.push(e);
  });
}
const directive = tokens(
  argsTokens,
  seq(
    repeat("\n"),
    or(
      exportDirective,
      importDirective,
      extendsDirective,
      moduleDirective,
      templateDirective
    )
  )
);
const skipToEol = tokens(lineCommentTokens, anyThrough(eolf));
const lineCommentOptDirective = seq(
  tokens(mainTokens, "//"),
  or(directive, skipToEol)
);
const lParen = "(";
const rParen = ")";
const optAttributes = repeat(seq(kind(mainTokens.attr), opt(wordNumArgs)));
const possibleTypeRef = Symbol("typeRef");
const globalDirectiveOrAssert = seq(
  or("diagnostic", "enable", "requires", "const_assert"),
  req(anyThrough(";"))
).map((r) => {
  const e = makeElem("globalDirective", r);
  r.app.state.push(e);
});
const typeNameDecl = req(word.tag("name")).map((r) => {
  return makeElem("typeName", r, ["name"]);
});
const fnNameDecl = req(word.tag("name"), "missing fn name").map((r) => {
  return makeElem("fnName", r, ["name"]);
});
const template = seq(
  "<",
  or(
    word.tag(possibleTypeRef),
    // only the first element of the template can be a type
    () => template
  ),
  repeat(
    or(
      () => template,
      anyNot(">")
      // we don't care about the rest of the template
    )
  ),
  req(">")
);
const typeSpecifier = seq(
  word.tag(possibleTypeRef),
  opt(template)
).map(
  (r) => r.tags[possibleTypeRef].map((name) => {
    const e = makeElem("typeRef", r);
    e.name = name;
    return e;
  })
);
const structMember = seq(
  optAttributes,
  word.tag("name"),
  ":",
  req(typeSpecifier.tag("typeRefs"))
).map((r) => {
  return makeElem("member", r, ["name", "typeRefs"]);
});
const structDecl = seq(
  "struct",
  req(typeNameDecl).tag("nameElem"),
  req("{"),
  withSep(",", structMember).tag("members"),
  req("}")
).map((r) => {
  const e = makeElem("struct", r, ["members"]);
  const nameElem = r.tags.nameElem[0];
  e.nameElem = nameElem;
  e.name = nameElem.name;
  r.app.state.push(e);
});
const callishKeyword = simpleParser("keyword", (ctx) => {
  const keywords = ["if", "for", "while", "const_assert", "return"];
  const token = ctx.lexer.next();
  const text2 = token == null ? void 0 : token.text;
  if (text2 && keywords.includes(text2)) {
    return text2;
  }
});
const fnCall = seq(
  word.tag("name").map((r) => makeElem("call", r, ["name"])).tag("calls"),
  // we collect this in fnDecl, to attach to FnElem
  "("
);
const fnParam = seq(
  optAttributes,
  word,
  opt(seq(":", req(typeSpecifier.tag("typeRefs"))))
);
const fnParamList = seq(lParen, withSep(",", fnParam), rParen);
const variableDecl = seq(
  or("const", "var", "let", "override"),
  word,
  ":",
  req(typeSpecifier).tag("typeRefs")
);
const block = seq(
  "{",
  repeat(
    or(
      callishKeyword,
      fnCall,
      () => block,
      variableDecl,
      anyNot("}")
    )
  ),
  req("}")
);
const fnDecl = seq(
  optAttributes,
  "fn",
  req(fnNameDecl).tag("nameElem"),
  req(fnParamList),
  opt(seq("->", optAttributes, typeSpecifier.tag("typeRefs"))),
  req(block)
).map((r) => {
  var _a;
  const e = makeElem("fn", r);
  const nameElem = r.tags.nameElem[0];
  e.nameElem = nameElem;
  e.name = nameElem.name;
  e.calls = r.tags.calls || [];
  e.typeRefs = ((_a = r.tags.typeRefs) == null ? void 0 : _a.flat()) || [];
  r.app.state.push(e);
});
const globalVar = seq(
  optAttributes,
  or("const", "override", "var"),
  opt(template),
  word.tag("name"),
  opt(seq(":", req(typeSpecifier.tag("typeRefs")))),
  req(anyThrough(";"))
).map((r) => {
  var _a;
  const e = makeElem("var", r, ["name"]);
  e.typeRefs = ((_a = r.tags.typeRefs) == null ? void 0 : _a.flat()) || [];
  r.app.state.push(e);
});
const globalAlias = seq(
  "alias",
  req(word.tag("name")),
  req("="),
  req(typeSpecifier).tag("typeRefs"),
  req(";")
).map((r) => {
  const e = makeElem("alias", r, ["name", "typeRefs"]);
  r.app.state.push(e);
});
const globalDecl = or(fnDecl, globalVar, globalAlias, structDecl, ";");
const rootDecl = or(globalDirectiveOrAssert, globalDecl, directive, unknown);
const root = preParse(comment, seq(repeat(rootDecl), eof()));
function parseWgslD(src, srcMap, params = {}, maxParseCount = void 0, grammar = root) {
  const lexer = matchingLexer(src, mainTokens);
  const state = [];
  const context = { ifStack: [], params };
  const app = {
    context,
    state
  };
  const init = {
    lexer,
    app,
    srcMap,
    maxParseCount
  };
  grammar.parse(init);
  return app.state;
}
let unnamedModuleDex = 0;
let unnamedFileDex = 0;
function preProcess(src, params = {}, templates = /* @__PURE__ */ new Map()) {
  const condSrcMap = processConditionals(src, params);
  return applyTemplate(condSrcMap, templates, params);
}
function parseModule(src, templates = /* @__PURE__ */ new Map(), fileName = `/unnamed-${unnamedFileDex++}`, params = {}, defaultModuleName) {
  var _a, _b;
  const srcMap = preProcess(src, params, templates);
  const preppedSrc = srcMap.dest;
  const parsed = parseWgslD(preppedSrc, srcMap);
  const exports = findExports(parsed, srcMap);
  const fns = filterElems(parsed, "fn");
  const aliases = filterElems(parsed, "alias");
  const globalDirectives = filterElems(
    parsed,
    "globalDirective"
  );
  const imports = parsed.filter(
    (e) => e.kind === "import" || e.kind === "extends"
  );
  const structs = filterElems(parsed, "struct");
  const vars = filterElems(parsed, "var");
  const template2 = (_a = filterElems(parsed, "template")) == null ? void 0 : _a[0];
  matchMergeImports(parsed, srcMap);
  const moduleName = (_b = filterElems(parsed, "module")[0]) == null ? void 0 : _b.name;
  matchMergeImports(parsed, srcMap);
  const name = moduleName ?? defaultModuleName ?? `module${unnamedModuleDex++}`;
  const kind2 = "text";
  return {
    ...{ kind: kind2, src, srcMap, preppedSrc, fileName, name },
    ...{
      exports,
      fns,
      structs,
      vars,
      imports,
      template: template2,
      aliases,
      globalDirectives
    }
  };
}
function filterElems(parsed, kind2) {
  return parsed.filter((e) => e.kind === kind2);
}
function findExports(parsed, srcMap) {
  const results = [];
  const exports = findKind(parsed, "export");
  exports.forEach(([elem, i]) => {
    let next;
    do {
      next = parsed[++i];
    } while ((next == null ? void 0 : next.kind) === "extends");
    if (elem.kind === "export") {
      if ((next == null ? void 0 : next.kind) === "fn" || (next == null ? void 0 : next.kind) === "struct") {
        results.push({ ...elem, ref: next });
      } else {
        srcLog(srcMap, elem.start, `#export what? (#export a fn or struct)`);
      }
    }
  });
  return results;
}
function matchMergeImports(parsed, srcMap) {
  const extendsElems = findKind(parsed, "extends");
  extendsElems.forEach(([extendsElem, i]) => {
    let next;
    do {
      next = parsed[++i];
    } while ((next == null ? void 0 : next.kind) === "extends" || (next == null ? void 0 : next.kind) === "export");
    if ((next == null ? void 0 : next.kind) === "struct") {
      next.extendsElems = next.extendsElems ?? [];
      next.extendsElems.push(extendsElem);
    } else {
      srcLog(srcMap, extendsElem.start, `#extends not followed by a struct`);
    }
  });
}
function findKind(parsed, kind2) {
  return parsed.flatMap(
    (elem, i) => elem.kind === kind2 ? [[elem, i]] : []
  );
}
const templateRegex = /#template\s+([/[a-zA-Z_][\w./-]*)/;
function applyTemplate(priorSrcMap, templates, params) {
  const src = priorSrcMap.dest;
  const foundTemplate = src.match(templateRegex);
  if (!foundTemplate) {
    return priorSrcMap;
  }
  const templateName = foundTemplate[1];
  const templateFn = templates.get(templateName);
  if (!templateFn) {
    srcLog(
      priorSrcMap,
      foundTemplate.index,
      `template '${templateName}' not found in ModuleRegistry`
    );
    return priorSrcMap;
  }
  const start = foundTemplate.index;
  const end = start + foundTemplate[0].length;
  const rmDirective = { start, end, replacement: "" };
  const removedMap = sliceReplace(src, [rmDirective]);
  const removeMerged = priorSrcMap.merge(removedMap);
  const templatedMap = templateFn(removeMerged.dest, params);
  const srcMap = removeMerged.merge(templatedMap);
  return srcMap;
}
function relativePath(srcPath, reqPath) {
  if (!srcPath)
    return reqPath;
  const srcDir = dirname(srcPath);
  const relative = join(srcDir, reqPath);
  return relative;
}
function dirname(path) {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1)
    return path;
  return path.slice(0, lastSlash);
}
function join(a, b) {
  const joined = b.startsWith("/") ? a + b : a + "/" + b;
  return normalize$1(joined);
}
function normalize$1(path) {
  const segments = path.split("/");
  const noDots = segments.filter((s) => s !== ".");
  const noDbl = [];
  noDots.forEach((s) => {
    if (s !== "") {
      if (s === ".." && noDbl.length && noDbl[noDbl.length - 1] !== "..") {
        noDbl.pop();
      } else {
        noDbl.push(s);
      }
    }
  });
  return noDbl.join("/");
}
function noSuffix(path) {
  const lastSlash = path.lastIndexOf("/");
  const lastStart = lastSlash === -1 ? 0 : lastSlash + 1;
  const suffix = path.indexOf(".", lastStart);
  const suffixStart = suffix === -1 ? path.length : suffix;
  return path.slice(0, suffixStart);
}
let unnamedCodeDex = 0;
let unnamedTextDex = 0;
class ModuleRegistry {
  constructor(args) {
    this.exports = /* @__PURE__ */ new Map();
    this.templates = /* @__PURE__ */ new Map();
    this.textModules = [];
    this.wgslSrc = /* @__PURE__ */ new Map();
    if (!args)
      return;
    const { wgsl = {}, rawWgsl = [], templates = [], generators } = args;
    Object.entries(wgsl).forEach(
      ([fileName, src]) => this.addModuleSrc(src, fileName)
    );
    rawWgsl.forEach((src) => this.addModuleSrc(src));
    templates && this.registerTemplate(...templates);
    generators == null ? void 0 : generators.map((g) => this.registerGenerator(g));
  }
  /**
   * Produce a linked wgsl string with all directives processed
   * (e.g. #import'd functions from other modules are inserted into the resulting string).
   * @param moduleName select the module to use as the root source
   * @param runtimeParams runtime parameters for #import/#export values,
   *  template values, and code generation parameters
   */
  link(moduleName, runtimeParams = {}) {
    this._parseSrc(runtimeParams);
    const rootModule = this.findTextModule(moduleName);
    if (!rootModule) {
      console.error("no module found for ", moduleName);
      return "";
    }
    return linkWgslModule(rootModule, this, runtimeParams);
  }
  _parseSrc(runtimeParams = {}) {
    this.textModules = [];
    this.wgslSrc.forEach((src, fileName) => {
      this.registerOneModule(src, runtimeParams, fileName);
    });
  }
  addModuleSrc(src, fileName) {
    if (fileName) {
      this.wgslSrc.set(normalize$1(fileName), src);
    } else {
      this.wgslSrc.set(`rawWgsl-${unnamedTextDex++}`, src);
    }
  }
  /** register one module's exports  */
  registerOneModule(src, params = {}, fileName, moduleName) {
    const newFileName = fileName && normalize$1(fileName);
    const m = parseModule(src, this.templates, newFileName, params, moduleName);
    this.addTextModule(m);
  }
  /** register a function that generates code on demand */
  registerGenerator(reg) {
    const exp = {
      name: reg.name,
      args: reg.args ?? [],
      generate: reg.generate
    };
    const module = {
      kind: "generator",
      name: reg.moduleName ?? `funModule${unnamedCodeDex++}`,
      exports: [exp]
    };
    const moduleExport = {
      module,
      export: exp,
      kind: "function"
    };
    this.addModuleExport(moduleExport);
  }
  /** register a template processor  */
  registerTemplate(...templates) {
    templates.forEach((t) => this.templates.set(t.name, t.apply));
  }
  /** fetch a template processor */
  getTemplate(name) {
    return this.templates.get(name);
  }
  /** return a reference to an exported text fragment or code generator (i.e. in response to an #import request) */
  getModuleExport(requesting, exportName2, moduleName) {
    const exports = this.exports.get(exportName2);
    if (!exports) {
      return void 0;
    } else if (moduleName == null ? void 0 : moduleName.startsWith(".")) {
      const searchName = relativePath(requesting.fileName, moduleName);
      const baseSearch = noSuffix(searchName);
      return exports.find((e) => {
        const fileName = e.module.fileName;
        if (!fileName)
          return false;
        if (fileName === searchName)
          return true;
        if (baseSearch === noSuffix(fileName))
          return true;
      });
    } else if (moduleName) {
      return exports.find((e) => e.module.name === moduleName);
    } else if (exports.length === 1) {
      return exports[0];
    } else {
      const moduleNames = exports.map((e) => e.module.name).join(", ");
      console.warn(
        `Multiple modules export "${exportName2}". (${moduleNames}) Use "#import ${exportName2} from <moduleName>" to select which one import`
      );
    }
  }
  findTextModule(searchName) {
    const moduleNameMatch = this.textModules.find(
      (m) => m.name === searchName || m.fileName === searchName
    );
    if (moduleNameMatch)
      return moduleNameMatch;
    const baseSearch = normalize$1(searchName);
    const pathMatch = this.textModules.find(
      (m) => m.fileName === baseSearch || noSuffix(m.fileName) === baseSearch
    );
    if (pathMatch)
      return pathMatch;
  }
  addTextModule(module) {
    this.textModules.push(module);
    module.exports.forEach((e) => {
      const moduleExport = {
        module,
        export: e,
        kind: "text"
      };
      this.addModuleExport(moduleExport);
    });
  }
  addModuleExport(moduleExport) {
    const expName = exportName(moduleExport);
    const existing = this.exports.get(expName);
    if (existing) {
      existing.push(moduleExport);
    } else {
      this.exports.set(expName, [moduleExport]);
    }
  }
}
function exportName(moduleExport) {
  if (moduleExport.kind === "text") {
    return moduleExport.export.ref.name;
  } else {
    return moduleExport.export.name;
  }
}

/* webgpu-utils@1.9.2, license MIT */
function keysOf(obj) {
    return Object.keys(obj);
}

const createTypeDefs = (defs) => defs;
const b = createTypeDefs({
    i32: { numElements: 1, align: 4, size: 4, type: 'i32', View: Int32Array },
    u32: { numElements: 1, align: 4, size: 4, type: 'u32', View: Uint32Array },
    f32: { numElements: 1, align: 4, size: 4, type: 'f32', View: Float32Array },
    f16: { numElements: 1, align: 2, size: 2, type: 'u16', View: Uint16Array },
    vec2f: { numElements: 2, align: 8, size: 8, type: 'f32', View: Float32Array },
    vec2i: { numElements: 2, align: 8, size: 8, type: 'i32', View: Int32Array },
    vec2u: { numElements: 2, align: 8, size: 8, type: 'u32', View: Uint32Array },
    vec2h: { numElements: 2, align: 4, size: 4, type: 'u16', View: Uint16Array },
    vec3i: { numElements: 3, align: 16, size: 12, type: 'i32', View: Int32Array },
    vec3u: { numElements: 3, align: 16, size: 12, type: 'u32', View: Uint32Array },
    vec3f: { numElements: 3, align: 16, size: 12, type: 'f32', View: Float32Array },
    vec3h: { numElements: 3, align: 8, size: 6, type: 'u16', View: Uint16Array },
    vec4i: { numElements: 4, align: 16, size: 16, type: 'i32', View: Int32Array },
    vec4u: { numElements: 4, align: 16, size: 16, type: 'u32', View: Uint32Array },
    vec4f: { numElements: 4, align: 16, size: 16, type: 'f32', View: Float32Array },
    vec4h: { numElements: 4, align: 8, size: 8, type: 'u16', View: Uint16Array },
    // AlignOf(vecR)	SizeOf(array<vecR, C>)
    mat2x2f: { numElements: 4, align: 8, size: 16, type: 'f32', View: Float32Array },
    mat2x2h: { numElements: 4, align: 4, size: 8, type: 'u16', View: Uint16Array },
    mat3x2f: { numElements: 6, align: 8, size: 24, type: 'f32', View: Float32Array },
    mat3x2h: { numElements: 6, align: 4, size: 12, type: 'u16', View: Uint16Array },
    mat4x2f: { numElements: 8, align: 8, size: 32, type: 'f32', View: Float32Array },
    mat4x2h: { numElements: 8, align: 4, size: 16, type: 'u16', View: Uint16Array },
    mat2x3f: { numElements: 8, align: 16, size: 32, pad: [3, 1], type: 'f32', View: Float32Array },
    mat2x3h: { numElements: 8, align: 8, size: 16, pad: [3, 1], type: 'u16', View: Uint16Array },
    mat3x3f: { numElements: 12, align: 16, size: 48, pad: [3, 1], type: 'f32', View: Float32Array },
    mat3x3h: { numElements: 12, align: 8, size: 24, pad: [3, 1], type: 'u16', View: Uint16Array },
    mat4x3f: { numElements: 16, align: 16, size: 64, pad: [3, 1], type: 'f32', View: Float32Array },
    mat4x3h: { numElements: 16, align: 8, size: 32, pad: [3, 1], type: 'u16', View: Uint16Array },
    mat2x4f: { numElements: 8, align: 16, size: 32, type: 'f32', View: Float32Array },
    mat2x4h: { numElements: 8, align: 8, size: 16, type: 'u16', View: Uint16Array },
    mat3x4f: { numElements: 12, align: 16, size: 48, pad: [3, 1], type: 'f32', View: Float32Array },
    mat3x4h: { numElements: 12, align: 8, size: 24, pad: [3, 1], type: 'u16', View: Uint16Array },
    mat4x4f: { numElements: 16, align: 16, size: 64, type: 'f32', View: Float32Array },
    mat4x4h: { numElements: 16, align: 8, size: 32, type: 'u16', View: Uint16Array },
    // Note: At least as of WGSL V1 you can not create a bool for uniform or storage.
    // You can only create one in an internal struct. But, this code generates
    // views of structs and it needs to not fail if the struct has a bool
    bool: { numElements: 0, align: 1, size: 0, type: 'bool', View: Uint32Array },
});
const kWGSLTypeInfo = createTypeDefs({
    ...b,
    'atomic<i32>': b.i32,
    'atomic<u32>': b.u32,
    'vec2<i32>': b.vec2i,
    'vec2<u32>': b.vec2u,
    'vec2<f32>': b.vec2f,
    'vec2<f16>': b.vec2h,
    'vec3<i32>': b.vec3i,
    'vec3<u32>': b.vec3u,
    'vec3<f32>': b.vec3f,
    'vec3<f16>': b.vec3h,
    'vec4<i32>': b.vec4i,
    'vec4<u32>': b.vec4u,
    'vec4<f32>': b.vec4f,
    'vec4<f16>': b.vec4h,
    'mat2x2<f32>': b.mat2x2f,
    'mat2x2<f16>': b.mat2x2h,
    'mat3x2<f32>': b.mat3x2f,
    'mat3x2<f16>': b.mat3x2h,
    'mat4x2<f32>': b.mat4x2f,
    'mat4x2<f16>': b.mat4x2h,
    'mat2x3<f32>': b.mat2x3f,
    'mat2x3<f16>': b.mat2x3h,
    'mat3x3<f32>': b.mat3x3f,
    'mat3x3<f16>': b.mat3x3h,
    'mat4x3<f32>': b.mat4x3f,
    'mat4x3<f16>': b.mat4x3h,
    'mat2x4<f32>': b.mat2x4f,
    'mat2x4<f16>': b.mat2x4h,
    'mat3x4<f32>': b.mat3x4f,
    'mat3x4<f16>': b.mat3x4h,
    'mat4x4<f32>': b.mat4x4f,
    'mat4x4<f16>': b.mat4x4h,
});
const kWGSLTypes = keysOf(kWGSLTypeInfo);

/**
 * Set which intrinsic types to make views for.
 *
 * Example:
 *
 * Given a an array of intrinsics like this
 * `array<vec3, 200>`
 *
 * The default is to create a single `Float32Array(4 * 200)`
 * because creating 200 `Float32Array` views is not usually
 * what you want.
 *
 * If you do want individual views then you'd call
 * `setIntrinsicsToView(['vec3f'])` and now you get
 * an array of 200 `Float32Array`s.
 *
 * Note: `setIntrinsicsToView` always sets ALL types. The list you
 * pass it is the types you want views created for, all other types
 * will be reset to do the default. In other words
 *
 * ```js
 * setIntrinsicsToView(['vec3f'])
 * setIntrinsicsToView(['vec2f'])
 * ```
 *
 * Only `vec2f` will have views created. `vec3f` has been reset to the default by
 * the second call
 *
 * You can pass in `true` as the 2nd parameter to make it set which types
 * to flatten and all others will be set to have views created. For example
 * to expand all types would be `setIntrinsicsToView([], true)`. To expand
 * all except `f32` would be `setIntrinsicsToView(['f32'], true)`.
 *
 * To reset all types to the default call it with no arguments
 *
 * @param types array of types to make views for
 * @param flatten whether to flatten or expand the specified types.
 */
function setIntrinsicsToView(types = [], flatten) {
    // we need to track what we've viewed because for example `vec3f` references
    // the same info as `vec3<f32>` so we'd set one and reset the other.
    const visited = new Set();
    for (const type of kWGSLTypes) {
        const info = kWGSLTypeInfo[type];
        if (!visited.has(info)) {
            visited.add(info);
            info.flatten = types.includes(type) ? flatten : !flatten;
        }
    }
}
setIntrinsicsToView();

class ParseContext {
    constructor() {
        this.constants = new Map();
        this.aliases = new Map();
        this.structs = new Map();
    }
}
/**
 * @class Node
 * @category AST
 * Base class for AST nodes parsed from a WGSL shader.
 */
class Node {
    constructor() { }
    get isAstNode() {
        return true;
    }
    get astNodeType() {
        return "";
    }
    evaluate(context) {
        throw new Error("Cannot evaluate node");
    }
    evaluateString(context) {
        return this.evaluate(context).toString();
    }
    search(callback) { }
    searchBlock(block, callback) {
        if (block) {
            callback(_BlockStart.instance);
            for (const node of block) {
                if (node instanceof Array) {
                    this.searchBlock(node, callback);
                }
                else {
                    node.search(callback);
                }
            }
            callback(_BlockEnd.instance);
        }
    }
}
// For internal use only
class _BlockStart extends Node {
}
_BlockStart.instance = new _BlockStart();
// For internal use only
class _BlockEnd extends Node {
}
_BlockEnd.instance = new _BlockEnd();
/**
 * @class Statement
 * @extends Node
 * @category AST
 */
class Statement extends Node {
    constructor() {
        super();
    }
}
/**
 * @class Function
 * @extends Statement
 * @category AST
 */
class Function extends Statement {
    constructor(name, args, returnType, body, startLine, endLine) {
        super();
        this.calls = new Set();
        this.name = name;
        this.args = args;
        this.returnType = returnType;
        this.body = body;
        this.startLine = startLine;
        this.endLine = endLine;
    }
    get astNodeType() {
        return "function";
    }
    search(callback) {
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class StaticAssert
 * @extends Statement
 * @category AST
 */
class StaticAssert extends Statement {
    constructor(expression) {
        super();
        this.expression = expression;
    }
    get astNodeType() {
        return "staticAssert";
    }
    search(callback) {
        this.expression.search(callback);
    }
}
/**
 * @class While
 * @extends Statement
 * @category AST
 */
class While extends Statement {
    constructor(condition, body) {
        super();
        this.condition = condition;
        this.body = body;
    }
    get astNodeType() {
        return "while";
    }
    search(callback) {
        this.condition.search(callback);
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class Continuing
 * @extends Statement
 * @category AST
 */
class Continuing extends Statement {
    constructor(body) {
        super();
        this.body = body;
    }
    get astNodeType() {
        return "continuing";
    }
    search(callback) {
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class For
 * @extends Statement
 * @category AST
 */
class For extends Statement {
    constructor(init, condition, increment, body) {
        super();
        this.init = init;
        this.condition = condition;
        this.increment = increment;
        this.body = body;
    }
    get astNodeType() {
        return "for";
    }
    search(callback) {
        var _a, _b, _c;
        (_a = this.init) === null || _a === void 0 ? void 0 : _a.search(callback);
        (_b = this.condition) === null || _b === void 0 ? void 0 : _b.search(callback);
        (_c = this.increment) === null || _c === void 0 ? void 0 : _c.search(callback);
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class Var
 * @extends Statement
 * @category AST
 */
class Var extends Statement {
    constructor(name, type, storage, access, value) {
        super();
        this.name = name;
        this.type = type;
        this.storage = storage;
        this.access = access;
        this.value = value;
    }
    get astNodeType() {
        return "var";
    }
    search(callback) {
        var _a;
        callback(this);
        (_a = this.value) === null || _a === void 0 ? void 0 : _a.search(callback);
    }
}
/**
 * @class Override
 * @extends Statement
 * @category AST
 */
class Override extends Statement {
    constructor(name, type, value) {
        super();
        this.name = name;
        this.type = type;
        this.value = value;
    }
    get astNodeType() {
        return "override";
    }
    search(callback) {
        var _a;
        (_a = this.value) === null || _a === void 0 ? void 0 : _a.search(callback);
    }
}
/**
 * @class Let
 * @extends Statement
 * @category AST
 */
class Let extends Statement {
    constructor(name, type, storage, access, value) {
        super();
        this.name = name;
        this.type = type;
        this.storage = storage;
        this.access = access;
        this.value = value;
    }
    get astNodeType() {
        return "let";
    }
    search(callback) {
        var _a;
        callback(this);
        (_a = this.value) === null || _a === void 0 ? void 0 : _a.search(callback);
    }
}
/**
 * @class Const
 * @extends Statement
 * @category AST
 */
class Const extends Statement {
    constructor(name, type, storage, access, value) {
        super();
        this.name = name;
        this.type = type;
        this.storage = storage;
        this.access = access;
        this.value = value;
    }
    get astNodeType() {
        return "const";
    }
    evaluate(context) {
        return this.value.evaluate(context);
    }
    search(callback) {
        var _a;
        callback(this);
        (_a = this.value) === null || _a === void 0 ? void 0 : _a.search(callback);
    }
}
var IncrementOperator;
(function (IncrementOperator) {
    IncrementOperator["increment"] = "++";
    IncrementOperator["decrement"] = "--";
})(IncrementOperator || (IncrementOperator = {}));
(function (IncrementOperator) {
    function parse(val) {
        const key = val;
        if (key == "parse")
            throw new Error("Invalid value for IncrementOperator");
        return IncrementOperator[key];
    }
    IncrementOperator.parse = parse;
})(IncrementOperator || (IncrementOperator = {}));
/**
 * @class Increment
 * @extends Statement
 * @category AST
 */
class Increment extends Statement {
    constructor(operator, variable) {
        super();
        this.operator = operator;
        this.variable = variable;
    }
    get astNodeType() {
        return "increment";
    }
    search(callback) {
        this.variable.search(callback);
    }
}
var AssignOperator;
(function (AssignOperator) {
    AssignOperator["assign"] = "=";
    AssignOperator["addAssign"] = "+=";
    AssignOperator["subtractAssin"] = "-=";
    AssignOperator["multiplyAssign"] = "*=";
    AssignOperator["divideAssign"] = "/=";
    AssignOperator["moduloAssign"] = "%=";
    AssignOperator["andAssign"] = "&=";
    AssignOperator["orAssign"] = "|=";
    AssignOperator["xorAssign"] = "^=";
    AssignOperator["shiftLeftAssign"] = "<<=";
    AssignOperator["shiftRightAssign"] = ">>=";
})(AssignOperator || (AssignOperator = {}));
(function (AssignOperator) {
    function parse(val) {
        const key = val;
        if (key == "parse") {
            throw new Error("Invalid value for AssignOperator");
        }
        //return AssignOperator[key];
        return key;
    }
    AssignOperator.parse = parse;
})(AssignOperator || (AssignOperator = {}));
/**
 * @class Assign
 * @extends Statement
 * @category AST
 */
class Assign extends Statement {
    constructor(operator, variable, value) {
        super();
        this.operator = operator;
        this.variable = variable;
        this.value = value;
    }
    get astNodeType() {
        return "assign";
    }
    search(callback) {
        this.variable.search(callback);
        this.value.search(callback);
    }
}
/**
 * @class Call
 * @extends Statement
 * @category AST
 */
class Call extends Statement {
    constructor(name, args) {
        super();
        this.name = name;
        this.args = args;
    }
    get astNodeType() {
        return "call";
    }
    search(callback) {
        for (const node of this.args) {
            node.search(callback);
        }
        callback(this);
    }
}
/**
 * @class Loop
 * @extends Statement
 * @category AST
 */
class Loop extends Statement {
    constructor(body, continuing) {
        super();
        this.body = body;
        this.continuing = continuing;
    }
    get astNodeType() {
        return "loop";
    }
}
/**
 * @class Switch
 * @extends Statement
 * @category AST
 */
class Switch extends Statement {
    constructor(condition, body) {
        super();
        this.condition = condition;
        this.body = body;
    }
    get astNodeType() {
        return "body";
    }
}
/**
 * @class If
 * @extends Statement
 * @category AST
 */
class If extends Statement {
    constructor(condition, body, elseif, _else) {
        super();
        this.condition = condition;
        this.body = body;
        this.elseif = elseif;
        this.else = _else;
    }
    get astNodeType() {
        return "if";
    }
    search(callback) {
        this.condition.search(callback);
        this.searchBlock(this.body, callback);
        this.searchBlock(this.elseif, callback);
        this.searchBlock(this.else, callback);
    }
}
/**
 * @class Return
 * @extends Statement
 * @category AST
 */
class Return extends Statement {
    constructor(value) {
        super();
        this.value = value;
    }
    get astNodeType() {
        return "return";
    }
    search(callback) {
        var _a;
        (_a = this.value) === null || _a === void 0 ? void 0 : _a.search(callback);
    }
}
/**
 * @class Enable
 * @extends Statement
 * @category AST
 */
class Enable extends Statement {
    constructor(name) {
        super();
        this.name = name;
    }
    get astNodeType() {
        return "enable";
    }
}
/**
 * @class Requires
 * @extends Statement
 * @category AST
 */
class Requires extends Statement {
    constructor(extensions) {
        super();
        this.extensions = extensions;
    }
    get astNodeType() {
        return "requires";
    }
}
/**
 * @class Diagnostic
 * @extends Statement
 * @category AST
 */
class Diagnostic extends Statement {
    constructor(severity, rule) {
        super();
        this.severity = severity;
        this.rule = rule;
    }
    get astNodeType() {
        return "diagnostic";
    }
}
/**
 * @class Alias
 * @extends Statement
 * @category AST
 */
class Alias extends Statement {
    constructor(name, type) {
        super();
        this.name = name;
        this.type = type;
    }
    get astNodeType() {
        return "alias";
    }
}
/**
 * @class Discard
 * @extends Statement
 * @category AST
 */
class Discard extends Statement {
    constructor() {
        super();
    }
    get astNodeType() {
        return "discard";
    }
}
/**
 * @class Break
 * @extends Statement
 * @category AST
 */
class Break extends Statement {
    constructor() {
        super();
    }
    get astNodeType() {
        return "break";
    }
}
/**
 * @class Continue
 * @extends Statement
 * @category AST
 */
class Continue extends Statement {
    constructor() {
        super();
    }
    get astNodeType() {
        return "continue";
    }
}
/**
 * @class Type
 * @extends Statement
 * @category AST
 */
class Type extends Statement {
    constructor(name) {
        super();
        this.name = name;
    }
    get astNodeType() {
        return "type";
    }
    get isStruct() {
        return false;
    }
    get isArray() {
        return false;
    }
}
/**
 * @class StructType
 * @extends Type
 * @category AST
 */
class Struct extends Type {
    constructor(name, members, startLine, endLine) {
        super(name);
        this.members = members;
        this.startLine = startLine;
        this.endLine = endLine;
    }
    get astNodeType() {
        return "struct";
    }
    get isStruct() {
        return true;
    }
    /// Return the index of the member with the given name, or -1 if not found.
    getMemberIndex(name) {
        for (let i = 0; i < this.members.length; i++) {
            if (this.members[i].name == name)
                return i;
        }
        return -1;
    }
}
/**
 * @class TemplateType
 * @extends Type
 * @category AST
 */
class TemplateType extends Type {
    constructor(name, format, access) {
        super(name);
        this.format = format;
        this.access = access;
    }
    get astNodeType() {
        return "template";
    }
}
/**
 * @class PointerType
 * @extends Type
 * @category AST
 */
class PointerType extends Type {
    constructor(name, storage, type, access) {
        super(name);
        this.storage = storage;
        this.type = type;
        this.access = access;
    }
    get astNodeType() {
        return "pointer";
    }
}
/**
 * @class ArrayType
 * @extends Type
 * @category AST
 */
class ArrayType extends Type {
    constructor(name, attributes, format, count) {
        super(name);
        this.attributes = attributes;
        this.format = format;
        this.count = count;
    }
    get astNodeType() {
        return "array";
    }
    get isArray() {
        return true;
    }
}
/**
 * @class SamplerType
 * @extends Type
 * @category AST
 */
class SamplerType extends Type {
    constructor(name, format, access) {
        super(name);
        this.format = format;
        this.access = access;
    }
    get astNodeType() {
        return "sampler";
    }
}
/**
 * @class Expression
 * @extends Node
 * @category AST
 */
class Expression extends Node {
    constructor() {
        super();
    }
}
/**
 * @class StringExpr
 * @extends Expression
 * @category AST
 */
class StringExpr extends Expression {
    constructor(value) {
        super();
        this.value = value;
    }
    get astNodeType() {
        return "stringExpr";
    }
    toString() {
        return this.value;
    }
    evaluateString() {
        return this.value;
    }
}
/**
 * @class CreateExpr
 * @extends Expression
 * @category AST
 */
class CreateExpr extends Expression {
    constructor(type, args) {
        super();
        this.type = type;
        this.args = args;
    }
    get astNodeType() {
        return "createExpr";
    }
    search(callback) {
        callback(this);
        for (const node of this.args) {
            node.search(callback);
        }
    }
}
/**
 * @class CallExpr
 * @extends Expression
 * @category AST
 */
class CallExpr extends Expression {
    constructor(name, args) {
        super();
        this.name = name;
        this.args = args;
    }
    get astNodeType() {
        return "callExpr";
    }
    evaluate(context) {
        switch (this.name) {
            case "abs":
                return Math.abs(this.args[0].evaluate(context));
            case "acos":
                return Math.acos(this.args[0].evaluate(context));
            case "acosh":
                return Math.acosh(this.args[0].evaluate(context));
            case "asin":
                return Math.asin(this.args[0].evaluate(context));
            case "asinh":
                return Math.asinh(this.args[0].evaluate(context));
            case "atan":
                return Math.atan(this.args[0].evaluate(context));
            case "atan2":
                return Math.atan2(this.args[0].evaluate(context), this.args[1].evaluate(context));
            case "atanh":
                return Math.atanh(this.args[0].evaluate(context));
            case "ceil":
                return Math.ceil(this.args[0].evaluate(context));
            case "clamp":
                return Math.min(Math.max(this.args[0].evaluate(context), this.args[1].evaluate(context)), this.args[2].evaluate(context));
            case "cos":
                return Math.cos(this.args[0].evaluate(context));
            //case "cross":
            //TODO: (x[i] * y[j] - x[j] * y[i])
            case "degrees":
                return (this.args[0].evaluate(context) * 180) / Math.PI;
            //case "determinant":
            //TODO implement
            case "distance":
                return Math.sqrt(Math.pow(this.args[0].evaluate(context) - this.args[1].evaluate(context), 2));
            case "dot":
            //TODO: (x[i] * y[i])
            case "exp":
                return Math.exp(this.args[0].evaluate(context));
            case "exp2":
                return Math.pow(2, this.args[0].evaluate(context));
            //case "extractBits":
            //TODO: implement
            //case "firstLeadingBit":
            //TODO: implement
            case "floor":
                return Math.floor(this.args[0].evaluate(context));
            case "fma":
                return (this.args[0].evaluate(context) * this.args[1].evaluate(context) +
                    this.args[2].evaluate(context));
            case "fract":
                return (this.args[0].evaluate(context) -
                    Math.floor(this.args[0].evaluate(context)));
            //case "frexp":
            //TODO: implement
            case "inverseSqrt":
                return 1 / Math.sqrt(this.args[0].evaluate(context));
            //case "length":
            //TODO: implement
            case "log":
                return Math.log(this.args[0].evaluate(context));
            case "log2":
                return Math.log2(this.args[0].evaluate(context));
            case "max":
                return Math.max(this.args[0].evaluate(context), this.args[1].evaluate(context));
            case "min":
                return Math.min(this.args[0].evaluate(context), this.args[1].evaluate(context));
            case "mix":
                return (this.args[0].evaluate(context) *
                    (1 - this.args[2].evaluate(context)) +
                    this.args[1].evaluate(context) * this.args[2].evaluate(context));
            case "modf":
                return (this.args[0].evaluate(context) -
                    Math.floor(this.args[0].evaluate(context)));
            case "pow":
                return Math.pow(this.args[0].evaluate(context), this.args[1].evaluate(context));
            case "radians":
                return (this.args[0].evaluate(context) * Math.PI) / 180;
            case "round":
                return Math.round(this.args[0].evaluate(context));
            case "sign":
                return Math.sign(this.args[0].evaluate(context));
            case "sin":
                return Math.sin(this.args[0].evaluate(context));
            case "sinh":
                return Math.sinh(this.args[0].evaluate(context));
            case "saturate":
                return Math.min(Math.max(this.args[0].evaluate(context), 0), 1);
            case "smoothstep":
                return (this.args[0].evaluate(context) *
                    this.args[0].evaluate(context) *
                    (3 - 2 * this.args[0].evaluate(context)));
            case "sqrt":
                return Math.sqrt(this.args[0].evaluate(context));
            case "step":
                return this.args[0].evaluate(context) < this.args[1].evaluate(context)
                    ? 0
                    : 1;
            case "tan":
                return Math.tan(this.args[0].evaluate(context));
            case "tanh":
                return Math.tanh(this.args[0].evaluate(context));
            case "trunc":
                return Math.trunc(this.args[0].evaluate(context));
            default:
                throw new Error("Non const function: " + this.name);
        }
    }
    search(callback) {
        for (const node of this.args) {
            node.search(callback);
        }
        callback(this);
    }
}
/**
 * @class VariableExpr
 * @extends Expression
 * @category AST
 */
class VariableExpr extends Expression {
    constructor(name) {
        super();
        this.name = name;
    }
    get astNodeType() {
        return "varExpr";
    }
    search(callback) {
        callback(this);
        if (this.postfix) {
            this.postfix.search(callback);
        }
    }
    evaluate(context) {
        const constant = context.constants.get(this.name);
        if (!constant) {
            throw new Error("Cannot evaluate node");
        }
        return constant.evaluate(context);
    }
}
/**
 * @class ConstExpr
 * @extends Expression
 * @category AST
 */
class ConstExpr extends Expression {
    constructor(name, initializer) {
        super();
        this.name = name;
        this.initializer = initializer;
    }
    get astNodeType() {
        return "constExpr";
    }
    evaluate(context) {
        var _a, _b;
        if (this.initializer instanceof CreateExpr) {
            // This is a struct constant
            const property = (_a = this.postfix) === null || _a === void 0 ? void 0 : _a.evaluateString(context);
            const type = (_b = this.initializer.type) === null || _b === void 0 ? void 0 : _b.name;
            const struct = context.structs.get(type);
            const memberIndex = struct === null || struct === void 0 ? void 0 : struct.getMemberIndex(property);
            if (memberIndex != -1) {
                const value = this.initializer.args[memberIndex].evaluate(context);
                return value;
            }
            console.log(memberIndex);
        }
        return this.initializer.evaluate(context);
    }
    search(callback) {
        this.initializer.search(callback);
    }
}
/**
 * @class LiteralExpr
 * @extends Expression
 * @category AST
 */
class LiteralExpr extends Expression {
    constructor(value) {
        super();
        this.value = value;
    }
    get astNodeType() {
        return "literalExpr";
    }
    evaluate() {
        return this.value;
    }
}
/**
 * @class BitcastExpr
 * @extends Expression
 * @category AST
 */
class BitcastExpr extends Expression {
    constructor(type, value) {
        super();
        this.type = type;
        this.value = value;
    }
    get astNodeType() {
        return "bitcastExpr";
    }
    search(callback) {
        this.value.search(callback);
    }
}
/**
 * @class TypecastExpr
 * @extends Expression
 * @category AST
 */
class TypecastExpr extends Expression {
    constructor(type, args) {
        super();
        this.type = type;
        this.args = args;
    }
    get astNodeType() {
        return "typecastExpr";
    }
    evaluate(context) {
        return this.args[0].evaluate(context);
    }
    search(callback) {
        this.searchBlock(this.args, callback);
    }
}
/**
 * @class GroupingExpr
 * @extends Expression
 * @category AST
 */
class GroupingExpr extends Expression {
    constructor(contents) {
        super();
        this.contents = contents;
    }
    get astNodeType() {
        return "groupExpr";
    }
    evaluate(context) {
        return this.contents[0].evaluate(context);
    }
    search(callback) {
        this.searchBlock(this.contents, callback);
    }
}
/**
 * @class ArrayIndex
 * @extends Expression
 * @category AST
 */
class ArrayIndex extends Expression {
    constructor(index) {
        super();
        this.index = index;
    }
    search(callback) {
        this.index.search(callback);
    }
}
/**
 * @class Operator
 * @extends Expression
 * @category AST
 */
class Operator extends Expression {
    constructor() {
        super();
    }
}
/**
 * @class UnaryOperator
 * @extends Operator
 * @category AST
 * @property {string} operator +, -, !, ~
 */
class UnaryOperator extends Operator {
    constructor(operator, right) {
        super();
        this.operator = operator;
        this.right = right;
    }
    get astNodeType() {
        return "unaryOp";
    }
    evaluate(context) {
        switch (this.operator) {
            case "+":
                return this.right.evaluate(context);
            case "-":
                return -this.right.evaluate(context);
            case "!":
                return this.right.evaluate(context) ? 0 : 1;
            case "~":
                return ~this.right.evaluate(context);
            default:
                throw new Error("Unknown unary operator: " + this.operator);
        }
    }
    search(callback) {
        this.right.search(callback);
    }
}
/**
 * @class BinaryOperator
 * @extends Operator
 * @category AST
 * @property {string} operator +, -, *, /, %, ==, !=, <, >, <=, >=, &&, ||
 */
class BinaryOperator extends Operator {
    constructor(operator, left, right) {
        super();
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
    get astNodeType() {
        return "binaryOp";
    }
    evaluate(context) {
        switch (this.operator) {
            case "+":
                return this.left.evaluate(context) + this.right.evaluate(context);
            case "-":
                return this.left.evaluate(context) - this.right.evaluate(context);
            case "*":
                return this.left.evaluate(context) * this.right.evaluate(context);
            case "/":
                return this.left.evaluate(context) / this.right.evaluate(context);
            case "%":
                return this.left.evaluate(context) % this.right.evaluate(context);
            case "==":
                return this.left.evaluate(context) == this.right.evaluate(context)
                    ? 1
                    : 0;
            case "!=":
                return this.left.evaluate(context) != this.right.evaluate(context)
                    ? 1
                    : 0;
            case "<":
                return this.left.evaluate(context) < this.right.evaluate(context)
                    ? 1
                    : 0;
            case ">":
                return this.left.evaluate(context) > this.right.evaluate(context)
                    ? 1
                    : 0;
            case "<=":
                return this.left.evaluate(context) <= this.right.evaluate(context)
                    ? 1
                    : 0;
            case ">=":
                return this.left.evaluate(context) >= this.right.evaluate(context)
                    ? 1
                    : 0;
            case "&&":
                return this.left.evaluate(context) && this.right.evaluate(context)
                    ? 1
                    : 0;
            case "||":
                return this.left.evaluate(context) || this.right.evaluate(context)
                    ? 1
                    : 0;
            default:
                throw new Error(`Unknown operator ${this.operator}`);
        }
    }
    search(callback) {
        this.left.search(callback);
        this.right.search(callback);
    }
}
/**
 * @class SwitchCase
 * @extends Node
 * @category AST
 */
class SwitchCase extends Node {
    constructor() {
        super();
    }
}
/**
 * @class Case
 * @extends SwitchCase
 * @category AST
 */
class Case extends SwitchCase {
    constructor(selector, body) {
        super();
        this.selector = selector;
        this.body = body;
    }
    get astNodeType() {
        return "case";
    }
    search(callback) {
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class Default
 * @extends SwitchCase
 * @category AST
 */
class Default extends SwitchCase {
    constructor(body) {
        super();
        this.body = body;
    }
    get astNodeType() {
        return "default";
    }
    search(callback) {
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class Argument
 * @extends Node
 * @category AST
 */
class Argument extends Node {
    constructor(name, type, attributes) {
        super();
        this.name = name;
        this.type = type;
        this.attributes = attributes;
    }
    get astNodeType() {
        return "argument";
    }
}
/**
 * @class ElseIf
 * @extends Node
 * @category AST
 */
class ElseIf extends Node {
    constructor(condition, body) {
        super();
        this.condition = condition;
        this.body = body;
    }
    get astNodeType() {
        return "elseif";
    }
    search(callback) {
        this.condition.search(callback);
        this.searchBlock(this.body, callback);
    }
}
/**
 * @class Member
 * @extends Node
 * @category AST
 */
class Member extends Node {
    constructor(name, type, attributes) {
        super();
        this.name = name;
        this.type = type;
        this.attributes = attributes;
    }
    get astNodeType() {
        return "member";
    }
}
/**
 * @class Attribute
 * @extends Node
 * @category AST
 */
class Attribute extends Node {
    constructor(name, value) {
        super();
        this.name = name;
        this.value = value;
    }
    get astNodeType() {
        return "attribute";
    }
}

var _a;
var TokenClass;
(function (TokenClass) {
    TokenClass[TokenClass["token"] = 0] = "token";
    TokenClass[TokenClass["keyword"] = 1] = "keyword";
    TokenClass[TokenClass["reserved"] = 2] = "reserved";
})(TokenClass || (TokenClass = {}));
class TokenType {
    constructor(name, type, rule) {
        this.name = name;
        this.type = type;
        this.rule = rule;
    }
    toString() {
        return this.name;
    }
}
/// Catalog of defined token types, keywords, and reserved words.
class TokenTypes {
}
_a = TokenTypes;
TokenTypes.none = new TokenType("", TokenClass.reserved, "");
TokenTypes.eof = new TokenType("EOF", TokenClass.token, "");
TokenTypes.reserved = {
    asm: new TokenType("asm", TokenClass.reserved, "asm"),
    bf16: new TokenType("bf16", TokenClass.reserved, "bf16"),
    do: new TokenType("do", TokenClass.reserved, "do"),
    enum: new TokenType("enum", TokenClass.reserved, "enum"),
    f16: new TokenType("f16", TokenClass.reserved, "f16"),
    f64: new TokenType("f64", TokenClass.reserved, "f64"),
    handle: new TokenType("handle", TokenClass.reserved, "handle"),
    i8: new TokenType("i8", TokenClass.reserved, "i8"),
    i16: new TokenType("i16", TokenClass.reserved, "i16"),
    i64: new TokenType("i64", TokenClass.reserved, "i64"),
    mat: new TokenType("mat", TokenClass.reserved, "mat"),
    premerge: new TokenType("premerge", TokenClass.reserved, "premerge"),
    regardless: new TokenType("regardless", TokenClass.reserved, "regardless"),
    typedef: new TokenType("typedef", TokenClass.reserved, "typedef"),
    u8: new TokenType("u8", TokenClass.reserved, "u8"),
    u16: new TokenType("u16", TokenClass.reserved, "u16"),
    u64: new TokenType("u64", TokenClass.reserved, "u64"),
    unless: new TokenType("unless", TokenClass.reserved, "unless"),
    using: new TokenType("using", TokenClass.reserved, "using"),
    vec: new TokenType("vec", TokenClass.reserved, "vec"),
    void: new TokenType("void", TokenClass.reserved, "void"),
};
TokenTypes.keywords = {
    array: new TokenType("array", TokenClass.keyword, "array"),
    atomic: new TokenType("atomic", TokenClass.keyword, "atomic"),
    bool: new TokenType("bool", TokenClass.keyword, "bool"),
    f32: new TokenType("f32", TokenClass.keyword, "f32"),
    i32: new TokenType("i32", TokenClass.keyword, "i32"),
    mat2x2: new TokenType("mat2x2", TokenClass.keyword, "mat2x2"),
    mat2x3: new TokenType("mat2x3", TokenClass.keyword, "mat2x3"),
    mat2x4: new TokenType("mat2x4", TokenClass.keyword, "mat2x4"),
    mat3x2: new TokenType("mat3x2", TokenClass.keyword, "mat3x2"),
    mat3x3: new TokenType("mat3x3", TokenClass.keyword, "mat3x3"),
    mat3x4: new TokenType("mat3x4", TokenClass.keyword, "mat3x4"),
    mat4x2: new TokenType("mat4x2", TokenClass.keyword, "mat4x2"),
    mat4x3: new TokenType("mat4x3", TokenClass.keyword, "mat4x3"),
    mat4x4: new TokenType("mat4x4", TokenClass.keyword, "mat4x4"),
    ptr: new TokenType("ptr", TokenClass.keyword, "ptr"),
    sampler: new TokenType("sampler", TokenClass.keyword, "sampler"),
    sampler_comparison: new TokenType("sampler_comparison", TokenClass.keyword, "sampler_comparison"),
    struct: new TokenType("struct", TokenClass.keyword, "struct"),
    texture_1d: new TokenType("texture_1d", TokenClass.keyword, "texture_1d"),
    texture_2d: new TokenType("texture_2d", TokenClass.keyword, "texture_2d"),
    texture_2d_array: new TokenType("texture_2d_array", TokenClass.keyword, "texture_2d_array"),
    texture_3d: new TokenType("texture_3d", TokenClass.keyword, "texture_3d"),
    texture_cube: new TokenType("texture_cube", TokenClass.keyword, "texture_cube"),
    texture_cube_array: new TokenType("texture_cube_array", TokenClass.keyword, "texture_cube_array"),
    texture_multisampled_2d: new TokenType("texture_multisampled_2d", TokenClass.keyword, "texture_multisampled_2d"),
    texture_storage_1d: new TokenType("texture_storage_1d", TokenClass.keyword, "texture_storage_1d"),
    texture_storage_2d: new TokenType("texture_storage_2d", TokenClass.keyword, "texture_storage_2d"),
    texture_storage_2d_array: new TokenType("texture_storage_2d_array", TokenClass.keyword, "texture_storage_2d_array"),
    texture_storage_3d: new TokenType("texture_storage_3d", TokenClass.keyword, "texture_storage_3d"),
    texture_depth_2d: new TokenType("texture_depth_2d", TokenClass.keyword, "texture_depth_2d"),
    texture_depth_2d_array: new TokenType("texture_depth_2d_array", TokenClass.keyword, "texture_depth_2d_array"),
    texture_depth_cube: new TokenType("texture_depth_cube", TokenClass.keyword, "texture_depth_cube"),
    texture_depth_cube_array: new TokenType("texture_depth_cube_array", TokenClass.keyword, "texture_depth_cube_array"),
    texture_depth_multisampled_2d: new TokenType("texture_depth_multisampled_2d", TokenClass.keyword, "texture_depth_multisampled_2d"),
    texture_external: new TokenType("texture_external", TokenClass.keyword, "texture_external"),
    u32: new TokenType("u32", TokenClass.keyword, "u32"),
    vec2: new TokenType("vec2", TokenClass.keyword, "vec2"),
    vec3: new TokenType("vec3", TokenClass.keyword, "vec3"),
    vec4: new TokenType("vec4", TokenClass.keyword, "vec4"),
    bitcast: new TokenType("bitcast", TokenClass.keyword, "bitcast"),
    block: new TokenType("block", TokenClass.keyword, "block"),
    break: new TokenType("break", TokenClass.keyword, "break"),
    case: new TokenType("case", TokenClass.keyword, "case"),
    continue: new TokenType("continue", TokenClass.keyword, "continue"),
    continuing: new TokenType("continuing", TokenClass.keyword, "continuing"),
    default: new TokenType("default", TokenClass.keyword, "default"),
    diagnostic: new TokenType("diagnostic", TokenClass.keyword, "diagnostic"),
    discard: new TokenType("discard", TokenClass.keyword, "discard"),
    else: new TokenType("else", TokenClass.keyword, "else"),
    enable: new TokenType("enable", TokenClass.keyword, "enable"),
    fallthrough: new TokenType("fallthrough", TokenClass.keyword, "fallthrough"),
    false: new TokenType("false", TokenClass.keyword, "false"),
    fn: new TokenType("fn", TokenClass.keyword, "fn"),
    for: new TokenType("for", TokenClass.keyword, "for"),
    function: new TokenType("function", TokenClass.keyword, "function"),
    if: new TokenType("if", TokenClass.keyword, "if"),
    let: new TokenType("let", TokenClass.keyword, "let"),
    const: new TokenType("const", TokenClass.keyword, "const"),
    loop: new TokenType("loop", TokenClass.keyword, "loop"),
    while: new TokenType("while", TokenClass.keyword, "while"),
    private: new TokenType("private", TokenClass.keyword, "private"),
    read: new TokenType("read", TokenClass.keyword, "read"),
    read_write: new TokenType("read_write", TokenClass.keyword, "read_write"),
    return: new TokenType("return", TokenClass.keyword, "return"),
    requires: new TokenType("requires", TokenClass.keyword, "requires"),
    storage: new TokenType("storage", TokenClass.keyword, "storage"),
    switch: new TokenType("switch", TokenClass.keyword, "switch"),
    true: new TokenType("true", TokenClass.keyword, "true"),
    alias: new TokenType("alias", TokenClass.keyword, "alias"),
    type: new TokenType("type", TokenClass.keyword, "type"),
    uniform: new TokenType("uniform", TokenClass.keyword, "uniform"),
    var: new TokenType("var", TokenClass.keyword, "var"),
    override: new TokenType("override", TokenClass.keyword, "override"),
    workgroup: new TokenType("workgroup", TokenClass.keyword, "workgroup"),
    write: new TokenType("write", TokenClass.keyword, "write"),
    r8unorm: new TokenType("r8unorm", TokenClass.keyword, "r8unorm"),
    r8snorm: new TokenType("r8snorm", TokenClass.keyword, "r8snorm"),
    r8uint: new TokenType("r8uint", TokenClass.keyword, "r8uint"),
    r8sint: new TokenType("r8sint", TokenClass.keyword, "r8sint"),
    r16uint: new TokenType("r16uint", TokenClass.keyword, "r16uint"),
    r16sint: new TokenType("r16sint", TokenClass.keyword, "r16sint"),
    r16float: new TokenType("r16float", TokenClass.keyword, "r16float"),
    rg8unorm: new TokenType("rg8unorm", TokenClass.keyword, "rg8unorm"),
    rg8snorm: new TokenType("rg8snorm", TokenClass.keyword, "rg8snorm"),
    rg8uint: new TokenType("rg8uint", TokenClass.keyword, "rg8uint"),
    rg8sint: new TokenType("rg8sint", TokenClass.keyword, "rg8sint"),
    r32uint: new TokenType("r32uint", TokenClass.keyword, "r32uint"),
    r32sint: new TokenType("r32sint", TokenClass.keyword, "r32sint"),
    r32float: new TokenType("r32float", TokenClass.keyword, "r32float"),
    rg16uint: new TokenType("rg16uint", TokenClass.keyword, "rg16uint"),
    rg16sint: new TokenType("rg16sint", TokenClass.keyword, "rg16sint"),
    rg16float: new TokenType("rg16float", TokenClass.keyword, "rg16float"),
    rgba8unorm: new TokenType("rgba8unorm", TokenClass.keyword, "rgba8unorm"),
    rgba8unorm_srgb: new TokenType("rgba8unorm_srgb", TokenClass.keyword, "rgba8unorm_srgb"),
    rgba8snorm: new TokenType("rgba8snorm", TokenClass.keyword, "rgba8snorm"),
    rgba8uint: new TokenType("rgba8uint", TokenClass.keyword, "rgba8uint"),
    rgba8sint: new TokenType("rgba8sint", TokenClass.keyword, "rgba8sint"),
    bgra8unorm: new TokenType("bgra8unorm", TokenClass.keyword, "bgra8unorm"),
    bgra8unorm_srgb: new TokenType("bgra8unorm_srgb", TokenClass.keyword, "bgra8unorm_srgb"),
    rgb10a2unorm: new TokenType("rgb10a2unorm", TokenClass.keyword, "rgb10a2unorm"),
    rg11b10float: new TokenType("rg11b10float", TokenClass.keyword, "rg11b10float"),
    rg32uint: new TokenType("rg32uint", TokenClass.keyword, "rg32uint"),
    rg32sint: new TokenType("rg32sint", TokenClass.keyword, "rg32sint"),
    rg32float: new TokenType("rg32float", TokenClass.keyword, "rg32float"),
    rgba16uint: new TokenType("rgba16uint", TokenClass.keyword, "rgba16uint"),
    rgba16sint: new TokenType("rgba16sint", TokenClass.keyword, "rgba16sint"),
    rgba16float: new TokenType("rgba16float", TokenClass.keyword, "rgba16float"),
    rgba32uint: new TokenType("rgba32uint", TokenClass.keyword, "rgba32uint"),
    rgba32sint: new TokenType("rgba32sint", TokenClass.keyword, "rgba32sint"),
    rgba32float: new TokenType("rgba32float", TokenClass.keyword, "rgba32float"),
    static_assert: new TokenType("static_assert", TokenClass.keyword, "static_assert"),
    // WGSL grammar has a few keywords that have different token names than the strings they
    // represent. Aliasing them here.
    /*int32: new TokenType("i32", TokenClass.keyword, "i32"),
        uint32: new TokenType("u32", TokenClass.keyword, "u32"),
        float32: new TokenType("f32", TokenClass.keyword, "f32"),
        pointer: new TokenType("ptr", TokenClass.keyword, "ptr"),*/
};
TokenTypes.tokens = {
    decimal_float_literal: new TokenType("decimal_float_literal", TokenClass.token, /((-?[0-9]*\.[0-9]+|-?[0-9]+\.[0-9]*)((e|E)(\+|-)?[0-9]+)?f?)|(-?[0-9]+(e|E)(\+|-)?[0-9]+f?)|([0-9]+f)/),
    hex_float_literal: new TokenType("hex_float_literal", TokenClass.token, /-?0x((([0-9a-fA-F]*\.[0-9a-fA-F]+|[0-9a-fA-F]+\.[0-9a-fA-F]*)((p|P)(\+|-)?[0-9]+f?)?)|([0-9a-fA-F]+(p|P)(\+|-)?[0-9]+f?))/),
    int_literal: new TokenType("int_literal", TokenClass.token, /-?0x[0-9a-fA-F]+|0i?|-?[1-9][0-9]*i?/),
    uint_literal: new TokenType("uint_literal", TokenClass.token, /0x[0-9a-fA-F]+u|0u|[1-9][0-9]*u/),
    ident: new TokenType("ident", TokenClass.token, /[_a-zA-Z][0-9a-zA-Z_]*/),
    and: new TokenType("and", TokenClass.token, "&"),
    and_and: new TokenType("and_and", TokenClass.token, "&&"),
    arrow: new TokenType("arrow ", TokenClass.token, "->"),
    attr: new TokenType("attr", TokenClass.token, "@"),
    attr_left: new TokenType("attr_left", TokenClass.token, "[["),
    attr_right: new TokenType("attr_right", TokenClass.token, "]]"),
    forward_slash: new TokenType("forward_slash", TokenClass.token, "/"),
    bang: new TokenType("bang", TokenClass.token, "!"),
    bracket_left: new TokenType("bracket_left", TokenClass.token, "["),
    bracket_right: new TokenType("bracket_right", TokenClass.token, "]"),
    brace_left: new TokenType("brace_left", TokenClass.token, "{"),
    brace_right: new TokenType("brace_right", TokenClass.token, "}"),
    colon: new TokenType("colon", TokenClass.token, ":"),
    comma: new TokenType("comma", TokenClass.token, ","),
    equal: new TokenType("equal", TokenClass.token, "="),
    equal_equal: new TokenType("equal_equal", TokenClass.token, "=="),
    not_equal: new TokenType("not_equal", TokenClass.token, "!="),
    greater_than: new TokenType("greater_than", TokenClass.token, ">"),
    greater_than_equal: new TokenType("greater_than_equal", TokenClass.token, ">="),
    shift_right: new TokenType("shift_right", TokenClass.token, ">>"),
    less_than: new TokenType("less_than", TokenClass.token, "<"),
    less_than_equal: new TokenType("less_than_equal", TokenClass.token, "<="),
    shift_left: new TokenType("shift_left", TokenClass.token, "<<"),
    modulo: new TokenType("modulo", TokenClass.token, "%"),
    minus: new TokenType("minus", TokenClass.token, "-"),
    minus_minus: new TokenType("minus_minus", TokenClass.token, "--"),
    period: new TokenType("period", TokenClass.token, "."),
    plus: new TokenType("plus", TokenClass.token, "+"),
    plus_plus: new TokenType("plus_plus", TokenClass.token, "++"),
    or: new TokenType("or", TokenClass.token, "|"),
    or_or: new TokenType("or_or", TokenClass.token, "||"),
    paren_left: new TokenType("paren_left", TokenClass.token, "("),
    paren_right: new TokenType("paren_right", TokenClass.token, ")"),
    semicolon: new TokenType("semicolon", TokenClass.token, ";"),
    star: new TokenType("star", TokenClass.token, "*"),
    tilde: new TokenType("tilde", TokenClass.token, "~"),
    underscore: new TokenType("underscore", TokenClass.token, "_"),
    xor: new TokenType("xor", TokenClass.token, "^"),
    plus_equal: new TokenType("plus_equal", TokenClass.token, "+="),
    minus_equal: new TokenType("minus_equal", TokenClass.token, "-="),
    times_equal: new TokenType("times_equal", TokenClass.token, "*="),
    division_equal: new TokenType("division_equal", TokenClass.token, "/="),
    modulo_equal: new TokenType("modulo_equal", TokenClass.token, "%="),
    and_equal: new TokenType("and_equal", TokenClass.token, "&="),
    or_equal: new TokenType("or_equal", TokenClass.token, "|="),
    xor_equal: new TokenType("xor_equal", TokenClass.token, "^="),
    shift_right_equal: new TokenType("shift_right_equal", TokenClass.token, ">>="),
    shift_left_equal: new TokenType("shift_left_equal", TokenClass.token, "<<="),
};
TokenTypes.simpleTokens = {
    "@": _a.tokens.attr,
    "{": _a.tokens.brace_left,
    "}": _a.tokens.brace_right,
    ":": _a.tokens.colon,
    ",": _a.tokens.comma,
    "(": _a.tokens.paren_left,
    ")": _a.tokens.paren_right,
    ";": _a.tokens.semicolon,
};
TokenTypes.literalTokens = {
    "&": _a.tokens.and,
    "&&": _a.tokens.and_and,
    "->": _a.tokens.arrow,
    "[[": _a.tokens.attr_left,
    "]]": _a.tokens.attr_right,
    "/": _a.tokens.forward_slash,
    "!": _a.tokens.bang,
    "[": _a.tokens.bracket_left,
    "]": _a.tokens.bracket_right,
    "=": _a.tokens.equal,
    "==": _a.tokens.equal_equal,
    "!=": _a.tokens.not_equal,
    ">": _a.tokens.greater_than,
    ">=": _a.tokens.greater_than_equal,
    ">>": _a.tokens.shift_right,
    "<": _a.tokens.less_than,
    "<=": _a.tokens.less_than_equal,
    "<<": _a.tokens.shift_left,
    "%": _a.tokens.modulo,
    "-": _a.tokens.minus,
    "--": _a.tokens.minus_minus,
    ".": _a.tokens.period,
    "+": _a.tokens.plus,
    "++": _a.tokens.plus_plus,
    "|": _a.tokens.or,
    "||": _a.tokens.or_or,
    "*": _a.tokens.star,
    "~": _a.tokens.tilde,
    "_": _a.tokens.underscore,
    "^": _a.tokens.xor,
    "+=": _a.tokens.plus_equal,
    "-=": _a.tokens.minus_equal,
    "*=": _a.tokens.times_equal,
    "/=": _a.tokens.division_equal,
    "%=": _a.tokens.modulo_equal,
    "&=": _a.tokens.and_equal,
    "|=": _a.tokens.or_equal,
    "^=": _a.tokens.xor_equal,
    ">>=": _a.tokens.shift_right_equal,
    "<<=": _a.tokens.shift_left_equal,
};
TokenTypes.regexTokens = {
    decimal_float_literal: _a.tokens.decimal_float_literal,
    hex_float_literal: _a.tokens.hex_float_literal,
    int_literal: _a.tokens.int_literal,
    uint_literal: _a.tokens.uint_literal,
    ident: _a.tokens.ident,
};
TokenTypes.storage_class = [
    _a.keywords.function,
    _a.keywords.private,
    _a.keywords.workgroup,
    _a.keywords.uniform,
    _a.keywords.storage,
];
TokenTypes.access_mode = [
    _a.keywords.read,
    _a.keywords.write,
    _a.keywords.read_write,
];
TokenTypes.sampler_type = [
    _a.keywords.sampler,
    _a.keywords.sampler_comparison,
];
TokenTypes.sampled_texture_type = [
    _a.keywords.texture_1d,
    _a.keywords.texture_2d,
    _a.keywords.texture_2d_array,
    _a.keywords.texture_3d,
    _a.keywords.texture_cube,
    _a.keywords.texture_cube_array,
];
TokenTypes.multisampled_texture_type = [
    _a.keywords.texture_multisampled_2d,
];
TokenTypes.storage_texture_type = [
    _a.keywords.texture_storage_1d,
    _a.keywords.texture_storage_2d,
    _a.keywords.texture_storage_2d_array,
    _a.keywords.texture_storage_3d,
];
TokenTypes.depth_texture_type = [
    _a.keywords.texture_depth_2d,
    _a.keywords.texture_depth_2d_array,
    _a.keywords.texture_depth_cube,
    _a.keywords.texture_depth_cube_array,
    _a.keywords.texture_depth_multisampled_2d,
];
TokenTypes.texture_external_type = [_a.keywords.texture_external];
TokenTypes.any_texture_type = [
    ..._a.sampled_texture_type,
    ..._a.multisampled_texture_type,
    ..._a.storage_texture_type,
    ..._a.depth_texture_type,
    ..._a.texture_external_type,
];
TokenTypes.texel_format = [
    _a.keywords.r8unorm,
    _a.keywords.r8snorm,
    _a.keywords.r8uint,
    _a.keywords.r8sint,
    _a.keywords.r16uint,
    _a.keywords.r16sint,
    _a.keywords.r16float,
    _a.keywords.rg8unorm,
    _a.keywords.rg8snorm,
    _a.keywords.rg8uint,
    _a.keywords.rg8sint,
    _a.keywords.r32uint,
    _a.keywords.r32sint,
    _a.keywords.r32float,
    _a.keywords.rg16uint,
    _a.keywords.rg16sint,
    _a.keywords.rg16float,
    _a.keywords.rgba8unorm,
    _a.keywords.rgba8unorm_srgb,
    _a.keywords.rgba8snorm,
    _a.keywords.rgba8uint,
    _a.keywords.rgba8sint,
    _a.keywords.bgra8unorm,
    _a.keywords.bgra8unorm_srgb,
    _a.keywords.rgb10a2unorm,
    _a.keywords.rg11b10float,
    _a.keywords.rg32uint,
    _a.keywords.rg32sint,
    _a.keywords.rg32float,
    _a.keywords.rgba16uint,
    _a.keywords.rgba16sint,
    _a.keywords.rgba16float,
    _a.keywords.rgba32uint,
    _a.keywords.rgba32sint,
    _a.keywords.rgba32float,
];
TokenTypes.const_literal = [
    _a.tokens.int_literal,
    _a.tokens.uint_literal,
    _a.tokens.decimal_float_literal,
    _a.tokens.hex_float_literal,
    _a.keywords.true,
    _a.keywords.false,
];
TokenTypes.literal_or_ident = [
    _a.tokens.ident,
    _a.tokens.int_literal,
    _a.tokens.uint_literal,
    _a.tokens.decimal_float_literal,
    _a.tokens.hex_float_literal,
];
TokenTypes.element_count_expression = [
    _a.tokens.int_literal,
    _a.tokens.uint_literal,
    _a.tokens.ident,
];
TokenTypes.template_types = [
    _a.keywords.vec2,
    _a.keywords.vec3,
    _a.keywords.vec4,
    _a.keywords.mat2x2,
    _a.keywords.mat2x3,
    _a.keywords.mat2x4,
    _a.keywords.mat3x2,
    _a.keywords.mat3x3,
    _a.keywords.mat3x4,
    _a.keywords.mat4x2,
    _a.keywords.mat4x3,
    _a.keywords.mat4x4,
    _a.keywords.atomic,
    _a.keywords.bitcast,
    ..._a.any_texture_type,
];
// The grammar calls out 'block', but attribute grammar is defined to use a 'ident'.
// The attribute grammar should be ident | block.
TokenTypes.attribute_name = [_a.tokens.ident, _a.keywords.block, _a.keywords.diagnostic];
TokenTypes.assignment_operators = [
    _a.tokens.equal,
    _a.tokens.plus_equal,
    _a.tokens.minus_equal,
    _a.tokens.times_equal,
    _a.tokens.division_equal,
    _a.tokens.modulo_equal,
    _a.tokens.and_equal,
    _a.tokens.or_equal,
    _a.tokens.xor_equal,
    _a.tokens.shift_right_equal,
    _a.tokens.shift_left_equal,
];
TokenTypes.increment_operators = [
    _a.tokens.plus_plus,
    _a.tokens.minus_minus,
];
/// A token parsed by the WgslScanner.
class Token {
    constructor(type, lexeme, line) {
        this.type = type;
        this.lexeme = lexeme;
        this.line = line;
    }
    toString() {
        return this.lexeme;
    }
    isTemplateType() {
        return TokenTypes.template_types.indexOf(this.type) != -1;
    }
    isArrayType() {
        return this.type == TokenTypes.keywords.array;
    }
    isArrayOrTemplateType() {
        return this.isArrayType() || this.isTemplateType();
    }
}
/// Lexical scanner for the WGSL language. This takes an input source text and generates a list
/// of Token objects, which can then be fed into the WgslParser to generate an AST.
class WgslScanner {
    constructor(source) {
        this._tokens = [];
        this._start = 0;
        this._current = 0;
        this._line = 1;
        this._source = source !== null && source !== void 0 ? source : "";
    }
    /// Scan all tokens from the source.
    scanTokens() {
        while (!this._isAtEnd()) {
            this._start = this._current;
            if (!this.scanToken()) {
                throw `Invalid syntax at line ${this._line}`;
            }
        }
        this._tokens.push(new Token(TokenTypes.eof, "", this._line));
        return this._tokens;
    }
    /// Scan a single token from the source.
    scanToken() {
        // Find the longest consecutive set of characters that match a rule.
        let lexeme = this._advance();
        // Skip line-feed, adding to the line counter.
        if (lexeme == "\n") {
            this._line++;
            return true;
        }
        // Skip whitespace
        if (this._isWhitespace(lexeme)) {
            return true;
        }
        if (lexeme == "/") {
            // If it's a // comment, skip everything until the next line-feed.
            if (this._peekAhead() == "/") {
                while (lexeme != "\n") {
                    if (this._isAtEnd()) {
                        return true;
                    }
                    lexeme = this._advance();
                }
                // skip the linefeed
                this._line++;
                return true;
            }
            else if (this._peekAhead() == "*") {
                // If it's a / * block comment, skip everything until the matching * /,
                // allowing for nested block comments.
                this._advance();
                let commentLevel = 1;
                while (commentLevel > 0) {
                    if (this._isAtEnd()) {
                        return true;
                    }
                    lexeme = this._advance();
                    if (lexeme == "\n") {
                        this._line++;
                    }
                    else if (lexeme == "*") {
                        if (this._peekAhead() == "/") {
                            this._advance();
                            commentLevel--;
                            if (commentLevel == 0) {
                                return true;
                            }
                        }
                    }
                    else if (lexeme == "/") {
                        if (this._peekAhead() == "*") {
                            this._advance();
                            commentLevel++;
                        }
                    }
                }
                return true;
            }
        }
        // Shortcut single character tokens
        const simpleToken = TokenTypes.simpleTokens[lexeme];
        if (simpleToken) {
            this._addToken(simpleToken);
            return true;
        }
        // Shortcut keywords and identifiers
        let matchType = TokenTypes.none;
        const isAlpha = this._isAlpha(lexeme);
        const isUnderscore = lexeme === "_";
        if (this._isAlphaNumeric(lexeme)) {
            let nextChar = this._peekAhead();
            while (this._isAlphaNumeric(nextChar)) {
                lexeme += this._advance();
                nextChar = this._peekAhead();
            }
        }
        if (isAlpha) {
            const matchedType = TokenTypes.keywords[lexeme];
            if (matchedType) {
                this._addToken(matchedType);
                return true;
            }
        }
        if (isAlpha || isUnderscore) {
            this._addToken(TokenTypes.tokens.ident);
            return true;
        }
        // Scan for the next valid token type
        for (;;) {
            let matchedType = this._findType(lexeme);
            // An exception to "longest lexeme" rule is '>>'. In the case of 1>>2, it's a
            // shift_right.
            // In the case of array<vec4<f32>>, it's two greater_than's (one to close the vec4,
            // and one to close the array).
            // Another ambiguity is '>='. In the case of vec2<i32>=vec2(1,2),
            // it's a greather_than and an equal, not a greater_than_equal.
            // WGSL requires context sensitive parsing to resolve these ambiguities. Both of these cases
            // are predicated on it the > either closing a template, or being part of an operator.
            // The solution here is to check if there was a less_than up to some number of tokens
            // previously, and the token prior to that is a keyword that requires a '<', then it will be
            // split into two operators; otherwise it's a single operator.
            const nextLexeme = this._peekAhead();
            if (lexeme == ">" && (nextLexeme == ">" || nextLexeme == "=")) {
                let foundLessThan = false;
                let ti = this._tokens.length - 1;
                for (let count = 0; count < 5 && ti >= 0; ++count, --ti) {
                    if (this._tokens[ti].type === TokenTypes.tokens.less_than) {
                        if (ti > 0 && this._tokens[ti - 1].isArrayOrTemplateType()) {
                            foundLessThan = true;
                        }
                        break;
                    }
                }
                // If there was a less_than in the recent token history, then this is probably a
                // greater_than.
                if (foundLessThan) {
                    this._addToken(matchedType);
                    return true;
                }
            }
            // The current lexeme may not match any rule, but some token types may be invalid for
            // part of the string but valid after a few more characters.
            // For example, 0x.5 is a hex_float_literal. But as it's being scanned,
            // "0" is a int_literal, then "0x" is invalid. If we stopped there, it would return
            // the int_literal "0", but that's incorrect. So if we look forward a few characters,
            // we'd get "0x.", which is still invalid, followed by "0x.5" which is the correct
            // hex_float_literal. So that means if we hit an non-matching string, we should look
            // ahead up to two characters to see if the string starts matching a valid rule again.
            if (matchedType === TokenTypes.none) {
                let lookAheadLexeme = lexeme;
                let lookAhead = 0;
                const maxLookAhead = 2;
                for (let li = 0; li < maxLookAhead; ++li) {
                    lookAheadLexeme += this._peekAhead(li);
                    matchedType = this._findType(lookAheadLexeme);
                    if (matchedType !== TokenTypes.none) {
                        lookAhead = li;
                        break;
                    }
                }
                if (matchedType === TokenTypes.none) {
                    if (matchType === TokenTypes.none) {
                        return false;
                    }
                    this._current--;
                    this._addToken(matchType);
                    return true;
                }
                lexeme = lookAheadLexeme;
                this._current += lookAhead + 1;
            }
            matchType = matchedType;
            if (this._isAtEnd()) {
                break;
            }
            lexeme += this._advance();
        }
        // We got to the end of the input stream. Then the token we've ready so far is it.
        if (matchType === TokenTypes.none) {
            return false;
        }
        this._addToken(matchType);
        return true;
    }
    _findType(lexeme) {
        for (const name in TokenTypes.regexTokens) {
            const type = TokenTypes.regexTokens[name];
            if (this._match(lexeme, type.rule)) {
                return type;
            }
        }
        const type = TokenTypes.literalTokens[lexeme];
        if (type) {
            return type;
        }
        return TokenTypes.none;
    }
    _match(lexeme, rule) {
        const match = rule.exec(lexeme);
        return match && match.index == 0 && match[0] == lexeme;
    }
    _isAtEnd() {
        return this._current >= this._source.length;
    }
    _isAlpha(c) {
        return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
    }
    _isAlphaNumeric(c) {
        return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c == "_" || (c >= "0" && c <= "9");
    }
    _isWhitespace(c) {
        return c == " " || c == "\t" || c == "\r";
    }
    _advance(amount = 0) {
        let c = this._source[this._current];
        amount = amount || 0;
        amount++;
        this._current += amount;
        return c;
    }
    _peekAhead(offset = 0) {
        offset = offset || 0;
        if (this._current + offset >= this._source.length) {
            return "\0";
        }
        return this._source[this._current + offset];
    }
    _addToken(type) {
        const text = this._source.substring(this._start, this._current);
        this._tokens.push(new Token(type, text, this._line));
    }
}

/**
 * @author Brendan Duncan / https://github.com/brendan-duncan
 */
/// Parse a sequence of tokens from the WgslScanner into an Abstract Syntax Tree (AST).
class WgslParser {
    constructor() {
        this._tokens = [];
        this._current = 0;
        this._currentLine = 0;
        this._context = new ParseContext();
        this._deferArrayCountEval = [];
    }
    parse(tokensOrCode) {
        this._initialize(tokensOrCode);
        this._deferArrayCountEval.length = 0;
        const statements = [];
        while (!this._isAtEnd()) {
            const statement = this._global_decl_or_directive();
            if (!statement) {
                break;
            }
            statements.push(statement);
        }
        // Since constants can be declared after they are used, and
        // constants can be used to size arrays, defer calculating the
        // size until after the shader has finished parsing.
        if (this._deferArrayCountEval.length > 0) {
            for (const arrayDecl of this._deferArrayCountEval) {
                const arrayType = arrayDecl["arrayType"];
                const countNode = arrayDecl["countNode"];
                if (countNode instanceof VariableExpr) {
                    const variable = countNode;
                    const name = variable.name;
                    const constant = this._context.constants.get(name);
                    if (constant) {
                        try {
                            const count = constant.evaluate(this._context);
                            arrayType.count = count;
                        }
                        catch (e) {
                        }
                    }
                }
            }
            this._deferArrayCountEval.length = 0;
        }
        return statements;
    }
    _initialize(tokensOrCode) {
        if (tokensOrCode) {
            if (typeof tokensOrCode == "string") {
                const scanner = new WgslScanner(tokensOrCode);
                this._tokens = scanner.scanTokens();
            }
            else {
                this._tokens = tokensOrCode;
            }
        }
        else {
            this._tokens = [];
        }
        this._current = 0;
    }
    _error(token, message) {
        return {
            token,
            message,
            toString: function () {
                return `${message}`;
            },
        };
    }
    _isAtEnd() {
        return (this._current >= this._tokens.length ||
            this._peek().type == TokenTypes.eof);
    }
    _match(types) {
        if (types instanceof TokenType) {
            if (this._check(types)) {
                this._advance();
                return true;
            }
            return false;
        }
        for (let i = 0, l = types.length; i < l; ++i) {
            const type = types[i];
            if (this._check(type)) {
                this._advance();
                return true;
            }
        }
        return false;
    }
    _consume(types, message) {
        if (this._check(types)) {
            return this._advance();
        }
        throw this._error(this._peek(), message);
    }
    _check(types) {
        if (this._isAtEnd()) {
            return false;
        }
        const tk = this._peek();
        if (types instanceof Array) {
            const t = tk.type;
            const index = types.indexOf(t);
            return index != -1;
        }
        return tk.type == types;
    }
    _advance() {
        var _a, _b;
        this._currentLine = (_b = (_a = this._peek()) === null || _a === void 0 ? void 0 : _a.line) !== null && _b !== void 0 ? _b : -1;
        if (!this._isAtEnd()) {
            this._current++;
        }
        return this._previous();
    }
    _peek() {
        return this._tokens[this._current];
    }
    _previous() {
        return this._tokens[this._current - 1];
    }
    _global_decl_or_directive() {
        // semicolon
        // global_variable_decl semicolon
        // global_constant_decl semicolon
        // type_alias semicolon
        // struct_decl
        // function_decl
        // enable_directive
        // Ignore any stand-alone semicolons
        while (this._match(TokenTypes.tokens.semicolon) && !this._isAtEnd())
            ;
        if (this._match(TokenTypes.keywords.alias)) {
            const type = this._type_alias();
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'");
            return type;
        }
        if (this._match(TokenTypes.keywords.diagnostic)) {
            const directive = this._diagnostic();
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'");
            return directive;
        }
        if (this._match(TokenTypes.keywords.requires)) {
            const requires = this._requires_directive();
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'");
            return requires;
        }
        if (this._match(TokenTypes.keywords.enable)) {
            const enable = this._enable_directive();
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'");
            return enable;
        }
        // The following statements have an optional attribute*
        const attrs = this._attribute();
        if (this._check(TokenTypes.keywords.var)) {
            const _var = this._global_variable_decl();
            if (_var != null) {
                _var.attributes = attrs;
            }
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
            return _var;
        }
        if (this._check(TokenTypes.keywords.override)) {
            const _override = this._override_variable_decl();
            if (_override != null) {
                _override.attributes = attrs;
            }
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
            return _override;
        }
        if (this._check(TokenTypes.keywords.let)) {
            const _let = this._global_let_decl();
            if (_let != null) {
                _let.attributes = attrs;
            }
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
            return _let;
        }
        if (this._check(TokenTypes.keywords.const)) {
            const _const = this._global_const_decl();
            if (_const != null) {
                _const.attributes = attrs;
            }
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
            return _const;
        }
        if (this._check(TokenTypes.keywords.struct)) {
            const _struct = this._struct_decl();
            if (_struct != null) {
                _struct.attributes = attrs;
            }
            return _struct;
        }
        if (this._check(TokenTypes.keywords.fn)) {
            const _fn = this._function_decl();
            if (_fn != null) {
                _fn.attributes = attrs;
            }
            return _fn;
        }
        return null;
    }
    _function_decl() {
        // attribute* function_header compound_statement
        // function_header: fn ident paren_left param_list? paren_right (arrow attribute* type_decl)?
        if (!this._match(TokenTypes.keywords.fn)) {
            return null;
        }
        const startLine = this._currentLine;
        const name = this._consume(TokenTypes.tokens.ident, "Expected function name.").toString();
        this._consume(TokenTypes.tokens.paren_left, "Expected '(' for function arguments.");
        const args = [];
        if (!this._check(TokenTypes.tokens.paren_right)) {
            do {
                if (this._check(TokenTypes.tokens.paren_right)) {
                    break;
                }
                const argAttrs = this._attribute();
                const name = this._consume(TokenTypes.tokens.ident, "Expected argument name.").toString();
                this._consume(TokenTypes.tokens.colon, "Expected ':' for argument type.");
                const typeAttrs = this._attribute();
                const type = this._type_decl();
                if (type != null) {
                    type.attributes = typeAttrs;
                    args.push(new Argument(name, type, argAttrs));
                }
            } while (this._match(TokenTypes.tokens.comma));
        }
        this._consume(TokenTypes.tokens.paren_right, "Expected ')' after function arguments.");
        let _return = null;
        if (this._match(TokenTypes.tokens.arrow)) {
            const attrs = this._attribute();
            _return = this._type_decl();
            if (_return != null) {
                _return.attributes = attrs;
            }
        }
        const body = this._compound_statement();
        const endLine = this._currentLine;
        return new Function(name, args, _return, body, startLine, endLine);
    }
    _compound_statement() {
        // brace_left statement* brace_right
        const statements = [];
        this._consume(TokenTypes.tokens.brace_left, "Expected '{' for block.");
        while (!this._check(TokenTypes.tokens.brace_right)) {
            const statement = this._statement();
            if (statement !== null) {
                statements.push(statement);
            }
        }
        this._consume(TokenTypes.tokens.brace_right, "Expected '}' for block.");
        return statements;
    }
    _statement() {
        // semicolon
        // return_statement semicolon
        // if_statement
        // switch_statement
        // loop_statement
        // for_statement
        // func_call_statement semicolon
        // variable_statement semicolon
        // break_statement semicolon
        // continue_statement semicolon
        // continuing_statement compound_statement
        // discard semicolon
        // assignment_statement semicolon
        // compound_statement
        // increment_statement semicolon
        // decrement_statement semicolon
        // static_assert_statement semicolon
        // Ignore any stand-alone semicolons
        while (this._match(TokenTypes.tokens.semicolon) && !this._isAtEnd())
            ;
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        if (this._check(TokenTypes.keywords.if)) {
            return this._if_statement();
        }
        if (this._check(TokenTypes.keywords.switch)) {
            return this._switch_statement();
        }
        if (this._check(TokenTypes.keywords.loop)) {
            return this._loop_statement();
        }
        if (this._check(TokenTypes.keywords.for)) {
            return this._for_statement();
        }
        if (this._check(TokenTypes.keywords.while)) {
            return this._while_statement();
        }
        if (this._check(TokenTypes.keywords.continuing)) {
            return this._continuing_statement();
        }
        if (this._check(TokenTypes.keywords.static_assert)) {
            return this._static_assert_statement();
        }
        if (this._check(TokenTypes.tokens.brace_left)) {
            return this._compound_statement();
        }
        let result = null;
        if (this._check(TokenTypes.keywords.return)) {
            result = this._return_statement();
        }
        else if (this._check([
            TokenTypes.keywords.var,
            TokenTypes.keywords.let,
            TokenTypes.keywords.const,
        ])) {
            result = this._variable_statement();
        }
        else if (this._match(TokenTypes.keywords.discard)) {
            result = new Discard();
        }
        else if (this._match(TokenTypes.keywords.break)) {
            result = new Break();
        }
        else if (this._match(TokenTypes.keywords.continue)) {
            result = new Continue();
        }
        else {
            result =
                this._increment_decrement_statement() ||
                    this._func_call_statement() ||
                    this._assignment_statement();
        }
        if (result != null) {
            this._consume(TokenTypes.tokens.semicolon, "Expected ';' after statement.");
        }
        return result;
    }
    _static_assert_statement() {
        if (!this._match(TokenTypes.keywords.static_assert)) {
            return null;
        }
        const expression = this._optional_paren_expression();
        return new StaticAssert(expression);
    }
    _while_statement() {
        if (!this._match(TokenTypes.keywords.while)) {
            return null;
        }
        const condition = this._optional_paren_expression();
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        const block = this._compound_statement();
        return new While(condition, block);
    }
    _continuing_statement() {
        if (!this._match(TokenTypes.keywords.continuing)) {
            return null;
        }
        const block = this._compound_statement();
        return new Continuing(block);
    }
    _for_statement() {
        // for paren_left for_header paren_right compound_statement
        if (!this._match(TokenTypes.keywords.for)) {
            return null;
        }
        this._consume(TokenTypes.tokens.paren_left, "Expected '('.");
        // for_header: (variable_statement assignment_statement func_call_statement)? semicolon short_circuit_or_expression? semicolon (assignment_statement func_call_statement)?
        const init = !this._check(TokenTypes.tokens.semicolon)
            ? this._for_init()
            : null;
        this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
        const condition = !this._check(TokenTypes.tokens.semicolon)
            ? this._short_circuit_or_expression()
            : null;
        this._consume(TokenTypes.tokens.semicolon, "Expected ';'.");
        const increment = !this._check(TokenTypes.tokens.paren_right)
            ? this._for_increment()
            : null;
        this._consume(TokenTypes.tokens.paren_right, "Expected ')'.");
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        const body = this._compound_statement();
        return new For(init, condition, increment, body);
    }
    _for_init() {
        // (variable_statement assignment_statement func_call_statement)?
        return (this._variable_statement() ||
            this._func_call_statement() ||
            this._assignment_statement());
    }
    _for_increment() {
        // (assignment_statement func_call_statement increment_statement)?
        return (this._func_call_statement() ||
            this._increment_decrement_statement() ||
            this._assignment_statement());
    }
    _variable_statement() {
        // variable_decl
        // variable_decl equal short_circuit_or_expression
        // let (ident variable_ident_decl) equal short_circuit_or_expression
        // const (ident variable_ident_decl) equal short_circuit_or_expression
        if (this._check(TokenTypes.keywords.var)) {
            const _var = this._variable_decl();
            if (_var === null) {
                throw this._error(this._peek(), "Variable declaration expected.");
            }
            let value = null;
            if (this._match(TokenTypes.tokens.equal)) {
                value = this._short_circuit_or_expression();
            }
            return new Var(_var.name, _var.type, _var.storage, _var.access, value);
        }
        if (this._match(TokenTypes.keywords.let)) {
            const name = this._consume(TokenTypes.tokens.ident, "Expected name for let.").toString();
            let type = null;
            if (this._match(TokenTypes.tokens.colon)) {
                const typeAttrs = this._attribute();
                type = this._type_decl();
                if (type != null) {
                    type.attributes = typeAttrs;
                }
            }
            this._consume(TokenTypes.tokens.equal, "Expected '=' for let.");
            const value = this._short_circuit_or_expression();
            return new Let(name, type, null, null, value);
        }
        if (this._match(TokenTypes.keywords.const)) {
            const name = this._consume(TokenTypes.tokens.ident, "Expected name for const.").toString();
            let type = null;
            if (this._match(TokenTypes.tokens.colon)) {
                const typeAttrs = this._attribute();
                type = this._type_decl();
                if (type != null) {
                    type.attributes = typeAttrs;
                }
            }
            this._consume(TokenTypes.tokens.equal, "Expected '=' for const.");
            const value = this._short_circuit_or_expression();
            return new Const(name, type, null, null, value);
        }
        return null;
    }
    _increment_decrement_statement() {
        const savedPos = this._current;
        const _var = this._unary_expression();
        if (_var == null) {
            return null;
        }
        if (!this._check(TokenTypes.increment_operators)) {
            this._current = savedPos;
            return null;
        }
        const token = this._consume(TokenTypes.increment_operators, "Expected increment operator");
        return new Increment(token.type === TokenTypes.tokens.plus_plus
            ? IncrementOperator.increment
            : IncrementOperator.decrement, _var);
    }
    _assignment_statement() {
        // (unary_expression underscore) equal short_circuit_or_expression
        let _var = null;
        if (this._check(TokenTypes.tokens.brace_right)) {
            return null;
        }
        let isUnderscore = this._match(TokenTypes.tokens.underscore);
        if (!isUnderscore) {
            _var = this._unary_expression();
        }
        if (!isUnderscore && _var == null) {
            return null;
        }
        const type = this._consume(TokenTypes.assignment_operators, "Expected assignment operator.");
        const value = this._short_circuit_or_expression();
        return new Assign(AssignOperator.parse(type.lexeme), _var, value);
    }
    _func_call_statement() {
        // ident argument_expression_list
        if (!this._check(TokenTypes.tokens.ident)) {
            return null;
        }
        const savedPos = this._current;
        const name = this._consume(TokenTypes.tokens.ident, "Expected function name.");
        const args = this._argument_expression_list();
        if (args === null) {
            this._current = savedPos;
            return null;
        }
        return new Call(name.lexeme, args);
    }
    _loop_statement() {
        // loop brace_left statement* continuing_statement? brace_right
        if (!this._match(TokenTypes.keywords.loop)) {
            return null;
        }
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        this._consume(TokenTypes.tokens.brace_left, "Expected '{' for loop.");
        // statement*
        const statements = [];
        let statement = this._statement();
        while (statement !== null) {
            if (Array.isArray(statement)) {
                for (let s of statement) {
                    statements.push(s);
                }
            }
            else {
                statements.push(statement);
            }
            statement = this._statement();
        }
        // continuing_statement: continuing compound_statement
        let continuing = null;
        if (this._match(TokenTypes.keywords.continuing)) {
            continuing = this._compound_statement();
        }
        this._consume(TokenTypes.tokens.brace_right, "Expected '}' for loop.");
        return new Loop(statements, continuing);
    }
    _switch_statement() {
        // switch optional_paren_expression brace_left switch_body+ brace_right
        if (!this._match(TokenTypes.keywords.switch)) {
            return null;
        }
        const condition = this._optional_paren_expression();
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        this._consume(TokenTypes.tokens.brace_left, "Expected '{' for switch.");
        const body = this._switch_body();
        if (body == null || body.length == 0) {
            throw this._error(this._previous(), "Expected 'case' or 'default'.");
        }
        this._consume(TokenTypes.tokens.brace_right, "Expected '}' for switch.");
        return new Switch(condition, body);
    }
    _switch_body() {
        // case case_selectors colon brace_left case_body? brace_right
        // default colon brace_left case_body? brace_right
        const cases = [];
        if (this._match(TokenTypes.keywords.case)) {
            const selector = this._case_selectors();
            this._match(TokenTypes.tokens.colon); // colon is optional
            if (this._check(TokenTypes.tokens.attr)) {
                this._attribute();
            }
            this._consume(TokenTypes.tokens.brace_left, "Exected '{' for switch case.");
            const body = this._case_body();
            this._consume(TokenTypes.tokens.brace_right, "Exected '}' for switch case.");
            cases.push(new Case(selector, body));
        }
        if (this._match(TokenTypes.keywords.default)) {
            this._match(TokenTypes.tokens.colon); // colon is optional
            if (this._check(TokenTypes.tokens.attr)) {
                this._attribute();
            }
            this._consume(TokenTypes.tokens.brace_left, "Exected '{' for switch default.");
            const body = this._case_body();
            this._consume(TokenTypes.tokens.brace_right, "Exected '}' for switch default.");
            cases.push(new Default(body));
        }
        if (this._check([TokenTypes.keywords.default, TokenTypes.keywords.case])) {
            const _cases = this._switch_body();
            cases.push(_cases[0]);
        }
        return cases;
    }
    _case_selectors() {
        // const_literal (comma const_literal)* comma?
        const selectors = [
            this._shift_expression(), //?.evaluate(this._context).toString() ?? "",
        ];
        while (this._match(TokenTypes.tokens.comma)) {
            selectors.push(this._shift_expression());
        }
        return selectors;
    }
    _case_body() {
        // statement case_body?
        // fallthrough semicolon
        if (this._match(TokenTypes.keywords.fallthrough)) {
            this._consume(TokenTypes.tokens.semicolon, "Expected ';'");
            return [];
        }
        let statement = this._statement();
        if (statement == null) {
            return [];
        }
        if (!(statement instanceof Array)) {
            statement = [statement];
        }
        const nextStatement = this._case_body();
        if (nextStatement.length == 0) {
            return statement;
        }
        return [...statement, nextStatement[0]];
    }
    _if_statement() {
        // if optional_paren_expression compound_statement elseif_statement? else_statement?
        if (!this._match(TokenTypes.keywords.if)) {
            return null;
        }
        const condition = this._optional_paren_expression();
        if (this._check(TokenTypes.tokens.attr)) {
            this._attribute();
        }
        const block = this._compound_statement();
        let elseif = [];
        if (this._match_elseif()) {
            if (this._check(TokenTypes.tokens.attr)) {
                this._attribute();
            }
            elseif = this._elseif_statement(elseif);
        }
        let _else = null;
        if (this._match(TokenTypes.keywords.else)) {
            if (this._check(TokenTypes.tokens.attr)) {
                this._attribute();
            }
            _else = this._compound_statement();
        }
        return new If(condition, block, elseif, _else);
    }
    _match_elseif() {
        if (this._tokens[this._current].type === TokenTypes.keywords.else &&
            this._tokens[this._current + 1].type === TokenTypes.keywords.if) {
            this._advance();
            this._advance();
            return true;
        }
        return false;
    }
    _elseif_statement(elseif = []) {
        // else_if optional_paren_expression compound_statement elseif_statement?
        const condition = this._optional_paren_expression();
        const block = this._compound_statement();
        elseif.push(new ElseIf(condition, block));
        if (this._match_elseif()) {
            if (this._check(TokenTypes.tokens.attr)) {
                this._attribute();
            }
            this._elseif_statement(elseif);
        }
        return elseif;
    }
    _return_statement() {
        // return short_circuit_or_expression?
        if (!this._match(TokenTypes.keywords.return)) {
            return null;
        }
        const value = this._short_circuit_or_expression();
        return new Return(value);
    }
    _short_circuit_or_expression() {
        // short_circuit_and_expression
        // short_circuit_or_expression or_or short_circuit_and_expression
        let expr = this._short_circuit_and_expr();
        while (this._match(TokenTypes.tokens.or_or)) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._short_circuit_and_expr());
        }
        return expr;
    }
    _short_circuit_and_expr() {
        // inclusive_or_expression
        // short_circuit_and_expression and_and inclusive_or_expression
        let expr = this._inclusive_or_expression();
        while (this._match(TokenTypes.tokens.and_and)) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._inclusive_or_expression());
        }
        return expr;
    }
    _inclusive_or_expression() {
        // exclusive_or_expression
        // inclusive_or_expression or exclusive_or_expression
        let expr = this._exclusive_or_expression();
        while (this._match(TokenTypes.tokens.or)) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._exclusive_or_expression());
        }
        return expr;
    }
    _exclusive_or_expression() {
        // and_expression
        // exclusive_or_expression xor and_expression
        let expr = this._and_expression();
        while (this._match(TokenTypes.tokens.xor)) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._and_expression());
        }
        return expr;
    }
    _and_expression() {
        // equality_expression
        // and_expression and equality_expression
        let expr = this._equality_expression();
        while (this._match(TokenTypes.tokens.and)) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._equality_expression());
        }
        return expr;
    }
    _equality_expression() {
        // relational_expression
        // relational_expression equal_equal relational_expression
        // relational_expression not_equal relational_expression
        const expr = this._relational_expression();
        if (this._match([TokenTypes.tokens.equal_equal, TokenTypes.tokens.not_equal])) {
            return new BinaryOperator(this._previous().toString(), expr, this._relational_expression());
        }
        return expr;
    }
    _relational_expression() {
        // shift_expression
        // relational_expression less_than shift_expression
        // relational_expression greater_than shift_expression
        // relational_expression less_than_equal shift_expression
        // relational_expression greater_than_equal shift_expression
        let expr = this._shift_expression();
        while (this._match([
            TokenTypes.tokens.less_than,
            TokenTypes.tokens.greater_than,
            TokenTypes.tokens.less_than_equal,
            TokenTypes.tokens.greater_than_equal,
        ])) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._shift_expression());
        }
        return expr;
    }
    _shift_expression() {
        // additive_expression
        // shift_expression shift_left additive_expression
        // shift_expression shift_right additive_expression
        let expr = this._additive_expression();
        while (this._match([TokenTypes.tokens.shift_left, TokenTypes.tokens.shift_right])) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._additive_expression());
        }
        return expr;
    }
    _additive_expression() {
        // multiplicative_expression
        // additive_expression plus multiplicative_expression
        // additive_expression minus multiplicative_expression
        let expr = this._multiplicative_expression();
        while (this._match([TokenTypes.tokens.plus, TokenTypes.tokens.minus])) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._multiplicative_expression());
        }
        return expr;
    }
    _multiplicative_expression() {
        // unary_expression
        // multiplicative_expression star unary_expression
        // multiplicative_expression forward_slash unary_expression
        // multiplicative_expression modulo unary_expression
        let expr = this._unary_expression();
        while (this._match([
            TokenTypes.tokens.star,
            TokenTypes.tokens.forward_slash,
            TokenTypes.tokens.modulo,
        ])) {
            expr = new BinaryOperator(this._previous().toString(), expr, this._unary_expression());
        }
        return expr;
    }
    _unary_expression() {
        // singular_expression
        // minus unary_expression
        // bang unary_expression
        // tilde unary_expression
        // star unary_expression
        // and unary_expression
        if (this._match([
            TokenTypes.tokens.minus,
            TokenTypes.tokens.bang,
            TokenTypes.tokens.tilde,
            TokenTypes.tokens.star,
            TokenTypes.tokens.and,
        ])) {
            return new UnaryOperator(this._previous().toString(), this._unary_expression());
        }
        return this._singular_expression();
    }
    _singular_expression() {
        // primary_expression postfix_expression ?
        const expr = this._primary_expression();
        const p = this._postfix_expression();
        if (p) {
            expr.postfix = p;
        }
        return expr;
    }
    _postfix_expression() {
        // bracket_left short_circuit_or_expression bracket_right postfix_expression?
        if (this._match(TokenTypes.tokens.bracket_left)) {
            const expr = this._short_circuit_or_expression();
            this._consume(TokenTypes.tokens.bracket_right, "Expected ']'.");
            const arrayIndex = new ArrayIndex(expr);
            const p = this._postfix_expression();
            if (p) {
                arrayIndex.postfix = p;
            }
            return arrayIndex;
        }
        // period ident postfix_expression?
        if (this._match(TokenTypes.tokens.period)) {
            const name = this._consume(TokenTypes.tokens.ident, "Expected member name.");
            const p = this._postfix_expression();
            const expr = new StringExpr(name.lexeme);
            if (p) {
                expr.postfix = p;
            }
            return expr;
        }
        return null;
    }
    _getStruct(name) {
        if (this._context.aliases.has(name)) {
            const alias = this._context.aliases.get(name).type;
            return alias;
        }
        if (this._context.structs.has(name)) {
            const struct = this._context.structs.get(name);
            return struct;
        }
        return null;
    }
    _primary_expression() {
        // ident argument_expression_list?
        if (this._match(TokenTypes.tokens.ident)) {
            const name = this._previous().toString();
            if (this._check(TokenTypes.tokens.paren_left)) {
                const args = this._argument_expression_list();
                const struct = this._getStruct(name);
                if (struct != null) {
                    return new CreateExpr(struct, args);
                }
                return new CallExpr(name, args);
            }
            if (this._context.constants.has(name)) {
                const c = this._context.constants.get(name);
                return new ConstExpr(name, c.value);
            }
            return new VariableExpr(name);
        }
        // const_literal
        if (this._match(TokenTypes.const_literal)) {
            return new LiteralExpr(parseFloat(this._previous().toString()));
        }
        // paren_expression
        if (this._check(TokenTypes.tokens.paren_left)) {
            return this._paren_expression();
        }
        // bitcast less_than type_decl greater_than paren_expression
        if (this._match(TokenTypes.keywords.bitcast)) {
            this._consume(TokenTypes.tokens.less_than, "Expected '<'.");
            const type = this._type_decl();
            this._consume(TokenTypes.tokens.greater_than, "Expected '>'.");
            const value = this._paren_expression();
            return new BitcastExpr(type, value);
        }
        // type_decl argument_expression_list
        const type = this._type_decl();
        const args = this._argument_expression_list();
        return new TypecastExpr(type, args);
    }
    _argument_expression_list() {
        // paren_left ((short_circuit_or_expression comma)* short_circuit_or_expression comma?)? paren_right
        if (!this._match(TokenTypes.tokens.paren_left)) {
            return null;
        }
        const args = [];
        do {
            if (this._check(TokenTypes.tokens.paren_right)) {
                break;
            }
            const arg = this._short_circuit_or_expression();
            args.push(arg);
        } while (this._match(TokenTypes.tokens.comma));
        this._consume(TokenTypes.tokens.paren_right, "Expected ')' for agument list");
        return args;
    }
    _optional_paren_expression() {
        // [paren_left] short_circuit_or_expression [paren_right]
        this._match(TokenTypes.tokens.paren_left);
        const expr = this._short_circuit_or_expression();
        this._match(TokenTypes.tokens.paren_right);
        return new GroupingExpr([expr]);
    }
    _paren_expression() {
        // paren_left short_circuit_or_expression paren_right
        this._consume(TokenTypes.tokens.paren_left, "Expected '('.");
        const expr = this._short_circuit_or_expression();
        this._consume(TokenTypes.tokens.paren_right, "Expected ')'.");
        return new GroupingExpr([expr]);
    }
    _struct_decl() {
        // attribute* struct ident struct_body_decl
        if (!this._match(TokenTypes.keywords.struct)) {
            return null;
        }
        const startLine = this._currentLine;
        const name = this._consume(TokenTypes.tokens.ident, "Expected name for struct.").toString();
        // struct_body_decl: brace_left (struct_member comma)* struct_member comma? brace_right
        this._consume(TokenTypes.tokens.brace_left, "Expected '{' for struct body.");
        const members = [];
        while (!this._check(TokenTypes.tokens.brace_right)) {
            // struct_member: attribute* variable_ident_decl
            const memberAttrs = this._attribute();
            const memberName = this._consume(TokenTypes.tokens.ident, "Expected variable name.").toString();
            this._consume(TokenTypes.tokens.colon, "Expected ':' for struct member type.");
            const typeAttrs = this._attribute();
            const memberType = this._type_decl();
            if (memberType != null) {
                memberType.attributes = typeAttrs;
            }
            if (!this._check(TokenTypes.tokens.brace_right))
                this._consume(TokenTypes.tokens.comma, "Expected ',' for struct member.");
            else
                this._match(TokenTypes.tokens.comma); // trailing comma optional.
            members.push(new Member(memberName, memberType, memberAttrs));
        }
        this._consume(TokenTypes.tokens.brace_right, "Expected '}' after struct body.");
        const endLine = this._currentLine;
        const structNode = new Struct(name, members, startLine, endLine);
        this._context.structs.set(name, structNode);
        return structNode;
    }
    _global_variable_decl() {
        // attribute* variable_decl (equal const_expression)?
        const _var = this._variable_decl();
        if (_var && this._match(TokenTypes.tokens.equal)) {
            _var.value = this._const_expression();
        }
        return _var;
    }
    _override_variable_decl() {
        // attribute* override_decl (equal const_expression)?
        const _override = this._override_decl();
        if (_override && this._match(TokenTypes.tokens.equal)) {
            _override.value = this._const_expression();
        }
        return _override;
    }
    _global_const_decl() {
        // attribute* const (ident variable_ident_decl) global_const_initializer?
        if (!this._match(TokenTypes.keywords.const)) {
            return null;
        }
        const name = this._consume(TokenTypes.tokens.ident, "Expected variable name");
        let type = null;
        if (this._match(TokenTypes.tokens.colon)) {
            const attrs = this._attribute();
            type = this._type_decl();
            if (type != null) {
                type.attributes = attrs;
            }
        }
        let value = null;
        if (this._match(TokenTypes.tokens.equal)) {
            const valueExpr = this._short_circuit_or_expression();
            if (valueExpr instanceof CreateExpr) {
                value = valueExpr;
            }
            else if (valueExpr instanceof ConstExpr &&
                valueExpr.initializer instanceof CreateExpr) {
                value = valueExpr.initializer;
            }
            else {
                try {
                    const constValue = valueExpr.evaluate(this._context);
                    value = new LiteralExpr(constValue);
                }
                catch (_a) {
                    value = valueExpr;
                }
            }
        }
        const c = new Const(name.toString(), type, "", "", value);
        this._context.constants.set(c.name, c);
        return c;
    }
    _global_let_decl() {
        // attribute* let (ident variable_ident_decl) global_const_initializer?
        if (!this._match(TokenTypes.keywords.let)) {
            return null;
        }
        const name = this._consume(TokenTypes.tokens.ident, "Expected variable name");
        let type = null;
        if (this._match(TokenTypes.tokens.colon)) {
            const attrs = this._attribute();
            type = this._type_decl();
            if (type != null) {
                type.attributes = attrs;
            }
        }
        let value = null;
        if (this._match(TokenTypes.tokens.equal)) {
            value = this._const_expression();
        }
        return new Let(name.toString(), type, "", "", value);
    }
    _const_expression() {
        // type_decl paren_left ((const_expression comma)* const_expression comma?)? paren_right
        // const_literal
        if (this._match(TokenTypes.const_literal)) {
            return new StringExpr(this._previous().toString());
        }
        const type = this._type_decl();
        this._consume(TokenTypes.tokens.paren_left, "Expected '('.");
        let args = [];
        while (!this._check(TokenTypes.tokens.paren_right)) {
            args.push(this._const_expression());
            if (!this._check(TokenTypes.tokens.comma)) {
                break;
            }
            this._advance();
        }
        this._consume(TokenTypes.tokens.paren_right, "Expected ')'.");
        return new CreateExpr(type, args);
    }
    _variable_decl() {
        // var variable_qualifier? (ident variable_ident_decl)
        if (!this._match(TokenTypes.keywords.var)) {
            return null;
        }
        // variable_qualifier: less_than storage_class (comma access_mode)? greater_than
        let storage = "";
        let access = "";
        if (this._match(TokenTypes.tokens.less_than)) {
            storage = this._consume(TokenTypes.storage_class, "Expected storage_class.").toString();
            if (this._match(TokenTypes.tokens.comma))
                access = this._consume(TokenTypes.access_mode, "Expected access_mode.").toString();
            this._consume(TokenTypes.tokens.greater_than, "Expected '>'.");
        }
        const name = this._consume(TokenTypes.tokens.ident, "Expected variable name");
        let type = null;
        if (this._match(TokenTypes.tokens.colon)) {
            const attrs = this._attribute();
            type = this._type_decl();
            if (type != null) {
                type.attributes = attrs;
            }
        }
        return new Var(name.toString(), type, storage, access, null);
    }
    _override_decl() {
        // override (ident variable_ident_decl)
        if (!this._match(TokenTypes.keywords.override)) {
            return null;
        }
        const name = this._consume(TokenTypes.tokens.ident, "Expected variable name");
        let type = null;
        if (this._match(TokenTypes.tokens.colon)) {
            const attrs = this._attribute();
            type = this._type_decl();
            if (type != null) {
                type.attributes = attrs;
            }
        }
        return new Override(name.toString(), type, null);
    }
    _diagnostic() {
        // diagnostic(severity_control_name, diagnostic_rule_name)
        this._consume(TokenTypes.tokens.paren_left, "Expected '('");
        const severity = this._consume(TokenTypes.tokens.ident, "Expected severity control name.");
        this._consume(TokenTypes.tokens.comma, "Expected ','");
        const rule = this._consume(TokenTypes.tokens.ident, "Expected diagnostic rule name.");
        this._consume(TokenTypes.tokens.paren_right, "Expected ')'");
        return new Diagnostic(severity.toString(), rule.toString());
    }
    _enable_directive() {
        // enable ident semicolon
        const name = this._consume(TokenTypes.tokens.ident, "identity expected.");
        return new Enable(name.toString());
    }
    _requires_directive() {
        // requires extension [, extension]* semicolon
        const extensions = [this._consume(TokenTypes.tokens.ident, "identity expected.").toString()];
        while (this._match(TokenTypes.tokens.comma)) {
            const name = this._consume(TokenTypes.tokens.ident, "identity expected.");
            extensions.push(name.toString());
        }
        return new Requires(extensions);
    }
    _type_alias() {
        // type ident equal type_decl
        const name = this._consume(TokenTypes.tokens.ident, "identity expected.");
        this._consume(TokenTypes.tokens.equal, "Expected '=' for type alias.");
        let aliasType = this._type_decl();
        if (aliasType === null) {
            throw this._error(this._peek(), "Expected Type for Alias.");
        }
        if (this._context.aliases.has(aliasType.name)) {
            aliasType = this._context.aliases.get(aliasType.name).type;
        }
        const aliasNode = new Alias(name.toString(), aliasType);
        this._context.aliases.set(aliasNode.name, aliasNode);
        return aliasNode;
    }
    _type_decl() {
        // ident
        // bool
        // float32
        // int32
        // uint32
        // vec2 less_than type_decl greater_than
        // vec3 less_than type_decl greater_than
        // vec4 less_than type_decl greater_than
        // mat2x2 less_than type_decl greater_than
        // mat2x3 less_than type_decl greater_than
        // mat2x4 less_than type_decl greater_than
        // mat3x2 less_than type_decl greater_than
        // mat3x3 less_than type_decl greater_than
        // mat3x4 less_than type_decl greater_than
        // mat4x2 less_than type_decl greater_than
        // mat4x3 less_than type_decl greater_than
        // mat4x4 less_than type_decl greater_than
        // atomic less_than type_decl greater_than
        // pointer less_than storage_class comma type_decl (comma access_mode)? greater_than
        // array_type_decl
        // texture_sampler_types
        if (this._check([
            TokenTypes.tokens.ident,
            ...TokenTypes.texel_format,
            TokenTypes.keywords.bool,
            TokenTypes.keywords.f32,
            TokenTypes.keywords.i32,
            TokenTypes.keywords.u32,
        ])) {
            const type = this._advance();
            const typeName = type.toString();
            if (this._context.structs.has(typeName)) {
                return this._context.structs.get(typeName);
            }
            if (this._context.aliases.has(typeName)) {
                return this._context.aliases.get(typeName).type;
            }
            return new Type(type.toString());
        }
        // texture_sampler_types
        let type = this._texture_sampler_types();
        if (type) {
            return type;
        }
        if (this._check(TokenTypes.template_types)) {
            let type = this._advance().toString();
            let format = null;
            let access = null;
            if (this._match(TokenTypes.tokens.less_than)) {
                format = this._type_decl();
                access = null;
                if (this._match(TokenTypes.tokens.comma)) {
                    access = this._consume(TokenTypes.access_mode, "Expected access_mode for pointer").toString();
                }
                this._consume(TokenTypes.tokens.greater_than, "Expected '>' for type.");
            }
            return new TemplateType(type, format, access);
        }
        // pointer less_than storage_class comma type_decl (comma access_mode)? greater_than
        if (this._match(TokenTypes.keywords.ptr)) {
            let pointer = this._previous().toString();
            this._consume(TokenTypes.tokens.less_than, "Expected '<' for pointer.");
            const storage = this._consume(TokenTypes.storage_class, "Expected storage_class for pointer");
            this._consume(TokenTypes.tokens.comma, "Expected ',' for pointer.");
            const decl = this._type_decl();
            let access = null;
            if (this._match(TokenTypes.tokens.comma)) {
                access = this._consume(TokenTypes.access_mode, "Expected access_mode for pointer").toString();
            }
            this._consume(TokenTypes.tokens.greater_than, "Expected '>' for pointer.");
            return new PointerType(pointer, storage.toString(), decl, access);
        }
        // The following type_decl's have an optional attribyte_list*
        const attrs = this._attribute();
        // attribute* array
        // attribute* array less_than type_decl (comma element_count_expression)? greater_than
        if (this._match(TokenTypes.keywords.array)) {
            let format = null;
            let countInt = -1;
            const array = this._previous();
            let countNode = null;
            if (this._match(TokenTypes.tokens.less_than)) {
                format = this._type_decl();
                if (this._context.aliases.has(format.name)) {
                    format = this._context.aliases.get(format.name).type;
                }
                let count = "";
                if (this._match(TokenTypes.tokens.comma)) {
                    countNode = this._shift_expression();
                    // If we can't evaluate the node, defer evaluating it until after the shader has
                    // finished being parsed, because const statements can be declared **after** they
                    // are used.
                    try {
                        count = countNode.evaluate(this._context).toString();
                        countNode = null;
                    }
                    catch (e) {
                        count = "1";
                    }
                }
                this._consume(TokenTypes.tokens.greater_than, "Expected '>' for array.");
                countInt = count ? parseInt(count) : 0;
            }
            const arrayType = new ArrayType(array.toString(), attrs, format, countInt);
            if (countNode) {
                this._deferArrayCountEval.push({ arrayType, countNode });
            }
            return arrayType;
        }
        return null;
    }
    _texture_sampler_types() {
        // sampler_type
        if (this._match(TokenTypes.sampler_type)) {
            return new SamplerType(this._previous().toString(), null, null);
        }
        // depth_texture_type
        if (this._match(TokenTypes.depth_texture_type)) {
            return new SamplerType(this._previous().toString(), null, null);
        }
        // sampled_texture_type less_than type_decl greater_than
        // multisampled_texture_type less_than type_decl greater_than
        if (this._match(TokenTypes.sampled_texture_type) ||
            this._match(TokenTypes.multisampled_texture_type)) {
            const sampler = this._previous();
            this._consume(TokenTypes.tokens.less_than, "Expected '<' for sampler type.");
            const format = this._type_decl();
            this._consume(TokenTypes.tokens.greater_than, "Expected '>' for sampler type.");
            return new SamplerType(sampler.toString(), format, null);
        }
        // storage_texture_type less_than texel_format comma access_mode greater_than
        if (this._match(TokenTypes.storage_texture_type)) {
            const sampler = this._previous();
            this._consume(TokenTypes.tokens.less_than, "Expected '<' for sampler type.");
            const format = this._consume(TokenTypes.texel_format, "Invalid texel format.").toString();
            this._consume(TokenTypes.tokens.comma, "Expected ',' after texel format.");
            const access = this._consume(TokenTypes.access_mode, "Expected access mode for storage texture type.").toString();
            this._consume(TokenTypes.tokens.greater_than, "Expected '>' for sampler type.");
            return new SamplerType(sampler.toString(), format, access);
        }
        return null;
    }
    _attribute() {
        // attr ident paren_left (literal_or_ident comma)* literal_or_ident paren_right
        // attr ident
        let attributes = [];
        while (this._match(TokenTypes.tokens.attr)) {
            const name = this._consume(TokenTypes.attribute_name, "Expected attribute name");
            const attr = new Attribute(name.toString(), null);
            if (this._match(TokenTypes.tokens.paren_left)) {
                // literal_or_ident
                attr.value = this._consume(TokenTypes.literal_or_ident, "Expected attribute value").toString();
                if (this._check(TokenTypes.tokens.comma)) {
                    this._advance();
                    do {
                        const v = this._consume(TokenTypes.literal_or_ident, "Expected attribute value").toString();
                        if (!(attr.value instanceof Array)) {
                            attr.value = [attr.value];
                        }
                        attr.value.push(v);
                    } while (this._match(TokenTypes.tokens.comma));
                }
                this._consume(TokenTypes.tokens.paren_right, "Expected ')'");
            }
            attributes.push(attr);
        }
        // Deprecated:
        // attr_left (attribute comma)* attribute attr_right
        while (this._match(TokenTypes.tokens.attr_left)) {
            if (!this._check(TokenTypes.tokens.attr_right)) {
                do {
                    const name = this._consume(TokenTypes.attribute_name, "Expected attribute name");
                    const attr = new Attribute(name.toString(), null);
                    if (this._match(TokenTypes.tokens.paren_left)) {
                        // literal_or_ident
                        attr.value = [
                            this._consume(TokenTypes.literal_or_ident, "Expected attribute value").toString(),
                        ];
                        if (this._check(TokenTypes.tokens.comma)) {
                            this._advance();
                            do {
                                const v = this._consume(TokenTypes.literal_or_ident, "Expected attribute value").toString();
                                attr.value.push(v);
                            } while (this._match(TokenTypes.tokens.comma));
                        }
                        this._consume(TokenTypes.tokens.paren_right, "Expected ')'");
                    }
                    attributes.push(attr);
                } while (this._match(TokenTypes.tokens.comma));
            }
            // Consume ]]
            this._consume(TokenTypes.tokens.attr_right, "Expected ']]' after attribute declarations");
        }
        if (attributes.length == 0) {
            return null;
        }
        return attributes;
    }
}

/**
 * @author Brendan Duncan / https://github.com/brendan-duncan
 */
class TypeInfo {
    constructor(name, attributes) {
        this.name = name;
        this.attributes = attributes;
        this.size = 0;
    }
    get isArray() {
        return false;
    }
    get isStruct() {
        return false;
    }
    get isTemplate() {
        return false;
    }
}
class MemberInfo {
    constructor(name, type, attributes) {
        this.name = name;
        this.type = type;
        this.attributes = attributes;
        this.offset = 0;
        this.size = 0;
    }
    get isArray() {
        return this.type.isArray;
    }
    get isStruct() {
        return this.type.isStruct;
    }
    get isTemplate() {
        return this.type.isTemplate;
    }
    get align() {
        return this.type.isStruct ? this.type.align : 0;
    }
    get members() {
        return this.type.isStruct ? this.type.members : null;
    }
    get format() {
        return this.type.isArray
            ? this.type.format
            : this.type.isTemplate
                ? this.type.format
                : null;
    }
    get count() {
        return this.type.isArray ? this.type.count : 0;
    }
    get stride() {
        return this.type.isArray ? this.type.stride : this.size;
    }
}
class StructInfo extends TypeInfo {
    constructor(name, attributes) {
        super(name, attributes);
        this.members = [];
        this.align = 0;
        this.startLine = -1;
        this.endLine = -1;
        this.inUse = false;
    }
    get isStruct() {
        return true;
    }
}
class ArrayInfo extends TypeInfo {
    constructor(name, attributes) {
        super(name, attributes);
        this.count = 0;
        this.stride = 0;
    }
    get isArray() {
        return true;
    }
}
class TemplateInfo extends TypeInfo {
    constructor(name, format, attributes, access) {
        super(name, attributes);
        this.format = format;
        this.access = access;
    }
    get isTemplate() {
        return true;
    }
}
var ResourceType;
(function (ResourceType) {
    ResourceType[ResourceType["Uniform"] = 0] = "Uniform";
    ResourceType[ResourceType["Storage"] = 1] = "Storage";
    ResourceType[ResourceType["Texture"] = 2] = "Texture";
    ResourceType[ResourceType["Sampler"] = 3] = "Sampler";
    ResourceType[ResourceType["StorageTexture"] = 4] = "StorageTexture";
})(ResourceType || (ResourceType = {}));
class VariableInfo {
    constructor(name, type, group, binding, attributes, resourceType, access) {
        this.name = name;
        this.type = type;
        this.group = group;
        this.binding = binding;
        this.attributes = attributes;
        this.resourceType = resourceType;
        this.access = access;
    }
    get isArray() {
        return this.type.isArray;
    }
    get isStruct() {
        return this.type.isStruct;
    }
    get isTemplate() {
        return this.type.isTemplate;
    }
    get size() {
        return this.type.size;
    }
    get align() {
        return this.type.isStruct ? this.type.align : 0;
    }
    get members() {
        return this.type.isStruct ? this.type.members : null;
    }
    get format() {
        return this.type.isArray
            ? this.type.format
            : this.type.isTemplate
                ? this.type.format
                : null;
    }
    get count() {
        return this.type.isArray ? this.type.count : 0;
    }
    get stride() {
        return this.type.isArray ? this.type.stride : this.size;
    }
}
class AliasInfo {
    constructor(name, type) {
        this.name = name;
        this.type = type;
    }
}
class _TypeSize {
    constructor(align, size) {
        this.align = align;
        this.size = size;
    }
}
class InputInfo {
    constructor(name, type, locationType, location) {
        this.name = name;
        this.type = type;
        this.locationType = locationType;
        this.location = location;
        this.interpolation = null;
    }
}
class OutputInfo {
    constructor(name, type, locationType, location) {
        this.name = name;
        this.type = type;
        this.locationType = locationType;
        this.location = location;
    }
}
class FunctionInfo {
    constructor(name, stage = null) {
        this.stage = null;
        this.inputs = [];
        this.outputs = [];
        this.resources = [];
        this.startLine = -1;
        this.endLine = -1;
        this.inUse = false;
        this.calls = new Set();
        this.name = name;
        this.stage = stage;
    }
}
class EntryFunctions {
    constructor() {
        this.vertex = [];
        this.fragment = [];
        this.compute = [];
    }
}
class OverrideInfo {
    constructor(name, type, attributes, id) {
        this.name = name;
        this.type = type;
        this.attributes = attributes;
        this.id = id;
    }
}
class _FunctionResources {
    constructor(node) {
        this.resources = null;
        this.inUse = false;
        this.info = null;
        this.node = node;
    }
}
class WgslReflect {
    constructor(code) {
        /// All top-level uniform vars in the shader.
        this.uniforms = [];
        /// All top-level storage vars in the shader.
        this.storage = [];
        /// All top-level texture vars in the shader;
        this.textures = [];
        // All top-level sampler vars in the shader.
        this.samplers = [];
        /// All top-level type aliases in the shader.
        this.aliases = [];
        /// All top-level overrides in the shader.
        this.overrides = [];
        /// All top-level structs in the shader.
        this.structs = [];
        /// All entry functions in the shader: vertex, fragment, and/or compute.
        this.entry = new EntryFunctions();
        /// All functions in the shader, including entry functions.
        this.functions = [];
        this._types = new Map();
        this._functions = new Map();
        if (code) {
            this.update(code);
        }
    }
    _isStorageTexture(type) {
        return (type.name == "texture_storage_1d" ||
            type.name == "texture_storage_2d" ||
            type.name == "texture_storage_2d_array" ||
            type.name == "texture_storage_3d");
    }
    update(code) {
        const parser = new WgslParser();
        const ast = parser.parse(code);
        for (const node of ast) {
            if (node instanceof Function) {
                this._functions.set(node.name, new _FunctionResources(node));
            }
        }
        for (const node of ast) {
            if (node instanceof Struct) {
                const info = this._getTypeInfo(node, null);
                if (info instanceof StructInfo) {
                    this.structs.push(info);
                }
            }
        }
        for (const node of ast) {
            if (node instanceof Alias) {
                this.aliases.push(this._getAliasInfo(node));
                continue;
            }
            if (node instanceof Override) {
                const v = node;
                const id = this._getAttributeNum(v.attributes, "id", 0);
                const type = v.type != null ? this._getTypeInfo(v.type, v.attributes) : null;
                this.overrides.push(new OverrideInfo(v.name, type, v.attributes, id));
                continue;
            }
            if (this._isUniformVar(node)) {
                const v = node;
                const g = this._getAttributeNum(v.attributes, "group", 0);
                const b = this._getAttributeNum(v.attributes, "binding", 0);
                const type = this._getTypeInfo(v.type, v.attributes);
                const varInfo = new VariableInfo(v.name, type, g, b, v.attributes, ResourceType.Uniform, v.access);
                this.uniforms.push(varInfo);
                continue;
            }
            if (this._isStorageVar(node)) {
                const v = node;
                const g = this._getAttributeNum(v.attributes, "group", 0);
                const b = this._getAttributeNum(v.attributes, "binding", 0);
                const type = this._getTypeInfo(v.type, v.attributes);
                const isStorageTexture = this._isStorageTexture(type);
                const varInfo = new VariableInfo(v.name, type, g, b, v.attributes, isStorageTexture ? ResourceType.StorageTexture : ResourceType.Storage, v.access);
                this.storage.push(varInfo);
                continue;
            }
            if (this._isTextureVar(node)) {
                const v = node;
                const g = this._getAttributeNum(v.attributes, "group", 0);
                const b = this._getAttributeNum(v.attributes, "binding", 0);
                const type = this._getTypeInfo(v.type, v.attributes);
                const isStorageTexture = this._isStorageTexture(type);
                const varInfo = new VariableInfo(v.name, type, g, b, v.attributes, isStorageTexture ? ResourceType.StorageTexture : ResourceType.Texture, v.access);
                if (isStorageTexture) {
                    this.storage.push(varInfo);
                }
                else {
                    this.textures.push(varInfo);
                }
                continue;
            }
            if (this._isSamplerVar(node)) {
                const v = node;
                const g = this._getAttributeNum(v.attributes, "group", 0);
                const b = this._getAttributeNum(v.attributes, "binding", 0);
                const type = this._getTypeInfo(v.type, v.attributes);
                const varInfo = new VariableInfo(v.name, type, g, b, v.attributes, ResourceType.Sampler, v.access);
                this.samplers.push(varInfo);
                continue;
            }
            if (node instanceof Function) {
                const vertexStage = this._getAttribute(node, "vertex");
                const fragmentStage = this._getAttribute(node, "fragment");
                const computeStage = this._getAttribute(node, "compute");
                const stage = vertexStage || fragmentStage || computeStage;
                const fn = new FunctionInfo(node.name, stage === null || stage === void 0 ? void 0 : stage.name);
                fn.startLine = node.startLine;
                fn.endLine = node.endLine;
                this.functions.push(fn);
                this._functions.get(node.name).info = fn;
                if (stage) {
                    this._functions.get(node.name).inUse = true;
                    fn.inUse = true;
                    fn.resources = this._findResources(node, !!stage);
                    fn.inputs = this._getInputs(node.args);
                    fn.outputs = this._getOutputs(node.returnType);
                    this.entry[stage.name].push(fn);
                }
                continue;
            }
        }
        for (const fn of this._functions.values()) {
            if (fn.info) {
                fn.info.inUse = fn.inUse;
                this._addCalls(fn.node, fn.info.calls);
            }
        }
        for (const u of this.uniforms) {
            this._markStructsInUse(u.type);
        }
        for (const s of this.storage) {
            this._markStructsInUse(s.type);
        }
    }
    _markStructsInUse(type) {
        if (type.isStruct) {
            type.inUse = true;
            for (const m of type.members) {
                this._markStructsInUse(m.type);
            }
        }
        else if (type.isArray) {
            this._markStructsInUse(type.format);
        }
        else if (type.isTemplate) {
            this._markStructsInUse(type.format);
        }
        else {
            const alias = this._getAlias(type.name);
            if (alias) {
                this._markStructsInUse(alias);
            }
        }
    }
    _addCalls(fn, calls) {
        var _a;
        for (const call of fn.calls) {
            const info = (_a = this._functions.get(call.name)) === null || _a === void 0 ? void 0 : _a.info;
            if (info) {
                calls.add(info);
            }
        }
    }
    /// Find a resource by its group and binding.
    findResource(group, binding) {
        for (const u of this.uniforms) {
            if (u.group == group && u.binding == binding) {
                return u;
            }
        }
        for (const s of this.storage) {
            if (s.group == group && s.binding == binding) {
                return s;
            }
        }
        for (const t of this.textures) {
            if (t.group == group && t.binding == binding) {
                return t;
            }
        }
        for (const s of this.samplers) {
            if (s.group == group && s.binding == binding) {
                return s;
            }
        }
        return null;
    }
    _findResource(name) {
        for (const u of this.uniforms) {
            if (u.name == name) {
                return u;
            }
        }
        for (const s of this.storage) {
            if (s.name == name) {
                return s;
            }
        }
        for (const t of this.textures) {
            if (t.name == name) {
                return t;
            }
        }
        for (const s of this.samplers) {
            if (s.name == name) {
                return s;
            }
        }
        return null;
    }
    _markStructsFromAST(type) {
        const info = this._getTypeInfo(type, null);
        this._markStructsInUse(info);
    }
    _findResources(fn, isEntry) {
        const resources = [];
        const self = this;
        const varStack = [];
        fn.search((node) => {
            if (node instanceof _BlockStart) {
                varStack.push({});
            }
            else if (node instanceof _BlockEnd) {
                varStack.pop();
            }
            else if (node instanceof Var) {
                const v = node;
                if (isEntry && v.type !== null) {
                    this._markStructsFromAST(v.type);
                }
                if (varStack.length > 0) {
                    varStack[varStack.length - 1][v.name] = v;
                }
            }
            else if (node instanceof CreateExpr) {
                const c = node;
                if (isEntry && c.type !== null) {
                    this._markStructsFromAST(c.type);
                }
            }
            else if (node instanceof Let) {
                const v = node;
                if (isEntry && v.type !== null) {
                    this._markStructsFromAST(v.type);
                }
                if (varStack.length > 0) {
                    varStack[varStack.length - 1][v.name] = v;
                }
            }
            else if (node instanceof VariableExpr) {
                const v = node;
                // Check to see if the variable is a local variable before checking to see if it's
                // a resource.
                if (varStack.length > 0) {
                    const varInfo = varStack[varStack.length - 1][v.name];
                    if (varInfo) {
                        return;
                    }
                }
                const varInfo = self._findResource(v.name);
                if (varInfo) {
                    resources.push(varInfo);
                }
            }
            else if (node instanceof CallExpr) {
                const c = node;
                const callFn = self._functions.get(c.name);
                if (callFn) {
                    if (isEntry) {
                        callFn.inUse = true;
                    }
                    fn.calls.add(callFn.node);
                    if (callFn.resources === null) {
                        callFn.resources = self._findResources(callFn.node, isEntry);
                    }
                    resources.push(...callFn.resources);
                }
            }
            else if (node instanceof Call) {
                const c = node;
                const callFn = self._functions.get(c.name);
                if (callFn) {
                    if (isEntry) {
                        callFn.inUse = true;
                    }
                    fn.calls.add(callFn.node);
                    if (callFn.resources === null) {
                        callFn.resources = self._findResources(callFn.node, isEntry);
                    }
                    resources.push(...callFn.resources);
                }
            }
        });
        return [...new Map(resources.map(r => [r.name, r])).values()];
    }
    getBindGroups() {
        const groups = [];
        function _makeRoom(group, binding) {
            if (group >= groups.length) {
                groups.length = group + 1;
            }
            if (groups[group] === undefined) {
                groups[group] = [];
            }
            if (binding >= groups[group].length) {
                groups[group].length = binding + 1;
            }
        }
        for (const u of this.uniforms) {
            _makeRoom(u.group, u.binding);
            const group = groups[u.group];
            group[u.binding] = u;
        }
        for (const u of this.storage) {
            _makeRoom(u.group, u.binding);
            const group = groups[u.group];
            group[u.binding] = u;
        }
        for (const t of this.textures) {
            _makeRoom(t.group, t.binding);
            const group = groups[t.group];
            group[t.binding] = t;
        }
        for (const t of this.samplers) {
            _makeRoom(t.group, t.binding);
            const group = groups[t.group];
            group[t.binding] = t;
        }
        return groups;
    }
    _getOutputs(type, outputs = undefined) {
        if (outputs === undefined) {
            outputs = [];
        }
        if (type instanceof Struct) {
            this._getStructOutputs(type, outputs);
        }
        else {
            const output = this._getOutputInfo(type);
            if (output !== null) {
                outputs.push(output);
            }
        }
        return outputs;
    }
    _getStructOutputs(struct, outputs) {
        for (const m of struct.members) {
            if (m.type instanceof Struct) {
                this._getStructOutputs(m.type, outputs);
            }
            else {
                const location = this._getAttribute(m, "location") || this._getAttribute(m, "builtin");
                if (location !== null) {
                    const typeInfo = this._getTypeInfo(m.type, m.type.attributes);
                    const locationValue = this._parseInt(location.value);
                    const info = new OutputInfo(m.name, typeInfo, location.name, locationValue);
                    outputs.push(info);
                }
            }
        }
    }
    _getOutputInfo(type) {
        const location = this._getAttribute(type, "location") ||
            this._getAttribute(type, "builtin");
        if (location !== null) {
            const typeInfo = this._getTypeInfo(type, type.attributes);
            const locationValue = this._parseInt(location.value);
            const info = new OutputInfo("", typeInfo, location.name, locationValue);
            return info;
        }
        return null;
    }
    _getInputs(args, inputs = undefined) {
        if (inputs === undefined) {
            inputs = [];
        }
        for (const arg of args) {
            if (arg.type instanceof Struct) {
                this._getStructInputs(arg.type, inputs);
            }
            else {
                const input = this._getInputInfo(arg);
                if (input !== null) {
                    inputs.push(input);
                }
            }
        }
        return inputs;
    }
    _getStructInputs(struct, inputs) {
        for (const m of struct.members) {
            if (m.type instanceof Struct) {
                this._getStructInputs(m.type, inputs);
            }
            else {
                const input = this._getInputInfo(m);
                if (input !== null) {
                    inputs.push(input);
                }
            }
        }
    }
    _getInputInfo(node) {
        const location = this._getAttribute(node, "location") ||
            this._getAttribute(node, "builtin");
        if (location !== null) {
            const interpolation = this._getAttribute(node, "interpolation");
            const type = this._getTypeInfo(node.type, node.attributes);
            const locationValue = this._parseInt(location.value);
            const info = new InputInfo(node.name, type, location.name, locationValue);
            if (interpolation !== null) {
                info.interpolation = this._parseString(interpolation.value);
            }
            return info;
        }
        return null;
    }
    _parseString(s) {
        if (s instanceof Array) {
            s = s[0];
        }
        return s;
    }
    _parseInt(s) {
        if (s instanceof Array) {
            s = s[0];
        }
        const n = parseInt(s);
        return isNaN(n) ? s : n;
    }
    _getAlias(name) {
        for (const a of this.aliases) {
            if (a.name == name) {
                return a.type;
            }
        }
        return null;
    }
    _getAliasInfo(node) {
        return new AliasInfo(node.name, this._getTypeInfo(node.type, null));
    }
    _getTypeInfo(type, attributes) {
        if (this._types.has(type)) {
            return this._types.get(type);
        }
        if (type instanceof ArrayType) {
            const a = type;
            const t = this._getTypeInfo(a.format, a.attributes);
            const info = new ArrayInfo(a.name, attributes);
            info.format = t;
            info.count = a.count;
            this._types.set(type, info);
            this._updateTypeInfo(info);
            return info;
        }
        if (type instanceof Struct) {
            const s = type;
            const info = new StructInfo(s.name, attributes);
            info.startLine = s.startLine;
            info.endLine = s.endLine;
            for (const m of s.members) {
                const t = this._getTypeInfo(m.type, m.attributes);
                info.members.push(new MemberInfo(m.name, t, m.attributes));
            }
            this._types.set(type, info);
            this._updateTypeInfo(info);
            return info;
        }
        if (type instanceof SamplerType) {
            const s = type;
            const formatIsType = s.format instanceof Type;
            const format = s.format
                ? formatIsType
                    ? this._getTypeInfo(s.format, null)
                    : new TypeInfo(s.format, null)
                : null;
            const info = new TemplateInfo(s.name, format, attributes, s.access);
            this._types.set(type, info);
            this._updateTypeInfo(info);
            return info;
        }
        if (type instanceof TemplateType) {
            const t = type;
            const format = t.format ? this._getTypeInfo(t.format, null) : null;
            const info = new TemplateInfo(t.name, format, attributes, t.access);
            this._types.set(type, info);
            this._updateTypeInfo(info);
            return info;
        }
        const info = new TypeInfo(type.name, attributes);
        this._types.set(type, info);
        this._updateTypeInfo(info);
        return info;
    }
    _updateTypeInfo(type) {
        var _a, _b;
        const typeSize = this._getTypeSize(type);
        type.size = (_a = typeSize === null || typeSize === void 0 ? void 0 : typeSize.size) !== null && _a !== void 0 ? _a : 0;
        if (type instanceof ArrayInfo) {
            const formatInfo = this._getTypeSize(type["format"]);
            type.stride = (_b = formatInfo === null || formatInfo === void 0 ? void 0 : formatInfo.size) !== null && _b !== void 0 ? _b : 0;
            this._updateTypeInfo(type["format"]);
        }
        if (type instanceof StructInfo) {
            this._updateStructInfo(type);
        }
    }
    _updateStructInfo(struct) {
        var _a;
        let offset = 0;
        let lastSize = 0;
        let lastOffset = 0;
        let structAlign = 0;
        for (let mi = 0, ml = struct.members.length; mi < ml; ++mi) {
            const member = struct.members[mi];
            const sizeInfo = this._getTypeSize(member);
            if (!sizeInfo) {
                continue;
            }
            (_a = this._getAlias(member.type.name)) !== null && _a !== void 0 ? _a : member.type;
            const align = sizeInfo.align;
            const size = sizeInfo.size;
            offset = this._roundUp(align, offset + lastSize);
            lastSize = size;
            lastOffset = offset;
            structAlign = Math.max(structAlign, align);
            member.offset = offset;
            member.size = size;
            this._updateTypeInfo(member.type);
        }
        struct.size = this._roundUp(structAlign, lastOffset + lastSize);
        struct.align = structAlign;
    }
    _getTypeSize(type) {
        var _a;
        if (type === null || type === undefined) {
            return null;
        }
        const explicitSize = this._getAttributeNum(type.attributes, "size", 0);
        const explicitAlign = this._getAttributeNum(type.attributes, "align", 0);
        if (type instanceof MemberInfo) {
            type = type.type;
        }
        if (type instanceof TypeInfo) {
            const alias = this._getAlias(type.name);
            if (alias !== null) {
                type = alias;
            }
        }
        {
            const info = WgslReflect._typeInfo[type.name];
            if (info !== undefined) {
                const divisor = type["format"] === "f16" ? 2 : 1;
                return new _TypeSize(Math.max(explicitAlign, info.align / divisor), Math.max(explicitSize, info.size / divisor));
            }
        }
        {
            const info = WgslReflect._typeInfo[type.name.substring(0, type.name.length - 1)];
            if (info) {
                const divisor = type.name[type.name.length - 1] === "h" ? 2 : 1;
                return new _TypeSize(Math.max(explicitAlign, info.align / divisor), Math.max(explicitSize, info.size / divisor));
            }
        }
        if (type instanceof ArrayInfo) {
            let arrayType = type;
            let align = 8;
            let size = 8;
            // Type                 AlignOf(T)          Sizeof(T)
            // array<E, N>          AlignOf(E)          N * roundUp(AlignOf(E), SizeOf(E))
            // array<E>             AlignOf(E)          N * roundUp(AlignOf(E), SizeOf(E))  (N determined at runtime)
            //
            // @stride(Q)
            // array<E, N>          AlignOf(E)          N * Q
            //
            // @stride(Q)
            // array<E>             AlignOf(E)          Nruntime * Q
            //const E = type.format.name;
            const E = this._getTypeSize(arrayType.format);
            if (E !== null) {
                size = E.size;
                align = E.align;
            }
            const N = arrayType.count;
            const stride = this._getAttributeNum((_a = type === null || type === void 0 ? void 0 : type.attributes) !== null && _a !== void 0 ? _a : null, "stride", this._roundUp(align, size));
            size = N * stride;
            if (explicitSize) {
                size = explicitSize;
            }
            return new _TypeSize(Math.max(explicitAlign, align), Math.max(explicitSize, size));
        }
        if (type instanceof StructInfo) {
            let align = 0;
            let size = 0;
            // struct S     AlignOf:    max(AlignOfMember(S, M1), ... , AlignOfMember(S, MN))
            //              SizeOf:     roundUp(AlignOf(S), OffsetOfMember(S, L) + SizeOfMember(S, L))
            //                          Where L is the last member of the structure
            let offset = 0;
            let lastSize = 0;
            let lastOffset = 0;
            for (const m of type.members) {
                const mi = this._getTypeSize(m.type);
                if (mi !== null) {
                    align = Math.max(mi.align, align);
                    offset = this._roundUp(mi.align, offset + lastSize);
                    lastSize = mi.size;
                    lastOffset = offset;
                }
            }
            size = this._roundUp(align, lastOffset + lastSize);
            return new _TypeSize(Math.max(explicitAlign, align), Math.max(explicitSize, size));
        }
        return null;
    }
    _isUniformVar(node) {
        return node instanceof Var && node.storage == "uniform";
    }
    _isStorageVar(node) {
        return node instanceof Var && node.storage == "storage";
    }
    _isTextureVar(node) {
        return (node instanceof Var &&
            node.type !== null &&
            WgslReflect._textureTypes.indexOf(node.type.name) != -1);
    }
    _isSamplerVar(node) {
        return (node instanceof Var &&
            node.type !== null &&
            WgslReflect._samplerTypes.indexOf(node.type.name) != -1);
    }
    _getAttribute(node, name) {
        const obj = node;
        if (!obj || !obj["attributes"]) {
            return null;
        }
        const attrs = obj["attributes"];
        for (let a of attrs) {
            if (a.name == name) {
                return a;
            }
        }
        return null;
    }
    _getAttributeNum(attributes, name, defaultValue) {
        if (attributes === null) {
            return defaultValue;
        }
        for (let a of attributes) {
            if (a.name == name) {
                let v = a !== null && a.value !== null ? a.value : defaultValue;
                if (v instanceof Array) {
                    v = v[0];
                }
                if (typeof v === "number") {
                    return v;
                }
                if (typeof v === "string") {
                    return parseInt(v);
                }
                return defaultValue;
            }
        }
        return defaultValue;
    }
    _roundUp(k, n) {
        return Math.ceil(n / k) * k;
    }
}
// Type                 AlignOf(T)          Sizeof(T)
// i32, u32, or f32     4                   4
// atomic<T>            4                   4
// vec2<T>              8                   8
// vec3<T>              16                  12
// vec4<T>              16                  16
// mat2x2<f32>          8                   16
// mat3x2<f32>          8                   24
// mat4x2<f32>          8                   32
// mat2x3<f32>          16                  32
// mat3x3<f32>          16                  48
// mat4x3<f32>          16                  64
// mat2x4<f32>          16                  32
// mat3x4<f32>          16                  48
// mat4x4<f32>          16                  64
WgslReflect._typeInfo = {
    f16: { align: 2, size: 2 },
    i32: { align: 4, size: 4 },
    u32: { align: 4, size: 4 },
    f32: { align: 4, size: 4 },
    atomic: { align: 4, size: 4 },
    vec2: { align: 8, size: 8 },
    vec3: { align: 16, size: 12 },
    vec4: { align: 16, size: 16 },
    mat2x2: { align: 8, size: 16 },
    mat3x2: { align: 8, size: 24 },
    mat4x2: { align: 8, size: 32 },
    mat2x3: { align: 16, size: 32 },
    mat3x3: { align: 16, size: 48 },
    mat4x3: { align: 16, size: 64 },
    mat2x4: { align: 16, size: 32 },
    mat3x4: { align: 16, size: 48 },
    mat4x4: { align: 16, size: 64 },
};
WgslReflect._textureTypes = TokenTypes.any_texture_type.map((t) => {
    return t.name;
});
WgslReflect._samplerTypes = TokenTypes.sampler_type.map((t) => {
    return t.name;
});
function getNamedVariables(reflect, variables) {
    return Object.fromEntries(variables.map(v => {
        const typeDefinition = addVariableType(reflect, v, 0);
        return [
            v.name,
            {
                typeDefinition,
                group: v.group,
                binding: v.binding,
                size: typeDefinition.size,
            },
        ];
    }));
}
function makeStructDefinition(reflect, structInfo, offset) {
    // StructDefinition
    const fields = Object.fromEntries(structInfo.members.map(m => {
        return [
            m.name,
            {
                offset: m.offset,
                type: addType(reflect, m.type, 0),
            },
        ];
    }));
    return {
        fields,
        size: structInfo.size,
        offset,
    };
}
function getTextureSampleType(type) {
    if (type.name.includes('depth')) {
        return 'depth';
    }
    // unfiltered-float
    switch (type.format?.name) {
        case 'f32': return 'float';
        case 'i32': return 'sint';
        case 'u32': return 'uint';
        default:
            throw new Error('unknown texture sample type');
    }
}
function getViewDimension(type) {
    if (type.name.includes('2d_array')) {
        return '2d-array';
    }
    if (type.name.includes('cube_array')) {
        return 'cube-array';
    }
    if (type.name.includes('3d')) {
        return '3d';
    }
    if (type.name.includes('1d')) {
        return '1d';
    }
    if (type.name.includes('cube')) {
        return 'cube';
    }
    return '2d';
}
function getStorageTextureAccess(type) {
    switch (type.access) {
        case 'read': return 'read-only';
        case 'write': return 'write-only';
        case 'read_write': return 'read-write';
        default:
            throw new Error('unknonw storage texture access');
    }
}
function getSamplerType(type) {
    // "non-filtering" can only be specified manually.
    return type.name.endsWith('_comparison')
        ? 'comparison'
        : 'filtering';
}
function getBindGroupLayoutEntry(resource, visibility) {
    const { binding, access, type } = resource;
    switch (resource.resourceType) {
        case ResourceType.Uniform:
            return {
                binding,
                visibility,
                buffer: {
                    ...(resource.size && { minBindingSize: resource.size }),
                },
            };
        case ResourceType.Storage:
            return {
                binding,
                visibility,
                buffer: {
                    type: (access === '' || access === 'read') ? 'read-only-storage' : 'storage',
                    ...(resource.size && { minBindingSize: resource.size }),
                },
            };
        case ResourceType.Texture: {
            if (type.name === 'texture_external') {
                return {
                    binding,
                    visibility,
                    externalTexture: {},
                };
            }
            const multisampled = type.name.includes('multisampled');
            return {
                binding,
                visibility,
                texture: {
                    sampleType: getTextureSampleType(type),
                    viewDimension: getViewDimension(type),
                    multisampled,
                },
            };
        }
        case ResourceType.Sampler:
            return {
                binding,
                visibility,
                sampler: {
                    type: getSamplerType(type),
                },
            };
        case ResourceType.StorageTexture:
            return {
                binding,
                visibility,
                storageTexture: {
                    access: getStorageTextureAccess(type),
                    format: type.format.name,
                    viewDimension: getViewDimension(type),
                },
            };
        default:
            throw new Error('unknown resource type');
    }
}
function addEntryPoints(funcInfos, stage) {
    const entryPoints = {};
    for (const info of funcInfos) {
        entryPoints[info.name] = {
            stage,
            resources: info.resources.map(resource => {
                const { name, group } = resource;
                return {
                    name,
                    group,
                    entry: getBindGroupLayoutEntry(resource, stage),
                };
            }),
        };
    }
    return entryPoints;
}
/**
 * Given a WGSL shader, returns data definitions for structures,
 * uniforms, and storage buffers
 *
 * Example:
 *
 * ```js
 * const code = `
 * struct MyStruct {
 *    color: vec4f,
 *    brightness: f32,
 *    kernel: array<f32, 9>,
 * };
 * @group(0) @binding(0) var<uniform> myUniforms: MyUniforms;
 * `;
 * const defs = makeShaderDataDefinitions(code);
 * const myUniformValues = makeStructuredView(defs.uniforms.myUniforms);
 *
 * myUniformValues.set({
 *   color: [1, 0, 1, 1],
 *   brightness: 0.8,
 *   kernel: [
 *      1, 0, -1,
 *      2, 0, -2,
 *      1, 0, -1,
 *   ],
 * });
 * device.queue.writeBuffer(uniformBuffer, 0, myUniformValues.arrayBuffer);
 * ```
 *
 * @param code WGSL shader. Note: it is not required for this to be a complete shader
 * @returns definitions of the structures by name. Useful for passing to {@link makeStructuredView}
 */
function makeShaderDataDefinitions(code) {
    const reflect = new WgslReflect(code);
    const structs = Object.fromEntries(reflect.structs.map(structInfo => {
        return [structInfo.name, makeStructDefinition(reflect, structInfo, 0)];
    }));
    const uniforms = getNamedVariables(reflect, reflect.uniforms);
    const storages = getNamedVariables(reflect, reflect.storage.filter(v => v.resourceType === ResourceType.Storage));
    const storageTextures = getNamedVariables(reflect, reflect.storage.filter(v => v.resourceType === ResourceType.StorageTexture));
    const textures = getNamedVariables(reflect, reflect.textures.filter(v => v.type.name !== 'texture_external'));
    const externalTextures = getNamedVariables(reflect, reflect.textures.filter(v => v.type.name === 'texture_external'));
    const samplers = getNamedVariables(reflect, reflect.samplers);
    const entryPoints = {
        ...addEntryPoints(reflect.entry.vertex, GPUShaderStage.VERTEX),
        ...addEntryPoints(reflect.entry.fragment, GPUShaderStage.FRAGMENT),
        ...addEntryPoints(reflect.entry.compute, GPUShaderStage.COMPUTE),
    };
    return {
        externalTextures,
        samplers,
        structs,
        storages,
        storageTextures,
        textures,
        uniforms,
        entryPoints,
    };
}
function assert(cond, msg = '') {
    if (!cond) {
        throw new Error(msg);
    }
}
/*
 write down what I want for a given type

    struct VSUniforms {
        foo: u32,
    };
    @group(4) @binding(1) var<uniform> uni1: f32;
    @group(3) @binding(2) var<uniform> uni2: array<f32, 5>;
    @group(2) @binding(3) var<uniform> uni3: VSUniforms;
    @group(1) @binding(4) var<uniform> uni4: array<VSUniforms, 6>;

    uni1: {
        type: 'f32',
        numElements: undefined
    },
    uni2: {
        type: 'array',
        elementType: 'f32'
        numElements: 5,
    },
    uni3: {
        type: 'struct',
        fields: {
            foo: {
                type: 'f32',
                numElements: undefined
            }
        },
    },
    uni4: {
        type: 'array',
        elementType:
        fields: {
            foo: {
                type: 'f32',
                numElements: undefined
            }
        },
        fields: {
            foo: {
                type: 'f32',
                numElements: undefined
            }
        },
        ...
    ]

    */
function addVariableType(reflect, v, offset) {
    switch (v.resourceType) {
        case ResourceType.Uniform:
        case ResourceType.Storage:
        case ResourceType.StorageTexture:
            return addType(reflect, v.type, offset);
        default:
            return {
                size: 0,
                type: v.type.name,
            };
    }
}
function addType(reflect, typeInfo, offset) {
    if (typeInfo.isArray) {
        assert(!typeInfo.isStruct, 'struct array is invalid');
        assert(!typeInfo.isStruct, 'template array is invalid');
        const arrayInfo = typeInfo;
        // ArrayDefinition
        return {
            size: arrayInfo.size,
            elementType: addType(reflect, arrayInfo.format, offset),
            numElements: arrayInfo.count,
        };
    }
    else if (typeInfo.isStruct) {
        assert(!typeInfo.isTemplate, 'template struct is invalid');
        const structInfo = typeInfo;
        return makeStructDefinition(reflect, structInfo, offset);
    }
    else {
        // template is like vec4<f32> or mat4x4<f16>
        const asTemplateInfo = typeInfo;
        const type = typeInfo.isTemplate
            ? `${asTemplateInfo.name}<${asTemplateInfo.format.name}>`
            : typeInfo.name;
        // IntrinsicDefinition
        return {
            size: typeInfo.size,
            type: type,
        };
    }
}

const kTypedArrayToAttribFormat = new Map([
    [Int8Array, { formats: ['sint8', 'snorm8'], defaultForType: 1 }],
    [Uint8Array, { formats: ['uint8', 'unorm8'], defaultForType: 1 }],
    [Int16Array, { formats: ['sint16', 'snorm16'], defaultForType: 1 }],
    [Uint16Array, { formats: ['uint16', 'unorm16'], defaultForType: 1 }],
    [Int32Array, { formats: ['sint32', 'snorm32'], defaultForType: 0 }],
    [Uint32Array, { formats: ['uint32', 'unorm32'], defaultForType: 0 }],
    [Float32Array, { formats: ['float32', 'float32'], defaultForType: 0 }],
    // TODO: Add Float16Array
]);
new Map([...kTypedArrayToAttribFormat.entries()].map(([Type, { formats: [s1, s2] }]) => [[s1, Type], [s2, Type]]).flat());

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var balancedMatch = balanced$1;
function balanced$1(a, b, str) {
  if (a instanceof RegExp) a = maybeMatch(a, str);
  if (b instanceof RegExp) b = maybeMatch(b, str);

  var r = range(a, b, str);

  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + a.length, r[1]),
    post: str.slice(r[1] + b.length)
  };
}

function maybeMatch(reg, str) {
  var m = str.match(reg);
  return m ? m[0] : null;
}

balanced$1.range = range;
function range(a, b, str) {
  var begs, beg, left, right, result;
  var ai = str.indexOf(a);
  var bi = str.indexOf(b, ai + 1);
  var i = ai;

  if (ai >= 0 && bi > 0) {
    if(a===b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;

    while (i >= 0 && !result) {
      if (i == ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length == 1) {
        result = [ begs.pop(), bi ];
      } else {
        beg = begs.pop();
        if (beg < left) {
          left = beg;
          right = bi;
        }

        bi = str.indexOf(b, i + 1);
      }

      i = ai < bi && ai >= 0 ? ai : bi;
    }

    if (begs.length) {
      result = [ left, right ];
    }
  }

  return result;
}

var balanced = balancedMatch;

var braceExpansion = expandTop;

var escSlash = '\0SLASH'+Math.random()+'\0';
var escOpen = '\0OPEN'+Math.random()+'\0';
var escClose = '\0CLOSE'+Math.random()+'\0';
var escComma = '\0COMMA'+Math.random()+'\0';
var escPeriod = '\0PERIOD'+Math.random()+'\0';

function numeric(str) {
  return parseInt(str, 10) == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

function escapeBraces(str) {
  return str.split('\\\\').join(escSlash)
            .split('\\{').join(escOpen)
            .split('\\}').join(escClose)
            .split('\\,').join(escComma)
            .split('\\.').join(escPeriod);
}

function unescapeBraces(str) {
  return str.split(escSlash).join('\\')
            .split(escOpen).join('{')
            .split(escClose).join('}')
            .split(escComma).join(',')
            .split(escPeriod).join('.');
}


// Basically just str.split(","), but handling cases
// where we have nested braced sections, which should be
// treated as individual members, like {a,{b,c},d}
function parseCommaParts(str) {
  if (!str)
    return [''];

  var parts = [];
  var m = balanced('{', '}', str);

  if (!m)
    return str.split(',');

  var pre = m.pre;
  var body = m.body;
  var post = m.post;
  var p = pre.split(',');

  p[p.length-1] += '{' + body + '}';
  var postParts = parseCommaParts(post);
  if (post.length) {
    p[p.length-1] += postParts.shift();
    p.push.apply(p, postParts);
  }

  parts.push.apply(parts, p);

  return parts;
}

function expandTop(str) {
  if (!str)
    return [];

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.substr(0, 2) === '{}') {
    str = '\\{\\}' + str.substr(2);
  }

  return expand(escapeBraces(str), true).map(unescapeBraces);
}

function embrace(str) {
  return '{' + str + '}';
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}

function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}

function expand(str, isTop) {
  var expansions = [];

  var m = balanced('{', '}', str);
  if (!m) return [str];

  // no need to expand pre, since it is guaranteed to be free of brace-sets
  var pre = m.pre;
  var post = m.post.length
    ? expand(m.post, false)
    : [''];

  if (/\$$/.test(m.pre)) {    
    for (var k = 0; k < post.length; k++) {
      var expansion = pre+ '{' + m.body + '}' + post[k];
      expansions.push(expansion);
    }
  } else {
    var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    var isSequence = isNumericSequence || isAlphaSequence;
    var isOptions = m.body.indexOf(',') >= 0;
    if (!isSequence && !isOptions) {
      // {a},b}
      if (m.post.match(/,.*\}/)) {
        str = m.pre + '{' + m.body + escClose + m.post;
        return expand(str);
      }
      return [str];
    }

    var n;
    if (isSequence) {
      n = m.body.split(/\.\./);
    } else {
      n = parseCommaParts(m.body);
      if (n.length === 1) {
        // x{{a,b}}y ==> x{a}y x{b}y
        n = expand(n[0], false).map(embrace);
        if (n.length === 1) {
          return post.map(function(p) {
            return m.pre + n[0] + p;
          });
        }
      }
    }

    // at this point, n is the parts, and we know it's not a comma set
    // with a single entry.
    var N;

    if (isSequence) {
      var x = numeric(n[0]);
      var y = numeric(n[1]);
      var width = Math.max(n[0].length, n[1].length);
      var incr = n.length == 3
        ? Math.abs(numeric(n[2]))
        : 1;
      var test = lte;
      var reverse = y < x;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      var pad = n.some(isPadded);

      N = [];

      for (var i = x; test(i, y); i += incr) {
        var c;
        if (isAlphaSequence) {
          c = String.fromCharCode(i);
          if (c === '\\')
            c = '';
        } else {
          c = String(i);
          if (pad) {
            var need = width - c.length;
            if (need > 0) {
              var z = new Array(need + 1).join('0');
              if (i < 0)
                c = '-' + z + c.slice(1);
              else
                c = z + c;
            }
          }
        }
        N.push(c);
      }
    } else {
      N = [];

      for (var j = 0; j < n.length; j++) {
        N.push.apply(N, expand(n[j], false));
      }
    }

    for (var j = 0; j < N.length; j++) {
      for (var k = 0; k < post.length; k++) {
        var expansion = pre + N[j] + post[k];
        if (!isTop || isSequence || expansion)
          expansions.push(expansion);
      }
    }
  }

  return expansions;
}

var expand$1 = /*@__PURE__*/getDefaultExportFromCjs(braceExpansion);

const MAX_PATTERN_LENGTH = 1024 * 64;
const assertValidPattern = (pattern) => {
    if (typeof pattern !== 'string') {
        throw new TypeError('invalid pattern');
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new TypeError('pattern is too long');
    }
};

// translate the various posix character classes into unicode properties
// this works across all unicode locales
// { <posix class>: [<translation>, /u flag required, negated]
const posixClasses = {
    '[:alnum:]': ['\\p{L}\\p{Nl}\\p{Nd}', true],
    '[:alpha:]': ['\\p{L}\\p{Nl}', true],
    '[:ascii:]': ['\\x' + '00-\\x' + '7f', false],
    '[:blank:]': ['\\p{Zs}\\t', true],
    '[:cntrl:]': ['\\p{Cc}', true],
    '[:digit:]': ['\\p{Nd}', true],
    '[:graph:]': ['\\p{Z}\\p{C}', true, true],
    '[:lower:]': ['\\p{Ll}', true],
    '[:print:]': ['\\p{C}', true],
    '[:punct:]': ['\\p{P}', true],
    '[:space:]': ['\\p{Z}\\t\\r\\n\\v\\f', true],
    '[:upper:]': ['\\p{Lu}', true],
    '[:word:]': ['\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}', true],
    '[:xdigit:]': ['A-Fa-f0-9', false],
};
// only need to escape a few things inside of brace expressions
// escapes: [ \ ] -
const braceEscape = (s) => s.replace(/[[\]\\-]/g, '\\$&');
// escape all regexp magic characters
const regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
// everything has already been escaped, we just have to join
const rangesToString = (ranges) => ranges.join('');
// takes a glob string at a posix brace expression, and returns
// an equivalent regular expression source, and boolean indicating
// whether the /u flag needs to be applied, and the number of chars
// consumed to parse the character class.
// This also removes out of order ranges, and returns ($.) if the
// entire class just no good.
const parseClass = (glob, position) => {
    const pos = position;
    /* c8 ignore start */
    if (glob.charAt(pos) !== '[') {
        throw new Error('not in a brace expression');
    }
    /* c8 ignore stop */
    const ranges = [];
    const negs = [];
    let i = pos + 1;
    let sawStart = false;
    let uflag = false;
    let escaping = false;
    let negate = false;
    let endPos = pos;
    let rangeStart = '';
    WHILE: while (i < glob.length) {
        const c = glob.charAt(i);
        if ((c === '!' || c === '^') && i === pos + 1) {
            negate = true;
            i++;
            continue;
        }
        if (c === ']' && sawStart && !escaping) {
            endPos = i + 1;
            break;
        }
        sawStart = true;
        if (c === '\\') {
            if (!escaping) {
                escaping = true;
                i++;
                continue;
            }
            // escaped \ char, fall through and treat like normal char
        }
        if (c === '[' && !escaping) {
            // either a posix class, a collation equivalent, or just a [
            for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
                if (glob.startsWith(cls, i)) {
                    // invalid, [a-[] is fine, but not [a-[:alpha]]
                    if (rangeStart) {
                        return ['$.', false, glob.length - pos, true];
                    }
                    i += cls.length;
                    if (neg)
                        negs.push(unip);
                    else
                        ranges.push(unip);
                    uflag = uflag || u;
                    continue WHILE;
                }
            }
        }
        // now it's just a normal character, effectively
        escaping = false;
        if (rangeStart) {
            // throw this range away if it's not valid, but others
            // can still match.
            if (c > rangeStart) {
                ranges.push(braceEscape(rangeStart) + '-' + braceEscape(c));
            }
            else if (c === rangeStart) {
                ranges.push(braceEscape(c));
            }
            rangeStart = '';
            i++;
            continue;
        }
        // now might be the start of a range.
        // can be either c-d or c-] or c<more...>] or c] at this point
        if (glob.startsWith('-]', i + 1)) {
            ranges.push(braceEscape(c + '-'));
            i += 2;
            continue;
        }
        if (glob.startsWith('-', i + 1)) {
            rangeStart = c;
            i += 2;
            continue;
        }
        // not the start of a range, just a single character
        ranges.push(braceEscape(c));
        i++;
    }
    if (endPos < i) {
        // didn't see the end of the class, not a valid class,
        // but might still be valid as a literal match.
        return ['', false, 0, false];
    }
    // if we got no ranges and no negates, then we have a range that
    // cannot possibly match anything, and that poisons the whole glob
    if (!ranges.length && !negs.length) {
        return ['$.', false, glob.length - pos, true];
    }
    // if we got one positive range, and it's a single character, then that's
    // not actually a magic pattern, it's just that one literal character.
    // we should not treat that as "magic", we should just return the literal
    // character. [_] is a perfectly valid way to escape glob magic chars.
    if (negs.length === 0 &&
        ranges.length === 1 &&
        /^\\?.$/.test(ranges[0]) &&
        !negate) {
        const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
        return [regexpEscape(r), false, endPos - pos, false];
    }
    const sranges = '[' + (negate ? '^' : '') + rangesToString(ranges) + ']';
    const snegs = '[' + (negate ? '' : '^') + rangesToString(negs) + ']';
    const comb = ranges.length && negs.length
        ? '(' + sranges + '|' + snegs + ')'
        : ranges.length
            ? sranges
            : snegs;
    return [comb, uflag, endPos - pos, true];
};

/**
 * Un-escape a string that has been escaped with {@link escape}.
 *
 * If the {@link windowsPathsNoEscape} option is used, then square-brace
 * escapes are removed, but not backslash escapes.  For example, it will turn
 * the string `'[*]'` into `*`, but it will not turn `'\\*'` into `'*'`,
 * becuase `\` is a path separator in `windowsPathsNoEscape` mode.
 *
 * When `windowsPathsNoEscape` is not set, then both brace escapes and
 * backslash escapes are removed.
 *
 * Slashes (and backslashes in `windowsPathsNoEscape` mode) cannot be escaped
 * or unescaped.
 */
const unescape = (s, { windowsPathsNoEscape = false, } = {}) => {
    return windowsPathsNoEscape
        ? s.replace(/\[([^\/\\])\]/g, '$1')
        : s.replace(/((?!\\).|^)\[([^\/\\])\]/g, '$1$2').replace(/\\([^\/])/g, '$1');
};

// parse a single path portion
const types = new Set(['!', '?', '+', '*', '@']);
const isExtglobType = (c) => types.has(c);
// Patterns that get prepended to bind to the start of either the
// entire string, or just a single path portion, to prevent dots
// and/or traversal patterns, when needed.
// Exts don't need the ^ or / bit, because the root binds that already.
const startNoTraversal = '(?!(?:^|/)\\.\\.?(?:$|/))';
const startNoDot = '(?!\\.)';
// characters that indicate a start of pattern needs the "no dots" bit,
// because a dot *might* be matched. ( is not in the list, because in
// the case of a child extglob, it will handle the prevention itself.
const addPatternStart = new Set(['[', '.']);
// cases where traversal is A-OK, no dot prevention needed
const justDots = new Set(['..', '.']);
const reSpecials = new Set('().*{}+?[]^$\\!');
const regExpEscape$1 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
// any single thing other than /
const qmark$1 = '[^/]';
// * => any number of characters
const star$1 = qmark$1 + '*?';
// use + when we need to ensure that *something* matches, because the * is
// the only thing in the path portion.
const starNoEmpty = qmark$1 + '+?';
// remove the \ chars that we added if we end up doing a nonmagic compare
// const deslash = (s: string) => s.replace(/\\(.)/g, '$1')
class AST {
    type;
    #root;
    #hasMagic;
    #uflag = false;
    #parts = [];
    #parent;
    #parentIndex;
    #negs;
    #filledNegs = false;
    #options;
    #toString;
    // set to true if it's an extglob with no children
    // (which really means one child of '')
    #emptyExt = false;
    constructor(type, parent, options = {}) {
        this.type = type;
        // extglobs are inherently magical
        if (type)
            this.#hasMagic = true;
        this.#parent = parent;
        this.#root = this.#parent ? this.#parent.#root : this;
        this.#options = this.#root === this ? options : this.#root.#options;
        this.#negs = this.#root === this ? [] : this.#root.#negs;
        if (type === '!' && !this.#root.#filledNegs)
            this.#negs.push(this);
        this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
    }
    get hasMagic() {
        /* c8 ignore start */
        if (this.#hasMagic !== undefined)
            return this.#hasMagic;
        /* c8 ignore stop */
        for (const p of this.#parts) {
            if (typeof p === 'string')
                continue;
            if (p.type || p.hasMagic)
                return (this.#hasMagic = true);
        }
        // note: will be undefined until we generate the regexp src and find out
        return this.#hasMagic;
    }
    // reconstructs the pattern
    toString() {
        if (this.#toString !== undefined)
            return this.#toString;
        if (!this.type) {
            return (this.#toString = this.#parts.map(p => String(p)).join(''));
        }
        else {
            return (this.#toString =
                this.type + '(' + this.#parts.map(p => String(p)).join('|') + ')');
        }
    }
    #fillNegs() {
        /* c8 ignore start */
        if (this !== this.#root)
            throw new Error('should only call on root');
        if (this.#filledNegs)
            return this;
        /* c8 ignore stop */
        // call toString() once to fill this out
        this.toString();
        this.#filledNegs = true;
        let n;
        while ((n = this.#negs.pop())) {
            if (n.type !== '!')
                continue;
            // walk up the tree, appending everthing that comes AFTER parentIndex
            let p = n;
            let pp = p.#parent;
            while (pp) {
                for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) {
                    for (const part of n.#parts) {
                        /* c8 ignore start */
                        if (typeof part === 'string') {
                            throw new Error('string part in extglob AST??');
                        }
                        /* c8 ignore stop */
                        part.copyIn(pp.#parts[i]);
                    }
                }
                p = pp;
                pp = p.#parent;
            }
        }
        return this;
    }
    push(...parts) {
        for (const p of parts) {
            if (p === '')
                continue;
            /* c8 ignore start */
            if (typeof p !== 'string' && !(p instanceof AST && p.#parent === this)) {
                throw new Error('invalid part: ' + p);
            }
            /* c8 ignore stop */
            this.#parts.push(p);
        }
    }
    toJSON() {
        const ret = this.type === null
            ? this.#parts.slice().map(p => (typeof p === 'string' ? p : p.toJSON()))
            : [this.type, ...this.#parts.map(p => p.toJSON())];
        if (this.isStart() && !this.type)
            ret.unshift([]);
        if (this.isEnd() &&
            (this === this.#root ||
                (this.#root.#filledNegs && this.#parent?.type === '!'))) {
            ret.push({});
        }
        return ret;
    }
    isStart() {
        if (this.#root === this)
            return true;
        // if (this.type) return !!this.#parent?.isStart()
        if (!this.#parent?.isStart())
            return false;
        if (this.#parentIndex === 0)
            return true;
        // if everything AHEAD of this is a negation, then it's still the "start"
        const p = this.#parent;
        for (let i = 0; i < this.#parentIndex; i++) {
            const pp = p.#parts[i];
            if (!(pp instanceof AST && pp.type === '!')) {
                return false;
            }
        }
        return true;
    }
    isEnd() {
        if (this.#root === this)
            return true;
        if (this.#parent?.type === '!')
            return true;
        if (!this.#parent?.isEnd())
            return false;
        if (!this.type)
            return this.#parent?.isEnd();
        // if not root, it'll always have a parent
        /* c8 ignore start */
        const pl = this.#parent ? this.#parent.#parts.length : 0;
        /* c8 ignore stop */
        return this.#parentIndex === pl - 1;
    }
    copyIn(part) {
        if (typeof part === 'string')
            this.push(part);
        else
            this.push(part.clone(this));
    }
    clone(parent) {
        const c = new AST(this.type, parent);
        for (const p of this.#parts) {
            c.copyIn(p);
        }
        return c;
    }
    static #parseAST(str, ast, pos, opt) {
        let escaping = false;
        let inBrace = false;
        let braceStart = -1;
        let braceNeg = false;
        if (ast.type === null) {
            // outside of a extglob, append until we find a start
            let i = pos;
            let acc = '';
            while (i < str.length) {
                const c = str.charAt(i++);
                // still accumulate escapes at this point, but we do ignore
                // starts that are escaped
                if (escaping || c === '\\') {
                    escaping = !escaping;
                    acc += c;
                    continue;
                }
                if (inBrace) {
                    if (i === braceStart + 1) {
                        if (c === '^' || c === '!') {
                            braceNeg = true;
                        }
                    }
                    else if (c === ']' && !(i === braceStart + 2 && braceNeg)) {
                        inBrace = false;
                    }
                    acc += c;
                    continue;
                }
                else if (c === '[') {
                    inBrace = true;
                    braceStart = i;
                    braceNeg = false;
                    acc += c;
                    continue;
                }
                if (!opt.noext && isExtglobType(c) && str.charAt(i) === '(') {
                    ast.push(acc);
                    acc = '';
                    const ext = new AST(c, ast);
                    i = AST.#parseAST(str, ext, i, opt);
                    ast.push(ext);
                    continue;
                }
                acc += c;
            }
            ast.push(acc);
            return i;
        }
        // some kind of extglob, pos is at the (
        // find the next | or )
        let i = pos + 1;
        let part = new AST(null, ast);
        const parts = [];
        let acc = '';
        while (i < str.length) {
            const c = str.charAt(i++);
            // still accumulate escapes at this point, but we do ignore
            // starts that are escaped
            if (escaping || c === '\\') {
                escaping = !escaping;
                acc += c;
                continue;
            }
            if (inBrace) {
                if (i === braceStart + 1) {
                    if (c === '^' || c === '!') {
                        braceNeg = true;
                    }
                }
                else if (c === ']' && !(i === braceStart + 2 && braceNeg)) {
                    inBrace = false;
                }
                acc += c;
                continue;
            }
            else if (c === '[') {
                inBrace = true;
                braceStart = i;
                braceNeg = false;
                acc += c;
                continue;
            }
            if (isExtglobType(c) && str.charAt(i) === '(') {
                part.push(acc);
                acc = '';
                const ext = new AST(c, part);
                part.push(ext);
                i = AST.#parseAST(str, ext, i, opt);
                continue;
            }
            if (c === '|') {
                part.push(acc);
                acc = '';
                parts.push(part);
                part = new AST(null, ast);
                continue;
            }
            if (c === ')') {
                if (acc === '' && ast.#parts.length === 0) {
                    ast.#emptyExt = true;
                }
                part.push(acc);
                acc = '';
                ast.push(...parts, part);
                return i;
            }
            acc += c;
        }
        // unfinished extglob
        // if we got here, it was a malformed extglob! not an extglob, but
        // maybe something else in there.
        ast.type = null;
        ast.#hasMagic = undefined;
        ast.#parts = [str.substring(pos - 1)];
        return i;
    }
    static fromGlob(pattern, options = {}) {
        const ast = new AST(null, undefined, options);
        AST.#parseAST(pattern, ast, 0, options);
        return ast;
    }
    // returns the regular expression if there's magic, or the unescaped
    // string if not.
    toMMPattern() {
        // should only be called on root
        /* c8 ignore start */
        if (this !== this.#root)
            return this.#root.toMMPattern();
        /* c8 ignore stop */
        const glob = this.toString();
        const [re, body, hasMagic, uflag] = this.toRegExpSource();
        // if we're in nocase mode, and not nocaseMagicOnly, then we do
        // still need a regular expression if we have to case-insensitively
        // match capital/lowercase characters.
        const anyMagic = hasMagic ||
            this.#hasMagic ||
            (this.#options.nocase &&
                !this.#options.nocaseMagicOnly &&
                glob.toUpperCase() !== glob.toLowerCase());
        if (!anyMagic) {
            return body;
        }
        const flags = (this.#options.nocase ? 'i' : '') + (uflag ? 'u' : '');
        return Object.assign(new RegExp(`^${re}$`, flags), {
            _src: re,
            _glob: glob,
        });
    }
    get options() {
        return this.#options;
    }
    // returns the string match, the regexp source, whether there's magic
    // in the regexp (so a regular expression is required) and whether or
    // not the uflag is needed for the regular expression (for posix classes)
    // TODO: instead of injecting the start/end at this point, just return
    // the BODY of the regexp, along with the start/end portions suitable
    // for binding the start/end in either a joined full-path makeRe context
    // (where we bind to (^|/), or a standalone matchPart context (where
    // we bind to ^, and not /).  Otherwise slashes get duped!
    //
    // In part-matching mode, the start is:
    // - if not isStart: nothing
    // - if traversal possible, but not allowed: ^(?!\.\.?$)
    // - if dots allowed or not possible: ^
    // - if dots possible and not allowed: ^(?!\.)
    // end is:
    // - if not isEnd(): nothing
    // - else: $
    //
    // In full-path matching mode, we put the slash at the START of the
    // pattern, so start is:
    // - if first pattern: same as part-matching mode
    // - if not isStart(): nothing
    // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
    // - if dots allowed or not possible: /
    // - if dots possible and not allowed: /(?!\.)
    // end is:
    // - if last pattern, same as part-matching mode
    // - else nothing
    //
    // Always put the (?:$|/) on negated tails, though, because that has to be
    // there to bind the end of the negated pattern portion, and it's easier to
    // just stick it in now rather than try to inject it later in the middle of
    // the pattern.
    //
    // We can just always return the same end, and leave it up to the caller
    // to know whether it's going to be used joined or in parts.
    // And, if the start is adjusted slightly, can do the same there:
    // - if not isStart: nothing
    // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
    // - if dots allowed or not possible: (?:/|^)
    // - if dots possible and not allowed: (?:/|^)(?!\.)
    //
    // But it's better to have a simpler binding without a conditional, for
    // performance, so probably better to return both start options.
    //
    // Then the caller just ignores the end if it's not the first pattern,
    // and the start always gets applied.
    //
    // But that's always going to be $ if it's the ending pattern, or nothing,
    // so the caller can just attach $ at the end of the pattern when building.
    //
    // So the todo is:
    // - better detect what kind of start is needed
    // - return both flavors of starting pattern
    // - attach $ at the end of the pattern when creating the actual RegExp
    //
    // Ah, but wait, no, that all only applies to the root when the first pattern
    // is not an extglob. If the first pattern IS an extglob, then we need all
    // that dot prevention biz to live in the extglob portions, because eg
    // +(*|.x*) can match .xy but not .yx.
    //
    // So, return the two flavors if it's #root and the first child is not an
    // AST, otherwise leave it to the child AST to handle it, and there,
    // use the (?:^|/) style of start binding.
    //
    // Even simplified further:
    // - Since the start for a join is eg /(?!\.) and the start for a part
    // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
    // or start or whatever) and prepend ^ or / at the Regexp construction.
    toRegExpSource(allowDot) {
        const dot = allowDot ?? !!this.#options.dot;
        if (this.#root === this)
            this.#fillNegs();
        if (!this.type) {
            const noEmpty = this.isStart() && this.isEnd();
            const src = this.#parts
                .map(p => {
                const [re, _, hasMagic, uflag] = typeof p === 'string'
                    ? AST.#parseGlob(p, this.#hasMagic, noEmpty)
                    : p.toRegExpSource(allowDot);
                this.#hasMagic = this.#hasMagic || hasMagic;
                this.#uflag = this.#uflag || uflag;
                return re;
            })
                .join('');
            let start = '';
            if (this.isStart()) {
                if (typeof this.#parts[0] === 'string') {
                    // this is the string that will match the start of the pattern,
                    // so we need to protect against dots and such.
                    // '.' and '..' cannot match unless the pattern is that exactly,
                    // even if it starts with . or dot:true is set.
                    const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
                    if (!dotTravAllowed) {
                        const aps = addPatternStart;
                        // check if we have a possibility of matching . or ..,
                        // and prevent that.
                        const needNoTrav = 
                        // dots are allowed, and the pattern starts with [ or .
                        (dot && aps.has(src.charAt(0))) ||
                            // the pattern starts with \., and then [ or .
                            (src.startsWith('\\.') && aps.has(src.charAt(2))) ||
                            // the pattern starts with \.\., and then [ or .
                            (src.startsWith('\\.\\.') && aps.has(src.charAt(4)));
                        // no need to prevent dots if it can't match a dot, or if a
                        // sub-pattern will be preventing it anyway.
                        const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
                        start = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : '';
                    }
                }
            }
            // append the "end of path portion" pattern to negation tails
            let end = '';
            if (this.isEnd() &&
                this.#root.#filledNegs &&
                this.#parent?.type === '!') {
                end = '(?:$|\\/)';
            }
            const final = start + src + end;
            return [
                final,
                unescape(src),
                (this.#hasMagic = !!this.#hasMagic),
                this.#uflag,
            ];
        }
        // We need to calculate the body *twice* if it's a repeat pattern
        // at the start, once in nodot mode, then again in dot mode, so a
        // pattern like *(?) can match 'x.y'
        const repeated = this.type === '*' || this.type === '+';
        // some kind of extglob
        const start = this.type === '!' ? '(?:(?!(?:' : '(?:';
        let body = this.#partsToRegExp(dot);
        if (this.isStart() && this.isEnd() && !body && this.type !== '!') {
            // invalid extglob, has to at least be *something* present, if it's
            // the entire path portion.
            const s = this.toString();
            this.#parts = [s];
            this.type = null;
            this.#hasMagic = undefined;
            return [s, unescape(this.toString()), false, false];
        }
        // XXX abstract out this map method
        let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot
            ? ''
            : this.#partsToRegExp(true);
        if (bodyDotAllowed === body) {
            bodyDotAllowed = '';
        }
        if (bodyDotAllowed) {
            body = `(?:${body})(?:${bodyDotAllowed})*?`;
        }
        // an empty !() is exactly equivalent to a starNoEmpty
        let final = '';
        if (this.type === '!' && this.#emptyExt) {
            final = (this.isStart() && !dot ? startNoDot : '') + starNoEmpty;
        }
        else {
            const close = this.type === '!'
                ? // !() must match something,but !(x) can match ''
                    '))' +
                        (this.isStart() && !dot && !allowDot ? startNoDot : '') +
                        star$1 +
                        ')'
                : this.type === '@'
                    ? ')'
                    : this.type === '?'
                        ? ')?'
                        : this.type === '+' && bodyDotAllowed
                            ? ')'
                            : this.type === '*' && bodyDotAllowed
                                ? `)?`
                                : `)${this.type}`;
            final = start + body + close;
        }
        return [
            final,
            unescape(body),
            (this.#hasMagic = !!this.#hasMagic),
            this.#uflag,
        ];
    }
    #partsToRegExp(dot) {
        return this.#parts
            .map(p => {
            // extglob ASTs should only contain parent ASTs
            /* c8 ignore start */
            if (typeof p === 'string') {
                throw new Error('string type in extglob ast??');
            }
            /* c8 ignore stop */
            // can ignore hasMagic, because extglobs are already always magic
            const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
            this.#uflag = this.#uflag || uflag;
            return re;
        })
            .filter(p => !(this.isStart() && this.isEnd()) || !!p)
            .join('|');
    }
    static #parseGlob(glob, hasMagic, noEmpty = false) {
        let escaping = false;
        let re = '';
        let uflag = false;
        for (let i = 0; i < glob.length; i++) {
            const c = glob.charAt(i);
            if (escaping) {
                escaping = false;
                re += (reSpecials.has(c) ? '\\' : '') + c;
                continue;
            }
            if (c === '\\') {
                if (i === glob.length - 1) {
                    re += '\\\\';
                }
                else {
                    escaping = true;
                }
                continue;
            }
            if (c === '[') {
                const [src, needUflag, consumed, magic] = parseClass(glob, i);
                if (consumed) {
                    re += src;
                    uflag = uflag || needUflag;
                    i += consumed - 1;
                    hasMagic = hasMagic || magic;
                    continue;
                }
            }
            if (c === '*') {
                if (noEmpty && glob === '*')
                    re += starNoEmpty;
                else
                    re += star$1;
                hasMagic = true;
                continue;
            }
            if (c === '?') {
                re += qmark$1;
                hasMagic = true;
                continue;
            }
            re += regExpEscape$1(c);
        }
        return [re, unescape(glob), !!hasMagic, uflag];
    }
}

/**
 * Escape all magic characters in a glob pattern.
 *
 * If the {@link windowsPathsNoEscape | GlobOptions.windowsPathsNoEscape}
 * option is used, then characters are escaped by wrapping in `[]`, because
 * a magic character wrapped in a character class can only be satisfied by
 * that exact character.  In this mode, `\` is _not_ escaped, because it is
 * not interpreted as a magic character, but instead as a path separator.
 */
const escape = (s, { windowsPathsNoEscape = false, } = {}) => {
    // don't need to escape +@! because we escape the parens
    // that make those magic, and escaping ! as [!] isn't valid,
    // because [!]] is a valid glob class meaning not ']'.
    return windowsPathsNoEscape
        ? s.replace(/[?*()[\]]/g, '[$&]')
        : s.replace(/[?*()[\]\\]/g, '\\$&');
};

const minimatch = (p, pattern, options = {}) => {
    assertValidPattern(pattern);
    // shortcut: comments match nothing.
    if (!options.nocomment && pattern.charAt(0) === '#') {
        return false;
    }
    return new Minimatch(pattern, options).match(p);
};
// Optimized checking for the most common glob patterns.
const starDotExtRE = /^\*+([^+@!?\*\[\(]*)$/;
const starDotExtTest = (ext) => (f) => !f.startsWith('.') && f.endsWith(ext);
const starDotExtTestDot = (ext) => (f) => f.endsWith(ext);
const starDotExtTestNocase = (ext) => {
    ext = ext.toLowerCase();
    return (f) => !f.startsWith('.') && f.toLowerCase().endsWith(ext);
};
const starDotExtTestNocaseDot = (ext) => {
    ext = ext.toLowerCase();
    return (f) => f.toLowerCase().endsWith(ext);
};
const starDotStarRE = /^\*+\.\*+$/;
const starDotStarTest = (f) => !f.startsWith('.') && f.includes('.');
const starDotStarTestDot = (f) => f !== '.' && f !== '..' && f.includes('.');
const dotStarRE = /^\.\*+$/;
const dotStarTest = (f) => f !== '.' && f !== '..' && f.startsWith('.');
const starRE = /^\*+$/;
const starTest = (f) => f.length !== 0 && !f.startsWith('.');
const starTestDot = (f) => f.length !== 0 && f !== '.' && f !== '..';
const qmarksRE = /^\?+([^+@!?\*\[\(]*)?$/;
const qmarksTestNocase = ([$0, ext = '']) => {
    const noext = qmarksTestNoExt([$0]);
    if (!ext)
        return noext;
    ext = ext.toLowerCase();
    return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestNocaseDot = ([$0, ext = '']) => {
    const noext = qmarksTestNoExtDot([$0]);
    if (!ext)
        return noext;
    ext = ext.toLowerCase();
    return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestDot = ([$0, ext = '']) => {
    const noext = qmarksTestNoExtDot([$0]);
    return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTest = ([$0, ext = '']) => {
    const noext = qmarksTestNoExt([$0]);
    return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTestNoExt = ([$0]) => {
    const len = $0.length;
    return (f) => f.length === len && !f.startsWith('.');
};
const qmarksTestNoExtDot = ([$0]) => {
    const len = $0.length;
    return (f) => f.length === len && f !== '.' && f !== '..';
};
/* c8 ignore start */
const defaultPlatform$2 = (typeof process === 'object' && process
    ? (typeof process.env === 'object' &&
        process.env &&
        process.env.__MINIMATCH_TESTING_PLATFORM__) ||
        process.platform
    : 'posix');
const path = {
    win32: { sep: '\\' },
    posix: { sep: '/' },
};
/* c8 ignore stop */
const sep = defaultPlatform$2 === 'win32' ? path.win32.sep : path.posix.sep;
minimatch.sep = sep;
const GLOBSTAR = Symbol('globstar **');
minimatch.GLOBSTAR = GLOBSTAR;
// any single thing other than /
// don't need to escape / when using new RegExp()
const qmark = '[^/]';
// * => any number of characters
const star = qmark + '*?';
// ** when dots are allowed.  Anything goes, except .. and .
// not (^ or / followed by one or two dots followed by $ or /),
// followed by anything, any number of times.
const twoStarDot = '(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?';
// not a ^ or / followed by a dot,
// followed by anything, any number of times.
const twoStarNoDot = '(?:(?!(?:\\/|^)\\.).)*?';
const filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
const ext = (a, b = {}) => Object.assign({}, a, b);
const defaults = (def) => {
    if (!def || typeof def !== 'object' || !Object.keys(def).length) {
        return minimatch;
    }
    const orig = minimatch;
    const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
    return Object.assign(m, {
        Minimatch: class Minimatch extends orig.Minimatch {
            constructor(pattern, options = {}) {
                super(pattern, ext(def, options));
            }
            static defaults(options) {
                return orig.defaults(ext(def, options)).Minimatch;
            }
        },
        AST: class AST extends orig.AST {
            /* c8 ignore start */
            constructor(type, parent, options = {}) {
                super(type, parent, ext(def, options));
            }
            /* c8 ignore stop */
            static fromGlob(pattern, options = {}) {
                return orig.AST.fromGlob(pattern, ext(def, options));
            }
        },
        unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
        escape: (s, options = {}) => orig.escape(s, ext(def, options)),
        filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
        defaults: (options) => orig.defaults(ext(def, options)),
        makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
        braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
        match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
        sep: orig.sep,
        GLOBSTAR: GLOBSTAR,
    });
};
minimatch.defaults = defaults;
// Brace expansion:
// a{b,c}d -> abd acd
// a{b,}c -> abc ac
// a{0..3}d -> a0d a1d a2d a3d
// a{b,c{d,e}f}g -> abg acdfg acefg
// a{b,c}d{e,f}g -> abdeg acdeg abdeg abdfg
//
// Invalid sets are not expanded.
// a{2..}b -> a{2..}b
// a{b}c -> a{b}c
const braceExpand = (pattern, options = {}) => {
    assertValidPattern(pattern);
    // Thanks to Yeting Li <https://github.com/yetingli> for
    // improving this regexp to avoid a ReDOS vulnerability.
    if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
        // shortcut. no need to expand.
        return [pattern];
    }
    return expand$1(pattern);
};
minimatch.braceExpand = braceExpand;
// parse a component of the expanded set.
// At this point, no pattern may contain "/" in it
// so we're going to return a 2d array, where each entry is the full
// pattern, split on '/', and then turned into a regular expression.
// A regexp is made at the end which joins each array with an
// escaped /, and another full one which joins each regexp with |.
//
// Following the lead of Bash 4.1, note that "**" only has special meaning
// when it is the *only* thing in a path portion.  Otherwise, any series
// of * is equivalent to a single *.  Globstar behavior is enabled by
// default, and can be disabled by setting options.noglobstar.
const makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
const match = (list, pattern, options = {}) => {
    const mm = new Minimatch(pattern, options);
    list = list.filter(f => mm.match(f));
    if (mm.options.nonull && !list.length) {
        list.push(pattern);
    }
    return list;
};
minimatch.match = match;
// replace stuff like \* with *
const globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
const regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
class Minimatch {
    options;
    set;
    pattern;
    windowsPathsNoEscape;
    nonegate;
    negate;
    comment;
    empty;
    preserveMultipleSlashes;
    partial;
    globSet;
    globParts;
    nocase;
    isWindows;
    platform;
    windowsNoMagicRoot;
    regexp;
    constructor(pattern, options = {}) {
        assertValidPattern(pattern);
        options = options || {};
        this.options = options;
        this.pattern = pattern;
        this.platform = options.platform || defaultPlatform$2;
        this.isWindows = this.platform === 'win32';
        this.windowsPathsNoEscape =
            !!options.windowsPathsNoEscape || options.allowWindowsEscape === false;
        if (this.windowsPathsNoEscape) {
            this.pattern = this.pattern.replace(/\\/g, '/');
        }
        this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
        this.regexp = null;
        this.negate = false;
        this.nonegate = !!options.nonegate;
        this.comment = false;
        this.empty = false;
        this.partial = !!options.partial;
        this.nocase = !!this.options.nocase;
        this.windowsNoMagicRoot =
            options.windowsNoMagicRoot !== undefined
                ? options.windowsNoMagicRoot
                : !!(this.isWindows && this.nocase);
        this.globSet = [];
        this.globParts = [];
        this.set = [];
        // make the set of regexps etc.
        this.make();
    }
    hasMagic() {
        if (this.options.magicalBraces && this.set.length > 1) {
            return true;
        }
        for (const pattern of this.set) {
            for (const part of pattern) {
                if (typeof part !== 'string')
                    return true;
            }
        }
        return false;
    }
    debug(..._) { }
    make() {
        const pattern = this.pattern;
        const options = this.options;
        // empty patterns and comments match nothing.
        if (!options.nocomment && pattern.charAt(0) === '#') {
            this.comment = true;
            return;
        }
        if (!pattern) {
            this.empty = true;
            return;
        }
        // step 1: figure out negation, etc.
        this.parseNegate();
        // step 2: expand braces
        this.globSet = [...new Set(this.braceExpand())];
        if (options.debug) {
            this.debug = (...args) => console.error(...args);
        }
        this.debug(this.pattern, this.globSet);
        // step 3: now we have a set, so turn each one into a series of
        // path-portion matching patterns.
        // These will be regexps, except in the case of "**", which is
        // set to the GLOBSTAR object for globstar behavior,
        // and will not contain any / characters
        //
        // First, we preprocess to make the glob pattern sets a bit simpler
        // and deduped.  There are some perf-killing patterns that can cause
        // problems with a glob walk, but we can simplify them down a bit.
        const rawGlobParts = this.globSet.map(s => this.slashSplit(s));
        this.globParts = this.preprocess(rawGlobParts);
        this.debug(this.pattern, this.globParts);
        // glob --> regexps
        let set = this.globParts.map((s, _, __) => {
            if (this.isWindows && this.windowsNoMagicRoot) {
                // check if it's a drive or unc path.
                const isUNC = s[0] === '' &&
                    s[1] === '' &&
                    (s[2] === '?' || !globMagic.test(s[2])) &&
                    !globMagic.test(s[3]);
                const isDrive = /^[a-z]:/i.test(s[0]);
                if (isUNC) {
                    return [...s.slice(0, 4), ...s.slice(4).map(ss => this.parse(ss))];
                }
                else if (isDrive) {
                    return [s[0], ...s.slice(1).map(ss => this.parse(ss))];
                }
            }
            return s.map(ss => this.parse(ss));
        });
        this.debug(this.pattern, set);
        // filter out everything that didn't compile properly.
        this.set = set.filter(s => s.indexOf(false) === -1);
        // do not treat the ? in UNC paths as magic
        if (this.isWindows) {
            for (let i = 0; i < this.set.length; i++) {
                const p = this.set[i];
                if (p[0] === '' &&
                    p[1] === '' &&
                    this.globParts[i][2] === '?' &&
                    typeof p[3] === 'string' &&
                    /^[a-z]:$/i.test(p[3])) {
                    p[2] = '?';
                }
            }
        }
        this.debug(this.pattern, this.set);
    }
    // various transforms to equivalent pattern sets that are
    // faster to process in a filesystem walk.  The goal is to
    // eliminate what we can, and push all ** patterns as far
    // to the right as possible, even if it increases the number
    // of patterns that we have to process.
    preprocess(globParts) {
        // if we're not in globstar mode, then turn all ** into *
        if (this.options.noglobstar) {
            for (let i = 0; i < globParts.length; i++) {
                for (let j = 0; j < globParts[i].length; j++) {
                    if (globParts[i][j] === '**') {
                        globParts[i][j] = '*';
                    }
                }
            }
        }
        const { optimizationLevel = 1 } = this.options;
        if (optimizationLevel >= 2) {
            // aggressive optimization for the purpose of fs walking
            globParts = this.firstPhasePreProcess(globParts);
            globParts = this.secondPhasePreProcess(globParts);
        }
        else if (optimizationLevel >= 1) {
            // just basic optimizations to remove some .. parts
            globParts = this.levelOneOptimize(globParts);
        }
        else {
            // just collapse multiple ** portions into one
            globParts = this.adjascentGlobstarOptimize(globParts);
        }
        return globParts;
    }
    // just get rid of adjascent ** portions
    adjascentGlobstarOptimize(globParts) {
        return globParts.map(parts => {
            let gs = -1;
            while (-1 !== (gs = parts.indexOf('**', gs + 1))) {
                let i = gs;
                while (parts[i + 1] === '**') {
                    i++;
                }
                if (i !== gs) {
                    parts.splice(gs, i - gs);
                }
            }
            return parts;
        });
    }
    // get rid of adjascent ** and resolve .. portions
    levelOneOptimize(globParts) {
        return globParts.map(parts => {
            parts = parts.reduce((set, part) => {
                const prev = set[set.length - 1];
                if (part === '**' && prev === '**') {
                    return set;
                }
                if (part === '..') {
                    if (prev && prev !== '..' && prev !== '.' && prev !== '**') {
                        set.pop();
                        return set;
                    }
                }
                set.push(part);
                return set;
            }, []);
            return parts.length === 0 ? [''] : parts;
        });
    }
    levelTwoFileOptimize(parts) {
        if (!Array.isArray(parts)) {
            parts = this.slashSplit(parts);
        }
        let didSomething = false;
        do {
            didSomething = false;
            // <pre>/<e>/<rest> -> <pre>/<rest>
            if (!this.preserveMultipleSlashes) {
                for (let i = 1; i < parts.length - 1; i++) {
                    const p = parts[i];
                    // don't squeeze out UNC patterns
                    if (i === 1 && p === '' && parts[0] === '')
                        continue;
                    if (p === '.' || p === '') {
                        didSomething = true;
                        parts.splice(i, 1);
                        i--;
                    }
                }
                if (parts[0] === '.' &&
                    parts.length === 2 &&
                    (parts[1] === '.' || parts[1] === '')) {
                    didSomething = true;
                    parts.pop();
                }
            }
            // <pre>/<p>/../<rest> -> <pre>/<rest>
            let dd = 0;
            while (-1 !== (dd = parts.indexOf('..', dd + 1))) {
                const p = parts[dd - 1];
                if (p && p !== '.' && p !== '..' && p !== '**') {
                    didSomething = true;
                    parts.splice(dd - 1, 2);
                    dd -= 2;
                }
            }
        } while (didSomething);
        return parts.length === 0 ? [''] : parts;
    }
    // First phase: single-pattern processing
    // <pre> is 1 or more portions
    // <rest> is 1 or more portions
    // <p> is any portion other than ., .., '', or **
    // <e> is . or ''
    //
    // **/.. is *brutal* for filesystem walking performance, because
    // it effectively resets the recursive walk each time it occurs,
    // and ** cannot be reduced out by a .. pattern part like a regexp
    // or most strings (other than .., ., and '') can be.
    //
    // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
    // <pre>/<e>/<rest> -> <pre>/<rest>
    // <pre>/<p>/../<rest> -> <pre>/<rest>
    // **/**/<rest> -> **/<rest>
    //
    // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
    // this WOULD be allowed if ** did follow symlinks, or * didn't
    firstPhasePreProcess(globParts) {
        let didSomething = false;
        do {
            didSomething = false;
            // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
            for (let parts of globParts) {
                let gs = -1;
                while (-1 !== (gs = parts.indexOf('**', gs + 1))) {
                    let gss = gs;
                    while (parts[gss + 1] === '**') {
                        // <pre>/**/**/<rest> -> <pre>/**/<rest>
                        gss++;
                    }
                    // eg, if gs is 2 and gss is 4, that means we have 3 **
                    // parts, and can remove 2 of them.
                    if (gss > gs) {
                        parts.splice(gs + 1, gss - gs);
                    }
                    let next = parts[gs + 1];
                    const p = parts[gs + 2];
                    const p2 = parts[gs + 3];
                    if (next !== '..')
                        continue;
                    if (!p ||
                        p === '.' ||
                        p === '..' ||
                        !p2 ||
                        p2 === '.' ||
                        p2 === '..') {
                        continue;
                    }
                    didSomething = true;
                    // edit parts in place, and push the new one
                    parts.splice(gs, 1);
                    const other = parts.slice(0);
                    other[gs] = '**';
                    globParts.push(other);
                    gs--;
                }
                // <pre>/<e>/<rest> -> <pre>/<rest>
                if (!this.preserveMultipleSlashes) {
                    for (let i = 1; i < parts.length - 1; i++) {
                        const p = parts[i];
                        // don't squeeze out UNC patterns
                        if (i === 1 && p === '' && parts[0] === '')
                            continue;
                        if (p === '.' || p === '') {
                            didSomething = true;
                            parts.splice(i, 1);
                            i--;
                        }
                    }
                    if (parts[0] === '.' &&
                        parts.length === 2 &&
                        (parts[1] === '.' || parts[1] === '')) {
                        didSomething = true;
                        parts.pop();
                    }
                }
                // <pre>/<p>/../<rest> -> <pre>/<rest>
                let dd = 0;
                while (-1 !== (dd = parts.indexOf('..', dd + 1))) {
                    const p = parts[dd - 1];
                    if (p && p !== '.' && p !== '..' && p !== '**') {
                        didSomething = true;
                        const needDot = dd === 1 && parts[dd + 1] === '**';
                        const splin = needDot ? ['.'] : [];
                        parts.splice(dd - 1, 2, ...splin);
                        if (parts.length === 0)
                            parts.push('');
                        dd -= 2;
                    }
                }
            }
        } while (didSomething);
        return globParts;
    }
    // second phase: multi-pattern dedupes
    // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
    // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
    // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
    //
    // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
    // ^-- not valid because ** doens't follow symlinks
    secondPhasePreProcess(globParts) {
        for (let i = 0; i < globParts.length - 1; i++) {
            for (let j = i + 1; j < globParts.length; j++) {
                const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
                if (matched) {
                    globParts[i] = [];
                    globParts[j] = matched;
                    break;
                }
            }
        }
        return globParts.filter(gs => gs.length);
    }
    partsMatch(a, b, emptyGSMatch = false) {
        let ai = 0;
        let bi = 0;
        let result = [];
        let which = '';
        while (ai < a.length && bi < b.length) {
            if (a[ai] === b[bi]) {
                result.push(which === 'b' ? b[bi] : a[ai]);
                ai++;
                bi++;
            }
            else if (emptyGSMatch && a[ai] === '**' && b[bi] === a[ai + 1]) {
                result.push(a[ai]);
                ai++;
            }
            else if (emptyGSMatch && b[bi] === '**' && a[ai] === b[bi + 1]) {
                result.push(b[bi]);
                bi++;
            }
            else if (a[ai] === '*' &&
                b[bi] &&
                (this.options.dot || !b[bi].startsWith('.')) &&
                b[bi] !== '**') {
                if (which === 'b')
                    return false;
                which = 'a';
                result.push(a[ai]);
                ai++;
                bi++;
            }
            else if (b[bi] === '*' &&
                a[ai] &&
                (this.options.dot || !a[ai].startsWith('.')) &&
                a[ai] !== '**') {
                if (which === 'a')
                    return false;
                which = 'b';
                result.push(b[bi]);
                ai++;
                bi++;
            }
            else {
                return false;
            }
        }
        // if we fall out of the loop, it means they two are identical
        // as long as their lengths match
        return a.length === b.length && result;
    }
    parseNegate() {
        if (this.nonegate)
            return;
        const pattern = this.pattern;
        let negate = false;
        let negateOffset = 0;
        for (let i = 0; i < pattern.length && pattern.charAt(i) === '!'; i++) {
            negate = !negate;
            negateOffset++;
        }
        if (negateOffset)
            this.pattern = pattern.slice(negateOffset);
        this.negate = negate;
    }
    // set partial to true to test if, for example,
    // "/a/b" matches the start of "/*/b/*/d"
    // Partial means, if you run out of file before you run
    // out of pattern, then that's fine, as long as all
    // the parts match.
    matchOne(file, pattern, partial = false) {
        const options = this.options;
        // UNC paths like //?/X:/... can match X:/... and vice versa
        // Drive letters in absolute drive or unc paths are always compared
        // case-insensitively.
        if (this.isWindows) {
            const fileDrive = typeof file[0] === 'string' && /^[a-z]:$/i.test(file[0]);
            const fileUNC = !fileDrive &&
                file[0] === '' &&
                file[1] === '' &&
                file[2] === '?' &&
                /^[a-z]:$/i.test(file[3]);
            const patternDrive = typeof pattern[0] === 'string' && /^[a-z]:$/i.test(pattern[0]);
            const patternUNC = !patternDrive &&
                pattern[0] === '' &&
                pattern[1] === '' &&
                pattern[2] === '?' &&
                typeof pattern[3] === 'string' &&
                /^[a-z]:$/i.test(pattern[3]);
            const fdi = fileUNC ? 3 : fileDrive ? 0 : undefined;
            const pdi = patternUNC ? 3 : patternDrive ? 0 : undefined;
            if (typeof fdi === 'number' && typeof pdi === 'number') {
                const [fd, pd] = [file[fdi], pattern[pdi]];
                if (fd.toLowerCase() === pd.toLowerCase()) {
                    pattern[pdi] = fd;
                    if (pdi > fdi) {
                        pattern = pattern.slice(pdi);
                    }
                    else if (fdi > pdi) {
                        file = file.slice(fdi);
                    }
                }
            }
        }
        // resolve and reduce . and .. portions in the file as well.
        // dont' need to do the second phase, because it's only one string[]
        const { optimizationLevel = 1 } = this.options;
        if (optimizationLevel >= 2) {
            file = this.levelTwoFileOptimize(file);
        }
        this.debug('matchOne', this, { file, pattern });
        this.debug('matchOne', file.length, pattern.length);
        for (var fi = 0, pi = 0, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
            this.debug('matchOne loop');
            var p = pattern[pi];
            var f = file[fi];
            this.debug(pattern, p, f);
            // should be impossible.
            // some invalid regexp stuff in the set.
            /* c8 ignore start */
            if (p === false) {
                return false;
            }
            /* c8 ignore stop */
            if (p === GLOBSTAR) {
                this.debug('GLOBSTAR', [pattern, p, f]);
                // "**"
                // a/**/b/**/c would match the following:
                // a/b/x/y/z/c
                // a/x/y/z/b/c
                // a/b/x/b/x/c
                // a/b/c
                // To do this, take the rest of the pattern after
                // the **, and see if it would match the file remainder.
                // If so, return success.
                // If not, the ** "swallows" a segment, and try again.
                // This is recursively awful.
                //
                // a/**/b/**/c matching a/b/x/y/z/c
                // - a matches a
                // - doublestar
                //   - matchOne(b/x/y/z/c, b/**/c)
                //     - b matches b
                //     - doublestar
                //       - matchOne(x/y/z/c, c) -> no
                //       - matchOne(y/z/c, c) -> no
                //       - matchOne(z/c, c) -> no
                //       - matchOne(c, c) yes, hit
                var fr = fi;
                var pr = pi + 1;
                if (pr === pl) {
                    this.debug('** at the end');
                    // a ** at the end will just swallow the rest.
                    // We have found a match.
                    // however, it will not swallow /.x, unless
                    // options.dot is set.
                    // . and .. are *never* matched by **, for explosively
                    // exponential reasons.
                    for (; fi < fl; fi++) {
                        if (file[fi] === '.' ||
                            file[fi] === '..' ||
                            (!options.dot && file[fi].charAt(0) === '.'))
                            return false;
                    }
                    return true;
                }
                // ok, let's see if we can swallow whatever we can.
                while (fr < fl) {
                    var swallowee = file[fr];
                    this.debug('\nglobstar while', file, fr, pattern, pr, swallowee);
                    // XXX remove this slice.  Just pass the start index.
                    if (this.matchOne(file.slice(fr), pattern.slice(pr), partial)) {
                        this.debug('globstar found match!', fr, fl, swallowee);
                        // found a match.
                        return true;
                    }
                    else {
                        // can't swallow "." or ".." ever.
                        // can only swallow ".foo" when explicitly asked.
                        if (swallowee === '.' ||
                            swallowee === '..' ||
                            (!options.dot && swallowee.charAt(0) === '.')) {
                            this.debug('dot detected!', file, fr, pattern, pr);
                            break;
                        }
                        // ** swallows a segment, and continue.
                        this.debug('globstar swallow a segment, and continue');
                        fr++;
                    }
                }
                // no match was found.
                // However, in partial mode, we can't say this is necessarily over.
                /* c8 ignore start */
                if (partial) {
                    // ran out of file
                    this.debug('\n>>> no match, partial?', file, fr, pattern, pr);
                    if (fr === fl) {
                        return true;
                    }
                }
                /* c8 ignore stop */
                return false;
            }
            // something other than **
            // non-magic patterns just have to match exactly
            // patterns with magic have been turned into regexps.
            let hit;
            if (typeof p === 'string') {
                hit = f === p;
                this.debug('string match', p, f, hit);
            }
            else {
                hit = p.test(f);
                this.debug('pattern match', p, f, hit);
            }
            if (!hit)
                return false;
        }
        // Note: ending in / means that we'll get a final ""
        // at the end of the pattern.  This can only match a
        // corresponding "" at the end of the file.
        // If the file ends in /, then it can only match a
        // a pattern that ends in /, unless the pattern just
        // doesn't have any more for it. But, a/b/ should *not*
        // match "a/b/*", even though "" matches against the
        // [^/]*? pattern, except in partial mode, where it might
        // simply not be reached yet.
        // However, a/b/ should still satisfy a/*
        // now either we fell off the end of the pattern, or we're done.
        if (fi === fl && pi === pl) {
            // ran out of pattern and filename at the same time.
            // an exact hit!
            return true;
        }
        else if (fi === fl) {
            // ran out of file, but still had pattern left.
            // this is ok if we're doing the match as part of
            // a glob fs traversal.
            return partial;
        }
        else if (pi === pl) {
            // ran out of pattern, still have file left.
            // this is only acceptable if we're on the very last
            // empty segment of a file with a trailing slash.
            // a/* should match a/b/
            return fi === fl - 1 && file[fi] === '';
            /* c8 ignore start */
        }
        else {
            // should be unreachable.
            throw new Error('wtf?');
        }
        /* c8 ignore stop */
    }
    braceExpand() {
        return braceExpand(this.pattern, this.options);
    }
    parse(pattern) {
        assertValidPattern(pattern);
        const options = this.options;
        // shortcuts
        if (pattern === '**')
            return GLOBSTAR;
        if (pattern === '')
            return '';
        // far and away, the most common glob pattern parts are
        // *, *.*, and *.<ext>  Add a fast check method for those.
        let m;
        let fastTest = null;
        if ((m = pattern.match(starRE))) {
            fastTest = options.dot ? starTestDot : starTest;
        }
        else if ((m = pattern.match(starDotExtRE))) {
            fastTest = (options.nocase
                ? options.dot
                    ? starDotExtTestNocaseDot
                    : starDotExtTestNocase
                : options.dot
                    ? starDotExtTestDot
                    : starDotExtTest)(m[1]);
        }
        else if ((m = pattern.match(qmarksRE))) {
            fastTest = (options.nocase
                ? options.dot
                    ? qmarksTestNocaseDot
                    : qmarksTestNocase
                : options.dot
                    ? qmarksTestDot
                    : qmarksTest)(m);
        }
        else if ((m = pattern.match(starDotStarRE))) {
            fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
        }
        else if ((m = pattern.match(dotStarRE))) {
            fastTest = dotStarTest;
        }
        const re = AST.fromGlob(pattern, this.options).toMMPattern();
        if (fastTest && typeof re === 'object') {
            // Avoids overriding in frozen environments
            Reflect.defineProperty(re, 'test', { value: fastTest });
        }
        return re;
    }
    makeRe() {
        if (this.regexp || this.regexp === false)
            return this.regexp;
        // at this point, this.set is a 2d array of partial
        // pattern strings, or "**".
        //
        // It's better to use .match().  This function shouldn't
        // be used, really, but it's pretty convenient sometimes,
        // when you just want to work with a regex.
        const set = this.set;
        if (!set.length) {
            this.regexp = false;
            return this.regexp;
        }
        const options = this.options;
        const twoStar = options.noglobstar
            ? star
            : options.dot
                ? twoStarDot
                : twoStarNoDot;
        const flags = new Set(options.nocase ? ['i'] : []);
        // regexpify non-globstar patterns
        // if ** is only item, then we just do one twoStar
        // if ** is first, and there are more, prepend (\/|twoStar\/)? to next
        // if ** is last, append (\/twoStar|) to previous
        // if ** is in the middle, append (\/|\/twoStar\/) to previous
        // then filter out GLOBSTAR symbols
        let re = set
            .map(pattern => {
            const pp = pattern.map(p => {
                if (p instanceof RegExp) {
                    for (const f of p.flags.split(''))
                        flags.add(f);
                }
                return typeof p === 'string'
                    ? regExpEscape(p)
                    : p === GLOBSTAR
                        ? GLOBSTAR
                        : p._src;
            });
            pp.forEach((p, i) => {
                const next = pp[i + 1];
                const prev = pp[i - 1];
                if (p !== GLOBSTAR || prev === GLOBSTAR) {
                    return;
                }
                if (prev === undefined) {
                    if (next !== undefined && next !== GLOBSTAR) {
                        pp[i + 1] = '(?:\\/|' + twoStar + '\\/)?' + next;
                    }
                    else {
                        pp[i] = twoStar;
                    }
                }
                else if (next === undefined) {
                    pp[i - 1] = prev + '(?:\\/|' + twoStar + ')?';
                }
                else if (next !== GLOBSTAR) {
                    pp[i - 1] = prev + '(?:\\/|\\/' + twoStar + '\\/)' + next;
                    pp[i + 1] = GLOBSTAR;
                }
            });
            return pp.filter(p => p !== GLOBSTAR).join('/');
        })
            .join('|');
        // need to wrap in parens if we had more than one thing with |,
        // otherwise only the first will be anchored to ^ and the last to $
        const [open, close] = set.length > 1 ? ['(?:', ')'] : ['', ''];
        // must match entire pattern
        // ending in a * or ** will make it less strict.
        re = '^' + open + re + close + '$';
        // can match anything, as long as it's not this.
        if (this.negate)
            re = '^(?!' + re + ').+$';
        try {
            this.regexp = new RegExp(re, [...flags].join(''));
            /* c8 ignore start */
        }
        catch (ex) {
            // should be impossible
            this.regexp = false;
        }
        /* c8 ignore stop */
        return this.regexp;
    }
    slashSplit(p) {
        // if p starts with // on windows, we preserve that
        // so that UNC paths aren't broken.  Otherwise, any number of
        // / characters are coalesced into one, unless
        // preserveMultipleSlashes is set to true.
        if (this.preserveMultipleSlashes) {
            return p.split('/');
        }
        else if (this.isWindows && /^\/\/[^\/]+/.test(p)) {
            // add an extra '' for the one we lose
            return ['', ...p.split(/\/+/)];
        }
        else {
            return p.split(/\/+/);
        }
    }
    match(f, partial = this.partial) {
        this.debug('match', f, this.pattern);
        // short-circuit in the case of busted things.
        // comments, etc.
        if (this.comment) {
            return false;
        }
        if (this.empty) {
            return f === '';
        }
        if (f === '/' && partial) {
            return true;
        }
        const options = this.options;
        // windows: need to use /, not \
        if (this.isWindows) {
            f = f.split('\\').join('/');
        }
        // treat the test path as a set of pathparts.
        const ff = this.slashSplit(f);
        this.debug(this.pattern, 'split', ff);
        // just ONE of the pattern sets in this.set needs to match
        // in order for it to be valid.  If negating, then just one
        // match means that we have failed.
        // Either way, return on the first hit.
        const set = this.set;
        this.debug(this.pattern, 'set', set);
        // Find the basename of the path by looking for the last non-empty segment
        let filename = ff[ff.length - 1];
        if (!filename) {
            for (let i = ff.length - 2; !filename && i >= 0; i--) {
                filename = ff[i];
            }
        }
        for (let i = 0; i < set.length; i++) {
            const pattern = set[i];
            let file = ff;
            if (options.matchBase && pattern.length === 1) {
                file = [filename];
            }
            const hit = this.matchOne(file, pattern, partial);
            if (hit) {
                if (options.flipNegate) {
                    return true;
                }
                return !this.negate;
            }
        }
        // didn't get any hits.  this is success if it's a negative
        // pattern, failure otherwise.
        if (options.flipNegate) {
            return false;
        }
        return this.negate;
    }
    static defaults(def) {
        return minimatch.defaults(def).Minimatch;
    }
}
/* c8 ignore stop */
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;

/**
 * @module LRUCache
 */
const perf = typeof performance === 'object' &&
    performance &&
    typeof performance.now === 'function'
    ? performance
    : Date;
const warned = new Set();
/* c8 ignore start */
const PROCESS = (typeof process === 'object' && !!process ? process : {});
/* c8 ignore start */
const emitWarning = (msg, type, code, fn) => {
    typeof PROCESS.emitWarning === 'function'
        ? PROCESS.emitWarning(msg, type, code, fn)
        : console.error(`[${code}] ${type}: ${msg}`);
};
let AC = globalThis.AbortController;
let AS = globalThis.AbortSignal;
/* c8 ignore start */
if (typeof AC === 'undefined') {
    //@ts-ignore
    AS = class AbortSignal {
        onabort;
        _onabort = [];
        reason;
        aborted = false;
        addEventListener(_, fn) {
            this._onabort.push(fn);
        }
    };
    //@ts-ignore
    AC = class AbortController {
        constructor() {
            warnACPolyfill();
        }
        signal = new AS();
        abort(reason) {
            if (this.signal.aborted)
                return;
            //@ts-ignore
            this.signal.reason = reason;
            //@ts-ignore
            this.signal.aborted = true;
            //@ts-ignore
            for (const fn of this.signal._onabort) {
                fn(reason);
            }
            this.signal.onabort?.(reason);
        }
    };
    let printACPolyfillWarning = PROCESS.env?.LRU_CACHE_IGNORE_AC_WARNING !== '1';
    const warnACPolyfill = () => {
        if (!printACPolyfillWarning)
            return;
        printACPolyfillWarning = false;
        emitWarning('AbortController is not defined. If using lru-cache in ' +
            'node 14, load an AbortController polyfill from the ' +
            '`node-abort-controller` package. A minimal polyfill is ' +
            'provided for use by LRUCache.fetch(), but it should not be ' +
            'relied upon in other contexts (eg, passing it to other APIs that ' +
            'use AbortController/AbortSignal might have undesirable effects). ' +
            'You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.', 'NO_ABORT_CONTROLLER', 'ENOTSUP', warnACPolyfill);
    };
}
/* c8 ignore stop */
const shouldWarn = (code) => !warned.has(code);
const isPosInt = (n) => n && n === Math.floor(n) && n > 0 && isFinite(n);
/* c8 ignore start */
// This is a little bit ridiculous, tbh.
// The maximum array length is 2^32-1 or thereabouts on most JS impls.
// And well before that point, you're caching the entire world, I mean,
// that's ~32GB of just integers for the next/prev links, plus whatever
// else to hold that many keys and values.  Just filling the memory with
// zeroes at init time is brutal when you get that big.
// But why not be complete?
// Maybe in the future, these limits will have expanded.
const getUintArray = (max) => !isPosInt(max)
    ? null
    : max <= Math.pow(2, 8)
        ? Uint8Array
        : max <= Math.pow(2, 16)
            ? Uint16Array
            : max <= Math.pow(2, 32)
                ? Uint32Array
                : max <= Number.MAX_SAFE_INTEGER
                    ? ZeroArray
                    : null;
/* c8 ignore stop */
class ZeroArray extends Array {
    constructor(size) {
        super(size);
        this.fill(0);
    }
}
class Stack {
    heap;
    length;
    // private constructor
    static #constructing = false;
    static create(max) {
        const HeapCls = getUintArray(max);
        if (!HeapCls)
            return [];
        Stack.#constructing = true;
        const s = new Stack(max, HeapCls);
        Stack.#constructing = false;
        return s;
    }
    constructor(max, HeapCls) {
        /* c8 ignore start */
        if (!Stack.#constructing) {
            throw new TypeError('instantiate Stack using Stack.create(n)');
        }
        /* c8 ignore stop */
        this.heap = new HeapCls(max);
        this.length = 0;
    }
    push(n) {
        this.heap[this.length++] = n;
    }
    pop() {
        return this.heap[--this.length];
    }
}
/**
 * Default export, the thing you're using this module to get.
 *
 * The `K` and `V` types define the key and value types, respectively. The
 * optional `FC` type defines the type of the `context` object passed to
 * `cache.fetch()` and `cache.memo()`.
 *
 * Keys and values **must not** be `null` or `undefined`.
 *
 * All properties from the options object (with the exception of `max`,
 * `maxSize`, `fetchMethod`, `memoMethod`, `dispose` and `disposeAfter`) are
 * added as normal public members. (The listed options are read-only getters.)
 *
 * Changing any of these will alter the defaults for subsequent method calls.
 */
class LRUCache {
    // options that cannot be changed without disaster
    #max;
    #maxSize;
    #dispose;
    #disposeAfter;
    #fetchMethod;
    #memoMethod;
    /**
     * {@link LRUCache.OptionsBase.ttl}
     */
    ttl;
    /**
     * {@link LRUCache.OptionsBase.ttlResolution}
     */
    ttlResolution;
    /**
     * {@link LRUCache.OptionsBase.ttlAutopurge}
     */
    ttlAutopurge;
    /**
     * {@link LRUCache.OptionsBase.updateAgeOnGet}
     */
    updateAgeOnGet;
    /**
     * {@link LRUCache.OptionsBase.updateAgeOnHas}
     */
    updateAgeOnHas;
    /**
     * {@link LRUCache.OptionsBase.allowStale}
     */
    allowStale;
    /**
     * {@link LRUCache.OptionsBase.noDisposeOnSet}
     */
    noDisposeOnSet;
    /**
     * {@link LRUCache.OptionsBase.noUpdateTTL}
     */
    noUpdateTTL;
    /**
     * {@link LRUCache.OptionsBase.maxEntrySize}
     */
    maxEntrySize;
    /**
     * {@link LRUCache.OptionsBase.sizeCalculation}
     */
    sizeCalculation;
    /**
     * {@link LRUCache.OptionsBase.noDeleteOnFetchRejection}
     */
    noDeleteOnFetchRejection;
    /**
     * {@link LRUCache.OptionsBase.noDeleteOnStaleGet}
     */
    noDeleteOnStaleGet;
    /**
     * {@link LRUCache.OptionsBase.allowStaleOnFetchAbort}
     */
    allowStaleOnFetchAbort;
    /**
     * {@link LRUCache.OptionsBase.allowStaleOnFetchRejection}
     */
    allowStaleOnFetchRejection;
    /**
     * {@link LRUCache.OptionsBase.ignoreFetchAbort}
     */
    ignoreFetchAbort;
    // computed properties
    #size;
    #calculatedSize;
    #keyMap;
    #keyList;
    #valList;
    #next;
    #prev;
    #head;
    #tail;
    #free;
    #disposed;
    #sizes;
    #starts;
    #ttls;
    #hasDispose;
    #hasFetchMethod;
    #hasDisposeAfter;
    /**
     * Do not call this method unless you need to inspect the
     * inner workings of the cache.  If anything returned by this
     * object is modified in any way, strange breakage may occur.
     *
     * These fields are private for a reason!
     *
     * @internal
     */
    static unsafeExposeInternals(c) {
        return {
            // properties
            starts: c.#starts,
            ttls: c.#ttls,
            sizes: c.#sizes,
            keyMap: c.#keyMap,
            keyList: c.#keyList,
            valList: c.#valList,
            next: c.#next,
            prev: c.#prev,
            get head() {
                return c.#head;
            },
            get tail() {
                return c.#tail;
            },
            free: c.#free,
            // methods
            isBackgroundFetch: (p) => c.#isBackgroundFetch(p),
            backgroundFetch: (k, index, options, context) => c.#backgroundFetch(k, index, options, context),
            moveToTail: (index) => c.#moveToTail(index),
            indexes: (options) => c.#indexes(options),
            rindexes: (options) => c.#rindexes(options),
            isStale: (index) => c.#isStale(index),
        };
    }
    // Protected read-only members
    /**
     * {@link LRUCache.OptionsBase.max} (read-only)
     */
    get max() {
        return this.#max;
    }
    /**
     * {@link LRUCache.OptionsBase.maxSize} (read-only)
     */
    get maxSize() {
        return this.#maxSize;
    }
    /**
     * The total computed size of items in the cache (read-only)
     */
    get calculatedSize() {
        return this.#calculatedSize;
    }
    /**
     * The number of items stored in the cache (read-only)
     */
    get size() {
        return this.#size;
    }
    /**
     * {@link LRUCache.OptionsBase.fetchMethod} (read-only)
     */
    get fetchMethod() {
        return this.#fetchMethod;
    }
    get memoMethod() {
        return this.#memoMethod;
    }
    /**
     * {@link LRUCache.OptionsBase.dispose} (read-only)
     */
    get dispose() {
        return this.#dispose;
    }
    /**
     * {@link LRUCache.OptionsBase.disposeAfter} (read-only)
     */
    get disposeAfter() {
        return this.#disposeAfter;
    }
    constructor(options) {
        const { max = 0, ttl, ttlResolution = 1, ttlAutopurge, updateAgeOnGet, updateAgeOnHas, allowStale, dispose, disposeAfter, noDisposeOnSet, noUpdateTTL, maxSize = 0, maxEntrySize = 0, sizeCalculation, fetchMethod, memoMethod, noDeleteOnFetchRejection, noDeleteOnStaleGet, allowStaleOnFetchRejection, allowStaleOnFetchAbort, ignoreFetchAbort, } = options;
        if (max !== 0 && !isPosInt(max)) {
            throw new TypeError('max option must be a nonnegative integer');
        }
        const UintArray = max ? getUintArray(max) : Array;
        if (!UintArray) {
            throw new Error('invalid max value: ' + max);
        }
        this.#max = max;
        this.#maxSize = maxSize;
        this.maxEntrySize = maxEntrySize || this.#maxSize;
        this.sizeCalculation = sizeCalculation;
        if (this.sizeCalculation) {
            if (!this.#maxSize && !this.maxEntrySize) {
                throw new TypeError('cannot set sizeCalculation without setting maxSize or maxEntrySize');
            }
            if (typeof this.sizeCalculation !== 'function') {
                throw new TypeError('sizeCalculation set to non-function');
            }
        }
        if (memoMethod !== undefined &&
            typeof memoMethod !== 'function') {
            throw new TypeError('memoMethod must be a function if defined');
        }
        this.#memoMethod = memoMethod;
        if (fetchMethod !== undefined &&
            typeof fetchMethod !== 'function') {
            throw new TypeError('fetchMethod must be a function if specified');
        }
        this.#fetchMethod = fetchMethod;
        this.#hasFetchMethod = !!fetchMethod;
        this.#keyMap = new Map();
        this.#keyList = new Array(max).fill(undefined);
        this.#valList = new Array(max).fill(undefined);
        this.#next = new UintArray(max);
        this.#prev = new UintArray(max);
        this.#head = 0;
        this.#tail = 0;
        this.#free = Stack.create(max);
        this.#size = 0;
        this.#calculatedSize = 0;
        if (typeof dispose === 'function') {
            this.#dispose = dispose;
        }
        if (typeof disposeAfter === 'function') {
            this.#disposeAfter = disposeAfter;
            this.#disposed = [];
        }
        else {
            this.#disposeAfter = undefined;
            this.#disposed = undefined;
        }
        this.#hasDispose = !!this.#dispose;
        this.#hasDisposeAfter = !!this.#disposeAfter;
        this.noDisposeOnSet = !!noDisposeOnSet;
        this.noUpdateTTL = !!noUpdateTTL;
        this.noDeleteOnFetchRejection = !!noDeleteOnFetchRejection;
        this.allowStaleOnFetchRejection = !!allowStaleOnFetchRejection;
        this.allowStaleOnFetchAbort = !!allowStaleOnFetchAbort;
        this.ignoreFetchAbort = !!ignoreFetchAbort;
        // NB: maxEntrySize is set to maxSize if it's set
        if (this.maxEntrySize !== 0) {
            if (this.#maxSize !== 0) {
                if (!isPosInt(this.#maxSize)) {
                    throw new TypeError('maxSize must be a positive integer if specified');
                }
            }
            if (!isPosInt(this.maxEntrySize)) {
                throw new TypeError('maxEntrySize must be a positive integer if specified');
            }
            this.#initializeSizeTracking();
        }
        this.allowStale = !!allowStale;
        this.noDeleteOnStaleGet = !!noDeleteOnStaleGet;
        this.updateAgeOnGet = !!updateAgeOnGet;
        this.updateAgeOnHas = !!updateAgeOnHas;
        this.ttlResolution =
            isPosInt(ttlResolution) || ttlResolution === 0
                ? ttlResolution
                : 1;
        this.ttlAutopurge = !!ttlAutopurge;
        this.ttl = ttl || 0;
        if (this.ttl) {
            if (!isPosInt(this.ttl)) {
                throw new TypeError('ttl must be a positive integer if specified');
            }
            this.#initializeTTLTracking();
        }
        // do not allow completely unbounded caches
        if (this.#max === 0 && this.ttl === 0 && this.#maxSize === 0) {
            throw new TypeError('At least one of max, maxSize, or ttl is required');
        }
        if (!this.ttlAutopurge && !this.#max && !this.#maxSize) {
            const code = 'LRU_CACHE_UNBOUNDED';
            if (shouldWarn(code)) {
                warned.add(code);
                const msg = 'TTL caching without ttlAutopurge, max, or maxSize can ' +
                    'result in unbounded memory consumption.';
                emitWarning(msg, 'UnboundedCacheWarning', code, LRUCache);
            }
        }
    }
    /**
     * Return the number of ms left in the item's TTL. If item is not in cache,
     * returns `0`. Returns `Infinity` if item is in cache without a defined TTL.
     */
    getRemainingTTL(key) {
        return this.#keyMap.has(key) ? Infinity : 0;
    }
    #initializeTTLTracking() {
        const ttls = new ZeroArray(this.#max);
        const starts = new ZeroArray(this.#max);
        this.#ttls = ttls;
        this.#starts = starts;
        this.#setItemTTL = (index, ttl, start = perf.now()) => {
            starts[index] = ttl !== 0 ? start : 0;
            ttls[index] = ttl;
            if (ttl !== 0 && this.ttlAutopurge) {
                const t = setTimeout(() => {
                    if (this.#isStale(index)) {
                        this.#delete(this.#keyList[index], 'expire');
                    }
                }, ttl + 1);
                // unref() not supported on all platforms
                /* c8 ignore start */
                if (t.unref) {
                    t.unref();
                }
                /* c8 ignore stop */
            }
        };
        this.#updateItemAge = index => {
            starts[index] = ttls[index] !== 0 ? perf.now() : 0;
        };
        this.#statusTTL = (status, index) => {
            if (ttls[index]) {
                const ttl = ttls[index];
                const start = starts[index];
                /* c8 ignore next */
                if (!ttl || !start)
                    return;
                status.ttl = ttl;
                status.start = start;
                status.now = cachedNow || getNow();
                const age = status.now - start;
                status.remainingTTL = ttl - age;
            }
        };
        // debounce calls to perf.now() to 1s so we're not hitting
        // that costly call repeatedly.
        let cachedNow = 0;
        const getNow = () => {
            const n = perf.now();
            if (this.ttlResolution > 0) {
                cachedNow = n;
                const t = setTimeout(() => (cachedNow = 0), this.ttlResolution);
                // not available on all platforms
                /* c8 ignore start */
                if (t.unref) {
                    t.unref();
                }
                /* c8 ignore stop */
            }
            return n;
        };
        this.getRemainingTTL = key => {
            const index = this.#keyMap.get(key);
            if (index === undefined) {
                return 0;
            }
            const ttl = ttls[index];
            const start = starts[index];
            if (!ttl || !start) {
                return Infinity;
            }
            const age = (cachedNow || getNow()) - start;
            return ttl - age;
        };
        this.#isStale = index => {
            const s = starts[index];
            const t = ttls[index];
            return !!t && !!s && (cachedNow || getNow()) - s > t;
        };
    }
    // conditionally set private methods related to TTL
    #updateItemAge = () => { };
    #statusTTL = () => { };
    #setItemTTL = () => { };
    /* c8 ignore stop */
    #isStale = () => false;
    #initializeSizeTracking() {
        const sizes = new ZeroArray(this.#max);
        this.#calculatedSize = 0;
        this.#sizes = sizes;
        this.#removeItemSize = index => {
            this.#calculatedSize -= sizes[index];
            sizes[index] = 0;
        };
        this.#requireSize = (k, v, size, sizeCalculation) => {
            // provisionally accept background fetches.
            // actual value size will be checked when they return.
            if (this.#isBackgroundFetch(v)) {
                return 0;
            }
            if (!isPosInt(size)) {
                if (sizeCalculation) {
                    if (typeof sizeCalculation !== 'function') {
                        throw new TypeError('sizeCalculation must be a function');
                    }
                    size = sizeCalculation(v, k);
                    if (!isPosInt(size)) {
                        throw new TypeError('sizeCalculation return invalid (expect positive integer)');
                    }
                }
                else {
                    throw new TypeError('invalid size value (must be positive integer). ' +
                        'When maxSize or maxEntrySize is used, sizeCalculation ' +
                        'or size must be set.');
                }
            }
            return size;
        };
        this.#addItemSize = (index, size, status) => {
            sizes[index] = size;
            if (this.#maxSize) {
                const maxSize = this.#maxSize - sizes[index];
                while (this.#calculatedSize > maxSize) {
                    this.#evict(true);
                }
            }
            this.#calculatedSize += sizes[index];
            if (status) {
                status.entrySize = size;
                status.totalCalculatedSize = this.#calculatedSize;
            }
        };
    }
    #removeItemSize = _i => { };
    #addItemSize = (_i, _s, _st) => { };
    #requireSize = (_k, _v, size, sizeCalculation) => {
        if (size || sizeCalculation) {
            throw new TypeError('cannot set size without setting maxSize or maxEntrySize on cache');
        }
        return 0;
    };
    *#indexes({ allowStale = this.allowStale } = {}) {
        if (this.#size) {
            for (let i = this.#tail; true;) {
                if (!this.#isValidIndex(i)) {
                    break;
                }
                if (allowStale || !this.#isStale(i)) {
                    yield i;
                }
                if (i === this.#head) {
                    break;
                }
                else {
                    i = this.#prev[i];
                }
            }
        }
    }
    *#rindexes({ allowStale = this.allowStale } = {}) {
        if (this.#size) {
            for (let i = this.#head; true;) {
                if (!this.#isValidIndex(i)) {
                    break;
                }
                if (allowStale || !this.#isStale(i)) {
                    yield i;
                }
                if (i === this.#tail) {
                    break;
                }
                else {
                    i = this.#next[i];
                }
            }
        }
    }
    #isValidIndex(index) {
        return (index !== undefined &&
            this.#keyMap.get(this.#keyList[index]) === index);
    }
    /**
     * Return a generator yielding `[key, value]` pairs,
     * in order from most recently used to least recently used.
     */
    *entries() {
        for (const i of this.#indexes()) {
            if (this.#valList[i] !== undefined &&
                this.#keyList[i] !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield [this.#keyList[i], this.#valList[i]];
            }
        }
    }
    /**
     * Inverse order version of {@link LRUCache.entries}
     *
     * Return a generator yielding `[key, value]` pairs,
     * in order from least recently used to most recently used.
     */
    *rentries() {
        for (const i of this.#rindexes()) {
            if (this.#valList[i] !== undefined &&
                this.#keyList[i] !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield [this.#keyList[i], this.#valList[i]];
            }
        }
    }
    /**
     * Return a generator yielding the keys in the cache,
     * in order from most recently used to least recently used.
     */
    *keys() {
        for (const i of this.#indexes()) {
            const k = this.#keyList[i];
            if (k !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield k;
            }
        }
    }
    /**
     * Inverse order version of {@link LRUCache.keys}
     *
     * Return a generator yielding the keys in the cache,
     * in order from least recently used to most recently used.
     */
    *rkeys() {
        for (const i of this.#rindexes()) {
            const k = this.#keyList[i];
            if (k !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield k;
            }
        }
    }
    /**
     * Return a generator yielding the values in the cache,
     * in order from most recently used to least recently used.
     */
    *values() {
        for (const i of this.#indexes()) {
            const v = this.#valList[i];
            if (v !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield this.#valList[i];
            }
        }
    }
    /**
     * Inverse order version of {@link LRUCache.values}
     *
     * Return a generator yielding the values in the cache,
     * in order from least recently used to most recently used.
     */
    *rvalues() {
        for (const i of this.#rindexes()) {
            const v = this.#valList[i];
            if (v !== undefined &&
                !this.#isBackgroundFetch(this.#valList[i])) {
                yield this.#valList[i];
            }
        }
    }
    /**
     * Iterating over the cache itself yields the same results as
     * {@link LRUCache.entries}
     */
    [Symbol.iterator]() {
        return this.entries();
    }
    /**
     * A String value that is used in the creation of the default string
     * description of an object. Called by the built-in method
     * `Object.prototype.toString`.
     */
    [Symbol.toStringTag] = 'LRUCache';
    /**
     * Find a value for which the supplied fn method returns a truthy value,
     * similar to `Array.find()`. fn is called as `fn(value, key, cache)`.
     */
    find(fn, getOptions = {}) {
        for (const i of this.#indexes()) {
            const v = this.#valList[i];
            const value = this.#isBackgroundFetch(v)
                ? v.__staleWhileFetching
                : v;
            if (value === undefined)
                continue;
            if (fn(value, this.#keyList[i], this)) {
                return this.get(this.#keyList[i], getOptions);
            }
        }
    }
    /**
     * Call the supplied function on each item in the cache, in order from most
     * recently used to least recently used.
     *
     * `fn` is called as `fn(value, key, cache)`.
     *
     * If `thisp` is provided, function will be called in the `this`-context of
     * the provided object, or the cache if no `thisp` object is provided.
     *
     * Does not update age or recenty of use, or iterate over stale values.
     */
    forEach(fn, thisp = this) {
        for (const i of this.#indexes()) {
            const v = this.#valList[i];
            const value = this.#isBackgroundFetch(v)
                ? v.__staleWhileFetching
                : v;
            if (value === undefined)
                continue;
            fn.call(thisp, value, this.#keyList[i], this);
        }
    }
    /**
     * The same as {@link LRUCache.forEach} but items are iterated over in
     * reverse order.  (ie, less recently used items are iterated over first.)
     */
    rforEach(fn, thisp = this) {
        for (const i of this.#rindexes()) {
            const v = this.#valList[i];
            const value = this.#isBackgroundFetch(v)
                ? v.__staleWhileFetching
                : v;
            if (value === undefined)
                continue;
            fn.call(thisp, value, this.#keyList[i], this);
        }
    }
    /**
     * Delete any stale entries. Returns true if anything was removed,
     * false otherwise.
     */
    purgeStale() {
        let deleted = false;
        for (const i of this.#rindexes({ allowStale: true })) {
            if (this.#isStale(i)) {
                this.#delete(this.#keyList[i], 'expire');
                deleted = true;
            }
        }
        return deleted;
    }
    /**
     * Get the extended info about a given entry, to get its value, size, and
     * TTL info simultaneously. Returns `undefined` if the key is not present.
     *
     * Unlike {@link LRUCache#dump}, which is designed to be portable and survive
     * serialization, the `start` value is always the current timestamp, and the
     * `ttl` is a calculated remaining time to live (negative if expired).
     *
     * Always returns stale values, if their info is found in the cache, so be
     * sure to check for expirations (ie, a negative {@link LRUCache.Entry#ttl})
     * if relevant.
     */
    info(key) {
        const i = this.#keyMap.get(key);
        if (i === undefined)
            return undefined;
        const v = this.#valList[i];
        const value = this.#isBackgroundFetch(v)
            ? v.__staleWhileFetching
            : v;
        if (value === undefined)
            return undefined;
        const entry = { value };
        if (this.#ttls && this.#starts) {
            const ttl = this.#ttls[i];
            const start = this.#starts[i];
            if (ttl && start) {
                const remain = ttl - (perf.now() - start);
                entry.ttl = remain;
                entry.start = Date.now();
            }
        }
        if (this.#sizes) {
            entry.size = this.#sizes[i];
        }
        return entry;
    }
    /**
     * Return an array of [key, {@link LRUCache.Entry}] tuples which can be
     * passed to {@link LRLUCache#load}.
     *
     * The `start` fields are calculated relative to a portable `Date.now()`
     * timestamp, even if `performance.now()` is available.
     *
     * Stale entries are always included in the `dump`, even if
     * {@link LRUCache.OptionsBase.allowStale} is false.
     *
     * Note: this returns an actual array, not a generator, so it can be more
     * easily passed around.
     */
    dump() {
        const arr = [];
        for (const i of this.#indexes({ allowStale: true })) {
            const key = this.#keyList[i];
            const v = this.#valList[i];
            const value = this.#isBackgroundFetch(v)
                ? v.__staleWhileFetching
                : v;
            if (value === undefined || key === undefined)
                continue;
            const entry = { value };
            if (this.#ttls && this.#starts) {
                entry.ttl = this.#ttls[i];
                // always dump the start relative to a portable timestamp
                // it's ok for this to be a bit slow, it's a rare operation.
                const age = perf.now() - this.#starts[i];
                entry.start = Math.floor(Date.now() - age);
            }
            if (this.#sizes) {
                entry.size = this.#sizes[i];
            }
            arr.unshift([key, entry]);
        }
        return arr;
    }
    /**
     * Reset the cache and load in the items in entries in the order listed.
     *
     * The shape of the resulting cache may be different if the same options are
     * not used in both caches.
     *
     * The `start` fields are assumed to be calculated relative to a portable
     * `Date.now()` timestamp, even if `performance.now()` is available.
     */
    load(arr) {
        this.clear();
        for (const [key, entry] of arr) {
            if (entry.start) {
                // entry.start is a portable timestamp, but we may be using
                // node's performance.now(), so calculate the offset, so that
                // we get the intended remaining TTL, no matter how long it's
                // been on ice.
                //
                // it's ok for this to be a bit slow, it's a rare operation.
                const age = Date.now() - entry.start;
                entry.start = perf.now() - age;
            }
            this.set(key, entry.value, entry);
        }
    }
    /**
     * Add a value to the cache.
     *
     * Note: if `undefined` is specified as a value, this is an alias for
     * {@link LRUCache#delete}
     *
     * Fields on the {@link LRUCache.SetOptions} options param will override
     * their corresponding values in the constructor options for the scope
     * of this single `set()` operation.
     *
     * If `start` is provided, then that will set the effective start
     * time for the TTL calculation. Note that this must be a previous
     * value of `performance.now()` if supported, or a previous value of
     * `Date.now()` if not.
     *
     * Options object may also include `size`, which will prevent
     * calling the `sizeCalculation` function and just use the specified
     * number if it is a positive integer, and `noDisposeOnSet` which
     * will prevent calling a `dispose` function in the case of
     * overwrites.
     *
     * If the `size` (or return value of `sizeCalculation`) for a given
     * entry is greater than `maxEntrySize`, then the item will not be
     * added to the cache.
     *
     * Will update the recency of the entry.
     *
     * If the value is `undefined`, then this is an alias for
     * `cache.delete(key)`. `undefined` is never stored in the cache.
     */
    set(k, v, setOptions = {}) {
        if (v === undefined) {
            this.delete(k);
            return this;
        }
        const { ttl = this.ttl, start, noDisposeOnSet = this.noDisposeOnSet, sizeCalculation = this.sizeCalculation, status, } = setOptions;
        let { noUpdateTTL = this.noUpdateTTL } = setOptions;
        const size = this.#requireSize(k, v, setOptions.size || 0, sizeCalculation);
        // if the item doesn't fit, don't do anything
        // NB: maxEntrySize set to maxSize by default
        if (this.maxEntrySize && size > this.maxEntrySize) {
            if (status) {
                status.set = 'miss';
                status.maxEntrySizeExceeded = true;
            }
            // have to delete, in case something is there already.
            this.#delete(k, 'set');
            return this;
        }
        let index = this.#size === 0 ? undefined : this.#keyMap.get(k);
        if (index === undefined) {
            // addition
            index = (this.#size === 0
                ? this.#tail
                : this.#free.length !== 0
                    ? this.#free.pop()
                    : this.#size === this.#max
                        ? this.#evict(false)
                        : this.#size);
            this.#keyList[index] = k;
            this.#valList[index] = v;
            this.#keyMap.set(k, index);
            this.#next[this.#tail] = index;
            this.#prev[index] = this.#tail;
            this.#tail = index;
            this.#size++;
            this.#addItemSize(index, size, status);
            if (status)
                status.set = 'add';
            noUpdateTTL = false;
        }
        else {
            // update
            this.#moveToTail(index);
            const oldVal = this.#valList[index];
            if (v !== oldVal) {
                if (this.#hasFetchMethod && this.#isBackgroundFetch(oldVal)) {
                    oldVal.__abortController.abort(new Error('replaced'));
                    const { __staleWhileFetching: s } = oldVal;
                    if (s !== undefined && !noDisposeOnSet) {
                        if (this.#hasDispose) {
                            this.#dispose?.(s, k, 'set');
                        }
                        if (this.#hasDisposeAfter) {
                            this.#disposed?.push([s, k, 'set']);
                        }
                    }
                }
                else if (!noDisposeOnSet) {
                    if (this.#hasDispose) {
                        this.#dispose?.(oldVal, k, 'set');
                    }
                    if (this.#hasDisposeAfter) {
                        this.#disposed?.push([oldVal, k, 'set']);
                    }
                }
                this.#removeItemSize(index);
                this.#addItemSize(index, size, status);
                this.#valList[index] = v;
                if (status) {
                    status.set = 'replace';
                    const oldValue = oldVal && this.#isBackgroundFetch(oldVal)
                        ? oldVal.__staleWhileFetching
                        : oldVal;
                    if (oldValue !== undefined)
                        status.oldValue = oldValue;
                }
            }
            else if (status) {
                status.set = 'update';
            }
        }
        if (ttl !== 0 && !this.#ttls) {
            this.#initializeTTLTracking();
        }
        if (this.#ttls) {
            if (!noUpdateTTL) {
                this.#setItemTTL(index, ttl, start);
            }
            if (status)
                this.#statusTTL(status, index);
        }
        if (!noDisposeOnSet && this.#hasDisposeAfter && this.#disposed) {
            const dt = this.#disposed;
            let task;
            while ((task = dt?.shift())) {
                this.#disposeAfter?.(...task);
            }
        }
        return this;
    }
    /**
     * Evict the least recently used item, returning its value or
     * `undefined` if cache is empty.
     */
    pop() {
        try {
            while (this.#size) {
                const val = this.#valList[this.#head];
                this.#evict(true);
                if (this.#isBackgroundFetch(val)) {
                    if (val.__staleWhileFetching) {
                        return val.__staleWhileFetching;
                    }
                }
                else if (val !== undefined) {
                    return val;
                }
            }
        }
        finally {
            if (this.#hasDisposeAfter && this.#disposed) {
                const dt = this.#disposed;
                let task;
                while ((task = dt?.shift())) {
                    this.#disposeAfter?.(...task);
                }
            }
        }
    }
    #evict(free) {
        const head = this.#head;
        const k = this.#keyList[head];
        const v = this.#valList[head];
        if (this.#hasFetchMethod && this.#isBackgroundFetch(v)) {
            v.__abortController.abort(new Error('evicted'));
        }
        else if (this.#hasDispose || this.#hasDisposeAfter) {
            if (this.#hasDispose) {
                this.#dispose?.(v, k, 'evict');
            }
            if (this.#hasDisposeAfter) {
                this.#disposed?.push([v, k, 'evict']);
            }
        }
        this.#removeItemSize(head);
        // if we aren't about to use the index, then null these out
        if (free) {
            this.#keyList[head] = undefined;
            this.#valList[head] = undefined;
            this.#free.push(head);
        }
        if (this.#size === 1) {
            this.#head = this.#tail = 0;
            this.#free.length = 0;
        }
        else {
            this.#head = this.#next[head];
        }
        this.#keyMap.delete(k);
        this.#size--;
        return head;
    }
    /**
     * Check if a key is in the cache, without updating the recency of use.
     * Will return false if the item is stale, even though it is technically
     * in the cache.
     *
     * Check if a key is in the cache, without updating the recency of
     * use. Age is updated if {@link LRUCache.OptionsBase.updateAgeOnHas} is set
     * to `true` in either the options or the constructor.
     *
     * Will return `false` if the item is stale, even though it is technically in
     * the cache. The difference can be determined (if it matters) by using a
     * `status` argument, and inspecting the `has` field.
     *
     * Will not update item age unless
     * {@link LRUCache.OptionsBase.updateAgeOnHas} is set.
     */
    has(k, hasOptions = {}) {
        const { updateAgeOnHas = this.updateAgeOnHas, status } = hasOptions;
        const index = this.#keyMap.get(k);
        if (index !== undefined) {
            const v = this.#valList[index];
            if (this.#isBackgroundFetch(v) &&
                v.__staleWhileFetching === undefined) {
                return false;
            }
            if (!this.#isStale(index)) {
                if (updateAgeOnHas) {
                    this.#updateItemAge(index);
                }
                if (status) {
                    status.has = 'hit';
                    this.#statusTTL(status, index);
                }
                return true;
            }
            else if (status) {
                status.has = 'stale';
                this.#statusTTL(status, index);
            }
        }
        else if (status) {
            status.has = 'miss';
        }
        return false;
    }
    /**
     * Like {@link LRUCache#get} but doesn't update recency or delete stale
     * items.
     *
     * Returns `undefined` if the item is stale, unless
     * {@link LRUCache.OptionsBase.allowStale} is set.
     */
    peek(k, peekOptions = {}) {
        const { allowStale = this.allowStale } = peekOptions;
        const index = this.#keyMap.get(k);
        if (index === undefined ||
            (!allowStale && this.#isStale(index))) {
            return;
        }
        const v = this.#valList[index];
        // either stale and allowed, or forcing a refresh of non-stale value
        return this.#isBackgroundFetch(v) ? v.__staleWhileFetching : v;
    }
    #backgroundFetch(k, index, options, context) {
        const v = index === undefined ? undefined : this.#valList[index];
        if (this.#isBackgroundFetch(v)) {
            return v;
        }
        const ac = new AC();
        const { signal } = options;
        // when/if our AC signals, then stop listening to theirs.
        signal?.addEventListener('abort', () => ac.abort(signal.reason), {
            signal: ac.signal,
        });
        const fetchOpts = {
            signal: ac.signal,
            options,
            context,
        };
        const cb = (v, updateCache = false) => {
            const { aborted } = ac.signal;
            const ignoreAbort = options.ignoreFetchAbort && v !== undefined;
            if (options.status) {
                if (aborted && !updateCache) {
                    options.status.fetchAborted = true;
                    options.status.fetchError = ac.signal.reason;
                    if (ignoreAbort)
                        options.status.fetchAbortIgnored = true;
                }
                else {
                    options.status.fetchResolved = true;
                }
            }
            if (aborted && !ignoreAbort && !updateCache) {
                return fetchFail(ac.signal.reason);
            }
            // either we didn't abort, and are still here, or we did, and ignored
            const bf = p;
            if (this.#valList[index] === p) {
                if (v === undefined) {
                    if (bf.__staleWhileFetching) {
                        this.#valList[index] = bf.__staleWhileFetching;
                    }
                    else {
                        this.#delete(k, 'fetch');
                    }
                }
                else {
                    if (options.status)
                        options.status.fetchUpdated = true;
                    this.set(k, v, fetchOpts.options);
                }
            }
            return v;
        };
        const eb = (er) => {
            if (options.status) {
                options.status.fetchRejected = true;
                options.status.fetchError = er;
            }
            return fetchFail(er);
        };
        const fetchFail = (er) => {
            const { aborted } = ac.signal;
            const allowStaleAborted = aborted && options.allowStaleOnFetchAbort;
            const allowStale = allowStaleAborted || options.allowStaleOnFetchRejection;
            const noDelete = allowStale || options.noDeleteOnFetchRejection;
            const bf = p;
            if (this.#valList[index] === p) {
                // if we allow stale on fetch rejections, then we need to ensure that
                // the stale value is not removed from the cache when the fetch fails.
                const del = !noDelete || bf.__staleWhileFetching === undefined;
                if (del) {
                    this.#delete(k, 'fetch');
                }
                else if (!allowStaleAborted) {
                    // still replace the *promise* with the stale value,
                    // since we are done with the promise at this point.
                    // leave it untouched if we're still waiting for an
                    // aborted background fetch that hasn't yet returned.
                    this.#valList[index] = bf.__staleWhileFetching;
                }
            }
            if (allowStale) {
                if (options.status && bf.__staleWhileFetching !== undefined) {
                    options.status.returnedStale = true;
                }
                return bf.__staleWhileFetching;
            }
            else if (bf.__returned === bf) {
                throw er;
            }
        };
        const pcall = (res, rej) => {
            const fmp = this.#fetchMethod?.(k, v, fetchOpts);
            if (fmp && fmp instanceof Promise) {
                fmp.then(v => res(v === undefined ? undefined : v), rej);
            }
            // ignored, we go until we finish, regardless.
            // defer check until we are actually aborting,
            // so fetchMethod can override.
            ac.signal.addEventListener('abort', () => {
                if (!options.ignoreFetchAbort ||
                    options.allowStaleOnFetchAbort) {
                    res(undefined);
                    // when it eventually resolves, update the cache.
                    if (options.allowStaleOnFetchAbort) {
                        res = v => cb(v, true);
                    }
                }
            });
        };
        if (options.status)
            options.status.fetchDispatched = true;
        const p = new Promise(pcall).then(cb, eb);
        const bf = Object.assign(p, {
            __abortController: ac,
            __staleWhileFetching: v,
            __returned: undefined,
        });
        if (index === undefined) {
            // internal, don't expose status.
            this.set(k, bf, { ...fetchOpts.options, status: undefined });
            index = this.#keyMap.get(k);
        }
        else {
            this.#valList[index] = bf;
        }
        return bf;
    }
    #isBackgroundFetch(p) {
        if (!this.#hasFetchMethod)
            return false;
        const b = p;
        return (!!b &&
            b instanceof Promise &&
            b.hasOwnProperty('__staleWhileFetching') &&
            b.__abortController instanceof AC);
    }
    async fetch(k, fetchOptions = {}) {
        const { 
        // get options
        allowStale = this.allowStale, updateAgeOnGet = this.updateAgeOnGet, noDeleteOnStaleGet = this.noDeleteOnStaleGet, 
        // set options
        ttl = this.ttl, noDisposeOnSet = this.noDisposeOnSet, size = 0, sizeCalculation = this.sizeCalculation, noUpdateTTL = this.noUpdateTTL, 
        // fetch exclusive options
        noDeleteOnFetchRejection = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection = this.allowStaleOnFetchRejection, ignoreFetchAbort = this.ignoreFetchAbort, allowStaleOnFetchAbort = this.allowStaleOnFetchAbort, context, forceRefresh = false, status, signal, } = fetchOptions;
        if (!this.#hasFetchMethod) {
            if (status)
                status.fetch = 'get';
            return this.get(k, {
                allowStale,
                updateAgeOnGet,
                noDeleteOnStaleGet,
                status,
            });
        }
        const options = {
            allowStale,
            updateAgeOnGet,
            noDeleteOnStaleGet,
            ttl,
            noDisposeOnSet,
            size,
            sizeCalculation,
            noUpdateTTL,
            noDeleteOnFetchRejection,
            allowStaleOnFetchRejection,
            allowStaleOnFetchAbort,
            ignoreFetchAbort,
            status,
            signal,
        };
        let index = this.#keyMap.get(k);
        if (index === undefined) {
            if (status)
                status.fetch = 'miss';
            const p = this.#backgroundFetch(k, index, options, context);
            return (p.__returned = p);
        }
        else {
            // in cache, maybe already fetching
            const v = this.#valList[index];
            if (this.#isBackgroundFetch(v)) {
                const stale = allowStale && v.__staleWhileFetching !== undefined;
                if (status) {
                    status.fetch = 'inflight';
                    if (stale)
                        status.returnedStale = true;
                }
                return stale ? v.__staleWhileFetching : (v.__returned = v);
            }
            // if we force a refresh, that means do NOT serve the cached value,
            // unless we are already in the process of refreshing the cache.
            const isStale = this.#isStale(index);
            if (!forceRefresh && !isStale) {
                if (status)
                    status.fetch = 'hit';
                this.#moveToTail(index);
                if (updateAgeOnGet) {
                    this.#updateItemAge(index);
                }
                if (status)
                    this.#statusTTL(status, index);
                return v;
            }
            // ok, it is stale or a forced refresh, and not already fetching.
            // refresh the cache.
            const p = this.#backgroundFetch(k, index, options, context);
            const hasStale = p.__staleWhileFetching !== undefined;
            const staleVal = hasStale && allowStale;
            if (status) {
                status.fetch = isStale ? 'stale' : 'refresh';
                if (staleVal && isStale)
                    status.returnedStale = true;
            }
            return staleVal ? p.__staleWhileFetching : (p.__returned = p);
        }
    }
    async forceFetch(k, fetchOptions = {}) {
        const v = await this.fetch(k, fetchOptions);
        if (v === undefined)
            throw new Error('fetch() returned undefined');
        return v;
    }
    memo(k, memoOptions = {}) {
        const memoMethod = this.#memoMethod;
        if (!memoMethod) {
            throw new Error('no memoMethod provided to constructor');
        }
        const { context, forceRefresh, ...options } = memoOptions;
        const v = this.get(k, options);
        if (!forceRefresh && v !== undefined)
            return v;
        const vv = memoMethod(k, v, {
            options,
            context,
        });
        this.set(k, vv, options);
        return vv;
    }
    /**
     * Return a value from the cache. Will update the recency of the cache
     * entry found.
     *
     * If the key is not found, get() will return `undefined`.
     */
    get(k, getOptions = {}) {
        const { allowStale = this.allowStale, updateAgeOnGet = this.updateAgeOnGet, noDeleteOnStaleGet = this.noDeleteOnStaleGet, status, } = getOptions;
        const index = this.#keyMap.get(k);
        if (index !== undefined) {
            const value = this.#valList[index];
            const fetching = this.#isBackgroundFetch(value);
            if (status)
                this.#statusTTL(status, index);
            if (this.#isStale(index)) {
                if (status)
                    status.get = 'stale';
                // delete only if not an in-flight background fetch
                if (!fetching) {
                    if (!noDeleteOnStaleGet) {
                        this.#delete(k, 'expire');
                    }
                    if (status && allowStale)
                        status.returnedStale = true;
                    return allowStale ? value : undefined;
                }
                else {
                    if (status &&
                        allowStale &&
                        value.__staleWhileFetching !== undefined) {
                        status.returnedStale = true;
                    }
                    return allowStale ? value.__staleWhileFetching : undefined;
                }
            }
            else {
                if (status)
                    status.get = 'hit';
                // if we're currently fetching it, we don't actually have it yet
                // it's not stale, which means this isn't a staleWhileRefetching.
                // If it's not stale, and fetching, AND has a __staleWhileFetching
                // value, then that means the user fetched with {forceRefresh:true},
                // so it's safe to return that value.
                if (fetching) {
                    return value.__staleWhileFetching;
                }
                this.#moveToTail(index);
                if (updateAgeOnGet) {
                    this.#updateItemAge(index);
                }
                return value;
            }
        }
        else if (status) {
            status.get = 'miss';
        }
    }
    #connect(p, n) {
        this.#prev[n] = p;
        this.#next[p] = n;
    }
    #moveToTail(index) {
        // if tail already, nothing to do
        // if head, move head to next[index]
        // else
        //   move next[prev[index]] to next[index] (head has no prev)
        //   move prev[next[index]] to prev[index]
        // prev[index] = tail
        // next[tail] = index
        // tail = index
        if (index !== this.#tail) {
            if (index === this.#head) {
                this.#head = this.#next[index];
            }
            else {
                this.#connect(this.#prev[index], this.#next[index]);
            }
            this.#connect(this.#tail, index);
            this.#tail = index;
        }
    }
    /**
     * Deletes a key out of the cache.
     *
     * Returns true if the key was deleted, false otherwise.
     */
    delete(k) {
        return this.#delete(k, 'delete');
    }
    #delete(k, reason) {
        let deleted = false;
        if (this.#size !== 0) {
            const index = this.#keyMap.get(k);
            if (index !== undefined) {
                deleted = true;
                if (this.#size === 1) {
                    this.#clear(reason);
                }
                else {
                    this.#removeItemSize(index);
                    const v = this.#valList[index];
                    if (this.#isBackgroundFetch(v)) {
                        v.__abortController.abort(new Error('deleted'));
                    }
                    else if (this.#hasDispose || this.#hasDisposeAfter) {
                        if (this.#hasDispose) {
                            this.#dispose?.(v, k, reason);
                        }
                        if (this.#hasDisposeAfter) {
                            this.#disposed?.push([v, k, reason]);
                        }
                    }
                    this.#keyMap.delete(k);
                    this.#keyList[index] = undefined;
                    this.#valList[index] = undefined;
                    if (index === this.#tail) {
                        this.#tail = this.#prev[index];
                    }
                    else if (index === this.#head) {
                        this.#head = this.#next[index];
                    }
                    else {
                        const pi = this.#prev[index];
                        this.#next[pi] = this.#next[index];
                        const ni = this.#next[index];
                        this.#prev[ni] = this.#prev[index];
                    }
                    this.#size--;
                    this.#free.push(index);
                }
            }
        }
        if (this.#hasDisposeAfter && this.#disposed?.length) {
            const dt = this.#disposed;
            let task;
            while ((task = dt?.shift())) {
                this.#disposeAfter?.(...task);
            }
        }
        return deleted;
    }
    /**
     * Clear the cache entirely, throwing away all values.
     */
    clear() {
        return this.#clear('delete');
    }
    #clear(reason) {
        for (const index of this.#rindexes({ allowStale: true })) {
            const v = this.#valList[index];
            if (this.#isBackgroundFetch(v)) {
                v.__abortController.abort(new Error('deleted'));
            }
            else {
                const k = this.#keyList[index];
                if (this.#hasDispose) {
                    this.#dispose?.(v, k, reason);
                }
                if (this.#hasDisposeAfter) {
                    this.#disposed?.push([v, k, reason]);
                }
            }
        }
        this.#keyMap.clear();
        this.#valList.fill(undefined);
        this.#keyList.fill(undefined);
        if (this.#ttls && this.#starts) {
            this.#ttls.fill(0);
            this.#starts.fill(0);
        }
        if (this.#sizes) {
            this.#sizes.fill(0);
        }
        this.#head = 0;
        this.#tail = 0;
        this.#free.length = 0;
        this.#calculatedSize = 0;
        this.#size = 0;
        if (this.#hasDisposeAfter && this.#disposed) {
            const dt = this.#disposed;
            let task;
            while ((task = dt?.shift())) {
                this.#disposeAfter?.(...task);
            }
        }
    }
}

const proc = typeof process === 'object' && process
    ? process
    : {
        stdout: null,
        stderr: null,
    };
/**
 * Return true if the argument is a Minipass stream, Node stream, or something
 * else that Minipass can interact with.
 */
const isStream = (s) => !!s &&
    typeof s === 'object' &&
    (s instanceof Minipass ||
        s instanceof Stream ||
        isReadable(s) ||
        isWritable(s));
/**
 * Return true if the argument is a valid {@link Minipass.Readable}
 */
const isReadable = (s) => !!s &&
    typeof s === 'object' &&
    s instanceof EventEmitter &&
    typeof s.pipe === 'function' &&
    // node core Writable streams have a pipe() method, but it throws
    s.pipe !== Stream.Writable.prototype.pipe;
/**
 * Return true if the argument is a valid {@link Minipass.Writable}
 */
const isWritable = (s) => !!s &&
    typeof s === 'object' &&
    s instanceof EventEmitter &&
    typeof s.write === 'function' &&
    typeof s.end === 'function';
const EOF = Symbol('EOF');
const MAYBE_EMIT_END = Symbol('maybeEmitEnd');
const EMITTED_END = Symbol('emittedEnd');
const EMITTING_END = Symbol('emittingEnd');
const EMITTED_ERROR = Symbol('emittedError');
const CLOSED = Symbol('closed');
const READ = Symbol('read');
const FLUSH = Symbol('flush');
const FLUSHCHUNK = Symbol('flushChunk');
const ENCODING = Symbol('encoding');
const DECODER = Symbol('decoder');
const FLOWING = Symbol('flowing');
const PAUSED = Symbol('paused');
const RESUME = Symbol('resume');
const BUFFER = Symbol('buffer');
const PIPES = Symbol('pipes');
const BUFFERLENGTH = Symbol('bufferLength');
const BUFFERPUSH = Symbol('bufferPush');
const BUFFERSHIFT = Symbol('bufferShift');
const OBJECTMODE = Symbol('objectMode');
// internal event when stream is destroyed
const DESTROYED = Symbol('destroyed');
// internal event when stream has an error
const ERROR = Symbol('error');
const EMITDATA = Symbol('emitData');
const EMITEND = Symbol('emitEnd');
const EMITEND2 = Symbol('emitEnd2');
const ASYNC = Symbol('async');
const ABORT = Symbol('abort');
const ABORTED = Symbol('aborted');
const SIGNAL = Symbol('signal');
const DATALISTENERS = Symbol('dataListeners');
const DISCARDED = Symbol('discarded');
const defer = (fn) => Promise.resolve().then(fn);
const nodefer = (fn) => fn();
const isEndish = (ev) => ev === 'end' || ev === 'finish' || ev === 'prefinish';
const isArrayBufferLike = (b) => b instanceof ArrayBuffer ||
    (!!b &&
        typeof b === 'object' &&
        b.constructor &&
        b.constructor.name === 'ArrayBuffer' &&
        b.byteLength >= 0);
const isArrayBufferView = (b) => !Buffer.isBuffer(b) && ArrayBuffer.isView(b);
/**
 * Internal class representing a pipe to a destination stream.
 *
 * @internal
 */
class Pipe {
    src;
    dest;
    opts;
    ondrain;
    constructor(src, dest, opts) {
        this.src = src;
        this.dest = dest;
        this.opts = opts;
        this.ondrain = () => src[RESUME]();
        this.dest.on('drain', this.ondrain);
    }
    unpipe() {
        this.dest.removeListener('drain', this.ondrain);
    }
    // only here for the prototype
    /* c8 ignore start */
    proxyErrors(_er) { }
    /* c8 ignore stop */
    end() {
        this.unpipe();
        if (this.opts.end)
            this.dest.end();
    }
}
/**
 * Internal class representing a pipe to a destination stream where
 * errors are proxied.
 *
 * @internal
 */
class PipeProxyErrors extends Pipe {
    unpipe() {
        this.src.removeListener('error', this.proxyErrors);
        super.unpipe();
    }
    constructor(src, dest, opts) {
        super(src, dest, opts);
        this.proxyErrors = er => dest.emit('error', er);
        src.on('error', this.proxyErrors);
    }
}
const isObjectModeOptions = (o) => !!o.objectMode;
const isEncodingOptions = (o) => !o.objectMode && !!o.encoding && o.encoding !== 'buffer';
/**
 * Main export, the Minipass class
 *
 * `RType` is the type of data emitted, defaults to Buffer
 *
 * `WType` is the type of data to be written, if RType is buffer or string,
 * then any {@link Minipass.ContiguousData} is allowed.
 *
 * `Events` is the set of event handler signatures that this object
 * will emit, see {@link Minipass.Events}
 */
class Minipass extends EventEmitter {
    [FLOWING] = false;
    [PAUSED] = false;
    [PIPES] = [];
    [BUFFER] = [];
    [OBJECTMODE];
    [ENCODING];
    [ASYNC];
    [DECODER];
    [EOF] = false;
    [EMITTED_END] = false;
    [EMITTING_END] = false;
    [CLOSED] = false;
    [EMITTED_ERROR] = null;
    [BUFFERLENGTH] = 0;
    [DESTROYED] = false;
    [SIGNAL];
    [ABORTED] = false;
    [DATALISTENERS] = 0;
    [DISCARDED] = false;
    /**
     * true if the stream can be written
     */
    writable = true;
    /**
     * true if the stream can be read
     */
    readable = true;
    /**
     * If `RType` is Buffer, then options do not need to be provided.
     * Otherwise, an options object must be provided to specify either
     * {@link Minipass.SharedOptions.objectMode} or
     * {@link Minipass.SharedOptions.encoding}, as appropriate.
     */
    constructor(...args) {
        const options = (args[0] ||
            {});
        super();
        if (options.objectMode && typeof options.encoding === 'string') {
            throw new TypeError('Encoding and objectMode may not be used together');
        }
        if (isObjectModeOptions(options)) {
            this[OBJECTMODE] = true;
            this[ENCODING] = null;
        }
        else if (isEncodingOptions(options)) {
            this[ENCODING] = options.encoding;
            this[OBJECTMODE] = false;
        }
        else {
            this[OBJECTMODE] = false;
            this[ENCODING] = null;
        }
        this[ASYNC] = !!options.async;
        this[DECODER] = this[ENCODING]
            ? new StringDecoder(this[ENCODING])
            : null;
        //@ts-ignore - private option for debugging and testing
        if (options && options.debugExposeBuffer === true) {
            Object.defineProperty(this, 'buffer', { get: () => this[BUFFER] });
        }
        //@ts-ignore - private option for debugging and testing
        if (options && options.debugExposePipes === true) {
            Object.defineProperty(this, 'pipes', { get: () => this[PIPES] });
        }
        const { signal } = options;
        if (signal) {
            this[SIGNAL] = signal;
            if (signal.aborted) {
                this[ABORT]();
            }
            else {
                signal.addEventListener('abort', () => this[ABORT]());
            }
        }
    }
    /**
     * The amount of data stored in the buffer waiting to be read.
     *
     * For Buffer strings, this will be the total byte length.
     * For string encoding streams, this will be the string character length,
     * according to JavaScript's `string.length` logic.
     * For objectMode streams, this is a count of the items waiting to be
     * emitted.
     */
    get bufferLength() {
        return this[BUFFERLENGTH];
    }
    /**
     * The `BufferEncoding` currently in use, or `null`
     */
    get encoding() {
        return this[ENCODING];
    }
    /**
     * @deprecated - This is a read only property
     */
    set encoding(_enc) {
        throw new Error('Encoding must be set at instantiation time');
    }
    /**
     * @deprecated - Encoding may only be set at instantiation time
     */
    setEncoding(_enc) {
        throw new Error('Encoding must be set at instantiation time');
    }
    /**
     * True if this is an objectMode stream
     */
    get objectMode() {
        return this[OBJECTMODE];
    }
    /**
     * @deprecated - This is a read-only property
     */
    set objectMode(_om) {
        throw new Error('objectMode must be set at instantiation time');
    }
    /**
     * true if this is an async stream
     */
    get ['async']() {
        return this[ASYNC];
    }
    /**
     * Set to true to make this stream async.
     *
     * Once set, it cannot be unset, as this would potentially cause incorrect
     * behavior.  Ie, a sync stream can be made async, but an async stream
     * cannot be safely made sync.
     */
    set ['async'](a) {
        this[ASYNC] = this[ASYNC] || !!a;
    }
    // drop everything and get out of the flow completely
    [ABORT]() {
        this[ABORTED] = true;
        this.emit('abort', this[SIGNAL]?.reason);
        this.destroy(this[SIGNAL]?.reason);
    }
    /**
     * True if the stream has been aborted.
     */
    get aborted() {
        return this[ABORTED];
    }
    /**
     * No-op setter. Stream aborted status is set via the AbortSignal provided
     * in the constructor options.
     */
    set aborted(_) { }
    write(chunk, encoding, cb) {
        if (this[ABORTED])
            return false;
        if (this[EOF])
            throw new Error('write after end');
        if (this[DESTROYED]) {
            this.emit('error', Object.assign(new Error('Cannot call write after a stream was destroyed'), { code: 'ERR_STREAM_DESTROYED' }));
            return true;
        }
        if (typeof encoding === 'function') {
            cb = encoding;
            encoding = 'utf8';
        }
        if (!encoding)
            encoding = 'utf8';
        const fn = this[ASYNC] ? defer : nodefer;
        // convert array buffers and typed array views into buffers
        // at some point in the future, we may want to do the opposite!
        // leave strings and buffers as-is
        // anything is only allowed if in object mode, so throw
        if (!this[OBJECTMODE] && !Buffer.isBuffer(chunk)) {
            if (isArrayBufferView(chunk)) {
                //@ts-ignore - sinful unsafe type changing
                chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            }
            else if (isArrayBufferLike(chunk)) {
                //@ts-ignore - sinful unsafe type changing
                chunk = Buffer.from(chunk);
            }
            else if (typeof chunk !== 'string') {
                throw new Error('Non-contiguous data written to non-objectMode stream');
            }
        }
        // handle object mode up front, since it's simpler
        // this yields better performance, fewer checks later.
        if (this[OBJECTMODE]) {
            // maybe impossible?
            /* c8 ignore start */
            if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
                this[FLUSH](true);
            /* c8 ignore stop */
            if (this[FLOWING])
                this.emit('data', chunk);
            else
                this[BUFFERPUSH](chunk);
            if (this[BUFFERLENGTH] !== 0)
                this.emit('readable');
            if (cb)
                fn(cb);
            return this[FLOWING];
        }
        // at this point the chunk is a buffer or string
        // don't buffer it up or send it to the decoder
        if (!chunk.length) {
            if (this[BUFFERLENGTH] !== 0)
                this.emit('readable');
            if (cb)
                fn(cb);
            return this[FLOWING];
        }
        // fast-path writing strings of same encoding to a stream with
        // an empty buffer, skipping the buffer/decoder dance
        if (typeof chunk === 'string' &&
            // unless it is a string already ready for us to use
            !(encoding === this[ENCODING] && !this[DECODER]?.lastNeed)) {
            //@ts-ignore - sinful unsafe type change
            chunk = Buffer.from(chunk, encoding);
        }
        if (Buffer.isBuffer(chunk) && this[ENCODING]) {
            //@ts-ignore - sinful unsafe type change
            chunk = this[DECODER].write(chunk);
        }
        // Note: flushing CAN potentially switch us into not-flowing mode
        if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
            this[FLUSH](true);
        if (this[FLOWING])
            this.emit('data', chunk);
        else
            this[BUFFERPUSH](chunk);
        if (this[BUFFERLENGTH] !== 0)
            this.emit('readable');
        if (cb)
            fn(cb);
        return this[FLOWING];
    }
    /**
     * Low-level explicit read method.
     *
     * In objectMode, the argument is ignored, and one item is returned if
     * available.
     *
     * `n` is the number of bytes (or in the case of encoding streams,
     * characters) to consume. If `n` is not provided, then the entire buffer
     * is returned, or `null` is returned if no data is available.
     *
     * If `n` is greater that the amount of data in the internal buffer,
     * then `null` is returned.
     */
    read(n) {
        if (this[DESTROYED])
            return null;
        this[DISCARDED] = false;
        if (this[BUFFERLENGTH] === 0 ||
            n === 0 ||
            (n && n > this[BUFFERLENGTH])) {
            this[MAYBE_EMIT_END]();
            return null;
        }
        if (this[OBJECTMODE])
            n = null;
        if (this[BUFFER].length > 1 && !this[OBJECTMODE]) {
            // not object mode, so if we have an encoding, then RType is string
            // otherwise, must be Buffer
            this[BUFFER] = [
                (this[ENCODING]
                    ? this[BUFFER].join('')
                    : Buffer.concat(this[BUFFER], this[BUFFERLENGTH])),
            ];
        }
        const ret = this[READ](n || null, this[BUFFER][0]);
        this[MAYBE_EMIT_END]();
        return ret;
    }
    [READ](n, chunk) {
        if (this[OBJECTMODE])
            this[BUFFERSHIFT]();
        else {
            const c = chunk;
            if (n === c.length || n === null)
                this[BUFFERSHIFT]();
            else if (typeof c === 'string') {
                this[BUFFER][0] = c.slice(n);
                chunk = c.slice(0, n);
                this[BUFFERLENGTH] -= n;
            }
            else {
                this[BUFFER][0] = c.subarray(n);
                chunk = c.subarray(0, n);
                this[BUFFERLENGTH] -= n;
            }
        }
        this.emit('data', chunk);
        if (!this[BUFFER].length && !this[EOF])
            this.emit('drain');
        return chunk;
    }
    end(chunk, encoding, cb) {
        if (typeof chunk === 'function') {
            cb = chunk;
            chunk = undefined;
        }
        if (typeof encoding === 'function') {
            cb = encoding;
            encoding = 'utf8';
        }
        if (chunk !== undefined)
            this.write(chunk, encoding);
        if (cb)
            this.once('end', cb);
        this[EOF] = true;
        this.writable = false;
        // if we haven't written anything, then go ahead and emit,
        // even if we're not reading.
        // we'll re-emit if a new 'end' listener is added anyway.
        // This makes MP more suitable to write-only use cases.
        if (this[FLOWING] || !this[PAUSED])
            this[MAYBE_EMIT_END]();
        return this;
    }
    // don't let the internal resume be overwritten
    [RESUME]() {
        if (this[DESTROYED])
            return;
        if (!this[DATALISTENERS] && !this[PIPES].length) {
            this[DISCARDED] = true;
        }
        this[PAUSED] = false;
        this[FLOWING] = true;
        this.emit('resume');
        if (this[BUFFER].length)
            this[FLUSH]();
        else if (this[EOF])
            this[MAYBE_EMIT_END]();
        else
            this.emit('drain');
    }
    /**
     * Resume the stream if it is currently in a paused state
     *
     * If called when there are no pipe destinations or `data` event listeners,
     * this will place the stream in a "discarded" state, where all data will
     * be thrown away. The discarded state is removed if a pipe destination or
     * data handler is added, if pause() is called, or if any synchronous or
     * asynchronous iteration is started.
     */
    resume() {
        return this[RESUME]();
    }
    /**
     * Pause the stream
     */
    pause() {
        this[FLOWING] = false;
        this[PAUSED] = true;
        this[DISCARDED] = false;
    }
    /**
     * true if the stream has been forcibly destroyed
     */
    get destroyed() {
        return this[DESTROYED];
    }
    /**
     * true if the stream is currently in a flowing state, meaning that
     * any writes will be immediately emitted.
     */
    get flowing() {
        return this[FLOWING];
    }
    /**
     * true if the stream is currently in a paused state
     */
    get paused() {
        return this[PAUSED];
    }
    [BUFFERPUSH](chunk) {
        if (this[OBJECTMODE])
            this[BUFFERLENGTH] += 1;
        else
            this[BUFFERLENGTH] += chunk.length;
        this[BUFFER].push(chunk);
    }
    [BUFFERSHIFT]() {
        if (this[OBJECTMODE])
            this[BUFFERLENGTH] -= 1;
        else
            this[BUFFERLENGTH] -= this[BUFFER][0].length;
        return this[BUFFER].shift();
    }
    [FLUSH](noDrain = false) {
        do { } while (this[FLUSHCHUNK](this[BUFFERSHIFT]()) &&
            this[BUFFER].length);
        if (!noDrain && !this[BUFFER].length && !this[EOF])
            this.emit('drain');
    }
    [FLUSHCHUNK](chunk) {
        this.emit('data', chunk);
        return this[FLOWING];
    }
    /**
     * Pipe all data emitted by this stream into the destination provided.
     *
     * Triggers the flow of data.
     */
    pipe(dest, opts) {
        if (this[DESTROYED])
            return dest;
        this[DISCARDED] = false;
        const ended = this[EMITTED_END];
        opts = opts || {};
        if (dest === proc.stdout || dest === proc.stderr)
            opts.end = false;
        else
            opts.end = opts.end !== false;
        opts.proxyErrors = !!opts.proxyErrors;
        // piping an ended stream ends immediately
        if (ended) {
            if (opts.end)
                dest.end();
        }
        else {
            // "as" here just ignores the WType, which pipes don't care about,
            // since they're only consuming from us, and writing to the dest
            this[PIPES].push(!opts.proxyErrors
                ? new Pipe(this, dest, opts)
                : new PipeProxyErrors(this, dest, opts));
            if (this[ASYNC])
                defer(() => this[RESUME]());
            else
                this[RESUME]();
        }
        return dest;
    }
    /**
     * Fully unhook a piped destination stream.
     *
     * If the destination stream was the only consumer of this stream (ie,
     * there are no other piped destinations or `'data'` event listeners)
     * then the flow of data will stop until there is another consumer or
     * {@link Minipass#resume} is explicitly called.
     */
    unpipe(dest) {
        const p = this[PIPES].find(p => p.dest === dest);
        if (p) {
            if (this[PIPES].length === 1) {
                if (this[FLOWING] && this[DATALISTENERS] === 0) {
                    this[FLOWING] = false;
                }
                this[PIPES] = [];
            }
            else
                this[PIPES].splice(this[PIPES].indexOf(p), 1);
            p.unpipe();
        }
    }
    /**
     * Alias for {@link Minipass#on}
     */
    addListener(ev, handler) {
        return this.on(ev, handler);
    }
    /**
     * Mostly identical to `EventEmitter.on`, with the following
     * behavior differences to prevent data loss and unnecessary hangs:
     *
     * - Adding a 'data' event handler will trigger the flow of data
     *
     * - Adding a 'readable' event handler when there is data waiting to be read
     *   will cause 'readable' to be emitted immediately.
     *
     * - Adding an 'endish' event handler ('end', 'finish', etc.) which has
     *   already passed will cause the event to be emitted immediately and all
     *   handlers removed.
     *
     * - Adding an 'error' event handler after an error has been emitted will
     *   cause the event to be re-emitted immediately with the error previously
     *   raised.
     */
    on(ev, handler) {
        const ret = super.on(ev, handler);
        if (ev === 'data') {
            this[DISCARDED] = false;
            this[DATALISTENERS]++;
            if (!this[PIPES].length && !this[FLOWING]) {
                this[RESUME]();
            }
        }
        else if (ev === 'readable' && this[BUFFERLENGTH] !== 0) {
            super.emit('readable');
        }
        else if (isEndish(ev) && this[EMITTED_END]) {
            super.emit(ev);
            this.removeAllListeners(ev);
        }
        else if (ev === 'error' && this[EMITTED_ERROR]) {
            const h = handler;
            if (this[ASYNC])
                defer(() => h.call(this, this[EMITTED_ERROR]));
            else
                h.call(this, this[EMITTED_ERROR]);
        }
        return ret;
    }
    /**
     * Alias for {@link Minipass#off}
     */
    removeListener(ev, handler) {
        return this.off(ev, handler);
    }
    /**
     * Mostly identical to `EventEmitter.off`
     *
     * If a 'data' event handler is removed, and it was the last consumer
     * (ie, there are no pipe destinations or other 'data' event listeners),
     * then the flow of data will stop until there is another consumer or
     * {@link Minipass#resume} is explicitly called.
     */
    off(ev, handler) {
        const ret = super.off(ev, handler);
        // if we previously had listeners, and now we don't, and we don't
        // have any pipes, then stop the flow, unless it's been explicitly
        // put in a discarded flowing state via stream.resume().
        if (ev === 'data') {
            this[DATALISTENERS] = this.listeners('data').length;
            if (this[DATALISTENERS] === 0 &&
                !this[DISCARDED] &&
                !this[PIPES].length) {
                this[FLOWING] = false;
            }
        }
        return ret;
    }
    /**
     * Mostly identical to `EventEmitter.removeAllListeners`
     *
     * If all 'data' event handlers are removed, and they were the last consumer
     * (ie, there are no pipe destinations), then the flow of data will stop
     * until there is another consumer or {@link Minipass#resume} is explicitly
     * called.
     */
    removeAllListeners(ev) {
        const ret = super.removeAllListeners(ev);
        if (ev === 'data' || ev === undefined) {
            this[DATALISTENERS] = 0;
            if (!this[DISCARDED] && !this[PIPES].length) {
                this[FLOWING] = false;
            }
        }
        return ret;
    }
    /**
     * true if the 'end' event has been emitted
     */
    get emittedEnd() {
        return this[EMITTED_END];
    }
    [MAYBE_EMIT_END]() {
        if (!this[EMITTING_END] &&
            !this[EMITTED_END] &&
            !this[DESTROYED] &&
            this[BUFFER].length === 0 &&
            this[EOF]) {
            this[EMITTING_END] = true;
            this.emit('end');
            this.emit('prefinish');
            this.emit('finish');
            if (this[CLOSED])
                this.emit('close');
            this[EMITTING_END] = false;
        }
    }
    /**
     * Mostly identical to `EventEmitter.emit`, with the following
     * behavior differences to prevent data loss and unnecessary hangs:
     *
     * If the stream has been destroyed, and the event is something other
     * than 'close' or 'error', then `false` is returned and no handlers
     * are called.
     *
     * If the event is 'end', and has already been emitted, then the event
     * is ignored. If the stream is in a paused or non-flowing state, then
     * the event will be deferred until data flow resumes. If the stream is
     * async, then handlers will be called on the next tick rather than
     * immediately.
     *
     * If the event is 'close', and 'end' has not yet been emitted, then
     * the event will be deferred until after 'end' is emitted.
     *
     * If the event is 'error', and an AbortSignal was provided for the stream,
     * and there are no listeners, then the event is ignored, matching the
     * behavior of node core streams in the presense of an AbortSignal.
     *
     * If the event is 'finish' or 'prefinish', then all listeners will be
     * removed after emitting the event, to prevent double-firing.
     */
    emit(ev, ...args) {
        const data = args[0];
        // error and close are only events allowed after calling destroy()
        if (ev !== 'error' &&
            ev !== 'close' &&
            ev !== DESTROYED &&
            this[DESTROYED]) {
            return false;
        }
        else if (ev === 'data') {
            return !this[OBJECTMODE] && !data
                ? false
                : this[ASYNC]
                    ? (defer(() => this[EMITDATA](data)), true)
                    : this[EMITDATA](data);
        }
        else if (ev === 'end') {
            return this[EMITEND]();
        }
        else if (ev === 'close') {
            this[CLOSED] = true;
            // don't emit close before 'end' and 'finish'
            if (!this[EMITTED_END] && !this[DESTROYED])
                return false;
            const ret = super.emit('close');
            this.removeAllListeners('close');
            return ret;
        }
        else if (ev === 'error') {
            this[EMITTED_ERROR] = data;
            super.emit(ERROR, data);
            const ret = !this[SIGNAL] || this.listeners('error').length
                ? super.emit('error', data)
                : false;
            this[MAYBE_EMIT_END]();
            return ret;
        }
        else if (ev === 'resume') {
            const ret = super.emit('resume');
            this[MAYBE_EMIT_END]();
            return ret;
        }
        else if (ev === 'finish' || ev === 'prefinish') {
            const ret = super.emit(ev);
            this.removeAllListeners(ev);
            return ret;
        }
        // Some other unknown event
        const ret = super.emit(ev, ...args);
        this[MAYBE_EMIT_END]();
        return ret;
    }
    [EMITDATA](data) {
        for (const p of this[PIPES]) {
            if (p.dest.write(data) === false)
                this.pause();
        }
        const ret = this[DISCARDED] ? false : super.emit('data', data);
        this[MAYBE_EMIT_END]();
        return ret;
    }
    [EMITEND]() {
        if (this[EMITTED_END])
            return false;
        this[EMITTED_END] = true;
        this.readable = false;
        return this[ASYNC]
            ? (defer(() => this[EMITEND2]()), true)
            : this[EMITEND2]();
    }
    [EMITEND2]() {
        if (this[DECODER]) {
            const data = this[DECODER].end();
            if (data) {
                for (const p of this[PIPES]) {
                    p.dest.write(data);
                }
                if (!this[DISCARDED])
                    super.emit('data', data);
            }
        }
        for (const p of this[PIPES]) {
            p.end();
        }
        const ret = super.emit('end');
        this.removeAllListeners('end');
        return ret;
    }
    /**
     * Return a Promise that resolves to an array of all emitted data once
     * the stream ends.
     */
    async collect() {
        const buf = Object.assign([], {
            dataLength: 0,
        });
        if (!this[OBJECTMODE])
            buf.dataLength = 0;
        // set the promise first, in case an error is raised
        // by triggering the flow here.
        const p = this.promise();
        this.on('data', c => {
            buf.push(c);
            if (!this[OBJECTMODE])
                buf.dataLength += c.length;
        });
        await p;
        return buf;
    }
    /**
     * Return a Promise that resolves to the concatenation of all emitted data
     * once the stream ends.
     *
     * Not allowed on objectMode streams.
     */
    async concat() {
        if (this[OBJECTMODE]) {
            throw new Error('cannot concat in objectMode');
        }
        const buf = await this.collect();
        return (this[ENCODING]
            ? buf.join('')
            : Buffer.concat(buf, buf.dataLength));
    }
    /**
     * Return a void Promise that resolves once the stream ends.
     */
    async promise() {
        return new Promise((resolve, reject) => {
            this.on(DESTROYED, () => reject(new Error('stream destroyed')));
            this.on('error', er => reject(er));
            this.on('end', () => resolve());
        });
    }
    /**
     * Asynchronous `for await of` iteration.
     *
     * This will continue emitting all chunks until the stream terminates.
     */
    [Symbol.asyncIterator]() {
        // set this up front, in case the consumer doesn't call next()
        // right away.
        this[DISCARDED] = false;
        let stopped = false;
        const stop = async () => {
            this.pause();
            stopped = true;
            return { value: undefined, done: true };
        };
        const next = () => {
            if (stopped)
                return stop();
            const res = this.read();
            if (res !== null)
                return Promise.resolve({ done: false, value: res });
            if (this[EOF])
                return stop();
            let resolve;
            let reject;
            const onerr = (er) => {
                this.off('data', ondata);
                this.off('end', onend);
                this.off(DESTROYED, ondestroy);
                stop();
                reject(er);
            };
            const ondata = (value) => {
                this.off('error', onerr);
                this.off('end', onend);
                this.off(DESTROYED, ondestroy);
                this.pause();
                resolve({ value, done: !!this[EOF] });
            };
            const onend = () => {
                this.off('error', onerr);
                this.off('data', ondata);
                this.off(DESTROYED, ondestroy);
                stop();
                resolve({ done: true, value: undefined });
            };
            const ondestroy = () => onerr(new Error('stream destroyed'));
            return new Promise((res, rej) => {
                reject = rej;
                resolve = res;
                this.once(DESTROYED, ondestroy);
                this.once('error', onerr);
                this.once('end', onend);
                this.once('data', ondata);
            });
        };
        return {
            next,
            throw: stop,
            return: stop,
            [Symbol.asyncIterator]() {
                return this;
            },
        };
    }
    /**
     * Synchronous `for of` iteration.
     *
     * The iteration will terminate when the internal buffer runs out, even
     * if the stream has not yet terminated.
     */
    [Symbol.iterator]() {
        // set this up front, in case the consumer doesn't call next()
        // right away.
        this[DISCARDED] = false;
        let stopped = false;
        const stop = () => {
            this.pause();
            this.off(ERROR, stop);
            this.off(DESTROYED, stop);
            this.off('end', stop);
            stopped = true;
            return { done: true, value: undefined };
        };
        const next = () => {
            if (stopped)
                return stop();
            const value = this.read();
            return value === null ? stop() : { done: false, value };
        };
        this.once('end', stop);
        this.once(ERROR, stop);
        this.once(DESTROYED, stop);
        return {
            next,
            throw: stop,
            return: stop,
            [Symbol.iterator]() {
                return this;
            },
        };
    }
    /**
     * Destroy a stream, preventing it from being used for any further purpose.
     *
     * If the stream has a `close()` method, then it will be called on
     * destruction.
     *
     * After destruction, any attempt to write data, read data, or emit most
     * events will be ignored.
     *
     * If an error argument is provided, then it will be emitted in an
     * 'error' event.
     */
    destroy(er) {
        if (this[DESTROYED]) {
            if (er)
                this.emit('error', er);
            else
                this.emit(DESTROYED);
            return this;
        }
        this[DESTROYED] = true;
        this[DISCARDED] = true;
        // throw away all buffered data, it's never coming out
        this[BUFFER].length = 0;
        this[BUFFERLENGTH] = 0;
        const wc = this;
        if (typeof wc.close === 'function' && !this[CLOSED])
            wc.close();
        if (er)
            this.emit('error', er);
        // if no error to emit, still reject pending promises
        else
            this.emit(DESTROYED);
        return this;
    }
    /**
     * Alias for {@link isStream}
     *
     * Former export location, maintained for backwards compatibility.
     *
     * @deprecated
     */
    static get isStream() {
        return isStream;
    }
}

const realpathSync = realpathSync$1.native;
const defaultFS = {
    lstatSync,
    readdir: readdir,
    readdirSync,
    readlinkSync,
    realpathSync,
    promises: {
        lstat,
        readdir: readdir$1,
        readlink,
        realpath,
    },
};
// if they just gave us require('fs') then use our default
const fsFromOption = (fsOption) => !fsOption || fsOption === defaultFS || fsOption === actualFS ?
    defaultFS
    : {
        ...defaultFS,
        ...fsOption,
        promises: {
            ...defaultFS.promises,
            ...(fsOption.promises || {}),
        },
    };
// turn something like //?/c:/ into c:\
const uncDriveRegexp = /^\\\\\?\\([a-z]:)\\?$/i;
const uncToDrive = (rootPath) => rootPath.replace(/\//g, '\\').replace(uncDriveRegexp, '$1\\');
// windows paths are separated by either / or \
const eitherSep = /[\\\/]/;
const UNKNOWN = 0; // may not even exist, for all we know
const IFIFO = 0b0001;
const IFCHR = 0b0010;
const IFDIR = 0b0100;
const IFBLK = 0b0110;
const IFREG = 0b1000;
const IFLNK = 0b1010;
const IFSOCK = 0b1100;
const IFMT = 0b1111;
// mask to unset low 4 bits
const IFMT_UNKNOWN = ~IFMT;
// set after successfully calling readdir() and getting entries.
const READDIR_CALLED = 0b0000_0001_0000;
// set after a successful lstat()
const LSTAT_CALLED = 0b0000_0010_0000;
// set if an entry (or one of its parents) is definitely not a dir
const ENOTDIR = 0b0000_0100_0000;
// set if an entry (or one of its parents) does not exist
// (can also be set on lstat errors like EACCES or ENAMETOOLONG)
const ENOENT = 0b0000_1000_0000;
// cannot have child entries -- also verify &IFMT is either IFDIR or IFLNK
// set if we fail to readlink
const ENOREADLINK = 0b0001_0000_0000;
// set if we know realpath() will fail
const ENOREALPATH = 0b0010_0000_0000;
const ENOCHILD = ENOTDIR | ENOENT | ENOREALPATH;
const TYPEMASK = 0b0011_1111_1111;
const entToType = (s) => s.isFile() ? IFREG
    : s.isDirectory() ? IFDIR
        : s.isSymbolicLink() ? IFLNK
            : s.isCharacterDevice() ? IFCHR
                : s.isBlockDevice() ? IFBLK
                    : s.isSocket() ? IFSOCK
                        : s.isFIFO() ? IFIFO
                            : UNKNOWN;
// normalize unicode path names
const normalizeCache = new Map();
const normalize = (s) => {
    const c = normalizeCache.get(s);
    if (c)
        return c;
    const n = s.normalize('NFKD');
    normalizeCache.set(s, n);
    return n;
};
const normalizeNocaseCache = new Map();
const normalizeNocase = (s) => {
    const c = normalizeNocaseCache.get(s);
    if (c)
        return c;
    const n = normalize(s.toLowerCase());
    normalizeNocaseCache.set(s, n);
    return n;
};
/**
 * An LRUCache for storing resolved path strings or Path objects.
 * @internal
 */
class ResolveCache extends LRUCache {
    constructor() {
        super({ max: 256 });
    }
}
// In order to prevent blowing out the js heap by allocating hundreds of
// thousands of Path entries when walking extremely large trees, the "children"
// in this tree are represented by storing an array of Path entries in an
// LRUCache, indexed by the parent.  At any time, Path.children() may return an
// empty array, indicating that it doesn't know about any of its children, and
// thus has to rebuild that cache.  This is fine, it just means that we don't
// benefit as much from having the cached entries, but huge directory walks
// don't blow out the stack, and smaller ones are still as fast as possible.
//
//It does impose some complexity when building up the readdir data, because we
//need to pass a reference to the children array that we started with.
/**
 * an LRUCache for storing child entries.
 * @internal
 */
class ChildrenCache extends LRUCache {
    constructor(maxSize = 16 * 1024) {
        super({
            maxSize,
            // parent + children
            sizeCalculation: a => a.length + 1,
        });
    }
}
const setAsCwd = Symbol('PathScurry setAsCwd');
/**
 * Path objects are sort of like a super-powered
 * {@link https://nodejs.org/docs/latest/api/fs.html#class-fsdirent fs.Dirent}
 *
 * Each one represents a single filesystem entry on disk, which may or may not
 * exist. It includes methods for reading various types of information via
 * lstat, readlink, and readdir, and caches all information to the greatest
 * degree possible.
 *
 * Note that fs operations that would normally throw will instead return an
 * "empty" value. This is in order to prevent excessive overhead from error
 * stack traces.
 */
class PathBase {
    /**
     * the basename of this path
     *
     * **Important**: *always* test the path name against any test string
     * usingthe {@link isNamed} method, and not by directly comparing this
     * string. Otherwise, unicode path strings that the system sees as identical
     * will not be properly treated as the same path, leading to incorrect
     * behavior and possible security issues.
     */
    name;
    /**
     * the Path entry corresponding to the path root.
     *
     * @internal
     */
    root;
    /**
     * All roots found within the current PathScurry family
     *
     * @internal
     */
    roots;
    /**
     * a reference to the parent path, or undefined in the case of root entries
     *
     * @internal
     */
    parent;
    /**
     * boolean indicating whether paths are compared case-insensitively
     * @internal
     */
    nocase;
    /**
     * boolean indicating that this path is the current working directory
     * of the PathScurry collection that contains it.
     */
    isCWD = false;
    // potential default fs override
    #fs;
    // Stats fields
    #dev;
    get dev() {
        return this.#dev;
    }
    #mode;
    get mode() {
        return this.#mode;
    }
    #nlink;
    get nlink() {
        return this.#nlink;
    }
    #uid;
    get uid() {
        return this.#uid;
    }
    #gid;
    get gid() {
        return this.#gid;
    }
    #rdev;
    get rdev() {
        return this.#rdev;
    }
    #blksize;
    get blksize() {
        return this.#blksize;
    }
    #ino;
    get ino() {
        return this.#ino;
    }
    #size;
    get size() {
        return this.#size;
    }
    #blocks;
    get blocks() {
        return this.#blocks;
    }
    #atimeMs;
    get atimeMs() {
        return this.#atimeMs;
    }
    #mtimeMs;
    get mtimeMs() {
        return this.#mtimeMs;
    }
    #ctimeMs;
    get ctimeMs() {
        return this.#ctimeMs;
    }
    #birthtimeMs;
    get birthtimeMs() {
        return this.#birthtimeMs;
    }
    #atime;
    get atime() {
        return this.#atime;
    }
    #mtime;
    get mtime() {
        return this.#mtime;
    }
    #ctime;
    get ctime() {
        return this.#ctime;
    }
    #birthtime;
    get birthtime() {
        return this.#birthtime;
    }
    #matchName;
    #depth;
    #fullpath;
    #fullpathPosix;
    #relative;
    #relativePosix;
    #type;
    #children;
    #linkTarget;
    #realpath;
    /**
     * This property is for compatibility with the Dirent class as of
     * Node v20, where Dirent['parentPath'] refers to the path of the
     * directory that was passed to readdir. For root entries, it's the path
     * to the entry itself.
     */
    get parentPath() {
        return (this.parent || this).fullpath();
    }
    /**
     * Deprecated alias for Dirent['parentPath'] Somewhat counterintuitively,
     * this property refers to the *parent* path, not the path object itself.
     *
     * @deprecated
     */
    get path() {
        return this.parentPath;
    }
    /**
     * Do not create new Path objects directly.  They should always be accessed
     * via the PathScurry class or other methods on the Path class.
     *
     * @internal
     */
    constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
        this.name = name;
        this.#matchName = nocase ? normalizeNocase(name) : normalize(name);
        this.#type = type & TYPEMASK;
        this.nocase = nocase;
        this.roots = roots;
        this.root = root || this;
        this.#children = children;
        this.#fullpath = opts.fullpath;
        this.#relative = opts.relative;
        this.#relativePosix = opts.relativePosix;
        this.parent = opts.parent;
        if (this.parent) {
            this.#fs = this.parent.#fs;
        }
        else {
            this.#fs = fsFromOption(opts.fs);
        }
    }
    /**
     * Returns the depth of the Path object from its root.
     *
     * For example, a path at `/foo/bar` would have a depth of 2.
     */
    depth() {
        if (this.#depth !== undefined)
            return this.#depth;
        if (!this.parent)
            return (this.#depth = 0);
        return (this.#depth = this.parent.depth() + 1);
    }
    /**
     * @internal
     */
    childrenCache() {
        return this.#children;
    }
    /**
     * Get the Path object referenced by the string path, resolved from this Path
     */
    resolve(path) {
        if (!path) {
            return this;
        }
        const rootPath = this.getRootString(path);
        const dir = path.substring(rootPath.length);
        const dirParts = dir.split(this.splitSep);
        const result = rootPath ?
            this.getRoot(rootPath).#resolveParts(dirParts)
            : this.#resolveParts(dirParts);
        return result;
    }
    #resolveParts(dirParts) {
        let p = this;
        for (const part of dirParts) {
            p = p.child(part);
        }
        return p;
    }
    /**
     * Returns the cached children Path objects, if still available.  If they
     * have fallen out of the cache, then returns an empty array, and resets the
     * READDIR_CALLED bit, so that future calls to readdir() will require an fs
     * lookup.
     *
     * @internal
     */
    children() {
        const cached = this.#children.get(this);
        if (cached) {
            return cached;
        }
        const children = Object.assign([], { provisional: 0 });
        this.#children.set(this, children);
        this.#type &= ~READDIR_CALLED;
        return children;
    }
    /**
     * Resolves a path portion and returns or creates the child Path.
     *
     * Returns `this` if pathPart is `''` or `'.'`, or `parent` if pathPart is
     * `'..'`.
     *
     * This should not be called directly.  If `pathPart` contains any path
     * separators, it will lead to unsafe undefined behavior.
     *
     * Use `Path.resolve()` instead.
     *
     * @internal
     */
    child(pathPart, opts) {
        if (pathPart === '' || pathPart === '.') {
            return this;
        }
        if (pathPart === '..') {
            return this.parent || this;
        }
        // find the child
        const children = this.children();
        const name = this.nocase ? normalizeNocase(pathPart) : normalize(pathPart);
        for (const p of children) {
            if (p.#matchName === name) {
                return p;
            }
        }
        // didn't find it, create provisional child, since it might not
        // actually exist.  If we know the parent isn't a dir, then
        // in fact it CAN'T exist.
        const s = this.parent ? this.sep : '';
        const fullpath = this.#fullpath ? this.#fullpath + s + pathPart : undefined;
        const pchild = this.newChild(pathPart, UNKNOWN, {
            ...opts,
            parent: this,
            fullpath,
        });
        if (!this.canReaddir()) {
            pchild.#type |= ENOENT;
        }
        // don't have to update provisional, because if we have real children,
        // then provisional is set to children.length, otherwise a lower number
        children.push(pchild);
        return pchild;
    }
    /**
     * The relative path from the cwd. If it does not share an ancestor with
     * the cwd, then this ends up being equivalent to the fullpath()
     */
    relative() {
        if (this.isCWD)
            return '';
        if (this.#relative !== undefined) {
            return this.#relative;
        }
        const name = this.name;
        const p = this.parent;
        if (!p) {
            return (this.#relative = this.name);
        }
        const pv = p.relative();
        return pv + (!pv || !p.parent ? '' : this.sep) + name;
    }
    /**
     * The relative path from the cwd, using / as the path separator.
     * If it does not share an ancestor with
     * the cwd, then this ends up being equivalent to the fullpathPosix()
     * On posix systems, this is identical to relative().
     */
    relativePosix() {
        if (this.sep === '/')
            return this.relative();
        if (this.isCWD)
            return '';
        if (this.#relativePosix !== undefined)
            return this.#relativePosix;
        const name = this.name;
        const p = this.parent;
        if (!p) {
            return (this.#relativePosix = this.fullpathPosix());
        }
        const pv = p.relativePosix();
        return pv + (!pv || !p.parent ? '' : '/') + name;
    }
    /**
     * The fully resolved path string for this Path entry
     */
    fullpath() {
        if (this.#fullpath !== undefined) {
            return this.#fullpath;
        }
        const name = this.name;
        const p = this.parent;
        if (!p) {
            return (this.#fullpath = this.name);
        }
        const pv = p.fullpath();
        const fp = pv + (!p.parent ? '' : this.sep) + name;
        return (this.#fullpath = fp);
    }
    /**
     * On platforms other than windows, this is identical to fullpath.
     *
     * On windows, this is overridden to return the forward-slash form of the
     * full UNC path.
     */
    fullpathPosix() {
        if (this.#fullpathPosix !== undefined)
            return this.#fullpathPosix;
        if (this.sep === '/')
            return (this.#fullpathPosix = this.fullpath());
        if (!this.parent) {
            const p = this.fullpath().replace(/\\/g, '/');
            if (/^[a-z]:\//i.test(p)) {
                return (this.#fullpathPosix = `//?/${p}`);
            }
            else {
                return (this.#fullpathPosix = p);
            }
        }
        const p = this.parent;
        const pfpp = p.fullpathPosix();
        const fpp = pfpp + (!pfpp || !p.parent ? '' : '/') + this.name;
        return (this.#fullpathPosix = fpp);
    }
    /**
     * Is the Path of an unknown type?
     *
     * Note that we might know *something* about it if there has been a previous
     * filesystem operation, for example that it does not exist, or is not a
     * link, or whether it has child entries.
     */
    isUnknown() {
        return (this.#type & IFMT) === UNKNOWN;
    }
    isType(type) {
        return this[`is${type}`]();
    }
    getType() {
        return (this.isUnknown() ? 'Unknown'
            : this.isDirectory() ? 'Directory'
                : this.isFile() ? 'File'
                    : this.isSymbolicLink() ? 'SymbolicLink'
                        : this.isFIFO() ? 'FIFO'
                            : this.isCharacterDevice() ? 'CharacterDevice'
                                : this.isBlockDevice() ? 'BlockDevice'
                                    : /* c8 ignore start */ this.isSocket() ? 'Socket'
                                        : 'Unknown');
        /* c8 ignore stop */
    }
    /**
     * Is the Path a regular file?
     */
    isFile() {
        return (this.#type & IFMT) === IFREG;
    }
    /**
     * Is the Path a directory?
     */
    isDirectory() {
        return (this.#type & IFMT) === IFDIR;
    }
    /**
     * Is the path a character device?
     */
    isCharacterDevice() {
        return (this.#type & IFMT) === IFCHR;
    }
    /**
     * Is the path a block device?
     */
    isBlockDevice() {
        return (this.#type & IFMT) === IFBLK;
    }
    /**
     * Is the path a FIFO pipe?
     */
    isFIFO() {
        return (this.#type & IFMT) === IFIFO;
    }
    /**
     * Is the path a socket?
     */
    isSocket() {
        return (this.#type & IFMT) === IFSOCK;
    }
    /**
     * Is the path a symbolic link?
     */
    isSymbolicLink() {
        return (this.#type & IFLNK) === IFLNK;
    }
    /**
     * Return the entry if it has been subject of a successful lstat, or
     * undefined otherwise.
     *
     * Does not read the filesystem, so an undefined result *could* simply
     * mean that we haven't called lstat on it.
     */
    lstatCached() {
        return this.#type & LSTAT_CALLED ? this : undefined;
    }
    /**
     * Return the cached link target if the entry has been the subject of a
     * successful readlink, or undefined otherwise.
     *
     * Does not read the filesystem, so an undefined result *could* just mean we
     * don't have any cached data. Only use it if you are very sure that a
     * readlink() has been called at some point.
     */
    readlinkCached() {
        return this.#linkTarget;
    }
    /**
     * Returns the cached realpath target if the entry has been the subject
     * of a successful realpath, or undefined otherwise.
     *
     * Does not read the filesystem, so an undefined result *could* just mean we
     * don't have any cached data. Only use it if you are very sure that a
     * realpath() has been called at some point.
     */
    realpathCached() {
        return this.#realpath;
    }
    /**
     * Returns the cached child Path entries array if the entry has been the
     * subject of a successful readdir(), or [] otherwise.
     *
     * Does not read the filesystem, so an empty array *could* just mean we
     * don't have any cached data. Only use it if you are very sure that a
     * readdir() has been called recently enough to still be valid.
     */
    readdirCached() {
        const children = this.children();
        return children.slice(0, children.provisional);
    }
    /**
     * Return true if it's worth trying to readlink.  Ie, we don't (yet) have
     * any indication that readlink will definitely fail.
     *
     * Returns false if the path is known to not be a symlink, if a previous
     * readlink failed, or if the entry does not exist.
     */
    canReadlink() {
        if (this.#linkTarget)
            return true;
        if (!this.parent)
            return false;
        // cases where it cannot possibly succeed
        const ifmt = this.#type & IFMT;
        return !((ifmt !== UNKNOWN && ifmt !== IFLNK) ||
            this.#type & ENOREADLINK ||
            this.#type & ENOENT);
    }
    /**
     * Return true if readdir has previously been successfully called on this
     * path, indicating that cachedReaddir() is likely valid.
     */
    calledReaddir() {
        return !!(this.#type & READDIR_CALLED);
    }
    /**
     * Returns true if the path is known to not exist. That is, a previous lstat
     * or readdir failed to verify its existence when that would have been
     * expected, or a parent entry was marked either enoent or enotdir.
     */
    isENOENT() {
        return !!(this.#type & ENOENT);
    }
    /**
     * Return true if the path is a match for the given path name.  This handles
     * case sensitivity and unicode normalization.
     *
     * Note: even on case-sensitive systems, it is **not** safe to test the
     * equality of the `.name` property to determine whether a given pathname
     * matches, due to unicode normalization mismatches.
     *
     * Always use this method instead of testing the `path.name` property
     * directly.
     */
    isNamed(n) {
        return !this.nocase ?
            this.#matchName === normalize(n)
            : this.#matchName === normalizeNocase(n);
    }
    /**
     * Return the Path object corresponding to the target of a symbolic link.
     *
     * If the Path is not a symbolic link, or if the readlink call fails for any
     * reason, `undefined` is returned.
     *
     * Result is cached, and thus may be outdated if the filesystem is mutated.
     */
    async readlink() {
        const target = this.#linkTarget;
        if (target) {
            return target;
        }
        if (!this.canReadlink()) {
            return undefined;
        }
        /* c8 ignore start */
        // already covered by the canReadlink test, here for ts grumples
        if (!this.parent) {
            return undefined;
        }
        /* c8 ignore stop */
        try {
            const read = await this.#fs.promises.readlink(this.fullpath());
            const linkTarget = (await this.parent.realpath())?.resolve(read);
            if (linkTarget) {
                return (this.#linkTarget = linkTarget);
            }
        }
        catch (er) {
            this.#readlinkFail(er.code);
            return undefined;
        }
    }
    /**
     * Synchronous {@link PathBase.readlink}
     */
    readlinkSync() {
        const target = this.#linkTarget;
        if (target) {
            return target;
        }
        if (!this.canReadlink()) {
            return undefined;
        }
        /* c8 ignore start */
        // already covered by the canReadlink test, here for ts grumples
        if (!this.parent) {
            return undefined;
        }
        /* c8 ignore stop */
        try {
            const read = this.#fs.readlinkSync(this.fullpath());
            const linkTarget = this.parent.realpathSync()?.resolve(read);
            if (linkTarget) {
                return (this.#linkTarget = linkTarget);
            }
        }
        catch (er) {
            this.#readlinkFail(er.code);
            return undefined;
        }
    }
    #readdirSuccess(children) {
        // succeeded, mark readdir called bit
        this.#type |= READDIR_CALLED;
        // mark all remaining provisional children as ENOENT
        for (let p = children.provisional; p < children.length; p++) {
            const c = children[p];
            if (c)
                c.#markENOENT();
        }
    }
    #markENOENT() {
        // mark as UNKNOWN and ENOENT
        if (this.#type & ENOENT)
            return;
        this.#type = (this.#type | ENOENT) & IFMT_UNKNOWN;
        this.#markChildrenENOENT();
    }
    #markChildrenENOENT() {
        // all children are provisional and do not exist
        const children = this.children();
        children.provisional = 0;
        for (const p of children) {
            p.#markENOENT();
        }
    }
    #markENOREALPATH() {
        this.#type |= ENOREALPATH;
        this.#markENOTDIR();
    }
    // save the information when we know the entry is not a dir
    #markENOTDIR() {
        // entry is not a directory, so any children can't exist.
        // this *should* be impossible, since any children created
        // after it's been marked ENOTDIR should be marked ENOENT,
        // so it won't even get to this point.
        /* c8 ignore start */
        if (this.#type & ENOTDIR)
            return;
        /* c8 ignore stop */
        let t = this.#type;
        // this could happen if we stat a dir, then delete it,
        // then try to read it or one of its children.
        if ((t & IFMT) === IFDIR)
            t &= IFMT_UNKNOWN;
        this.#type = t | ENOTDIR;
        this.#markChildrenENOENT();
    }
    #readdirFail(code = '') {
        // markENOTDIR and markENOENT also set provisional=0
        if (code === 'ENOTDIR' || code === 'EPERM') {
            this.#markENOTDIR();
        }
        else if (code === 'ENOENT') {
            this.#markENOENT();
        }
        else {
            this.children().provisional = 0;
        }
    }
    #lstatFail(code = '') {
        // Windows just raises ENOENT in this case, disable for win CI
        /* c8 ignore start */
        if (code === 'ENOTDIR') {
            // already know it has a parent by this point
            const p = this.parent;
            p.#markENOTDIR();
        }
        else if (code === 'ENOENT') {
            /* c8 ignore stop */
            this.#markENOENT();
        }
    }
    #readlinkFail(code = '') {
        let ter = this.#type;
        ter |= ENOREADLINK;
        if (code === 'ENOENT')
            ter |= ENOENT;
        // windows gets a weird error when you try to readlink a file
        if (code === 'EINVAL' || code === 'UNKNOWN') {
            // exists, but not a symlink, we don't know WHAT it is, so remove
            // all IFMT bits.
            ter &= IFMT_UNKNOWN;
        }
        this.#type = ter;
        // windows just gets ENOENT in this case.  We do cover the case,
        // just disabled because it's impossible on Windows CI
        /* c8 ignore start */
        if (code === 'ENOTDIR' && this.parent) {
            this.parent.#markENOTDIR();
        }
        /* c8 ignore stop */
    }
    #readdirAddChild(e, c) {
        return (this.#readdirMaybePromoteChild(e, c) ||
            this.#readdirAddNewChild(e, c));
    }
    #readdirAddNewChild(e, c) {
        // alloc new entry at head, so it's never provisional
        const type = entToType(e);
        const child = this.newChild(e.name, type, { parent: this });
        const ifmt = child.#type & IFMT;
        if (ifmt !== IFDIR && ifmt !== IFLNK && ifmt !== UNKNOWN) {
            child.#type |= ENOTDIR;
        }
        c.unshift(child);
        c.provisional++;
        return child;
    }
    #readdirMaybePromoteChild(e, c) {
        for (let p = c.provisional; p < c.length; p++) {
            const pchild = c[p];
            const name = this.nocase ? normalizeNocase(e.name) : normalize(e.name);
            if (name !== pchild.#matchName) {
                continue;
            }
            return this.#readdirPromoteChild(e, pchild, p, c);
        }
    }
    #readdirPromoteChild(e, p, index, c) {
        const v = p.name;
        // retain any other flags, but set ifmt from dirent
        p.#type = (p.#type & IFMT_UNKNOWN) | entToType(e);
        // case sensitivity fixing when we learn the true name.
        if (v !== e.name)
            p.name = e.name;
        // just advance provisional index (potentially off the list),
        // otherwise we have to splice/pop it out and re-insert at head
        if (index !== c.provisional) {
            if (index === c.length - 1)
                c.pop();
            else
                c.splice(index, 1);
            c.unshift(p);
        }
        c.provisional++;
        return p;
    }
    /**
     * Call lstat() on this Path, and update all known information that can be
     * determined.
     *
     * Note that unlike `fs.lstat()`, the returned value does not contain some
     * information, such as `mode`, `dev`, `nlink`, and `ino`.  If that
     * information is required, you will need to call `fs.lstat` yourself.
     *
     * If the Path refers to a nonexistent file, or if the lstat call fails for
     * any reason, `undefined` is returned.  Otherwise the updated Path object is
     * returned.
     *
     * Results are cached, and thus may be out of date if the filesystem is
     * mutated.
     */
    async lstat() {
        if ((this.#type & ENOENT) === 0) {
            try {
                this.#applyStat(await this.#fs.promises.lstat(this.fullpath()));
                return this;
            }
            catch (er) {
                this.#lstatFail(er.code);
            }
        }
    }
    /**
     * synchronous {@link PathBase.lstat}
     */
    lstatSync() {
        if ((this.#type & ENOENT) === 0) {
            try {
                this.#applyStat(this.#fs.lstatSync(this.fullpath()));
                return this;
            }
            catch (er) {
                this.#lstatFail(er.code);
            }
        }
    }
    #applyStat(st) {
        const { atime, atimeMs, birthtime, birthtimeMs, blksize, blocks, ctime, ctimeMs, dev, gid, ino, mode, mtime, mtimeMs, nlink, rdev, size, uid, } = st;
        this.#atime = atime;
        this.#atimeMs = atimeMs;
        this.#birthtime = birthtime;
        this.#birthtimeMs = birthtimeMs;
        this.#blksize = blksize;
        this.#blocks = blocks;
        this.#ctime = ctime;
        this.#ctimeMs = ctimeMs;
        this.#dev = dev;
        this.#gid = gid;
        this.#ino = ino;
        this.#mode = mode;
        this.#mtime = mtime;
        this.#mtimeMs = mtimeMs;
        this.#nlink = nlink;
        this.#rdev = rdev;
        this.#size = size;
        this.#uid = uid;
        const ifmt = entToType(st);
        // retain any other flags, but set the ifmt
        this.#type = (this.#type & IFMT_UNKNOWN) | ifmt | LSTAT_CALLED;
        if (ifmt !== UNKNOWN && ifmt !== IFDIR && ifmt !== IFLNK) {
            this.#type |= ENOTDIR;
        }
    }
    #onReaddirCB = [];
    #readdirCBInFlight = false;
    #callOnReaddirCB(children) {
        this.#readdirCBInFlight = false;
        const cbs = this.#onReaddirCB.slice();
        this.#onReaddirCB.length = 0;
        cbs.forEach(cb => cb(null, children));
    }
    /**
     * Standard node-style callback interface to get list of directory entries.
     *
     * If the Path cannot or does not contain any children, then an empty array
     * is returned.
     *
     * Results are cached, and thus may be out of date if the filesystem is
     * mutated.
     *
     * @param cb The callback called with (er, entries).  Note that the `er`
     * param is somewhat extraneous, as all readdir() errors are handled and
     * simply result in an empty set of entries being returned.
     * @param allowZalgo Boolean indicating that immediately known results should
     * *not* be deferred with `queueMicrotask`. Defaults to `false`. Release
     * zalgo at your peril, the dark pony lord is devious and unforgiving.
     */
    readdirCB(cb, allowZalgo = false) {
        if (!this.canReaddir()) {
            if (allowZalgo)
                cb(null, []);
            else
                queueMicrotask(() => cb(null, []));
            return;
        }
        const children = this.children();
        if (this.calledReaddir()) {
            const c = children.slice(0, children.provisional);
            if (allowZalgo)
                cb(null, c);
            else
                queueMicrotask(() => cb(null, c));
            return;
        }
        // don't have to worry about zalgo at this point.
        this.#onReaddirCB.push(cb);
        if (this.#readdirCBInFlight) {
            return;
        }
        this.#readdirCBInFlight = true;
        // else read the directory, fill up children
        // de-provisionalize any provisional children.
        const fullpath = this.fullpath();
        this.#fs.readdir(fullpath, { withFileTypes: true }, (er, entries) => {
            if (er) {
                this.#readdirFail(er.code);
                children.provisional = 0;
            }
            else {
                // if we didn't get an error, we always get entries.
                //@ts-ignore
                for (const e of entries) {
                    this.#readdirAddChild(e, children);
                }
                this.#readdirSuccess(children);
            }
            this.#callOnReaddirCB(children.slice(0, children.provisional));
            return;
        });
    }
    #asyncReaddirInFlight;
    /**
     * Return an array of known child entries.
     *
     * If the Path cannot or does not contain any children, then an empty array
     * is returned.
     *
     * Results are cached, and thus may be out of date if the filesystem is
     * mutated.
     */
    async readdir() {
        if (!this.canReaddir()) {
            return [];
        }
        const children = this.children();
        if (this.calledReaddir()) {
            return children.slice(0, children.provisional);
        }
        // else read the directory, fill up children
        // de-provisionalize any provisional children.
        const fullpath = this.fullpath();
        if (this.#asyncReaddirInFlight) {
            await this.#asyncReaddirInFlight;
        }
        else {
            /* c8 ignore start */
            let resolve = () => { };
            /* c8 ignore stop */
            this.#asyncReaddirInFlight = new Promise(res => (resolve = res));
            try {
                for (const e of await this.#fs.promises.readdir(fullpath, {
                    withFileTypes: true,
                })) {
                    this.#readdirAddChild(e, children);
                }
                this.#readdirSuccess(children);
            }
            catch (er) {
                this.#readdirFail(er.code);
                children.provisional = 0;
            }
            this.#asyncReaddirInFlight = undefined;
            resolve();
        }
        return children.slice(0, children.provisional);
    }
    /**
     * synchronous {@link PathBase.readdir}
     */
    readdirSync() {
        if (!this.canReaddir()) {
            return [];
        }
        const children = this.children();
        if (this.calledReaddir()) {
            return children.slice(0, children.provisional);
        }
        // else read the directory, fill up children
        // de-provisionalize any provisional children.
        const fullpath = this.fullpath();
        try {
            for (const e of this.#fs.readdirSync(fullpath, {
                withFileTypes: true,
            })) {
                this.#readdirAddChild(e, children);
            }
            this.#readdirSuccess(children);
        }
        catch (er) {
            this.#readdirFail(er.code);
            children.provisional = 0;
        }
        return children.slice(0, children.provisional);
    }
    canReaddir() {
        if (this.#type & ENOCHILD)
            return false;
        const ifmt = IFMT & this.#type;
        // we always set ENOTDIR when setting IFMT, so should be impossible
        /* c8 ignore start */
        if (!(ifmt === UNKNOWN || ifmt === IFDIR || ifmt === IFLNK)) {
            return false;
        }
        /* c8 ignore stop */
        return true;
    }
    shouldWalk(dirs, walkFilter) {
        return ((this.#type & IFDIR) === IFDIR &&
            !(this.#type & ENOCHILD) &&
            !dirs.has(this) &&
            (!walkFilter || walkFilter(this)));
    }
    /**
     * Return the Path object corresponding to path as resolved
     * by realpath(3).
     *
     * If the realpath call fails for any reason, `undefined` is returned.
     *
     * Result is cached, and thus may be outdated if the filesystem is mutated.
     * On success, returns a Path object.
     */
    async realpath() {
        if (this.#realpath)
            return this.#realpath;
        if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
            return undefined;
        try {
            const rp = await this.#fs.promises.realpath(this.fullpath());
            return (this.#realpath = this.resolve(rp));
        }
        catch (_) {
            this.#markENOREALPATH();
        }
    }
    /**
     * Synchronous {@link realpath}
     */
    realpathSync() {
        if (this.#realpath)
            return this.#realpath;
        if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
            return undefined;
        try {
            const rp = this.#fs.realpathSync(this.fullpath());
            return (this.#realpath = this.resolve(rp));
        }
        catch (_) {
            this.#markENOREALPATH();
        }
    }
    /**
     * Internal method to mark this Path object as the scurry cwd,
     * called by {@link PathScurry#chdir}
     *
     * @internal
     */
    [setAsCwd](oldCwd) {
        if (oldCwd === this)
            return;
        oldCwd.isCWD = false;
        this.isCWD = true;
        const changed = new Set([]);
        let rp = [];
        let p = this;
        while (p && p.parent) {
            changed.add(p);
            p.#relative = rp.join(this.sep);
            p.#relativePosix = rp.join('/');
            p = p.parent;
            rp.push('..');
        }
        // now un-memoize parents of old cwd
        p = oldCwd;
        while (p && p.parent && !changed.has(p)) {
            p.#relative = undefined;
            p.#relativePosix = undefined;
            p = p.parent;
        }
    }
}
/**
 * Path class used on win32 systems
 *
 * Uses `'\\'` as the path separator for returned paths, either `'\\'` or `'/'`
 * as the path separator for parsing paths.
 */
class PathWin32 extends PathBase {
    /**
     * Separator for generating path strings.
     */
    sep = '\\';
    /**
     * Separator for parsing path strings.
     */
    splitSep = eitherSep;
    /**
     * Do not create new Path objects directly.  They should always be accessed
     * via the PathScurry class or other methods on the Path class.
     *
     * @internal
     */
    constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
        super(name, type, root, roots, nocase, children, opts);
    }
    /**
     * @internal
     */
    newChild(name, type = UNKNOWN, opts = {}) {
        return new PathWin32(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
    }
    /**
     * @internal
     */
    getRootString(path) {
        return win32.parse(path).root;
    }
    /**
     * @internal
     */
    getRoot(rootPath) {
        rootPath = uncToDrive(rootPath.toUpperCase());
        if (rootPath === this.root.name) {
            return this.root;
        }
        // ok, not that one, check if it matches another we know about
        for (const [compare, root] of Object.entries(this.roots)) {
            if (this.sameRoot(rootPath, compare)) {
                return (this.roots[rootPath] = root);
            }
        }
        // otherwise, have to create a new one.
        return (this.roots[rootPath] = new PathScurryWin32(rootPath, this).root);
    }
    /**
     * @internal
     */
    sameRoot(rootPath, compare = this.root.name) {
        // windows can (rarely) have case-sensitive filesystem, but
        // UNC and drive letters are always case-insensitive, and canonically
        // represented uppercase.
        rootPath = rootPath
            .toUpperCase()
            .replace(/\//g, '\\')
            .replace(uncDriveRegexp, '$1\\');
        return rootPath === compare;
    }
}
/**
 * Path class used on all posix systems.
 *
 * Uses `'/'` as the path separator.
 */
class PathPosix extends PathBase {
    /**
     * separator for parsing path strings
     */
    splitSep = '/';
    /**
     * separator for generating path strings
     */
    sep = '/';
    /**
     * Do not create new Path objects directly.  They should always be accessed
     * via the PathScurry class or other methods on the Path class.
     *
     * @internal
     */
    constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
        super(name, type, root, roots, nocase, children, opts);
    }
    /**
     * @internal
     */
    getRootString(path) {
        return path.startsWith('/') ? '/' : '';
    }
    /**
     * @internal
     */
    getRoot(_rootPath) {
        return this.root;
    }
    /**
     * @internal
     */
    newChild(name, type = UNKNOWN, opts = {}) {
        return new PathPosix(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
    }
}
/**
 * The base class for all PathScurry classes, providing the interface for path
 * resolution and filesystem operations.
 *
 * Typically, you should *not* instantiate this class directly, but rather one
 * of the platform-specific classes, or the exported {@link PathScurry} which
 * defaults to the current platform.
 */
class PathScurryBase {
    /**
     * The root Path entry for the current working directory of this Scurry
     */
    root;
    /**
     * The string path for the root of this Scurry's current working directory
     */
    rootPath;
    /**
     * A collection of all roots encountered, referenced by rootPath
     */
    roots;
    /**
     * The Path entry corresponding to this PathScurry's current working directory.
     */
    cwd;
    #resolveCache;
    #resolvePosixCache;
    #children;
    /**
     * Perform path comparisons case-insensitively.
     *
     * Defaults true on Darwin and Windows systems, false elsewhere.
     */
    nocase;
    #fs;
    /**
     * This class should not be instantiated directly.
     *
     * Use PathScurryWin32, PathScurryDarwin, PathScurryPosix, or PathScurry
     *
     * @internal
     */
    constructor(cwd = process.cwd(), pathImpl, sep, { nocase, childrenCacheSize = 16 * 1024, fs = defaultFS, } = {}) {
        this.#fs = fsFromOption(fs);
        if (cwd instanceof URL || cwd.startsWith('file://')) {
            cwd = fileURLToPath(cwd);
        }
        // resolve and split root, and then add to the store.
        // this is the only time we call path.resolve()
        const cwdPath = pathImpl.resolve(cwd);
        this.roots = Object.create(null);
        this.rootPath = this.parseRootPath(cwdPath);
        this.#resolveCache = new ResolveCache();
        this.#resolvePosixCache = new ResolveCache();
        this.#children = new ChildrenCache(childrenCacheSize);
        const split = cwdPath.substring(this.rootPath.length).split(sep);
        // resolve('/') leaves '', splits to [''], we don't want that.
        if (split.length === 1 && !split[0]) {
            split.pop();
        }
        /* c8 ignore start */
        if (nocase === undefined) {
            throw new TypeError('must provide nocase setting to PathScurryBase ctor');
        }
        /* c8 ignore stop */
        this.nocase = nocase;
        this.root = this.newRoot(this.#fs);
        this.roots[this.rootPath] = this.root;
        let prev = this.root;
        let len = split.length - 1;
        const joinSep = pathImpl.sep;
        let abs = this.rootPath;
        let sawFirst = false;
        for (const part of split) {
            const l = len--;
            prev = prev.child(part, {
                relative: new Array(l).fill('..').join(joinSep),
                relativePosix: new Array(l).fill('..').join('/'),
                fullpath: (abs += (sawFirst ? '' : joinSep) + part),
            });
            sawFirst = true;
        }
        this.cwd = prev;
    }
    /**
     * Get the depth of a provided path, string, or the cwd
     */
    depth(path = this.cwd) {
        if (typeof path === 'string') {
            path = this.cwd.resolve(path);
        }
        return path.depth();
    }
    /**
     * Return the cache of child entries.  Exposed so subclasses can create
     * child Path objects in a platform-specific way.
     *
     * @internal
     */
    childrenCache() {
        return this.#children;
    }
    /**
     * Resolve one or more path strings to a resolved string
     *
     * Same interface as require('path').resolve.
     *
     * Much faster than path.resolve() when called multiple times for the same
     * path, because the resolved Path objects are cached.  Much slower
     * otherwise.
     */
    resolve(...paths) {
        // first figure out the minimum number of paths we have to test
        // we always start at cwd, but any absolutes will bump the start
        let r = '';
        for (let i = paths.length - 1; i >= 0; i--) {
            const p = paths[i];
            if (!p || p === '.')
                continue;
            r = r ? `${p}/${r}` : p;
            if (this.isAbsolute(p)) {
                break;
            }
        }
        const cached = this.#resolveCache.get(r);
        if (cached !== undefined) {
            return cached;
        }
        const result = this.cwd.resolve(r).fullpath();
        this.#resolveCache.set(r, result);
        return result;
    }
    /**
     * Resolve one or more path strings to a resolved string, returning
     * the posix path.  Identical to .resolve() on posix systems, but on
     * windows will return a forward-slash separated UNC path.
     *
     * Same interface as require('path').resolve.
     *
     * Much faster than path.resolve() when called multiple times for the same
     * path, because the resolved Path objects are cached.  Much slower
     * otherwise.
     */
    resolvePosix(...paths) {
        // first figure out the minimum number of paths we have to test
        // we always start at cwd, but any absolutes will bump the start
        let r = '';
        for (let i = paths.length - 1; i >= 0; i--) {
            const p = paths[i];
            if (!p || p === '.')
                continue;
            r = r ? `${p}/${r}` : p;
            if (this.isAbsolute(p)) {
                break;
            }
        }
        const cached = this.#resolvePosixCache.get(r);
        if (cached !== undefined) {
            return cached;
        }
        const result = this.cwd.resolve(r).fullpathPosix();
        this.#resolvePosixCache.set(r, result);
        return result;
    }
    /**
     * find the relative path from the cwd to the supplied path string or entry
     */
    relative(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return entry.relative();
    }
    /**
     * find the relative path from the cwd to the supplied path string or
     * entry, using / as the path delimiter, even on Windows.
     */
    relativePosix(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return entry.relativePosix();
    }
    /**
     * Return the basename for the provided string or Path object
     */
    basename(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return entry.name;
    }
    /**
     * Return the dirname for the provided string or Path object
     */
    dirname(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return (entry.parent || entry).fullpath();
    }
    async readdir(entry = this.cwd, opts = {
        withFileTypes: true,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes } = opts;
        if (!entry.canReaddir()) {
            return [];
        }
        else {
            const p = await entry.readdir();
            return withFileTypes ? p : p.map(e => e.name);
        }
    }
    readdirSync(entry = this.cwd, opts = {
        withFileTypes: true,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true } = opts;
        if (!entry.canReaddir()) {
            return [];
        }
        else if (withFileTypes) {
            return entry.readdirSync();
        }
        else {
            return entry.readdirSync().map(e => e.name);
        }
    }
    /**
     * Call lstat() on the string or Path object, and update all known
     * information that can be determined.
     *
     * Note that unlike `fs.lstat()`, the returned value does not contain some
     * information, such as `mode`, `dev`, `nlink`, and `ino`.  If that
     * information is required, you will need to call `fs.lstat` yourself.
     *
     * If the Path refers to a nonexistent file, or if the lstat call fails for
     * any reason, `undefined` is returned.  Otherwise the updated Path object is
     * returned.
     *
     * Results are cached, and thus may be out of date if the filesystem is
     * mutated.
     */
    async lstat(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return entry.lstat();
    }
    /**
     * synchronous {@link PathScurryBase.lstat}
     */
    lstatSync(entry = this.cwd) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        return entry.lstatSync();
    }
    async readlink(entry = this.cwd, { withFileTypes } = {
        withFileTypes: false,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            withFileTypes = entry.withFileTypes;
            entry = this.cwd;
        }
        const e = await entry.readlink();
        return withFileTypes ? e : e?.fullpath();
    }
    readlinkSync(entry = this.cwd, { withFileTypes } = {
        withFileTypes: false,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            withFileTypes = entry.withFileTypes;
            entry = this.cwd;
        }
        const e = entry.readlinkSync();
        return withFileTypes ? e : e?.fullpath();
    }
    async realpath(entry = this.cwd, { withFileTypes } = {
        withFileTypes: false,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            withFileTypes = entry.withFileTypes;
            entry = this.cwd;
        }
        const e = await entry.realpath();
        return withFileTypes ? e : e?.fullpath();
    }
    realpathSync(entry = this.cwd, { withFileTypes } = {
        withFileTypes: false,
    }) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            withFileTypes = entry.withFileTypes;
            entry = this.cwd;
        }
        const e = entry.realpathSync();
        return withFileTypes ? e : e?.fullpath();
    }
    async walk(entry = this.cwd, opts = {}) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true, follow = false, filter, walkFilter, } = opts;
        const results = [];
        if (!filter || filter(entry)) {
            results.push(withFileTypes ? entry : entry.fullpath());
        }
        const dirs = new Set();
        const walk = (dir, cb) => {
            dirs.add(dir);
            dir.readdirCB((er, entries) => {
                /* c8 ignore start */
                if (er) {
                    return cb(er);
                }
                /* c8 ignore stop */
                let len = entries.length;
                if (!len)
                    return cb();
                const next = () => {
                    if (--len === 0) {
                        cb();
                    }
                };
                for (const e of entries) {
                    if (!filter || filter(e)) {
                        results.push(withFileTypes ? e : e.fullpath());
                    }
                    if (follow && e.isSymbolicLink()) {
                        e.realpath()
                            .then(r => (r?.isUnknown() ? r.lstat() : r))
                            .then(r => r?.shouldWalk(dirs, walkFilter) ? walk(r, next) : next());
                    }
                    else {
                        if (e.shouldWalk(dirs, walkFilter)) {
                            walk(e, next);
                        }
                        else {
                            next();
                        }
                    }
                }
            }, true); // zalgooooooo
        };
        const start = entry;
        return new Promise((res, rej) => {
            walk(start, er => {
                /* c8 ignore start */
                if (er)
                    return rej(er);
                /* c8 ignore stop */
                res(results);
            });
        });
    }
    walkSync(entry = this.cwd, opts = {}) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true, follow = false, filter, walkFilter, } = opts;
        const results = [];
        if (!filter || filter(entry)) {
            results.push(withFileTypes ? entry : entry.fullpath());
        }
        const dirs = new Set([entry]);
        for (const dir of dirs) {
            const entries = dir.readdirSync();
            for (const e of entries) {
                if (!filter || filter(e)) {
                    results.push(withFileTypes ? e : e.fullpath());
                }
                let r = e;
                if (e.isSymbolicLink()) {
                    if (!(follow && (r = e.realpathSync())))
                        continue;
                    if (r.isUnknown())
                        r.lstatSync();
                }
                if (r.shouldWalk(dirs, walkFilter)) {
                    dirs.add(r);
                }
            }
        }
        return results;
    }
    /**
     * Support for `for await`
     *
     * Alias for {@link PathScurryBase.iterate}
     *
     * Note: As of Node 19, this is very slow, compared to other methods of
     * walking.  Consider using {@link PathScurryBase.stream} if memory overhead
     * and backpressure are concerns, or {@link PathScurryBase.walk} if not.
     */
    [Symbol.asyncIterator]() {
        return this.iterate();
    }
    iterate(entry = this.cwd, options = {}) {
        // iterating async over the stream is significantly more performant,
        // especially in the warm-cache scenario, because it buffers up directory
        // entries in the background instead of waiting for a yield for each one.
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            options = entry;
            entry = this.cwd;
        }
        return this.stream(entry, options)[Symbol.asyncIterator]();
    }
    /**
     * Iterating over a PathScurry performs a synchronous walk.
     *
     * Alias for {@link PathScurryBase.iterateSync}
     */
    [Symbol.iterator]() {
        return this.iterateSync();
    }
    *iterateSync(entry = this.cwd, opts = {}) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true, follow = false, filter, walkFilter, } = opts;
        if (!filter || filter(entry)) {
            yield withFileTypes ? entry : entry.fullpath();
        }
        const dirs = new Set([entry]);
        for (const dir of dirs) {
            const entries = dir.readdirSync();
            for (const e of entries) {
                if (!filter || filter(e)) {
                    yield withFileTypes ? e : e.fullpath();
                }
                let r = e;
                if (e.isSymbolicLink()) {
                    if (!(follow && (r = e.realpathSync())))
                        continue;
                    if (r.isUnknown())
                        r.lstatSync();
                }
                if (r.shouldWalk(dirs, walkFilter)) {
                    dirs.add(r);
                }
            }
        }
    }
    stream(entry = this.cwd, opts = {}) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true, follow = false, filter, walkFilter, } = opts;
        const results = new Minipass({ objectMode: true });
        if (!filter || filter(entry)) {
            results.write(withFileTypes ? entry : entry.fullpath());
        }
        const dirs = new Set();
        const queue = [entry];
        let processing = 0;
        const process = () => {
            let paused = false;
            while (!paused) {
                const dir = queue.shift();
                if (!dir) {
                    if (processing === 0)
                        results.end();
                    return;
                }
                processing++;
                dirs.add(dir);
                const onReaddir = (er, entries, didRealpaths = false) => {
                    /* c8 ignore start */
                    if (er)
                        return results.emit('error', er);
                    /* c8 ignore stop */
                    if (follow && !didRealpaths) {
                        const promises = [];
                        for (const e of entries) {
                            if (e.isSymbolicLink()) {
                                promises.push(e
                                    .realpath()
                                    .then((r) => r?.isUnknown() ? r.lstat() : r));
                            }
                        }
                        if (promises.length) {
                            Promise.all(promises).then(() => onReaddir(null, entries, true));
                            return;
                        }
                    }
                    for (const e of entries) {
                        if (e && (!filter || filter(e))) {
                            if (!results.write(withFileTypes ? e : e.fullpath())) {
                                paused = true;
                            }
                        }
                    }
                    processing--;
                    for (const e of entries) {
                        const r = e.realpathCached() || e;
                        if (r.shouldWalk(dirs, walkFilter)) {
                            queue.push(r);
                        }
                    }
                    if (paused && !results.flowing) {
                        results.once('drain', process);
                    }
                    else if (!sync) {
                        process();
                    }
                };
                // zalgo containment
                let sync = true;
                dir.readdirCB(onReaddir, true);
                sync = false;
            }
        };
        process();
        return results;
    }
    streamSync(entry = this.cwd, opts = {}) {
        if (typeof entry === 'string') {
            entry = this.cwd.resolve(entry);
        }
        else if (!(entry instanceof PathBase)) {
            opts = entry;
            entry = this.cwd;
        }
        const { withFileTypes = true, follow = false, filter, walkFilter, } = opts;
        const results = new Minipass({ objectMode: true });
        const dirs = new Set();
        if (!filter || filter(entry)) {
            results.write(withFileTypes ? entry : entry.fullpath());
        }
        const queue = [entry];
        let processing = 0;
        const process = () => {
            let paused = false;
            while (!paused) {
                const dir = queue.shift();
                if (!dir) {
                    if (processing === 0)
                        results.end();
                    return;
                }
                processing++;
                dirs.add(dir);
                const entries = dir.readdirSync();
                for (const e of entries) {
                    if (!filter || filter(e)) {
                        if (!results.write(withFileTypes ? e : e.fullpath())) {
                            paused = true;
                        }
                    }
                }
                processing--;
                for (const e of entries) {
                    let r = e;
                    if (e.isSymbolicLink()) {
                        if (!(follow && (r = e.realpathSync())))
                            continue;
                        if (r.isUnknown())
                            r.lstatSync();
                    }
                    if (r.shouldWalk(dirs, walkFilter)) {
                        queue.push(r);
                    }
                }
            }
            if (paused && !results.flowing)
                results.once('drain', process);
        };
        process();
        return results;
    }
    chdir(path = this.cwd) {
        const oldCwd = this.cwd;
        this.cwd = typeof path === 'string' ? this.cwd.resolve(path) : path;
        this.cwd[setAsCwd](oldCwd);
    }
}
/**
 * Windows implementation of {@link PathScurryBase}
 *
 * Defaults to case insensitve, uses `'\\'` to generate path strings.  Uses
 * {@link PathWin32} for Path objects.
 */
class PathScurryWin32 extends PathScurryBase {
    /**
     * separator for generating path strings
     */
    sep = '\\';
    constructor(cwd = process.cwd(), opts = {}) {
        const { nocase = true } = opts;
        super(cwd, win32, '\\', { ...opts, nocase });
        this.nocase = nocase;
        for (let p = this.cwd; p; p = p.parent) {
            p.nocase = this.nocase;
        }
    }
    /**
     * @internal
     */
    parseRootPath(dir) {
        // if the path starts with a single separator, it's not a UNC, and we'll
        // just get separator as the root, and driveFromUNC will return \
        // In that case, mount \ on the root from the cwd.
        return win32.parse(dir).root.toUpperCase();
    }
    /**
     * @internal
     */
    newRoot(fs) {
        return new PathWin32(this.rootPath, IFDIR, undefined, this.roots, this.nocase, this.childrenCache(), { fs });
    }
    /**
     * Return true if the provided path string is an absolute path
     */
    isAbsolute(p) {
        return (p.startsWith('/') || p.startsWith('\\') || /^[a-z]:(\/|\\)/i.test(p));
    }
}
/**
 * {@link PathScurryBase} implementation for all posix systems other than Darwin.
 *
 * Defaults to case-sensitive matching, uses `'/'` to generate path strings.
 *
 * Uses {@link PathPosix} for Path objects.
 */
class PathScurryPosix extends PathScurryBase {
    /**
     * separator for generating path strings
     */
    sep = '/';
    constructor(cwd = process.cwd(), opts = {}) {
        const { nocase = false } = opts;
        super(cwd, posix, '/', { ...opts, nocase });
        this.nocase = nocase;
    }
    /**
     * @internal
     */
    parseRootPath(_dir) {
        return '/';
    }
    /**
     * @internal
     */
    newRoot(fs) {
        return new PathPosix(this.rootPath, IFDIR, undefined, this.roots, this.nocase, this.childrenCache(), { fs });
    }
    /**
     * Return true if the provided path string is an absolute path
     */
    isAbsolute(p) {
        return p.startsWith('/');
    }
}
/**
 * {@link PathScurryBase} implementation for Darwin (macOS) systems.
 *
 * Defaults to case-insensitive matching, uses `'/'` for generating path
 * strings.
 *
 * Uses {@link PathPosix} for Path objects.
 */
class PathScurryDarwin extends PathScurryPosix {
    constructor(cwd = process.cwd(), opts = {}) {
        const { nocase = true } = opts;
        super(cwd, { ...opts, nocase });
    }
}
/**
 * Default {@link PathBase} implementation for the current platform.
 *
 * {@link PathWin32} on Windows systems, {@link PathPosix} on all others.
 */
process.platform === 'win32' ? PathWin32 : PathPosix;
/**
 * Default {@link PathScurryBase} implementation for the current platform.
 *
 * {@link PathScurryWin32} on Windows systems, {@link PathScurryDarwin} on
 * Darwin (macOS) systems, {@link PathScurryPosix} on all others.
 */
const PathScurry = process.platform === 'win32' ? PathScurryWin32
    : process.platform === 'darwin' ? PathScurryDarwin
        : PathScurryPosix;

// this is just a very light wrapper around 2 arrays with an offset index
const isPatternList = (pl) => pl.length >= 1;
const isGlobList = (gl) => gl.length >= 1;
/**
 * An immutable-ish view on an array of glob parts and their parsed
 * results
 */
class Pattern {
    #patternList;
    #globList;
    #index;
    length;
    #platform;
    #rest;
    #globString;
    #isDrive;
    #isUNC;
    #isAbsolute;
    #followGlobstar = true;
    constructor(patternList, globList, index, platform) {
        if (!isPatternList(patternList)) {
            throw new TypeError('empty pattern list');
        }
        if (!isGlobList(globList)) {
            throw new TypeError('empty glob list');
        }
        if (globList.length !== patternList.length) {
            throw new TypeError('mismatched pattern list and glob list lengths');
        }
        this.length = patternList.length;
        if (index < 0 || index >= this.length) {
            throw new TypeError('index out of range');
        }
        this.#patternList = patternList;
        this.#globList = globList;
        this.#index = index;
        this.#platform = platform;
        // normalize root entries of absolute patterns on initial creation.
        if (this.#index === 0) {
            // c: => ['c:/']
            // C:/ => ['C:/']
            // C:/x => ['C:/', 'x']
            // //host/share => ['//host/share/']
            // //host/share/ => ['//host/share/']
            // //host/share/x => ['//host/share/', 'x']
            // /etc => ['/', 'etc']
            // / => ['/']
            if (this.isUNC()) {
                // '' / '' / 'host' / 'share'
                const [p0, p1, p2, p3, ...prest] = this.#patternList;
                const [g0, g1, g2, g3, ...grest] = this.#globList;
                if (prest[0] === '') {
                    // ends in /
                    prest.shift();
                    grest.shift();
                }
                const p = [p0, p1, p2, p3, ''].join('/');
                const g = [g0, g1, g2, g3, ''].join('/');
                this.#patternList = [p, ...prest];
                this.#globList = [g, ...grest];
                this.length = this.#patternList.length;
            }
            else if (this.isDrive() || this.isAbsolute()) {
                const [p1, ...prest] = this.#patternList;
                const [g1, ...grest] = this.#globList;
                if (prest[0] === '') {
                    // ends in /
                    prest.shift();
                    grest.shift();
                }
                const p = p1 + '/';
                const g = g1 + '/';
                this.#patternList = [p, ...prest];
                this.#globList = [g, ...grest];
                this.length = this.#patternList.length;
            }
        }
    }
    /**
     * The first entry in the parsed list of patterns
     */
    pattern() {
        return this.#patternList[this.#index];
    }
    /**
     * true of if pattern() returns a string
     */
    isString() {
        return typeof this.#patternList[this.#index] === 'string';
    }
    /**
     * true of if pattern() returns GLOBSTAR
     */
    isGlobstar() {
        return this.#patternList[this.#index] === GLOBSTAR;
    }
    /**
     * true if pattern() returns a regexp
     */
    isRegExp() {
        return this.#patternList[this.#index] instanceof RegExp;
    }
    /**
     * The /-joined set of glob parts that make up this pattern
     */
    globString() {
        return (this.#globString =
            this.#globString ||
                (this.#index === 0 ?
                    this.isAbsolute() ?
                        this.#globList[0] + this.#globList.slice(1).join('/')
                        : this.#globList.join('/')
                    : this.#globList.slice(this.#index).join('/')));
    }
    /**
     * true if there are more pattern parts after this one
     */
    hasMore() {
        return this.length > this.#index + 1;
    }
    /**
     * The rest of the pattern after this part, or null if this is the end
     */
    rest() {
        if (this.#rest !== undefined)
            return this.#rest;
        if (!this.hasMore())
            return (this.#rest = null);
        this.#rest = new Pattern(this.#patternList, this.#globList, this.#index + 1, this.#platform);
        this.#rest.#isAbsolute = this.#isAbsolute;
        this.#rest.#isUNC = this.#isUNC;
        this.#rest.#isDrive = this.#isDrive;
        return this.#rest;
    }
    /**
     * true if the pattern represents a //unc/path/ on windows
     */
    isUNC() {
        const pl = this.#patternList;
        return this.#isUNC !== undefined ?
            this.#isUNC
            : (this.#isUNC =
                this.#platform === 'win32' &&
                    this.#index === 0 &&
                    pl[0] === '' &&
                    pl[1] === '' &&
                    typeof pl[2] === 'string' &&
                    !!pl[2] &&
                    typeof pl[3] === 'string' &&
                    !!pl[3]);
    }
    // pattern like C:/...
    // split = ['C:', ...]
    // XXX: would be nice to handle patterns like `c:*` to test the cwd
    // in c: for *, but I don't know of a way to even figure out what that
    // cwd is without actually chdir'ing into it?
    /**
     * True if the pattern starts with a drive letter on Windows
     */
    isDrive() {
        const pl = this.#patternList;
        return this.#isDrive !== undefined ?
            this.#isDrive
            : (this.#isDrive =
                this.#platform === 'win32' &&
                    this.#index === 0 &&
                    this.length > 1 &&
                    typeof pl[0] === 'string' &&
                    /^[a-z]:$/i.test(pl[0]));
    }
    // pattern = '/' or '/...' or '/x/...'
    // split = ['', ''] or ['', ...] or ['', 'x', ...]
    // Drive and UNC both considered absolute on windows
    /**
     * True if the pattern is rooted on an absolute path
     */
    isAbsolute() {
        const pl = this.#patternList;
        return this.#isAbsolute !== undefined ?
            this.#isAbsolute
            : (this.#isAbsolute =
                (pl[0] === '' && pl.length > 1) ||
                    this.isDrive() ||
                    this.isUNC());
    }
    /**
     * consume the root of the pattern, and return it
     */
    root() {
        const p = this.#patternList[0];
        return (typeof p === 'string' && this.isAbsolute() && this.#index === 0) ?
            p
            : '';
    }
    /**
     * Check to see if the current globstar pattern is allowed to follow
     * a symbolic link.
     */
    checkFollowGlobstar() {
        return !(this.#index === 0 ||
            !this.isGlobstar() ||
            !this.#followGlobstar);
    }
    /**
     * Mark that the current globstar pattern is following a symbolic link
     */
    markFollowGlobstar() {
        if (this.#index === 0 || !this.isGlobstar() || !this.#followGlobstar)
            return false;
        this.#followGlobstar = false;
        return true;
    }
}

// give it a pattern, and it'll be able to tell you if
// a given path should be ignored.
// Ignoring a path ignores its children if the pattern ends in /**
// Ignores are always parsed in dot:true mode
const defaultPlatform$1 = (typeof process === 'object' &&
    process &&
    typeof process.platform === 'string') ?
    process.platform
    : 'linux';
/**
 * Class used to process ignored patterns
 */
class Ignore {
    relative;
    relativeChildren;
    absolute;
    absoluteChildren;
    platform;
    mmopts;
    constructor(ignored, { nobrace, nocase, noext, noglobstar, platform = defaultPlatform$1, }) {
        this.relative = [];
        this.absolute = [];
        this.relativeChildren = [];
        this.absoluteChildren = [];
        this.platform = platform;
        this.mmopts = {
            dot: true,
            nobrace,
            nocase,
            noext,
            noglobstar,
            optimizationLevel: 2,
            platform,
            nocomment: true,
            nonegate: true,
        };
        for (const ign of ignored)
            this.add(ign);
    }
    add(ign) {
        // this is a little weird, but it gives us a clean set of optimized
        // minimatch matchers, without getting tripped up if one of them
        // ends in /** inside a brace section, and it's only inefficient at
        // the start of the walk, not along it.
        // It'd be nice if the Pattern class just had a .test() method, but
        // handling globstars is a bit of a pita, and that code already lives
        // in minimatch anyway.
        // Another way would be if maybe Minimatch could take its set/globParts
        // as an option, and then we could at least just use Pattern to test
        // for absolute-ness.
        // Yet another way, Minimatch could take an array of glob strings, and
        // a cwd option, and do the right thing.
        const mm = new Minimatch(ign, this.mmopts);
        for (let i = 0; i < mm.set.length; i++) {
            const parsed = mm.set[i];
            const globParts = mm.globParts[i];
            /* c8 ignore start */
            if (!parsed || !globParts) {
                throw new Error('invalid pattern object');
            }
            // strip off leading ./ portions
            // https://github.com/isaacs/node-glob/issues/570
            while (parsed[0] === '.' && globParts[0] === '.') {
                parsed.shift();
                globParts.shift();
            }
            /* c8 ignore stop */
            const p = new Pattern(parsed, globParts, 0, this.platform);
            const m = new Minimatch(p.globString(), this.mmopts);
            const children = globParts[globParts.length - 1] === '**';
            const absolute = p.isAbsolute();
            if (absolute)
                this.absolute.push(m);
            else
                this.relative.push(m);
            if (children) {
                if (absolute)
                    this.absoluteChildren.push(m);
                else
                    this.relativeChildren.push(m);
            }
        }
    }
    ignored(p) {
        const fullpath = p.fullpath();
        const fullpaths = `${fullpath}/`;
        const relative = p.relative() || '.';
        const relatives = `${relative}/`;
        for (const m of this.relative) {
            if (m.match(relative) || m.match(relatives))
                return true;
        }
        for (const m of this.absolute) {
            if (m.match(fullpath) || m.match(fullpaths))
                return true;
        }
        return false;
    }
    childrenIgnored(p) {
        const fullpath = p.fullpath() + '/';
        const relative = (p.relative() || '.') + '/';
        for (const m of this.relativeChildren) {
            if (m.match(relative))
                return true;
        }
        for (const m of this.absoluteChildren) {
            if (m.match(fullpath))
                return true;
        }
        return false;
    }
}

// synchronous utility for filtering entries and calculating subwalks
/**
 * A cache of which patterns have been processed for a given Path
 */
class HasWalkedCache {
    store;
    constructor(store = new Map()) {
        this.store = store;
    }
    copy() {
        return new HasWalkedCache(new Map(this.store));
    }
    hasWalked(target, pattern) {
        return this.store.get(target.fullpath())?.has(pattern.globString());
    }
    storeWalked(target, pattern) {
        const fullpath = target.fullpath();
        const cached = this.store.get(fullpath);
        if (cached)
            cached.add(pattern.globString());
        else
            this.store.set(fullpath, new Set([pattern.globString()]));
    }
}
/**
 * A record of which paths have been matched in a given walk step,
 * and whether they only are considered a match if they are a directory,
 * and whether their absolute or relative path should be returned.
 */
class MatchRecord {
    store = new Map();
    add(target, absolute, ifDir) {
        const n = (absolute ? 2 : 0) | (ifDir ? 1 : 0);
        const current = this.store.get(target);
        this.store.set(target, current === undefined ? n : n & current);
    }
    // match, absolute, ifdir
    entries() {
        return [...this.store.entries()].map(([path, n]) => [
            path,
            !!(n & 2),
            !!(n & 1),
        ]);
    }
}
/**
 * A collection of patterns that must be processed in a subsequent step
 * for a given path.
 */
class SubWalks {
    store = new Map();
    add(target, pattern) {
        if (!target.canReaddir()) {
            return;
        }
        const subs = this.store.get(target);
        if (subs) {
            if (!subs.find(p => p.globString() === pattern.globString())) {
                subs.push(pattern);
            }
        }
        else
            this.store.set(target, [pattern]);
    }
    get(target) {
        const subs = this.store.get(target);
        /* c8 ignore start */
        if (!subs) {
            throw new Error('attempting to walk unknown path');
        }
        /* c8 ignore stop */
        return subs;
    }
    entries() {
        return this.keys().map(k => [k, this.store.get(k)]);
    }
    keys() {
        return [...this.store.keys()].filter(t => t.canReaddir());
    }
}
/**
 * The class that processes patterns for a given path.
 *
 * Handles child entry filtering, and determining whether a path's
 * directory contents must be read.
 */
class Processor {
    hasWalkedCache;
    matches = new MatchRecord();
    subwalks = new SubWalks();
    patterns;
    follow;
    dot;
    opts;
    constructor(opts, hasWalkedCache) {
        this.opts = opts;
        this.follow = !!opts.follow;
        this.dot = !!opts.dot;
        this.hasWalkedCache =
            hasWalkedCache ? hasWalkedCache.copy() : new HasWalkedCache();
    }
    processPatterns(target, patterns) {
        this.patterns = patterns;
        const processingSet = patterns.map(p => [target, p]);
        // map of paths to the magic-starting subwalks they need to walk
        // first item in patterns is the filter
        for (let [t, pattern] of processingSet) {
            this.hasWalkedCache.storeWalked(t, pattern);
            const root = pattern.root();
            const absolute = pattern.isAbsolute() && this.opts.absolute !== false;
            // start absolute patterns at root
            if (root) {
                t = t.resolve(root === '/' && this.opts.root !== undefined ?
                    this.opts.root
                    : root);
                const rest = pattern.rest();
                if (!rest) {
                    this.matches.add(t, true, false);
                    continue;
                }
                else {
                    pattern = rest;
                }
            }
            if (t.isENOENT())
                continue;
            let p;
            let rest;
            let changed = false;
            while (typeof (p = pattern.pattern()) === 'string' &&
                (rest = pattern.rest())) {
                const c = t.resolve(p);
                t = c;
                pattern = rest;
                changed = true;
            }
            p = pattern.pattern();
            rest = pattern.rest();
            if (changed) {
                if (this.hasWalkedCache.hasWalked(t, pattern))
                    continue;
                this.hasWalkedCache.storeWalked(t, pattern);
            }
            // now we have either a final string for a known entry,
            // more strings for an unknown entry,
            // or a pattern starting with magic, mounted on t.
            if (typeof p === 'string') {
                // must not be final entry, otherwise we would have
                // concatenated it earlier.
                const ifDir = p === '..' || p === '' || p === '.';
                this.matches.add(t.resolve(p), absolute, ifDir);
                continue;
            }
            else if (p === GLOBSTAR) {
                // if no rest, match and subwalk pattern
                // if rest, process rest and subwalk pattern
                // if it's a symlink, but we didn't get here by way of a
                // globstar match (meaning it's the first time THIS globstar
                // has traversed a symlink), then we follow it. Otherwise, stop.
                if (!t.isSymbolicLink() ||
                    this.follow ||
                    pattern.checkFollowGlobstar()) {
                    this.subwalks.add(t, pattern);
                }
                const rp = rest?.pattern();
                const rrest = rest?.rest();
                if (!rest || ((rp === '' || rp === '.') && !rrest)) {
                    // only HAS to be a dir if it ends in **/ or **/.
                    // but ending in ** will match files as well.
                    this.matches.add(t, absolute, rp === '' || rp === '.');
                }
                else {
                    if (rp === '..') {
                        // this would mean you're matching **/.. at the fs root,
                        // and no thanks, I'm not gonna test that specific case.
                        /* c8 ignore start */
                        const tp = t.parent || t;
                        /* c8 ignore stop */
                        if (!rrest)
                            this.matches.add(tp, absolute, true);
                        else if (!this.hasWalkedCache.hasWalked(tp, rrest)) {
                            this.subwalks.add(tp, rrest);
                        }
                    }
                }
            }
            else if (p instanceof RegExp) {
                this.subwalks.add(t, pattern);
            }
        }
        return this;
    }
    subwalkTargets() {
        return this.subwalks.keys();
    }
    child() {
        return new Processor(this.opts, this.hasWalkedCache);
    }
    // return a new Processor containing the subwalks for each
    // child entry, and a set of matches, and
    // a hasWalkedCache that's a copy of this one
    // then we're going to call
    filterEntries(parent, entries) {
        const patterns = this.subwalks.get(parent);
        // put matches and entry walks into the results processor
        const results = this.child();
        for (const e of entries) {
            for (const pattern of patterns) {
                const absolute = pattern.isAbsolute();
                const p = pattern.pattern();
                const rest = pattern.rest();
                if (p === GLOBSTAR) {
                    results.testGlobstar(e, pattern, rest, absolute);
                }
                else if (p instanceof RegExp) {
                    results.testRegExp(e, p, rest, absolute);
                }
                else {
                    results.testString(e, p, rest, absolute);
                }
            }
        }
        return results;
    }
    testGlobstar(e, pattern, rest, absolute) {
        if (this.dot || !e.name.startsWith('.')) {
            if (!pattern.hasMore()) {
                this.matches.add(e, absolute, false);
            }
            if (e.canReaddir()) {
                // if we're in follow mode or it's not a symlink, just keep
                // testing the same pattern. If there's more after the globstar,
                // then this symlink consumes the globstar. If not, then we can
                // follow at most ONE symlink along the way, so we mark it, which
                // also checks to ensure that it wasn't already marked.
                if (this.follow || !e.isSymbolicLink()) {
                    this.subwalks.add(e, pattern);
                }
                else if (e.isSymbolicLink()) {
                    if (rest && pattern.checkFollowGlobstar()) {
                        this.subwalks.add(e, rest);
                    }
                    else if (pattern.markFollowGlobstar()) {
                        this.subwalks.add(e, pattern);
                    }
                }
            }
        }
        // if the NEXT thing matches this entry, then also add
        // the rest.
        if (rest) {
            const rp = rest.pattern();
            if (typeof rp === 'string' &&
                // dots and empty were handled already
                rp !== '..' &&
                rp !== '' &&
                rp !== '.') {
                this.testString(e, rp, rest.rest(), absolute);
            }
            else if (rp === '..') {
                /* c8 ignore start */
                const ep = e.parent || e;
                /* c8 ignore stop */
                this.subwalks.add(ep, rest);
            }
            else if (rp instanceof RegExp) {
                this.testRegExp(e, rp, rest.rest(), absolute);
            }
        }
    }
    testRegExp(e, p, rest, absolute) {
        if (!p.test(e.name))
            return;
        if (!rest) {
            this.matches.add(e, absolute, false);
        }
        else {
            this.subwalks.add(e, rest);
        }
    }
    testString(e, p, rest, absolute) {
        // should never happen?
        if (!e.isNamed(p))
            return;
        if (!rest) {
            this.matches.add(e, absolute, false);
        }
        else {
            this.subwalks.add(e, rest);
        }
    }
}

/**
 * Single-use utility classes to provide functionality to the {@link Glob}
 * methods.
 *
 * @module
 */
const makeIgnore = (ignore, opts) => typeof ignore === 'string' ? new Ignore([ignore], opts)
    : Array.isArray(ignore) ? new Ignore(ignore, opts)
        : ignore;
/**
 * basic walking utilities that all the glob walker types use
 */
class GlobUtil {
    path;
    patterns;
    opts;
    seen = new Set();
    paused = false;
    aborted = false;
    #onResume = [];
    #ignore;
    #sep;
    signal;
    maxDepth;
    includeChildMatches;
    constructor(patterns, path, opts) {
        this.patterns = patterns;
        this.path = path;
        this.opts = opts;
        this.#sep = !opts.posix && opts.platform === 'win32' ? '\\' : '/';
        this.includeChildMatches = opts.includeChildMatches !== false;
        if (opts.ignore || !this.includeChildMatches) {
            this.#ignore = makeIgnore(opts.ignore ?? [], opts);
            if (!this.includeChildMatches &&
                typeof this.#ignore.add !== 'function') {
                const m = 'cannot ignore child matches, ignore lacks add() method.';
                throw new Error(m);
            }
        }
        // ignore, always set with maxDepth, but it's optional on the
        // GlobOptions type
        /* c8 ignore start */
        this.maxDepth = opts.maxDepth || Infinity;
        /* c8 ignore stop */
        if (opts.signal) {
            this.signal = opts.signal;
            this.signal.addEventListener('abort', () => {
                this.#onResume.length = 0;
            });
        }
    }
    #ignored(path) {
        return this.seen.has(path) || !!this.#ignore?.ignored?.(path);
    }
    #childrenIgnored(path) {
        return !!this.#ignore?.childrenIgnored?.(path);
    }
    // backpressure mechanism
    pause() {
        this.paused = true;
    }
    resume() {
        /* c8 ignore start */
        if (this.signal?.aborted)
            return;
        /* c8 ignore stop */
        this.paused = false;
        let fn = undefined;
        while (!this.paused && (fn = this.#onResume.shift())) {
            fn();
        }
    }
    onResume(fn) {
        if (this.signal?.aborted)
            return;
        /* c8 ignore start */
        if (!this.paused) {
            fn();
        }
        else {
            /* c8 ignore stop */
            this.#onResume.push(fn);
        }
    }
    // do the requisite realpath/stat checking, and return the path
    // to add or undefined to filter it out.
    async matchCheck(e, ifDir) {
        if (ifDir && this.opts.nodir)
            return undefined;
        let rpc;
        if (this.opts.realpath) {
            rpc = e.realpathCached() || (await e.realpath());
            if (!rpc)
                return undefined;
            e = rpc;
        }
        const needStat = e.isUnknown() || this.opts.stat;
        const s = needStat ? await e.lstat() : e;
        if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
            const target = await s.realpath();
            /* c8 ignore start */
            if (target && (target.isUnknown() || this.opts.stat)) {
                await target.lstat();
            }
            /* c8 ignore stop */
        }
        return this.matchCheckTest(s, ifDir);
    }
    matchCheckTest(e, ifDir) {
        return (e &&
            (this.maxDepth === Infinity || e.depth() <= this.maxDepth) &&
            (!ifDir || e.canReaddir()) &&
            (!this.opts.nodir || !e.isDirectory()) &&
            (!this.opts.nodir ||
                !this.opts.follow ||
                !e.isSymbolicLink() ||
                !e.realpathCached()?.isDirectory()) &&
            !this.#ignored(e)) ?
            e
            : undefined;
    }
    matchCheckSync(e, ifDir) {
        if (ifDir && this.opts.nodir)
            return undefined;
        let rpc;
        if (this.opts.realpath) {
            rpc = e.realpathCached() || e.realpathSync();
            if (!rpc)
                return undefined;
            e = rpc;
        }
        const needStat = e.isUnknown() || this.opts.stat;
        const s = needStat ? e.lstatSync() : e;
        if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
            const target = s.realpathSync();
            if (target && (target?.isUnknown() || this.opts.stat)) {
                target.lstatSync();
            }
        }
        return this.matchCheckTest(s, ifDir);
    }
    matchFinish(e, absolute) {
        if (this.#ignored(e))
            return;
        // we know we have an ignore if this is false, but TS doesn't
        if (!this.includeChildMatches && this.#ignore?.add) {
            const ign = `${e.relativePosix()}/**`;
            this.#ignore.add(ign);
        }
        const abs = this.opts.absolute === undefined ? absolute : this.opts.absolute;
        this.seen.add(e);
        const mark = this.opts.mark && e.isDirectory() ? this.#sep : '';
        // ok, we have what we need!
        if (this.opts.withFileTypes) {
            this.matchEmit(e);
        }
        else if (abs) {
            const abs = this.opts.posix ? e.fullpathPosix() : e.fullpath();
            this.matchEmit(abs + mark);
        }
        else {
            const rel = this.opts.posix ? e.relativePosix() : e.relative();
            const pre = this.opts.dotRelative && !rel.startsWith('..' + this.#sep) ?
                '.' + this.#sep
                : '';
            this.matchEmit(!rel ? '.' + mark : pre + rel + mark);
        }
    }
    async match(e, absolute, ifDir) {
        const p = await this.matchCheck(e, ifDir);
        if (p)
            this.matchFinish(p, absolute);
    }
    matchSync(e, absolute, ifDir) {
        const p = this.matchCheckSync(e, ifDir);
        if (p)
            this.matchFinish(p, absolute);
    }
    walkCB(target, patterns, cb) {
        /* c8 ignore start */
        if (this.signal?.aborted)
            cb();
        /* c8 ignore stop */
        this.walkCB2(target, patterns, new Processor(this.opts), cb);
    }
    walkCB2(target, patterns, processor, cb) {
        if (this.#childrenIgnored(target))
            return cb();
        if (this.signal?.aborted)
            cb();
        if (this.paused) {
            this.onResume(() => this.walkCB2(target, patterns, processor, cb));
            return;
        }
        processor.processPatterns(target, patterns);
        // done processing.  all of the above is sync, can be abstracted out.
        // subwalks is a map of paths to the entry filters they need
        // matches is a map of paths to [absolute, ifDir] tuples.
        let tasks = 1;
        const next = () => {
            if (--tasks === 0)
                cb();
        };
        for (const [m, absolute, ifDir] of processor.matches.entries()) {
            if (this.#ignored(m))
                continue;
            tasks++;
            this.match(m, absolute, ifDir).then(() => next());
        }
        for (const t of processor.subwalkTargets()) {
            if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
                continue;
            }
            tasks++;
            const childrenCached = t.readdirCached();
            if (t.calledReaddir())
                this.walkCB3(t, childrenCached, processor, next);
            else {
                t.readdirCB((_, entries) => this.walkCB3(t, entries, processor, next), true);
            }
        }
        next();
    }
    walkCB3(target, entries, processor, cb) {
        processor = processor.filterEntries(target, entries);
        let tasks = 1;
        const next = () => {
            if (--tasks === 0)
                cb();
        };
        for (const [m, absolute, ifDir] of processor.matches.entries()) {
            if (this.#ignored(m))
                continue;
            tasks++;
            this.match(m, absolute, ifDir).then(() => next());
        }
        for (const [target, patterns] of processor.subwalks.entries()) {
            tasks++;
            this.walkCB2(target, patterns, processor.child(), next);
        }
        next();
    }
    walkCBSync(target, patterns, cb) {
        /* c8 ignore start */
        if (this.signal?.aborted)
            cb();
        /* c8 ignore stop */
        this.walkCB2Sync(target, patterns, new Processor(this.opts), cb);
    }
    walkCB2Sync(target, patterns, processor, cb) {
        if (this.#childrenIgnored(target))
            return cb();
        if (this.signal?.aborted)
            cb();
        if (this.paused) {
            this.onResume(() => this.walkCB2Sync(target, patterns, processor, cb));
            return;
        }
        processor.processPatterns(target, patterns);
        // done processing.  all of the above is sync, can be abstracted out.
        // subwalks is a map of paths to the entry filters they need
        // matches is a map of paths to [absolute, ifDir] tuples.
        let tasks = 1;
        const next = () => {
            if (--tasks === 0)
                cb();
        };
        for (const [m, absolute, ifDir] of processor.matches.entries()) {
            if (this.#ignored(m))
                continue;
            this.matchSync(m, absolute, ifDir);
        }
        for (const t of processor.subwalkTargets()) {
            if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
                continue;
            }
            tasks++;
            const children = t.readdirSync();
            this.walkCB3Sync(t, children, processor, next);
        }
        next();
    }
    walkCB3Sync(target, entries, processor, cb) {
        processor = processor.filterEntries(target, entries);
        let tasks = 1;
        const next = () => {
            if (--tasks === 0)
                cb();
        };
        for (const [m, absolute, ifDir] of processor.matches.entries()) {
            if (this.#ignored(m))
                continue;
            this.matchSync(m, absolute, ifDir);
        }
        for (const [target, patterns] of processor.subwalks.entries()) {
            tasks++;
            this.walkCB2Sync(target, patterns, processor.child(), next);
        }
        next();
    }
}
class GlobWalker extends GlobUtil {
    matches = new Set();
    constructor(patterns, path, opts) {
        super(patterns, path, opts);
    }
    matchEmit(e) {
        this.matches.add(e);
    }
    async walk() {
        if (this.signal?.aborted)
            throw this.signal.reason;
        if (this.path.isUnknown()) {
            await this.path.lstat();
        }
        await new Promise((res, rej) => {
            this.walkCB(this.path, this.patterns, () => {
                if (this.signal?.aborted) {
                    rej(this.signal.reason);
                }
                else {
                    res(this.matches);
                }
            });
        });
        return this.matches;
    }
    walkSync() {
        if (this.signal?.aborted)
            throw this.signal.reason;
        if (this.path.isUnknown()) {
            this.path.lstatSync();
        }
        // nothing for the callback to do, because this never pauses
        this.walkCBSync(this.path, this.patterns, () => {
            if (this.signal?.aborted)
                throw this.signal.reason;
        });
        return this.matches;
    }
}
class GlobStream extends GlobUtil {
    results;
    constructor(patterns, path, opts) {
        super(patterns, path, opts);
        this.results = new Minipass({
            signal: this.signal,
            objectMode: true,
        });
        this.results.on('drain', () => this.resume());
        this.results.on('resume', () => this.resume());
    }
    matchEmit(e) {
        this.results.write(e);
        if (!this.results.flowing)
            this.pause();
    }
    stream() {
        const target = this.path;
        if (target.isUnknown()) {
            target.lstat().then(() => {
                this.walkCB(target, this.patterns, () => this.results.end());
            });
        }
        else {
            this.walkCB(target, this.patterns, () => this.results.end());
        }
        return this.results;
    }
    streamSync() {
        if (this.path.isUnknown()) {
            this.path.lstatSync();
        }
        this.walkCBSync(this.path, this.patterns, () => this.results.end());
        return this.results;
    }
}

// if no process global, just call it linux.
// so we default to case-sensitive, / separators
const defaultPlatform = (typeof process === 'object' &&
    process &&
    typeof process.platform === 'string') ?
    process.platform
    : 'linux';
/**
 * An object that can perform glob pattern traversals.
 */
class Glob {
    absolute;
    cwd;
    root;
    dot;
    dotRelative;
    follow;
    ignore;
    magicalBraces;
    mark;
    matchBase;
    maxDepth;
    nobrace;
    nocase;
    nodir;
    noext;
    noglobstar;
    pattern;
    platform;
    realpath;
    scurry;
    stat;
    signal;
    windowsPathsNoEscape;
    withFileTypes;
    includeChildMatches;
    /**
     * The options provided to the constructor.
     */
    opts;
    /**
     * An array of parsed immutable {@link Pattern} objects.
     */
    patterns;
    /**
     * All options are stored as properties on the `Glob` object.
     *
     * See {@link GlobOptions} for full options descriptions.
     *
     * Note that a previous `Glob` object can be passed as the
     * `GlobOptions` to another `Glob` instantiation to re-use settings
     * and caches with a new pattern.
     *
     * Traversal functions can be called multiple times to run the walk
     * again.
     */
    constructor(pattern, opts) {
        /* c8 ignore start */
        if (!opts)
            throw new TypeError('glob options required');
        /* c8 ignore stop */
        this.withFileTypes = !!opts.withFileTypes;
        this.signal = opts.signal;
        this.follow = !!opts.follow;
        this.dot = !!opts.dot;
        this.dotRelative = !!opts.dotRelative;
        this.nodir = !!opts.nodir;
        this.mark = !!opts.mark;
        if (!opts.cwd) {
            this.cwd = '';
        }
        else if (opts.cwd instanceof URL || opts.cwd.startsWith('file://')) {
            opts.cwd = fileURLToPath(opts.cwd);
        }
        this.cwd = opts.cwd || '';
        this.root = opts.root;
        this.magicalBraces = !!opts.magicalBraces;
        this.nobrace = !!opts.nobrace;
        this.noext = !!opts.noext;
        this.realpath = !!opts.realpath;
        this.absolute = opts.absolute;
        this.includeChildMatches = opts.includeChildMatches !== false;
        this.noglobstar = !!opts.noglobstar;
        this.matchBase = !!opts.matchBase;
        this.maxDepth =
            typeof opts.maxDepth === 'number' ? opts.maxDepth : Infinity;
        this.stat = !!opts.stat;
        this.ignore = opts.ignore;
        if (this.withFileTypes && this.absolute !== undefined) {
            throw new Error('cannot set absolute and withFileTypes:true');
        }
        if (typeof pattern === 'string') {
            pattern = [pattern];
        }
        this.windowsPathsNoEscape =
            !!opts.windowsPathsNoEscape ||
                opts.allowWindowsEscape ===
                    false;
        if (this.windowsPathsNoEscape) {
            pattern = pattern.map(p => p.replace(/\\/g, '/'));
        }
        if (this.matchBase) {
            if (opts.noglobstar) {
                throw new TypeError('base matching requires globstar');
            }
            pattern = pattern.map(p => (p.includes('/') ? p : `./**/${p}`));
        }
        this.pattern = pattern;
        this.platform = opts.platform || defaultPlatform;
        this.opts = { ...opts, platform: this.platform };
        if (opts.scurry) {
            this.scurry = opts.scurry;
            if (opts.nocase !== undefined &&
                opts.nocase !== opts.scurry.nocase) {
                throw new Error('nocase option contradicts provided scurry option');
            }
        }
        else {
            const Scurry = opts.platform === 'win32' ? PathScurryWin32
                : opts.platform === 'darwin' ? PathScurryDarwin
                    : opts.platform ? PathScurryPosix
                        : PathScurry;
            this.scurry = new Scurry(this.cwd, {
                nocase: opts.nocase,
                fs: opts.fs,
            });
        }
        this.nocase = this.scurry.nocase;
        // If you do nocase:true on a case-sensitive file system, then
        // we need to use regexps instead of strings for non-magic
        // path portions, because statting `aBc` won't return results
        // for the file `AbC` for example.
        const nocaseMagicOnly = this.platform === 'darwin' || this.platform === 'win32';
        const mmo = {
            // default nocase based on platform
            ...opts,
            dot: this.dot,
            matchBase: this.matchBase,
            nobrace: this.nobrace,
            nocase: this.nocase,
            nocaseMagicOnly,
            nocomment: true,
            noext: this.noext,
            nonegate: true,
            optimizationLevel: 2,
            platform: this.platform,
            windowsPathsNoEscape: this.windowsPathsNoEscape,
            debug: !!this.opts.debug,
        };
        const mms = this.pattern.map(p => new Minimatch(p, mmo));
        const [matchSet, globParts] = mms.reduce((set, m) => {
            set[0].push(...m.set);
            set[1].push(...m.globParts);
            return set;
        }, [[], []]);
        this.patterns = matchSet.map((set, i) => {
            const g = globParts[i];
            /* c8 ignore start */
            if (!g)
                throw new Error('invalid pattern object');
            /* c8 ignore stop */
            return new Pattern(set, g, 0, this.platform);
        });
    }
    async walk() {
        // Walkers always return array of Path objects, so we just have to
        // coerce them into the right shape.  It will have already called
        // realpath() if the option was set to do so, so we know that's cached.
        // start out knowing the cwd, at least
        return [
            ...(await new GlobWalker(this.patterns, this.scurry.cwd, {
                ...this.opts,
                maxDepth: this.maxDepth !== Infinity ?
                    this.maxDepth + this.scurry.cwd.depth()
                    : Infinity,
                platform: this.platform,
                nocase: this.nocase,
                includeChildMatches: this.includeChildMatches,
            }).walk()),
        ];
    }
    walkSync() {
        return [
            ...new GlobWalker(this.patterns, this.scurry.cwd, {
                ...this.opts,
                maxDepth: this.maxDepth !== Infinity ?
                    this.maxDepth + this.scurry.cwd.depth()
                    : Infinity,
                platform: this.platform,
                nocase: this.nocase,
                includeChildMatches: this.includeChildMatches,
            }).walkSync(),
        ];
    }
    stream() {
        return new GlobStream(this.patterns, this.scurry.cwd, {
            ...this.opts,
            maxDepth: this.maxDepth !== Infinity ?
                this.maxDepth + this.scurry.cwd.depth()
                : Infinity,
            platform: this.platform,
            nocase: this.nocase,
            includeChildMatches: this.includeChildMatches,
        }).stream();
    }
    streamSync() {
        return new GlobStream(this.patterns, this.scurry.cwd, {
            ...this.opts,
            maxDepth: this.maxDepth !== Infinity ?
                this.maxDepth + this.scurry.cwd.depth()
                : Infinity,
            platform: this.platform,
            nocase: this.nocase,
            includeChildMatches: this.includeChildMatches,
        }).streamSync();
    }
    /**
     * Default sync iteration function. Returns a Generator that
     * iterates over the results.
     */
    iterateSync() {
        return this.streamSync()[Symbol.iterator]();
    }
    [Symbol.iterator]() {
        return this.iterateSync();
    }
    /**
     * Default async iteration function. Returns an AsyncGenerator that
     * iterates over the results.
     */
    iterate() {
        return this.stream()[Symbol.asyncIterator]();
    }
    [Symbol.asyncIterator]() {
        return this.iterate();
    }
}

/**
 * Return true if the patterns provided contain any magic glob characters,
 * given the options provided.
 *
 * Brace expansion is not considered "magic" unless the `magicalBraces` option
 * is set, as brace expansion just turns one string into an array of strings.
 * So a pattern like `'x{a,b}y'` would return `false`, because `'xay'` and
 * `'xby'` both do not contain any magic glob characters, and it's treated the
 * same as if you had called it on `['xay', 'xby']`. When `magicalBraces:true`
 * is in the options, brace expansion _is_ treated as a pattern having magic.
 */
const hasMagic = (pattern, options = {}) => {
    if (!Array.isArray(pattern)) {
        pattern = [pattern];
    }
    for (const p of pattern) {
        if (new Minimatch(p, options).hasMagic())
            return true;
    }
    return false;
};

function globStreamSync(pattern, options = {}) {
    return new Glob(pattern, options).streamSync();
}
function globStream(pattern, options = {}) {
    return new Glob(pattern, options).stream();
}
function globSync(pattern, options = {}) {
    return new Glob(pattern, options).walkSync();
}
async function glob_(pattern, options = {}) {
    return new Glob(pattern, options).walk();
}
function globIterateSync(pattern, options = {}) {
    return new Glob(pattern, options).iterateSync();
}
function globIterate(pattern, options = {}) {
    return new Glob(pattern, options).iterate();
}
// aliases: glob.sync.stream() glob.stream.sync() glob.sync() etc
const streamSync = globStreamSync;
const stream = Object.assign(globStream, { sync: globStreamSync });
const iterateSync = globIterateSync;
const iterate = Object.assign(globIterate, {
    sync: globIterateSync,
});
const sync = Object.assign(globSync, {
    stream: globStreamSync,
    iterate: globIterateSync,
});
const glob = Object.assign(glob_, {
    glob: glob_,
    globSync,
    sync,
    globStream,
    stream,
    globStreamSync,
    streamSync,
    globIterate,
    iterate,
    globIterateSync,
    iterateSync,
    Glob,
    hasMagic,
    escape,
    unescape,
});
glob.glob = glob;

/**
 * @const
 * @default
 * @readonly
 * @type {string}
 */
const DEFAULT_EXTENSION = 'glsl';
/**
 * @const
 * @default
 * @readonly
 * @type {readonly RegExp[]}
 */
const DEFAULT_SHADERS = Object.freeze(['**/*.wgsl']);
/**
 * @function
 * @name wgsl
 * @description Plugin entry point to import,
 * inline, (and compress) WGSL shader files
 *
 * @see {@link https://vitejs.dev/guide/api-plugin.html}
 * @link https://github.com/UstymUkhman/vite-plugin-glsl
 *
 * @param {PluginOptions} options Plugin config object
 *
 * @returns {Plugin} Vite plugin that converts shader code
 */
function wgsl({ include = DEFAULT_SHADERS, exclude = undefined, warnDuplicatedImports = true, defaultExtension = DEFAULT_EXTENSION, compress = false, watch = true, root = '/', } = {}) {
    process.env.NODE_ENV === 'production';
    const filter = /.+\.wgsl/;
    return {
        enforce: 'pre',
        name: 'vite-plugin-glsl',
        configureServer(devServer) {
        },
        configResolved(resolvedConfig) {
        },
        transform(source, shader, ...other) {
            if (!filter.test(shader))
                return;
            globalThis.GPUShaderStage = {
                VERTEX: 1,
                FRAGMENT: 2,
                COMPUTE: 4,
            };
            const files = globSync([...include, '!node_modules'].filter(Boolean), {
                ignore: exclude,
                absolute: true,
            });
            const fileMap = {};
            for (const file of files) {
                fileMap[file] = readFileSync(file, 'utf8');
            }
            const registary = new ModuleRegistry({
                wgsl: fileMap,
            });
            registary._parseSrc({});
            const resp = registary.findTextModule(shader.replace(/^\//, ''));
            if (!resp) {
                throw Error(`no wgsl file found with the path of ${shader}`);
            }
            const m = registary.link(resp.name);
            // console.log(registary);
            const outputShader = m;
            console.log({ outputShader });
            // console.log(
            // 	JSON.stringify({ transform: { source, shader, other } }, null, 2),
            // );
            if (!filter.test(shader))
                return;
            globalThis.GPUShaderStage = {
                VERTEX: 1,
                FRAGMENT: 2,
                COMPUTE: 4,
            };
            // const { dependentChunks, outputShader } = loadShader(source, shader, {
            // 	warnDuplicatedImports,
            // 	defaultExtension,
            // 	compress,
            // 	root,
            // } as any);
            // const { moduleGraph } = server ?? {};
            // const module = moduleGraph?.getModuleById(shader);
            // const chunks = Array.from(dependentChunks.values()).flat();
            // if (watch && module && !prod) {
            // 	if (!chunks.length) module.isSelfAccepting = true;
            // 	else {
            // 		const imported = new Set();
            // 		chunks.forEach((chunk) =>
            // 			imported.add(moduleGraph!.createFileOnlyEntry(chunk)),
            // 		);
            // 		moduleGraph!.updateModuleInfo(
            // 			module,
            // 			imported as any,
            // 			null,
            // 			new Set(),
            // 			null,
            // 			true,
            // 		);
            // 	}
            // }
            const makeShaderDataDefinitions$1 = makeShaderDataDefinitions;
            const definitions = makeShaderDataDefinitions$1(outputShader.replace(/(^|\s)override/g, 'const'));
            return {
                code: `export const code = \`${outputShader}\`;\n\nexport const definitions = ${JSON.stringify(definitions)};\n\nexport default code`,
                map: null,
                data: {
                    code: outputShader,
                    definitions,
                },
            };
        },
    };
}

const vPlugin = wgsl();
if (vPlugin.configResolved) {
    vPlugin.configResolved({
        build: {
            sourcemap: false,
        },
    });
}
const testImportModuleSpecifier = (moduleName) => {
    return moduleName.endsWith('.wgsl');
};
const testImportAttributes = (importAttributes) => importAttributes.type === 'wgsl';
const generateTypeScriptDefinition = (_fileName, _importAttributes, code) => {
    console.error('is this where it fails');
    console.error(JSON.stringify({ code, _fileName }));
    console.error(JSON.stringify(vPlugin));
    const result = vPlugin.transform(code, _fileName);
    console.error(JSON.stringify(result));
    return `
    export const code: string;
    export const definitions: ${JSON.stringify(result.data.definitions)};
    
    export default code;
    `;
};

export { generateTypeScriptDefinition, testImportAttributes, testImportModuleSpecifier };
