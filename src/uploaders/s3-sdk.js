const fs = require('fs');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { log, formatBytes } = require('../utils');
const BaseUploader = require('./base');

/**
 * AWS S3 업로더 (AWS SDK 기반)
 *
 * @aws-sdk/client-s3를 사용하여 AWS S3에 백업 업로드
 * Node.js 네이티브 방식으로 S3 사용 (rclone 불필요)
 *
 * 인증 방식 (우선순위):
 * 1. 환경변수 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. AWS CLI credentials (~/.aws/credentials)
 * 3. IAM Role (EC2/ECS에서 실행 시)
 */
class S3SdkUploader extends BaseUploader {
  constructor(config) {
    super();
    // S3 버킷 이름
    this.bucket = config.bucket;
    // S3 객체 키 프리픽스 (예: 'backups/')
    this.prefix = config.prefix || '';
    // S3 리전
    this.region = config.region || 'us-east-1';
    // Storage Class (STANDARD, STANDARD_IA, GLACIER 등)
    this.storageClass = config.storage_class || 'STANDARD';
    // S3 Client 인스턴스
    this.s3Client = null;
    // 초기화 플래그
    this.initialized = false;

    if (!this.bucket) {
      throw new Error('S3 bucket is required');
    }
  }

  /**
   * AWS S3 SDK 클라이언트 초기화
   *
   * - S3Client 인스턴스 생성
   * - 리전 설정
   * - 자동 credential 탐지 (환경변수 → AWS CLI → IAM Role)
   */
  async initialize() {
    try {
      // S3 Client 생성
      this.s3Client = new S3Client({
        region: this.region,
        // credentials는 자동으로 다음 순서로 탐지:
        // 1. 환경변수 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
        // 2. ~/.aws/credentials
        // 3. IAM Role (EC2/ECS)
      });

      this.initialized = true;
      log(`S3 SDK client initialized (bucket: ${this.bucket}, region: ${this.region})`);

    } catch (error) {
      throw new Error(`S3 SDK initialization failed: ${error.message}`);
    }
  }

  /**
   * S3에 파일 업로드
   *
   * PutObjectCommand를 사용하여 파일 업로드
   * - 스트리밍 업로드 지원
   * - Storage Class 지정
   *
   * @param {string} filePath - 업로드할 로컬 파일 경로
   * @param {string} remotePath - 무시됨 (config.prefix 사용)
   * @param {string} fileName - S3에 저장할 파일 이름
   * @returns {Promise<Object>} 업로드된 파일 정보 {name, size}
   */
  async uploadFile(filePath, remotePath, fileName) {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    log(`Uploading to S3: ${fileName} (${formatBytes(fileSize)})`);

    try {
      // S3 객체 키 구성
      const key = `${this.prefix}${fileName}`;

      // 파일 스트림 생성
      const fileStream = fs.createReadStream(filePath);

      // PutObject 커맨드 생성
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        StorageClass: this.storageClass,
        ContentType: 'application/gzip' // tar.gz 파일
      });

      // 업로드 실행
      await this.s3Client.send(command);

      log(`Upload successful: ${fileName} → s3://${this.bucket}/${key}`);

      return {
        name: fileName,
        size: fileSize
      };

    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * S3 버킷/프리픽스의 파일 목록 조회
   *
   * ListObjectsV2Command를 사용하여 객체 목록 가져옴
   *
   * @param {string} remotePath - 무시됨 (config.prefix 사용)
   * @returns {Promise<Array>} 파일 목록 [{name, size, createdTime}]
   */
  async listFiles(remotePath) {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      // 파일 목록 변환 및 정렬
      return response.Contents
        .map(obj => ({
          name: obj.Key.replace(this.prefix, ''), // 프리픽스 제거
          size: obj.Size,
          createdTime: obj.LastModified.toISOString(),
          id: obj.Key
        }))
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    } catch (error) {
      throw new Error(`Failed to list S3 files: ${error.message}`);
    }
  }

  /**
   * S3에서 파일 삭제
   *
   * DeleteObjectCommand를 사용하여 파일 삭제
   *
   * @param {string} remotePath - 무시됨 (config.prefix 사용)
   * @param {string} fileName - 삭제할 파일 이름
   */
  async deleteFile(remotePath, fileName) {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const key = `${this.prefix}${fileName}`;

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      await this.s3Client.send(command);
      log(`Deleted file from S3: ${fileName}`);

    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * S3 연결 테스트
   *
   * 버킷에 ListObjects 권한이 있는지 확인
   *
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async testConnection() {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1 // 1개만 조회하여 권한 테스트
      });

      await this.s3Client.send(command);

      log(`S3 connection OK (bucket: ${this.bucket}, region: ${this.region})`);
      return true;

    } catch (error) {
      throw new Error(`S3 connection test failed: ${error.message}`);
    }
  }

  /**
   * 업로더 타입 반환
   *
   * @returns {string} 's3-sdk'
   */
  getType() {
    return 's3-sdk';
  }
}

module.exports = S3SdkUploader;
