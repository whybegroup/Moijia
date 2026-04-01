import { Body, Controller, Post, Query, Route, Tags } from 'tsoa';
import {
  DeleteUploadRequest,
  PresignGetBatchRequest,
  PresignGetBatchResponse,
  PresignUploadRequest,
  PresignUploadResponse,
} from '../models/Upload';
import { LocalUploadService } from '../services/LocalUploadService';

@Route('uploads')
@Tags('Uploads')
export class UploadController extends Controller {
  private uploads = new LocalUploadService();

  /**
   * Get a short-lived signed PUT URL for direct client upload into `api/data`.
   * @summary Presign image upload (local disk)
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
    return this.uploads.presignUpload({
      userId: body.userId.trim(),
      contentType: body.contentType.trim(),
      filename: body.filename?.trim(),
    });
  }

  /**
   * Resolve stored image URLs for display. Local uploads are already public paths; externals pass through.
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
    return this.uploads.presignGetBatch(urls);
  }

  /**
   * Delete a file under uploads/{userId}/ for the given userId.
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
    await this.uploads.deleteUploadedObject(userId.trim(), url);
  }
}
