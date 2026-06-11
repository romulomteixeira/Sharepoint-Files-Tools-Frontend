import { get } from './client';

export type AnalyticsWindow = 'day' | 'week' | 'month' | 'year';
export type AnalyticsDateField = 'modified' | 'created';

export interface TopCostItem {
  scanId?: string;
  siteId: string;
  siteName?: string;
  siteUrl?: string;
  driveId: string;
  driveName?: string;
  itemId: string;
  name: string;
  extension?: string;
  fullPath?: string;
  sizeBytes: number;
  created?: string;
  modified?: string;
  createdBy?: string;
  modifiedBy?: string;
  webUrl?: string;
  versionCount?: number | null;
  versionsBytes?: number | null;
  totalBytes: number;
  metricBytes: number;
}

export interface TopCostResponse {
  window: AnalyticsWindow;
  field: AnalyticsDateField;
  anchorIso: string;
  startIso: string | null;
  endIso: string | null;
  items: TopCostItem[];
}

export interface TopVersionedItem extends TopCostItem {
  periodOnly?: boolean;
  periodVersionCount?: number;
  periodVersionsBytes?: number;
  totalPeriodBytes?: number;
  totalVersionCount?: number;
  totalVersionsBytes?: number;
  allVersionsTotalBytes?: number;
}

export interface TopVersionedResponse {
  window: AnalyticsWindow;
  field: AnalyticsDateField;
  anchorIso: string;
  startIso: string | null;
  endIso: string | null;
  timelineAvailable: boolean;
  filesWithTimeline: number;
  totalVersionedFiles: number;
  missingTimelineFiles: number;
  items: TopVersionedItem[];
}

export async function getTopCost(
  scanId: string,
  params: {
    window: AnalyticsWindow;
    field: AnalyticsDateField;
    limit: 80 | 100 | 200 | 300;
  },
): Promise<TopCostResponse> {
  return get<TopCostResponse>(`/api/analytics/topcost/${encodeURIComponent(scanId)}`, {
    ...params,
    includeVersions: true,
  });
}

export async function getTopVersioned(
  scanId: string,
  params: {
    window: AnalyticsWindow;
    field: AnalyticsDateField;
    limit: 80 | 100 | 200 | 300;
  },
): Promise<TopVersionedResponse> {
  return get<TopVersionedResponse>(`/api/analytics/topversioned/${encodeURIComponent(scanId)}`, {
    ...params,
    minVersionCount: 1,
  });
}
