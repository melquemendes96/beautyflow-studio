/**
 * Gera public/sounds/cash-register.wav — som curto estilo "caixa registradora".
 * Rode: node scripts/generate-cash-sound.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "sounds");
const outFile = path.join(outDir, "cash-register.wav");

const sampleRate = 22050;
const durationSec = 0.55;
const numSamples = Math.floor(sampleRate * durationSec);
const pcm = new Int16Array(numSamples);

function tone(freq, startSec, endSec, volume = 0.35) {
  const start = Math.floor(startSec * sampleRate);
  const end = Math.min(Math.floor(endSec * sampleRate), numSamples);
  for (let i = start; i < end; i++) {
    const t = (i - start) / sampleRate;
    const env = Math.min(1, t * 40) * Math.max(0, 1 - (t - (endSec - startSec - 0.02)) * 30);
    const sample = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * env * volume;
    pcm[i] += Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
  }
}

// "Ka-ching" — dois tons ascendentes + ping metálico
tone(880, 0.0, 0.12, 0.28);
tone(1320, 0.08, 0.22, 0.32);
tone(1760, 0.18, 0.38, 0.38);
tone(2200, 0.28, 0.5, 0.22);

const dataSize = pcm.length * 2;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < pcm.length; i++) {
  buffer.writeInt16LE(pcm[i], 44 + i * 2);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, buffer);
console.log(`[generate-cash-sound] OK → ${outFile} (${buffer.length} bytes)`);
