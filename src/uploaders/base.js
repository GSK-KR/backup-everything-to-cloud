/**
 * BaseUploader - 모든 업로더의 공통 인터페이스
 *
 * 업로더 확장성을 위한 추상 클래스
 * 새로운 스토리지 제공자를 추가하려면 이 클래스를 상속하세요.
 *
 * 지원 업로더:
 * - GDriveUploader: Google Drive (rclone)
 * - S3RcloneUploader: AWS S3 (rclone)
 * - S3SdkUploader: AWS S3 (AWS SDK)
 */
class BaseUploader {
  constructor(config) {
    // 설정 객체 저장 (하위 클래스에서 접근 가능)
    this.config = config;
  }

  /**
   * 업로더 초기화
   *
   * @param {Object} config - 업로더 설정
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * 파일 업로드
   *
   * @param {string} filePath - 로컬 파일 경로
   * @param {string} remotePath - 원격 저장소 경로
   * @param {string} fileName - 파일 이름
   * @returns {Promise<Object>} 업로드 결과 {name, size}
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  async uploadFile(filePath, remotePath, fileName) {
    throw new Error('uploadFile() must be implemented by subclass');
  }

  /**
   * 파일 목록 조회
   *
   * @param {string} remotePath - 원격 저장소 경로
   * @returns {Promise<Array>} 파일 목록 [{name, size, createdTime}]
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  async listFiles(remotePath) {
    throw new Error('listFiles() must be implemented by subclass');
  }

  /**
   * 파일 삭제
   *
   * @param {string} remotePath - 원격 저장소 경로
   * @param {string} fileName - 파일 이름
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  async deleteFile(remotePath, fileName) {
    throw new Error('deleteFile() must be implemented by subclass');
  }

  /**
   * 오래된 백업 정리
   *
   * @param {string} remotePath - 원격 저장소 경로
   * @param {number} retentionDays - 보관 일수
   */
  async cleanupOldBackups(remotePath, retentionDays) {
    const files = await this.listFiles(remotePath);

    if (files.length === 0) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const file of files) {
      const fileDate = new Date(file.createdTime);

      if (fileDate < cutoffDate) {
        await this.deleteFile(remotePath, file.name);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 연결 테스트
   *
   * @returns {Promise<boolean>} 연결 성공 여부
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * 업로더 타입 반환
   *
   * @returns {string} 업로더 타입 ('gdrive', 's3-rclone', 's3-sdk')
   * @throws {Error} 하위 클래스에서 반드시 구현해야 함
   */
  getType() {
    throw new Error('getType() must be implemented by subclass');
  }
}

module.exports = BaseUploader;
