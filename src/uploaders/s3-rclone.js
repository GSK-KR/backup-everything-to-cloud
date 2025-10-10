const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { log, formatBytes } = require('../utils');
const BaseUploader = require('./base');

const execAsync = promisify(exec);

/**
 * AWS S3 업로더 (rclone 기반)
 *
 * rclone을 사용하여 AWS S3에 백업 업로드
 * Google Drive와 동일한 인터페이스로 S3 사용 가능
 *
 * 사전 요구사항:
 * - rclone 설치: brew install rclone (macOS) 또는 curl https://rclone.org/install.sh | sudo bash
 * - rclone config: rclone config로 's3' 리모트 설정 필요
 *   또는 환경변수 사용 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 */
class S3RcloneUploader extends BaseUploader {
  constructor(config) {
    super();
    // rclone 리모트 이름 (기본값: 's3')
    this.remoteName = config.remote_name || 's3';
    // S3 버킷 이름
    this.bucket = config.bucket;
    // S3 객체 키 프리픽스 (예: 'backups/')
    this.prefix = config.prefix || '';
    // S3 리전 (rclone 설정에서 사용)
    this.region = config.region || 'us-east-1';
    // Storage Class (STANDARD, STANDARD_IA, GLACIER 등)
    this.storageClass = config.storage_class || 'STANDARD';
    // 초기화 플래그
    this.initialized = false;

    if (!this.bucket) {
      throw new Error('S3 bucket is required');
    }
  }

  /**
   * rclone S3 클라이언트 초기화 및 검증
   *
   * - rclone 설치 확인
   * - 리모트 설정 확인 또는 환경변수로 동적 생성
   */
  async initialize() {
    try {
      // rclone 버전 확인 (설치 여부 체크)
      await execAsync('rclone version');

      // 리모트 목록 확인
      const { stdout } = await execAsync('rclone listremotes');
      const remotes = stdout.split('\n').map(r => r.replace(':', '').trim()).filter(Boolean);

      // 리모트가 없으면 환경변수 확인
      if (!remotes.includes(this.remoteName)) {
        // AWS 환경변수 확인
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
          throw new Error(
            `rclone remote '${this.remoteName}' not found and AWS credentials not in environment.\n` +
            `Either:\n` +
            `  1. Run 'rclone config' to set up S3 remote\n` +
            `  2. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n` +
            `Available remotes: ${remotes.join(', ') || 'none'}`
          );
        }

        log(`Using AWS credentials from environment variables (no rclone remote configured)`);
      }

      this.initialized = true;
      log(`S3 rclone client initialized (remote: ${this.remoteName}, bucket: ${this.bucket})`);

    } catch (error) {
      if (error.message.includes('not found') && error.message.includes('rclone')) {
        throw new Error(
          'rclone is not installed. Install it first:\n' +
          '  macOS: brew install rclone\n' +
          '  Linux: curl https://rclone.org/install.sh | sudo bash'
        );
      }
      throw error;
    }
  }

  /**
   * S3에 파일 업로드
   *
   * rclone copy 명령어를 사용하여 로컬 파일을 S3로 복사
   * - 진행 상황 표시 활성화
   * - Storage Class 지정
   *
   * @param {string} filePath - 업로드할 로컬 파일 경로
   * @param {string} remotePath - S3 키 프리픽스 (무시됨, config.prefix 사용)
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
      // S3 경로 구성: s3://bucket/prefix/filename
      const s3Path = `${this.remoteName}:${this.bucket}/${this.prefix}${fileName}`;

      // rclone copyto: 특정 파일을 특정 위치로 복사
      // --s3-storage-class: 스토리지 클래스 지정
      // --progress: 진행률 표시
      const cmd = [
        'rclone',
        'copyto',
        `"${filePath}"`,
        `"${s3Path}"`,
        `--s3-storage-class ${this.storageClass}`,
        '--progress',
        '--stats 1s'
      ].join(' ');

      const env = {
        ...process.env
      };

      // 환경변수로 AWS credentials 사용
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
        env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
        if (process.env.AWS_SESSION_TOKEN) {
          env.AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN;
        }
      }

      const { stdout, stderr } = await execAsync(cmd, {
        env,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // rclone 출력 로그 (진행 상황)
      if (stderr) {
        const lines = stderr.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          log(lines[lines.length - 1]); // 마지막 진행 상황만 출력
        }
      }

      log(`Upload successful: ${fileName} → s3://${this.bucket}/${this.prefix}${fileName}`);

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
   * rclone lsjson 명령어를 사용하여 S3 객체 목록을 JSON으로 가져옴
   *
   * @param {string} remotePath - 무시됨 (config.prefix 사용)
   * @returns {Promise<Array>} 파일 목록 [{name, size, createdTime}]
   */
  async listFiles(remotePath) {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const s3Path = `${this.remoteName}:${this.bucket}/${this.prefix}`;
      const cmd = `rclone lsjson "${s3Path}"`;

      const { stdout } = await execAsync(cmd);

      if (!stdout.trim()) {
        return [];
      }

      const files = JSON.parse(stdout);

      // 파일만 필터링하고 정렬
      return files
        .filter(f => !f.IsDir)
        .map(f => ({
          name: f.Name,
          size: f.Size,
          createdTime: f.ModTime,
          id: f.Path
        }))
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    } catch (error) {
      // 프리픽스가 없으면 빈 배열 반환
      if (error.message.includes('directory not found') || error.message.includes('not found')) {
        return [];
      }
      throw new Error(`Failed to list S3 files: ${error.message}`);
    }
  }

  /**
   * S3에서 파일 삭제
   *
   * rclone delete 명령어를 사용하여 특정 파일 삭제
   *
   * @param {string} remotePath - 무시됨 (config.prefix 사용)
   * @param {string} fileName - 삭제할 파일 이름
   */
  async deleteFile(remotePath, fileName) {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const s3Path = `${this.remoteName}:${this.bucket}/${this.prefix}${fileName}`;
      const cmd = `rclone delete "${s3Path}"`;

      await execAsync(cmd);
      log(`Deleted file from S3: ${fileName}`);

    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * S3 연결 테스트
   *
   * rclone lsd 명령어로 버킷 접근 확인
   *
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async testConnection() {
    if (!this.initialized) {
      throw new Error('S3 client not initialized');
    }

    try {
      const cmd = `rclone lsd ${this.remoteName}:${this.bucket}`;
      await execAsync(cmd);

      log(`S3 connection OK (bucket: ${this.bucket}, region: ${this.region})`);
      return true;

    } catch (error) {
      throw new Error(`S3 connection test failed: ${error.message}`);
    }
  }

  /**
   * 업로더 타입 반환
   *
   * @returns {string} 's3-rclone'
   */
  getType() {
    return 's3-rclone';
  }
}

module.exports = S3RcloneUploader;
