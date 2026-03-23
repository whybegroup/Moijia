/**
 * Request a short-lived URL to PUT an image directly to S3.
 * Replace env placeholders when you configure your bucket (see `S3UploadService`).
 */
export interface PresignUploadRequest {
  userId: string;
  contentType: string;
  filename?: string;
}

export interface PresignUploadResponse {
  /** HTTP PUT target; include Content-Type header matching the presign request. */
  uploadUrl: string;
  /** Public URL to store on events/comments after upload succeeds. */
  publicUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface PresignGetBatchRequest {
  /** Stored image URLs from the database (S3 object URLs or pass-through externals). */
  sourceUrls: string[];
}

export interface PresignGetEntry {
  sourceUrl: string;
  viewUrl: string;
  expiresIn: number;
}

export interface PresignGetBatchResponse {
  results: PresignGetEntry[];
}

export interface DeleteUploadRequest {
  /** Canonical object URL (same as stored after upload). */
  sourceUrl: string;
}
