export class NotificationResponseDto {
  id: string;
  type: string;
  title: string;
  message: string;
  itemId: string | null;
  batchId: string | null;
  thresholdDays: number | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export class NotificationSummaryDto {
  zeroStock: number;
  lowStock: number;
  nearExpiry: number;
  expired: number;
}

export class UnreadCountDto {
  unreadCount: number;
}
