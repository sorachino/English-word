// ===================== バージョン整合性チェック（最優先で実行） =====================
// index.htmlとapp.jsの組み合わせがズレていないかを、他の何よりも先に確認する。
// ズレていた場合、以降のコードで何が起きても分かるよう、まず警告バナーを出す。
(function checkBuildVersion() {
  try {
    const EXPECTED_BUILD = '78'; // ← app.jsのバージョンを上げるたびに、index.htmlのmeta build-versionと必ず揃えること
    const meta = document.querySelector('meta[name="build-version"]');
    const htmlBuild = meta ? meta.getAttribute('content') : null;
    if (htmlBuild !== EXPECTED_BUILD) {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:99999; background:#B23A2E; color:#fff; padding:10px 14px; font-size:12.5px; text-align:center; font-family:sans-serif; line-height:1.5;';
      banner.textContent = `⚠ index.html と app.js のバージョンが一致していません（HTML: ${htmlBuild || '不明'} / JS: ${EXPECTED_BUILD}）。index.html・app.js・style.css を全部まとめて、最新版に上書きアップロードし直してください。`;
      document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
      if (document.body) document.body.prepend(banner);
    }
  } catch (e) { /* 検知処理自体が失敗しても、本体の動作は止めない */ }
})();

// ===================== ストレージキー =====================
const LS = {
  MY_WORDS: 'pv_my_words',
  WEAK: 'pv_weak',          // { "verb": {level:'hint'|'choice'|'wrong', streak:0} }
  LOG: 'pv_daily_log',      // { "2026-08-15": {solved:10, correct:8} }
  SRS: 'pv_srs',            // { "verb": {interval:N, dueDate:'YYYY-MM-DD', reps:N} }
  MATCH_RECENT_GROUPS: 'pv_match_recent_groups', // マッチングゲームで直近使った意味グループの履歴（同じグループの連発を防ぐ）
};

// Firebase接続の使い回し用（宣言はファイル先頭で行う。
// 以前はランキング機能のセクションで宣言していたが、Cloud TTS初期化処理が
// ページ読み込み時にこれより先にinitFirebase()を呼ぶため、
// 「宣言前に変数へアクセスした」エラーで以降の処理が全て止まる不具合があった）
let fbDB = null;

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ===================== データ統合 =====================
function myWords() { return loadJSON(LS.MY_WORDS, []); }
function allWords() {
  const mine = myWords().map((w, i) => ({ ...w, stage: 0, no: 'M' + (i + 1), mine: true }));
  return PV_DATA.concat(mine);
}
function baseForm(verb) {
  return verb.replace(/\s*\*\d+.*$/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

// ===================== 活用対応の穴埋め =====================
const IRREGULAR = {
  be:'am is are was were been being', blow:'blew blown blowing',
  break:'broke broken breaking', bring:'brought bringing', build:'built building',
  buy:'bought buying', catch:'caught catching', come:'came coming', cut:'cutting',
  deal:'dealt dealing', dig:'dug digging', dive:'dove dived diving', do:'did done doing',
  draw:'drew drawn drawing', drag:'dragged dragging', drop:'dropped dropping',
  eat:'ate eaten eating', fall:'fell fallen falling', feel:'felt feeling',
  fill:'filled filling', find:'found finding', fit:'fitting', get:'got gotten getting',
  give:'gave given giving', go:'went gone goes going', hang:'hung hanging',
  have:'had has having', hear:'heard hearing', hit:'hitting', hold:'held holding',
  hook:'hooked hooking', keep:'kept keeping', kick:'kicked kicking',
  know:'knew known knowing', lay:'laid laying', leave:'left leaving', let:'letting',
  line:'lined lining', make:'made making', meet:'met meeting', pay:'paid paying',
  put:'putting', read:'reading', ride:'rode ridden riding', run:'ran running',
  say:'said saying', see:'saw seen seeing', sell:'sold selling', send:'sent sending',
  set:'setting', shut:'shutting', sink:'sank sunk sinking', sit:'sat sitting',
  sneak:'snuck sneaked sneaking', speak:'spoke spoken speaking', spend:'spent spending',
  stand:'stood standing', stick:'stuck sticking', strike:'struck striking',
  sweep:'swept sweeping', take:'took taken taking', teach:'taught teaching',
  tell:'told telling', think:'thought thinking', throw:'threw thrown throwing',
  wear:'wore worn wearing', win:'won winning', wind:'wound winding',
  write:'wrote written writing',
};
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function headPattern(head) {
  const forms = new Set([head, ...(IRREGULAR[head] || '').split(' ').filter(Boolean)]);
  const stem = head.length > 3 ? head.slice(0, -1) : head;
  const alts = [...forms].sort((a, b) => b.length - a.length).map(esc);
  return '(?:' + alts.join('|') + '|' + esc(stem) + "\\w*)";
}
function findObjectInSentence(sentence, verb) {
  if (!sentence) return null;
  const parts = baseForm(verb).split(' ');
  const head = parts[0], tail = parts.slice(1);
  if (!tail.length) return null;
  const headPat = headPattern(head.toLowerCase());
  const tailPat = tail.map(esc).join('\\s+');
  const pat = '\\b(' + headPat + ')((?:\\s+\\w+){1,3})?\\s+(' + tailPat + ')\\b';
  const re = new RegExp(pat, 'i');
  const m = sentence.match(re);
  if (!m || !m[2] || !m[2].trim()) return null;
  return m[2].trim();
}
function structureHtml(verb, ex1, ex2) {
  const base = baseForm(verb);
  const parts = base.split(' ');
  if (parts.length < 2) return '';
  const head = parts[0], tail = parts.slice(1).join(' ');
  const obj = findObjectInSentence(ex2, verb) || findObjectInSentence(ex1, verb);
  if (!obj) return '';
  return `<div class="dd-structure">構文：<b>${escHtml(head)} ${escHtml(obj)} ${escHtml(tail)}</b>　／　<b>${escHtml(base)} ${escHtml(obj)}</b></div>`;
}

function blankSentence(sentence, verb) {
  if (!sentence) return null;
  const parts = baseForm(verb).split(' ');
  const head = parts[0], tail = parts.slice(1);
  const headPat = headPattern(head.toLowerCase());
  let pat;
  if (tail.length) {
    const tailPat = tail.map(esc).join('\\s+');
    pat = '\\b(' + headPat + ')((?:\\s+\\w+){0,3})?\\s+(' + tailPat + ')\\b';
  } else {
    pat = '\\b(' + headPat + ')\\b';
  }
  const re = new RegExp(pat, 'i');
  const m = sentence.match(re);
  if (!m) return null;
  const start = m.index, end = start + m[0].length;
  const marks = n => Array(n).fill('(?)').join(' ');
  let inner;
  const middle = (tail.length && m[2]) ? m[2].trim() : '';
  if (middle) {
    // 動詞と前置詞の間に目的語が挟まる場合：目的語はそのまま見せ、動詞部分だけ空欄にする
    inner = '<b>' + marks(1) + '</b> ' + middle + ' <b>' + marks(tail.length) + '</b>';
  } else {
    inner = '<b>' + marks(parts.length) + '</b>';
  }
  return sentence.slice(0, start) + inner + sentence.slice(end);
}

// ===================== クイズエンジン =====================
let quizState = null;

function buildQuiz(stageFilter, count, weakOn, srsOn, strictOnly) {
  const words = allWords();
  const weak = loadJSON(LS.WEAK, {});
  const weakVerbs = Object.keys(weak);
  const isWeak = w => weakVerbs.includes(baseForm(w.verb));
  const isDue = w => srsScore(baseForm(w.verb)) <= 0;

  let pool = stageFilter ? words.filter(w => w.stage === stageFilter) : words.slice();
  if (strictOnly && weakOn) pool = pool.filter(isWeak);
  if (strictOnly && srsOn) pool = pool.filter(isDue);

  // 優先度スコア：小さいほど優先。苦手語は一律で優先度を大きく上げ、復習は期限切れが長いほど優先。
  function priority(w) {
    let score = srsOn ? srsScore(baseForm(w.verb)) : 0;
    if (weakOn && isWeak(w)) score -= 50000;
    return score;
  }

  let picks = [];
  if (strictOnly && (weakOn || srsOn)) {
    // 優先条件を満たす語だけのプールから、優先度順にそのまま採用
    pool.sort((a, b) => priority(a) - priority(b));
    picks = pool.slice(0, count);
  } else if (weakOn || srsOn) {
    // 優先条件を満たす語を最大30%確保し、残りはランダム
    const priorityPool = pool.filter(w => (weakOn && isWeak(w)) || (srsOn && isDue(w)));
    priorityPool.sort((a, b) => priority(a) - priority(b));
    const n = Math.min(Math.ceil(count * 0.3), priorityPool.length, count);
    picks = priorityPool.slice(0, n);
  }
  // 得意な語（復習間隔が十分伸びた語）を、たまに1問だけ静かに紛れ込ませる（完全に忘れるのを防ぐ）
  if (picks.length < count) {
    const srsAll = loadSrs();
    const masteredPool = pool.filter(w => {
      if (picks.includes(w)) return false;
      const entry = srsAll[baseForm(w.verb)];
      return entry && entry.interval >= 30;
    });
    if (masteredPool.length && Math.random() < 0.2) {
      picks.push(masteredPool[Math.floor(Math.random() * masteredPool.length)]);
    }
  }

  const rest = pool.filter(w => !picks.includes(w));
  shuffle(rest);
  while (picks.length < count && rest.length) picks.push(rest.shift());
  shuffle(picks);
  picks = declusterByGroup(picks);

  const allVerbs = [...new Set(words.map(w => baseForm(w.verb)))];
  const questions = [];
  for (const w of picks) {
    const verb = baseForm(w.verb);
    let blanked = blankSentence(w.ex2, w.verb) ? { html: blankSentence(w.ex2, w.verb), full: w.ex2, ja: w.ja2 } : null;
    if (!blanked && blankSentence(w.ex1, w.verb)) blanked = { html: blankSentence(w.ex1, w.verb), full: w.ex1, ja: w.ja1 };
    if (!blanked) continue;

    const head = verb.split(' ')[0].toLowerCase();
    const wordCount = verb.split(' ').length;
    const sameCount = v => v.split(' ').length === wordCount;
    const sameHeadSameCount = allVerbs.filter(v => v !== verb && sameCount(v) && v.toLowerCase().startsWith(head + ' '));
    const otherSameCount = allVerbs.filter(v => v !== verb && sameCount(v) && !sameHeadSameCount.includes(v));
    const fallbackAny = allVerbs.filter(v => v !== verb && !sameCount(v));
    shuffle(sameHeadSameCount); shuffle(otherSameCount); shuffle(fallbackAny);
    const distractors = sameHeadSameCount.concat(otherSameCount).concat(fallbackAny).slice(0, 3);
    const choices = shuffle(distractors.concat([verb]));

    // 逆方向モード（英語→日本語）用の意味の4択
    const otherMeanings = words.filter(w2 => w2 !== w && w2.meaning && w2.meaning !== w.meaning);
    shuffle(otherMeanings);
    const meaningDistractors = otherMeanings.slice(0, 3).map(w2 => w2.meaning);
    const meaningChoices = shuffle(meaningDistractors.concat([w.meaning]));

    questions.push({
      word: w, answer: verb, questionHtml: blanked.html, full: blanked.full, ja: blanked.ja,
      meaning: w.meaning, def: w.def, note: w.note, choices, meaningChoices,
      resolved: false, method: null, // 'first' | 'hint' | 'choice' | 'wrong'
      hintShown: false,
    });
  }
  return questions;
}
// 同じ意味グループ（例: back系）の語が出題順で連続しないよう並べ替える。
// groupの多い方から交互に配置する貪欲法（タスクスケジューラ問題と同じ考え方）。
// 1グループが全体の半数を超える場合は数学的に完全回避できないため、その分は諦めて最善を尽くす。
function declusterByGroup(arr) {
  const withKey = arr.map((w, idx) => ({ w, key: w.group || ('__none_' + idx) }));
  const buckets = {};
  withKey.forEach(it => { (buckets[it.key] = buckets[it.key] || []).push(it); });
  const result = [];
  let lastKey = null;
  while (result.length < withKey.length) {
    const keys = Object.keys(buckets).filter(k => buckets[k].length > 0)
      .sort((a, b) => buckets[b].length - buckets[a].length);
    let chosenKey = keys.find(k => k !== lastKey);
    if (!chosenKey) chosenKey = keys[0]; // 他に選択肢がなく、やむを得ず連続させる
    const item = buckets[chosenKey].shift();
    result.push(item.w);
    lastKey = chosenKey;
  }
  return result;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeAnswer(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}
function answerMatches(input, answer) {
  const a = normalizeAnswer(input), b = normalizeAnswer(answer);
  if (a === b) return true;
  // 活用ゆるし: 単語ごとに先頭一致で簡易判定
  const aw = a.split(' '), bw = b.split(' ');
  if (aw.length !== bw.length) return false;
  return aw.every((w, i) => w === bw[i] || (w.length > 3 && bw[i].startsWith(w.slice(0, Math.max(3, w.length - 3)))));
}

// ===================== 苦手語の記録 =====================
// ===================== 忘却曲線（簡易SRS） =====================
function loadSrs() { return loadJSON(LS.SRS, {}); }
function saveSrs(s) { saveJSON(LS.SRS, s); }
function daysBetween(dateStrA, dateStrB) {
  const [ay, am, ad] = dateStrA.split('-').map(Number);
  const [by, bm, bd] = dateStrB.split('-').map(Number);
  const a = new Date(ay, am - 1, ad), b = new Date(by, bm - 1, bd);
  return Math.round((a - b) / 86400000);
}
function updateSrs(verb, ok, usedHelp) {
  const srs = loadSrs();
  const key = baseForm(verb);
  const today = todayKey();
  const entry = srs[key] || { interval: 1, dueDate: today, reps: 0 };
  if (ok && !usedHelp) {
    entry.reps = (entry.reps || 0) + 1;
    entry.interval = entry.reps <= 1 ? 1 : Math.min(60, entry.interval * 2);
  } else if (ok && usedHelp) {
    entry.interval = entry.interval || 1; // ヒント/4択正解は間隔を伸ばさず据え置き
  } else {
    entry.interval = 1;
    entry.reps = 0;
  }
  const due = new Date();
  due.setDate(due.getDate() + entry.interval);
  entry.dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  srs[key] = entry;
  saveSrs(srs);
}
function srsScore(verb) {
  // 数値が小さいほど優先度が高い。未出題は最優先、期限切れが長いほど優先。
  const srs = loadSrs();
  const entry = srs[baseForm(verb)];
  if (!entry) return -100000;
  return -daysBetween(todayKey(), entry.dueDate);
}
function srsDuePool(words) {
  return words.filter(w => srsScore(baseForm(w.verb)) <= 0);
}

function recordResult(verb, method) {
  // method: 'first'（記録なし対象）| 'hint' | 'choice' | 'wrong'
  const weak = loadJSON(LS.WEAK, {});
  if (method !== 'wrong') {
    // 正解した（ヒント・4択を使っていても）ので、直近の状態として苦手リストから外す
    if (weak[verb]) delete weak[verb];
  } else {
    if (!weak[verb]) weak[verb] = { hint: 0, choice: 0, wrong: 0, okStreak: 0 };
    weak[verb].wrong = (weak[verb].wrong || 0) + 1;
  }
  // 上限30語：ヒントのみの語から間引く
  let keys = Object.keys(weak);
  if (keys.length > 30) {
    keys.sort((x, y) => {
      const sx = weak[x].wrong * 3 + weak[x].choice * 2 + weak[x].hint;
      const sy = weak[y].wrong * 3 + weak[y].choice * 2 + weak[y].hint;
      return sx - sy;
    });
    while (Object.keys(weak).length > 30) delete weak[keys.shift()];
  }
  saveJSON(LS.WEAK, weak);
}

// ===================== 単語ごとの回答履歴（単語帳の色分け用） =====================
const LS_ANSWERED = 'pv_answered';
function recordAnswered(verb, ok) {
  const data = loadJSON(LS_ANSWERED, {});
  if (!data[verb]) data[verb] = { ok: 0, ng: 0 };
  if (ok) { data[verb].ok++; data[verb].ng = 0; } else { data[verb].ng++; }
  saveJSON(LS_ANSWERED, data);
}
function wordStatusClass(verb) {
  const data = loadJSON(LS_ANSWERED, {});
  const rec = data[verb];
  if (!rec) return '';
  return rec.ng > 0 ? ' status-ng' : ' status-ok';
}

function logToday(correct) {
  const log = loadJSON(LS.LOG, {});
  const key = todayKey();
  if (!log[key]) log[key] = { solved: 0, correct: 0 };
  log[key].solved++;
  if (correct) log[key].correct++;
  saveJSON(LS.LOG, log);
}
function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===================== UI: タブ =====================
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'list') renderWordList();
    if (btn.dataset.tab === 'dict') { renderMyWordList(); renderSharedWordList(); }
    if (btn.dataset.tab === 'stats') { renderStats(); renderLeaderboard(); updateLbNameDisplay(); renderChampionCalendar(); }
    if (btn.dataset.tab === 'nuance') { renderNuanceList(); }
  });
});

