// ===================== バージョン整合性チェック（最優先で実行） =====================
// index.htmlとapp.jsの組み合わせがズレていないかを、他の何よりも先に確認する。
// ズレていた場合、以降のコードで何が起きても分かるよう、まず警告バナーを出す。
(function checkBuildVersion() {
  try {
    const EXPECTED_BUILD = '102'; // ← app.jsのバージョンを上げるたびに、index.htmlのmeta build-versionと必ず揃えること
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
  CUSTOM_GROUPS: 'pv_custom_groups',       // { [customGroupId]: {label, note} } ユーザーが自分で作った使い分けグループ
  GROUP_NOTE_EXTRA: 'pv_group_note_extra', // { [groupId]: "追記文" } 既存グループの解説文への手動追記
  EXTRA_WORD_GROUPS: 'pv_extra_word_groups', // { [no]: [groupId, ...] } 402語の組み込みデータに後から追加されたグループ所属
  GROUP_NOTE_BASE_OVERRIDE: 'pv_group_note_base_override', // { [groupId]: "上書きされた基本解説文" } 組み込みグループ(GROUP_INFO)の基本解説文を書き換えた場合の上書き値。全ユーザー共有(customGroups等と同様)。
  MY_DICT: 'pv_my_dict', // [{ japanese, english, example, exampleJa, note }] 句動詞とは別の日本語→英語単語帳
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
// 単語が属する使い分けグループのidを配列で返す。
// - groups配列（新形式）、旧形式の単一group文字列（後方互換）の両方に対応
// - 402語の組み込みデータについては、後からAI検索などで追加された
//   「追加グループ」（LS.EXTRA_WORD_GROUPS、noをキーに保持）も合算する
function wordGroups(w) {
  const base = Array.isArray(w.groups) ? w.groups.slice() : (w.group ? [w.group] : []);
  if (w.no && typeof w.no !== 'undefined') {
    const extra = loadJSON(LS.EXTRA_WORD_GROUPS, {});
    const extraForWord = extra[w.no];
    if (Array.isArray(extraForWord)) {
      extraForWord.forEach(g => { if (!base.includes(g)) base.push(g); });
    }
  }
  return base;
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
    // 優先条件を満たす語だけのプールから、優先度順にそのまま採用。
    // 同点（苦手語は一律同スコア）だと安定ソートで元のデータ順になり、データ上近い位置に
    // 固まっている似た語ばかり選ばれてしまうため、ソート前に必ずシャッフルしておく。
    shuffle(pool);
    pool.sort((a, b) => priority(a) - priority(b));
    picks = pool.slice(0, count);
  } else if (weakOn || srsOn) {
    // 優先条件を満たす語を最大30%確保し、残りはランダム
    const priorityPool = pool.filter(w => (weakOn && isWeak(w)) || (srsOn && isDue(w)));
    shuffle(priorityPool); // 同点時の並びが常にデータ順に偏らないように
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
  const withKey = arr.map((w, idx) => ({ w, key: wordGroups(w)[0] || ('__none_' + idx) }));
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
  saveJSON(LS.WEAK, weak);
}

// ===================== 単語ごとの回答履歴（単語帳の色分け用） =====================
const LS_ANSWERED = 'pv_answered';
function recordAnswered(verb, ok) {
  const data = loadJSON(LS_ANSWERED, {});
  if (!data[verb]) data[verb] = { ok: 0, ng: 0, totalNg: 0 };
  if (typeof data[verb].totalNg !== 'number') data[verb].totalNg = data[verb].ng || 0; // 旧データ互換：現在の連続誤答分だけは救済
  if (ok) { data[verb].ok++; data[verb].ng = 0; } else { data[verb].ng++; data[verb].totalNg++; }
  saveJSON(LS_ANSWERED, data);
}
// 正答数・通算誤答数（苦手判定用の直近ngとは別に、累積で保持）
function answerCountsOf(verb) {
  const data = loadJSON(LS_ANSWERED, {});
  const rec = data[verb];
  if (!rec) return { ok: 0, ng: 0 };
  const ng = typeof rec.totalNg === 'number' ? rec.totalNg : (rec.ng || 0); // totalNg未生成の語は現在の連続誤答数で代用
  return { ok: rec.ok || 0, ng };
}
function answerStatsHtml(verb) {
  const c = answerCountsOf(verb);
  return `これまで<span class="stat-ok">○${c.ok}回</span>／<span class="stat-ng">×${c.ng}回</span>`;
}
function etymHtml(etymology) {
  const lines = String(etymology).split('\n').map(l => escHtml(l)).join('<br>');
  return `<div class="etym-title"><i>💡</i>語源でおぼえる</div><div class="etym-body">${lines}</div>`;
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
    if (btn.dataset.tab === 'list') { renderWordList(); renderMyWordList(); renderSharedWordList(); pullGlobalGroupDefs(); }
    if (btn.dataset.tab === 'mydict') renderMyDictList();
    if (btn.dataset.tab === 'stats') { renderStats(); renderLeaderboard(); updateLbNameDisplay(); renderChampionCalendar(); }
    if (btn.dataset.tab === 'nuance') { pullGlobalGroupDefs(); renderNuanceList(); }
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
  // 1語が複数グループに属する場合は、そのすべてのグループのバケツに入る
  const byGroup = {};
  words.forEach(w => {
    wordGroups(w).forEach(gid => {
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(w);
    });
  });
  const usableGroups = Object.values(byGroup).filter(arr => arr.length >= 2);
  // グループの大小で優先度をつけると毎回同じ大きいグループ（例：backの「return」）ばかりになるので、
  // サイズでは並べ替えない。代わりに、直近使ったグループを後回しにして連続を防ぐ。
  const recentGroupIds = loadJSON(LS.MATCH_RECENT_GROUPS, []);
  const groupIdOf = arr => wordGroups(arr[0]).find(g => byGroup[g] === arr) || wordGroups(arr[0])[0];
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
  const usedGroupIds = [...new Set(chosen.flatMap(w => wordGroups(w)))];
  if (usedGroupIds.length) {
    let recent = recentGroupIds.filter(g => !usedGroupIds.includes(g));
    recent = recent.concat(usedGroupIds);
    const MAX_RECENT = 3; // 直近3グループ分は次回以降で優先度を下げる
    if (recent.length > MAX_RECENT) recent = recent.slice(recent.length - MAX_RECENT);
    saveJSON(LS.MATCH_RECENT_GROUPS, recent);
  }

  matchState = {
    pairs: chosen.map(w => ({ verb: baseForm(w.verb), meaning: w.meaning, groups: wordGroups(w), nuance: w.nuance || '', hadMistake: false })),
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
  if (!group) return '';
  const customGroups = loadJSON(LS.CUSTOM_GROUPS, {});
  const extraNotes = loadJSON(LS.GROUP_NOTE_EXTRA, {});
  const label = (GROUP_INFO[group] && GROUP_INFO[group].label) || (customGroups[group] && customGroups[group].label);
  if (!label) return '';
  let note = (GROUP_INFO[group] && GROUP_INFO[group].note) || (customGroups[group] && customGroups[group].note) || '';
  if (extraNotes[group]) note = note ? note + '\n（追記）' + extraNotes[group] : extraNotes[group];
  return `<div class="nuance-card">
      <div class="nuance-label">${escHtml(label)}</div>
      <div class="nuance-note">${escHtml(note)}</div>
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
      // 完了時：このラウンドに登場した意味グループをすべてまとめて表示（1語が複数グループのこともある）
      const groups = [...new Set(matchState.pairs.flatMap(p => p.groups || []))];
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
    matchState.pairs.forEach(p => {
      const ok = !p.hadMistake;
      if (ok) recordResult(p.verb, 'first'); // 間違いなく正解＝苦手リストから外す（間違えた分は既に'wrong'で登録済みなので二重処理しない）
      updateSrs(p.verb, ok, false);
      recordAnswered(p.verb, ok);
      logToday(ok);
      syncLeaderboard(p.verb, ok);
    });
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
  if (!matchState.selectedVerb) { toast('先に句動詞を選んでください'); return; }
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
    if (pair) {
      pair.hadMistake = true;
      recordResult(pair.verb, 'wrong'); // 日本語訳を間違えたので、この句動詞を苦手単語に登録する
    }
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
  document.getElementById('reveal-answer-stats').innerHTML = answerStatsHtml(q.answer);
  document.getElementById('reveal-sentence').textContent = q.full;
  document.getElementById('reveal-speak-btn').dataset.text = q.full || '';
  document.getElementById('reveal-ja').textContent = q.ja;
  document.getElementById('reveal-def').textContent = q.def || '';
  const nuanceEl = document.getElementById('reveal-nuance');
  if (q.word.nuance) { nuanceEl.hidden = false; nuanceEl.textContent = '💡 ' + q.word.nuance; } else { nuanceEl.hidden = true; }
  document.getElementById('reveal-structure').innerHTML = structureHtml(q.answer, q.word.ex1, q.word.ex2);
  const noteEl = document.getElementById('reveal-note');
  if (q.note) { noteEl.hidden = false; noteEl.textContent = '※ ' + q.note; } else { noteEl.hidden = true; }
  const etymEl = document.getElementById('reveal-etym');
  if (q.word.etymology) { etymEl.hidden = false; etymEl.innerHTML = etymHtml(q.word.etymology); } else { etymEl.hidden = true; }

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
    const weak = loadJSON(LS.WEAK, {});
    words = words.filter(w => {
      const key = baseForm(w.verb);
      if (statusFilter === 'ng') return !!weak[key]; // クイズ側の「苦手語」と同じ基準（今も苦手かどうか）に統一
      const rec = answered[key];
      // 「得意な語」＝今は苦手リストに入っておらず、かつ一度でも正解したことがある語。
      // 以前は「一度でも間違えたら永久に対象外」だったため、直近で正解して苦手を脱した語が
      // 反映されなかった。苦手リストの判定と揃えることで、直近の正解がすぐ反映されるようにする。
      return !weak[key] && !!rec && rec.ok > 0;
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
      <div class="wi-answer-stats">${answerStatsHtml(verbKey)}</div>
      ${w.nuance ? `<div class="reveal-nuance">💡 ${escHtml(w.nuance)}</div>` : ''}
      ${w.ex1 ? `<div class="ex">${escHtml(w.ex1)} <button class="speak-btn" data-text="${escAttr(w.ex1)}">🔊</button></div><div class="ja">${escHtml(w.ja1 || '')}</div>` : ''}
      ${w.ex2 ? `<div class="ex">${escHtml(w.ex2)} <button class="speak-btn" data-text="${escAttr(w.ex2)}">🔊</button></div><div class="ja">${escHtml(w.ja2 || '')}</div>` : ''}
      ${w.def ? `<div class="def">${escHtml(w.def)}</div>` : ''}
      ${w.note ? `<div class="def">※ ${escHtml(w.note)}</div>` : ''}
      ${w.etymology ? `<div class="etym-box">${etymHtml(w.etymology)}</div>` : ''}
      ${(w.mine && typeof w.no === 'string' && w.no.startsWith('M')) ? '<button type="button" class="btn-ghost btn-block wi-edit-btn">編集する</button>' : ''}
    </div>`;
  div.querySelector('.wi-mark').addEventListener('click', (e) => {
    e.stopPropagation();
    const nowOn = toggleMarked(verbKey);
    e.currentTarget.textContent = nowOn ? '★' : '☆';
    e.currentTarget.classList.toggle('on', nowOn);
  });
  const editBtn = div.querySelector('.wi-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(w.no.slice(1), 10) - 1;
      startEditWord(idx);
    });
  }
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
  document.querySelector('.tab[data-tab="list"]').classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-list').classList.add('active');
  renderWordList();
  renderMyWordList();
  renderSharedWordList();
  openDictFormModal();
  document.getElementById('d-verb').value = verb;
  refreshAiFillBtn();
}
function openDictFormModal() {
  document.getElementById('dict-form-modal').hidden = false;
}
function closeDictFormModal() {
  document.getElementById('dict-form-modal').hidden = true;
  cancelEditWord();
}
document.getElementById('open-dict-form-btn').addEventListener('click', () => {
  cancelEditWord();
  openDictFormModal();
  refreshAiFillBtn();
});
document.getElementById('dict-form-close').addEventListener('click', closeDictFormModal);
document.getElementById('dict-form-backdrop').addEventListener('click', closeDictFormModal);

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
      body: JSON.stringify({ verb, groupOptions: allGroupEntries() }),
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

      let groupLine = '';
      const existingId = data.suggestedGroupId || '';
      const newLabel = data.suggestedNewGroupLabel || '';
      const suggestedNote = data.suggestedGroupNote || '';
      if (existingId && allGroupEntries().some(g => g.id === existingId)) {
        populateGroupExistingSelect();
        const sel = document.getElementById('d-group-existing');
        [...sel.options].forEach(o => { o.selected = o.value === existingId; });
        document.getElementById('d-group-new-label').value = '';
        updateGroupModeUI();
        document.getElementById('d-group-note').value = suggestedNote;
        const label = allGroupEntries().find(g => g.id === existingId).label;
        groupLine = `<br>グループ提案：既存「${escHtml(label)}」（理由：${escHtml(data.groupReason || '')}）`;
      } else if (newLabel) {
        document.getElementById('d-group-new-label').value = newLabel;
        updateGroupModeUI();
        document.getElementById('d-group-note').value = suggestedNote;
        groupLine = `<br>グループ提案：新規「${escHtml(newLabel)}」（理由：${escHtml(data.groupReason || '')}）`;
      }
      statusEl.innerHTML = '自動入力しました。内容を確認してから追加してください。' + groupLine;
    }
  } catch (e) {
    statusEl.textContent = '通信に失敗しました。時間をおいて再度お試しください。';
  } finally {
    btn.disabled = false;
  }
});

