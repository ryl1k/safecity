// Speech synthesis helper. The common reasons TTS "doesn't work" in Ukrainian:
//  1) getVoices() is empty on first call (voices load async) → no voice picked.
//  2) the browser falls back to a non-Ukrainian voice that mangles the text.
// This selects a Ukrainian voice explicitly once voices are available.

function pickUkVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith('uk')) ||
    voices.find((v) => /ukrain|україн/i.test(v.name)) ||
    null
  );
}

/** True if the device has a Ukrainian TTS voice installed. */
export function hasUkrainianVoice(): boolean {
  return !!pickUkVoice();
}

export interface SpeakOpts {
  onend?: () => void;
  onerror?: () => void;
  rate?: number;
}

/** Speak Ukrainian text, selecting a Ukrainian voice when available. */
export function speak(text: string, opts: SpeakOpts = {}): void {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) {
    opts.onerror?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'uk-UA';
    const v = pickUkVoice();
    if (v) u.voice = v;
    u.rate = opts.rate ?? 1;
    u.onend = () => opts.onend?.();
    u.onerror = () => opts.onerror?.();
    synth.speak(u);
  };

  // Voices may not be loaded on first use — wait for them once.
  if (synth.getVoices().length === 0) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      synth.onvoiceschanged = null;
      utter();
    };
    synth.onvoiceschanged = go;
    setTimeout(go, 300); // fallback if the event never fires
  } else {
    utter();
  }
}

export function stopSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}