// ===================== UI: クイズセットアップ =====================
function populateStageSelects() {
  const stages = [...new Set(PV_DATA.map(w => w.stage))].sort((a, b) => a - b);
  const sel1 = document.getElementById('quiz-stage');
  const sel2 = document.getElementById('list-stage-filter');
  for (const s of stages) {
    const o1 = document.createElement('option'); o1.value = s; o1.textContent = 'Stage ' + s; sel1.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = s; o2.textContent = 'Stage ' + s; sel2.appendChild(o2);
  }
  const savedStage = localStorage.getItem('pv_quiz_stage');
  if (savedStage && [...sel1.options].some(o => o.value === savedStage)) sel1.value = savedStage;
}
populateStageSelects();
document.getElementById('quiz-stage').addEventListener('change', saveQuizSettings);

let quizCount = parseInt(localStorage.getItem('pv_quiz_count'), 10) || 10;
document.querySelectorAll('#quiz-count-group .chip').forEach(chip => {
  chip.classList.toggle('active', parseInt(chip.dataset.count, 10) === quizCount);
  chip.addEventListener('click', () => {
    document.querySelectorAll('#quiz-count-group .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    quizCount = parseInt(chip.dataset.count, 10);
    saveQuizSettings();
  });
});

let quizMode = localStorage.getItem('pv_quiz_mode') || 'normal'; // 'normal' | 'listening' | 'reverse'
function saveQuizSettings() {
  localStorage.setItem('pv_quiz_weak_on', document.getElementById('weak-on-toggle').checked ? '1' : '0');
  localStorage.setItem('pv_quiz_srs_on', document.getElementById('srs-on-toggle').checked ? '1' : '0');
  localStorage.setItem('pv_quiz_strict_only', document.getElementById('strict-only-toggle').checked ? '1' : '0');
  localStorage.setItem('pv_quiz_stage', document.getElementById('quiz-stage').value);
  localStorage.setItem('pv_quiz_count', String(quizCount));
  localStorage.setItem('pv_quiz_mode', quizMode);
}
document.getElementById('weak-on-toggle').checked = localStorage.getItem('pv_quiz_weak_on') === '1';
document.getElementById('srs-on-toggle').checked = localStorage.getItem('pv_quiz_srs_on') === '1';
document.getElementById('strict-only-toggle').checked = localStorage.getItem('pv_quiz_strict_only') === '1';

document.querySelectorAll('#quiz-mode-group .chip').forEach(chip => {
  chip.classList.toggle('active', chip.dataset.mode === quizMode);
  chip.addEventListener('click', () => {
    quizMode = chip.dataset.mode;
    document.querySelectorAll('#quiz-mode-group .chip').forEach(c => c.classList.toggle('active', c.dataset.mode === quizMode));
    saveQuizSettings();
  });
});

function refreshStrictRow() {
  const weakOn = document.getElementById('weak-on-toggle').checked;
  const srsOn = document.getElementById('srs-on-toggle').checked;
  document.getElementById('strict-only-row').style.display = (weakOn || srsOn) ? 'flex' : 'none';
  if (!weakOn && !srsOn) document.getElementById('strict-only-toggle').checked = false;
}

function refreshWeakRow() {
  const n = Object.keys(loadJSON(LS.WEAK, {})).length;
  document.getElementById('weak-count').textContent = n;
  document.getElementById('weak-on-toggle').disabled = n === 0;
  if (n === 0) document.getElementById('weak-on-toggle').checked = false;
  refreshStrictRow();
}
refreshWeakRow();

function refreshSrsRow() {
  const n = srsDuePool(allWords()).length;
  document.getElementById('srs-count').textContent = n;
  document.getElementById('srs-on-toggle').disabled = n === 0;
  if (n === 0) document.getElementById('srs-on-toggle').checked = false;
  refreshStrictRow();
}
refreshSrsRow();

document.getElementById('weak-on-toggle').addEventListener('change', () => { refreshStrictRow(); saveQuizSettings(); });
document.getElementById('srs-on-toggle').addEventListener('change', () => { refreshStrictRow(); saveQuizSettings(); });
document.getElementById('strict-only-toggle').addEventListener('change', saveQuizSettings);

document.getElementById('start-quiz').addEventListener('click', () => {
  if (quizMode === 'matching') { startMatchingGame(); return; }
  const raw = document.getElementById('quiz-stage').value;
  const stage = parseInt(raw, 10) || 0;
  const weakOn = document.getElementById('weak-on-toggle').checked;
  const srsOn = document.getElementById('srs-on-toggle').checked;
  const strictOnly = document.getElementById('strict-only-toggle').checked;
  const qs = buildQuiz(stage, quizCount, weakOn, srsOn, strictOnly);
  if (!qs.length) { toast('この範囲では問題が作れませんでした'); return; }
  quizState = { questions: qs, idx: 0, correctCount: 0, results: [], mode: quizMode };
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-done').hidden = true;
  document.getElementById('quiz-match').hidden = true;
  document.getElementById('quiz-play').hidden = false;
  showQuestion();
});

// ===================== マッチングゲーム =====================
let matchState = null;
function startMatchingGame() {
  const raw = document.getElementById('quiz-stage').value;
  const stage = parseInt(raw, 10) || 0;
  const words = allWords().filter(w => !stage || w.stage === stage);
  if (words.length < 2) { toast('この範囲では作れませんでした'); return; }
  const roundSize = Math.min(6, words.length);

  // 手動で作成した「意味グループ」から、このプール内で2語以上そろっているものを集める
  const byGroup = {};
  words.forEach(w => {
    if (!w.group) return;
    if (!byGroup[w.group]) byGroup[w.group] = [];
    byGroup[w.group].push(w);
  });
  const usableGroups = Object.values(byGroup).filter(arr => arr.length >= 2);
  // グループの大小で優先度をつけると毎回同じ大きいグループ（例：backの「return」）ばかりになるので、
  // サイズでは並べ替えない。代わりに、直近使ったグループを後回しにして連続を防ぐ。
  const recentGroupIds = loadJSON(LS.MATCH_RECENT_GROUPS, []);
  const groupIdOf = arr => arr[0].group;
  const freshGroups = usableGroups.filter(arr => !recentGroupIds.includes(groupIdOf(arr)));
  const recentGroups = usableGroups.filter(arr => recentGroupIds.includes(groupIdOf(arr)));
  shuffle(freshGroups);
  shuffle(recentGroups);
  const orderedGroups = freshGroups.concat(recentGroups); // 直近使ったグループは選択肢が尽きた場合のみ使う

  let chosen = [];
  const usedVerbKeys = new Set();
  const usedMeanings = new Set();
  function tryAdd(w) {
    if (chosen.length >= roundSize) return;
    if (chosen.includes(w)) return;
    const vKey = baseForm(w.verb);
    const mKey = w.meaning;
    if (usedVerbKeys.has(vKey) || usedMeanings.has(mKey)) return; // 見た目が同じ札になるものは弾く
    chosen.push(w);
    usedVerbKeys.add(vKey);
    usedMeanings.add(mKey);
  }
  for (const grp of orderedGroups) {
    const shuffledGrp = shuffle(grp.slice());
    for (const w of shuffledGrp) {
      if (chosen.length >= roundSize) break;
      tryAdd(w);
    }
    if (chosen.length >= roundSize) break;
  }
  if (chosen.length < roundSize) {
    const rest = words.filter(w => !chosen.includes(w));
    shuffle(rest);
    for (const w of rest) {
      if (chosen.length >= roundSize) break;
      tryAdd(w);
    }
  }
  shuffle(chosen);

  // このラウンドで実際に使ったグループを履歴に記録し、次回以降は選ばれにくくする
  const usedGroupIds = [...new Set(chosen.map(w => w.group).filter(Boolean))];
  if (usedGroupIds.length) {
    let recent = recentGroupIds.filter(g => !usedGroupIds.includes(g));
    recent = recent.concat(usedGroupIds);
    const MAX_RECENT = 3; // 直近3グループ分は次回以降で優先度を下げる
    if (recent.length > MAX_RECENT) recent = recent.slice(recent.length - MAX_RECENT);
    saveJSON(LS.MATCH_RECENT_GROUPS, recent);
  }

  matchState = {
    pairs: chosen.map(w => ({ verb: baseForm(w.verb), meaning: w.meaning, group: w.group || '', nuance: w.nuance || '' })),
    verbOrder: shuffle(chosen.map(w => baseForm(w.verb))),
    meaningOrder: shuffle(chosen.map(w => w.meaning)),
    matched: new Set(),
    selectedVerb: null,
    selectedMeaning: null,
    lastMatchedPair: null,
  };
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-play').hidden = true;
  document.getElementById('quiz-done').hidden = true;
  document.getElementById('quiz-match').hidden = false;
  renderMatchBoard();
}

// 正解したその語1件分のニュアンス解説カードのHTML（データ内の各語が個別に持つ nuance フィールドを使う）
function wordNuanceCardHtml(pair) {
  if (!pair || !pair.nuance) return '';
  return `<div class="nuance-card">
      <div class="nuance-label">${escHtml(pair.verb)}</div>
      <div class="nuance-note">${escHtml(pair.nuance)}</div>
    </div>`;
}

// group1件分の「使い分け」カードのHTMLを組み立てる（マッチングゲーム完了時と使い分けタブで共通利用）
function nuanceCardHtml(group) {
  if (!group || typeof GROUP_INFO === 'undefined' || !GROUP_INFO[group]) return '';
  const info = GROUP_INFO[group];
  return `<div class="nuance-card">
      <div class="nuance-label">${escHtml(info.label)}</div>
      <div class="nuance-note">${escHtml(info.note)}</div>
    </div>`;
}

function renderMatchBoard() {
  const verbsEl = document.getElementById('match-verbs');
  const meaningsEl = document.getElementById('match-meanings');
  verbsEl.innerHTML = '';
  meaningsEl.innerHTML = '';
  document.getElementById('match-progress').textContent = `${matchState.matched.size} / ${matchState.pairs.length} 完了`;

  matchState.verbOrder.forEach(v => {
    const isMatched = matchState.matched.has(v);
    const el = document.createElement('div');
    el.className = 'match-card' + (isMatched ? ' matched' : '') + (matchState.selectedVerb === v ? ' selected' : '');
    el.textContent = v;
    if (!isMatched) el.addEventListener('click', () => onTapMatchVerb(v));
    verbsEl.appendChild(el);
  });
  matchState.meaningOrder.forEach(m => {
    const isMatched = [...matchState.matched].some(v => matchState.pairs.find(p => p.verb === v).meaning === m);
    const el = document.createElement('div');
    el.className = 'match-card' + (isMatched ? ' matched' : '') + (matchState.selectedMeaning === m ? ' selected' : '');
    el.textContent = m;
    if (!isMatched) el.addEventListener('click', () => onTapMatchMeaning(m));
    meaningsEl.appendChild(el);
  });

  const done = matchState.matched.size === matchState.pairs.length;
  document.getElementById('match-again-btn').hidden = !done;
  document.getElementById('match-back-btn').hidden = !done;

  const nuanceEl = document.getElementById('match-nuance');
  if (nuanceEl) {
    if (done) {
      // 完了時：このラウンドに登場した意味グループをすべてまとめて表示
      const groups = [...new Set(matchState.pairs.map(p => p.group).filter(Boolean))];
      if (groups.length) {
        nuanceEl.innerHTML = '<div class="nuance-summary-title">今回の使い分けまとめ</div>' + groups.map(nuanceCardHtml).join('');
        nuanceEl.hidden = false;
      } else {
        nuanceEl.hidden = true;
      }
    } else if (matchState.lastMatchedPair) {
      // 途中：直近に正解したペア自体の語のニュアンス解説を簡易表示
      const html = wordNuanceCardHtml(matchState.lastMatchedPair);
      if (html) { nuanceEl.innerHTML = html; nuanceEl.hidden = false; }
      else nuanceEl.hidden = true;
    } else {
      nuanceEl.hidden = true;
    }
  }

  if (done && !matchState.counted) {
    matchState.counted = true;
    logToday(true);
    syncLeaderboard(null, true);
    updateStreakPill();
    toast('全部そろいました！');
  }
}

function onTapMatchVerb(v) {
  matchState.selectedVerb = matchState.selectedVerb === v ? null : v;
  tryResolveMatch();
  renderMatchBoard();
}
function onTapMatchMeaning(m) {
  matchState.selectedMeaning = matchState.selectedMeaning === m ? null : m;
  tryResolveMatch();
  renderMatchBoard();
}
function tryResolveMatch() {
  if (!matchState.selectedVerb || !matchState.selectedMeaning) return;
  const pair = matchState.pairs.find(p => p.verb === matchState.selectedVerb);
  if (pair && pair.meaning === matchState.selectedMeaning) {
    matchState.matched.add(matchState.selectedVerb);
    matchState.lastMatchedPair = pair;
  } else {
    toast('不一致です、もう一度');
  }
  matchState.selectedVerb = null;
  matchState.selectedMeaning = null;
}
document.getElementById('match-again-btn').addEventListener('click', startMatchingGame);
document.getElementById('match-back-btn').addEventListener('click', () => {
  document.getElementById('quiz-match').hidden = true;
  document.getElementById('quiz-setup').hidden = false;
});

// ===================== UI: クイズ本体 =====================
function showQuestion() {
  const q = quizState.questions[quizState.idx];
  document.getElementById('q-idx').textContent = quizState.idx + 1;
  document.getElementById('q-total').textContent = quizState.questions.length;
  document.getElementById('progress-fill').style.width = (100 * (quizState.idx) / quizState.questions.length) + '%';
  document.getElementById('card-stage').textContent = q.word.mine ? 'マイ単語' : ('Stage ' + q.word.stage + ' · No.' + q.word.no);
  refreshQuizMarkBtn();
  const replayBtn = document.getElementById('listen-replay-btn');
  if (quizState.mode === 'listening') {
    document.getElementById('question-text').innerHTML = '（音声を聞いて、句動詞を答えてください）';
    replayBtn.hidden = false;
    replayBtn.onclick = () => speak(q.full);
    speak(q.full);
  } else if (quizState.mode === 'reverse') {
    document.getElementById('question-text').textContent = q.answer;
    replayBtn.hidden = true;
  } else {
    document.getElementById('question-text').innerHTML = q.questionHtml;
    replayBtn.hidden = true;
  }
  document.getElementById('ja-preview').textContent =
    (quizState.mode === 'reverse' || quizState.mode === 'listening') ? '' : q.ja;
  document.getElementById('answer-input').placeholder = quizState.mode === 'reverse' ? '意味を日本語で入力' : '句動詞を入力';
  document.getElementById('hint-box').hidden = true;
  document.getElementById('hint-box').textContent = '';
  document.getElementById('answer-form').hidden = false;
  document.getElementById('answer-input').value = '';
  document.getElementById('self-grade-box').hidden = true;
  document.getElementById('choice-grid').hidden = true;
  document.getElementById('choice-grid').innerHTML = '';
  document.getElementById('stamp-result').hidden = true;
  document.getElementById('stamp-result').innerHTML = '';
  document.getElementById('reveal-box').hidden = true;
  document.getElementById('reveal-wrong-info').hidden = true;
  document.getElementById('mark-wrong-btn').hidden = true;
  document.getElementById('choice-btn').disabled = false;
  document.getElementById('choice-btn').hidden = false;
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').hidden = false;
  document.getElementById('giveup-btn').disabled = false;
  document.getElementById('giveup-btn').hidden = false;
  document.getElementById('submit-btn').hidden = false;
  document.getElementById('submit-btn').disabled = false;
  setTimeout(() => document.getElementById('answer-input').focus(), 50);
}

document.getElementById('hint-btn').addEventListener('click', () => {
  const q = quizState.questions[quizState.idx];
  const box = document.getElementById('hint-box');
  if (quizState.mode === 'listening') {
    if (!q.hintShown) {
      box.textContent = '和訳: ' + q.ja;
      q.hintShown = 1;
    } else {
      box.textContent = '単語数: ' + q.answer.split(' ').length + '語';
    }
  } else if (quizState.mode === 'reverse') {
    if (!q.hintShown) {
      box.textContent = q.def ? '英語定義: ' + q.def : '意味の文字数: ' + q.meaning.length + '文字';
      q.hintShown = 1;
    } else {
      box.textContent = '意味の文字数: ' + q.meaning.length + '文字';
    }
  } else if (!q.hintShown) {
    box.textContent = '意味: ' + q.meaning + (q.def ? '（' + q.def + '）' : '');
    q.hintShown = 1;
  } else {
    box.textContent = '単語数: ' + q.answer.split(' ').length + '語';
  }
  box.hidden = false;
  q.usedHint = true;
});

document.getElementById('choice-btn').addEventListener('click', () => switchToChoices());

document.getElementById('giveup-btn').addEventListener('click', () => {
  document.getElementById('answer-form').hidden = true;
  document.getElementById('submit-btn').hidden = true;
  document.getElementById('choice-grid').hidden = true;
  document.getElementById('hint-btn').disabled = true;
  document.getElementById('choice-btn').disabled = true;
  document.getElementById('giveup-btn').disabled = true;
  finishQuestion(false, 'wrong', false, '');
});

function switchToChoices() {
  const q = quizState.questions[quizState.idx];
  document.getElementById('answer-form').hidden = true;
  document.getElementById('submit-btn').hidden = true;
  const grid = document.getElementById('choice-grid');
  grid.innerHTML = '';
  const list = quizState.mode === 'reverse' ? q.meaningChoices : q.choices;
  list.forEach(c => {
    const b = document.createElement('button');
    b.className = 'choice-btn'; b.textContent = c;
    b.addEventListener('click', () => resolveChoice(c, b));
    grid.appendChild(b);
  });
  grid.hidden = false;
  q.usedChoice = true;
  document.getElementById('choice-btn').disabled = true;
}

document.getElementById('answer-form').addEventListener('submit', e => {
  e.preventDefault();
  const q = quizState.questions[quizState.idx];
  const val = document.getElementById('answer-input').value.trim();
  if (!val) return;
  if (quizState.mode === 'reverse') {
    showSelfGrade(val, q);
    return;
  }
  const ok = answerMatches(val, q.answer);
  finishQuestion(ok, ok ? (q.usedHint ? 'hint' : 'first') : 'wrong', false, val);
});

function showSelfGrade(userVal, q) {
  document.getElementById('answer-form').hidden = true;
  document.getElementById('submit-btn').hidden = true;
  document.getElementById('hint-btn').hidden = true;
  document.getElementById('choice-btn').hidden = true;
  document.getElementById('giveup-btn').hidden = true;
  document.getElementById('self-grade-user-answer').textContent = userVal;
  document.getElementById('self-grade-correct-answer').textContent = q.meaning;
  document.getElementById('self-grade-box').hidden = false;
  document.getElementById('self-grade-ok-btn').onclick = () => {
    document.getElementById('self-grade-box').hidden = true;
    finishQuestion(true, q.usedHint ? 'hint' : 'first', false, userVal);
  };
  document.getElementById('self-grade-wrong-btn').onclick = () => {
    document.getElementById('self-grade-box').hidden = true;
    finishQuestion(false, 'wrong', false, userVal);
  };
}

function resolveChoice(chosen, btnEl) {
  const q = quizState.questions[quizState.idx];
  const correctText = quizState.mode === 'reverse' ? q.meaning : q.answer;
  const ok = chosen === correctText;
  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent === correctText) b.classList.add('correct');
    else if (b === btnEl) b.classList.add('wrong');
  });
  finishQuestion(ok, ok ? 'choice' : 'wrong', true, chosen);
}

