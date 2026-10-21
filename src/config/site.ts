// Site-wide settings. Change values here, not in components.
export const SITE = {
  url: 'https://versusgamers.com',
  name: 'Versus Gamers',
  contactEmail: 'contact@versusgamers.com',
  owner: 'Fodz',
  location: { en: 'Pointe-Claire, Quebec, Canada', fr: 'Pointe-Claire (Québec), Canada' },
  launched: '2026',
};

// Playgama Partners. The CLID credits every game session to Fodz's partner account;
// it is public by design (it appears in every embed URL).
export const PLAYGAMA = {
  clid: 'p_034b5dd6-b37e-4809-9347-686e2432a0cd',
  embedBase: 'https://playgama.com/export/game/',
  // Playgama's own snippet asks for more; camera, microphone, geolocation, clipboard-read and
  // publickey-credentials-* are left out on purpose (browser games don't need them; Law 25).
  allow: [
    'fullscreen', 'autoplay', 'accelerometer', 'gyroscope', 'screen-wake-lock', 'clipboard-write', 'web-share',
    'encrypted-media', 'picture-in-picture', 'payment', 'storage-access', 'speaker-selection',
    'xr-spatial-tracking', 'attribution-reporting', 'browsing-topics',
  ].join('; '),
};

export const embedUrl = (slug: string) => `${PLAYGAMA.embedBase}${encodeURIComponent(slug)}?clid=${PLAYGAMA.clid}`;

// Google AdSense: leave `client` empty until Fodz is approved. While it is empty, every
// ad slot stays collapsed (no empty boxes on the page).
export const ADSENSE = {
  client: '', // e.g. 'ca-pub-0000000000000000'
};
