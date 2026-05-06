// Backward-compat shim for old nodesk components
export type Lang = 'tr' | 'en';

export function useLang(): Lang {
  return 'tr';
}

export function useT() {
  return (key: string, _vars?: Record<string, string>) => key;
}