// ===================== 効果音 =====================
let audioCtx = null;
function getAudioCtx() {
  if (audioCtx && audioCtx.state === 'closed') audioCtx = null;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(ctx, start, freq, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}
function scheduleChime(ctx, correct) {
  const now = ctx.currentTime;
  if (correct) {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // ド・ミ・ソ・ド（上昇アルペジオ）
    notes.forEach((f, i) => beep(ctx, now + i * 0.085, f, 0.22, 'sine', 0.18));
  } else {
    beep(ctx, now, 220, 0.16, 'square', 0.10);
    beep(ctx, now + 0.1, 174.61, 0.2, 'square', 0.10);
  }
}
function playResultSound(correct) {
  if (loadJSON('pv_sound_off', false)) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'running') {
      scheduleChime(ctx, correct);
      return;
    }
    // suspended（休止中）や電話の割り込み後などは、復帰を待ってから鳴らす
    ctx.resume().then(() => {
      try { scheduleChime(ctx, correct); } catch (e) { /* 無視 */ }
    }).catch(() => {
      // 復帰に失敗した場合はコンテキストを作り直して一度だけ再挑戦する
      try {
        audioCtx = null;
        const ctx2 = getAudioCtx();
        scheduleChime(ctx2, correct);
      } catch (e2) { /* それでも駄目なら無音のまま諦める */ }
    });
  } catch (e) { /* AudioContextが使えない環境は無音のまま無視 */ }
}
// ===================== 英文の読み上げ =====================
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
let cachedVoices = [];
function loadVoices() { cachedVoices = window.speechSynthesis.getVoices(); }
function populateVoiceSelect() {
  const sel = document.getElementById('voice-select');
  if (!sel) return;
  const saved = localStorage.getItem('pv_voice_uri') || '';
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter(v => v.lang && v.lang.startsWith('en'));
  const list = en.length ? en : voices;
  if (!list.length) return;
  sel.innerHTML = '<option value="">自動選択（おすすめの声を自動で選ぶ）</option>' +
    list.map(v => `<option value="${escAttr(v.voiceURI)}">${escHtml(v.name)}（${escHtml(v.lang)}）</option>`).join('');
  sel.value = list.some(v => v.voiceURI === saved) ? saved : '';
}
if ('speechSynthesis' in window) {
  loadVoices();
  populateVoiceSelect();
  window.speechSynthesis.onvoiceschanged = () => { loadVoices(); populateVoiceSelect(); };
}
document.getElementById('voice-select').addEventListener('change', (e) => {
  localStorage.setItem('pv_voice_uri', e.target.value);
  const sel = e.target;
  const chosenName = e.target.value ? sel.options[sel.selectedIndex].textContent : '';
  localStorage.setItem('pv_voice_name', chosenName);
  toast(e.target.value ? '声を変更しました' : '自動選択に戻しました');
});
function pickBestVoice() {
  // 呼び出すたびに最新のリストを取り直す（読み込みタイミングのズレを防ぐ）
  const fresh = window.speechSynthesis.getVoices();
  const voices = fresh.length ? fresh : cachedVoices;
  if (!voices.length) return null;

  const enUS = voices.filter(v => v.lang === 'en-US');
  const pool = enUS.length ? enUS : voices.filter(v => v.lang && v.lang.startsWith('en'));
  if (!pool.length) return voices[0];

  // 最優先：名前やvoiceURIに「拡張／プレミアム」を含むもの（iOSでダウンロードした高音質ボイス）
  const enhanced = pool.find(v => /premium|enhanced/i.test(v.name) || /premium|enhanced/i.test(v.voiceURI || ''));
  if (enhanced) return enhanced;

  // 次点：名前で分かっている自然な音声
  const preferredNames = [
    'Samantha', 'Ava', 'Zoe', 'Nicky', 'Google US English',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)', 'Karen',
  ];
  for (const name of preferredNames) {
    const v = pool.find(v => v.name === name);
    if (v) return v;
  }

  const def = pool.find(v => v.default);
  if (def) return def;
  return pool[0];
}
const ttsCache = {};
function playAudioBase64(b64) {
  try {
    const audio = new Audio('data:audio/mp3;base64,' + b64);
    audio.play().catch(() => {});
  } catch (e) { /* 無視 */ }
}
async function speakCloud(text) {
  if (ttsCache[text]) { playAudioBase64(ttsCache[text]); return; }
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'en-US', name: getCloudVoiceName() },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });
    const data = await res.json();
    if (data.audioContent) {
      ttsCache[text] = data.audioContent;
      playAudioBase64(data.audioContent);
      ttsUsageCount += text.length;
      updateVoiceCloudNote();
      const db = initFirebase();
      if (db) db.ref(`tts_usage/${ttsMonthKey()}`).set(firebase.database.ServerValue.increment(text.length)).catch(() => {});
    } else {
      toast('読み上げに失敗しました');
    }
  } catch (e) {
    toast('読み上げに失敗しました（通信エラー）');
  }
}
function ttsConfigured() {
  return typeof TTS_API_KEY !== 'undefined' && TTS_API_KEY;
}
const CLOUD_VOICES = [
  { name: 'en-US-Neural2-C', label: 'Neural2-C（女性・標準）' },
  { name: 'en-US-Neural2-F', label: 'Neural2-F（女性）' },
  { name: 'en-US-Neural2-G', label: 'Neural2-G（女性）' },
  { name: 'en-US-Neural2-H', label: 'Neural2-H（女性）' },
  { name: 'en-US-Neural2-A', label: 'Neural2-A（男性）' },
  { name: 'en-US-Neural2-D', label: 'Neural2-D（男性）' },
  { name: 'en-US-Neural2-I', label: 'Neural2-I（男性）' },
  { name: 'en-US-Neural2-J', label: 'Neural2-J（男性）' },
];
function getCloudVoiceName() {
  return localStorage.getItem('pv_cloud_voice_name') || (typeof TTS_VOICE_NAME !== 'undefined' && TTS_VOICE_NAME) || 'en-US-Neural2-C';
}
function initCloudVoiceSelect() {
  const sel = document.getElementById('cloud-voice-select');
  if (!sel) return;
  const current = localStorage.getItem('pv_cloud_voice_name') || getCloudVoiceName();
  sel.innerHTML = CLOUD_VOICES.map(v => `<option value="${v.name}">${v.label}</option>`).join('')
    + `<option value="__samantha__">Samantha（標準・無料）</option>`;
  sel.value = current;
  sel.addEventListener('change', () => {
    localStorage.setItem('pv_cloud_voice_name', sel.value);
    Object.keys(ttsCache).forEach(k => delete ttsCache[k]); // 声が変わるのでキャッシュを破棄
    toast('声を変更しました');
    speak('This is a sample sentence.');
  });
}
(() => {
  const legacy = document.getElementById('voice-legacy-card');
  const cloud = document.getElementById('voice-cloud-card');
  if (ttsConfigured()) {
    if (legacy) legacy.hidden = true;
    if (cloud) cloud.hidden = false;
    initCloudVoiceSelect();
  } else {
    if (legacy) legacy.hidden = false;
    if (cloud) cloud.hidden = true;
  }
})();
// ===================== Cloud TTSの無料枠使用量管理（全員共有） =====================
const TTS_FREE_LIMIT = 1000000; // Neural2の月間無料枠（文字数）
const TTS_THRESHOLD_RATIO = 0.85;
let ttsUsageCount = 0;
function ttsMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function initTtsUsage() {
  const db = initFirebase();
  if (!db) return;
  db.ref(`tts_usage/${ttsMonthKey()}`).get().then(snap => {
    ttsUsageCount = snap.val() || 0;
    updateVoiceCloudNote();
  }).catch(() => {});
}
function ttsOverThreshold() {
  return ttsUsageCount >= TTS_FREE_LIMIT * TTS_THRESHOLD_RATIO;
}
function updateVoiceCloudNote() {
  const el = document.getElementById('voice-cloud-note');
  if (!el) return;
  if (ttsOverThreshold()) {
    el.textContent = `今月の無料枠の85%に達したため、一時的にSamantha（標準の読み上げ）に切り替わっています。`;
  } else {
    el.textContent = `Google Cloud Text-to-Speech（Neural2）を使用中です。`;
  }
  const usageEl = document.getElementById('voice-cloud-usage');
  if (usageEl) {
    const pct = Math.min(100, Math.round(100 * ttsUsageCount / TTS_FREE_LIMIT));
    usageEl.textContent = `今月の無料枠使用量：${pct}%`;
  }
}
if (ttsConfigured()) initTtsUsage();

