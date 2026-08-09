import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './index';
import * as bcrypt from 'bcrypt';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:devpassword@localhost:5433/pharmacy_erp';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // ─── Clear existing data ───────────────────────────────────────
  console.log('Clearing existing data...\n');
  await pool.query('TRUNCATE TABLE audit_log, notifications, sale_returns, sale_items, sales, supplier_payments, goods_receipts, stock_movements, transfers, batches, items, customers, suppliers, refresh_tokens, password_reset_tokens, users, locations, branches CASCADE');
  console.log('  All tables cleared\n');

  console.log('Seeding database...\n');

  // ─── 1. Branch ─────────────────────────────────────────────────
  const [branch] = await db
    .insert(schema.branches)
    .values({ name: 'Main Branch', address: 'Bole Road, Addis Ababa' })
    .returning();
  console.log(`  Created branch: ${branch.name}`);

  // ─── 2. Locations ──────────────────────────────────────────────
  const [store] = await db.insert(schema.locations).values({ branchId: branch.id, name: 'Store' }).returning();
  const [dispatcher] = await db.insert(schema.locations).values({ branchId: branch.id, name: 'Dispatcher' }).returning();
  console.log('  Created 2 locations (Store + Dispatcher)');

  // ─── 3. Users ──────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const [admin] = await db
    .insert(schema.users)
    .values({ name: 'Admin User', email: 'admin@pharmacy.local', passwordHash: hashedPassword, role: 'admin', branchId: branch.id })
    .returning();
  const [keeper] = await db
    .insert(schema.users)
    .values({ name: 'Abebe Kebede', email: 'abebe@pharmacy.local', passwordHash: hashedPassword, role: 'store_keeper', branchId: branch.id })
    .returning();
  const [cashier] = await db
    .insert(schema.users)
    .values({ name: 'Hana Tesfaye', email: 'hana@pharmacy.local', passwordHash: hashedPassword, role: 'cashier', branchId: branch.id })
    .returning();
  console.log('  Created users: admin, store_keeper, cashier');

  // ─── 4. Items (20 Ethiopian pharmacy items) ────────────────────
  const itemsData = [
    { name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'Analgesic', unit: 'tablet', strength: '500mg', reorderLevel: 200, isControlledSubstance: false },
    { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Antibiotic', unit: 'capsule', strength: '500mg', reorderLevel: 100, isControlledSubstance: false },
    { name: 'Metformin 500mg', genericName: 'Metformin', category: 'Antidiabetic', unit: 'tablet', strength: '500mg', reorderLevel: 150, isControlledSubstance: false },
    { name: 'Amlodipine 5mg', genericName: 'Amlodipine', category: 'Antihypertensive', unit: 'tablet', strength: '5mg', reorderLevel: 100, isControlledSubstance: false },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Gastrointestinal', unit: 'capsule', strength: '20mg', reorderLevel: 80, isControlledSubstance: false },
    { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin', category: 'Antibiotic', unit: 'tablet', strength: '500mg', reorderLevel: 80, isControlledSubstance: false },
    { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'Anti-inflammatory', unit: 'tablet', strength: '400mg', reorderLevel: 200, isControlledSubstance: false },
    { name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'Antihistamine', unit: 'tablet', strength: '10mg', reorderLevel: 100, isControlledSubstance: false },
    { name: 'Azithromycin 250mg', genericName: 'Azithromycin', category: 'Antibiotic', unit: 'tablet', strength: '250mg', reorderLevel: 60, isControlledSubstance: false },
    { name: 'Artemether-Lumefantrine', genericName: 'ACT', category: 'Antimalarial', unit: 'tablet', strength: '20/120mg', reorderLevel: 50, isControlledSubstance: false },
    { name: 'Metronidazole 400mg', genericName: 'Metronidazole', category: 'Antibiotic', unit: 'tablet', strength: '400mg', reorderLevel: 100, isControlledSubstance: false },
    { name: 'Salbutamol Inhaler', genericName: 'Salbutamol', category: 'Bronchodilator', unit: 'inhaler', strength: '100mcg', reorderLevel: 20, isControlledSubstance: false },
    { name: 'Dexamethasone 4mg', genericName: 'Dexamethasone', category: 'Corticosteroid', unit: 'tablet', strength: '4mg', reorderLevel: 50, isControlledSubstance: false },
    { name: 'Tramadol 50mg', genericName: 'Tramadol', category: 'Analgesic', unit: 'tablet', strength: '50mg', reorderLevel: 30, isControlledSubstance: true },
    { name: 'Diazepam 5mg', genericName: 'Diazepam', category: 'Anxiolytic', unit: 'tablet', strength: '5mg', reorderLevel: 25, isControlledSubstance: true },
    { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'Gastrointestinal', unit: 'tablet', strength: '40mg', reorderLevel: 60, isControlledSubstance: false },
    { name: 'Losartan 50mg', genericName: 'Losartan', category: 'Antihypertensive', unit: 'tablet', strength: '50mg', reorderLevel: 80, isControlledSubstance: false },
    { name: 'Cephalexin 500mg', genericName: 'Cephalexin', category: 'Antibiotic', unit: 'capsule', strength: '500mg', reorderLevel: 60, isControlledSubstance: false },
    { name: 'ORS Sachet', genericName: 'Oral Rehydration Salts', category: 'Electrolyte', unit: 'sachet', strength: '1L', reorderLevel: 500, isControlledSubstance: false },
    { name: 'Vitamin C 500mg', genericName: 'Ascorbic Acid', category: 'Supplement', unit: 'tablet', strength: '500mg', reorderLevel: 200, isControlledSubstance: false },
  ];

  const createdItems: any[] = [];
  for (const item of itemsData) {
    const [created] = await db.insert(schema.items).values(item).returning();
    createdItems.push(created);
  }
  console.log(`  Created ${createdItems.length} items`);

  // ─── 5. Customers (10) ─────────────────────────────────────────
  const customersData = [
    { name: 'Ato Bekele Abate', phone: '+251-911-234567' },
    { name: 'W/ro Hiwot Girma', phone: '+251-912-345678' },
    { name: 'Ato Tamrat Wolde', phone: '+251-913-456789' },
    { name: 'W/ro Bethlehem CSA', phone: '+251-914-567890' },
    { name: 'Ato Yonas Mekonnen', phone: '+251-911-678901' },
    { name: 'W/ro Kidist Alemayehu', phone: '+251-912-789012' },
    { name: 'Ato Girma Tesfaye', phone: '+251-913-890123' },
    { name: 'W/ro Meskerem Assefa', phone: '+251-914-901234' },
    { name: 'Ato Daniel Solomon', phone: '+251-911-012345' },
    { name: 'W/ro Rahel Getachew', phone: '+251-912-123456' },
  ];

  const createdCustomers: any[] = [];
  for (const c of customersData) {
    const [created] = await db.insert(schema.customers).values(c).returning();
    createdCustomers.push(created);
  }
  console.log(`  Created ${createdCustomers.length} customers`);

  // ─── 6. Suppliers (4) ──────────────────────────────────────────
  const suppliersData = [
    { name: 'Ethiopian Pharmaceutical Supply Agency (EPSA)', phone: '+251-11-1234567', address: 'Bole, Addis Ababa', licenseNo: 'EPSA-001' },
    { name: 'Cadila Pharmaceuticals Ethiopia', phone: '+251-11-2345678', address: 'Akaki, Addis Ababa', licenseNo: 'CPE-002' },
    { name: 'Sun Pharma Ethiopia', phone: '+251-11-3456789', address: 'Industrial Area, Addis Ababa', licenseNo: 'SPE-003' },
    { name: 'Habtaw Pharmaceuticals', phone: '+251-11-5678901', address: 'Adama, Oromia', licenseNo: 'HPH-005' },
  ];

  const createdSuppliers: any[] = [];
  for (const s of suppliersData) {
    const [created] = await db.insert(schema.suppliers).values(s).returning();
    createdSuppliers.push(created);
  }
  console.log(`  Created ${createdSuppliers.length} suppliers`);

  // ─── 7. Goods Receipts (6 GRNs) ───────────────────────────────
  const grn1 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[0].id, branchId: branch.id,
    grnNumber: 'GRN-2026-001', receiptDate: '2026-01-15', totalCost: '25000.00', paymentDueDate: '2026-02-15', createdBy: keeper.id,
  }).returning();
  const grn2 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[1].id, branchId: branch.id,
    grnNumber: 'GRN-2026-002', receiptDate: '2026-02-20', totalCost: '18500.00', paymentDueDate: '2026-03-20', createdBy: keeper.id,
  }).returning();
  const grn3 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[2].id, branchId: branch.id,
    grnNumber: 'GRN-2026-003', receiptDate: '2026-03-10', totalCost: '32000.00', paymentDueDate: '2026-04-10', createdBy: keeper.id,
  }).returning();
  const grn4 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[3].id, branchId: branch.id,
    grnNumber: 'GRN-2026-004', receiptDate: '2026-04-05', totalCost: '15000.00', paymentDueDate: '2026-05-05', createdBy: keeper.id,
  }).returning();
  const grn5 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[0].id, branchId: branch.id,
    grnNumber: 'GRN-2026-005', receiptDate: '2026-06-01', totalCost: '22000.00', paymentDueDate: '2026-07-01', createdBy: keeper.id,
  }).returning();
  const grn6 = await db.insert(schema.goodsReceipts).values({
    supplierId: createdSuppliers[1].id, branchId: branch.id,
    grnNumber: 'GRN-2026-006', receiptDate: '2026-08-01', totalCost: '31000.00', paymentDueDate: '2026-09-01', createdBy: keeper.id,
  }).returning();
  console.log('  Created 6 goods receipts');

  const allGrns = [grn1, grn2, grn3, grn4, grn5, grn6].flat();

  // ─── 8. Batches (22 batches with varied expiry dates) ──────────
  const batchesData = [
    // Paracetamol - multiple batches
    { itemId: createdItems[0].id, grnId: grn1[0].id, batchNo: 'BAT-PAR-001', expiryDate: '2028-01-31', unitCost: '12.00', sellingPrice: '18.00', quantityReceived: 500 },
    { itemId: createdItems[0].id, grnId: grn5[0].id, batchNo: 'BAT-PAR-002', expiryDate: '2027-06-30', unitCost: '13.50', sellingPrice: '20.00', quantityReceived: 300 },
    { itemId: createdItems[0].id, grnId: grn6[0].id, batchNo: 'BAT-PAR-003', expiryDate: '2026-09-30', unitCost: '11.00', sellingPrice: '16.00', quantityReceived: 100 },
    // Amoxicillin
    { itemId: createdItems[1].id, grnId: grn2[0].id, batchNo: 'BAT-AMX-001', expiryDate: '2027-08-15', unitCost: '22.00', sellingPrice: '35.00', quantityReceived: 200 },
    { itemId: createdItems[1].id, grnId: grn6[0].id, batchNo: 'BAT-AMX-002', expiryDate: '2026-12-31', unitCost: '24.00', sellingPrice: '38.00', quantityReceived: 150 },
    // Metformin
    { itemId: createdItems[2].id, grnId: grn3[0].id, batchNo: 'BAT-MET-001', expiryDate: '2027-10-01', unitCost: '18.00', sellingPrice: '28.00', quantityReceived: 400 },
    // Amlodipine
    { itemId: createdItems[3].id, grnId: grn1[0].id, batchNo: 'BAT-AML-001', expiryDate: '2028-03-15', unitCost: '20.00', sellingPrice: '32.00', quantityReceived: 250 },
    // Omeprazole
    { itemId: createdItems[4].id, grnId: grn4[0].id, batchNo: 'BAT-OME-001', expiryDate: '2027-05-20', unitCost: '28.00', sellingPrice: '45.00', quantityReceived: 180 },
    // Ciprofloxacin
    { itemId: createdItems[5].id, grnId: grn3[0].id, batchNo: 'BAT-CIP-001', expiryDate: '2027-09-30', unitCost: '30.00', sellingPrice: '48.00', quantityReceived: 200 },
    // Ibuprofen
    { itemId: createdItems[6].id, grnId: grn5[0].id, batchNo: 'BAT-IBU-001', expiryDate: '2028-02-28', unitCost: '10.00', sellingPrice: '15.00', quantityReceived: 600 },
    // Cetirizine
    { itemId: createdItems[7].id, grnId: grn2[0].id, batchNo: 'BAT-CET-001', expiryDate: '2027-07-01', unitCost: '15.00', sellingPrice: '24.00', quantityReceived: 300 },
    // Azithromycin
    { itemId: createdItems[8].id, grnId: grn5[0].id, batchNo: 'BAT-AZI-001', expiryDate: '2027-11-15', unitCost: '40.00', sellingPrice: '65.00', quantityReceived: 120 },
    // ACT (Artemether-Lumefantrine)
    { itemId: createdItems[9].id, grnId: grn6[0].id, batchNo: 'BAT-ACT-001', expiryDate: '2027-04-30', unitCost: '65.00', sellingPrice: '100.00', quantityReceived: 100 },
    // Metronidazole
    { itemId: createdItems[10].id, grnId: grn3[0].id, batchNo: 'BAT-METRO-001', expiryDate: '2028-01-15', unitCost: '12.00', sellingPrice: '19.00', quantityReceived: 350 },
    // Salbutamol
    { itemId: createdItems[11].id, grnId: grn4[0].id, batchNo: 'BAT-SAL-001', expiryDate: '2027-12-01', unitCost: '130.00', sellingPrice: '200.00', quantityReceived: 40 },
    // Dexamethasone
    { itemId: createdItems[12].id, grnId: grn1[0].id, batchNo: 'BAT-DEX-001', expiryDate: '2027-08-20', unitCost: '8.00', sellingPrice: '12.00', quantityReceived: 200 },
    // Tramadol (controlled)
    { itemId: createdItems[13].id, grnId: grn2[0].id, batchNo: 'BAT-TRA-001', expiryDate: '2027-06-15', unitCost: '18.00', sellingPrice: '28.00', quantityReceived: 80 },
    // Diazepam (controlled)
    { itemId: createdItems[14].id, grnId: grn6[0].id, batchNo: 'BAT-DIA-001', expiryDate: '2028-04-30', unitCost: '10.00', sellingPrice: '16.00', quantityReceived: 60 },
    // Pantoprazole
    { itemId: createdItems[15].id, grnId: grn5[0].id, batchNo: 'BAT-PAN-001', expiryDate: '2027-09-10', unitCost: '35.00', sellingPrice: '55.00', quantityReceived: 150 },
    // Losartan
    { itemId: createdItems[16].id, grnId: grn3[0].id, batchNo: 'BAT-LOS-001', expiryDate: '2028-05-20', unitCost: '25.00', sellingPrice: '40.00', quantityReceived: 200 },
    // Cephalexin
    { itemId: createdItems[17].id, grnId: grn4[0].id, batchNo: 'BAT-CEP-001', expiryDate: '2027-03-25', unitCost: '35.00', sellingPrice: '55.00', quantityReceived: 100 },
    // ORS Sachets
    { itemId: createdItems[18].id, grnId: grn1[0].id, batchNo: 'BAT-ORS-001', expiryDate: '2028-06-30', unitCost: '5.00', sellingPrice: '8.00', quantityReceived: 1000 },
    // Vitamin C
    { itemId: createdItems[19].id, grnId: grn4[0].id, batchNo: 'BAT-VTC-001', expiryDate: '2027-12-31', unitCost: '8.00', sellingPrice: '12.00', quantityReceived: 400 },
  ];

  const createdBatches: any[] = [];
  for (const b of batchesData) {
    const [created] = await db.insert(schema.batches).values(b).returning();
    createdBatches.push(created);
  }
  console.log(`  Created ${createdBatches.length} batches`);

  // ─── 9. Stock Movements (receipts into Store) ──────────────────
  const receiptMovements: any[] = [];
  for (const batch of createdBatches) {
    const [mov] = await db.insert(schema.stockMovements).values({
      batchId: batch.id, locationId: store.id, type: 'receipt',
      quantity: batch.quantityReceived, refId: batch.grnId, refType: 'goods_receipt', createdBy: keeper.id,
    }).returning();
    receiptMovements.push(mov);
  }
  console.log(`  Created ${receiptMovements.length} receipt stock movements`);

  // ─── 10. Transfers (Store -> Dispatcher) ────────────────────────
  const transferData = [
    { batchIdx: 0, quantity: 80 },    // Paracetamol batch 1
    { batchIdx: 1, quantity: 50 },    // Paracetamol batch 2
    { batchIdx: 3, quantity: 40 },    // Amoxicillin
    { batchIdx: 6, quantity: 30 },    // Amlodipine
    { batchIdx: 8, quantity: 100 },   // Ibuprofen
    { batchIdx: 10, quantity: 50 },   // Cetirizine
    { batchIdx: 11, quantity: 25 },   // Azithromycin
    { batchIdx: 13, quantity: 40 },   // Metronidazole
    { batchIdx: 16, quantity: 20 },   // Tramadol
    { batchIdx: 17, quantity: 15 },   // Diazepam
    { batchIdx: 20, quantity: 150 },  // ORS
  ];

  const createdTransfers: any[] = [];
  for (const t of transferData) {
    const batch = createdBatches[t.batchIdx];
    const [transfer] = await db.insert(schema.transfers).values({
      batchId: batch.id, quantity: t.quantity,
      fromLocationId: store.id, toLocationId: dispatcher.id, transferredBy: keeper.id,
    }).returning();
    createdTransfers.push(transfer);

    await db.insert(schema.stockMovements).values({
      batchId: batch.id, locationId: store.id, type: 'transfer_out',
      quantity: -t.quantity, refId: transfer.id, refType: 'transfer', createdBy: keeper.id,
    });
    await db.insert(schema.stockMovements).values({
      batchId: batch.id, locationId: dispatcher.id, type: 'transfer_in',
      quantity: t.quantity, refId: transfer.id, refType: 'transfer', createdBy: keeper.id,
    });
  }
  console.log(`  Created ${createdTransfers.length} transfers (+ ${createdTransfers.length * 2} stock movements)`);

  // ─── 11. Sales (8 sales) ──────────────────────────────────────
  const salesData = [
    {
      customerId: createdCustomers[0].id,
      totalAmount: '375.00', paymentMethod: 'cash',
      items: [
        { batchIdx: 0, quantity: 10, unitPrice: '25.00' },
        { batchIdx: 3, quantity: 5, unitPrice: '45.00' },
      ],
    },
    {
      customerId: createdCustomers[1].id,
      totalAmount: '540.00', paymentMethod: 'mobile_money',
      items: [
        { batchIdx: 5, quantity: 6, unitPrice: '60.00' },
        { batchIdx: 8, quantity: 3, unitPrice: '20.00' },
      ],
    },
    {
      customerId: createdCustomers[2].id,
      totalAmount: '200.00', paymentMethod: 'cash',
      items: [
        { batchIdx: 20, quantity: 20, unitPrice: '10.00' },
      ],
    },
    {
      customerId: createdCustomers[3].id,
      totalAmount: '690.00', paymentMethod: 'card',
      items: [
        { batchIdx: 5, quantity: 6, unitPrice: '55.00' },
        { batchIdx: 7, quantity: 10, unitPrice: '20.00' },
        { batchIdx: 10, quantity: 5, unitPrice: '30.00' },
      ],
    },
    {
      customerId: createdCustomers[4].id,
      totalAmount: '480.00', paymentMethod: 'mobile_money',
      items: [
        { batchIdx: 12, quantity: 2, unitPrice: '250.00' },
      ],
    },
    {
      customerId: createdCustomers[5].id,
      totalAmount: '600.00', paymentMethod: 'cash',
      items: [
        { batchIdx: 11, quantity: 5, unitPrice: '80.00' },
        { batchIdx: 14, quantity: 8, unitPrice: '120.00' },
      ],
    },
    {
      customerId: null,
      totalAmount: '150.00', paymentMethod: 'cash',
      items: [
        { batchIdx: 0, quantity: 6, unitPrice: '25.00' },
      ],
    },
    {
      customerId: createdCustomers[6].id,
      totalAmount: '350.00', paymentMethod: 'credit',
      items: [
        { batchIdx: 4, quantity: 5, unitPrice: '45.00' },
        { batchIdx: 13, quantity: 5, unitPrice: '25.00' },
      ],
    },
  ];

  const createdSales: any[] = [];
  for (const s of salesData) {
    const [sale] = await db.insert(schema.sales).values({
      branchId: branch.id, customerId: s.customerId, soldBy: cashier.id,
      totalAmount: s.totalAmount, paymentMethod: s.paymentMethod,
    }).returning();
    createdSales.push(sale);

    for (const item of s.items) {
      const batch = createdBatches[item.batchIdx];
      await db.insert(schema.saleItems).values({
        saleId: sale.id, batchId: batch.id,
        quantity: item.quantity, unitPrice: item.unitPrice,
      });

      await db.insert(schema.stockMovements).values({
        batchId: batch.id, locationId: dispatcher.id, type: 'sale',
        quantity: -item.quantity, refId: sale.id, refType: 'sale', createdBy: cashier.id,
      });
    }
  }
  console.log(`  Created ${createdSales.length} sales with line items`);

  // ─── 12. Supplier Payments (4) ─────────────────────────────────
  const paymentsData = [
    { supplierId: createdSuppliers[0].id, grnId: grn1[0].id, amountPaid: '15000.00', paymentDate: '2026-02-01', method: 'bank_transfer', notes: 'Partial payment GRN-001' },
    { supplierId: createdSuppliers[1].id, grnId: grn2[0].id, amountPaid: '18500.00', paymentDate: '2026-03-15', method: 'bank_transfer', notes: 'Full payment GRN-002' },
    { supplierId: createdSuppliers[2].id, grnId: grn3[0].id, amountPaid: '20000.00', paymentDate: '2026-04-05', method: 'cash', notes: 'Partial payment GRN-003' },
    { supplierId: createdSuppliers[3].id, grnId: grn4[0].id, amountPaid: '15000.00', paymentDate: '2026-05-01', method: 'bank_transfer', notes: 'Full payment GRN-004' },
  ];

  for (const p of paymentsData) {
    await db.insert(schema.supplierPayments).values(p);
  }
  console.log('  Created 4 supplier payments');

  // ─── 13. Notifications ──────────────────────────────────────────
  const notificationsData = [
    { type: 'low_stock' as const, title: 'Low Stock Alert', message: 'Tramadol 50mg is below reorder level (20 units remaining)', itemId: createdItems[13].id },
    { type: 'low_stock' as const, title: 'Low Stock Alert', message: 'Diazepam 5mg is below reorder level (15 units remaining)', itemId: createdItems[14].id },
    { type: 'low_stock' as const, title: 'Low Stock Alert', message: 'Salbutamol Inhaler is below reorder level (10 units remaining)', itemId: createdItems[11].id },
    { type: 'near_expiry' as const, title: 'Near Expiry Warning', message: 'Batch BAT-PAR-003 expires in 53 days (Paracetamol 500mg)', batchId: createdBatches[2].id, thresholdDays: 90 },
    { type: 'near_expiry' as const, title: 'Near Expiry Warning', message: 'Batch BAT-AMX-002 expires in 144 days (Amoxicillin 500mg)', batchId: createdBatches[4].id, thresholdDays: 180 },
    { type: 'near_expiry' as const, title: 'Near Expiry Warning', message: 'Batch BAT-CEP-001 expires in 215 days (Cephalexin 500mg)', batchId: createdBatches[20].id, thresholdDays: 180 },
    { type: 'zero_stock' as const, title: 'Zero Stock at Dispatcher', message: 'Cetirizine 10mg has zero stock at Dispatcher location', itemId: createdItems[7].id },
    { type: 'low_stock' as const, title: 'Low Stock Alert', message: 'Azithromycin 250mg is below reorder level at Dispatcher', itemId: createdItems[8].id },
  ];

  for (const n of notificationsData) {
    await db.insert(schema.notifications).values(n);
  }
  console.log('  Created 8 notifications');

  // ─── Done ──────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  Seed completed successfully!');
  console.log('========================================');
  console.log('\nDev credentials:');
  console.log('  Email:    admin@pharmacy.local');
  console.log('  Password: admin123');
  console.log('\nAll users share the same password: admin123');
  console.log(`\nSummary:`);
  console.log(`  Branch:        1 (Main Branch)`);
  console.log(`  Locations:     2 (Store + Dispatcher)`);
  console.log(`  Users:         3 (admin, store_keeper, cashier)`);
  console.log(`  Items:         ${createdItems.length}`);
  console.log(`  Customers:     ${createdCustomers.length}`);
  console.log(`  Suppliers:     ${createdSuppliers.length}`);
  console.log(`  GRNs:          6`);
  console.log(`  Batches:       ${createdBatches.length}`);
  console.log(`  Transfers:     ${createdTransfers.length}`);
  console.log(`  Sales:         ${createdSales.length}`);
  console.log(`  Payments:      4`);
  console.log(`  Notifications: 8`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