// ===================== 使い分けグループ：手動選択 =====================
// 自動判定（文字列一致）は誤判定（例：関係ない語が"批判する"つながりで同じグループに混入する）が
// 起きるため廃止。ユーザーが「グループなし／既存グループ／新規グループ」を明示的に選ぶ方式にする。
function allGroupEntries() {
  const custom = loadJSON(LS.CUSTOM_GROUPS, {});
  const entries = Object.keys(GROUP_INFO || {}).map(id => ({ id, label: GROUP_INFO[id].label }));
  Object.keys(custom).forEach(id => entries.push({ id, label: custom[id].label }));
  entries.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  return entries;
}
function populateGroupExistingSelect() {
  const sel = document.getElementById('d-group-existing');
  if (!sel) return;
  const current = [...sel.selectedOptions].map(o => o.value);
  sel.innerHTML = '';
  allGroupEntries().forEach(({ id, label }) => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = label;
    if (current.includes(id)) opt.selected = true;
    sel.appendChild(opt);
  });
}
populateGroupExistingSelect();
pullGlobalGroupDefs();

let editingWordIndex = null; // nullなら新規追加、数値ならmyWords()内のそのindexを編集中
function currentNoteForGroup(gid) {
  if (!gid) return '';
  const custom = loadJSON(LS.CUSTOM_GROUPS, {});
  if (custom[gid]) return custom[gid].note || '';
  const extra = loadJSON(LS.GROUP_NOTE_EXTRA, {});
  return extra[gid] || '';
}

