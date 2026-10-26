// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordVoice } from "./media";

const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> };
let processor: ReturnType<typeof node> & {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
};
let context: {
  sampleRate: number;
  destination: object;
  createMediaStreamSource: ReturnType<typeof vi.fn>;
  createScriptProcessor: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
function audio(value: number, length = 1600) {
  processor.onaudioprocess?.({
    inputBuffer: { getChannelData: () => new Float32Array(length).fill(value) },
  } as unknown as AudioProcessingEvent);
}
beforeEach(() => {
  vi.useFakeTimers();
  track = { enabled: true, stop: vi.fn() };
  processor = { ...node(), onaudioprocess: null };
  context = {
    sampleRate: 16000,
    destination: {},
    createMediaStreamSource: vi.fn(() => node()),
    createScriptProcessor: vi.fn(() => processor),
    createGain: vi.fn(() => ({ ...node(), gain: { value: 1 } })),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      })),
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("captures the first audio, keeps pauses, and retains the last word after Stop", async () => {
  context.resume.mockImplementation(async () => audio(0.25));
  const recording = await recordVoice();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  audio(0, 16000 * 4);
  await vi.advanceTimersByTimeAsync(4000);
  expect(track.stop).not.toHaveBeenCalled();
  audio(0.5);
  const stopped = recording.stop();
  audio(0.75);
  await vi.advanceTimersByTimeAsync(350);
  const bytes = await stopped;
  const pcm = new DataView(bytes.buffer);
  expect(pcm.getUint32(24, true)).toBe(16000);
  expect(pcm.getInt16(44, true)).toBe(8192);
  expect(pcm.getInt16(44 + 1600 * 2, true)).toBe(0);
  expect(pcm.getInt16(bytes.length - 2, true)).toBe(24575);
  expect(bytes.length).toBe(44 + (1600 * 3 + 16000 * 4) * 2);
  expect(track.stop).toHaveBeenCalledOnce();
  expect(context.close).toHaveBeenCalledOnce();
});

it("skips muted audio and releases the microphone on cancel or startup failure", async () => {
  const recording = await recordVoice();
  recording.setMuted(true);
  expect(track.enabled).toBe(false);
  audio(1);
  recording.setMuted(false);
  audio(0.25);
  recording.cancel();
  audio(1);
  const stopped = recording.stop();
  await vi.advanceTimersByTimeAsync(350);
  expect((await stopped).length).toBe(44 + 1600 * 2);
  expect(track.stop).toHaveBeenCalledOnce();
  track.stop.mockClear();
  context.resume.mockRejectedValueOnce(new Error("Microphone unavailable"));
  await expect(recordVoice()).rejects.toThrow("Microphone unavailable");
  expect(track.stop).toHaveBeenCalledOnce();
});
