import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* ================================================================
 *  CẤU HÌNH
 * ================================================================ */
const PORT = 3000;
const ADMIN_ID = "@cskhgiabao";

const API_URL_HU  = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";
const API_URL_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

const DATA_DIR = "./data";
const REBUILD_EVERY = 20;

const normalizeResult = (score) => (score >= 11 ? "TAI" : "XIU");
const flip = (r) => (r === "TAI" ? "XIU" : "TAI");
const toSeq = (records) => records.map(r => (r.result === "TAI" ? "B" : "T"));

/* ================================================================
 *  PARSE
 * ================================================================ */
function parseTxt(content) {
  const records = [];
  const re =
    /^\s*\d+\s+(\d+)\s+(TAI|XIU)\s+\[(\d+),(\d+),(\d+)\]\s+(\d+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    records.push({
      session: +m[1],
      result: m[2],
      dice: [+m[3], +m[4], +m[5]],
      score: +m[6],
      time: m[7],
      hour: +m[7].slice(11, 13),
    });
  }
  return records;
}

function loadBootstrapData(folder = DATA_DIR) {
  if (!fs.existsSync(folder)) return [];
  const files = fs.readdirSync(folder).filter(f => f.endsWith(".txt")).sort();
  let all = [];
  for (const f of files) {
    const recs = parseTxt(fs.readFileSync(path.join(folder, f), "utf8"));
    all.push(...recs);
    console.log(`📂 Bootstrap ${f}: ${recs.length} phiên`);
  }
  const map = new Map();
  for (const r of all) map.set(r.session, r);
  return [...map.values()].sort((a, b) => a.session - b.session);
}

function parseApiRecord(item) {
  const score = item.point;
  const timeStr = item.time || item.created_at || "";
  const hour = timeStr ? +timeStr.slice(11, 13) : 0;
  return {
    session: item.id,
    result: normalizeResult(score),
    dice: item.dices,
    score,
    time: timeStr,
    hour,
  };
}

/* ================================================================
 *  NAME PATTERN
 * ================================================================ */
function blocksOf(pat) {
  const b = []; let c = 1;
  for (let i = 1; i < pat.length; i++) {
    if (pat[i] === pat[i - 1]) c++;
    else { b.push(c); c = 1; }
  }
  b.push(c); return b;
}
const isPalindrome = s => s === s.split("").reverse().join("");
const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function namePattern(pat) {
  if (!pat) return "RỖNG";
  const b = blocksOf(pat);
  const L = pat.length;
  const tag = b.join("-");

  if (b.length === 1) return `BỆT-${L}`;
  if (isPalindrome(pat) && L >= 4) return `ĐX-${L}`;
  if (L >= 4 && L % 2 === 0) {
    const h = L / 2;
    if (pat.slice(0, h) === pat.slice(h).split("").reverse().join(""))
      return `MIRROR-${L}`;
  }
  for (const k of [2, 3, 4, 5]) {
    if (L >= k * 2 && L % k === 0) {
      const unit = pat.slice(0, k);
      if (pat === unit.repeat(L / k)) return `CHUKỲ-${L}(k=${k})`;
    }
  }
  if (/^(BT)+B?$/.test(pat) || /^(TB)+T?$/.test(pat)) return `SOLE-${L}`;
  if (/^(BBTT)+B{0,2}$/.test(pat) || /^(TTBB)+T{0,2}$/.test(pat)) return `GẤPĐÔI-${L}`;
  if (/^(BBBTTT)+B{0,3}$/.test(pat) || /^(TTTBBB)+T{0,3}$/.test(pat)) return `GẤPBA-${L}`;

  const fibo = [1, 1, 2, 3, 5, 8, 13];
  if (eqArr(b, fibo.slice(0, b.length)) && b.length >= 3) return `FIBO-${L}`;

  if (b.length >= 3) {
    const tang = b.every((v, i) => i === 0 || v === b[i - 1] + 1);
    const giam = b.every((v, i) => i === 0 || v === b[i - 1] - 1);
    if (tang && b[b.length - 1] <= 5) return `THANG↑-${L}`;
    if (giam && b[0] <= 5) return `THANG↓-${L}`;
  }
  if (b.length === 4 && b[0] + 1 === b[1] && b[1] === b[2] && b[2] + 1 === b[3])
    return `THANGKÉP-${L}`;
  if (b.length === 3 && b[0] === b[2] && b[1] > b[0]) return `NGHIÊNG-${tag}`;
  if (b.length === 3 && b[0] === 1 && b[2] === 1) return `KẸP-${tag}`;
  if (b.length === 3 && b[0] === 2 && b[2] === 2) return `KẸPĐÔI-${tag}`;
  if (b.length === 3 && b[0] < b[1] && b[1] < b[2]) return `TAMGIÁC↑-${tag}`;
  if (b.length === 3 && b[0] > b[1] && b[1] > b[2]) return `TAMGIÁC↓-${tag}`;
  if (L >= 6 && L % 2 === 0) {
    const head = pat.slice(0, 2);
    let xoay = true;
    for (let i = 2; i < L; i += 2)
      if (pat.slice(i, i + 2) !== head) { xoay = false; break; }
    if (xoay) return `XOAY-${L}`;
  }
  if (L >= 6 && /^(B{4,}|T{4,})(B|T)/.test(pat)) return `BỆT-GÃY-${L}`;
  if (/^(BT)+(B|T)(BT)+$/.test(pat)) return `SOLE-GÃY-${L}`;
  if (L >= 6 && pat.slice(0, 3) === pat.slice(-3) && !isPalindrome(pat))
    return `NGHIÊNG-GÃY-${L}`;
  if (/^(B{3,}|T{3,})(BT)+/.test(pat)) return `BỆT-SOLE-${L}`;
  if (/^(BT)+(B{3,}|T{3,})/.test(pat)) return `SOLE-BỆT-${L}`;
  if (/^(BTT|TBB)(B{3,}|T{3,})/.test(pat)) return `KẸP-BỆT-${L}`;
  if (/^(B{3,}|T{3,})(BTT|TBB)/.test(pat)) return `BỆT-KẸP-${L}`;
  if (/^((BB|TT)(B|T)){2,}/.test(pat)) return `ZICZACĐÔI-${L}`;
  return `NHỊP-${tag}`;
}

