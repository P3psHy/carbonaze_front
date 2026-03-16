export interface SiteMaterialInput {
  name: string;
  quantity: number;
}

export type MaterialFactorKey = 'beton' | 'acier' | 'verre' | 'bois' | 'aluminium' | 'default';

export type MaterialFactorMap = Record<MaterialFactorKey, number>;

export interface MaterialFactorDefinition {
  key: MaterialFactorKey;
  label: string;
  helper: string;
  defaultFactor: number;
  aliases: string[];
}

export interface SiteInputPayload {
  siteName: string;
  city: string;
  energyMwh: number;
  gasMwh: number;
  employees: number;
  parkingSpaces: number;
  computers: number;
  materials: SiteMaterialInput[];
}

export interface ImpactCategory {
  key: 'materials' | 'energy' | 'gas' | 'parking' | 'equipment';
  label: string;
  emission: number;
  percentage: number;
  color: string;
  helper: string;
}

export interface MaterialImpact {
  name: string;
  quantity: number;
  factor: number;
  emission: number;
  share: number;
  color: string;
}

export interface SiteImpactResult {
  siteName: string;
  city: string;
  totalEmission: number;
  emissionPerEmployee: number;
  dominantCategory: string;
  dominantShare: number;
  materialCount: number;
  categories: ImpactCategory[];
  materials: MaterialImpact[];
  insights: string[];
}
