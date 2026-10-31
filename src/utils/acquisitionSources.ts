import { normalizeAnalyticsCampaign } from './analyticsAttribution';

/** Answers to "Comment avez-vous connu MaTable ?" on the merchant sign-up form. */
export const ACQUISITION_SOURCES = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'whatsapp', label: 'WhatsApp (statut, groupe, message)' },
  { value: 'facebook_instagram', label: 'Facebook ou Instagram' },
  { value: 'bouche_a_oreille', label: 'Un proche ou un autre commerçant' },
  { value: 'google', label: 'Recherche Google' },
  { value: 'autre', label: 'Autre' },
] as const;

export type AcquisitionSource = typeof ACQUISITION_SOURCES[number]['value'];

export function normalizeAcquisitionSource(value: unknown): AcquisitionSource | null {
  return ACQUISITION_SOURCES.some((source) => source.value === value) ? value as AcquisitionSource : null;
}

export function getAcquisitionSourceLabel(value: unknown): string {
  return ACQUISITION_SOURCES.find((source) => source.value === value)?.label || 'Non renseigné';
}

export { normalizeAnalyticsCampaign as normalizeAcquisitionCampaign };
