const GDriveUploader = require('./gdrive');
const S3RcloneUploader = require('./s3-rclone');
const S3SdkUploader = require('./s3-sdk');

/**
 * Uploader Factory
 *
 * 설정에 따라 적절한 업로더 인스턴스를 생성
 *
 * 지원 타입:
 * - 'gdrive': Google Drive (rclone)
 * - 's3-rclone': AWS S3 (rclone)
 * - 's3-sdk': AWS S3 (AWS SDK)
 */
class UploaderFactory {
  /**
   * 업로더 인스턴스 생성
   *
   * @param {string} type - 업로더 타입 ('gdrive', 's3-rclone', 's3-sdk')
   * @param {Object} config - 업로더 설정
   * @returns {BaseUploader} 업로더 인스턴스
   * @throws {Error} 지원하지 않는 타입인 경우
   */
  static create(type, config) {
    switch (type) {
      case 'gdrive':
        return new GDriveUploader(config);

      case 's3-rclone':
        return new S3RcloneUploader(config);

      case 's3-sdk':
        return new S3SdkUploader(config);

      default:
        throw new Error(
          `Unsupported uploader type: ${type}\n` +
          `Supported types: gdrive, s3-rclone, s3-sdk`
        );
    }
  }

  /**
   * .config 파일의 uploaders 설정에서 활성화된 업로더들 생성
   *
   * @param {Array} uploadersConfig - .config 파일의 uploaders 배열
   * @returns {Array<BaseUploader>} 활성화된 업로더 인스턴스 배열
   *
   * @example
   * const uploaders = UploaderFactory.createFromConfig([
   *   { type: 'gdrive', enabled: true, folder_path: 'backups' },
   *   { type: 's3-sdk', enabled: true, bucket: 'my-backups', region: 'us-east-1' }
   * ]);
   */
  static createFromConfig(uploadersConfig) {
    if (!Array.isArray(uploadersConfig)) {
      throw new Error('uploaders config must be an array');
    }

    const uploaders = [];

    for (const uploaderConfig of uploadersConfig) {
      // enabled가 false이면 스킵
      if (uploaderConfig.enabled === false) {
        continue;
      }

      // type 필드 검증
      if (!uploaderConfig.type) {
        throw new Error('uploader config must have a "type" field');
      }

      try {
        const uploader = UploaderFactory.create(uploaderConfig.type, uploaderConfig);
        uploaders.push(uploader);
      } catch (error) {
        throw new Error(`Failed to create uploader (type: ${uploaderConfig.type}): ${error.message}`);
      }
    }

    if (uploaders.length === 0) {
      throw new Error('No enabled uploaders configured');
    }

    return uploaders;
  }
}

module.exports = UploaderFactory;