// 使い分けメモ欄は「新しいグループを作る」時、または（編集時に）既存グループを
// ちょうど1つだけ選んでいる時だけ意味を持つ（複数グループに同じメモを付けるのは不自然なため）
function updateGroupModeUI() {
  const existingSel = document.getElementById('d-group-existing');
  const newLabelInput = document.getElementById('d-group-new-label');
  const noteLabel = document.getElementById('d-group-note-label');
  const noteField = document.getElementById('d-group-note');
  const selectedExisting = [...existingSel.selectedOptions].map(o => o.value);
  const hasNewLabel = !!newLabelInput.value.trim();

  if (hasNewLabel) {
    noteLabel.hidden = false; noteField.hidden = false;
    noteLabel.textContent = 'このグループの使い分け解説（任意）';
    if (!noteField.dataset.userTouched) noteField.value = '';
  } else if (editingWordIndex !== null && selectedExisting.length === 1) {
    noteLabel.hidden = false; noteField.hidden = false;
    noteLabel.textContent = 'このグループの使い分け解説を編集（既存の内容を書き換えます）';
    noteField.value = currentNoteForGroup(selectedExisting[0]);
  } else if (editingWordIndex === null && selectedExisting.length === 1) {
    noteLabel.hidden = false; noteField.hidden = false;
    noteLabel.textContent = '使い分けメモ（このグループの解説に追記されます・任意）';
  } else {
    noteLabel.hidden = true; noteField.hidden = true;
  }
}
document.getElementById('d-group-existing').addEventListener('change', updateGroupModeUI);
document.getElementById('d-group-new-label').addEventListener('input', updateGroupModeUI);
updateGroupModeUI();

