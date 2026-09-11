import { ConflictException } from '@nestjs/common';
import { DossierStatus as S, DossierType } from '@auto-import/contracts';
import { DossierWorkflowService } from './dossier-workflow.service';

const workflow = new DossierWorkflowService();
describe.each([DossierType.VEHICLE_SALE_CIF, DossierType.VEHICLE_SALE_DDP])('%s progression', (type) => {
  it.each([true, false])('keeps inspection before purchase and supplier payment (shipment=%s)', (hasShipment) => {
    expect(workflow.getWorkflowSteps(type, 2, hasShipment).slice(0, 8)).toEqual([
      S.OFFER_SELECTED, S.CLIENT_CONFIRMED, S.CONTRACT_SIGNED, S.DEPOSIT_RECEIVED,
      S.VEHICLE_BOOKING, S.INSPECTION, S.PURCHASE_CONFIRMED, S.SUPPLIER_PAID,
    ]);
    expect(workflow.getNextStatus(type, S.PURCHASE_CONFIRMED, 2, hasShipment)).toBe(S.SUPPLIER_PAID);
    expect(workflow.getNextStatus(type, S.DEPOSIT_RECEIVED, 2, hasShipment)).toBe(S.VEHICLE_BOOKING);
    expect(workflow.getNextStatus(type, S.VEHICLE_BOOKING, 2, hasShipment)).toBe(S.INSPECTION);
    expect(workflow.getNextStatus(type, S.INSPECTION, 2, hasShipment)).toBe(S.PURCHASE_CONFIRMED);
    for (const [from, to] of [
      [S.DEPOSIT_RECEIVED, S.VEHICLE_BOOKING], [S.VEHICLE_BOOKING, S.INSPECTION],
      [S.INSPECTION, S.PURCHASE_CONFIRMED], [S.PURCHASE_CONFIRMED, S.SUPPLIER_PAID],
    ]) {
      expect(() => workflow.validateTransition(type, from, to, 2, hasShipment)).not.toThrow();
    }
    expect(() => workflow.validateTransition(type, S.PURCHASE_CONFIRMED, S.INSPECTION, 2, hasShipment)).toThrow(ConflictException);
    expect(() => workflow.validateTransition(type, S.VEHICLE_BOOKING, S.PURCHASE_CONFIRMED, 2, hasShipment)).toThrow(ConflictException);
  });
  it.each([1, 2])('requires shipment booking only with a real shipment (v%s)', (version) => {
    const booking = version === 1 ? S.BOOKING : S.SHIPMENT_BOOKING;
    expect(workflow.getNextStatus(type, S.INSPECTION, version, true)).toBe(S.PURCHASE_CONFIRMED);
    expect(workflow.getNextStatus(type, S.PURCHASE_CONFIRMED, version, true)).toBe(S.SUPPLIER_PAID);
    expect(workflow.getWorkflowSteps(type, version, true)).toContain(booking);
    expect(workflow.getWorkflowSteps(type, version, false)).not.toContain(booking);
    expect(workflow.getNextStatus(type, S.SUPPLIER_PAID, version, true)).toBe(booking);
    expect(workflow.getNextStatus(type, S.SUPPLIER_PAID, version, false)).toBe(S.LOADING);
    expect(() => workflow.validateTransition(type, S.SUPPLIER_PAID, booking, version, false)).toThrow(ConflictException);
    expect(() => workflow.validateTransition(type, S.SUPPLIER_PAID, S.LOADING, version, false)).not.toThrow();
    expect(workflow.getNextStatus(type, booking, version, false)).toBe(S.LOADING);
  });
});
it('preserves the shipping-only workflow', () => {
  expect(workflow.getWorkflowSteps(DossierType.SHIPPING_ONLY, 2, false))
    .toEqual(workflow.getWorkflowSteps(DossierType.SHIPPING_ONLY, 2, true));
});