/* ================================================================
 *  HÀM HỖ TRỢ
 * ================================================================ */
function tailBlocks(seq, maxBlocks = 4) {
  const blocks = [];
  if (!seq.length) return blocks;
  let i = seq.length - 1;
  while (i >= 0 && blocks.length < maxBlocks) {
    const cur = seq[i];
    let c = 0;
    while (i >= 0 && seq[i] === cur) { c++; i--; }
    blocks.unshift(c);
  }
  return blocks;
}

function tailName(seq, minLen = 3, maxLen = 8) {
  for (let len = Math.min(maxLen, seq.length); len >= minLen; len--) {
    const p = seq.slice(-len).join("");
    const name = namePattern(p);
    if (name !== "RỖNG" && !name.startsWith("NHỊP")) {
      return { name, pat: p, len };
    }
  }
  const len = Math.min(maxLen, seq.length);
  const p = seq.slice(-len).join("");
  return { name: namePattern(p), pat: p, len };
}

const reverseBlocks = (blocks) => [...blocks].reverse().join("-");

function diceType(dice) {
  const [a, b, c] = dice;
  if (a === b && b === c) return "TRIPLE";
  if (a === b || b === c || a === c) return "PAIR";
  return "STRAIGHT";
}

function scoreBand(score) {
  if (score <= 5) return "LOW";
  if (score <= 8) return "MID_LOW";
  if (score <= 12) return "MID";
  if (score <= 15) return "MID_HIGH";
  return "HIGH";
}

/* ================================================================
 *  BUILD TIPS — 11 TẦNG
 * ================================================================ */