function startEditWord(idx) {
  const list = myWords();
  const w = list[idx];
  if (!w) return;
  openDictFormModal();
  refreshAiFillBtn();

  editingWordIndex = idx;
  document.getElementById('d-verb').value = w.verb || '';
  document.getElementById('d-meaning').value = w.meaning || '';
  document.getElementById('d-def').value = w.def || '';
  document.getElementById('d-ex1').value = w.ex1 || '';
  document.getElementById('d-ja1').value = w.ja1 || '';
  document.getElementById('d-ex2').value = w.ex2 || '';
  document.getElementById('d-ja2').value = w.ja2 || '';
  document.getElementById('d-note').value = w.note || '';
  document.getElementById('d-group-new-label').value = '';

  populateGroupExistingSelect();
  const sel = document.getElementById('d-group-existing');
  const currentGroups = wordGroups(w);
  [...sel.options].forEach(o => { o.selected = currentGroups.includes(o.value); });
  updateGroupModeUI();

  document.getElementById('dict-submit-btn').textContent = '更新する';
  document.getElementById('dict-cancel-edit-btn').hidden = false;
  document.getElementById('d-verb').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function cancelEditWord() {
  editingWordIndex = null;
  document.getElementById('dict-form').reset();
  const sel = document.getElementById('d-group-existing');
  [...sel.options].forEach(o => { o.selected = false; });
  updateGroupModeUI();
  document.getElementById('dict-submit-btn').textContent = '辞書に追加';
  document.getElementById('dict-cancel-edit-btn').hidden = true;
}
document.getElementById('dict-cancel-edit-btn').addEventListener('click', cancelEditWord);

document.getElementById('dict-form').addEventListener('submit', e => {
  e.preventDefault();
  const w = {
    verb: val('d-verb'), meaning: val('d-meaning'), def: val('d-def'),
    ex1: val('d-ex1'), ja1: val('d-ja1'), ex2: val('d-ex2'), ja2: val('d-ja2'),
    note: val('d-note'),
  };
  if (!w.verb || !w.meaning) return;

  const isEdit = editingWordIndex !== null;
  const existingSel = document.getElementById('d-group-existing');
  const selectedExisting = [...existingSel.selectedOptions].map(o => o.value);
  const newLabel = val('d-group-new-label');
  const groupNote = val('d-group-note');
  const groups = selectedExisting.slice();
  let newGroupId = null;

  // 既存グループを1つだけ選んでいる場合のメモ欄の扱い（追記 or 編集時の置き換え）
  if (selectedExisting.length === 1 && !newLabel && groupNote) {
    const gid = selectedExisting[0];
    const custom = loadJSON(LS.CUSTOM_GROUPS, {});
    if (isEdit) {
      if (custom[gid]) {
        custom[gid].note = groupNote;
        saveJSON(LS.CUSTOM_GROUPS, custom);
        pushCustomGroupToCloud(gid, custom[gid].label, groupNote);
      } else {
        const extra = loadJSON(LS.GROUP_NOTE_EXTRA, {});
        extra[gid] = groupNote;
        saveJSON(LS.GROUP_NOTE_EXTRA, extra);
        pushGroupNoteExtraToCloud(gid, groupNote);
      }
    } else {
      const extra = loadJSON(LS.GROUP_NOTE_EXTRA, {});
      const merged = extra[gid] ? extra[gid] + '\n' + groupNote : groupNote;
      extra[gid] = merged;
      saveJSON(LS.GROUP_NOTE_EXTRA, extra);
      pushGroupNoteExtraToCloud(gid, merged);
    }
  }

  // 新しいグループの作成
  if (newLabel) {
    newGroupId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const custom = loadJSON(LS.CUSTOM_GROUPS, {});
    custom[newGroupId] = { label: newLabel, note: groupNote || '' };
    saveJSON(LS.CUSTOM_GROUPS, custom);
    pushCustomGroupToCloud(newGroupId, newLabel, groupNote || '');
    groups.push(newGroupId);
  }
  w.groups = groups;

  const list = myWords();
  if (isEdit) {
    if (!list[editingWordIndex]) { toast('編集対象が見つかりませんでした'); return; }
    list[editingWordIndex] = w;
  } else {
    list.push(w);
  }
  saveJSON(LS.MY_WORDS, list);
  pushMyWordsToCloud();

  const wasEdit = isEdit;
  cancelEditWord(); // フォームのリセット・編集状態の解除をまとめて行う
  document.getElementById('dict-form-modal').hidden = true;
  toast(wasEdit ? '更新しました' : '辞書に追加しました');
  renderMyWordList();
  renderWordList();
  populateGroupExistingSelect();
  const nuanceView = document.getElementById('view-nuance');
  if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();

  // 新規グループを作った場合、既存402語＋マイ単語の中にも当てはまる語がないかAIに探させる
  if (newGroupId) findGroupMatchesAndShowModal(newGroupId, newLabel, groupNote || '');
});
function val(id) { return document.getElementById(id).value.trim(); }

// ===================== 新規グループ作成時：既存語からの候補検索（AI） =====================
function findGroupMatchesAndShowModal(groupId, groupLabel, groupNote) {
  if (typeof AI_WORKER_URL === 'undefined' || !AI_WORKER_URL) return; // Worker未設定なら何もしない
  const modal = document.getElementById('group-match-modal');
  modal.dataset.groupId = groupId;
  const body = document.getElementById('group-match-body');
  const noteSection = document.getElementById('group-match-note-section');
  const noteField = document.getElementById('group-match-note');
  modal.hidden = false;
  noteSection.hidden = true;
  body.innerHTML = '<div class="empty-note">既存の語の中に、このグループに合いそうなものがないかClaudeに確認しています…</div>';

  const candidates = allWords()
    .filter(w => !wordGroups(w).includes(groupId))
    .map(w => ({ no: w.no, verb: baseForm(w.verb), meaning: w.meaning }));

  fetch(AI_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'find_group_matches', groupLabel, groupNote, candidates }),
  })
    .then(res => res.json())
    .then(data => {
      const matches = Array.isArray(data.matches) ? data.matches : [];
      if (data.suggestedNote) {
        noteField.value = data.suggestedNote;
        noteSection.hidden = false;
      }
      if (!matches.length) {
        body.innerHTML = '<div class="empty-note">このグループに合いそうな既存の語は見つかりませんでした。</div>';
        document.getElementById('group-match-confirm').hidden = !data.suggestedNote; // 解説だけ保存できるようにする
        return;
      }
      document.getElementById('group-match-confirm').hidden = false;
      body.innerHTML = matches.map((m, i) => `
        <div class="gm-candidate">
          <input type="checkbox" id="gm-check-${i}" data-no="${escHtml(String(m.no))}" checked>
          <label for="gm-check-${i}">
            <div class="gm-candidate-verb">${escHtml(m.verb || '')}</div>
            <div class="gm-candidate-reason">${escHtml(m.reason || '')}</div>
          </label>
        </div>
      `).join('');
    })
    .catch(() => {
      body.innerHTML = '<div class="empty-note">通信に失敗しました。時間をおいて再度お試しください。</div>';
      document.getElementById('group-match-confirm').hidden = true;
    });
}
function closeGroupMatchModal() { document.getElementById('group-match-modal').hidden = true; }
document.getElementById('group-match-close').addEventListener('click', closeGroupMatchModal);
document.getElementById('group-match-backdrop').addEventListener('click', closeGroupMatchModal);
document.getElementById('group-match-skip').addEventListener('click', closeGroupMatchModal);
document.getElementById('group-match-confirm').addEventListener('click', () => {
  const groupId = document.getElementById('group-match-modal').dataset.groupId;
  const checked = [...document.querySelectorAll('#group-match-body input[type="checkbox"]:checked')];
  let addedToBuiltIn = 0, addedToMine = 0;

  if (checked.length) {
    const nos = checked.map(cb => cb.dataset.no);
    const extra = loadJSON(LS.EXTRA_WORD_GROUPS, {});
    const mine = myWords();
    let mineChanged = false;
    nos.forEach(noStr => {
      if (noStr.startsWith('M')) {
        const idx = parseInt(noStr.slice(1), 10) - 1;
        if (mine[idx]) {
          const g = Array.isArray(mine[idx].groups) ? mine[idx].groups.slice() : (mine[idx].group ? [mine[idx].group] : []);
          if (!g.includes(groupId)) { g.push(groupId); mine[idx].groups = g; mineChanged = true; addedToMine++; }
        }
      } else {
        const no = parseInt(noStr, 10);
        if (!extra[no]) extra[no] = [];
        if (!extra[no].includes(groupId)) { extra[no].push(groupId); addedToBuiltIn++; }
        pushWordGroupExtraToCloud(no, extra[no]);
      }
    });
    saveJSON(LS.EXTRA_WORD_GROUPS, extra);
    if (mineChanged) { saveJSON(LS.MY_WORDS, mine); pushMyWordsToCloud(); }
  }

  // AIが提案した（編集済みかもしれない）解説を、グループのnoteとして保存する
  const noteSection = document.getElementById('group-match-note-section');
  let noteUpdated = false;
  if (groupId && !noteSection.hidden) {
    const newNote = document.getElementById('group-match-note').value.trim();
    if (newNote) {
      const custom = loadJSON(LS.CUSTOM_GROUPS, {});
      if (custom[groupId]) {
        custom[groupId].note = newNote;
        saveJSON(LS.CUSTOM_GROUPS, custom);
        pushCustomGroupToCloud(groupId, custom[groupId].label, newNote);
        noteUpdated = true;
      }
    }
  }

  closeGroupMatchModal();
  const addedTotal = addedToBuiltIn + addedToMine;
  if (addedTotal || noteUpdated) {
    const parts = [];
    if (addedTotal) parts.push(`${addedTotal}語をグループに追加`);
    if (noteUpdated) parts.push('解説を更新');
    toast(parts.join('・') + 'しました');
  }
  renderWordList();
  const nuanceView = document.getElementById('view-nuance');
  if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();
});

