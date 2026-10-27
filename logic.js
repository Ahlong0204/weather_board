// logic.js – 판단 규칙만 (화면을 다루는 코드 금지)

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

// 지역별 대략 좌표 (교육용)
const REGIONS = {
  '세종': { lat: 36.48, lon: 127.29 },
  '대전': { lat: 36.35, lon: 127.38 },
  '태안': { lat: 36.75, lon: 126.30 },
  '보령': { lat: 36.33, lon: 126.61 },
};

// Open-Meteo 호출 주소 만들기 (오늘 하루, 풍속은 m/s)
function buildWeatherUrl(region) {
  const p = REGIONS[region];
  if (!p) return null;
  return 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + p.lat + '&longitude=' + p.lon
    + '&daily=temperature_2m_max,wind_speed_10m_max,precipitation_probability_max'
    + '&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=1';
}

// 응답 해석 → { tempMax, windMax, rainProb }, 값이 이상하면 null
function parseWeather(json) {
  const d = json && json.daily;
  if (!d) return null;
  const tempMax = d.temperature_2m_max && d.temperature_2m_max[0];
  const windMax = d.wind_speed_10m_max && d.wind_speed_10m_max[0];
  const rainProb = d.precipitation_probability_max && d.precipitation_probability_max[0];
  if (![tempMax, windMax, rainProb].every(v => typeof v === 'number' && isFinite(v))) return null;
  return { tempMax, windMax, rainProb };
}

// 기상청 단기예보 격자 좌표 (nx, ny)
const KMA_GRID = {
  '세종': { nx: 66, ny: 103 },
  '대전': { nx: 67, ny: 100 },
  '태안': { nx: 48, ny: 109 },
  '보령': { nx: 54, ny: 100 },
};

// 한국 시각 기준 오늘 날짜와 쓸 발표 시각 (오늘 최고 기온은 02시 발표, 02:10 전에는 전날 23시 발표)
function kmaBase(nowMs) {
  const k = new Date(nowMs + 9 * 3600 * 1000);   // UTC 메서드로 읽으면 한국 시각
  const ymd = (d) => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  const today = ymd(k);
  if (k.getUTCHours() * 60 + k.getUTCMinutes() >= 130) return { today, baseDate: today, baseTime: '0200' };
  return { today, baseDate: ymd(new Date(k.getTime() - 24 * 3600 * 1000)), baseTime: '2300' };
}

// 기상청 단기예보 호출 주소 (serviceKey 는 호출하는 쪽에서 환경변수로 넘김)
function buildKmaUrl(region, serviceKey, nowMs) {
  const g = KMA_GRID[region];
  if (!g) return null;
  const b = kmaBase(nowMs);
  return 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
    + '?serviceKey=' + encodeURIComponent(serviceKey)
    + '&pageNo=1&numOfRows=1000&dataType=JSON'
    + '&base_date=' + b.baseDate + '&base_time=' + b.baseTime
    + '&nx=' + g.nx + '&ny=' + g.ny;
}

// 기상청 응답 해석 → { tempMax, windMax, rainProb } (오늘 하루 최댓값), 이상하면 null
function parseKma(json, today) {
  const body = json && json.response && json.response.body;
  const header = json && json.response && json.response.header;
  if (!header || header.resultCode !== '00' || !body || !body.items || !Array.isArray(body.items.item)) return null;
  const vals = { TMX: [], TMP: [], WSD: [], POP: [] };
  for (const it of body.items.item) {
    if (it.fcstDate !== today || !vals[it.category]) continue;
    const n = Number(it.fcstValue);
    if (isFinite(n)) vals[it.category].push(n);
  }
  const max = (a) => (a.length ? Math.max(...a) : null);
  const tempMax = max(vals.TMX.length ? vals.TMX : vals.TMP);   // TMX 가 없으면 시간별 기온 최댓값
  const windMax = max(vals.WSD);
  const rainProb = max(vals.POP);
  if (tempMax === null || windMax === null || rainProb === null) return null;
  return { tempMax, windMax, rainProb };
}

// 표 칸 안의 | 와 줄바꿈이 표를 깨지 않게 바꿈
function mdCell(v) {
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// 오늘 판단을 마크다운 문자열로 만들기
// rows: [{ title, region, kind, owner, weather, judge }]
function buildMarkdown(date, rows) {
  const lines = [
    '# 현장 일정 판단 (' + date + ')',
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push('| ' + [r.title, r.region, r.kind, r.owner, r.weather, r.judge].map(mdCell).join(' | ') + ' |');
  }
  lines.push('');
  lines.push('판단 기준(교육용 가상): 고소 일정 풍속 ' + RULES.wind + 'm/s 이상 중지 검토 · 최고 기온 ' + RULES.heat
    + '℃ 이상 폭염 휴식 · 강수확률 ' + RULES.rain + '% 이상 우천 주의 (실내는 영향 없음)');
  return lines.join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { RULES, REGIONS, judge, buildWeatherUrl, parseWeather, buildMarkdown, KMA_GRID, kmaBase, buildKmaUrl, parseKma };
