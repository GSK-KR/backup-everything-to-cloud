const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { log, formatBytes } = require('../utils');
const BaseUploader = require('./base');

const execAsync = promisify(exec);

/**
 * Google Drive 업로더 (rclone 기반)
 *
 * Service Account 대신 rclone을 사용하여 개인 Google 계정의 My Drive에 백업
 * rclone은 OAuth 2.0을 사용하므로 개인 Gmail 계정에서도 사용 가능
 *
 * 사전 요구사항:
 * - rclone 설치: brew install rclone (macOS) 또는 curl https://rclone.org/install.sh | sudo bash
 * - rclone config: rclone config로 'gdrive' 리모트 설정 필요
 */
class GDriveUploader extends BaseUploader {
  constructor(config) {
    super();
    // rclone 리모트 이름 (config에서 설정 또는 기본값 'gdrive')
    this.remoteName = config.remote_name || 'gdrive';
    // rclone이 설치되어 있는지 확인 플래그
    this.initialized = false;
  }

  /**
   * rclone 클라이언트 초기화 및 검증
   *
   * - rclone 설치 확인
   * - 리모트 설정 확인
   *
   * @throws {Error} rclone이 설치되지 않았거나 리모트가 설정되지 않은 경우
   */
  async initialize() {
    try {
      // rclone 버전 확인 (설치 여부 체크)
      await execAsync('rclone version');

      // 리모트 목록 확인
      const { stdout } = await execAsync('rclone listremotes');
      const remotes = stdout.split('\n').map(r => r.replace(':', '').trim()).filter(Boolean);

      if (!remotes.includes(this.remoteName)) {
        throw new Error(
          `rclone remote '${this.remoteName}' not found. ` +
          `Please run 'rclone config' to set up Google Drive.\n` +
          `Available remotes: ${remotes.join(', ') || 'none'}`
        );
      }

      this.initialized = true;
      log(`rclone client initialized (remote: ${this.remoteName})`);

    } catch (error) {
      if (error.message.includes('not found')) {
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
   * Google Drive에 파일 업로드
   *
   * rclone copy 명령어를 사용하여 로컬 파일을 Google Drive로 복사
   * - 진행 상황 표시 활성화
   * - 전송 통계 출력
   *
   * @param {string} filePath - 업로드할 로컬 파일 경로
   * @param {string} folderPath - Google Drive 대상 폴더 경로 (예: 'backups')
   * @param {string} fileName - Google Drive에 저장할 파일 이름
   * @returns {Promise<Object>} 업로드된 파일 정보 {name, size}
   * @throws {Error} 파일이 없거나 업로드 실패 시
   */
  async uploadFile(filePath, folderPath, fileName) {
    if (!this.initialized) {
      throw new Error('Google Drive client not initialized');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    log(`Uploading to Google Drive: ${fileName} (${formatBytes(fileSize)})`);

    try {
      // rclone copy: 로컬 파일 → Google Drive
      // --progress: 진행률 표시
      // --stats 1s: 1초마다 통계 업데이트
      const remotePath = `${this.remoteName}:${folderPath}`;
      const cmd = `rclone copy "${filePath}" "${remotePath}" --progress --stats 1s`;

      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // rclone 출력 로그 (진행 상황)
      if (stderr) {
        // rclone은 진행 상황을 stderr로 출력함
        const lines = stderr.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          log(lines[lines.length - 1]); // 마지막 진행 상황만 출력
        }
      }

      log(`Upload successful: ${fileName}`);

      return {
        name: fileName,
        size: fileSize
      };

    } catch (error) {
      throw new Error(`Google Drive upload failed: ${error.message}`);
    }
  }

  /**
   * Google Drive 폴더의 파일 목록 조회
   *
   * rclone lsjson 명령어를 사용하여 폴더 내 파일 목록을 JSON으로 가져옴
   *
   * @param {string} folderPath - Google Drive 폴더 경로 (예: 'backups')
   * @returns {Promise<Array>} 파일 목록 [{name, size, modTime, isDir}]
   * @throws {Error} 폴더 조회 실패 시
   */
  async listFiles(folderPath) {
    if (!this.initialized) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      const remotePath = `${this.remoteName}:${folderPath}`;
      const cmd = `rclone lsjson "${remotePath}"`;

      const { stdout } = await execAsync(cmd);

      if (!stdout.trim()) {
        return [];
      }

      const files = JSON.parse(stdout);

      // createdTime 대신 ModTime 사용, 파일만 필터링
      return files
        .filter(f => !f.IsDir)
        .map(f => ({
          name: f.Name,
          size: f.Size,
          createdTime: f.ModTime, // rclone은 ModTime 제공
          id: f.Path // rclone에는 ID가 없으므로 Path 사용
        }))
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    } catch (error) {
      // 폴더가 없으면 빈 배열 반환
      if (error.message.includes('directory not found')) {
        return [];
      }
      throw new Error(`Failed to list Google Drive files: ${error.message}`);
    }
  }

  /**
   * Google Drive에서 파일 삭제
   *
   * rclone delete 명령어를 사용하여 특정 파일 삭제
   *
   * @param {string} folderPath - Google Drive 폴더 경로
   * @param {string} fileName - 삭제할 파일 이름
   * @throws {Error} 삭제 실패 시
   */
  async deleteFile(folderPath, fileName) {
    if (!this.initialized) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      const remotePath = `${this.remoteName}:${folderPath}/${fileName}`;
      const cmd = `rclone delete "${remotePath}"`;

      await execAsync(cmd);
      log(`Deleted file from Google Drive: ${fileName}`);

    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * 보관 기간이 지난 오래된 백업 파일 정리
   *
   * - Google Drive 폴더의 파일 목록 조회
   * - retention_days 기준으로 오래된 파일 삭제
   * - 삭제된 파일 개수 출력
   *
   * @param {string} folderPath - Google Drive 폴더 경로 (예: 'backups')
   * @param {number} retentionDays - 보관 일수 (예: 7일)
   */
  async cleanupOldBackups(folderPath, retentionDays) {
    log(`Cleaning up backups older than ${retentionDays} days...`);

    const files = await this.listFiles(folderPath);

    if (files.length === 0) {
      log('No files to clean up');
      return;
    }

    // 기준 날짜 계산 (현재 - retention_days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    // 파일 생성일 확인하여 오래된 파일 삭제
    for (const file of files) {
      const fileDate = new Date(file.createdTime);

      if (fileDate < cutoffDate) {
        log(`Deleting old backup: ${file.name} (created: ${fileDate.toISOString()})`);
        await this.deleteFile(folderPath, file.name);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      log(`Cleanup complete: ${deletedCount} old backup(s) deleted`);
    } else {
      log('No old backups to delete');
    }
  }

  /**
   * Google Drive 연결 테스트
   *
   * rclone about 명령어로 Google Drive 정보 조회
   * - 사용 가능한 용량 확인
   * - 연결 상태 검증
   *
   * @returns {Promise<boolean>} 연결 성공 여부
   * @throws {Error} 연결 실패 시
   */
  async testConnection() {
    if (!this.initialized) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      const cmd = `rclone about ${this.remoteName}:`;
      const { stdout } = await execAsync(cmd);

      // rclone about 출력에서 Total 용량 정보 추출
      const lines = stdout.split('\n');
      const totalLine = lines.find(l => l.includes('Total:'));

      if (totalLine) {
        log(`Google Drive connection OK (${totalLine.trim()})`);
      } else {
        log('Google Drive connection OK');
      }

      return true;

    } catch (error) {
      throw new Error(`Google Drive connection test failed: ${error.message}`);
    }
  }

  /**
   * 업로더 타입 반환
   *
   * @returns {string} 'gdrive'
   */
  getType() {
    return 'gdrive';
  }
}

module.exports = GDriveUploader;