// ===================== UI: 使い分け =====================
function renderNuanceList() {
  const listEl = document.getElementById('nuance-list');
  const q = (document.getElementById('nuance-search').value || '').trim().toLowerCase();
  if (!listEl) return;
  if (typeof GROUP_INFO === 'undefined') { listEl.innerHTML = '<div class="empty-note">グループ情報が読み込めませんでした。</div>'; return; }

  const customGroups = loadJSON(LS.CUSTOM_GROUPS, {});
  const extraNotes = loadJSON(LS.GROUP_NOTE_EXTRA, {});
  const baseOverrides = loadJSON(LS.GROUP_NOTE_BASE_OVERRIDE, {});
  function labelOf(gid) { return (GROUP_INFO[gid] && GROUP_INFO[gid].label) || (customGroups[gid] && customGroups[gid].label) || gid; }
  function baseNoteOf(gid) {
    if (typeof baseOverrides[gid] === 'string') return baseOverrides[gid];
    return (GROUP_INFO[gid] && GROUP_INFO[gid].note) || (customGroups[gid] && customGroups[gid].note) || '';
  }
  function noteOf(gid) {
    let note = baseNoteOf(gid);
    if (extraNotes[gid]) note = note ? note + '\n（追記）' + extraNotes[gid] : extraNotes[gid];
    return note;
  }

  const words = allWords();
  const byGroup = {};
  words.forEach(w => {
    wordGroups(w).forEach(gid => {
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(w);
    });
  });

  const allGroupIds = [...new Set([...Object.keys(GROUP_INFO), ...Object.keys(customGroups)])];
  const groupIds = allGroupIds.filter(gid => (byGroup[gid] || []).length >= 2);
  groupIds.sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ja'));

  const filtered = groupIds.filter(gid => {
    if (!q) return true;
    if (labelOf(gid).toLowerCase().includes(q)) return true;
    return (byGroup[gid] || []).some(w => baseForm(w.verb).toLowerCase().includes(q));
  });

  listEl.innerHTML = '';
  if (!filtered.length) { listEl.innerHTML = '<div class="empty-note">該当するグループがありません。</div>'; return; }

  filtered.forEach(gid => {
    const members = byGroup[gid];
    const card = document.createElement('div');
    card.className = 'nuance-card';
    const verbsHtml = members.map(w => `<span class="nuance-verb-chip">${escHtml(baseForm(w.verb))}</span>`).join('');
    const isCustom = !!customGroups[gid];
    const editableBase = baseNoteOf(gid);
    const editableExtra = extraNotes[gid] || '';

    const editAreaHtml = isCustom
      ? `<div class="nuance-edit-area" hidden>
          <textarea class="nuance-edit-base">${escHtml(editableBase)}</textarea>
          <div class="nuance-edit-actions">
            <button type="button" class="btn-ghost nuance-edit-cancel">キャンセル</button>
            <button type="button" class="btn-primary nuance-edit-save">保存</button>
          </div>
        </div>`
      : `<div class="nuance-edit-area" hidden>
          <label class="nuance-edit-label">基本解説文</label>
          <textarea class="nuance-edit-base">${escHtml(editableBase)}</textarea>
          <label class="nuance-edit-label">追記メモ</label>
          <textarea class="nuance-edit-extra">${escHtml(editableExtra)}</textarea>
          <div class="nuance-edit-actions">
            <button type="button" class="btn-ghost nuance-edit-cancel">キャンセル</button>
            <button type="button" class="btn-primary nuance-edit-save">保存</button>
          </div>
        </div>`;

    card.innerHTML = `
      <div class="nuance-label">${escHtml(labelOf(gid))}</div>
      <div class="nuance-verbs">${verbsHtml}</div>
      <div class="nuance-note nuance-note-display">${escHtml(noteOf(gid))}</div>
      <button type="button" class="btn-ghost btn-block nuance-edit-btn">解説を編集する</button>
      ${editAreaHtml}
    `;
    const editBtn = card.querySelector('.nuance-edit-btn');
    const editArea = card.querySelector('.nuance-edit-area');
    const baseTextarea = card.querySelector('.nuance-edit-base');
    const extraTextarea = card.querySelector('.nuance-edit-extra'); // isCustomの場合はnull
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      editArea.hidden = !editArea.hidden;
    });
    card.querySelector('.nuance-edit-cancel').addEventListener('click', e => {
      e.stopPropagation();
      baseTextarea.value = editableBase;
      if (extraTextarea) extraTextarea.value = editableExtra;
      editArea.hidden = true;
    });
    card.querySelector('.nuance-edit-save').addEventListener('click', e => {
      e.stopPropagation();
      const newBase = baseTextarea.value.trim();
      if (isCustom) {
        const custom = loadJSON(LS.CUSTOM_GROUPS, {});
        if (custom[gid]) {
          custom[gid].note = newBase;
          saveJSON(LS.CUSTOM_GROUPS, custom);
          pushCustomGroupToCloud(gid, custom[gid].label, newBase);
        }
      } else {
        const originalBase = (GROUP_INFO[gid] && GROUP_INFO[gid].note) || '';
        const overrides = loadJSON(LS.GROUP_NOTE_BASE_OVERRIDE, {});
        if (newBase === originalBase.trim()) {
          delete overrides[gid];
        } else {
          overrides[gid] = newBase;
        }
        saveJSON(LS.GROUP_NOTE_BASE_OVERRIDE, overrides);
        pushGroupNoteBaseOverrideToCloud(gid, overrides[gid]);

        const newExtra = extraTextarea.value.trim();
        const extra = loadJSON(LS.GROUP_NOTE_EXTRA, {});
        if (newExtra) extra[gid] = newExtra; else delete extra[gid];
        saveJSON(LS.GROUP_NOTE_EXTRA, extra);
        pushGroupNoteExtraToCloud(gid, newExtra);
      }
      toast('保存しました');
      renderNuanceList();
    });
    listEl.appendChild(card);
  });
}
document.getElementById('nuance-search').addEventListener('input', renderNuanceList);

