#!/usr/bin/env node
/**
 * Auphonic API → mastered WAV.
 *
 * Auphonic (https://auphonic.com) is a broadcast audio post service. For *recorded*
 * voice its Adaptive Leveler is the piece ffmpeg can't do — it evens out level across
 * a take as the speaker moves relative to the mic.
 *
 * Gemini TTS output has none of those problems: no mic, no room, no noise floor, and
 * an already-constant level. So on synthetic narration the parts of Auphonic that
 * actually bite are **loudness normalization** (integrated LUFS) and **true-peak
 * limiting** — which is still worth doing, because every clip in the channel then
 * lands at the same perceived volume, and the platforms stop applying their own
 * normalization unpredictably. Denoise is off by default for exactly this reason:
 * there is nothing to denoise, and a spectral denoiser on clean synth audio only
 * costs you highs.
 *
 * Auth: AUPHONIC_API_KEY in .env.
 * Cost: one production bills its audio duration against the account's monthly
 * credit-hours (a 7-second clip ≈ 0.002 hr).
 *
 * Standard 4-call REST flow:
 *   1. POST /api/productions.json              — create with algorithms + output format
 *   2. POST /api/production/{uuid}/upload.json — upload the input audio
 *   3. POST /api/production/{uuid}/start.json  — start processing
 *   4. GET  /api/production/{uuid}.json        — poll until Done, then download
 *
 * Usage:
 *   node scripts/auphonic.mjs --in public/audio/clip.wav --out public/audio/clip-master.wav
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadEnv } from './tts.mjs';

const API = 'https://auphonic.com/api';

// Production status codes. 3 = Done; 2/9 are terminal errors; everything else means
// "keep polling" (1 waiting, 4 processing, 5 encoding, ...).
const STATUS_DONE = 3;
const STATUS_ERROR = new Set([2, 9]);

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AuphonicError extends Error {}

const auth = (key) => ({ Authorization: `Bearer ${key}` });

/** Remaining credit-hours on the account. Also serves as an auth check. */
export const checkCredits = async (apiKey) => {
  const res = await fetch(`${API}/user.json`, { headers: auth(apiKey) });
  if (res.status === 401) throw new AuphonicError('Auphonic rejected the API key (401).');
  if (!res.ok) throw new AuphonicError(`Auphonic /user.json failed (${res.status})`);
  const json = await res.json();
  return Number(json?.data?.credits ?? 0);
};

/**
 * Algorithm settings for spoken-word TTS.
 *
 * Every *cutter* is off: they change the length of the audio, and in this repo the
 * narration length IS the composition length (calculateMetadata reads it), so a clip
 * that comes back shorter would silently re-time every beat in the scene.
 */
const buildAlgorithms = ({ targetLufs, maxPeak, leveler, levelerStrength, denoise, denoiseAmount }) => ({
  leveler,
  levelerstrength: leveler ? Math.round(levelerStrength) : 0,
  normloudness: true,
  loudnesstarget: Math.round(targetLufs), // integrated LUFS; Auphonic takes integer choices
  maxpeak: maxPeak, // true-peak ceiling, dBTP
  filtering: false, // no hum/rumble to remove in synthetic audio
  gate: false, // no noise floor to gate
  denoise,
  ...(denoise ? { denoisemethod: 'static', denoiseamount: Math.round(denoiseAmount) } : {}),
  // Cutters OFF — never change the length.
  cutter: false,
  silence_cutter: false,
  filler_cutter: false,
  cough_cutter: false,
  music_cutter: false,
});

