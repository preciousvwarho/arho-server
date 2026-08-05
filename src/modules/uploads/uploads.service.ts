import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface UploadedImage {
  url: string;
  publicId: string;
}

@Injectable()
export class UploadsService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  uploadImage(buffer: Buffer, folder = 'arho') {
    return new Promise<UploadedImage>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'image',
            folder,
            transformation: [
              { width: 800, height: 600, crop: 'limit' },
              { quality: 'auto:good' },
              { format: 'jpg' },
            ],
          },
          (error, result) => {
            if (error || !result) {
              reject(
                new InternalServerErrorException(
                  error?.message ?? 'Image upload failed',
                ),
              );
              return;
            }
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          },
        )
        .end(buffer);
    });
  }
}