function speakWeb(text, forceName) {
  try {
    if (!('speechSynthesis' in window)) { toast('この端末は読み上げに対応していません'); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    let voice = null;
    if (forceName) {
      voice = window.speechSynthesis.getVoices().find(v => v.name === forceName) || null;
    }
    if (!voice) {
      const savedUri = localStorage.getItem('pv_voice_uri');
      const savedName = localStorage.getItem('pv_voice_name');
      if (savedUri) {
        const voices = window.speechSynthesis.getVoices();
        voice = voices.find(v => v.voiceURI === savedUri) || null;
        if (!voice && savedName) {
          voice = voices.find(v => v.name && savedName.startsWith(v.name)) || null;
        }
      }
    }
    if (!voice) voice = pickBestVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) { /* 無視 */ }
}
function speak(text) {
  if (!text) return;
  if (ttsConfigured()) {
    const cloudSel = localStorage.getItem('pv_cloud_voice_name');
    if (cloudSel === '__samantha__') { speakWeb(text, 'Samantha'); return; }
    if (ttsOverThreshold()) { speakWeb(text, 'Samantha'); return; }
    speakCloud(text);
    return;
  }
  speakWeb(text, null);
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.speak-btn');
  if (!btn) return;
  e.stopPropagation();
  speak(btn.dataset.text || '');
});

