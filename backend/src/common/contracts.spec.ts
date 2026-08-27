import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ALL_PERMISSIONS,
  DOSSIER_WORKFLOWS,
  DossierStatus,
  DossierType,
  Permission,
} from '@auto-import/contracts';
import { UpdateStatusDto } from '../dossiers/dto/update-status.dto';
import { UpdateOrderStatusDto } from '../orders/dto/update-status.dto';
import { paginate } from './helpers/pagination.helper';

describe('canonical domain contracts', () => {
  it('defines exactly the three supported dossier types', () => {
    expect(Object.values(DossierType)).toEqual([
      'VEHICLE_SALE_CIF',
      'VEHICLE_SALE_DDP',
      'SHIPPING_ONLY',
    ]);
    expect(Object.keys(DOSSIER_WORKFLOWS)).toEqual(Object.values(DossierType));
  });

  it('uses canonical English dossier workflow values', () => {
    const statuses = Object.values(DossierStatus);
    expect(new Set(statuses).size).toBe(statuses.length);
    expect(statuses).toContain('offerSelected');
    expect(statuses).not.toContain('offre_selectionnee');
  });

  it('keeps permission constants unique and in resource:action format', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toEqual(Object.values(Permission));
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z][A-Za-z]*:[a-z][A-Za-z]*$/);
    }
  });

  it('returns standardized pagination metadata', () => {
    expect(paginate(['item'], 21, 2, 10)).toEqual({
      items: ['item'],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });

  it('rejects non-canonical dossier and order enum values', async () => {
    const dossierErrors = await validate(
      plainToInstance(UpdateStatusDto, { status: 'offre_selectionnee' }),
    );
    const orderErrors = await validate(
      plainToInstance(UpdateOrderStatusDto, { status: 'confirmee' }),
    );

    expect(dossierErrors[0]?.constraints?.isEnum).toBeDefined();
    expect(orderErrors[0]?.constraints?.isEnum).toBeDefined();
  });
});
