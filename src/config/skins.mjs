// The 8 Versus Gamers skins. Tokens ported exactly from the approved design canvas
// ("Versus Gamers – Home Design Options", Phone.dc.html / Desktop.dc.html skin()).
// One layout, one codebase: every skin is a set of CSS custom properties plus a few
// per-skin details (hero art variant, play-button label style, logo separator).
// scripts/gen-skins.mjs turns this file into src/styles/skins.css;
// scripts/build-fonts.mjs turns `fonts` into public/fonts/<id>.css.

const F = {
  chakra: "'Chakra Petch', 'Arial Narrow', sans-serif",
  manrope: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
  press: "'Press Start 2P', ui-monospace, monospace",
  grotesk: "'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
  sora: "'Sora', system-ui, -apple-system, 'Segoe UI', sans-serif",
  rajdhani: "'Rajdhani', 'Arial Narrow', sans-serif",
  techmono: "'Share Tech Mono', ui-monospace, monospace",
  barlow: "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif",
  jet: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', monospace",
  vt: "'VT323', ui-monospace, monospace",
  oswald: "'Oswald', 'Arial Narrow', sans-serif",
  sss: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
  exo: "'Exo 2', system-ui, sans-serif",
  inter: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const BASE = {
  borderW: '1px', radius: '0px', btnRadius: '0px', chipRadius: '0px', badgeRadius: '0px',
  btnClip: 'none', chipSkew: 'none', badgeSkew: 'none', cardShadow: 'none', btnShadow: 'none', logoShadow: 'none',
  upper: 'none', chipCase: 'none', logoCase: 'uppercase', logoTrack: '0.06em', track: '0', labelTrack: '0.14em',
  logoSep: '', badge: 'VS', h2Prefix: '', playStyle: 'default',
  displayWeight: 700, h2Weight: 700, labelWeight: 600, badgeWeight: 700, playWeight: 700, logoWeight: 700,
  pSize: '15px', cardTitleSize: '17px', adSize: '12px', shapeRx: '0',
  badgeSize: '13px', langSize: '14px', logoSize: '20px', h1Size: '38px', h1Desk: '64px', h2Size: '20px',
  kickerSize: '12px', playSize: '16px', glyphA: '#F2F4F7', glyphB: '#C8FF3D', glyphDiv: '#3A4A1A',
  scheme: 'dark',
};

export const SKINS = [
  {
    id: 'arena', name: { en: 'Arena', fr: 'Arena' },
    bg: '#0A0A12', surface: '#12121D', heroBg: '#12121D', border: '#23233A', borderStrong: '#3A3A58',
    text: '#F4F4FA', body: '#B4B4C8', muted: '#9A9AB0', accent: '#FF2E88', onAccent: '#0A0A12', accent2: '#22E4FF', onAccent2: '#0A0A12',
    kicker: '#22E4FF', link: '#22E4FF', logo2: '#22E4FF', h2Color: '#F4F4FA',
    fontDisplay: F.chakra, fontLabel: F.chakra, fontBody: F.manrope, chipFont: F.chakra, playFont: F.chakra,
    upper: 'uppercase', chipCase: 'uppercase', track: '0.04em',
    btnClip: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', chipSkew: 'skewX(-12deg)', badgeSkew: 'skewX(-12deg)',
    hero: 'split',
    tiles: [['#0F1E28', '#22E4FF'], ['#28101F', '#FF2E88'], ['#16162C', '#9B8CFF'], ['#1E1E12', '#E8FF5A'], ['#10241C', '#3DFFB0'], ['#26170F', '#FFA24C']],
    origs: [['#0D2B36', '#22E4FF'], ['#3A0F2B', '#FF2E88'], ['#1C1A3A', '#9B8CFF']],
    fonts: [['chakra-petch', [600, 700]], ['manrope', [400, 600, 700]]],
  },
  {
    id: 'synthwave', name: { en: 'Synthwave', fr: 'Synthwave' },
    bg: '#140A26', surface: '#1F1238', heroBg: '#140A26', border: '#3A2463', borderStrong: '#4A2E7A', borderW: '2px',
    text: '#FBF6FF', body: '#D9CCEF', muted: '#B9A8D6', accent: '#FF5CDB', onAccent: '#140A26', accent2: '#6CF0FF', onAccent2: '#140A26',
    kicker: '#FFB547', link: '#6CF0FF', logo1: '#FF5CDB', logo2: '#6CF0FF', h2Color: '#FFB547',
    fontDisplay: F.grotesk, fontLabel: F.press, fontBody: F.grotesk, chipFont: F.grotesk, playFont: F.press,
    logoSize: '11px', logoTrack: '0', logoWeight: 400, logoShadow: '0 0 10px rgba(255, 92, 219, 0.55)',
    badgeSize: '9px', badgeWeight: 400, langSize: '11px', h1Size: '40px', h2Size: '13px', h2Weight: 400,
    kickerSize: '11px', labelTrack: '0', labelWeight: 400, playSize: '12px', playWeight: 400, adSize: '11px',
    playStyle: 'press', cardShadow: '4px 4px 0 #0B0518', btnShadow: '4px 4px 0 #6CF0FF', hero: 'sunset',
    tiles: [['#22124A', '#6CF0FF'], ['#371040', '#FF5CDB'], ['#3A1A24', '#FFB547'], ['#1E1A48', '#B49CFF'], ['#12284A', '#6CF0FF'], ['#341632', '#FF8FA3']],
    origs: [['#2A1550', '#6CF0FF'], ['#3D1146', '#FF5CDB'], ['#3A1E22', '#FFB547']],
    fonts: [['press-start-2p', [400]], ['space-grotesk', [400, 500, 700]]],
  },
  {
    id: 'neonpro', name: { en: 'Neon Pro', fr: 'Néon Pro' },
    bg: '#0B0C0F', surface: '#15171C', heroBg: '#141A0C', border: '#262A31', borderStrong: '#333842',
    text: '#F2F4F7', body: '#AEB5C0', muted: '#9BA3AF', accent: '#C8FF3D', onAccent: '#0B0C0F', accent2: '#C8FF3D', onAccent2: '#0B0C0F',
    kicker: '#C8FF3D', link: '#C8FF3D', logo2: '#F2F4F7', h2Color: '#F2F4F7',
    fontDisplay: F.sora, fontLabel: F.sora, fontBody: F.sora, chipFont: F.sora, playFont: F.sora,
    logoCase: 'none', logoTrack: '-0.01em', logoSep: ' ', badge: 'V', badgeRadius: '9px', badgeSize: '16px',
    logoSize: '18px', h1Size: '34px', h1Desk: '60px', labelTrack: '0.08em', track: '-0.02em',
    radius: '18px', btnRadius: '14px', chipRadius: '999px', shapeRx: '5', hero: 'glyph',
    glyphA: '#F2F4F7', glyphB: '#C8FF3D', glyphDiv: '#3A4A1A',
    tiles: [['#181B22', '#C8FF3D'], ['#13161B', '#F2F4F7'], ['#141A0C', '#C8FF3D'], ['#181B22', '#F2F4F7'], ['#13161B', '#C8FF3D'], ['#141A0C', '#F2F4F7']],
    origs: [['#141A0C', '#C8FF3D'], ['#181B22', '#F2F4F7'], ['#141A0C', '#C8FF3D']],
    fonts: [['sora', [400, 600, 700]]],
  },
  {
    id: 'overdrive', name: { en: 'Overdrive', fr: 'Overdrive' },
    bg: '#0D0D0D', surface: '#171717', heroBg: '#FCEE0A', border: '#2E2E2E', borderStrong: '#4A4A4A',
    text: '#F5F5F0', body: '#C9C9C0', muted: '#A3A39A', accent: '#FCEE0A', onAccent: '#0D0D0D', accent2: '#3DF2F2', onAccent2: '#0D0D0D',
    kicker: '#3DF2F2', link: '#FCEE0A', logo2: '#FCEE0A', h2Color: '#F5F5F0',
    fontDisplay: F.rajdhani, fontLabel: F.techmono, fontBody: F.barlow, chipFont: F.rajdhani, playFont: F.rajdhani,
    logoFont: F.rajdhani, h2Font: F.rajdhani, upper: 'uppercase', chipCase: 'uppercase',
    logoSize: '22px', h1Size: '46px', h1Desk: '80px', h2Size: '24px', kickerSize: '13px', labelTrack: '0.1em', labelWeight: 400,
    playSize: '18px', cardTitleSize: '19px',
    btnClip: 'polygon(0 0, 100% 0, 100% 65%, calc(100% - 12px) 100%, 0 100%)', hero: 'glitch',
    tiles: [['#1A1A0A', '#FCEE0A'], ['#0A1A1A', '#3DF2F2'], ['#1F0D0D', '#FF4D4D'], ['#141414', '#F5F5F0'], ['#1A1A0A', '#FCEE0A'], ['#0A1A1A', '#3DF2F2']],
    origs: [['#1A1A0A', '#FCEE0A'], ['#0A1A1A', '#3DF2F2'], ['#1F0D0D', '#FF4D4D']],
    fonts: [['rajdhani', [600, 700]], ['share-tech-mono', [400]], ['barlow', [400, 600, 700]]],
  },
  {
    id: 'terminal', name: { en: 'Terminal', fr: 'Terminal' },
    bg: '#050805', surface: '#0A120A', heroBg: '#030603', border: '#1B3A1B', borderStrong: '#2E5A2E',
    text: '#D7FFD7', body: '#A8E6A8', muted: '#6FAF6F', accent: '#39FF6A', onAccent: '#031003', accent2: '#39FF6A', onAccent2: '#031003',
    kicker: '#FFD23F', link: '#39FF6A', logo2: '#39FF6A', h2Color: '#D7FFD7',
    fontDisplay: F.vt, fontLabel: F.jet, fontBody: F.jet, chipFont: F.jet, playFont: F.jet,
    logoCase: 'lowercase', logoTrack: '0', logoSep: '_', badge: '>_', badgeSize: '12px', langSize: '13px', logoSize: '16px',
    h1Size: '58px', h1Desk: '104px', displayWeight: 400, h2Size: '16px', kickerSize: '12px', labelTrack: '0.04em',
    pSize: '14px', playSize: '15px', cardTitleSize: '24px', playStyle: 'term', h2Prefix: '> ', hero: 'terminal',
    tiles: [['#0A140A', '#39FF6A'], ['#141208', '#FFD23F'], ['#0A140A', '#39FF6A'], ['#141208', '#FFD23F'], ['#0A140A', '#39FF6A'], ['#141208', '#FFD23F']],
    origs: [['#0A140A', '#39FF6A'], ['#141208', '#FFD23F'], ['#0A140A', '#39FF6A']],
    fonts: [['jetbrains-mono', [400, 700]], ['vt323', [400]]],
  },
  {
    id: 'champion', name: { en: 'Champion', fr: 'Champion' },
    bg: '#0B0A08', surface: '#15130F', heroBg: '#100E0A', border: '#2C271D', borderStrong: '#4A4130',
    text: '#F6F1E6', body: '#CFC6B4', muted: '#A89F8C', accent: '#E8B931', onAccent: '#0B0A08', accent2: '#E8B931', onAccent2: '#0B0A08',
    kicker: '#E8B931', link: '#E8B931', logo2: '#E8B931', h2Color: '#F6F1E6',
    fontDisplay: F.oswald, fontLabel: F.oswald, fontBody: F.sss, chipFont: F.oswald, playFont: F.oswald,
    upper: 'uppercase', chipCase: 'uppercase', logoSize: '22px', logoTrack: '0.08em', h1Size: '46px', h1Desk: '80px',
    h2Size: '22px', labelTrack: '0.3em', playSize: '17px', track: '0.03em', cardTitleSize: '19px',
    radius: '4px', btnRadius: '4px', chipRadius: '4px', badgeRadius: '4px', shapeRx: '2', hero: 'trophy',
    tiles: [['#1A160D', '#E8B931'], ['#15130F', '#F6F1E6'], ['#1A160D', '#E8B931'], ['#15130F', '#CFC6B4'], ['#1A160D', '#E8B931'], ['#15130F', '#F6F1E6']],
    origs: [['#1A160D', '#E8B931'], ['#15130F', '#F6F1E6'], ['#1A160D', '#E8B931']],
    fonts: [['oswald', [500, 700]], ['source-sans-3', [400, 600, 700]]],
  },
  {
    id: 'frost', name: { en: 'Frost', fr: 'Givre' },
    bg: '#07111F', surface: '#0D1B2E', heroBg: '#0A1A2E', border: '#1E3350', borderStrong: '#2B4A70',
    text: '#EAF4FF', body: '#C3D6EC', muted: '#8FA7C4', accent: '#7DF9FF', onAccent: '#07111F', accent2: '#B8E1FF', onAccent2: '#07111F',
    kicker: '#7DF9FF', link: '#7DF9FF', logo2: '#7DF9FF', h2Color: '#EAF4FF',
    fontDisplay: F.exo, fontLabel: F.exo, fontBody: F.inter, chipFont: F.exo, playFont: F.exo,
    logoSize: '17px', logoTrack: '0.12em', labelTrack: '0.2em',
    radius: '14px', btnRadius: '999px', chipRadius: '999px', badgeRadius: '8px', shapeRx: '4',
    cardShadow: '0 8px 24px rgba(0, 0, 0, 0.35)', hero: 'frost',
    tiles: [['#0F2238', '#7DF9FF'], ['#14203A', '#B8E1FF'], ['#0F2238', '#9FB7FF'], ['#102A33', '#7DF9FF'], ['#14203A', '#EAF4FF'], ['#0F2238', '#B8E1FF']],
    origs: [['#0F2238', '#7DF9FF'], ['#14203A', '#B8E1FF'], ['#102A33', '#9FB7FF']],
    fonts: [['exo-2', [600, 700]], ['inter', [400, 600, 700]]],
  },
  {
    id: 'daylight', name: { en: 'Daylight', fr: 'Lumière du jour' },
    bg: '#F4F5F7', surface: '#FFFFFF', heroBg: '#ECE8FF', border: '#DDE1E7', borderStrong: '#C5CBD4',
    text: '#12141A', body: '#3E4452', muted: '#5A6170', accent: '#5B3DF5', onAccent: '#FFFFFF', accent2: '#5B3DF5', onAccent2: '#FFFFFF',
    kicker: '#5B3DF5', link: '#4A2DE0', logo2: '#5B3DF5', h2Color: '#12141A',
    fontDisplay: F.grotesk, fontLabel: F.grotesk, fontBody: F.inter, chipFont: F.inter, playFont: F.grotesk,
    logoCase: 'none', logoTrack: '-0.01em', logoSep: ' ', logoSize: '18px', h1Size: '36px', h1Desk: '60px',
    labelTrack: '0.1em', track: '-0.02em',
    radius: '16px', btnRadius: '12px', chipRadius: '999px', badgeRadius: '8px', shapeRx: '5',
    cardShadow: '0 1px 2px rgba(18, 20, 26, 0.06)', hero: 'glyph', glyphA: '#12141A', glyphB: '#5B3DF5', glyphDiv: '#C9C0FF',
    scheme: 'light',
    tiles: [['#E9E6FF', '#5B3DF5'], ['#E3F2EE', '#0E8A6A'], ['#FCE9E4', '#C2410C'], ['#E6EEF9', '#1D4ED8'], ['#F3EBDD', '#8A5A00'], ['#ECECF0', '#12141A']],
    origs: [['#E9E6FF', '#5B3DF5'], ['#E3F2EE', '#0E8A6A'], ['#FCE9E4', '#C2410C']],
    fonts: [['space-grotesk', [400, 500, 700]], ['inter', [400, 600, 700]]],
  },
].map((s) => {
  const t = { ...BASE, ...s };
  t.logoFont = t.logoFont || t.fontLabel;
  t.h2Font = t.h2Font || t.fontLabel;
  t.logo1 = t.logo1 || t.text;
  return t;
});

export const DEFAULT_SKIN = 'arena';
export const HERO_VARIANTS = ['split', 'sunset', 'glyph', 'glitch', 'terminal', 'trophy', 'frost'];
