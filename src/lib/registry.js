import jsonFormatter from '../tools/json-formatter.js';
import base64 from '../tools/base64.js';
import timestamp from '../tools/timestamp.js';
import uuid from '../tools/uuid.js';
import urlEncode from '../tools/url-encode.js';
import hash from '../tools/hash.js';
import regexTester from '../tools/regex-tester.js';
import colorPicker from '../tools/color-picker.js';
import calcPad from '../tools/calc-pad.js';
import settings from '../tools/settings.js';
import pdfTools from '../tools/pdf-tools.js';
import naming from '../tools/naming.js';
import translator from '../tools/translator.js';
import hostManager from '../tools/host-manager.js';
import { computePinyin } from './pinyin.js';

function precompute(raw) {
  return raw.map((t) => {
    const lower = t.name.toLowerCase();
    const { full: pinyinFull, initials: pinyinInit } = computePinyin(t.name);
    const kwLower = t.keywords.map((k) => k.toLowerCase());
    const kwPinyin = t.keywords.map((k) => computePinyin(k));
    return {
      ...t,
      _lower: lower,
      _pinyinFull: pinyinFull,
      _pinyinInit: pinyinInit,
      _kwLower: kwLower,
      _kwPinyinFull: kwPinyin.map((p) => p.full),
      _kwPinyinInit: kwPinyin.map((p) => p.initials),
    };
  });
}

const tools = precompute([
  jsonFormatter,
  base64,
  timestamp,
  uuid,
  urlEncode,
  hash,
  regexTester,
  colorPicker,
  calcPad,
  settings,
  pdfTools,
  naming,
  translator,
  hostManager,
]);

function matchTool(t, q) {
  if (t._lower.includes(q) || t.id.includes(q)) return true;
  if (t._pinyinFull.includes(q) || t._pinyinInit.includes(q)) return true;
  for (let i = 0; i < t._kwLower.length; i++) {
    if (t._kwLower[i].includes(q)) return true;
    if (t._kwPinyinFull[i].includes(q)) return true;
    if (t._kwPinyinInit[i].includes(q)) return true;
  }
  return false;
}

export function getAllTools() {
  return tools;
}

export function searchTools(query) {
  if (!query.trim()) return tools;
  const q = query.toLowerCase();
  return tools.filter((t) => matchTool(t, q));
}

export function getTool(id) {
  return tools.find((t) => t.id === id);
}
