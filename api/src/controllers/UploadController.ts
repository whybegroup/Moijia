import { Body, Controller, Post, Query, Route, Tags } from 'tsoa';
import {
  DeleteUploadRequest,
  PresignGetBatchRequest,
  PresignGetBatchResponse,
  PresignUploadRequest,
  PresignUploadResponse,
} from '../models/Upload';
import { S3UploadService } from '../services/S3UploadService';

@Route('uploads')
@Tags('Uploads')
export class UploadController extends Controller {
  private s3 = new S3UploadService();

  /**
   * Get a presigned PUT URL for a direct browser/client upload to S3.
   * @summary Presign image upload (S3)
   */
  @Post('presign')
  public async presignUpload(@Body() body: PresignUploadRequest): Promise<PresignUploadResponse> {
    if (!body.userId?.trim()) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (!body.contentType?.trim()) {
      this.setStatus(400);
      throw new Error('contentType is required');
    }
    return this.s3.presignUpload({
      userId: body.userId.trim(),
      contentType: body.contentType.trim(),
      filename: body.filename?.trim(),
    });
  }

  /**
   * Resolve stored image URLs to short-lived presigned GET URLs (private bucket).
   * External URLs are echoed back unchanged.
   */
  @Post('presign-get')
  public async presignGetBatch(@Body() body: PresignGetBatchRequest): Promise<PresignGetBatchResponse> {
    const urls = body.sourceUrls;
    if (!urls || !Array.isArray(urls)) {
      this.setStatus(400);
      throw new Error('sourceUrls array is required');
    }
    if (urls.length === 0) {
      return { results: [] };
    }
    return this.s3.presignGetBatch(urls);
  }

  /**
   * Delete an object from S3 (only under uploads/{userId}/ for the given userId).
   */
  @Post('delete')
  public async deleteUploadedObject(
    @Query() userId: string,
    @Body() body: DeleteUploadRequest,
  ): Promise<void> {
    if (!userId?.trim()) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const url = body.sourceUrl?.trim();
    if (!url) {
      this.setStatus(400);
      throw new Error('sourceUrl is required');
    }
    await this.s3.deleteUploadedObject(userId.trim(), url);
  }
}
