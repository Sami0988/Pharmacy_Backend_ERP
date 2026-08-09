export class SaleCreatedEvent {
  constructor(
    public readonly saleId: string,
    public readonly branchId: string,
    public readonly totalAmount: number,
    public readonly soldBy: string,
  ) {}
}

export class PaymentRecordedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly supplierId: string,
    public readonly grnId: string,
    public readonly amountPaid: number,
  ) {}
}

export class TransferCompletedEvent {
  constructor(
    public readonly transferId: string,
    public readonly batchId: string,
    public readonly fromLocationId: string,
    public readonly toLocationId: string,
    public readonly quantity: number,
  ) {}
}

export class StockZeroEvent {
  constructor(
    public readonly itemId: string,
    public readonly locationId: string,
    public readonly itemName: string,
  ) {}
}

export class StockLowEvent {
  constructor(
    public readonly itemId: string,
    public readonly locationId: string,
    public readonly itemName: string,
    public readonly currentQuantity: number,
    public readonly reorderLevel: number,
  ) {}
}

export class BatchExpiredEvent {
  constructor(
    public readonly batchId: string,
    public readonly itemId: string,
    public readonly batchNo: string,
    public readonly itemName: string,
  ) {}
}
