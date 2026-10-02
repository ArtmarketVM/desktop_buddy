import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ImageInput } from "./types";
const maxText = 16000;
export function textGoals(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  if (
    !lines.length ||
    lines.length > 20 ||
    lines.some((line) => line.length > 500)
  )
    throw new Error(
      "Use 1–20 lines, each up to 500 characters, or ask Buddy to organize longer notes.",
    );
  return lines.map((title) => ({
    title,
    area: "General",
    steps: [] as string[],
  }));
}
const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the attachment."));
    reader.readAsDataURL(blob);
  });
export async function readAttachment(
  file: File,
): Promise<{ text: string; images: ImageInput[] }> {
  if (file.size > 15_000_000)
    throw new Error("Choose a file smaller than 15 MB.");
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = workerUrl;
    const loading = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: false,
    });
    const document = await loading.promise;
    try {
      if (document.numPages > 50)
        throw new Error("Split this PDF into files of up to 50 pages.");
      let text = "";
      for (let i = 1; i <= document.numPages; i++) {
        const content = await (await document.getPage(i)).getTextContent();
        text +=
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ") + "\n";
        if (text.length > maxText)
          throw new Error(
            "This PDF contains more than 16,000 characters. Import a smaller selection.",
          );
      }
      if (text.trim()) return { text: text.trim(), images: [] };
      if (document.numPages > 4)
        throw new Error(
          "For a scanned PDF, choose up to four pages per import.",
        );
      const images: ImageInput[] = [];
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.5, 1600 / Math.max(base.width, base.height)),
        });
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        images.push({
          mime: "image/png",
          data: canvas.toDataURL("image/png").split(",")[1],
        });
        canvas.width = canvas.height = 0;
      }
      return { text: "", images };
    } finally {
      await loading.destroy();
    }
  }
  if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    if (file.size > 4_000_000)
      throw new Error("Choose an image smaller than 4 MB.");
    return {
      text: "",
      images: [{ mime: file.type, data: (await dataUrl(file)).split(",")[1] }],
    };
  }
  if (file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name)) {
    const text = await file.text();
    if (text.length > maxText)
      throw new Error("Use up to 16,000 characters per import.");
    return { text, images: [] };
  }
  throw new Error("Choose a PDF, PNG, JPEG, WebP or text file.");
}
export function wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(
      44 + i * 2,
      Math.round(
        Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767),
      ),
      true,
    ),
  );
  return new Uint8Array(buffer);
}
export async function recordVoice(): Promise<{
  stop: () => Promise<Uint8Array>;
  cancel: () => void;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  let size = 0;
  let closed = false;
  processor.onaudioprocess = (event) => {
    if (size < context.sampleRate * 60) {
      const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(chunk);
      size += chunk.length;
    }
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  const close = () => {
    if (closed) return;
    closed = true;
    source.disconnect();
    processor.disconnect();
    mute.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
  return {
    cancel: close,
    stop: async () => {
      close();
      const samples = new Float32Array(Math.min(size, context.sampleRate * 60));
      let offset = 0;
      for (const chunk of chunks) {
        const part = chunk.subarray(0, samples.length - offset);
        samples.set(part, offset);
        offset += part.length;
      }
      return wav(samples, context.sampleRate);
    },
  };
}