document.getElementById('voice-diag-btn').addEventListener('click', () => {
  const voices = window.speechSynthesis.getVoices();
  const resultEl = document.getElementById('voice-diag-result');
  if (!voices.length) {
    resultEl.textContent = '音声リストが空でした（getVoices()の結果が0件）。少し待ってからもう一度押してみてください。';
    return;
  }
  populateVoiceSelect();
  const en = voices.filter(v => v.lang && v.lang.startsWith('en'));
  const list = (en.length ? en : voices);
  const savedUri = localStorage.getItem('pv_voice_uri');
  const chosen = (savedUri && voices.find(v => v.voiceURI === savedUri)) || pickBestVoice();
  const lines = list.map(v => {
    const mark = (chosen && v.voiceURI === chosen.voiceURI) ? '★使用中★ ' : '';
    return `${mark}${v.name}｜${v.lang}｜${v.localService ? '端末内' : 'ネットワーク'}`;
  });
  resultEl.textContent = `英語音声：${en.length}件 / 全体：${voices.length}件\n\n` + lines.join('\n');
});

function refreshSoundToggle() {
  const off = loadJSON('pv_sound_off', false);
  document.getElementById('sound-toggle').textContent = off ? '🔇' : '🔊';
}
document.getElementById('sound-toggle').addEventListener('click', () => {
  const off = loadJSON('pv_sound_off', false);
  saveJSON('pv_sound_off', !off);
  refreshSoundToggle();
});
refreshSoundToggle();

function finishQuestion(ok, method, delay, userAnswer) {
  const q = quizState.questions[quizState.idx];
  q.resolved = true; q.method = method;
  recordResult(q.answer, ok ? method : 'wrong');
  updateSrs(q.answer, ok, method === 'hint' || method === 'choice');
  recordAnswered(q.answer, ok);
  logToday(ok);
  playResultSound(ok);
  syncLeaderboard(q.answer, ok);
  if (ok) quizState.correctCount++;
  quizState.results.push({ verb: q.answer, ok, q });

  const stamp = document.getElementById('stamp-result');
  stamp.hidden = false;
  stamp.innerHTML = `<div class="stamp ${ok ? 'ok' : 'ng'}">${ok ? '正解' : '不正解'}</div>`;

  const reveal = document.getElementById('reveal-box');
  document.getElementById('reveal-verb').textContent = q.answer;
  document.getElementById('reveal-sentence').textContent = q.full;
  document.getElementById('reveal-speak-btn').dataset.text = q.full || '';
  document.getElementById('reveal-ja').textContent = q.ja;
  document.getElementById('reveal-def').textContent = q.def || '';
  const nuanceEl = document.getElementById('reveal-nuance');
  if (q.word.nuance) { nuanceEl.hidden = false; nuanceEl.textContent = '💡 ' + q.word.nuance; } else { nuanceEl.hidden = true; }
  document.getElementById('reveal-structure').innerHTML = structureHtml(q.answer, q.word.ex1, q.word.ex2);
  const noteEl = document.getElementById('reveal-note');
  if (q.note) { noteEl.hidden = false; noteEl.textContent = '※ ' + q.note; } else { noteEl.hidden = true; }

  const wrongInfoEl = document.getElementById('reveal-wrong-info');
  const cleanedInput = (userAnswer || '').trim();
  if (!ok && cleanedInput && quizState.mode !== 'reverse') {
    const inputKey = cleanedInput.toLowerCase();
    const hit = allWords().find(w => baseForm(w.verb).toLowerCase() === inputKey);
    wrongInfoEl.hidden = false;
    if (hit) {
      wrongInfoEl.innerHTML = `
        <div class="wrong-info-title">あなたの回答「${escHtml(cleanedInput)}」の意味</div>
        <div class="wrong-info-meaning">${escHtml(hit.meaning || '')}</div>
        ${hit.def ? `<div class="wrong-info-def">${escHtml(hit.def)}</div>` : ''}
        ${hit.ex1 ? `<div class="ex">${escHtml(hit.ex1)} <button class="speak-btn" data-text="${escAttr(hit.ex1)}">🔊</button></div><div class="ja">${escHtml(hit.ja1 || '')}</div>` : ''}
        ${hit.ex2 ? `<div class="ex">${escHtml(hit.ex2)} <button class="speak-btn" data-text="${escAttr(hit.ex2)}">🔊</button></div><div class="ja">${escHtml(hit.ja2 || '')}</div>` : ''}
      `;
    } else {
      wrongInfoEl.innerHTML = `<div class="wrong-info-title">あなたの回答「${escHtml(cleanedInput)}」</div><div class="wrong-info-meaning">この単語帳にありません。</div><button class="btn-ghost btn-block" id="wrong-add-dict-btn">辞書に追加する</button>`;
      const addBtn = document.getElementById('wrong-add-dict-btn');
      if (addBtn) addBtn.addEventListener('click', () => goToAddDict(cleanedInput));
    }
  } else {
    wrongInfoEl.hidden = true;
    wrongInfoEl.innerHTML = '';
  }

  const markWrongBtn = document.getElementById('mark-wrong-btn');
  if (ok && (method === 'hint' || method === 'choice')) {
    markWrongBtn.hidden = false;
    markWrongBtn.disabled = false;
    markWrongBtn.onclick = markCurrentAsWrong;
  } else {
    markWrongBtn.hidden = true;
  }

  const run = () => {
    reveal.hidden = false;
    document.getElementById('answer-form').hidden = true;
    document.getElementById('submit-btn').hidden = true;
    document.getElementById('choice-grid').hidden = true;
    document.getElementById('hint-btn').hidden = true;
    document.getElementById('choice-btn').hidden = true;
    document.getElementById('giveup-btn').hidden = true;
  };
  delay ? setTimeout(run, 350) : run();
}

document.getElementById('next-btn').addEventListener('click', () => {
  quizState.idx++;
  if (quizState.idx >= quizState.questions.length) {
    finishQuiz();
  } else {
    showQuestion();
  }
});

function finishQuiz() {
  document.getElementById('progress-fill').style.width = '100%';
  document.getElementById('quiz-play').hidden = true;
  document.getElementById('quiz-done').hidden = false;
  document.getElementById('done-score-num').textContent = quizState.correctCount;
  document.getElementById('done-score-total').textContent = quizState.questions.length;
  const list = document.getElementById('done-list');
  list.innerHTML = '';
  quizState.results.forEach((r, i) => list.appendChild(doneItemEl(r, i)));
  refreshWeakRow();
  updateStreakPill();
}
function doneItemEl(r, idx) {
  const w = r.q.word;
  const div = document.createElement('div');
  div.className = 'word-item done-item' + (r.ok ? ' ok' : ' ng');
  div.innerHTML = `
    <div class="wi-head">
      <span class="wi-verb">${escHtml(r.verb)}</span>
      <span class="r-mark">${r.ok ? '○' : '×'}</span>
    </div>`;
  div.addEventListener('click', () => {
    const items = quizState.results.map(rr => ({ verb: rr.verb, ok: rr.ok, word: rr.q.word }));
    openDetailModal(items, idx);
  });
  return div;
}

function findWordByVerb(verb) {
  return allWords().find(w => baseForm(w.verb) === verb);
}

// ===================== 結果詳細モーダル（クイズ結果・苦手語 共通） =====================
let ddItems = [];
let ddIndex = 0;
function openDetailModal(items, idx) {
  ddItems = items;
  ddIndex = idx;
  renderDoneDetail();
  document.getElementById('dd-modal').hidden = false;
}
function closeDoneDetail() {
  document.getElementById('dd-modal').hidden = true;
}
function renderDoneDetail() {
  const it = ddItems[ddIndex];
  const w = it.word;
  document.getElementById('dd-idx').textContent = ddIndex + 1;
  document.getElementById('dd-total').textContent = ddItems.length;
  document.getElementById('dd-prev').disabled = ddIndex === 0;
  document.getElementById('dd-next').disabled = ddIndex === ddItems.length - 1;
  let markHtml;
  if (it.ok === true) markHtml = '<div class="dd-mark ok">○ 正解</div>';
  else if (it.ok === false) markHtml = '<div class="dd-mark ng">× 不正解</div>';
  else markHtml = `<div class="dd-mark ng">★ 苦手な語${it.sub ? '（' + escHtml(it.sub) + '）' : ''}</div>`;
  document.getElementById('dd-body').innerHTML = `
    ${markHtml}
    <div class="dd-verb">${escHtml(it.verb)}</div>
    ${w.ex1 ? `<div class="ex">${escHtml(w.ex1)} <button class="speak-btn" data-text="${escAttr(w.ex1)}">🔊</button></div><div class="ja">${escHtml(w.ja1 || '')}</div>` : ''}
    ${w.ex2 ? `<div class="ex">${escHtml(w.ex2)} <button class="speak-btn" data-text="${escAttr(w.ex2)}">🔊</button></div><div class="ja">${escHtml(w.ja2 || '')}</div>` : ''}
    <div class="def">${escHtml(w.meaning || '')}${w.def ? '／' + escHtml(w.def) : ''}</div>
    ${w.note ? `<div class="def">※ ${escHtml(w.note)}</div>` : ''}
  `;
}
function ddGo(delta) {
  const next = ddIndex + delta;
  if (next < 0 || next >= ddItems.length) return;
  ddIndex = next;
  renderDoneDetail();
}
document.getElementById('dd-prev').addEventListener('click', () => ddGo(-1));
document.getElementById('dd-next').addEventListener('click', () => ddGo(1));
document.getElementById('dd-close').addEventListener('click', closeDoneDetail);
document.getElementById('dd-backdrop').addEventListener('click', closeDoneDetail);

(() => {
  const card = document.getElementById('dd-card');
  let startX = 0, startY = 0, tracking = false;
  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    ddGo(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('quiz-done').hidden = true;
  document.getElementById('quiz-setup').hidden = false;
  refreshWeakRow();
  refreshSrsRow();
});

// ===================== UI: 単語帳 =====================
// ===================== 単語帳：マーク =====================
function loadMarked() { return new Set(loadJSON('pv_marked', [])); }
function saveMarked(set) { saveJSON('pv_marked', [...set]); }
function toggleMarked(verb) {
  const set = loadMarked();
  if (set.has(verb)) set.delete(verb); else set.add(verb);
  saveMarked(set);
  return set.has(verb);
}

function refreshQuizMarkBtn() {
  if (!quizState) return;
  const q = quizState.questions[quizState.idx];
  const on = loadMarked().has(q.answer);
  const btn = document.getElementById('quiz-mark-btn');
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
}
document.getElementById('quiz-mark-btn').addEventListener('click', () => {
  if (!quizState) return;
  const q = quizState.questions[quizState.idx];
  toggleMarked(q.answer);
  refreshQuizMarkBtn();
});

let statusFilter = 'all';
document.querySelectorAll('#status-filter-group .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#status-filter-group .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    statusFilter = chip.dataset.status;
    renderWordList();
  });
});

