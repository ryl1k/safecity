// Ukrainian speech synthesis (RN port of apps/web/src/lib/tts.ts). expo-speech
// drives the platform TTS engine; we request the uk-UA voice and degrade quietly
// if the device has no Ukrainian voice installed.
import * as Speech from 'expo-speech';

export interface SpeakOpts {
  onend?: () => void;
  onerror?: () => void;
  rate?: number;
}

/** Speak Ukrainian text. Cancels anything already speaking. */
export function speak(text: string, opts: SpeakOpts = {}): void {
  if (!text.trim()) {
    opts.onerror?.();
    return;
  }
  Speech.stop();
  Speech.speak(text, {
    language: 'uk-UA',
    rate: opts.rate ?? 1,
    onDone: () => opts.onend?.(),
    onStopped: () => opts.onend?.(),
    onError: () => opts.onerror?.(),
  });
}

export function stopSpeech(): void {
  Speech.stop();
}
