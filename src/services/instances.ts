import { NativeRecognizer } from './stt/native-recognizer';
import { TeachingAudio } from './audio';

/** App-wide singletons; screens import these, never the native modules. */
export const recognizer = new NativeRecognizer();
export const teachingAudio = new TeachingAudio();
