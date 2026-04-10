import express from 'express';
import { readFileSync } from 'fs';
import * as Saros from './saros-js/saros.js';
import * as SolarData from './saros-js/data/solar.js';
import * as LunarData from './saros-js/data/lunar.js';

// ── Init library ────────────────────────────────────────────────────────────
Saros.initSolar(SolarData);
Saros.initLunar(LunarData);

// ── Config ───────────────────────────────────────────────────────────────────
const env = loadEnv('./.env');
const PORT = env.PORT ?? 3000;
const API_KEYS = new Set((env.API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean));

function loadEnv(path) {
    try {
        return Object.fromEntries(
            readFileSync(path, 'utf8')
                .split('\n')
                .filter(l => l && !l.startsWith('#'))
                .map(l => l.split('=').map(s => s.trim()))
                .filter(([k]) => k)
                .map(([k, ...v]) => [k, v.join('=')])
        );
    } catch {
        return {};
    }
}

// ── BigInt-safe JSON serializer ──────────────────────────────────────────────
function toJSON(value) {
    return JSON.stringify(value, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
    );
}

function send(res, data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(toJSON(data));
}

// ── Param helpers ────────────────────────────────────────────────────────────
function parseTimestamp(val) {
    if (val === undefined || val === null) return null;
    try { return BigInt(val); } catch { return null; }
}

function parseSarosNumber(val) {
    const n = Number(val);
    return Number.isInteger(n) ? n : null;
}

function parseResolution(val) {
    const n = Number(val);
    return [1, 2, 3].includes(n) ? n : null;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
    const key = req.headers['x-api-key'] ?? req.query.api_key;
    if (!key || !API_KEYS.has(key)) {
        res.status(401).setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing API key' }));
        return;
    }
    next();
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(auth);

// ── Error helper ─────────────────────────────────────────────────────────────
function missingParam(res, name) {
    res.status(400).json({ error: `Missing or invalid parameter: ${name}` });
}

// ────────────────────────────────────────────────────────────────────────────
// Eclipse lookup endpoints
// ────────────────────────────────────────────────────────────────────────────

// find_next_solar_eclipse(timestamp)
app.get('/eclipse/solar/next', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_next_solar_eclipse(ts));
});

// find_past_solar_eclipse(timestamp)
app.get('/eclipse/solar/past', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_past_solar_eclipse(ts));
});

// find_closest_solar_eclipse(timestamp)
app.get('/eclipse/solar/closest', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_closest_solar_eclipse(ts));
});

// find_next_lunar_eclipse(timestamp)
app.get('/eclipse/lunar/next', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_next_lunar_eclipse(ts));
});

// find_past_lunar_eclipse(timestamp)
app.get('/eclipse/lunar/past', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_past_lunar_eclipse(ts));
});

// find_closest_lunar_eclipse(timestamp)
app.get('/eclipse/lunar/closest', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    if (ts === null) return missingParam(res, 'timestamp');
    send(res, Saros.find_closest_lunar_eclipse(ts));
});

// ────────────────────────────────────────────────────────────────────────────
// Saros window endpoints
// ────────────────────────────────────────────────────────────────────────────

// find_solar_saros_window(timestamp, saros_number)
app.get('/saros/solar/window', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    send(res, Saros.find_solar_saros_window(ts, sn));
});

// find_lunar_saros_window(timestamp, saros_number)
app.get('/saros/lunar/window', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    send(res, Saros.find_lunar_saros_window(ts, sn));
});

// ────────────────────────────────────────────────────────────────────────────
// Series endpoints
// ────────────────────────────────────────────────────────────────────────────

// get_solar_saros_series(saros_number)
app.get('/saros/solar/series/:saros_number', (req, res) => {
    const sn = parseSarosNumber(req.params.saros_number);
    if (sn === null) return missingParam(res, 'saros_number');
    send(res, Saros.get_solar_saros_series(sn));
});

// ────────────────────────────────────────────────────────────────────────────
// Octal phase endpoints
// ────────────────────────────────────────────────────────────────────────────

// calculate_solar_octal_phase(timestamp, saros_number, resolution)
app.get('/octal/solar/phase', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    const r  = parseResolution(req.query.resolution);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    if (r === null)  return missingParam(res, 'resolution (1, 2, or 3)');
    send(res, { result: Saros.calculate_solar_octal_phase(ts, sn, r) });
});

// calculate_solar_octal_phase_ms(timestamp_ms, saros_number, resolution)
app.get('/octal/solar/phase/ms', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    const r  = parseResolution(req.query.resolution);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    if (r === null)  return missingParam(res, 'resolution (1, 2, or 3)');
    send(res, { result: Saros.calculate_solar_octal_phase_ms(ts, sn, r) });
});

// calculate_lunar_octal_phase(timestamp, saros_number, resolution)
app.get('/octal/lunar/phase', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    const r  = parseResolution(req.query.resolution);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    if (r === null)  return missingParam(res, 'resolution (1, 2, or 3)');
    send(res, { result: Saros.calculate_lunar_octal_phase(ts, sn, r) });
});

