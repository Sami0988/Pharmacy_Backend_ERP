export class ReportQueryDto {
  startDate?: string;
  endDate?: string;
  format?: 'json' | 'csv' | 'pdf';
}
