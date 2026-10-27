// api/kma.js – Vercel 서버 함수: /api/kma?region=대전
// 지역의 오늘 날씨(기상청) + 우리 DB(wx_tasks) 일정 + 판단을 JSON 으로 돌려줌
// 기상청 키는 Vercel 환경변수 KMA_data 로만 읽음 (코드 · 응답에 넣지 않음)
const { judge, KMA_GRID, kmaBase, buildKmaUrl, parseKma } = require('../logic.js');

// Supabase 연결정보 (공개용 값, config.js 와 같음 – 비밀 키 금지)
const SUPABASE_URL = 'https://blupzhkkdjtunzmywxqf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i6eX9rje2HXHQxyNpMXC4A_8dJBm7Sh';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

async function fetchWeather(region, now) {
  const key = process.env.KMA_data;
  if (!key) return null;
  try {
    const r = await fetch(buildKmaUrl(region, key, now));
    if (!r.ok) return null;
    return parseKma(await r.json(), kmaBase(now).today);
  } catch (e) {
    return null;   // 오류 내용에 키가 든 주소가 섞일 수 있어 응답에 쓰지 않음
  }
}

async function fetchTasks(region) {
  const url = SUPABASE_URL + '/rest/v1/wx_tasks?select=title,region,kind,owner&order=id&region=eq.' + encodeURIComponent(region);
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
  if (!r.ok) throw new Error('db');
  return r.json();
}

module.exports = async function handler(req, res) {
  const region = String((req.query && req.query.region) || '');
  if (!KMA_GRID[region]) {
    return send(res, 400, { error: '지역은 ' + Object.keys(KMA_GRID).join(' · ') + ' 중 하나여야 합니다.' });
  }
  const now = Date.now();
  let rows;
  try {
    rows = await fetchTasks(region);
  } catch (e) {
    return send(res, 502, { error: '일정 DB를 읽지 못했습니다.' });
  }
  const w = await fetchWeather(region, now);
  const tasks = rows.map((t) => ({
    title: t.title, kind: t.kind, owner: t.owner,
    weather: w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-',
    judge: judge(t.kind, w),
  }));
  const d = kmaBase(now).today;
  send(res, w ? 200 : 502, {
    date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8),
    region,
    weather: w,
    tasks,
    ...(w ? {} : { error: '날씨를 받지 못했습니다. 일정 목록만 표시합니다.' }),
  });
};
