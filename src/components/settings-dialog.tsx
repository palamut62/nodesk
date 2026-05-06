import { useState } from 'react';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Settings as SettingsIcon, RefreshCw, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { fetchModels, DEFAULT_AI_PROMPTS } from '@/lib/ai';
import { AiProvider, AppTheme, PageSize, PageOrientation } from '@/lib/types';
import { listModels, saveSettings } from '@/lib/tauri';

const THEMES: { id: AppTheme; labelKey: string; bg: string; fg: string; page: string }[] = [
  { id: 'light',        labelKey: 'theme.light',    bg: '#f0ede8', fg: '#2c2a29', page: '#fdfcfb' },
  { id: 'dark',         labelKey: 'theme.dark',     bg: '#252320', fg: '#e8e4dc', page: '#2b2826' },
  { id: 'sepia',        labelKey: 'theme.sepia',    bg: '#ddd0b6', fg: '#3a2a18', page: '#f4ead6' },
  { id: 'apple-yellow', labelKey: 'theme.apple',    bg: '#f7e96a', fg: '#2c2a29', page: '#fefce8' },
  { id: 'dark-blue',    labelKey: 'theme.darkblue', bg: '#0e1624', fg: '#c8d8e8', page: '#131f2e' },
  { id: 'green-black',  labelKey: 'theme.terminal', bg: '#0a0a0a', fg: '#3ddc6a', page: '#111111' },
];

const MARGIN_PRESETS_DATA = [
  { key: 'narrow' as const, top: 48,  bottom: 72,  left: 48,  right: 48  },
  { key: 'normal' as const, top: 80,  bottom: 120, left: 80,  right: 80  },
  { key: 'wide'   as const, top: 120, bottom: 140, left: 128, right: 128 },
];

const TRANSLATE_LANGS = [
  { value: 'Türkçe',     label: '🇹🇷 Türkçe' },
  { value: 'İngilizce',  label: '🇬🇧 İngilizce' },
  { value: 'Almanca',    label: '🇩🇪 Almanca' },
  { value: 'Fransızca',  label: '🇫🇷 Fransızca' },
  { value: 'İspanyolca', label: '🇪🇸 İspanyolca' },
  { value: 'İtalyanca',  label: '🇮🇹 İtalyanca' },
  { value: 'Portekizce', label: '🇵🇹 Portekizce' },
  { value: 'Rusça',      label: '🇷🇺 Rusça' },
  { value: 'Arapça',     label: '🇸🇦 Arapça' },
  { value: 'Japonca',    label: '🇯🇵 Japonca' },
  { value: 'Çince',      label: '🇨🇳 Çince' },
  { value: 'Korece',     label: '🇰🇷 Korece' },
];

const PROMPT_DEFS = [
  { key: 'fixText'   as const, labelKey: 'settings.ai.prompts.fix',       hintKey: 'settings.ai.prompts.fix.hint',       default: DEFAULT_AI_PROMPTS.fixText },
  { key: 'translate' as const, labelKey: 'settings.ai.prompts.translate',  hintKey: 'settings.ai.prompts.translate.hint', default: DEFAULT_AI_PROMPTS.translate },
  { key: 'summarize' as const, labelKey: 'settings.ai.prompts.summarize',  hintKey: 'settings.ai.prompts.summarize.hint', default: DEFAULT_AI_PROMPTS.summarize },
  { key: 'chat'      as const, labelKey: 'settings.ai.prompts.chat',       hintKey: 'settings.ai.prompts.chat.hint',      default: DEFAULT_AI_PROMPTS.chat },
] as const;

type ProviderStatus = 'idle' | 'loading' | 'ok' | 'error';

interface ProviderBlockProps {
  id: AiProvider;
  label: string;
  apiKey: string;
  model: string;
  models: { id: string; name: string }[];
  status: ProviderStatus;
  errorMsg: string;
  isActive: boolean;
  onSetActive: () => void;
  onChangeKey: (v: string) => void;
  onFetch: () => void;
  onSelectModel: (v: string) => void;
}

