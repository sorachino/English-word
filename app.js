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
function blankSentence(sentence, verb) {
  if (!sentence) return null;
  const parts = baseForm(verb).split(' ');
  const head = parts[0], tail = parts.slice(1);
  let pat = '\\b' + headPattern(head.toLowerCase());
  for (const t of tail) pat += '(?:\\s+\\w+){0,3}\\s+' + esc(t);
  const re = new RegExp(pat, 'i');
  const m = sentence.match(re);
  if (!m) return null;
  const start = m.index, end = start + m[0].length;
  return sentence.slice(0, start) + '<b>( ? )</b>' + sentence.slice(end);
}

// ===================== クイズエンジン =====================
let quizState = null;

function buildQuiz(stageFilter, count, useWeak) {
  const words = allWords();
  let pool = stageFilter ? words.filter(w => w.stage === stageFilter) : words.slice();

  const weak = loadJSON(LS.WEAK, {});
  const weakVerbs = Object.keys(weak);
  let picks = [];

  if (useWeak && weakVerbs.length) {
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
    const same = allVerbs.filter(v => v.toLowerCase().startsWith(head + ' ') && v !== verb);
    const others = allVerbs.filter(v => v !== verb && !same.includes(v));
    shuffle(same); shuffle(others);
    const distractors = same.concat(others).slice(0, 3);
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
  if (method === 'first') {
    if (weak[verb]) {
      weak[verb].okStreak = (weak[verb].okStreak || 0) + 1;
      if (weak[verb].okStreak >= 2) delete weak[verb];
    }
  } else {
    const lvl = method === 'hint' ? 'hint' : (method === 'choice' ? 'choice' : 'wrong');
    if (!weak[verb]) weak[verb] = { hint: 0, choice: 0, wrong: 0, okStreak: 0 };
    weak[verb][lvl] = (weak[verb][lvl] || 0) + 1;
    weak[verb].okStreak = 0;
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
  return d.toISOString().slice(0, 10);
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
    if (btn.dataset.tab === 'stats') renderStats();
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
}
refreshWeakRow();

document.getElementById('start-quiz').addEventListener('click', () => {
  const stage = parseInt(document.getElementById('quiz-stage').value, 10);
  const useWeak = document.getElementById('weak-toggle').checked;
  const qs = buildQuiz(stage || 0, quizCount, useWeak);
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
  document.getElementById('question-text').innerHTML = q.questionHtml;
  document.getElementById('hint-box').hidden = true;
  document.getElementById('hint-box').textContent = '';
  document.getElementById('answer-form').hidden = false;
  document.getElementById('answer-input').value = '';
  document.getElementById('choice-grid').hidden = true;
  document.getElementById('choice-grid').innerHTML = '';
  document.getElementById('stamp-result').hidden = true;
  document.getElementById('stamp-result').innerHTML = '';
  document.getElementById('reveal-box').hidden = true;
  document.getElementById('choice-btn').disabled = false;
  document.getElementById('hint-btn').disabled = false;
  setTimeout(() => document.getElementById('answer-input').focus(), 50);
}

document.getElementById('hint-btn').addEventListener('click', () => {
  const q = quizState.questions[quizState.idx];
  const box = document.getElementById('hint-box');
  if (!q.hintShown) {
    box.textContent = '和訳: ' + q.ja;
    q.hintShown = 1;
  } else if (q.hintShown === 1) {
    box.textContent = '意味: ' + q.meaning + (q.def ? '（' + q.def + '）' : '');
    q.hintShown = 2;
  } else {
    box.textContent = '単語数: ' + q.answer.split(' ').length + '語';
  }
  box.hidden = false;
  q.usedHint = true;
});

document.getElementById('choice-btn').addEventListener('click', () => switchToChoices());
function switchToChoices() {
  const q = quizState.questions[quizState.idx];
  document.getElementById('answer-form').hidden = true;
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

function finishQuestion(ok, method, delay) {
  const q = quizState.questions[quizState.idx];
  q.resolved = true; q.method = method;
  recordResult(q.answer, ok ? method : 'wrong');
  logToday(ok);
  if (ok) quizState.correctCount++;
  quizState.results.push({ verb: q.answer, ok });

  const stamp = document.getElementById('stamp-result');
  stamp.hidden = false;
  stamp.innerHTML = `<div class="stamp ${ok ? 'ok' : 'ng'}">${ok ? '正解' : '不正解'}</div>`;

  const reveal = document.getElementById('reveal-box');
  document.getElementById('reveal-verb').textContent = q.answer;
  document.getElementById('reveal-sentence').textContent = q.full;
  document.getElementById('reveal-ja').textContent = q.ja;
  document.getElementById('reveal-def').textContent = q.def || '';
  const noteEl = document.getElementById('reveal-note');
  if (q.note) { noteEl.hidden = false; noteEl.textContent = '※ ' + q.note; } else { noteEl.hidden = true; }

  const run = () => { reveal.hidden = false; document.getElementById('answer-form').hidden = true; document.getElementById('choice-grid').hidden = true; document.getElementById('hint-btn').disabled = true; document.getElementById('choice-btn').disabled = true; };
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
  quizState.results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'done-row ' + (r.ok ? 'ok' : 'ng');
    row.innerHTML = `<span class="r-verb">${r.verb}</span><span class="r-mark">${r.ok ? '○' : '×'}</span>`;
    list.appendChild(row);
  });
  refreshWeakRow();
  updateStreakPill();
}
document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('quiz-done').hidden = true;
  document.getElementById('quiz-setup').hidden = false;
  refreshWeakRow();
});

// ===================== UI: 単語帳 =====================
function renderWordList() {
  const q = document.getElementById('list-search').value.trim().toLowerCase();
  const stage = parseInt(document.getElementById('list-stage-filter').value, 10);
  let words = allWords();
  if (stage) words = words.filter(w => w.stage === stage);
  if (q) words = words.filter(w => w.verb.toLowerCase().includes(q) || (w.meaning || '').includes(q));
  const el = document.getElementById('word-list');
  el.innerHTML = '';
  if (!words.length) { el.innerHTML = '<div class="empty-note">該当する語がありません</div>'; return; }
  words.forEach(w => el.appendChild(wordItemEl(w)));
}
function wordItemEl(w) {
  const div = document.createElement('div');
  div.className = 'word-item';
  div.innerHTML = `
    <div class="wi-head">
      <div><span class="wi-verb">${escHtml(w.verb)}</span>${w.mine ? '<span class="wi-badge-mine">マイ単語</span>' : ''}</div>
      <div class="wi-stage">${w.mine ? 'MY' : 'ST.' + w.stage}</div>
    </div>
    <div class="wi-meaning">${escHtml(w.meaning || '')}</div>
    <div class="wi-detail">
      ${w.ex1 ? `<div class="ex">${escHtml(w.ex1)}</div><div class="ja">${escHtml(w.ja1 || '')}</div>` : ''}
      ${w.ex2 ? `<div class="ex">${escHtml(w.ex2)}</div><div class="ja">${escHtml(w.ja2 || '')}</div>` : ''}
      ${w.def ? `<div class="def">${escHtml(w.def)}</div>` : ''}
      ${w.note ? `<div class="def">※ ${escHtml(w.note)}</div>` : ''}
    </div>`;
  div.addEventListener('click', () => div.classList.toggle('open'));
  return div;
}
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

document.getElementById('list-search').addEventListener('input', renderWordList);
document.getElementById('list-stage-filter').addEventListener('change', renderWordList);

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
    chip.textContent = k + ' ×' + parts.join(' ');
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

// ===================== トースト =====================
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ===================== Service Worker 登録 =====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
