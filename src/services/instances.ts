import { NativeRecognizer } from './stt/native-recognizer';

/** App-wide singletons; screens import these, never the native modules. */
export const recognizer = new NativeRecognizer();
export { voiceEngine } from './voice-engine';
