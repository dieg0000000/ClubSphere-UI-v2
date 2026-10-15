import { useState, useCallback, useRef, useEffect } from 'react';

/* ─── Types ─── */

export interface TokenDef {
  token: string;
  label: string;
}

export interface TokenGroup {
  title: string;
  tokens: TokenDef[];
}

export interface TextBgPair {
  fg: string;
  bg: string;
  context: string;
}

export interface ResolvedPair {
  context: string;
  theme: 'Clair' | 'Sombre';
  fg: string;
  bg: string;
  fgHex: string;
  bgHex: string;
  ratio: number;
  pass: boolean;
}

type ThemeKey = 'light' | 'dark';
type TokenMap = Record<string, Record<ThemeKey, string>>;

/* ─── Color math (exported for page use) ─── */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function srgbLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = srgbLuminance(...rgb1);
  const l2 = srgbLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio: number): { label: string; pass: boolean } {
  if (ratio >= 4.5) return { label: 'AA', pass: true };
  if (ratio >= 3) return { label: 'AA grand texte', pass: true };
  return { label: 'ÉCHEC', pass: false };
}

function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(c => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

export function suggestCompliantColor(fgHex: string, bgHex: string): string {
  const bgRgb = hexToRgb(bgHex);
  const fgHsl = hexToHsl(fgHex);
  if (!bgRgb || !fgHsl) return fgHex;

  const bgLum = srgbLuminance(...bgRgb);
  const [h, s] = fgHsl;
  const needDarker = bgLum > 0.5;

  let bestHex = fgHex;
  let bestRatio = 0;

  for (let i = 0; i <= 100; i++) {
    const l = needDarker ? (50 - i * 0.5) / 100 : (50 + i * 0.5) / 100;
    if (l < 0 || l > 1) continue;
    const candidate = hslToHex(h, s, l);
    const candidateRgb = hexToRgb(candidate);
    if (!candidateRgb) continue;
    const r = contrastRatio(candidateRgb, bgRgb);
    if (r > bestRatio) {
      bestRatio = r;
      bestHex = candidate;
    }
    if (r >= 4.5) return candidate;
  }
  return bestHex;
}

/* ─── Original (immutable) values for light/dark themes ─── */

const ORIGINAL_LIGHT: Record<string, string> = {
  '--bg-app': '#F8FAFC', '--bg-sidebar': '#FFFFFF', '--bg-card': '#FFFFFF',
  '--bg-card-hover': '#F8FAFC', '--bg-hover': '#F8FAFC', '--bg-input': '#FFFFFF',
  '--bg-modal': '#FFFFFF', '--bg-table-header': '#F8FAFC', '--text-table-header': '#0F172A',
  '--bg-row-alt': '#F8FAFC',
  '--text-primary': '#0F172A', '--text-secondary': '#475569', '--text-muted': '#607490',
  '--text-inverse': '#FFFFFF',
  '--border-color': '#E2E8F0', '--border-strong': '#CBD5E1',
  '--accent': '#3B82F6', '--accent-hover': '#2563EB',
  '--accent-soft': '#E0F2FE', '--accent-text': '#0369A1',
  '--success': '#1C9B4B', '--success-soft': '#E9FBF0', '--success-text': '#158E41',
  '--warning': '#E8B430', '--warning-soft': '#FCF7E8', '--warning-text': '#97700C',
  '--info': '#3C83F6', '--info-soft': '#E7F0FE', '--info-text': '#04409F',
  '--danger': '#EF4343', '--danger-soft': '#FDE8E8', '--danger-text': '#9A0909',
  '--purple-soft': '#EFE8FD', '--purple-text': '#3E0A99',
  '--orange-soft': '#FFEDD5', '--orange-text': '#9D4A07',
  '--sky-soft': '#E7FBFE', '--sky-text': '#048D9F',
  '--pink-soft': '#FDE8F2', '--pink-text': '#980B52',
};

const ORIGINAL_DARK: Record<string, string> = {
  '--bg-app': '#0B1220', '--bg-sidebar': '#040D25', '--bg-card': '#040D25',
  '--bg-card-hover': '#111A30', '--bg-hover': '#111A30', '--bg-input': '#0B1220',
  '--bg-modal': '#040D25', '--bg-table-header': '#0B1220', '--text-table-header': '#F8FAFC',
  '--bg-row-alt': '#0B1220',
  '--text-primary': '#F8FAFC', '--text-secondary': '#E5F1FF', '--text-muted': '#7C8AA5',
  '--text-inverse': '#EDEDED',
  '--border-color': '#1E293B', '--border-strong': '#334155',
  '--accent': '#3B82F6', '--accent-hover': '#2563EB',
  '--accent-soft': '#1E3A8A', '--accent-text': '#93C5FD',
  '--success': '#1DC35A', '--success-soft': '#1C3B27', '--success-text': '#A9EFC3',
  '--warning': '#F1C350', '--warning-soft': '#3D331A', '--warning-text': '#F5DEA3',
  '--info': '#609BFB', '--info-soft': '#152641', '--info-text': '#9EC1FA',
  '--danger': '#F66565', '--danger-soft': '#3E1818', '--danger-text': '#F7A1A1',
  '--purple-soft': '#26193E', '--purple-text': '#C1A2F6',
  '--orange-soft': '#402917', '--orange-text': '#F8C8A0',
  '--sky-soft': '#143E43', '--sky-text': '#9EEFFA',
  '--pink-soft': '#3D1A2B', '--pink-text': '#F5A3CC',
};

export function getOriginals() {
  return { light: ORIGINAL_LIGHT, dark: ORIGINAL_DARK };
}

/* ─── Hook: manages live token values ─── */

export function useTokenEditor(tokenGroups: TokenGroup[]) {
  const allTokens = tokenGroups.flatMap(g => g.tokens);
  const tokenKeys = allTokens.map(t => t.token);

  const buildInitial = (): TokenMap => {
    const m: TokenMap = {};
    for (const k of tokenKeys) {
      m[k] = { light: ORIGINAL_LIGHT[k] || '#000000', dark: ORIGINAL_DARK[k] || '#000000' };
    }
    return m;
  };

  const [values, setValues] = useState<TokenMap>(buildInitial);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const originals = useRef<TokenMap>(buildInitial());

  const setValue = useCallback((token: string, theme: ThemeKey, hex: string) => {
    setValues(prev => ({
      ...prev,
      [token]: { ...prev[token], [theme]: hex },
    }));
  }, []);

  const resetToken = useCallback((token: string, theme: ThemeKey) => {
    setValues(prev => ({
      ...prev,
      [token]: { ...prev[token], [theme]: originals.current[token][theme] },
    }));
  }, []);

  const resetAll = useCallback(() => {
    setValues(buildInitial());
  }, []);

  const isModified = useCallback((token: string, theme: ThemeKey) => {
    return values[token]?.[theme]?.toUpperCase() !== originals.current[token]?.[theme]?.toUpperCase();
  }, [values]);

  const getModifiedList = useCallback((): { token: string; theme: ThemeKey; oldHex: string; newHex: string }[] => {
    const list: { token: string; theme: ThemeKey; oldHex: string; newHex: string }[] = [];
    for (const k of tokenKeys) {
      for (const t of ['light', 'dark'] as ThemeKey[]) {
        if (isModified(k, t)) {
          list.push({ token: k, theme: t, oldHex: originals.current[k][t], newHex: values[k][t] });
        }
      }
    }
    return list;
  }, [values, isModified, tokenKeys]);

  const hasAnyModification = getModifiedList().length > 0;

  const copyModified = useCallback(async () => {
    const list = getModifiedList();
    if (list.length === 0) return;
    const text = list.map(m => `${m.token}: ${m.oldHex} → ${m.newHex} (theme: ${m.theme})`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setToastVisible(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
    } catch {
      /* clipboard blocked */
    }
  }, [getModifiedList]);

  const computePairs = useCallback((pairDefs: TextBgPair[]): ResolvedPair[] => {
    const resolved: ResolvedPair[] = [];
    for (const p of pairDefs) {
      for (const [theme, themeKey] of [['Clair', 'light'], ['Sombre', 'dark']] as const) {
        const fgHex = values[p.fg]?.[themeKey] || '#000000';
        const bgHex = values[p.bg]?.[themeKey] || '#FFFFFF';
        const fgRgb = hexToRgb(fgHex);
        const bgRgb = hexToRgb(bgHex);
        if (fgRgb && bgRgb) {
          const r = contrastRatio(fgRgb, bgRgb);
          resolved.push({
            context: p.context,
            theme,
            fg: p.fg,
            bg: p.bg,
            fgHex,
            bgHex,
            ratio: r,
            pass: r >= 3,
          });
        }
      }
    }
    return resolved;
  }, [values]);

  const suggestFix = useCallback((fgToken: string, bgToken: string, theme: ThemeKey) => {
    const fgHex = values[fgToken]?.[theme] || '#000000';
    const bgHex = values[bgToken]?.[theme] || '#FFFFFF';
    const suggested = suggestCompliantColor(fgHex, bgHex);
    setValue(fgToken, theme, suggested);
  }, [values, setValue]);

  const generateStyleBlock = useCallback((): string => {
    const lightVars = tokenKeys.map(k => `${k}: ${values[k]?.light || '#000000'};`).join(' ');
    const darkVars = tokenKeys.map(k => `${k}: ${values[k]?.dark || '#000000'};`).join(' ');
    return `
      .styleguide-light-pane {
        color-scheme: light;
        ${lightVars}
        --shadow-sm: 0 1px 2px rgba(15,23,42,.04);
        --filter-btn-bg: transparent; --filter-btn-text: #475569;
        background: ${values['--bg-app']?.light || '#F8FAFC'}; color: ${values['--text-primary']?.light || '#0F172A'};
      }
      .styleguide-dark-pane {
        color-scheme: dark;
        ${darkVars}
        --shadow-sm: none;
        --filter-btn-bg: transparent; --filter-btn-text: #94A3B8;
        background: ${values['--bg-app']?.dark || '#0B1220'}; color: ${values['--text-primary']?.dark || '#F8FAFC'};
      }
    `;
  }, [values, tokenKeys]);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  return {
    values,
    setValue,
    resetToken,
    resetAll,
    isModified,
    hasAnyModification,
    copyModified,
    toastVisible,
    computePairs,
    suggestFix,
    generateStyleBlock,
    getModifiedList,
  };
}

/* ─── Inline editor UI for a single token ─── */

interface TokenEditorRowProps {
  token: string;
  theme: ThemeKey;
  value: string;
  modified: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}

export function TokenEditorRow({ token, theme, value, modified, onChange, onReset }: TokenEditorRowProps) {
  const normalized = value.length === 7 && value.startsWith('#') ? value : '#000000';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <input
        type="color"
        value={normalized.toLowerCase()}
        onChange={e => onChange(e.target.value.toUpperCase())}
        style={{ width: '22px', height: '22px', border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
        title={`${token} (${theme})`}
      />
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value.toUpperCase();
          if (/^#[0-9A-F]{0,6}$/.test(v) || v === '') onChange(v.length === 7 ? v : value);
          if (/^#[0-9A-F]{6}$/.test(v)) onChange(v);
        }}
        onBlur={e => {
          const v = e.target.value.toUpperCase();
          if (!/^#[0-9A-F]{6}$/.test(v)) onChange(normalized);
        }}
        style={{
          width: '80px',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid #E2E8F0',
          background: '#FFFFFF',
          color: '#0F172A',
        }}
      />
      {modified && (
        <>
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: '4px',
            background: '#DBEAFE',
            color: '#1D4ED8',
          }}>modifié</span>
          <button
            onClick={onReset}
            style={{
              fontSize: '11px',
              padding: '1px 4px',
              borderRadius: '4px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#64748B',
              cursor: 'pointer',
            }}
            title="Réinitialiser"
          >
            ↺
          </button>
        </>
      )}
    </div>
  );
}