// ===================== MY辞書（日本語→英語、句動詞とは別データ） =====================
function myDictWords() { return loadJSON(LS.MY_DICT, []); }

function myDictItemEl(w) {
  const div = document.createElement('div');
  div.className = 'word-item';
  div.innerHTML = `
    <div class="wi-head">
      <div><span class="wi-verb">${escHtml(w.japanese)}</span></div>
      <div class="wi-right"><span class="wi-stage">MY</span></div>
    </div>
    <div class="wi-meaning">${escHtml(w.english || '')} <button class="speak-btn" data-text="${escAttr(w.english || '')}">🔊</button></div>
    <div class="wi-detail">
      ${w.example ? `<div class="ex">${escHtml(w.example)} <button class="speak-btn" data-text="${escAttr(w.example)}">🔊</button></div><div class="ja">${escHtml(w.exampleJa || '')}</div>` : ''}
      ${w.note ? `<div class="def">※ ${escHtml(w.note)}</div>` : ''}
      <button type="button" class="btn-ghost btn-block mydict-edit-btn">編集する</button>
      <button type="button" class="btn-ghost btn-block mydict-delete-btn">削除</button>
    </div>`;
  div.addEventListener('click', () => div.classList.toggle('open'));
  return div;
}

function renderMyDictList() {
  const list = myDictWords();
  const el = document.getElementById('mydict-word-list');
  if (!el) return;
  const q = (document.getElementById('mydict-search').value || '').trim().toLowerCase();
  el.innerHTML = '';
  const filtered = list
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !q || (w.japanese || '').toLowerCase().includes(q) || (w.english || '').toLowerCase().includes(q))
    .reverse();
  if (!filtered.length) { el.innerHTML = '<div class="empty-note">まだ追加した単語はありません</div>'; return; }
  filtered.forEach(({ w, i }) => {
    const item = myDictItemEl(w);
    item.querySelector('.mydict-edit-btn').addEventListener('click', ev => {
      ev.stopPropagation();
      startEditMyDictWord(i);
    });
    item.querySelector('.mydict-delete-btn').addEventListener('click', ev => {
      ev.stopPropagation();
      const cur = myDictWords();
      cur.splice(i, 1);
      saveJSON(LS.MY_DICT, cur);
      pushMyDictToCloud();
      renderMyDictList();
      toast('削除しました');
    });
    el.appendChild(item);
  });
}
document.getElementById('mydict-search').addEventListener('input', renderMyDictList);

let editingMyDictIndex = null; // nullなら新規追加、数値ならmyDictWords()内のそのindexを編集中

function openMyDictFormModal() {
  document.getElementById('mydict-form-modal').hidden = false;
}
function closeMyDictFormModal() {
  document.getElementById('mydict-form-modal').hidden = true;
  cancelEditMyDictWord();
}
document.getElementById('open-mydict-form-btn').addEventListener('click', () => {
  cancelEditMyDictWord();
  openMyDictFormModal();
  refreshMyDictAiFillBtn();
});
document.getElementById('mydict-form-close').addEventListener('click', closeMyDictFormModal);
document.getElementById('mydict-form-backdrop').addEventListener('click', closeMyDictFormModal);

