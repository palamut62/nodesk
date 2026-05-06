import { useApp } from './app-state';
import { makeT } from './i18n';

export function useT() {
  const { settings } = useApp();
  return makeT(settings.language ?? 'tr');
}
