import { useColorScheme } from 'react-native';
import { palettes, type Palette } from '../theme';
import { useApp } from '../store';

export interface Theme {
  p: Palette;
  scheme: 'dark' | 'light';
}

/** Resolves the user's theme preference (System / Dark / Light). */
export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useApp((s) => s.settings.theme);
  const scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return { p: palettes[scheme], scheme };
}