function renderWordList() {
  const q = document.getElementById('list-search').value.trim().toLowerCase();
  const stage = parseInt(document.getElementById('list-stage-filter').value, 10);
  const sortMode = document.getElementById('list-sort').value;
  const markedOnly = document.getElementById('marked-only-toggle').checked;
  const marked = loadMarked();
  const answered = loadJSON(LS_ANSWERED, {});

  let words = allWords();
  if (stage) words = words.filter(w => w.stage === stage);
  if (q) words = words.filter(w => w.verb.toLowerCase().includes(q) || (w.meaning || '').includes(q));
  if (markedOnly) words = words.filter(w => marked.has(baseForm(w.verb)));
  if (statusFilter !== 'all') {
    words = words.filter(w => {
      const rec = answered[baseForm(w.verb)];
      if (!rec) return false;
      return statusFilter === 'ng' ? rec.ng > 0 : (rec.ng === 0 && rec.ok > 0);
    });
  }

  words = words.slice();
  if (sortMode === 'az') {
    words.sort((a, b) => baseForm(a.verb).toLowerCase().localeCompare(baseForm(b.verb).toLowerCase()));
  } else if (sortMode === 'za') {
    words.sort((a, b) => baseForm(b.verb).toLowerCase().localeCompare(baseForm(a.verb).toLowerCase()));
  } else if (sortMode === 'marked') {
    words.sort((a, b) => {
      const am = marked.has(baseForm(a.verb)) ? 1 : 0;
      const bm = marked.has(baseForm(b.verb)) ? 1 : 0;
      return bm - am;
    });
  }

  const el = document.getElementById('word-list');
  el.innerHTML = '';
  if (!words.length) { el.innerHTML = '<div class="empty-note">該当する語がありません</div>'; return; }
  words.forEach(w => el.appendChild(wordItemEl(w)));
}
function wordItemEl(w) {
  const div = document.createElement('div');
  const verbKey = baseForm(w.verb);
  div.className = 'word-item' + wordStatusClass(verbKey);
  const marked = loadMarked().has(verbKey);
  div.innerHTML = `
    <div class="wi-head">
      <div><span class="wi-verb">${escHtml(w.verb)}</span>${w.mine ? '<span class="wi-badge-mine">マイ単語</span>' : ''}</div>
      <div class="wi-right">
        <button class="wi-mark${marked ? ' on' : ''}" type="button" aria-label="マーク">${marked ? '★' : '☆'}</button>
        <span class="wi-stage">${w.mine ? 'MY' : 'ST.' + w.stage}</span>
      </div>
    </div>
    <div class="wi-meaning">${escHtml(w.meaning || '')}</div>
    <div class="wi-detail">
      ${w.nuance ? `<div class="reveal-nuance">💡 ${escHtml(w.nuance)}</div>` : ''}
      ${w.ex1 ? `<div class="ex">${escHtml(w.ex1)} <button class="speak-btn" data-text="${escAttr(w.ex1)}">🔊</button></div><div class="ja">${escHtml(w.ja1 || '')}</div>` : ''}
      ${w.ex2 ? `<div class="ex">${escHtml(w.ex2)} <button class="speak-btn" data-text="${escAttr(w.ex2)}">🔊</button></div><div class="ja">${escHtml(w.ja2 || '')}</div>` : ''}
      ${w.def ? `<div class="def">${escHtml(w.def)}</div>` : ''}
      ${w.note ? `<div class="def">※ ${escHtml(w.note)}</div>` : ''}
    </div>`;
  div.querySelector('.wi-mark').addEventListener('click', (e) => {
    e.stopPropagation();
    const nowOn = toggleMarked(verbKey);
    e.currentTarget.textContent = nowOn ? '★' : '☆';
    e.currentTarget.classList.toggle('on', nowOn);
  });
  div.addEventListener('click', () => div.classList.toggle('open'));
  return div;
}
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

document.getElementById('list-search').addEventListener('input', renderWordList);
document.getElementById('list-stage-filter').addEventListener('change', renderWordList);
document.getElementById('list-sort').addEventListener('change', renderWordList);
document.getElementById('marked-only-toggle').addEventListener('change', renderWordList);

// ===================== UI: 辞書に追加 =====================
function goToAddDict(verb) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="dict"]').classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-dict').classList.add('active');
  document.getElementById('d-verb').value = verb;
  renderMyWordList();
  renderSharedWordList();
  refreshAiFillBtn();
}

function refreshAiFillBtn() {
  const btn = document.getElementById('ai-fill-btn');
  if (!btn) return;
  btn.hidden = !(typeof AI_WORKER_URL !== 'undefined' && AI_WORKER_URL);
}
refreshAiFillBtn();

document.getElementById('ai-fill-btn').addEventListener('click', async () => {
  const verb = val('d-verb');
  const statusEl = document.getElementById('ai-fill-status');
  if (!verb) { toast('先に句動詞を入力してください'); return; }
  const btn = document.getElementById('ai-fill-btn');
  btn.disabled = true;
  statusEl.hidden = false;
  statusEl.textContent = 'Claudeに問い合わせ中…';
  try {
    const res = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verb }),
    });
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = '自動入力に失敗しました：' + data.error;
    } else {
      document.getElementById('d-meaning').value = data.meaning || '';
      document.getElementById('d-def').value = data.def || '';
      document.getElementById('d-ex1').value = data.ex1 || '';
      document.getElementById('d-ja1').value = data.ja1 || '';
      document.getElementById('d-ex2').value = data.ex2 || '';
      document.getElementById('d-ja2').value = data.ja2 || '';
      statusEl.textContent = '自動入力しました。内容を確認してから追加してください。';
    }
  } catch (e) {
    statusEl.textContent = '通信に失敗しました。時間をおいて再度お試しください。';
  } finally {
    btn.disabled = false;
  }
});

function suggestGroupForMeaning(meaning) {
  const segs = (meaning || '').split(/[、\/／]/).map(s => s.trim()).filter(s => s.length >= 2);
  if (!segs.length) return '';
  for (const w of PV_DATA) {
    if (!w.group) continue;
    const wSegs = (w.meaning || '').split(/[、\/／]/).map(s => s.trim()).filter(s => s.length >= 2);
    if (segs.some(s => wSegs.some(ws => ws.includes(s) || s.includes(ws)))) return w.group;
  }
  return '';
}

document.getElementById('dict-form').addEventListener('submit', e => {
  e.preventDefault();
  const w = {
    verb: val('d-verb'), meaning: val('d-meaning'), def: val('d-def'),
    ex1: val('d-ex1'), ja1: val('d-ja1'), ex2: val('d-ex2'), ja2: val('d-ja2'),
    note: val('d-note'),
  };
  if (!w.verb || !w.meaning) return;
  w.group = suggestGroupForMeaning(w.meaning);
  const list = myWords();
  list.push(w);
  saveJSON(LS.MY_WORDS, list);
  pushMyWordsToCloud();
  e.target.reset();
  toast('辞書に追加しました');
  renderMyWordList();
});
function val(id) { return document.getElementById(id).value.trim(); }

// ===================== UI: 使い分け =====================
function renderNuanceList() {
  const listEl = document.getElementById('nuance-list');
  const q = (document.getElementById('nuance-search').value || '').trim().toLowerCase();
  if (!listEl) return;
  if (typeof GROUP_INFO === 'undefined') { listEl.innerHTML = '<div class="empty-note">グループ情報が読み込めませんでした。</div>'; return; }

  const words = allWords();
  const byGroup = {};
  words.forEach(w => {
    if (!w.group) return;
    if (!byGroup[w.group]) byGroup[w.group] = [];
    byGroup[w.group].push(w);
  });

  const groupIds = Object.keys(GROUP_INFO).filter(gid => (byGroup[gid] || []).length >= 2);
  groupIds.sort((a, b) => GROUP_INFO[a].label.localeCompare(GROUP_INFO[b].label, 'ja'));

  const filtered = groupIds.filter(gid => {
    if (!q) return true;
    const info = GROUP_INFO[gid];
    if (info.label.toLowerCase().includes(q)) return true;
    return (byGroup[gid] || []).some(w => baseForm(w.verb).toLowerCase().includes(q));
  });

  listEl.innerHTML = '';
  if (!filtered.length) { listEl.innerHTML = '<div class="empty-note">該当するグループがありません。</div>'; return; }

  filtered.forEach(gid => {
    const info = GROUP_INFO[gid];
    const members = byGroup[gid];
    const card = document.createElement('div');
    card.className = 'nuance-card';
    const verbsHtml = members.map(w => `<span class="nuance-verb-chip">${escHtml(baseForm(w.verb))}</span>`).join('');
    card.innerHTML = `
      <div class="nuance-label">${escHtml(info.label)}</div>
      <div class="nuance-verbs">${verbsHtml}</div>
      <div class="nuance-note">${escHtml(info.note)}</div>
    `;
    listEl.appendChild(card);
  });
}
document.getElementById('nuance-search').addEventListener('input', renderNuanceList);

function renderMyWordList() {
  const list = myWords();
  document.getElementById('my-count').textContent = list.length;
  const el = document.getElementById('my-word-list');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div class="empty-note">まだ追加した単語はありません</div>'; return; }
  list.slice().reverse().forEach((w, i) => {
    const item = wordItemEl({ ...w, mine: true });
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除'; delBtn.className = 'btn-ghost';
    delBtn.style.marginTop = '8px'; delBtn.style.width = '100%';
    delBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      const idx = list.length - 1 - i;
      list.splice(idx, 1);
      saveJSON(LS.MY_WORDS, list);
      pushMyWordsToCloud();
      renderMyWordList();
      toast('削除しました');
    });
    item.querySelector('.wi-detail').appendChild(delBtn);
    el.appendChild(item);
  });
}

function renderSharedWordList() {
  const db = initFirebase();
  const listEl = document.getElementById('shared-word-list');
  const emptyEl = document.getElementById('shared-word-empty');
  if (!listEl) return;
  if (!db) { listEl.innerHTML = ''; if (emptyEl) emptyEl.hidden = true; return; }
  const me = getNickname();
  db.ref('users').get().then(snap => {
    const all = snap.val() || {};
    const items = [];
    Object.entries(all).forEach(([name, u]) => {
      if (name === me) return; // 自分の分は「追加した単語」に出るのでここでは除く
      const words = (u && u.myWords) || [];
      words.forEach(w => { if (w && w.verb) items.push({ ...w, author: name }); });
    });
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = items.length > 0;
    items.forEach(w => listEl.appendChild(sharedWordItemEl(w)));
  }).catch(() => {});
}

