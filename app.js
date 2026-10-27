// app.js – 화면 동작 (목록 그리기, 일정 추가)

// 일정 목록은 data/tasks.json 에서 먼저 읽고, 화면에서 추가한 일정만 브라우저에 따로 저장 (wx_added)
let baseTasks = [];
let tasks = [];
let weatherByRegion = {};   // 03 단원에서 지역별 날씨를 넣음

// data/tasks.json 읽기. 더블클릭(file://)으로 열어 못 읽으면 안내 문구를 보여 줌
async function loadBaseTasks() {
  const msg = document.getElementById('msgBox');
  try {
    const res = await fetch('data/tasks.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    baseTasks = await res.json();
  } catch (err) {
    baseTasks = [];
    msg.textContent = '배포주소로 열어주세요 (일정 파일 data/tasks.json 을 읽지 못했습니다)';
  }
}

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  tasks = baseTasks.concat(saved);
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

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  saved.push(t);
  localStorage.setItem('wx_added', JSON.stringify(saved));
  e.target.reset();
  loadTasks();
  renderTasks();
}

// 오늘 날짜를 PC 시계 기준(로컬)으로 YYYY-MM-DD 로 표시
function showToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  document.getElementById('todayText').textContent = d.getFullYear() + '-' + mm + '-' + dd;
}

document.getElementById('taskForm').addEventListener('submit', addTask);
showToday();
loadBaseTasks().then(() => {
  loadTasks();
  renderTasks();
  loadWeather();
});
