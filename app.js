// app.js – 화면 동작 (목록 그리기, 일정 추가)

// 일정 목록은 Supabase 표 wx_tasks 에서 읽고, 추가한 일정도 거기에 저장 (연결정보는 config.js)
let db = null;
let tasks = [];
let weatherByRegion = {};   // 03 단원에서 지역별 날씨를 넣음

function showMsg(text) {
  document.getElementById('msgBox').textContent = text;
}

// Supabase 연결 만들기 (config.js 를 아직 안 채웠거나 라이브러리를 못 불러오면 안내)
function connectDb() {
  if (typeof supabase === 'undefined') {
    showMsg('Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
    return false;
  }
  if (!/^https:\/\/[^/]+\.supabase\.co/.test(SUPABASE_URL)) {
    showMsg('config.js 에 Supabase 주소와 공개용 키를 넣어 주세요.');
    return false;
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return true;
}

async function loadTasks() {
  if (!db) { tasks = []; return; }
  const { data, error } = await db.from('wx_tasks').select('title, region, kind, owner').order('id');
  if (error) {
    tasks = [];
    showMsg('일정을 읽지 못했습니다: ' + error.message);
    return;
  }
  tasks = data;
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

// 지역별 날씨를 받아 표를 다시 그림 (실패해도 목록은 이미 보임)
async function loadWeather() {
  const box = document.getElementById('weatherBox');
  box.textContent = '날씨를 받는 중...';
  const regions = Object.keys(REGIONS);
  const results = await Promise.allSettled(regions.map(async (r) => {
    const res = await fetch(buildWeatherUrl(r));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseWeather(await res.json());
  }));
  const testWind = new URLSearchParams(location.search).get('test') === 'wind';
  const parts = [];
  let failed = 0;
  results.forEach((res, i) => {
    const w = res.status === 'fulfilled' ? res.value : null;
    if (!w) { failed++; return; }
    if (testWind) w.windMax = 12;
    weatherByRegion[regions[i]] = w;
    parts.push(regions[i] + ' ' + weatherText(w));
  });
  let msg = parts.length ? '오늘 날씨 – ' + parts.join(' / ') : '';
  if (failed) msg += (msg ? ' ' : '') + '(날씨를 받지 못한 지역 ' + failed + '곳)';
  if (testWind) msg += ' [시험: 풍속 12 m/s]';
  box.textContent = msg || '날씨를 받지 못했습니다';
  renderTasks();
}

async function addTask(e) {
  e.preventDefault();
  const form = e.target;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  if (!db) { showMsg('Supabase 에 연결되지 않아 추가할 수 없습니다.'); return; }
  showMsg('');
  const { error } = await db.from('wx_tasks').insert(t);
  if (error) {
    showMsg('일정을 저장하지 못했습니다: ' + error.message);
    return;
  }
  form.reset();
  await loadTasks();
  renderTasks();
}

// 오늘 날짜를 PC 시계 기준(로컬)으로 YYYY-MM-DD 문자열로 만듦
function todayString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function showToday() {
  document.getElementById('todayText').textContent = todayString();
}

// 지금 표를 마크다운으로 바꿔 '현장일정_판단_YYYY-MM-DD.md' 로 내려받기
function saveMarkdown() {
  const date = todayString();
  const rows = tasks.map((t) => {
    const w = weatherByRegion[t.region];
    return { title: t.title, region: t.region, kind: t.kind, owner: t.owner,
             weather: weatherText(w), judge: judge(t.kind, w).text };
  });
  const blob = new Blob([buildMarkdown(date, rows)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '현장일정_판단_' + date + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('saveMdBtn').addEventListener('click', saveMarkdown);
showToday();
connectDb();
loadTasks().then(() => {
  renderTasks();
  loadWeather();
});
