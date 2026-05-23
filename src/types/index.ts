// ─── Envelope padrão de resposta da API ──────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Paginação por cursor (keyset) ────────────────────────────────────────────

export interface PageInfo {
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pageInfo: PageInfo;
  summary?: Record<string, unknown>;
}

// ─── Scans ────────────────────────────────────────────────────────────────────

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Scan {
  id: string;
  status: ScanStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  totalSites?: number;
  totalDrives?: number;
  totalFiles?: number;
  totalBytes?: number;
  lastError?: string;
}

export interface ScanStatusDetail {
  scanId: string;
  status: ScanStatus;
  progress?: {
    sitesTotal: number;
    sitesScanned: number;
    drivesScanned: number;
    filesIngested: number;
  };
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export type JobType =
  | 'scan_list_sites'
  | 'scan_site'
  | 'scan_drive'
  | 'version_item'
  | 'export_inventory'
  | 'retention_execute'
  | 'recycle_execute';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  scanId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progressJsonb?: Record<string, unknown>;
  lastError?: string;
}

export interface JobStatusDetail {
  jobId: string;
  type: JobType;
  status: JobStatus;
  progress: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
}

// ─── Inventário ───────────────────────────────────────────────────────────────

export interface InventorySummary {
  scanId: string;
  totalSites: number;
  totalDrives: number;
  totalFiles: number;
  totalBytes: number;
  totalVersions?: number;
  topExtensions?: ExtensionRollup[];
}

export interface SiteRollup {
  siteId: string;
  siteUrl: string;
  siteName: string;
  totalFiles: number;
  totalBytes: number;
  totalDrives: number;
}

export interface DriveRollup {
  driveId: string;
  driveName: string;
  siteId: string;
  totalFiles: number;
  totalBytes: number;
}

export interface FileItem {
  id: string;
  siteId: string;
  driveId: string;
  itemId: string;
  name: string;
  extension: string;
  totalBytes: number;
  webUrl?: string;
  modifiedAt?: string;
  createdBy?: string;
}

export interface ExtensionRollup {
  extension: string;
  fileCount: number;
  totalBytes: number;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'jsonl';

export interface ExportJob {
  jobId: string;
  status: JobStatus;
  downloadUrl?: string;
  format: ExportFormat;
  createdAt: string;
  finishedAt?: string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthDetail {
  ok: boolean;
  appDb?: { ok: boolean; latencyMs: number };
  queueDb?: { ok: boolean; latencyMs: number; mode: string };
  workers?: { ok: boolean; count: number };
  process?: { uptimeSeconds: number; heapUsedBytes: number; rssBytes: number };
  flags?: Record<string, boolean>;
}

// ─── Autenticação / Branding ──────────────────────────────────────────────────

export interface BrandingResponse {
  loginTitle?: string;
  loginSubtitle?: string;
  /** true = admin ainda não existe (primeiro acesso); false = admin existe */
  showFirstAdminLink?: boolean;
  logoDataUrl?: string;
  oauthEnabled?: boolean;
  oauthButtonLabel?: string;
}
