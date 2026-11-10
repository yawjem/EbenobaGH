// Country names for the international address picker. The server decides WHICH countries
// can be delivered to (delivery_countries()); this file only supplies display names.
const NAMES: Record<string, string> = {
  GH: 'Ghana', NG: 'Nigeria', TG: 'Togo', BJ: 'Benin', CI: "Côte d'Ivoire", BF: 'Burkina Faso', SN: 'Senegal', GM: 'Gambia',
  SL: 'Sierra Leone', LR: 'Liberia', ZA: 'South Africa', KE: 'Kenya', EG: 'Egypt', MA: 'Morocco', TZ: 'Tanzania', UG: 'Uganda',
  RW: 'Rwanda', ET: 'Ethiopia', CM: 'Cameroon', GB: 'United Kingdom', DE: 'Germany', FR: 'France', NL: 'Netherlands', IT: 'Italy',
  ES: 'Spain', BE: 'Belgium', IE: 'Ireland', SE: 'Sweden', CH: 'Switzerland', US: 'United States', CA: 'Canada',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', IN: 'India', CN: 'China', JP: 'Japan', SG: 'Singapore', MY: 'Malaysia', TR: 'Türkiye',
};
export const countryName = (code: string) => {
  if (NAMES[code]) return NAMES[code];
  try { return new (Intl as any).DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};