// calculate_lunar_octal_phase_ms(timestamp_ms, saros_number, resolution)
app.get('/octal/lunar/phase/ms', (req, res) => {
    const ts = parseTimestamp(req.query.timestamp);
    const sn = parseSarosNumber(req.query.saros_number);
    const r  = parseResolution(req.query.resolution);
    if (ts === null) return missingParam(res, 'timestamp');
    if (sn === null) return missingParam(res, 'saros_number');
    if (r === null)  return missingParam(res, 'resolution (1, 2, or 3)');
    send(res, { result: Saros.calculate_lunar_octal_phase_ms(ts, sn, r) });
});

// ────────────────────────────────────────────────────────────────────────────
// Rollover / period endpoints
// ────────────────────────────────────────────────────────────────────────────

// get_solar_rollover_epoch(timestamp, saros_number, bin)
app.get('/rollover/solar', (req, res) => {
    const ts  = parseTimestamp(req.query.timestamp);
    const sn  = parseSarosNumber(req.query.saros_number);
    const bin = parseTimestamp(req.query.bin);
    if (ts  === null) return missingParam(res, 'timestamp');
    if (sn  === null) return missingParam(res, 'saros_number');
    if (bin === null) return missingParam(res, 'bin');
    send(res, { result: Saros.get_solar_rollover_epoch(ts, sn, bin) });
});

// get_solar_saros_period_duration_ms(timestamp, saros_number, period)
app.get('/saros/solar/period/ms', (req, res) => {
    const ts     = parseTimestamp(req.query.timestamp);
    const sn     = parseSarosNumber(req.query.saros_number);
    const period = parseSarosNumber(req.query.period);
    if (ts     === null) return missingParam(res, 'timestamp');
    if (sn     === null) return missingParam(res, 'saros_number');
    if (period === null) return missingParam(res, 'period');
    send(res, { result: Saros.get_solar_saros_period_duration_ms(ts, sn, period) });
});

// ────────────────────────────────────────────────────────────────────────────
// Average-period endpoints (no eclipse lookup)
// ────────────────────────────────────────────────────────────────────────────

// get_average_bin(reference, timestamp, scale, resolution)
app.get('/average/bin', (req, res) => {
    const ref   = parseTimestamp(req.query.reference);
    const ts    = parseTimestamp(req.query.timestamp);
    const scale = parseSarosNumber(req.query.scale);
    const r     = parseResolution(req.query.resolution);
    if (ref   === null) return missingParam(res, 'reference');
    if (ts    === null) return missingParam(res, 'timestamp');
    if (scale === null) return missingParam(res, 'scale');
    if (r     === null) return missingParam(res, 'resolution (1, 2, or 3)');
    send(res, { result: Saros.get_average_bin(ref, ts, scale, r) });
});

// get_average_rollover_epoch(reference, timestamp, bin)
app.get('/average/rollover', (req, res) => {
    const ref = parseTimestamp(req.query.reference);
    const ts  = parseTimestamp(req.query.timestamp);
    const bin = parseTimestamp(req.query.bin);
    if (ref === null) return missingParam(res, 'reference');
    if (ts  === null) return missingParam(res, 'timestamp');
    if (bin === null) return missingParam(res, 'bin');
    send(res, { result: Saros.get_average_rollover_epoch(ref, ts, bin) });
});

// ────────────────────────────────────────────────────────────────────────────
// Metadata endpoints
// ────────────────────────────────────────────────────────────────────────────

// get_alive_saros_index(number)
app.get('/saros/index/:number', (req, res) => {
    const n = parseSarosNumber(req.params.number);
    if (n === null) return missingParam(res, 'number');
    send(res, { result: Saros.get_alive_saros_index(n) });
});

// Return all exported constants
app.get('/constants', (_, res) => {
    send(res, {
        SAROS_MAX_ECLIPSES:           Saros.SAROS_MAX_ECLIPSES,
        SAROS_RECORD_SIZE:            Saros.SAROS_RECORD_SIZE,
        ECLIPSE_INFO_SIZE:            Saros.ECLIPSE_INFO_SIZE,
        ALIVE_SAROS_COUNT:            Saros.ALIVE_SAROS_COUNT,
        OLDEST_SAROS:                 Saros.OLDEST_SAROS,
        YOUNGEST_SAROS:               Saros.YOUNGEST_SAROS,
        AVERAGE_SAROS_PERIOD_SECONDS: Saros.AVERAGE_SAROS_PERIOD_SECONDS,
        SolarEclType:                 Saros.SolarEclType,
        LunarEclType:                 Saros.LunarEclType,
        SarosOrderedByBirth:          Array.from(Saros.SarosOrderedByBirth),
        SarosIndexLookup:             Array.from(Saros.SarosIndexLookup),
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`saros-api listening on http://localhost:${PORT}`);
    console.log(`Loaded ${API_KEYS.size} API key(s)`);
});
