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

// 기상청 호출 → { w, why }. 실패하면 w 는 null, why 는 이유 코드 (키 · 호출 주소는 절대 싣지 않음)
async function fetchWeather(region, now) {
  const key = process.env.KMA_data;
  if (!key) return { w: null, why: 'no-key' };
  try {
    const r = await fetch(buildKmaUrl(region, key, now), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { w: null, why: 'http-' + r.status };
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return { w: null, why: 'not-json: ' + text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) };
    }
    const w = parseKma(json, kmaBase(now).today);
    if (w) return { w, why: '' };
    const h = json && json.response && json.response.header;
    if (h && h.resultCode !== '00') return { w: null, why: 'kma-' + h.resultCode + ': ' + String(h.resultMsg || '').slice(0, 60) };
    return { w: null, why: 'empty' };
  } catch (e) {
    return { w: null, why: e && e.name === 'TimeoutError' ? 'timeout' : 'fetch-failed' };   // 오류 문구에 키가 든 주소가 섞일 수 있어 이름만 사용
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
  const { w, why } = await fetchWeather(region, now);
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
    ...(w ? {} : { error: '날씨를 받지 못했습니다. 일정 목록만 표시합니다. (' + why + ')' }),
  });
};
