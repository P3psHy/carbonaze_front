export interface SiteMaterialInput {
  materialId: string;
  name: string;
  quantity: number;
}

export interface ConfiguredMaterial {
  id: string;
  backendId?: number;
  name: string;
  factor: number;
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