function startEditMyDictWord(idx) {
  const list = myDictWords();
  const w = list[idx];
  if (!w) return;
  openMyDictFormModal();
  refreshMyDictAiFillBtn();

  editingMyDictIndex = idx;
  document.getElementById('md-japanese').value = w.japanese || '';
  document.getElementById('md-english').value = w.english || '';
  document.getElementById('md-example').value = w.example || '';
  document.getElementById('md-example-ja').value = w.exampleJa || '';
  document.getElementById('md-note').value = w.note || '';

  document.getElementById('mydict-submit-btn').textContent = '更新する';
  document.getElementById('mydict-cancel-edit-btn').hidden = false;
}
function cancelEditMyDictWord() {
  editingMyDictIndex = null;
  document.getElementById('mydict-form').reset();
  document.getElementById('mydict-submit-btn').textContent = 'MY辞書に追加';
  document.getElementById('mydict-cancel-edit-btn').hidden = true;
  const statusEl = document.getElementById('mydict-ai-fill-status');
  if (statusEl) { statusEl.hidden = true; statusEl.textContent = ''; }
}
document.getElementById('mydict-cancel-edit-btn').addEventListener('click', cancelEditMyDictWord);

document.getElementById('mydict-form').addEventListener('submit', e => {
  e.preventDefault();
  const w = {
    japanese: val('md-japanese'), english: val('md-english'),
    example: val('md-example'), exampleJa: val('md-example-ja'),
    note: val('md-note'),
  };
  if (!w.japanese || !w.english) return;

  const isEdit = editingMyDictIndex !== null;
  const list = myDictWords();
  if (isEdit) {
    if (!list[editingMyDictIndex]) { toast('編集対象が見つかりませんでした'); return; }
    list[editingMyDictIndex] = w;
  } else {
    list.push(w);
  }
  saveJSON(LS.MY_DICT, list);
  pushMyDictToCloud();

  const wasEdit = isEdit;
  cancelEditMyDictWord();
  document.getElementById('mydict-form-modal').hidden = true;
  toast(wasEdit ? '更新しました' : 'MY辞書に追加しました');
  renderMyDictList();
});

function refreshMyDictAiFillBtn() {
  const btn = document.getElementById('mydict-ai-fill-btn');
  if (!btn) return;
  btn.hidden = !(typeof AI_WORKER_URL !== 'undefined' && AI_WORKER_URL);
}
refreshMyDictAiFillBtn();

document.getElementById('mydict-ai-fill-btn').addEventListener('click', async () => {
  const japanese = val('md-japanese');
  const statusEl = document.getElementById('mydict-ai-fill-status');
  if (!japanese) { toast('先に日本語を入力してください'); return; }
  const btn = document.getElementById('mydict-ai-fill-btn');
  btn.disabled = true;
  statusEl.hidden = false;
  statusEl.textContent = 'Claudeに問い合わせ中…';
  try {
    const res = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'my_dict_fill',
        japanese,
        english: val('md-english'),
        example: val('md-example'),
        exampleJa: val('md-example-ja'),
        note: val('md-note'),
      }),
    });
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = '自動入力に失敗しました：' + data.error;
    } else {
      document.getElementById('md-english').value = data.english || '';
      document.getElementById('md-example').value = data.example || '';
      document.getElementById('md-example-ja').value = data.exampleJa || '';
      document.getElementById('md-note').value = data.note || '';
      statusEl.textContent = '自動入力しました。内容を確認してから追加してください。';
    }
  } catch (e) {
    statusEl.textContent = '通信に失敗しました。時間をおいて再度お試しください。';
  } finally {
    btn.disabled = false;
  }
});

function pushMyDictToCloud() {
  const db = initFirebase();
  if (!db) return;
  const nickname = getNickname();
  if (!nickname) return;
  db.ref(`users/${nickname}/myDict`).set(myDictWords()).catch(() => {});
}

