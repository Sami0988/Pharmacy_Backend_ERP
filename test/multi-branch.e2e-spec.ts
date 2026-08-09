import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import { branches, locations, users, items, batches, stockMovements, sales, saleItems } from '../src/db';
import { eq } from 'drizzle-orm';

describe('Multi-Branch Isolation (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let authToken: string;

  // Test data
  let branch1Id: string;
  let branch2Id: string;
  let location1Id: string;
  let location2Id: string;
  let itemId: string;
  let batchId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    databaseService = moduleFixture.get(DatabaseService);
    await app.init();

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@pharmacy.local',
        password: 'admin123',
      });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await app.close();
  });

  async function cleanupTestData() {
    // Delete test data in reverse order of dependencies
    if (batchId) {
      await databaseService.db.delete(stockMovements).where(eq(stockMovements.batchId, batchId));
      await databaseService.db.delete(batches).where(eq(batches.id, batchId));
    }
    if (itemId) {
      await databaseService.db.delete(items).where(eq(items.id, itemId));
    }
    if (location1Id) {
      await databaseService.db.delete(locations).where(eq(locations.id, location1Id));
    }
    if (location2Id) {
      await databaseService.db.delete(locations).where(eq(locations.id, location2Id));
    }
    if (branch1Id) {
      await databaseService.db.delete(branches).where(eq(branches.id, branch1Id));
    }
    if (branch2Id) {
      await databaseService.db.delete(branches).where(eq(branches.id, branch2Id));
    }
  }

  describe('Branch Creation and Isolation', () => {
    it('should create two separate branches', async () => {
      // Create Branch 1
      const branch1Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Branch 1',
          address: '123 Test Street',
        });

      expect(branch1Response.status).toBe(201);
      branch1Id = branch1Response.body.id;

      // Create Branch 2
      const branch2Response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Branch 2',
          address: '456 Test Avenue',
        });

      expect(branch2Response.status).toBe(201);
      branch2Id = branch2Response.body.id;

      // Verify branches are different
      expect(branch1Id).not.toBe(branch2Id);
    });

    it('should create locations for each branch', async () => {
      // Create Store location for Branch 1
      const location1Response = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId: branch1Id,
          name: 'Store',
        });

      expect(location1Response.status).toBe(201);
      location1Id = location1Response.body.id;

      // Create Store location for Branch 2
      const location2Response = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId: branch2Id,
          name: 'Store',
        });

      expect(location2Response.status).toBe(201);
      location2Id = location2Response.body.id;

      // Verify locations are different
      expect(location1Id).not.toBe(location2Id);
    });
  });

  describe('Stock Isolation', () => {
    it('should create an item with stock in Branch 1 only', async () => {
      // Create item
      const itemResponse = await request(app.getHttpServer())
        .post('/api/v1/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Item for Branch Isolation',
          genericName: 'test-generic',
          unit: 'pcs',
          sellingPrice: 10.00,
          reorderLevel: 5,
        });

      expect(itemResponse.status).toBe(201);
      itemId = itemResponse.body.id;

      // Create batch for Branch 1
      const batchResponse = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemId,
          batchNo: 'BATCH-TEST-001',
          expiryDate: '2027-12-31',
          unitCost: 5.00,
          quantityReceived: 100,
        });

      expect(batchResponse.status).toBe(201);
      batchId = batchResponse.body.id;

      // Record stock movement for Branch 1
      const stockResponse = await request(app.getHttpServer())
        .post('/api/v1/stock-movements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          batchId,
          locationId: location1Id,
          type: 'receipt',
          quantity: 100,
        });

      expect(stockResponse.status).toBe(201);

      // Check stock in Branch 1
      const branch1StockResponse = await request(app.getHttpServer())
        .get(`/api/v1/stock-movements/batch/${batchId}/location/${location1Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch1StockResponse.status).toBe(200);
      expect(branch1StockResponse.body.quantity).toBe(100);

      // Check stock in Branch 2 (should be 0)
      const branch2StockResponse = await request(app.getHttpServer())
        .get(`/api/v1/stock-movements/batch/${batchId}/location/${location2Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch2StockResponse.status).toBe(200);
      expect(branch2StockResponse.body.quantity).toBe(0);
    });
  });

  describe('Sales Isolation', () => {
    it('should create a sale in Branch 1 that does not appear in Branch 2 reports', async () => {
      // Create a sale in Branch 1
      const saleResponse = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          branchId: branch1Id,
          paymentMethod: 'cash',
          items: [
            {
              itemId,
              batchId,
              quantity: 10,
              unitPrice: 10.00,
            },
          ],
        });

      expect(saleResponse.status).toBe(201);
      const saleId = saleResponse.body.id;

      // Get Branch 1 sales report
      const branch1SalesResponse = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?branchId=${branch1Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch1SalesResponse.status).toBe(200);
      // Verify the sale appears in Branch 1 report
      const branch1Sales = branch1SalesResponse.body.data || [];
      expect(branch1Sales.some((s: { id: string }) => s.id === saleId)).toBe(true);

      // Get Branch 2 sales report
      const branch2SalesResponse = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?branchId=${branch2Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch2SalesResponse.status).toBe(200);
      // Verify the sale does NOT appear in Branch 2 report
      const branch2Sales = branch2SalesResponse.body.data || [];
      expect(branch2Sales.some((s: { id: string }) => s.id === saleId)).toBe(false);
    });
  });

  describe('Reports Isolation', () => {
    it('should show different stock reports for each branch', async () => {
      // Get Branch 1 stock report
      const branch1StockReport = await request(app.getHttpServer())
        .get(`/api/v1/reports/stock?branchId=${branch1Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch1StockReport.status).toBe(200);

      // Get Branch 2 stock report
      const branch2StockReport = await request(app.getHttpServer())
        .get(`/api/v1/reports/stock?branchId=${branch2Id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(branch2StockReport.status).toBe(200);

      // Verify reports are different (Branch 1 has stock, Branch 2 doesn't)
      const branch1Data = branch1StockReport.body.data || [];
      const branch2Data = branch2StockReport.body.data || [];

      // Branch 1 should have the test item
      expect(branch1Data.some((item: { itemId: string }) => item.itemId === itemId)).toBe(true);

      // Branch 2 should not have the test item (or have 0 quantity)
      const branch2Item = branch2Data.find((item: { itemId: string }) => item.itemId === itemId);
      if (branch2Item) {
        expect(branch2Item.quantity).toBe(0);
      }
    });
  });
});
