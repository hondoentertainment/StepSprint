import { FitnessProvider } from "@prisma/client";

const SLUG_TO_PROVIDER: Record<string, FitnessProvider> = {
  fitbit: FitnessProvider.FITBIT,
  google_fit: FitnessProvider.GOOGLE_FIT,
};

export function parseFitnessProviderSlug(slug: string): FitnessProvider | null {
  return SLUG_TO_PROVIDER[slug] ?? null;
}

export function fitnessProviderSlug(p: FitnessProvider): string {
  const m: Record<FitnessProvider, string> = {
    [FitnessProvider.FITBIT]: "fitbit",
    [FitnessProvider.GOOGLE_FIT]: "google_fit",
  };
  return m[p];
}