function sharedWordItemEl(w) {
  const div = wordItemEl({ ...w, mine: true });
  const verbSpan = div.querySelector('.wi-verb');
  if (verbSpan) {
    const badge = document.createElement('span');
    badge.className = 'wi-badge-author';
    badge.textContent = '作成者：' + w.author;
    verbSpan.after(badge);
  }
  const mineBadge = div.querySelector('.wi-badge-mine');
  if (mineBadge) mineBadge.remove(); // 元のwordItemElが付ける「マイ単語」表記は不要
  const detail = div.querySelector('.wi-detail');
  if (detail) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-ghost btn-block';
    copyBtn.textContent = '自分の単語帳にコピー';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copySharedWord(w);
    });
    detail.appendChild(copyBtn);
  }
  return div;
}

function copySharedWord(w) {
  if (!getNickname()) { toast('先にランキングで表示名を設定してください'); return; }
  const list = myWords();
  const already = list.some(x => (x.verb || '').trim().toLowerCase() === (w.verb || '').trim().toLowerCase());
  if (already) { toast('すでに同じ句動詞が単語帳にあります'); return; }
  const { author, mine, ...rest } = w;
  list.push(rest);
  saveJSON(LS.MY_WORDS, list);
  pushMyWordsToCloud();
  toast('自分の単語帳にコピーしました');
  renderMyWordList();
}

// ===================== UI: 記録 =====================
function renderStats() {
  const log = loadJSON(LS.LOG, {});
  let total = 0, correct = 0;
  Object.values(log).forEach(d => { total += d.solved; correct += d.correct; });
  const todayLog = log[todayKey()] || { solved: 0, correct: 0 };
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-today').textContent = todayLog.solved || 0;
  document.getElementById('stat-accuracy').textContent = todayLog.solved ? Math.round(100 * todayLog.correct / todayLog.solved) + '%' : '–';
  document.getElementById('stat-streak').textContent = calcStreak(log);

  const chart = document.getElementById('bar-chart');
  chart.innerHTML = '';
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(todayKey(i));
  const max = Math.max(1, ...days.map(d => (log[d] || {}).solved || 0));

  const axis = document.getElementById('bar-axis');
  const steps = 4;
  const axisLabels = [];
  for (let i = steps; i >= 0; i--) axisLabels.push(Math.round(max * i / steps));
  axis.innerHTML = axisLabels.map(n => `<div>${n}</div>`).join('');

  days.forEach(d => {
    const solved = (log[d] || {}).solved || 0;
    const col = document.createElement('div');
    col.className = 'bar-col';
    const h = Math.max(2, Math.round(80 * solved / max));
    const label = d.slice(8, 10);
    col.innerHTML = `<div class="bar" style="height:${h}px" title="${d}: ${solved}問"></div><div class="bar-day">${label}</div>`;
    chart.appendChild(col);
  });

  const weak = loadJSON(LS.WEAK, {});
  const keys = Object.keys(weak);
  document.getElementById('weak-total').textContent = keys.length;
  const wl = document.getElementById('weak-list');
  wl.innerHTML = '';
  document.getElementById('weak-empty').hidden = keys.length > 0;
  keys.sort((a, b) => {
    const sa = weak[a].wrong * 3 + weak[a].choice * 2 + weak[a].hint;
    const sb = weak[b].wrong * 3 + weak[b].choice * 2 + weak[b].hint;
    return sb - sa;
  }).forEach(k => {
    const w = weak[k];
    const heavy = (w.wrong + w.choice) > 0;
    const chip = document.createElement('span');
    chip.className = 'weak-chip' + (heavy ? '' : ' hint');
    const parts = [];
    if (w.wrong) parts.push('誤答' + w.wrong);
    if (w.choice) parts.push('4択' + w.choice);
    if (w.hint) parts.push('ヒント' + w.hint);
    const sub = parts.join(' ');
    chip.textContent = k + ' ×' + sub;
    chip.addEventListener('click', () => {
      const sortedKeys = keys.slice();
      const items = sortedKeys.map(kk => {
        const ww = weak[kk];
        const p = [];
        if (ww.wrong) p.push('誤答' + ww.wrong);
        if (ww.choice) p.push('4択' + ww.choice);
        if (ww.hint) p.push('ヒント' + ww.hint);
        return { verb: kk, ok: null, sub: p.join(' '), word: findWordByVerb(kk) };
      }).filter(it => it.word);
      const idx = items.findIndex(it => it.verb === k);
      if (idx === -1) { toast('この語の例文データが見つかりませんでした'); return; }
      openDetailModal(items, idx);
    });
    wl.appendChild(chip);
  });
}
function calcStreak(log) {
  let streak = 0;
  for (let i = 0; ; i++) {
    const key = todayKey(i);
    if (log[key] && log[key].solved > 0) streak++;
    else { if (i === 0) continue; break; }
  }
  return streak;
}
function updateStreakPill() {
  const log = loadJSON(LS.LOG, {});
  document.getElementById('streak-num').textContent = calcStreak(log);
}
updateStreakPill();

// ===================== 連続日数お祝いポップアップ =====================
function streakMessage(n) {
  if (n >= 30) return 'ものすごい継続力です！このペースを大事にしていきましょう。';
  if (n >= 14) return '2週間連続、素晴らしいです！';
  if (n >= 7) return '1週間連続達成です！';
  if (n >= 3) return '3日以上連続、いい調子です！';
  return 'この調子で続けましょう！';
}
function maybeShowStreakCelebration() {
  const streak = calcStreak(loadJSON(LS.LOG, {}));
  if (streak < 2) return;
  const today = todayKey();
  if (localStorage.getItem('pv_streak_popup_date') === today) return;
  localStorage.setItem('pv_streak_popup_date', today);
  document.getElementById('streak-popup-title').textContent = `${streak}日連続！`;
  document.getElementById('streak-popup-msg').textContent = streakMessage(streak);
  document.getElementById('streak-popup').hidden = false;
}
document.getElementById('streak-popup-close').addEventListener('click', () => {
  document.getElementById('streak-popup').hidden = true;
});
document.getElementById('streak-popup-backdrop').addEventListener('click', () => {
  document.getElementById('streak-popup').hidden = true;
});
maybeShowStreakCelebration();

// ===================== ランキング =====================
function initFirebase() {
  if (fbDB) return fbDB;
  if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) return null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    fbDB = firebase.database();
  } catch (e) { fbDB = null; }
  return fbDB;
}

function getNickname() { return localStorage.getItem('pv_nickname') || ''; }
function ensureNickname() {
  let n = getNickname();
  if (!n) {
    n = window.prompt('ランキングに表示する名前を入力してください（後で「変更」から直せます）', '');
    if (n) {
      n = n.trim().slice(0, 20);
      if (n) { localStorage.setItem('pv_nickname', n); pullAndMergeCloud(n); }
    }
  }
  return getNickname();
}

