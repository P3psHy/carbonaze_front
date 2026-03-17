import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../environment/environment';
import { ConfiguredMaterial } from './site-impact.models';

interface MaterialResponse {
  id: number;
  name: string;
  energeticValue: number;
  quantity: number;
}

interface SaveMaterialRequest {
  id?: number;
  name: string;
  energeticValue: number;
  quantity: number;
}

const API_BASE_URL = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class MaterialCatalogApiService {
  private readonly http = inject(HttpClient);

  getMaterials(): Observable<ConfiguredMaterial[]> {
    return this.http
      .get<MaterialResponse[]>(`${API_BASE_URL}/materials`)
      .pipe(map((materials) => materials.map((material, index) => this.toConfiguredMaterial(material, index))));
  }

  createMaterial(material: ConfiguredMaterial): Observable<ConfiguredMaterial> {
    const request: SaveMaterialRequest = {
      id: material.backendId,
      name: material.name.trim(),
      energeticValue: Number(material.factor.toFixed(2)),
      // The frontend manages quantities per calculation row, not in the catalog.
      quantity: 0,
    };

    return this.http
      .post<MaterialResponse[]>(`${API_BASE_URL}/materials`, [request])
      .pipe(
        map((materials) => {
          const createdMaterial = materials[0];

          if (!createdMaterial) {
            throw new Error('Aucun materiau n a ete retourne par le backend.');
          }

          return this.toConfiguredMaterial(createdMaterial, 0);
        }),
      );
  }

  private toConfiguredMaterial(material: MaterialResponse, index: number): ConfiguredMaterial {
    const trimmedName = material.name.trim();
    const materialId = Number.isFinite(material.id) ? `material-${material.id}` : `material-${index + 1}`;

    return {
      id: materialId,
      backendId: Number.isFinite(material.id) ? material.id : undefined,
      name: trimmedName,
      factor: Number(material.energeticValue.toFixed(2)),
    };
  }
}