function buildTips(records, keyFn, minSamples = 15, filterFn = null) {
  const stat = {};
  for (let i = 0; i < records.length - 1; i++) {
    const cur = records[i], nxt = records[i + 1];
    if (nxt.session !== cur.session + 1) continue;
    if (filterFn && !filterFn(cur, i, records)) continue;
    const key = keyFn(records, i);
    if (!key) continue;
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][nxt.result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < minSamples) continue;
    const pT = (v.TAI / total) * 100;
    const pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildScoreTips(records, min = 15) {
  return buildTips(records, (_, i) => {
    const cur = records[i];
    if (cur.result === "TAI" && cur.score < 11) return null;
    if (cur.result === "XIU" && cur.score >= 11) return null;
    return (cur.result === "TAI" ? "T" : "X") + cur.score;
  }, min);
}

function buildDoubleScoreTips(records, min = 10) {
  return buildTips(records, (_, i) => {
    if (i < 1) return null;
    const a = records[i - 1], b = records[i];
    if (b.session !== a.session + 1) return null;
    return `${(a.result === "TAI" ? "T" : "X") + a.score}+${(b.result === "TAI" ? "T" : "X") + b.score}`;
  }, min);
}

function buildMarkov2(records, min = 15) {
  return buildTips(records, (_, i) => {
    if (i < 1) return null;
    const a = records[i - 1], b = records[i];
    if (b.session !== a.session + 1) return null;
    return toSeq([a, b]).join("");
  }, min);
}

function buildMarkov3(records, min = 12) {
  return buildTips(records, (_, i) => {
    if (i < 2) return null;
    const a = records[i - 2], b = records[i - 1], c = records[i];
    if (c.session !== b.session + 1 || b.session !== a.session + 1) return null;
    return toSeq([a, b, c]).join("");
  }, min);
}

function buildBlockTips(records, min = 15, maxBlocks = 4) {
  const seq = toSeq(records);
  const stat = {};
  for (let i = 3; i < seq.length - 1; i++) {
    if (records[i + 1].session !== records[i].session + 1) continue;
    const blocks = tailBlocks(seq.slice(0, i + 1), maxBlocks);
    if (blocks.length < 2) continue;
    const key = blocks.join("-");
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][records[i + 1].result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildReverseBlockTips(records, min = 12, maxBlocks = 4) {
  const seq = toSeq(records);
  const stat = {};
  for (let i = 3; i < seq.length - 1; i++) {
    if (records[i + 1].session !== records[i].session + 1) continue;
    const blocks = tailBlocks(seq.slice(0, i + 1), maxBlocks);
    if (blocks.length < 2) continue;
    const key = `REV:${reverseBlocks(blocks)}`;
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][records[i + 1].result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildNameTips(records, min = 15, maxLen = 8) {
  const seq = toSeq(records);
  const stat = {};
  for (let i = 3; i < seq.length - 1; i++) {
    if (records[i + 1].session !== records[i].session + 1) continue;
    const { name } = tailName(seq.slice(0, i + 1), 3, maxLen);
    if (!name || name.startsWith("NHỊP") || name.startsWith("RỖNG")) continue;
    stat[name] ??= { TAI: 0, XIU: 0 };
    stat[name][records[i + 1].result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildStreakBreakTips(records, min = 12) {
  const seq = toSeq(records);
  const stat = {};
  for (let i = 3; i < seq.length - 1; i++) {
    if (records[i + 1].session !== records[i].session + 1) continue;
    const streakLen = tailBlocks(seq.slice(0, i + 1), 1)[0] ?? 1;
    if (streakLen < 3) continue;
    const lastSide = seq[i];
    const key = `BỆT${streakLen}:${lastSide}`;
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][records[i + 1].result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildDiceTips(records, min = 15) {
  const stat = {};
  for (let i = 0; i < records.length - 1; i++) {
    const cur = records[i], nxt = records[i + 1];
    if (nxt.session !== cur.session + 1) continue;
    const key = diceType(cur.dice);
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][nxt.result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildHourTips(records, min = 20) {
  const stat = {};
  for (let i = 0; i < records.length - 1; i++) {
    const cur = records[i], nxt = records[i + 1];
    if (nxt.session !== cur.session + 1) continue;
    const key = `H${String(cur.hour).padStart(2, "0")}`;
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][nxt.result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildBandTips(records, min = 25) {
  const stat = {};
  for (let i = 0; i < records.length - 1; i++) {
    const cur = records[i], nxt = records[i + 1];
    if (nxt.session !== cur.session + 1) continue;
    const key = scoreBand(cur.score);
    stat[key] ??= { TAI: 0, XIU: 0 };
    stat[key][nxt.result]++;
  }
  const tips = [];
  for (const [key, v] of Object.entries(stat)) {
    const total = v.TAI + v.XIU;
    if (total < min) continue;
    const pT = (v.TAI / total) * 100, pX = (v.XIU / total) * 100;
    if (pT >= 55) tips.push({ key, predict: "TAI", rate: Math.min(92, Math.round(pT)), samples: total });
    if (pX >= 55) tips.push({ key, predict: "XIU", rate: Math.min(92, Math.round(pX)), samples: total });
  }
  return tips.sort((a, b) => b.rate - a.rate);
}

function buildAllTips(records, opts = {}) {
  return {
    score:       buildScoreTips(records,        opts.minScore       ?? 15),
    doubleScore: buildDoubleScoreTips(records,  opts.minDoubleScore ?? 10),
    markov2:     buildMarkov2(records,          opts.minMarkov      ?? 15),
    markov3:     buildMarkov3(records,          opts.minMarkov3     ?? 12),
    block:       buildBlockTips(records,        opts.minBlock       ?? 15, 4),
    revBlock:    buildReverseBlockTips(records, opts.minRevBlock    ?? 12, 4),
    name:        buildNameTips(records,         opts.minName        ?? 15, 8),
    streak:      buildStreakBreakTips(records,  opts.minStreak      ?? 12),
    dice:        buildDiceTips(records,         opts.minDice        ?? 15),
    hour:        buildHourTips(records,         opts.minHour        ?? 20),
    band:        buildBandTips(records,         opts.minBand        ?? 25),
  };
}

/* ================================================================
 *  TRỌNG SỐ + ADAPTIVE
 * ================================================================ */
const DEFAULT_WEIGHTS = {
  score: 0.15, doubleScore: 0.05, markov2: 0.10, markov3: 0.05,
  block: 0.15, revBlock: 0.05, name: 0.15, streak: 0.10,
  dice: 0.05, hour: 0.05, band: 0.10,
};

function getContextKeys(records) {
  const seq = toSeq(records);
  const last = records[records.length - 1];
  const prev = records[records.length - 2];
  const blocks = tailBlocks(seq, 4);
  const nameInfo = tailName(seq, 3, 8);
  const blockKeys = (() => {
    const arr = [];
    for (let l = blocks.length; l >= 2; l--) arr.push(blocks.slice(-l).join("-"));
    return arr;
  })();
  const revBlockKeys = (() => {
    const arr = [];
    for (let l = blocks.length; l >= 2; l--) arr.push(`REV:${reverseBlocks(blocks.slice(-l))}`);
    return arr;
  })();
  const streak = blocks[blocks.length - 1] ?? 1;
  const lastSide = seq[seq.length - 1];

  return {
    score:       (last.result === "TAI" ? "T" : "X") + last.score,
    doubleScore: prev && last.session === prev.session + 1
      ? `${(prev.result === "TAI" ? "T" : "X") + prev.score}+${(last.result === "TAI" ? "T" : "X") + last.score}`
      : null,
    markov2:     seq.slice(-2).join(""),
    markov3:     seq.slice(-3).join(""),
    blockKeys,
    revBlockKeys,
    name:        nameInfo.name,
    streak:      streak >= 3 ? `BỆT${streak}:${lastSide}` : null,
    dice:        diceType(last.dice),
    hour:        `H${String(last.hour).padStart(2, "0")}`,
    band:        scoreBand(last.score),
    context:     { blocks, nameInfo, last, prev, seq, streak, lastSide },
  };
}

function tuneWeights(records, tips, windowSize = 100, iterations = 3) {
  let weights = { ...DEFAULT_WEIGHTS };
  const layers = Object.keys(weights);
  for (let iter = 0; iter < iterations; iter++) {
    const acc = {}, cnt = {};
    for (const l of layers) { acc[l] = 0; cnt[l] = 0; }
    const start = Math.max(20, records.length - windowSize);
    for (let i = start; i < records.length - 1; i++) {
      const sub = records.slice(0, i + 1);
      const actual = records[i + 1].result;
      const ctx = getContextKeys(sub);
      const checkLayer = (layer, key) => {
        if (key == null) return;
        const arr = Array.isArray(key) ? key : [key];
        for (const k of arr) {
          const tip = (tips[layer] || []).find(t => t.key === k);
          if (tip) {
            cnt[layer]++;
            if (tip.predict === actual) acc[layer]++;
            return;
          }
        }
      };
      checkLayer("score", ctx.score);
      checkLayer("doubleScore", ctx.doubleScore);
      checkLayer("markov2", ctx.markov2);
      checkLayer("markov3", ctx.markov3);
      checkLayer("block", ctx.blockKeys);
      checkLayer("revBlock", ctx.revBlockKeys);
      checkLayer("name", ctx.name);
      checkLayer("streak", ctx.streak);
      checkLayer("dice", ctx.dice);
      checkLayer("hour", ctx.hour);
      checkLayer("band", ctx.band);
    }
    const newW = {};
    let total = 0;
    for (const l of layers) {
      const a = cnt[l] >= 5 ? acc[l] / cnt[l] : 0.5;
      newW[l] = DEFAULT_WEIGHTS[l] * (a * a + 0.2);
      total += newW[l];
    }
    for (const l of layers) newW[l] = newW[l] / total;
    weights = newW;
  }
  for (const l of layers) weights[l] = 0.5 * weights[l] + 0.5 * DEFAULT_WEIGHTS[l];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const l of layers) weights[l] = weights[l] / total;
  return weights;
}

/* ================================================================
 *  PREDICT — ENSEMBLE + GUARD
 * ================================================================ */
function predict(records, tips, weights = DEFAULT_WEIGHTS) {
  if (records.length < 5)
    return { predict: "TAI", confidence: 55, reason: "Chưa đủ mẫu", votes: [] };

  const ctx = getContextKeys(records);
  const matches = [];

  const tryMatch = (layer, keysArr) => {
    if (keysArr == null) return;
    const arr = Array.isArray(keysArr) ? keysArr : [keysArr];
    const tipList = tips[layer] || [];
    for (const k of arr) {
      if (k == null) continue;
      const found = tipList.find(t => t.key === k);
      if (found) {
        matches.push({ layer, key: found.key, predict: found.predict, rate: found.rate, samples: found.samples, weight: weights[layer] ?? 0 });
        return;
      }
    }
  };

  tryMatch("score",       ctx.score);
  tryMatch("doubleScore", ctx.doubleScore);
  tryMatch("markov2",     ctx.markov2);
  tryMatch("markov3",     ctx.markov3);
  tryMatch("block",       ctx.blockKeys);
  tryMatch("revBlock",    ctx.revBlockKeys);
  tryMatch("name",        ctx.name);
  tryMatch("streak",      ctx.streak);
  tryMatch("dice",        ctx.dice);
  tryMatch("hour",        ctx.hour);
  tryMatch("band",        ctx.band);

  let vTAI = 0, vXIU = 0, wSum = 0;
  for (const m of matches) {
    const w = m.weight * (m.rate / 100);
    if (m.predict === "TAI") vTAI += w;
    else vXIU += w;
    wSum += w;
  }

  const { streak, lastSide, seq } = ctx.context;

  if (wSum === 0) {
    if (streak >= 7) {
      const p = lastSide === "B" ? "XIU" : "TAI";
      return { predict: p, confidence: 68, reason: `Bệt ${streak} → ép bẻ`, votes: [], ctx };
    }
    return { predict: "TAI", confidence: 55, reason: `Không khớp mẹo, bệt ${streak}`, votes: [], ctx };
  }

  let finalPredict = vTAI >= vXIU ? "TAI" : "XIU";
  let confidence = Math.min(92, Math.max(55, Math.round((Math.max(vTAI, vXIU) / wSum) * 100)));

  if (streak >= 5) {
    const predSideChar = finalPredict === "TAI" ? "B" : "T";
    if (predSideChar === lastSide) {
      finalPredict = flip(finalPredict);
      confidence = Math.min(85, Math.max(65, confidence));
    }
  }

  const last5 = seq.slice(-5);
  if (last5.length === 5 && last5.every(x => x === lastSide)) {
    const predSideChar = finalPredict === "TAI" ? "B" : "T";
    if (predSideChar === lastSide) {
      finalPredict = flip(finalPredict);
      confidence = Math.min(85, Math.max(62, confidence));
    }
  }

  return {
    predict: finalPredict,
    confidence,
    reason: matches.map(m => `${m.layer}(${m.key})=${m.predict}${m.rate}%`).join(" | "),
    votes: matches,
    ctx,
  };
}

/* ================================================================
 *  GLOBAL STATE
 * ================================================================ */
let huHistory  = [];
let md5History = [];
let currentSessionIdHu  = null;
let currentSessionIdMd5 = null;

let huTips  = null, huWeights  = null, huTipsBuiltAt  = 0, huTipsBuiltCount  = 0;
let md5Tips = null, md5Weights = null, md5TipsBuiltAt = 0, md5TipsBuiltCount = 0;

let huPredictionLog  = [];
let md5PredictionLog = [];

/* ================================================================
 *  BUILD TIPS cho 1 bàn
 * ================================================================ */
function rebuildTips(history, which = "hu") {
  if (history.length < 50) return;
  const records = [...history].reverse();
  const tips = buildAllTips(records);
  const weights = tuneWeights(records, tips, 100, 3);
  const count = records.length;

  if (which === "hu") {
    huTips = tips; huWeights = weights;
    huTipsBuiltAt = Date.now(); huTipsBuiltCount = count;
    console.log(`🔧 [HŨ] Rebuild tips từ ${count} phiên | ${Object.values(tips).reduce((s, a) => s + a.length, 0)} mẹo`);
  } else {
    md5Tips = tips; md5Weights = weights;
    md5TipsBuiltAt = Date.now(); md5TipsBuiltCount = count;
    console.log(`🔧 [MD5] Rebuild tips từ ${count} phiên | ${Object.values(tips).reduce((s, a) => s + a.length, 0)} mẹo`);
  }
}

/* ================================================================
 *  FETCH LIVE DATA
 * ================================================================ */
async function fetchHuData() {
  try {
    const res = await fetch(API_URL_HU);
    const data = await res.json();
    if (!data || !Array.isArray(data.list)) return;

    const records = data.list.map(parseApiRecord).sort((a, b) => a.session - b.session);
    if (!records.length) return;
    const lastSession = records.at(-1);

    if (!currentSessionIdHu) {
      huHistory = records.slice().reverse();
      currentSessionIdHu = lastSession.session;
      console.log(`✅ [HŨ] Tải ${records.length} phiên`);
      rebuildTips(huHistory, "hu");
    } else if (lastSession.session > currentSessionIdHu) {
      const newRecs = records.filter(r => r.session > currentSessionIdHu);
      for (const r of newRecs) huHistory.unshift(r);
      if (huHistory.length > 2000) huHistory = huHistory.slice(0, 1500);
      currentSessionIdHu = lastSession.session;
      if (newRecs.length) console.log(`🆕 [HŨ] +${newRecs.length} phiên`);

      if (huHistory.length - huTipsBuiltCount >= REBUILD_EVERY) {
        rebuildTips(huHistory, "hu");
      }
    }
    verifyPredictions(huPredictionLog, huHistory);
  } catch (e) {
    console.error(`❌ [HŨ] ${e.message}`);
  }
}

async function fetchMd5Data() {
  try {
    const res = await fetch(API_URL_MD5);
    const data = await res.json();
    if (!data || !Array.isArray(data.list)) return;

    const records = data.list.map(parseApiRecord).sort((a, b) => a.session - b.session);
    if (!records.length) return;
    const lastSession = records.at(-1);

    if (!currentSessionIdMd5) {
      md5History = records.slice().reverse();
      currentSessionIdMd5 = lastSession.session;
      console.log(`✅ [MD5] Tải ${records.length} phiên`);
      rebuildTips(md5History, "md5");
    } else if (lastSession.session > currentSessionIdMd5) {
      const newRecs = records.filter(r => r.session > currentSessionIdMd5);
      for (const r of newRecs) md5History.unshift(r);
      if (md5History.length > 2000) md5History = md5History.slice(0, 1500);
      currentSessionIdMd5 = lastSession.session;
      if (newRecs.length) console.log(`🆕 [MD5] +${newRecs.length} phiên`);

      if (md5History.length - md5TipsBuiltCount >= REBUILD_EVERY) {
        rebuildTips(md5History, "md5");
      }
    }
    verifyPredictions(md5PredictionLog, md5History);
  } catch (e) {
    console.error(`❌ [MD5] ${e.message}`);
  }
}

/* ================================================================
 *  PREDICTION LOG
 * ================================================================ */
function recordPrediction(log, session, prediction) {
  if (log.find(p => p.session === session)) return;
  log.push({
    session,
    predict: prediction.predict,
    confidence: prediction.confidence,
    reason: prediction.reason,
    votes: prediction.votes?.length ?? 0,
    actual: null,
    correct: null,
  });
  if (log.length > 300) log.splice(0, log.length - 300);
}

function verifyPredictions(log, history) {
  const map = new Map(history.map(h => [h.session, h]));
  for (const p of log) {
    if (p.actual === null && map.has(p.session)) {
      const h = map.get(p.session);
      p.actual = h.result;
      p.correct = p.predict === p.actual;
    }
  }
}

function buildHistoryReport(log, limit = 30) {
  const finished = log
    .filter(p => p.actual !== null)
    .sort((a, b) => b.session - a.session)
    .slice(0, limit);

  const valid = finished.filter(p => p.correct !== null);
  const total = valid.length;
  const dung = valid.filter(p => p.correct).length;
  const sai = total - dung;

  const history = finished.map(p => ({
    phien: p.session,
    du_doan: p.predict === "TAI" ? "tài" : "xỉu",
    do_tin_cay: `${p.confidence}%`,
    so_tang_khop: p.votes,
    ly_do: p.reason,
    ket_qua: p.actual === "TAI" ? "tài" : "xỉu",
    check: p.correct ? "đúng✅" : "sai❌",
  }));

  return {
    history,
    thong_ke: {
      tong: total,
      dung,
      sai,
      ti_le: total > 0 ? `${((dung / total) * 100).toFixed(1)}%` : "0%",
    },
  };
}

/* ================================================================
 *  BOOTSTRAP + BUILD RESPONSE
 * ================================================================ */
function bootstrapFromFiles() {
  const records = loadBootstrapData(DATA_DIR);
  if (!records.length) {
    console.log("⚠️ Không có file bootstrap trong ./data — sẽ dùng API live 100%");
    return;
  }
  console.log(`📚 Bootstrap tổng cộng ${records.length} phiên từ ${DATA_DIR}/`);
  const tips = buildAllTips(records);
  const weights = tuneWeights(records, tips, 100, 3);
  console.log(
    `🔧 Bootstrap tips: ${Object.values(tips).reduce((s, a) => s + a.length, 0)} mẹo ` +
    `trên ${records.length} phiên`
  );
  if (!huTips)  { huTips = tips;  huWeights = weights;  huTipsBuiltCount = records.length; }
  if (!md5Tips) { md5Tips = tips; md5Weights = weights; md5TipsBuiltCount = records.length; }
}

function buildResponse(history, gameName, log, tips, weights) {
  if (!tips) return { error: "Đang build mẹo, thử lại sau 5s" };
  const chronological = [...history].reverse();
  const last = history[0];
  const result = predict(chronological, tips, weights);

  recordPrediction(log, last.session + 1, result);

  return {
    "id": ADMIN_ID,
    "game": gameName,
    "phien_truoc": last.session,
    "xuc_xac": `${last.dice[0]} - ${last.dice[1]} - ${last.dice[2]}`,
    "ket_qua": last.result === "TAI" ? "tài" : "xỉu",
    "tong": last.score,
    "phien_nay": last.session + 1,
    "du_doan": result.predict === "TAI" ? "tài" : "xỉu",
    "do_tin_cay": `${result.confidence}%`,
    "ly_do": result.reason,
    "so_tang_khop": result.votes.length,
    "cau_hien_tai": result.ctx
      ? {
          duoi_block: result.ctx.blockKeys.join(" → "),
          ten_cau: result.ctx.name,
          bet: result.ctx.context.streak,
        }
      : null,
    "chi_tiet_phieu": result.votes.map(v => ({
      tang: v.layer,
      key: v.key,
      trong_so: +v.weight.toFixed(3),
      du_doan: v.predict === "TAI" ? "tài" : "xỉu",
      ti_le: `${v.rate}%`,
    })),
  };
}

/* ================================================================
 *  FASTIFY SERVER
 * ================================================================ */
const app = fastify({ logger: false });
await app.register(cors, { origin: "*" });

/* --- ROOT --- */
app.get("/", async () => ({
  status: "active",
  message: "api hỗ trợ 2 bàn hũ + md5, mua key ib adSika88",
  algorithm: "🎲 TÀI XỈU VIP v4.1 — PUBLIC (NO KEY) — 11 TẦNG MẸO 🎲",
  endpoints: {
    hu:          `/api/taixiu/lc789`,
    md5:         `/api/md5/lc789`,
    hu_history:  `/api/taixiu/lc789/prediction-history`,
    md5_history: `/api/md5/lc789/prediction-history`,
    hu_raw:      `/api/taixiu/lc789/raw-history`,
    md5_raw:     `/api/md5/lc789/raw-history`,
    hu_tips:     `/api/taixiu/lc789/tips`,
    md5_tips:    `/api/md5/lc789/tips`,
    hu_weights:  `/api/taixiu/lc789/weights`,
    md5_weights: `/api/md5/lc789/weights`,
    debug:       `/api/debug`,
  },
}));

/* --- PREDICT HŨ --- */
app.get("/api/taixiu/lc789", async (request, reply) => {
  if (huHistory.length < 5) return reply.status(503).send({ error: "Đang phân tích HŨ...", current: huHistory.length });

  const res = buildResponse(huHistory, "HŨ", huPredictionLog, huTips, huWeights);
  const hist = buildHistoryReport(huPredictionLog, 30);
  return { ...res, history: hist.history, thong_ke: hist.thong_ke };
});

/* --- PREDICT MD5 --- */
app.get("/api/md5/lc789", async (request, reply) => {
  if (md5History.length < 5) return reply.status(503).send({ error: "Đang phân tích MD5...", current: md5History.length });

  const res = buildResponse(md5History, "MD5", md5PredictionLog, md5Tips, md5Weights);
  const hist = buildHistoryReport(md5PredictionLog, 30);
  return { ...res, history: hist.history, thong_ke: hist.thong_ke };
});

/* --- HISTORY --- */
app.get("/api/taixiu/lc789/prediction-history", async (req) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 200);
  return buildHistoryReport(huPredictionLog, limit);
});

app.get("/api/md5/lc789/prediction-history", async (req) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 200);
  return buildHistoryReport(md5PredictionLog, limit);
});

/* --- RAW HISTORY --- */
app.get("/api/taixiu/lc789/raw-history", async () => {
  return huHistory.slice(0, 30).map(i => ({
    session: i.session, dice: i.dice, total: i.score,
    result: i.result === "TAI" ? "tài" : "xỉu", hour: i.hour,
  }));
});

app.get("/api/md5/lc789/raw-history", async () => {
  return md5History.slice(0, 30).map(i => ({
    session: i.session, dice: i.dice, total: i.score,
    result: i.result === "TAI" ? "tài" : "xỉu", hour: i.hour,
  }));
});

/* --- TIPS --- */
function formatTips(tips) {
  const out = {};
  for (const [layer, list] of Object.entries(tips || {})) {
    out[layer] = list.slice(0, 50).map(t => ({
      key: t.key,
      du_doan: t.predict === "TAI" ? "tài" : "xỉu",
      ti_le: `${t.rate}%`,
      so_mau: t.samples,
    }));
  }
  return out;
}

app.get("/api/taixiu/lc789/tips", async () => ({
  built_at: huTipsBuiltAt ? new Date(huTipsBuiltAt).toISOString() : null,
  built_on: huTipsBuiltCount,
  total_tips: huTips ? Object.values(huTips).reduce((s, a) => s + a.length, 0) : 0,
  tips: formatTips(huTips),
}));

app.get("/api/md5/lc789/tips", async () => ({
  built_at: md5TipsBuiltAt ? new Date(md5TipsBuiltAt).toISOString() : null,
  built_on: md5TipsBuiltCount,
  total_tips: md5Tips ? Object.values(md5Tips).reduce((s, a) => s + a.length, 0) : 0,
  tips: formatTips(md5Tips),
}));

/* --- WEIGHTS --- */
app.get("/api/taixiu/lc789/weights", async () => ({ weights: huWeights }));
app.get("/api/md5/lc789/weights", async () => ({ weights: md5Weights }));

/* --- DEBUG --- */
app.get("/api/debug", async () => {
  const stat = (history) => {
    const seq = toSeq([...history].reverse());
    return {
      total: history.length,
      last_session: history[0]?.session,
      last_result: history[0]?.result,
      last_score: history[0]?.score,
      last_dice: history[0]?.dice,
      last_hour: history[0]?.hour,
      validation: history.slice(0, 5).map(h => ({
        session: h.session, score: h.score, result: h.result,
        ok: (h.score >= 11 && h.result === "TAI") || (h.score < 11 && h.result === "XIU"),
      })),
      current_streak: tailBlocks(seq, 1)[0] ?? 0,
      tail_8: seq.slice(-8).join(""),
      tail_8_name: namePattern(seq.slice(-8).join("")),
    };
  };

  return {
    hu: {
      ...stat(huHistory),
      tips_layer_count: huTips ? Object.fromEntries(
        Object.entries(huTips).map(([k, v]) => [k, v.length])
      ) : null,
      weights: huWeights,
    },
    md5: {
      ...stat(md5History),
      tips_layer_count: md5Tips ? Object.fromEntries(
        Object.entries(md5Tips).map(([k, v]) => [k, v.length])
      ) : null,
      weights: md5Weights,
    },
    version: "v4.1-public",
  };
});

/* ================================================================
 *  START SERVER
 * ================================================================ */
const start = async () => {
  console.log("\n📚 Loading bootstrap data...");
  bootstrapFromFiles();

  console.log("\n🌐 Fetch dữ liệu live...");
  await Promise.all([fetchHuData(), fetchMd5Data()]);

  setInterval(fetchHuData, 5000);
  setInterval(fetchMd5Data, 5000);

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    console.error("❌ Lỗi khởi động server:", err.message);
    process.exit(1);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  🔥 TÀI XỈU VIP v4.1 — PUBLIC API (NO KEY)                          ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  🚀 Port ${PORT}  |  🌐 Public (không cần key)  |  👤 ${ADMIN_ID}`);
  console.log("║                                                                      ║");
  console.log("║  🧠 11 TẦNG MẸO + ENSEMBLE VOTING + ADAPTIVE WEIGHTS                ║");
  console.log("║                                                                      ║");
  console.log("║  📡 ENDPOINTS:                                                       ║");
  console.log("║    GET /api/taixiu/lc789              ← Dự đoán HŨ                  ║");
  console.log("║    GET /api/md5/lc789                 ← Dự đoán MD5                 ║");
  console.log("║    GET /api/taixiu/lc789/tips         ← Toàn bộ mẹo HŨ              ║");
  console.log("║    GET /api/md5/lc789/tips            ← Toàn bộ mẹo MD5             ║");
  console.log("║    GET /api/taixiu/lc789/raw-history  ← 30 phiên gần nhất HŨ        ║");
  console.log("║    GET /api/debug                     ← Debug trạng thái           ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
};

start();