function sanitizeKey(k) { return String(k).replace(/[.#$/\[\]]/g, '_'); }

function pushMyWordsToCloud() {
  const db = initFirebase();
  if (!db) return;
  const nickname = getNickname();
  if (!nickname) return;
  db.ref(`users/${nickname}/myWords`).set(myWords()).catch(() => {});
}

function pullAndMergeCloud(nickname) {
  const db = initFirebase();
  if (!db || !nickname) return;

  db.ref(`users/${nickname}`).get().then(snap => {
    const cloud = snap.val() || {};
    let changed = false;

    if (cloud.weak && typeof cloud.weak === 'object') {
      const localWeak = loadJSON(LS.WEAK, {});
      let sub = false;
      Object.entries(cloud.weak).forEach(([verb, cw]) => {
        if (!cw || localWeak[verb]) return;
        localWeak[verb] = { hint: cw.hint || 0, choice: cw.choice || 0, wrong: cw.wrong || 0, okStreak: cw.okStreak || 0 };
        sub = true;
      });
      if (sub) { saveJSON(LS.WEAK, localWeak); changed = true; }
    }

    if (cloud.log && typeof cloud.log === 'object') {
      const localLog = loadJSON(LS.LOG, {});
      let sub = false;
      Object.entries(cloud.log).forEach(([date, cl]) => {
        if (!cl) return;
        const curSolved = (localLog[date] && localLog[date].solved) || 0;
        const curCorrect = (localLog[date] && localLog[date].correct) || 0;
        const newSolved = Math.max(curSolved, cl.solved || 0);
        const newCorrect = Math.max(curCorrect, cl.correct || 0);
        if (!localLog[date] || newSolved !== curSolved || newCorrect !== curCorrect) {
          localLog[date] = { solved: newSolved, correct: newCorrect };
          sub = true;
        }
      });
      if (sub) { saveJSON(LS.LOG, localLog); changed = true; }
    }

    if (cloud.answered && typeof cloud.answered === 'object') {
      const localAnswered = loadJSON(LS_ANSWERED, {});
      let sub = false;
      Object.entries(cloud.answered).forEach(([verb, ca]) => {
        if (!ca) return;
        const curOk = (localAnswered[verb] && localAnswered[verb].ok) || 0;
        const curNg = (localAnswered[verb] && localAnswered[verb].ng) || 0;
        const newOk = Math.max(curOk, ca.ok || 0);
        const newNg = Math.max(curNg, ca.ng || 0);
        if (!localAnswered[verb] || newOk !== curOk || newNg !== curNg) {
          localAnswered[verb] = { ok: newOk, ng: newNg };
          sub = true;
        }
      });
      if (sub) { saveJSON(LS_ANSWERED, localAnswered); changed = true; }
    }

    if (Array.isArray(cloud.myWords) && cloud.myWords.length) {
      const map = new Map();
      myWords().forEach(w => { if (w && w.verb) map.set(w.verb.trim().toLowerCase(), w); });
      let sub = false;
      cloud.myWords.forEach(w => {
        if (!w || !w.verb) return;
        const key = w.verb.trim().toLowerCase();
        if (!map.has(key)) { map.set(key, w); sub = true; }
      });
      if (sub) { saveJSON(LS.MY_WORDS, [...map.values()]); changed = true; }
    }

    if (changed) {
      refreshWeakRow();
      updateStreakPill();
      const statsView = document.getElementById('view-stats');
      if (statsView && statsView.classList.contains('active')) renderStats();
      const dictView = document.getElementById('view-dict');
      if (dictView && dictView.classList.contains('active')) renderMyWordList();
      const listView = document.getElementById('view-list');
      if (listView && listView.classList.contains('active')) renderWordList();
      toast('前回までの記録を引き継ぎました');
      maybeShowStreakCelebration();
    }
  }).catch(() => {});
}

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function syncLeaderboard(verb, ok) {
  const db = initFirebase();
  if (!db) return;
  const nickname = ensureNickname();
  if (!nickname) return;
  const today = todayKey();
  const updates = {};
  // 日別ログ（アトミック加算）だけを唯一の情報源にする。ランキングの日/週/月は
  // すべてこのログを都度集計して求めるので、別カウンターとのズレが起きない。
  updates[`users/${nickname}/log/${today}/solved`] = firebase.database.ServerValue.increment(1);
  if (ok) updates[`users/${nickname}/log/${today}/correct`] = firebase.database.ServerValue.increment(1);
  if (verb) {
    const safeVerb = sanitizeKey(verb);
    const field = ok ? 'ok' : 'ng';
    updates[`answers/${nickname}/${safeVerb}/${field}`] = firebase.database.ServerValue.increment(1);
    // 苦手語・回答履歴は「今回の単語だけ」を書き込み、他の単語のデータを巻き込まない
    const weak = loadJSON(LS.WEAK, {});
    updates[`users/${nickname}/weak/${safeVerb}`] = weak[verb] || null;
    const answered = loadJSON(LS_ANSWERED, {});
    updates[`users/${nickname}/answered/${safeVerb}`] = answered[verb] || null;
  }
  updates[`users/${nickname}/myWords`] = myWords();
  db.ref().update(updates).catch(() => {});
}

let lbPeriod = 'day';

function isDateInCurrentWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  return weekKey(new Date(y, m - 1, d)) === weekKey();
}

function pushWordStateToCloud(verb) {
  const db = initFirebase();
  if (!db) return;
  const nickname = getNickname();
  if (!nickname) return;
  const safeVerb = sanitizeKey(verb);
  const weak = loadJSON(LS.WEAK, {});
  const answered = loadJSON(LS_ANSWERED, {});
  const updates = {};
  updates[`users/${nickname}/weak/${safeVerb}`] = weak[verb] || null;
  updates[`users/${nickname}/answered/${safeVerb}`] = answered[verb] || null;
  db.ref().update(updates).catch(() => {});
}

function markCurrentAsWrong() {
  if (!quizState) return;
  const q = quizState.questions[quizState.idx];
  if (!q || !q.resolved) return;
  const verb = q.answer;

  const weak = loadJSON(LS.WEAK, {});
  if (!weak[verb]) weak[verb] = { hint: 0, choice: 0, wrong: 0, okStreak: 0 };
  weak[verb].wrong = (weak[verb].wrong || 0) + 1;
  saveJSON(LS.WEAK, weak);

  const answered = loadJSON(LS_ANSWERED, {});
  if (!answered[verb]) answered[verb] = { ok: 0, ng: 0 };
  answered[verb].ng = (answered[verb].ng || 0) + 1;
  saveJSON(LS_ANSWERED, answered);

  const last = quizState.results[quizState.results.length - 1];
  if (last && last.verb === verb && last.ok) {
    last.ok = false;
    quizState.correctCount = Math.max(0, quizState.correctCount - 1);
  }

  // 正答率のもとになる日別ログも訂正する（ここが抜けていると正答率が実態より高く出続ける）
  const log = loadJSON(LS.LOG, {});
  const today = todayKey();
  if (log[today] && log[today].correct > 0) {
    log[today].correct -= 1;
    saveJSON(LS.LOG, log);
  }
  const db = initFirebase();
  const nickname = getNickname();
  if (db && nickname) {
    db.ref(`users/${nickname}/log/${today}/correct`).set(firebase.database.ServerValue.increment(-1)).catch(() => {});
  }

  refreshWeakRow();
  pushWordStateToCloud(verb);
  const statsView = document.getElementById('view-stats');
  if (statsView && statsView.classList.contains('active')) renderStats();
  const btn = document.getElementById('mark-wrong-btn');
  btn.hidden = true;
  toast('苦手な語として記録しました');
}

function renderLeaderboard() {
  const db = initFirebase();
  const listEl = document.getElementById('leaderboard-list');
  const emptyEl = document.getElementById('leaderboard-empty');
  const setupEl = document.getElementById('leaderboard-setup-note');
  if (!db) {
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    setupEl.hidden = false;
    return;
  }
  setupEl.hidden = true;
  const today = todayKey();
  const ym = monthKey();
  db.ref('users').get().then(snap => {
    const all = snap.val() || {};
    const rows = [];
    Object.entries(all).forEach(([name, u]) => {
      const log = (u && u.log) || {};
      let sum = 0;
      if (lbPeriod === 'day') {
        sum = (log[today] && log[today].solved) || 0;
      } else if (lbPeriod === 'week') {
        Object.entries(log).forEach(([date, d]) => { if (isDateInCurrentWeek(date)) sum += (d && d.solved) || 0; });
      } else {
        Object.entries(log).forEach(([date, d]) => { if (date.startsWith(ym)) sum += (d && d.solved) || 0; });
      }
      if (sum > 0) rows.push([name, sum]);
    });
    rows.sort((a, b) => b[1] - a[1]);
    listEl.innerHTML = '';
    emptyEl.hidden = rows.length > 0;
    const me = getNickname();
    rows.forEach(([name, count], i) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (name === me ? ' me' : '');
      row.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-name">${escHtml(name)}</span><span class="lb-count">${count}</span>`;
      row.addEventListener('click', () => openLbDetail(name));
      listEl.appendChild(row);
    });
  }).catch(() => { listEl.innerHTML = ''; emptyEl.hidden = false; });
}

let ccYear, ccMonth;
let ccAllUsersCache = null;
function initChampionCalState() {
  if (ccYear === undefined) {
    const now = new Date();
    ccYear = now.getFullYear();
    ccMonth = now.getMonth();
  }
}
function nameHue(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function renderChampionCalendar() {
  const db = initFirebase();
  const card = document.getElementById('champion-cal-card');
  const grid = document.getElementById('champion-cal-grid');
  const monthLabel = document.getElementById('champion-cal-month');
  if (!card || !grid) return;
  if (!db) { card.hidden = true; return; }
  card.hidden = false;
  initChampionCalState();

  const year = ccYear, month = ccMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  monthLabel.textContent = `（${year}年${month + 1}月）`;

  db.ref('users').get().then(snap => {
    const all = snap.val() || {};
    ccAllUsersCache = all;
    const champions = {};
    Object.entries(all).forEach(([name, u]) => {
      const log = (u && u.log) || {};
      Object.entries(log).forEach(([date, d]) => {
        const solved = (d && d.solved) || 0;
        if (solved <= 0) return;
        if (!champions[date] || solved > champions[date].solved) {
          champions[date] = { name, solved };
        }
      });
    });

    grid.innerHTML = '';
    ['日', '月', '火', '水', '木', '金', '土'].forEach(h => {
      const el = document.createElement('div');
      el.className = 'champion-cal-dow';
      el.textContent = h;
      grid.appendChild(el);
    });
    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div');
      el.className = 'champion-cal-cell empty';
      grid.appendChild(el);
    }
    const today = todayKey();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const champ = champions[dateStr];
      const cell = document.createElement('div');
      cell.className = 'champion-cal-cell' + (dateStr === today ? ' today' : '');
      let stampHtml = '';
      if (champ) {
        const hue = nameHue(champ.name);
        const style = `color:hsl(${hue},68%,32%); border-color:hsl(${hue},68%,32%); background:hsl(${hue},70%,90%);`;
        stampHtml = `<div class="cc-stamp" style="${style}" title="${escAttr(champ.name)}（${champ.solved}問）">${escHtml(champ.name.slice(0, 4))}</div>`;
      }
      cell.innerHTML = `<div class="cc-day">${d}</div>${stampHtml}`;
      grid.appendChild(cell);
      if (champ) {
        const stampEl = cell.querySelector('.cc-stamp');
        if (stampEl) {
          stampEl.style.cursor = 'pointer';
          stampEl.addEventListener('click', (e) => { e.stopPropagation(); openDayDetail(dateStr); });
        }
      }
    }
  }).catch(() => {});
}

function openDayDetail(dateStr) {
  const modal = document.getElementById('day-detail-modal');
  document.getElementById('day-detail-title').textContent = dateStr + 'の順位';
  const bodyEl = document.getElementById('day-detail-body');
  const all = ccAllUsersCache || {};
  const rows = [];
  Object.entries(all).forEach(([name, u]) => {
    const log = (u && u.log) || {};
    const solved = (log[dateStr] && log[dateStr].solved) || 0;
    if (solved > 0) rows.push([name, solved]);
  });
  rows.sort((a, b) => b[1] - a[1]);
  const me = getNickname();
  bodyEl.innerHTML = rows.length
    ? rows.map(([name, count], i) => `<div class="lb-row${name === me ? ' me' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${escHtml(name)}</span><span class="lb-count">${count}</span></div>`).join('')
    : '<div class="empty-note">この日の記録はありません。</div>';
  modal.hidden = false;
}
document.getElementById('day-detail-close').addEventListener('click', () => {
  document.getElementById('day-detail-modal').hidden = true;
});
document.getElementById('day-detail-backdrop').addEventListener('click', () => {
  document.getElementById('day-detail-modal').hidden = true;
});
document.getElementById('cc-prev').addEventListener('click', () => {
  initChampionCalState();
  ccMonth--;
  if (ccMonth < 0) { ccMonth = 11; ccYear--; }
  renderChampionCalendar();
});
document.getElementById('cc-next').addEventListener('click', () => {
  initChampionCalState();
  ccMonth++;
  if (ccMonth > 11) { ccMonth = 0; ccYear++; }
  renderChampionCalendar();
});

function openLbDetail(name) {
  document.getElementById('lb-detail-name').textContent = name;
  document.getElementById('lb-detail-body').innerHTML = '読み込み中…';
  document.getElementById('lb-detail-modal').hidden = false;
  const db = initFirebase();
  if (!db) return;
  Promise.all([
    db.ref(`users/${name}/log`).get(),
    db.ref(`answers/${name}`).get(),
  ]).then(([logSnap, ansSnap]) => {
    const log = logSnap.val() || {};
    let solved = 0, correct = 0;
    Object.values(log).forEach(d => { solved += (d && d.solved) || 0; correct += (d && d.correct) || 0; });
    const rate = solved ? Math.round(100 * correct / solved) : 0;

    const data = ansSnap.val() || {};
    const weakList = [];
    Object.entries(data).forEach(([verb, rec]) => {
      const n = (rec && rec.ng) || 0;
      if (n > 0) weakList.push({ verb, ng: n });
    });
    weakList.sort((a, b) => b.ng - a.ng);

    const statsHtml = `
      <div class="lb-detail-stats">
        <div class="lb-detail-stat"><div class="n">${solved}</div><div class="l">総回答数</div></div>
        <div class="lb-detail-stat"><div class="n">${solved ? rate + '%' : '–'}</div><div class="l">正答率</div></div>
      </div>`;

    const weakHtml = weakList.length
      ? `<div class="lb-detail-weak-title">間違えた語（${weakList.length}）</div>
         <div class="weak-list">${weakList.map(w => `<span class="weak-chip">${escHtml(w.verb)} ×${w.ng}</span>`).join('')}</div>`
      : `<div class="empty-note">まだ間違えた語の記録がありません。</div>`;

    document.getElementById('lb-detail-body').innerHTML = statsHtml + weakHtml;
  }).catch(() => {
    document.getElementById('lb-detail-body').innerHTML = '<div class="empty-note">取得に失敗しました。</div>';
  });
}
document.getElementById('lb-detail-close').addEventListener('click', () => {
  document.getElementById('lb-detail-modal').hidden = true;
});
document.getElementById('lb-detail-backdrop').addEventListener('click', () => {
  document.getElementById('lb-detail-modal').hidden = true;
});

function updateLbNameDisplay() {
  document.getElementById('lb-my-name').textContent = getNickname() || '未設定';
}
updateLbNameDisplay();

// 名前が設定されていれば、起動のたびにクラウド側の記録で足りない分を補う（既存データは上書きしない）
(() => {
  const nick = getNickname();
  if (nick) pullAndMergeCloud(nick);
})();

document.querySelectorAll('#lb-period-group .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#lb-period-group .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    lbPeriod = chip.dataset.period;
    renderLeaderboard();
  });
});

document.getElementById('lb-rename-btn').addEventListener('click', () => {
  localStorage.removeItem('pv_nickname');
  ensureNickname();
  updateLbNameDisplay();
  renderLeaderboard();
});

// ===================== トースト =====================
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ===================== Service Worker（一時停止） =====================
// キャッシュの不整合が続いたため、開発中はオフライン対応を一時停止し、
// 既存のService Workerとキャッシュを自動で解除する。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}
if ('caches' in window) {
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

