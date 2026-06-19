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
  request?: {
    allSites?: boolean;
    sites?: string[];
    siteSearch?: string;
    maxSites?: number;
    filters?: ScanFilters;
    options?: {
      enableVersioning?: boolean;
      quickMode?: {
        maxSites: number;
        maxDrivesPerSite: number;
        maxItemsPerDrive: number;
      } | null;
    };
  };
}

/** Filtros de categorias de repositório a excluir do scan (espelha o backend site-filters). */
export interface ScanFilters {
  excludeOneDrive: boolean;        // F1
  excludeSystem: boolean;          // F2
  excludeArchived: boolean;        // F5
  excludeNoDrives: boolean;        // F7
  excludeChannelPrivate: boolean;  // F3
  excludeChannelShared: boolean;   // F4
  excludeEmbedded: boolean;        // F6
  excludeSubsites: boolean;        // F9
}

/** Item do catálogo de filtros retornado por GET /api/scan-filter-categories. */
export interface ScanFilterCategory {
  key: keyof ScanFilters;
  category: string;
  label: string;
  needsDrives: boolean;
  needsTeams: boolean;
}

/**
 * Progresso em tempo real de um scan ativo.
 * Os campos refletem o formato real retornado pelo backend (igual ao legacy app.js).
 */
export interface ScanProgress {
  /** Status em maiúsculas: RUNNING | DONE | ERROR | CANCELLED | QUEUED */
  status?: string;
  /** Estágio: LISTING_SITES | SCANNING_FILES | SCANNING_AND_VERSIONING | FINALIZING | … */
  stage?: string;
  totalSites?: number;
  doneSites?: number;
  forbiddenSites?: number;
  errorSites?: number;
  totalDrives?: number;
  doneDrives?: number;
  files?: number;
  bytes?: number;
  activity?: string;
  error?: string;
  versioningEnabled?: boolean;
  versionsTotal?: number;
  versionsDone?: number;
  versionsFail?: number;
  versionsBytes?: number;
}

export interface ScanStatusDetail {
  scanId: string;
  status: ScanStatus;
  progress?: ScanProgress;
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
  | 'versions'
  | 'export_inventory'
  | 'retention_execute'
  | 'retention_versions'
  | 'retention_files'
  | 'recycle_execute'
  | 'recycle_bin';

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
  scanId?: string;
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
  id?: string;
  scanId?: string;
  siteId: string;
  siteName?: string;
  siteUrl?: string;
  driveId: string;
  driveName?: string;
  itemId: string;
  name: string;
  extension: string;
  fullPath?: string;
  sizeBytes?: number;
  created?: string;
  modified?: string;
  totalBytes: number;
  webUrl?: string;
  versionCount?: number;
  versionsBytes?: number;
  versionsUnknownCount?: number;
  originScanId?: string;
  originScannedAt?: string | null;
  /** Campos legados mantidos durante a migração dos contratos. */
  modifiedAt?: string;
  createdBy?: string;
  modifiedBy?: string;
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
