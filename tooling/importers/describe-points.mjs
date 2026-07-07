// AI descriptions for imported points via Groq (free tier, model rotation).
// Priority 1: say what the place IS; priority 2: its wheelchair accessibility —
// one natural Ukrainian description, generated ONLY from facts we hold in the DB.
//
//   node --env-file=.env tooling/importers/describe-points.mjs --sample 10   # preview, no writes
//   node --env-file=.env tooling/importers/describe-points.mjs --apply       # regenerate all
//   flags: --limit N (cap points)  --batch N (points per request, default 12)
//
// Models are rotated per request (Groq rate limits are per-model, so one free
// key gets the sum of the pools); 429/failures fall through to the next model.

const APPLY = process.argv.includes('--apply');
const SAMPLE = argNum('--sample');
const LIMIT = argNum('--limit');
const BATCH = argNum('--batch') ?? 12;

function argNum(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : null;
}

const KEY = process.env.GROQ_API_KEY;
if (!KEY) {
  console.error('GROQ_API_KEY not set (run with --env-file=.env)');
  process.exit(1);
}

// Quality-ranked pool; rotated round-robin per request. `extra` carries
// model-specific params (reasoning models must not leak <think> into content).
const MODELS = [
  { id: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { id: 'llama-3.3-70b-versatile', extra: {} },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', extra: {} },
  { id: 'qwen/qwen3-32b', extra: { reasoning_format: 'hidden' } },
];

// UA labels for feature keys (mirrors the bezbar importer).
const FEATURE_LABELS = {
  step_free_entrance: 'вхід без сходів', ramp: 'пандус', ramp_slope_ok: 'пологий пандус', door_width: 'широкий вхід',
  elevator: 'ліфт', accessible_toilet: 'доступний туалет', level_interior: 'рівна підлога',
  accessible_parking_near: 'паркування для людей з інвалідністю', tactile_guidance_entrance: 'тактильна навігація',
  braille_signage: 'шрифт Брайля', staff_assistance: 'допомога персоналу', good_lighting: 'добре освітлення',
  guide_dog_welcome: 'можна із собакою-поводирем', level_boarding: 'посадка врівень', step_free_to_stop: 'підхід без сходів',
  low_floor_vehicles: 'низькопідлоговий транспорт', tactile_paving: 'тактильна плитка', audio_announcements: 'аудіооголошення',
  high_contrast_edge: 'контрастний край', dropped_curb: 'занижений бордюр', acoustic_signal: 'звуковий сигнал',
  accessible_stall: 'доступна кабіна', grab_bars: 'поручні', turning_space: 'місце для розвороту',
  emergency_cord: 'тривожна кнопка', disabled_bay: 'місце для авто з інвалідністю', bay_width: 'широке паркомісце', near_entrance: 'біля входу',
};
const CATEGORY_UA = { venue: 'заклад', transit: 'зупинка транспорту', crossing: 'перехід', toilet: 'вбиральня', parking: 'паркування' };

const SYSTEM = `Ти пишеш короткі описи місць для української мапи доступності SafeCity.
Для КОЖНОГО обʼєкта напиши 1–2 речення українською:
1) СПОЧАТКУ — що це за місце і для чого воно людям (поштове відділення, аптека, парк, зупинка автобуса тощо) — за полями «тип», «категорія», «назва». Це головний пріоритет.
2) ПОТІМ — доступність для людей на кріслі колісному з поля «є»: згадай 3–4 найважливіші зручності (вхід без сходів, пандус, туалет, паркування) природним реченням, НЕ переліком усього підряд. З поля «немає» можеш стримано згадати ЛИШЕ відсутній безбарʼєрний вхід або туалет; інші відсутності ігноруй.
Суворі правила:
- Опис показується ПІД назвою й адресою обʼєкта, тому НЕ починай з назви і не пиши адресу чи місто. Починай одразу з типу місця: «Поштове відділення, де…», «Аптека з…», «Міський парк для…».
- Використовуй ТІЛЬКИ надані факти. НІЧОГО не вигадуй: жодних годин роботи, послуг, історії чи атмосфери.
- Термінологія: «люди з інвалідністю», «крісло колісне». ЗАБОРОНЕНО: «інвалідний візок», «коляска», «інваліди».
- Тактильні елементи згадуй нейтрально, без пояснень, кому вони призначені.
- Якщо «є» порожнє — просто опиши місце, без вигаданої доступності й без фрази «немає даних».
- Пиши грамотно й різноманітно: не починай усі описи однаково.
Відповідь — СУВОРО валідний JSON без коментарів: {"descriptions":[{"id":"...","text":"..."}]}`;

async function groqChat(model, userContent) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: model.id,
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      ...model.extra,
    }),
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after')) || 0;
    return { rateLimited: true, wait };
  }
  if (!res.ok) return { error: `${model.id}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}` };
  const json = await res.json();
  return { content: json.choices?.[0]?.message?.content ?? '' };
}

