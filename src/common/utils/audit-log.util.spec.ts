import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogUtil } from './audit-log.util';
import { DatabaseService } from '../../db/database.service';

describe('AuditLogUtil', () => {
  let util: AuditLogUtil;
  let databaseService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    databaseService = {
      db: {
        insert: jest
          .fn()
          .mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogUtil,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    util = module.get<AuditLogUtil>(AuditLogUtil);
  });

  it('should write audit log entry', async () => {
    await util.log({
      userId: 'user-1',
      action: 'LOGIN',
      entityType: 'session',
      entityId: 'session-1',
    });
    expect(databaseService.db.insert).toHaveBeenCalled();
  });

  it('should not throw on database error', async () => {
    (databaseService.db.insert as any).mockReturnValue({
      values: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    await expect(
      util.log({ userId: 'u', action: 'A', entityType: 'e', entityId: 'i' }),
    ).resolves.not.toThrow();
  });
});
