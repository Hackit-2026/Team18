import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const audioUrl = () =>
  process.env.AUDIO_LLM_URL ||
  "http://127.0.0.1:8082/v1/chat/completions";

function extensionFromMimetype(mimetype = "") {
  const type = mimetype.toLowerCase();

  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";

  return "webm";
}

function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);

    let errorText = "";

    ffmpeg.stderr.on("data", (chunk) => {
      errorText += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(
        new Error(
          `ffmpegを起動できませんでした: ${error.message}`,
        ),
      );
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `音声のWAV変換に失敗しました: ${errorText}`,
        ),
      );
    });
  });
}

async function readStreamingText(response) {
  if (!response.body) {
    throw new Error(
      "音声モデルから応答本文が返りませんでした",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let transcription = "";

  function processLine(rawLine) {
    const line = rawLine.trim();

    if (!line.startsWith("data:")) return;

    const data = line.slice(5).trim();

    if (!data || data === "[DONE]") return;

    let event;

    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    if (event.error) {
      throw new Error(
        event.error.message || "音声モデルでエラーが発生しました",
      );
    }

    const text =
      event.choices?.[0]?.delta?.content || "";

    transcription += text;
  }

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, {
        stream: !done,
      });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line);
      }
    }

    if (done) break;
  }

  buffer += decoder.decode();

  if (buffer) {
    processLine(buffer);
  }

  return transcription.trim();
}

export async function transcribeAudio({
  buffer,
  mimetype,
}) {
  if (!buffer?.length) {
    return "";
  }

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "airs-audio-"),
  );

  const extension =
    extensionFromMimetype(mimetype);

  const inputPath = path.join(
    temporaryDirectory,
    `speech.${extension}`,
  );

  const wavPath = path.join(
    temporaryDirectory,
    "speech.wav",
  );

  try {
    await writeFile(inputPath, buffer);

    await convertToWav(inputPath, wavPath);

    const wavBuffer = await readFile(wavPath);
    const audioBase64 =
      wavBuffer.toString("base64");

    const response = await fetch(audioUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "",
        modalities: ["text"],
        messages: [
          {
            role: "system",
            content:
              "Perform ASR in japanese.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: "wav",
                },
              },
            ],
          },
        ],
        max_tokens: 512,
        stream: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `音声モデルエラー ${response.status}: ${detail}`,
      );
    }

    const transcript =
      await readStreamingText(response);

    console.log(
      "ローカル音声文字起こし:",
      transcript,
    );

    return transcript;
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}