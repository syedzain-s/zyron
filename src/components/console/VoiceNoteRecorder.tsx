'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

const RECORD_SECONDS = 30;

export function VoiceNoteRecorder({
  disabled,
  onTranscript,
  onError,
}: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setProcessing(true);
        try {
          const raw = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const wav = await blobToWav(raw);
          const response = await fetch('/api/voice-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media: await blobToDataUrl(wav), mimeType: 'audio/wav' }),
          });
          const data = (await response.json()) as { transcript?: string; error?: string };
          if (!response.ok) throw new Error(data.error ?? 'The voice note could not be transcribed.');
          if (!data.transcript) throw new Error('The voice note was empty. Try speaking a little closer to the microphone.');
          onTranscript(data.transcript);
        } catch (error) {
          onError(error instanceof Error ? error.message : 'The voice note could not be processed.');
        } finally {
          setProcessing(false);
        }
      };
      recorder.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      onError('Microphone permission was refused. Allow microphone access or type the command.');
    }
  };

  useEffect(() => {
    if (!recording) return;
    if (seconds >= RECORD_SECONDS) {
      stop();
      return;
    }
    const timer = window.setTimeout(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [recording, seconds]);

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || processing}
      aria-label={recording ? 'Stop voice note' : 'Record voice note'}
      title={recording ? 'Stop voice note' : processing ? 'Transcribing voice note' : 'Record voice note'}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ash transition-colors hover:bg-cream/5 hover:text-gold disabled:opacity-40"
    >
      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-3.5 w-3.5 text-signal-risk" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  await context.close();
  const frames = audio.length;
  const bytes = frames * 2;
  const output = new ArrayBuffer(44 + bytes);
  const view = new DataView(output);
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, bytes, true);
  const samples = audio.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([output], { type: 'audio/wav' });
}