function ProviderBlock({
  label, apiKey, model, models, status, errorMsg, isActive,
  onSetActive, onChangeKey, onFetch, onSelectModel,
}: ProviderBlockProps) {
  const t = useT();
  return (
    <div
      className={`rounded-lg border p-4 space-y-3 cursor-pointer transition-all ${
        isActive
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border hover:border-muted-foreground'
      }`}
      onClick={onSetActive}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {isActive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
            {t('settings.active')}
          </span>
        )}
      </div>

      <div className="grid gap-1.5" onClick={e => e.stopPropagation()}>
        <Label className="text-xs text-muted-foreground">{t('settings.api.key')}</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={e => onChangeKey(e.target.value)}
          placeholder={`${label} API anahtarı`}
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-end gap-2" onClick={e => e.stopPropagation()}>
        <div className="grid gap-1.5 flex-1 min-w-0">
          <Label className="text-xs text-muted-foreground">Model</Label>
          <Select value={model} onValueChange={onSelectModel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Model seç" />
            </SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {model && models.length === 0 && (
                <SelectItem value={model}>{model}</SelectItem>
              )}
              {models.map((m, i) => (
                <SelectItem key={`${m.id}-${i}`} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 px-3 text-xs shrink-0"
          onClick={e => { e.stopPropagation(); onFetch(); }}
          disabled={!apiKey || status === 'loading'}
        >
          {status === 'loading'
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            : t('settings.fetch')}
        </Button>
      </div>

      {status === 'ok' && (
        <p className="text-[11px] text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {t('settings.models.loaded', { n: models.length })}
        </p>
      )}
      {status === 'error' && (
        <p className="text-[11px] text-destructive flex items-center gap-1 break-all">
          <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg || t('settings.conn.fail')}
        </p>
      )}
    </div>
  );
}

export function SettingsDialog() {
  const { settings, updateSettings } = useApp();
  const t = useT();
  const [orModels, setOrModels] = useState<{ id: string; name: string }[]>([]);
  const [nvModels, setNvModels] = useState<{ id: string; name: string }[]>([]);
  const [gqModels, setGqModels] = useState<{ id: string; name: string }[]>([]);
  const [orStatus, setOrStatus] = useState<ProviderStatus>('idle');
  const [nvStatus, setNvStatus] = useState<ProviderStatus>('idle');
  const [gqStatus, setGqStatus] = useState<ProviderStatus>('idle');
  const [orError, setOrError]   = useState('');
  const [nvError, setNvError]   = useState('');
  const [gqError, setGqError]   = useState('');

  const persistBackend = async (patch: {
    ai_provider?: AiProvider;
    openrouter_api_key?: string;
    openrouter_model?: string;
    nvidia_api_key?: string;
    nvidia_model?: string;
    groq_api_key?: string;
  }) => {
    try {
      await saveSettings(patch);
    } catch (e) {
      console.warn('[settings] backend sync failed', e);
    }
  };

  const fetchFor = async (provider: AiProvider) => {
    const keyRaw = provider === 'openrouter'
      ? settings.openrouterApiKey
      : provider === 'nvidia'
        ? settings.nvidiaApiKey
        : settings.groqApiKey;
    const key = keyRaw.trim();
    if (!key) return;
    const setStatus = provider === 'openrouter'
      ? setOrStatus
      : provider === 'nvidia'
        ? setNvStatus
        : setGqStatus;
    const setModels = provider === 'openrouter'
      ? setOrModels
      : provider === 'nvidia'
        ? setNvModels
        : setGqModels;
    const setError = provider === 'openrouter'
      ? setOrError
      : provider === 'nvidia'
        ? setNvError
        : setGqError;
    const modelKey = provider === 'openrouter'
      ? 'openrouterModel'
      : provider === 'nvidia'
        ? 'nvidiaModel'
        : 'groqModel';
    const curModel = provider === 'openrouter'
      ? settings.openrouterModel
      : provider === 'nvidia'
        ? settings.nvidiaModel
        : settings.groqModel;
    setStatus('loading');
    setError('');
    try {
      let fetched: { id: string; name: string }[] = [];
      if (provider === 'openrouter' || provider === 'nvidia') {
        await persistBackend({
          ai_provider: provider,
          openrouter_api_key: provider === 'openrouter' ? key : undefined,
          openrouter_model: provider === 'openrouter' ? curModel : undefined,
          nvidia_api_key: provider === 'nvidia' ? key : undefined,
          nvidia_model: provider === 'nvidia' ? curModel : undefined,
        });
        try {
          fetched = await listModels();
        } catch {
          // Fallback: dogrudan provider endpoint'inden cekip UI'yi kilitlemeden devam et.
          fetched = await fetchModels(provider, key);
        }
      } else {
        fetched = await fetchModels(provider, key);
        await persistBackend({
          ai_provider: provider,
          groq_api_key: key,
        });
      }
      setModels(fetched);
      setStatus('ok');
      if (fetched.length > 0 && !fetched.find(m => m.id === curModel)) {
        updateSettings({ [modelKey]: fetched[0].id });
      }
    } catch (e: any) {
      setStatus('error');
      setError(e.message || 'Bilinmeyen hata');
    }
  };

  const marginVal = (key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight') =>
    String(settings[key] ?? 80);

  const setMargin = (key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 300) updateSettings({ [key]: n });
  };

  const getPrompt = (key: keyof typeof DEFAULT_AI_PROMPTS) =>
    settings.aiPrompts?.[key] ?? DEFAULT_AI_PROMPTS[key];

  const setPrompt = (key: keyof typeof DEFAULT_AI_PROMPTS, value: string) => {
    updateSettings({ aiPrompts: { ...settings.aiPrompts, [key]: value } });
  };

  const resetPrompt = (key: keyof typeof DEFAULT_AI_PROMPTS) => {
    const next = { ...settings.aiPrompts };
    delete next[key];
    updateSettings({ aiPrompts: next });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[540px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="ai" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-5 mb-1 shrink-0 grid grid-cols-4">
            <TabsTrigger value="ai" className="text-xs">{t('settings.tab.ai')}</TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs">{t('settings.tab.appearance')}</TabsTrigger>
            <TabsTrigger value="page" className="text-xs">{t('settings.tab.page')}</TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs">{t('settings.tab.prompts')}</TabsTrigger>
          </TabsList>

          {/* ── AI tab ── */}
          <TabsContent
            value="ai"
            className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-3 settings-scroll"
          >
            <p className="text-xs text-muted-foreground">
              {t('settings.ai.desc')}
            </p>
            <ProviderBlock
              id="openrouter"
              label="OpenRouter"
              apiKey={settings.openrouterApiKey}
              model={settings.openrouterModel}
              models={orModels}
              status={orStatus}
              errorMsg={orError}
              isActive={settings.provider === 'openrouter'}
              onSetActive={() => {
                updateSettings({ provider: 'openrouter' });
                void persistBackend({ ai_provider: 'openrouter' });
              }}
              onChangeKey={v => {
                updateSettings({ openrouterApiKey: v });
                void persistBackend({ openrouter_api_key: v.trim() });
              }}
              onFetch={() => fetchFor('openrouter')}
              onSelectModel={v => {
                updateSettings({ openrouterModel: v });
                void persistBackend({ openrouter_model: v });
              }}
            />
            <ProviderBlock
              id="nvidia"
              label="NVIDIA NIM"
              apiKey={settings.nvidiaApiKey}
              model={settings.nvidiaModel}
              models={nvModels}
              status={nvStatus}
              errorMsg={nvError}
              isActive={settings.provider === 'nvidia'}
              onSetActive={() => {
                updateSettings({ provider: 'nvidia' });
                void persistBackend({ ai_provider: 'nvidia' });
              }}
              onChangeKey={v => {
                updateSettings({ nvidiaApiKey: v });
                void persistBackend({ nvidia_api_key: v.trim() });
              }}
              onFetch={() => fetchFor('nvidia')}
              onSelectModel={v => {
                updateSettings({ nvidiaModel: v });
                void persistBackend({ nvidia_model: v });
              }}
            />
            <ProviderBlock
              id="groq"
              label="Groq"
              apiKey={settings.groqApiKey}
              model={settings.groqModel}
              models={gqModels}
              status={gqStatus}
              errorMsg={gqError}
              isActive={settings.provider === 'groq'}
              onSetActive={() => {
                updateSettings({ provider: 'groq' });
                void persistBackend({ ai_provider: 'groq' });
              }}
              onChangeKey={v => {
                updateSettings({ groqApiKey: v });
                void persistBackend({ groq_api_key: v.trim() });
              }}
              onFetch={() => fetchFor('groq')}
              onSelectModel={v => updateSettings({ groqModel: v })}
            />
          </TabsContent>

          {/* ── Görünüm tab ── */}
          <TabsContent
            value="appearance"
            className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-5 settings-scroll"
          >
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.language')}</h3>
              <div className="flex gap-2">
                {(['tr', 'en'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => updateSettings({ language: lang })}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      (settings.language ?? 'tr') === lang
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {lang === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.theme')}</h3>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => updateSettings({ theme: theme.id })}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      settings.theme === theme.id
                        ? 'border-primary shadow-md scale-[1.03]'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className="h-14 flex flex-col" style={{ background: theme.bg }}>
                      <div className="h-3 w-full" style={{ borderBottom: `1px solid ${theme.fg}22` }} />
                      <div className="flex-1 mx-2 my-1 rounded-sm flex flex-col gap-[3px] px-1.5 pt-1" style={{ background: theme.page }}>
                        <div className="h-[3px] rounded-full w-3/4" style={{ background: theme.fg, opacity: 0.7 }} />
                        <div className="h-[3px] rounded-full w-full" style={{ background: theme.fg, opacity: 0.4 }} />
                        <div className="h-[3px] rounded-full w-5/6" style={{ background: theme.fg, opacity: 0.4 }} />
                      </div>
                    </div>
                    <div className="text-[10px] font-medium py-1 text-center" style={{ background: theme.bg, color: theme.fg }}>
                      {t(theme.labelKey as Parameters<typeof t>[0])}
                    </div>
                    {settings.theme === theme.id && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Sayfa tab ── */}
          <TabsContent
            value="page"
            className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-5 settings-scroll"
          >
            {/* Page size & orientation */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.page.size')}</h3>
              <div className="grid grid-cols-5 gap-1.5">
                {(['a4','a5','letter','legal','a3'] as PageSize[]).map(sz => (
                  <button
                    key={sz}
                    onClick={() => updateSettings({ pageSize: sz })}
                    className={`py-1.5 text-xs rounded border transition-colors ${
                      (settings.pageSize ?? 'a4') === sz
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {sz === 'a4' ? 'A4' : sz === 'a5' ? 'A5' : sz === 'letter' ? 'Letter' : sz === 'legal' ? 'Legal' : 'A3'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t(`settings.page.${settings.pageSize ?? 'a4'}` as Parameters<typeof t>[0])}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.page.orientation')}</h3>
              <div className="flex gap-2">
                {(['portrait', 'landscape'] as PageOrientation[]).map(ori => (
                  <button
                    key={ori}
                    onClick={() => updateSettings({ pageOrientation: ori })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs rounded border transition-colors ${
                      (settings.pageOrientation ?? 'portrait') === ori
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <span className={`inline-block border-2 border-current rounded-sm ${ori === 'portrait' ? 'w-4 h-5' : 'w-5 h-4'}`} />
                    {t(`settings.page.${ori}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.margins')}</h3>
              <div className="flex gap-2">
                {MARGIN_PRESETS_DATA.map(p => {
                  const active =
                    settings.marginTop === p.top && settings.marginBottom === p.bottom &&
                    settings.marginLeft === p.left && settings.marginRight === p.right;
                  const labelKey = `settings.margin.${p.key}` as const;
                  return (
                    <button
                      key={p.key}
                      onClick={() => updateSettings({ marginTop: p.top, marginBottom: p.bottom, marginLeft: p.left, marginRight: p.right })}
                      className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                        active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'marginTop' as const,    labelKey: 'settings.margin.top' as const },
                    { key: 'marginBottom' as const, labelKey: 'settings.margin.bottom' as const },
                    { key: 'marginLeft' as const,   labelKey: 'settings.margin.left' as const },
                    { key: 'marginRight' as const,  labelKey: 'settings.margin.right' as const },
                  ]
                ).map(({ key, labelKey }) => (
                  <div key={key} className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">{t(labelKey)} (px)</Label>
                    <Input
                      type="number" min={0} max={300} step={8}
                      value={marginVal(key)}
                      onChange={e => setMargin(key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Page color */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.page.color')}</h3>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5 flex-wrap">
                  {['#ffffff','#fffef0','#fdf6e3','#f0f4ff','#f0fff4','#fff0f0','#f5f0ff','#1e1e1e','#1a2332','#0d1f0d'].map(col => (
                    <button
                      key={col}
                      onClick={() => updateSettings({ pageColor: col })}
                      title={col}
                      className={`w-6 h-6 rounded border-2 transition-all ${
                        (settings.pageColor ?? '') === col ? 'border-primary scale-110' : 'border-border hover:scale-105'
                      }`}
                      style={{ background: col }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={settings.pageColor ?? '#ffffff'}
                  onChange={e => updateSettings({ pageColor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-transparent"
                  title="Özel renk"
                />
                {settings.pageColor && (
                  <button
                    onClick={() => updateSettings({ pageColor: undefined })}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {t('settings.page.color.reset')}
                  </button>
                )}
              </div>
            </div>

            {/* Column layout */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.page.columns')}</h3>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => updateSettings({ pageColumns: n })}
                    className={`flex-1 py-2 flex flex-col items-center gap-1.5 rounded border text-xs transition-colors ${
                      (settings.pageColumns ?? 1) === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <div className={`flex gap-0.5 ${(settings.pageColumns ?? 1) === n ? 'opacity-100' : 'opacity-60'}`}>
                      {Array.from({ length: n }).map((_, i) => (
                        <div key={i} className="w-3 h-5 rounded-sm bg-current opacity-70" />
                      ))}
                    </div>
                    {t(`settings.page.col${n}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            {/* Line spacing */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.page.lineheight')}</h3>
              <div className="flex gap-2">
                {([
                  { val: 1.2, label: '1.2' },
                  { val: 1.5, label: '1.5' },
                  { val: 1.75, label: '1.75' },
                  { val: 2.0, label: '2.0' },
                  { val: 2.5, label: '2.5' },
                ]).map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => updateSettings({ lineHeight: val })}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                      (settings.lineHeight ?? 1.75) === val
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.bg.pattern')}</h3>
              <RadioGroup
                value={settings.backgroundPattern}
                onValueChange={(val: 'none' | 'lines' | 'grid') => updateSettings({ backgroundPattern: val })}
                className="flex gap-4"
              >
                {(['none', 'lines', 'grid'] as const).map(v => (
                  <div key={v} className="flex items-center space-x-2">
                    <RadioGroupItem value={v} id={`pat-${v}`} />
                    <Label htmlFor={`pat-${v}`} className="text-sm">
                      {v === 'none' ? t('settings.bg.none') : v === 'lines' ? t('settings.bg.lines') : t('settings.bg.grid')}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </TabsContent>

          {/* ── Promptlar tab ── */}
          <TabsContent
            value="prompts"
            className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-5 settings-scroll"
          >
            {/* Translation target language */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.translate.target')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.translate.target.desc')}
              </p>
              <Select
                value={settings.translateTarget ?? 'Türkçe'}
                onValueChange={v => updateSettings({ translateTarget: v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSLATE_LANGS.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Prompts */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm border-b pb-2">{t('settings.ai.prompts.title')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.ai.prompts.desc')} <code className="bg-muted px-1 rounded text-[10px]">{'{text}'}</code>, <code className="bg-muted px-1 rounded text-[10px]">{'{targetLang}'}</code>, <code className="bg-muted px-1 rounded text-[10px]">{'{noteContent}'}</code>
              </p>
              {PROMPT_DEFS.map(def => {
                const isCustom = !!settings.aiPrompts?.[def.key];
                return (
                  <div key={def.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        {t(def.labelKey as Parameters<typeof t>[0])}
                        {isCustom && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {t('settings.ai.prompts.customized')}
                          </span>
                        )}
                      </Label>
                      {isCustom && (
                        <button
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => resetPrompt(def.key)}
                          title={t('settings.ai.prompts.reset.title')}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('settings.ai.prompts.reset')}
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full min-h-[80px] text-xs px-3 py-2 rounded-md border border-input bg-background resize-y outline-none focus:ring-1 focus:ring-primary font-mono"
                      value={getPrompt(def.key)}
                      onChange={e => setPrompt(def.key, e.target.value)}
                      spellCheck={false}
                    />
                    <p className="text-[10px] text-muted-foreground">{t(def.hintKey as Parameters<typeof t>[0])}</p>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