function factsFor(p) {
  // "тип" = first sentence of the current template description (the dataset's kind).
  const kind = (p.description || '').split('.')[0]?.trim() || null;
  const yes = [], no = [];
  for (const [k, v] of Object.entries(p.features || {})) {
    const label = FEATURE_LABELS[k];
    if (!label) continue;
    if (v === 'yes') yes.push(label);
    else if (v === 'no') no.push(label);
  }
  // The address is deliberately NOT passed — the card already shows it, and the
  // model reliably echoes any field it can see.
  return {
    id: p.id,
    назва: p.name,
    тип: kind,
    категорія: CATEGORY_UA[p.category] ?? p.category,
    є: yes,
    немає: no.slice(0, 3),
  };
}

function validText(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (s.length < 25 || s.length > 520 || s.includes('```') || /\bjson\b/i.test(s.slice(0, 12))) return false;
  // Terminology guard: stigmatizing wording gets the whole item regenerated.
  if (/коляск|інвалідн(ий|ому|им) візок|візк(а|у|ом) для інвалід|\bінваліди\b/i.test(s)) return false;
  return true;
}

async function describeBatch(points, startModel) {
  const facts = points.map(factsFor);
  const user = `Обʼєкти:\n${JSON.stringify(facts, null, 1)}`;
  // Try each model once, starting from the rotation cursor.
  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const model = MODELS[(startModel + attempt) % MODELS.length];
    const r = await groqChat(model, user);
    if (r.rateLimited) {
      console.log(`    ${model.id}: 429 (retry-after ${r.wait}s) → next model`);
      continue;
    }
    if (r.error) {
      console.log(`    ${r.error} → next model`);
      continue;
    }
    try {
      const parsed = JSON.parse(r.content);
      const list = Array.isArray(parsed.descriptions) ? parsed.descriptions : [];
      const byId = new Map(list.map((d) => [String(d.id), (d.text ?? '').trim()]));
      const out = new Map();
      for (const p of points) {
        const t = byId.get(String(p.id));
        if (validText(t)) out.set(p.id, t);
      }
      if (out.size >= Math.ceil(points.length * 0.8)) return { out, model: model.id };
      console.log(`    ${model.id}: only ${out.size}/${points.length} valid → next model`);
    } catch {
      console.log(`    ${model.id}: bad JSON → next model`);
    }
  }
  return { out: new Map(), model: null };
}

async function main() {
  const { default: postgres } = await import('postgres');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

  let rows = await sql`
    select p.id, p.name, p.category, p.address, p.description,
           coalesce(json_object_agg(fv.feature_key, fv.value)
                    filter (where fv.feature_key is not null), '{}'::json) as features
    from points p
    left join point_feature_values fv on fv.point_id = p.id
    where p.osm_id like 'bezbar/%' and p.source = 'imported'
    group by p.id
    order by p.id`;
  console.log(`Points to describe: ${rows.length}`);
  const cap = SAMPLE ?? LIMIT;
  if (cap) {
    // Spread the sample across the whole set (different cities), not just the head.
    const step = Math.max(1, Math.floor(rows.length / cap));
    rows = rows.filter((_, i) => i % step === 0).slice(0, cap);
    console.log(`Capped to ${rows.length} (${SAMPLE ? 'sample' : 'limit'})`);
  }
  console.log(`Mode: ${APPLY ? 'APPLY (writing descriptions)' : 'DRY-RUN'} · batch ${BATCH} · models: ${MODELS.map((m) => m.id).join(' | ')}\n`);

  let done = 0, failed = 0, modelCursor = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { out, model } = await describeBatch(chunk, modelCursor);
    modelCursor++; // rotate per request regardless of which model served it
    for (const p of chunk) {
      const text = out.get(p.id);
      if (!text) { failed++; continue; }
      done++;
      if (!APPLY || SAMPLE) {
        console.log(`• ${p.name}`);
        console.log(`    було:  ${p.description}`);
        console.log(`    стало: ${text}`);
      }
      if (APPLY) await sql`update points set description = ${text}, updated_at = now() where id = ${p.id}`;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[${Math.min(i + BATCH, rows.length)}/${rows.length}] ok=${done} failed=${failed} · via ${model ?? '—'} · ${secs}s`);
  }

  console.log(`\nDone: ${done} described, ${failed} left unchanged${APPLY ? ' (written to DB)' : ' (dry-run)'}`);
  await sql.end();
}

main().catch((e) => {
  console.error('describe-points failed:', e.message);
  process.exitCode = 1;
});
