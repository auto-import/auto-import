import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { financialVisibility } from './financial-visibility';
const user = (permissions: AuthenticatedUser['permissions']) =>
  ({ permissions }) as AuthenticatedUser;
describe('Financial data in operational responses', () => {
  const value = {
    id: 'dossier',
    cifPrice: 3000000,
    nested: {
      purchasePrice: 20000,
      vehicleAmount: 20000,
      costs: [{ amount: 1000 }],
      estimatedProfitDzd: 600000,
      grossMargin: 500000,
      totalPayments: 900000,
      payments: [{ amount: 900000 }],
    },
  };
  it('keeps commercial prices and collections for sales while removing supplier costs and margins recursively', () => {
    expect(
      financialVisibility(value, user([Permission.PAYMENTS_READ])),
    ).toEqual({
      id: 'dossier',
      cifPrice: 3000000,
      nested: { totalPayments: 900000, payments: [{ amount: 900000 }] },
    });
  });
  it('keeps authorized purchasing costs for China and removes collections and margin', () => {
    expect(
      financialVisibility(value, user([Permission.PURCHASES_READ])),
    ).toEqual({
      id: 'dossier',
      cifPrice: 3000000,
      nested: { purchasePrice: 20000, vehicleAmount: 20000, costs: [{ amount: 1000 }] },
    });
  });
  it('retains the full record for Finance', () =>
    expect(financialVisibility(value, user([Permission.FINANCE_READ]))).toBe(
      value,
    ));
});
