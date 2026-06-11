import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { SpeechRecognizer, SttAvailability, SttCallbacks, SttStartOptions } from '../../lib/stt/types';

/**
 * Primary backend: native platform recognition via expo-speech-recognition
 * (iOS SFSpeechRecognizer). Free; on-device where the locale model exists,
 * otherwise the OS's networked recognition — still free (plan §4.2).
 *
 * expo-speech-transcriber (Apple SpeechAnalyzer) was evaluated for the M0
 * bake-off and rejected at v0.1.9: it is hardcoded to en_US, so it cannot
 * judge Indonesian or Mandarin. Revisit if it ships locale support — only
 * this file and a sibling would change (stretch contract #1).
 */
export class NativeRecognizer implements SpeechRecognizer {
  readonly name = 'expo-speech-recognition (SFSpeechRecognizer)';

  private subscriptions: { remove(): void }[] = [];

  async availability(locale: string): Promise<SttAvailability> {
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    let onDevice = false;
    try {
      onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      if (onDevice) {
        const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        onDevice = installedLocales.includes(locale);
      }
    } catch {
      onDevice = false;
    }
    return { available, onDevice };
  }

  async start(options: SttStartOptions, callbacks: SttCallbacks): Promise<void> {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      callbacks.onError({ code: 'permission_denied', message: 'Microphone or speech permission not granted' });
      return;
    }

    this.removeListeners();
    const listen = (event: string, handler: (e: any) => void) => {
      this.subscriptions.push(ExpoSpeechRecognitionModule.addListener(event as any, handler));
    };

    let finished = false;
    listen('speechstart', () => callbacks.onSpeechStart?.());
    listen('result', (e: { results: { transcript: string }[]; isFinal: boolean }) => {
      const transcript = e.results[0]?.transcript ?? '';
      if (e.isFinal) {
        finished = true;
        callbacks.onFinal(transcript);
      } else {
        callbacks.onPartial?.(transcript);
      }
    });
    listen('error', (e: { error: string; message: string }) => {
      finished = true;
      callbacks.onError({ code: e.error, message: e.message });
    });
    listen('end', () => {
      this.removeListeners();
      if (!finished) callbacks.onEnd?.();
    });
    if (options.recordAudio) {
      listen('audioend', (e: { uri?: string }) => {
        if (e.uri) callbacks.onAudioFile?.(e.uri);
      });
    }

    const onDevice = options.preferOnDevice ? (await this.availability(options.locale)).onDevice : false;

    ExpoSpeechRecognitionModule.start({
      lang: options.locale,
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: onDevice,
      addsPunctuation: false,
      ...(options.recordAudio
        ? {
            // Library default output directory; the attempt store moves the
            // file into its rolling 30-day folder via onAudioFile.
            recordingOptions: {
              persist: true,
              outputSampleRate: 16000, // stretch contract #2: 16 kHz mono
            },
          }
        : {}),
    });
  }

  stop(): void {
    ExpoSpeechRecognitionModule.stop();
  }

  abort(): void {
    ExpoSpeechRecognitionModule.abort();
    this.removeListeners();
  }

  private removeListeners(): void {
    for (const s of this.subscriptions) s.remove();
    this.subscriptions = [];
  }
}
