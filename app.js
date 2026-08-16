// ===================== ストレージキー =====================
const LS = {
  MY_WORDS: 'pv_my_words',
  WEAK: 'pv_weak',          // { "verb": {level:'hint'|'choice'|'wrong', streak:0} }
  LOG: 'pv_daily_log',      // { "2026-08-15": {solved:10, correct:8} }
};

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

function buildQuiz(stageFilter, count, useWeak) {
  const words = allWords();
  const weak = loadJSON(LS.WEAK, {});
  const weakVerbs = Object.keys(weak);

  let pool;
  if (stageFilter === 'weak') {
    pool = words.filter(w => weakVerbs.includes(baseForm(w.verb)));
  } else {
    pool = stageFilter ? words.filter(w => w.stage === stageFilter) : words.slice();
  }

  let picks = [];
  if (stageFilter !== 'weak' && useWeak && weakVerbs.length) {
    const weakPool = pool.filter(w => weakVerbs.includes(baseForm(w.verb)));
    shuffle(weakPool);
    const n = Math.min(Math.ceil(count * 0.3), weakPool.length, count);
    picks = weakPool.slice(0, n);
  }
  const rest = pool.filter(w => !picks.includes(w));
  shuffle(rest);
  while (picks.length < count && rest.length) picks.push(rest.shift());
  shuffle(picks);

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

    questions.push({
      word: w, answer: verb, questionHtml: blanked.html, full: blanked.full, ja: blanked.ja,
      meaning: w.meaning, def: w.def, note: w.note, choices,
      resolved: false, method: null, // 'first' | 'hint' | 'choice' | 'wrong'
      hintShown: false,
    });
  }
  return questions;
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
    if (btn.dataset.tab === 'dict') renderMyWordList();
    if (btn.dataset.tab === 'stats') { renderStats(); renderLeaderboard(); updateLbNameDisplay(); }
  });
});

// ===================== UI: クイズセットアップ =====================
function populateStageSelects() {
  const stages = [...new Set(PV_DATA.map(w => w.stage))].sort((a, b) => a - b);
  const sel1 = document.getElementById('quiz-stage');
  const sel2 = document.getElementById('list-stage-filter');
  const weakOption = document.getElementById('weak-option');
  for (const s of stages) {
    const o1 = document.createElement('option'); o1.value = s; o1.textContent = 'Stage ' + s;
    sel1.insertBefore(o1, weakOption);
    const o2 = document.createElement('option'); o2.value = s; o2.textContent = 'Stage ' + s; sel2.appendChild(o2);
  }
}
populateStageSelects();

let quizCount = 10;
document.querySelectorAll('#quiz-count-group .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#quiz-count-group .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    quizCount = parseInt(chip.dataset.count, 10);
  });
});

function refreshWeakRow() {
  const weak = loadJSON(LS.WEAK, {});
  const n = Object.keys(weak).length;
  document.getElementById('weak-count').textContent = n;
  document.getElementById('weak-row').style.display = n > 0 ? 'flex' : 'none';
  const opt = document.getElementById('weak-option');
  opt.textContent = '苦手語のみ（' + n + '語）';
  opt.disabled = n === 0;
  if (n === 0 && document.getElementById('quiz-stage').value === 'weak') {
    document.getElementById('quiz-stage').value = '0';
  }
}
refreshWeakRow();

document.getElementById('quiz-stage').addEventListener('change', (e) => {
  document.getElementById('weak-row').style.display =
    (e.target.value === 'weak' || Object.keys(loadJSON(LS.WEAK, {})).length === 0) ? 'none' : 'flex';
});

document.getElementById('start-quiz').addEventListener('click', () => {
  const raw = document.getElementById('quiz-stage').value;
  const stage = raw === 'weak' ? 'weak' : (parseInt(raw, 10) || 0);
  const useWeak = document.getElementById('weak-toggle').checked;
  const qs = buildQuiz(stage, quizCount, useWeak);
  if (!qs.length) { toast('この範囲では問題が作れませんでした'); return; }
  quizState = { questions: qs, idx: 0, correctCount: 0, results: [] };
  document.getElementById('quiz-setup').hidden = true;
  document.getElementById('quiz-done').hidden = true;
  document.getElementById('quiz-play').hidden = false;
  showQuestion();
});