function renderMyWordList() {
  const list = myWords();
  document.getElementById('my-count').textContent = list.length;
  const el = document.getElementById('my-word-list');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div class="empty-note">まだ追加した単語はありません</div>'; return; }
  list.slice().reverse().forEach((w, i) => {
    const item = wordItemEl({ ...w, mine: true });
    const idx = list.length - 1 - i;
    const editBtn = document.createElement('button');
    editBtn.textContent = '編集'; editBtn.className = 'btn-ghost';
    editBtn.style.marginTop = '8px'; editBtn.style.width = '100%';
    editBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      startEditWord(idx);
    });
    item.querySelector('.wi-detail').appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除'; delBtn.className = 'btn-ghost';
    delBtn.style.marginTop = '8px'; delBtn.style.width = '100%';
    delBtn.addEventListener('click', ev => {
      ev.stopPropagation();
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

// 使い分けの「新規グループ」「既存グループへの追記メモ」はユーザー個人のデータではなく、
// 単語データと同じ「共有の参照情報」なので、users/{nickname}配下ではなくトップレベルの
// customGroups / groupNoteExtra に置き、誰の端末からでも同じ内容が見えるようにする。
function pushCustomGroupToCloud(id, label, note) {
  const db = initFirebase();
  if (!db) return;
  db.ref(`customGroups/${id}`).set({ label, note: note || '' }).catch(() => {});
}
function pushGroupNoteExtraToCloud(groupId, mergedText) {
  const db = initFirebase();
  if (!db) return;
  db.ref(`groupNoteExtra/${groupId}`).set(mergedText).catch(() => {});
}
function pushGroupNoteBaseOverrideToCloud(groupId, text) {
  const db = initFirebase();
  if (!db) return;
  if (text === undefined) {
    db.ref(`groupNoteBaseOverride/${groupId}`).remove().catch(() => {});
  } else {
    db.ref(`groupNoteBaseOverride/${groupId}`).set(text).catch(() => {});
  }
}
function pushWordGroupExtraToCloud(no, groupIdsArray) {
  const db = initFirebase();
  if (!db) return;
  db.ref(`wordGroupExtra/${no}`).set(groupIdsArray).catch(() => {});
}
function pullGlobalGroupDefs() {
  const db = initFirebase();
  if (!db) return;
  db.ref('customGroups').get().then(snap => {
    const cloud = snap.val() || {};
    const local = loadJSON(LS.CUSTOM_GROUPS, {});
    let changed = false;
    Object.entries(cloud).forEach(([id, v]) => {
      if (!v || local[id]) return;
      local[id] = { label: v.label || id, note: v.note || '' };
      changed = true;
    });
    if (changed) {
      saveJSON(LS.CUSTOM_GROUPS, local);
      populateGroupExistingSelect();
      const nuanceView = document.getElementById('view-nuance');
      if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();
    }
  }).catch(() => {});
  db.ref('groupNoteExtra').get().then(snap => {
    const cloud = snap.val() || {};
    const local = loadJSON(LS.GROUP_NOTE_EXTRA, {});
    let changed = false;
    Object.entries(cloud).forEach(([gid, cloudText]) => {
      if (!cloudText) return;
      const localText = local[gid] || '';
      const localLines = localText ? localText.split('\n') : [];
      const cloudLines = cloudText.split('\n');
      const merged = [...new Set([...localLines, ...cloudLines].filter(Boolean))].join('\n');
      if (merged !== localText) { local[gid] = merged; changed = true; }
    });
    if (changed) {
      saveJSON(LS.GROUP_NOTE_EXTRA, local);
      const nuanceView = document.getElementById('view-nuance');
      if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();
    }
  }).catch(() => {});
  db.ref('wordGroupExtra').get().then(snap => {
    const cloud = snap.val() || {};
    const local = loadJSON(LS.EXTRA_WORD_GROUPS, {});
    let changed = false;
    Object.entries(cloud).forEach(([no, cloudGroups]) => {
      if (!Array.isArray(cloudGroups)) return;
      const localForNo = local[no] || [];
      const merged = [...new Set([...localForNo, ...cloudGroups])];
      if (merged.length !== localForNo.length) { local[no] = merged; changed = true; }
    });
    if (changed) {
      saveJSON(LS.EXTRA_WORD_GROUPS, local);
      renderWordList();
      const nuanceView = document.getElementById('view-nuance');
      if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();
    }
  }).catch(() => {});
  db.ref('groupNoteBaseOverride').get().then(snap => {
    const cloud = snap.val() || {};
    const local = loadJSON(LS.GROUP_NOTE_BASE_OVERRIDE, {});
    let changed = false;
    Object.entries(cloud).forEach(([gid, text]) => {
      if (typeof text !== 'string' || typeof local[gid] === 'string') return;
      local[gid] = text;
      changed = true;
    });
    if (changed) {
      saveJSON(LS.GROUP_NOTE_BASE_OVERRIDE, local);
      const nuanceView = document.getElementById('view-nuance');
      if (nuanceView && nuanceView.classList.contains('active')) renderNuanceList();
    }
  }).catch(() => {});
}

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

    if (cloud.srs && typeof cloud.srs === 'object') {
      const localSrs = loadJSON(LS.SRS, {});
      let sub = false;
      Object.entries(cloud.srs).forEach(([verb, cs]) => {
        if (!cs || localSrs[verb]) return;
        localSrs[verb] = { interval: cs.interval || 1, dueDate: cs.dueDate || todayKey(), reps: cs.reps || 0 };
        sub = true;
      });
      if (sub) { saveJSON(LS.SRS, localSrs); changed = true; }
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
        const curTotalNg = (localAnswered[verb] && typeof localAnswered[verb].totalNg === 'number') ? localAnswered[verb].totalNg : ((localAnswered[verb] && localAnswered[verb].ng) || 0);
        const newOk = Math.max(curOk, ca.ok || 0);
        const newNg = Math.max(curNg, ca.ng || 0);
        const caTotalNg = typeof ca.totalNg === 'number' ? ca.totalNg : (ca.ng || 0);
        const newTotalNg = Math.max(curTotalNg, caTotalNg);
        if (!localAnswered[verb] || newOk !== curOk || newNg !== curNg || newTotalNg !== curTotalNg) {
          localAnswered[verb] = { ok: newOk, ng: newNg, totalNg: newTotalNg };
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

    if (Array.isArray(cloud.myDict) && cloud.myDict.length) {
      const map = new Map();
      myDictWords().forEach(w => { if (w && w.japanese) map.set(w.japanese.trim().toLowerCase(), w); });
      let sub = false;
      cloud.myDict.forEach(w => {
        if (!w || !w.japanese) return;
        const key = w.japanese.trim().toLowerCase();
        if (!map.has(key)) { map.set(key, w); sub = true; }
      });
      if (sub) { saveJSON(LS.MY_DICT, [...map.values()]); changed = true; }
    }

    if (changed) {
      refreshWeakRow();
      updateStreakPill();
      const statsView = document.getElementById('view-stats');
      if (statsView && statsView.classList.contains('active')) renderStats();
      const listView = document.getElementById('view-list');
      if (listView && listView.classList.contains('active')) { renderWordList(); renderMyWordList(); }
      const mydictView = document.getElementById('view-mydict');
      if (mydictView && mydictView.classList.contains('active')) renderMyDictList();
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
    // 復習（SRS）データもクラウドに保存。ローカルのキャッシュだけに依存すると
    // 端末やブラウザのキャッシュを消した時に復習間隔がリセットされてしまうため。
    const srs = loadJSON(LS.SRS, {});
    updates[`users/${nickname}/srs/${safeVerb}`] = srs[verb] || null;
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
  if (!answered[verb]) answered[verb] = { ok: 0, ng: 0, totalNg: 0 };
  answered[verb].ng = (answered[verb].ng || 0) + 1;
  answered[verb].totalNg = (answered[verb].totalNg || 0) + 1;
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

function deleteCloudUser(name) {
  const db = initFirebase();
  if (!db || !name) return;
  db.ref(`users/${name}`).remove().catch(() => {});
  db.ref(`answers/${name}`).remove().catch(() => {});
}

document.getElementById('lb-rename-btn').addEventListener('click', () => {
  const oldName = getNickname();
  if (oldName) {
    const ok = window.confirm(`名前を変更すると、古い名前「${oldName}」の記録（ランキング等）はクラウドから完全に削除されます。よろしいですか？\n（このデバイスに残っているクイズの記録・苦手単語などのローカルデータは消えません）`);
    if (!ok) return;
    deleteCloudUser(oldName);
  }
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

