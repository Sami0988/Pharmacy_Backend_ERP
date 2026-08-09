import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ItemsModule } from '../items/items.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { CustomersModule } from '../customers/customers.module';
import { DatabaseModule } from '../../db/database.module';

@Module({
  imports: [ItemsModule, SuppliersModule, CustomersModule, DatabaseModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
