#!/usr/bin/env node
/**
 * Google Gemini TTS → WAV.
 *
 * Uses generativelanguage.googleapis.com (`gemini-2.5-flash-preview-tts`) rather than
 * Cloud Text-to-Speech, because it accepts a plain AI Studio API key, gives 30 prebuilt
 * voices, and takes a natural-language style directive ("read this calmly, like a
 * systems explainer") which Cloud TTS cannot do.
 *
 * The API returns raw signed 16-bit little-endian PCM at 24 kHz, base64-encoded.
 * There is no RIFF header, so we write one ourselves.
 *
 * Usage:
 *   node scripts/tts.mjs --text "hello world" --out out/vo.wav
 *   node scripts/tts.mjs --script content/claude-dispatch.json
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MODEL = 'gemini-2.5-flash-preview-tts';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/** Voices worth knowing. Full list: https://ai.google.dev/gemini-api/docs/speech-generation */
export const VOICES = {
  Kore: 'firm, even — the default explainer voice',
  Charon: 'informative, lower register',
  Puck: 'upbeat',
  Fenrir: 'excitable',
  Aoede: 'breezy',
  Enceladus: 'breathy, soft',
  Iapetus: 'clear',
  Umbriel: 'easy-going',
  Algieba: 'smooth',
  Achernar: 'soft',
  Zephyr: 'bright',
  Sadaltager: 'knowledgeable',
};

export const loadEnv = (root = path.resolve(import.meta.dirname, '..')) => {
  const p = path.join(root, '.env');
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
};

/** Wrap raw PCM in a RIFF/WAVE header. */
export const pcmToWav = (pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) => {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

/**
 * Synthesize one line of narration.
 * `style` is prepended as a directive — the model follows it rather than reading it.
 */
export const synthesize = async ({
  text,
  voice = 'Enceladus',
  style = 'Read in a calm, confident tone — a systems explainer walking through a diagram. Clear consonants, no salesy lilt, no rising inflection at line ends. Keep an unhurried, measured pace of about 135 words per minute, with a distinct beat of silence between sentences. Do not rush.',
  apiKey,
  model = MODEL,
  /** Called before each backoff sleep, for build-time logging. */
  onRetry,
}) => {
  if (!apiKey) throw new Error('Missing API key. Set GOOGLE_API_KEY in .env');

  const prompt = `${style}\n\n${text}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });

  /**
   * Retry on transient failures.
   *
   * A bare 500 ("An internal error has occurred. Please retry") killed a full 18-reel
   * rebuild eleven takes in. The API asks you to retry and the call is idempotent from our
   * side, so not retrying was simply a bug. 429 is rate limiting and 503 is overload;
   * both are the same shape. Everything else (401, 400) is a real error and fails fast.
   */
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; ; attempt++) {
    const retry = async (status, detail) => {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`Gemini TTS ${status}: ${detail.slice(0, 400)}`);
      // Exponential backoff: 2s, 4s, 8s, 16s. Long enough for a server blip to clear.
      const wait = 2000 * 2 ** (attempt - 1);
      onRetry?.({ attempt, status, waitMs: wait });
      await new Promise((r) => setTimeout(r, wait));
    };

    const res = await fetch(ENDPOINT(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e.message ?? e) }));

    if (!res.ok) {
      const detail = await res.text();
      if (!RETRYABLE.has(res.status)) throw new Error(`Gemini TTS ${res.status}: ${detail.slice(0, 500)}`);
      await retry(res.status, detail);
      continue;
    }

    const json = await res.json();
    const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);

    // The second failure mode, and the reason the audio check lives inside this loop:
    // Gemini can answer **200 OK with no audio at all**, reporting
    // `finishReason: "OTHER"` and a token count but no parts. It killed a rebuild that
    // had already survived the 500s. It is transient and clears on a retry, so treat it
    // exactly like a 503 rather than letting a successful HTTP status mask a failure.
    if (!part) {
      const reason = json?.candidates?.[0]?.finishReason ?? 'unknown';
      await retry(`200/${reason}`, JSON.stringify(json));
      continue;
    }

    const mime = part.inlineData.mimeType || '';
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    const pcm = Buffer.from(part.inlineData.data, 'base64');
    return { wav: pcmToWav(pcm, { sampleRate: rate }), sampleRate: rate, pcmBytes: pcm.length };
  }
};

/** Duration of a mono 16-bit WAV, in seconds. */
export const wavDuration = (wav, sampleRate = 24000) => (wav.length - 44) / 2 / sampleRate;

// ---- CLI ----
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
  };

  const env = loadEnv();
  const apiKey = process.env.GOOGLE_API_KEY || env.GOOGLE_API_KEY;
  const text = get('--text');
  const out = get('--out', 'out/vo.wav');
  const voice = get('--voice', 'Enceladus');

  if (!text) {
    console.error('Usage: node scripts/tts.mjs --text "..." [--out out/vo.wav] [--voice Charon]');
    console.error('\nVoices:');
    for (const [k, v] of Object.entries(VOICES)) console.error(`  ${k.padEnd(14)} ${v}`);
    process.exit(1);
  }

  const { wav, sampleRate } = await synthesize({ text, voice, apiKey });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, wav);
  const dur = wavDuration(wav, sampleRate);
  console.log(`✓ ${out}  ${dur.toFixed(2)}s  ${sampleRate}Hz  voice=${voice}`);
  console.log(`  ${(text.split(/\s+/).length / (dur / 60)).toFixed(0)} wpm`);
}