const createProduction = async (apiKey, title, algorithms) => {
  const res = await fetch(`${API}/productions.json`, {
    method: 'POST',
    headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metadata: { title },
      algorithms,
      output_files: [{ format: 'wav', ending: 'wav' }],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new AuphonicError(`Auphonic create failed (${res.status})`);
  if (!res.ok || (body.status_code ?? 200) >= 300) {
    const why = body.error_message || JSON.stringify(body.form_errors ?? body).slice(0, 300);
    throw new AuphonicError(`Auphonic create failed: ${why}`);
  }
  const uuid = body?.data?.uuid;
  if (!uuid) throw new AuphonicError('Auphonic create returned no UUID');
  return uuid;
};

const uploadFile = async (apiKey, uuid, inputPath) => {
  const form = new FormData();
  form.append('input_file', new Blob([fs.readFileSync(inputPath)]), path.basename(inputPath));
  const res = await fetch(`${API}/production/${uuid}/upload.json`, {
    method: 'POST',
    headers: auth(apiKey),
    body: form,
  });
  if (!res.ok) {
    throw new AuphonicError(`Auphonic upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
};

const startProduction = async (apiKey, uuid) => {
  const res = await fetch(`${API}/production/${uuid}/start.json`, {
    method: 'POST',
    headers: auth(apiKey),
  });
  if (!res.ok) {
    throw new AuphonicError(`Auphonic start failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
};

const pollUntilDone = async (apiKey, uuid, onStatus) => {
  let waited = 0;
  let last = null;
  while (waited <= POLL_MAX_MS) {
    const res = await fetch(`${API}/production/${uuid}.json`, { headers: auth(apiKey) });
    if (!res.ok) throw new AuphonicError(`Auphonic status failed (${res.status})`);
    const data = (await res.json())?.data ?? {};
    const label = data.status_string ?? String(data.status);
    if (label !== last) {
      last = label;
      onStatus?.(label);
    }
    if (data.status === STATUS_DONE) return data;
    if (STATUS_ERROR.has(data.status)) {
      throw new AuphonicError(`Auphonic processing failed: ${data.error_message || label}`);
    }
    await sleep(POLL_INTERVAL_MS);
    waited += POLL_INTERVAL_MS;
  }
  throw new AuphonicError(`Auphonic timed out after ${POLL_MAX_MS / 1000}s (last status: ${last})`);
};

const downloadResult = async (apiKey, data, outputPath) => {
  const outputs = data.output_files ?? [];
  const pick = outputs.find((o) => (o.ending ?? '').toLowerCase() === 'wav') ?? outputs[0];
  if (!pick?.download_url) throw new AuphonicError('Auphonic produced no downloadable output');
  const res = await fetch(pick.download_url, { headers: auth(apiKey) });
  if (!res.ok) throw new AuphonicError(`Auphonic download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new AuphonicError('Auphonic download produced an invalid file');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  return outputPath;
};

/**
 * Master one WAV through Auphonic. Returns `outputPath`.
 *
 * Defaults are tuned for Gemini TTS narration destined for Shorts/Reels:
 * -14 LUFS integrated (what YouTube and Instagram normalize toward, so nothing gets
 * turned down on upload), -1 dBTP ceiling, leveler on at low strength to tame the
 * odd loud consonant without flattening the delivery, denoise off.
 */
export const master = async (
  inputPath,
  outputPath,
  {
    targetLufs = -14,
    maxPeak = -1.0,
    leveler = true,
    levelerStrength = 40,
    denoise = false,
    denoiseAmount = 6,
    title = 'shortsmith narration master',
    apiKey,
    onStatus,
  } = {},
) => {
  const key = apiKey || process.env.AUPHONIC_API_KEY || loadEnv().AUPHONIC_API_KEY;
  if (!key) throw new AuphonicError('Missing AUPHONIC_API_KEY. Set it in .env');
  if (!fs.existsSync(inputPath)) throw new AuphonicError(`No such input file: ${inputPath}`);

  const algorithms = buildAlgorithms({
    targetLufs,
    maxPeak,
    leveler,
    levelerStrength,
    denoise,
    denoiseAmount,
  });

  const uuid = await createProduction(key, title, algorithms);
  onStatus?.('uploading');
  await uploadFile(key, uuid, inputPath);
  await startProduction(key, uuid);
  const data = await pollUntilDone(key, uuid, onStatus);
  onStatus?.('downloading');
  await downloadResult(key, data, outputPath);
  return outputPath;
};

// ---- CLI ----
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
  };

  const input = get('--in');
  const output = get('--out');
  if (!input || !output) {
    console.error('Usage: node scripts/auphonic.mjs --in <wav> --out <wav> [--lufs -14] [--denoise]');
    process.exit(1);
  }

  const key = process.env.AUPHONIC_API_KEY || loadEnv().AUPHONIC_API_KEY;
  console.log(`  ${(await checkCredits(key)).toFixed(2)} credit-hours available`);

  await master(input, output, {
    apiKey: key,
    targetLufs: Number(get('--lufs', -14)),
    denoise: args.includes('--denoise'),
    onStatus: (s) => console.log(`  ${s}`),
  });
  console.log(`✓ ${output}`);
}
