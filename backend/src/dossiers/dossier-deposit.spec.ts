import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { DossierType } from '@auto-import/contracts';
import { DossiersService } from './dossiers.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { ExchangeRatesService } from '../finance/exchange-rates.service';
import { FinanceProjectionService } from '../finance/finance-projection.service';
import { DepositTransitionDataDto } from './dto/update-status.dto';

const officeId = '11111111-1111-4111-8111-111111111111';
const deposit = { amount: 120, currency: 'DZD', officeId, paymentMethod: 'CASH', receivedAt: '2026-09-11' };
describe('Dossier deposit currency and office', () => {
  it.each(['USD', 'CNY', 'DZD'])('accepts %s in the transition DTO', async (currency) => {
    expect(await validate(plainToInstance(DepositTransitionDataDto, { ...deposit, currency }))).toEqual([]);
  });
  it('rejects an unsupported currency and invalid office ID', async () => {
    const errors = await validate(plainToInstance(DepositTransitionDataDto, { ...deposit, currency: 'EUR', officeId: 'invalid' }));
    expect(errors.map((error) => error.property).sort()).toEqual(['currency', 'officeId']);
  });
  function setup(validOffice = true) {
    const dossier = { id: 'dossier', reference: 'D', organizationId: 'org', clientId: 'client', type: DossierType.VEHICLE_SALE_CIF as DossierType,
      workflowVersion: 2, status: 'contractSigned', dossierVehicles: [], payments: [], invoices: [], customerDeposits: [] as any[] };
    const tx: any = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue(dossier),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ data }) => Object.assign(dossier, { status: data.status })),
      },
      shipment: { findFirst: jest.fn().mockResolvedValue(null) },
      office: { findFirst: jest.fn().mockResolvedValue(validOffice ? { id: officeId } : null) },
      exchangeRate: { findFirst: jest.fn().mockResolvedValue({ id: 'rate', rate: new Prisma.Decimal(35) }) },
      payment: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'payment', ...data })) },
      customerDeposit: { create: jest.fn().mockImplementation(({ data }) => {
        const record = { id: 'deposit', ...data, office: { id: officeId, name: 'Persisted office' } };
        dossier.customerDeposits.push(record); return record;
      }) },
      financeTransaction: { upsert: jest.fn().mockImplementation(({ create }) => create) },
      dossierStatusHistory: { create: jest.fn().mockResolvedValue({ id: 'history' }) },
    };
    tx.$transaction = jest.fn((callback) => callback(tx));
    const sync: any = { assertTransitionAllowed: jest.fn(), syncForTransition: jest.fn() };
    const service = new DossiersService(tx, new DossierWorkflowService(), sync, { markEvidenceRelied: jest.fn() } as any, undefined, undefined,
      new FinanceProjectionService(tx), new ExchangeRatesService(tx));
    return { service, tx, dossier };
  }
  it.each(['USD', 'CNY', 'DZD'])('persists the selected office and %s payment with a DZD snapshot', async (currency) => {
    const { service, tx } = setup();
    await service.updateStatus('dossier', { status: 'depositReceived', deposit: { ...deposit, currency } }, 'actor', 'org');
    expect(tx.office.findFirst).toHaveBeenCalledWith({ where: { id: officeId, organizationId: 'org', status: 'active' }, select: { id: true } });
    expect(tx.customerDeposit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentId: 'payment', officeId, currency }) });
    const ledger = tx.financeTransaction.upsert.mock.calls[0][0].create;
    expect(ledger.exchangeRateSnapshot.toString()).toBe(currency === 'DZD' ? '1' : '35');
    expect(ledger.amountDzd.toString()).toBe(currency === 'DZD' ? '120' : '4200');
    if (currency === 'DZD') expect(tx.exchangeRate.findFirst).not.toHaveBeenCalled();
    const reopened = await service.findOne('dossier', 'org');
    expect(reopened.sections.finance.deposits[0].officeId).toBe(officeId);
    expect(reopened.sections.finance.deposits[0].office?.name).toBe('Persisted office');
    expect(tx.dossier.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ include: expect.objectContaining({ customerDeposits: { include: { office: true } } }) }));
  });
  it('rejects an office outside the organization or inactive before creating payment', async () => {
    const { service, tx } = setup(false);
    await expect(service.updateStatus('dossier', { status: 'depositReceived', deposit }, 'actor', 'org')).rejects.toThrow('Bureau');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
  it.each([DossierType.VEHICLE_SALE_CIF, DossierType.VEHICLE_SALE_DDP])('uses actual shipment relations in %s detail and transitions', async (type) => {
    const { service, tx, dossier } = setup();
    dossier.type = type;
    dossier.status = 'supplierPaid';
    let record = await service.findOne('dossier', 'org');
    expect(record.hasShipment).toBe(false);
    expect(record.workflowSteps).not.toContain('shipmentBooking');
    expect((await service.getAllowedTransitions('dossier', 'org')).allowedTransitions).toContain('loading');
    tx.shipment.findFirst.mockResolvedValue({ id: 'shipment' });
    record = await service.findOne('dossier', 'org');
    expect(record.hasShipment).toBe(true);
    expect(record.workflowSteps).toContain('shipmentBooking');
    expect((await service.getAllowedTransitions('dossier', 'org')).allowedTransitions).toContain('shipmentBooking');
    expect(tx.shipment.findFirst).toHaveBeenCalledWith({ where: { organizationId: 'org', OR: [
      { vehicles: { some: { vehicle: { dossierVehicles: { some: { dossierId: 'dossier' } } } } } },
      { customsFiles: { some: { dossierId: 'dossier' } } },
    ] }, select: { id: true } });
  });
});