// ===================== UI: クイズ本体 =====================
function showQuestion() {
  const q = quizState.questions[quizState.idx];
  document.getElementById('q-idx').textContent = quizState.idx + 1;
  document.getElementById('q-total').textContent = quizState.questions.length;
  document.getElementById('progress-fill').style.width = (100 * (quizState.idx) / quizState.questions.length) + '%';
  document.getElementById('card-stage').textContent = q.word.mine ? 'マイ単語' : ('Stage ' + q.word.stage + ' · No.' + q.word.no);
  refreshQuizMarkBtn();
  document.getElementById('question-text').innerHTML = q.questionHtml;
  document.getElementById('ja-preview').textContent = q.ja;
  document.getElementById('hint-box').hidden = true;
  document.getElementById('hint-box').textContent = '';
  document.getElementById('answer-form').hidden = false;
  document.getElementById('answer-input').value = '';
  document.getElementById('choice-grid').hidden = true;
  document.getElementById('choice-grid').innerHTML = '';
  document.getElementById('stamp-result').hidden = true;
  document.getElementById('stamp-result').innerHTML = '';
  document.getElementById('reveal-box').hidden = true;
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
  if (!q.hintShown) {
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
  finishQuestion(false, 'wrong');
});

function switchToChoices() {
  const q = quizState.questions[quizState.idx];
  document.getElementById('answer-form').hidden = true;
  document.getElementById('submit-btn').hidden = true;
  const grid = document.getElementById('choice-grid');
  grid.innerHTML = '';
  q.choices.forEach(c => {
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
  const ok = answerMatches(val, q.answer);
  finishQuestion(ok, ok ? (q.usedHint ? 'hint' : 'first') : 'wrong');
});

function resolveChoice(chosen, btnEl) {
  const q = quizState.questions[quizState.idx];
  const ok = chosen === q.answer;
  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
    else if (b === btnEl) b.classList.add('wrong');
  });
  finishQuestion(ok, ok ? 'choice' : 'wrong', true);
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
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function pickBestVoice() {
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // 名前で分かっている自然な音声（Apple/Google/Microsoftの高品質ボイス）を優先
  const preferredNames = [
    'Samantha', 'Ava', 'Ava (Premium)', 'Ava (Enhanced)', 'Zoe (Premium)', 'Nicky (Premium)',
    'Google US English', 'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)', 'Karen',
  ];
  for (const name of preferredNames) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  // 次点：米語のうち「拡張／プレミアム」を含む名前（iOSでダウンロードした高音質ボイス）
  const enUS = voices.filter(v => v.lang === 'en-US');
  const enhanced = enUS.find(v => /premium|enhanced/i.test(v.name));
  if (enhanced) return enhanced;
  const def = enUS.find(v => v.default);
  if (def) return def;
  if (enUS.length) return enUS[0];
  const en = voices.find(v => v.lang && v.lang.startsWith('en'));
  return en || voices[0];
}
function speak(text) {
  if (!text) return;
  try {
    if (!('speechSynthesis' in window)) { toast('この端末は読み上げに対応していません'); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickBestVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) { /* 無視 */ }
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.speak-btn');
  if (!btn) return;
  e.stopPropagation();
  speak(btn.dataset.text || '');
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

function finishQuestion(ok, method, delay) {
  const q = quizState.questions[quizState.idx];
  q.resolved = true; q.method = method;
  recordResult(q.answer, ok ? method : 'wrong');
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
document.getElementById('dict-form').addEventListener('submit', e => {
  e.preventDefault();
  const w = {
    verb: val('d-verb'), meaning: val('d-meaning'), def: val('d-def'),
    ex1: val('d-ex1'), ja1: val('d-ja1'), ex2: val('d-ex2'), ja2: val('d-ja2'),
    note: val('d-note'),
  };
  if (!w.verb || !w.meaning) return;
  const list = myWords();
  list.push(w);
  saveJSON(LS.MY_WORDS, list);
  pushMyWordsToCloud();
  e.target.reset();
  toast('辞書に追加しました');
  renderMyWordList();
});
function val(id) { return document.getElementById(id).value.trim(); }

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

// ===================== UI: 記録 =====================
function renderStats() {
  const log = loadJSON(LS.LOG, {});
  let total = 0, correct = 0;
  Object.values(log).forEach(d => { total += d.solved; correct += d.correct; });
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-today').textContent = (log[todayKey()] || {}).solved || 0;
  document.getElementById('stat-accuracy').textContent = total ? Math.round(100 * correct / total) + '%' : '–';
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
let fbDB = null;
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

  refreshWeakRow();
  pushWordStateToCloud(verb);
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

