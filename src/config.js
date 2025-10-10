// ==========================================
// 모듈 불러오기
// ==========================================

// Node.js 기본 모듈
const fs = require('fs');           // 파일 시스템 작업 (파일 읽기/쓰기/존재 확인 등)
const path = require('path');       // 경로 처리 (절대 경로 변환, 경로 결합 등)

// 환경 변수 로드
// .env 파일의 내용을 process.env에 로드하여 민감한 정보를 안전하게 관리
require('dotenv').config();

// ==========================================
// Config 클래스 정의
// ==========================================

/**
 * 백업 시스템의 설정을 관리하는 클래스
 *
 * 이 클래스는 다음 기능을 제공합니다:
 * - 환경 변수에서 설정값 로드
 * - .backup 파일에서 백업 대상 로드 (폴더 및 데이터베이스)
 * - .config 파일에서 앱 설정 로드 (보관 기간, 스케줄 등)
 * - 로컬 백업 디렉토리 생성 및 관리
 */
class Config {
  /**
   * Config 클래스 생성자
   *
   * 환경 변수에서 다음 설정값을 읽어옵니다:
   * - BACKUP_FILE: 백업 대상이 정의된 파일 경로 (기본값: .backup)
   * - CONFIG_FILE: 앱 설정 파일 경로 (기본값: .config)
   * - LOCAL_BACKUP_DIR: 로컬 백업 임시 저장 디렉토리 (기본값: ./backups)
   */
  constructor() {
    // 백업 대상 파일 경로 (환경 변수 또는 기본값)
    this.backupFile = process.env.BACKUP_FILE || '.backup';

    // 앱 설정 파일 경로 (환경 변수 또는 기본값)
    this.configFile = process.env.CONFIG_FILE || '.config';

    // 로컬 백업 임시 저장 디렉토리 (환경 변수 또는 기본값)
    this.localBackupDir = process.env.LOCAL_BACKUP_DIR || './backups';
  }

  /**
   * .backup 파일에서 백업 대상 목록을 로드합니다
   *
   * .backup 파일 형식:
   * - 한 줄에 하나의 항목
   * - 절대 경로 폴더: 예) /home/user/documents
   * - PostgreSQL 연결 문자열: 예) postgres://user:pass@host:5432/mydb
   * - # 로 시작하는 줄은 주석으로 무시됨
   * - 빈 줄은 무시됨
   *
   * @returns {Object} { folders: string[], databases: string[] }
   *   - folders: 백업할 폴더 경로 배열
   *   - databases: PostgreSQL 연결 문자열 배열
   *
   * @throws {Error} .backup 파일이 존재하지 않을 경우
   * @throws {Error} 폴더 경로가 절대 경로가 아닐 경우
   */
  loadBackupTargets() {
    // 상대 경로를 절대 경로로 변환
    // 예: '.backup' → '/Users/username/project/.backup'
    const backupPath = path.resolve(this.backupFile);

    // 파일 존재 여부 확인
    if (!fs.existsSync(backupPath)) {
      throw new Error(`.backup file not found at ${backupPath}`);
    }

    // 파일 내용을 UTF-8 인코딩으로 읽기
    const content = fs.readFileSync(backupPath, 'utf-8');

    // 파일 내용을 줄 단위로 분리하고 전처리
    const lines = content
      .split('\n')                          // 줄바꿈 기준으로 분리
      .map(line => line.trim())             // 각 줄의 앞뒤 공백 제거
      .filter(line => line && !line.startsWith('#'));  // 빈 줄과 주석 제거

    // 결과를 저장할 배열 초기화
    const folders = [];      // 폴더 경로 배열
    const databases = [];    // 데이터베이스 연결 문자열 배열

    // 각 줄을 순회하며 폴더와 데이터베이스 구분
    for (const line of lines) {
      // postgres:// 로 시작하면 데이터베이스 연결 문자열
      if (line.startsWith('postgres://')) {
        databases.push(line);
      } else {
        // 그 외는 폴더 경로로 간주

        // 절대 경로 검증
        // path.isAbsolute()는 경로가 '/'로 시작하는지 확인 (Unix/Linux/macOS)
        // Windows에서는 'C:\' 같은 형식 확인
        if (!path.isAbsolute(line)) {
          throw new Error(`Folder path must be absolute: ${line}`);
        }

        // 폴더 존재 여부 확인 (경고만 출력, 오류는 아님)
        // 백업 실행 시점에 폴더가 생성될 수 있으므로
        if (!fs.existsSync(line)) {
          console.warn(`Warning: Folder does not exist: ${line}`);
        }

        folders.push(line);
      }
    }

    // 폴더 배열과 데이터베이스 배열을 객체로 반환
    return { folders, databases };
  }

  /**
   * .config 파일에서 애플리케이션 설정을 로드합니다
   *
   * .config 파일 형식 (JSON):
   * {
   *   "retention_days": 7,                      // 백업 보관 기간 (일)
   *   "schedule": "0 2 * * *",                  // cron 스케줄 표현식
   *   "google_drive_folder_path": "backups"     // Google Drive 폴더 경로 (필수)
   * }
   *
   * @returns {Object} 설정 객체
   *   - retention_days: 백업 보관 기간 (기본값: 7일)
   *   - schedule: PM2 cron 스케줄 (기본값: '0 2 * * *' = 매일 오전 2시)
   *   - google_drive_folder_path: Google Drive 폴더 경로 (필수, 예: 'backups')
   *
   * @throws {Error} .config 파일이 존재하지 않을 경우
   * @throws {Error} google_drive_folder_path가 설정되지 않은 경우
   * @throws {SyntaxError} JSON 파싱 실패 시
   */
  loadConfig() {
    // 상대 경로를 절대 경로로 변환
    const configPath = path.resolve(this.configFile);

    // 파일 존재 여부 확인
    if (!fs.existsSync(configPath)) {
      throw new Error(`.config file not found at ${configPath}`);
    }

    // JSON 파일 읽기 및 파싱
    // JSON.parse()는 잘못된 형식일 경우 SyntaxError 발생
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // ==========================================
    // 필수 필드 검증
    // ==========================================

    // Google Drive 폴더 경로는 필수값
    // rclone 리모트 경로 형식: 'backups', 'my-folder/backups' 등
    if (!config.google_drive_folder_path) {
      throw new Error('google_drive_folder_path is required in .config');
    }

    // ==========================================
    // 선택 필드 기본값 설정
    // ==========================================

    // retention_days: 백업 보관 기간 (기본값: 7일)
    // 이 기간보다 오래된 백업 파일은 자동 삭제됨
    config.retention_days = config.retention_days || 7;

    // schedule: PM2 cron 표현식 (기본값: 매일 오전 2시)
    // cron 형식: '분 시 일 월 요일'
    // '0 2 * * *' = 매일 오전 2시 0분
    config.schedule = config.schedule || '0 2 * * *';

    // 설정 객체 반환
    return config;
  }


  /**
   * 로컬 백업 디렉토리가 존재하는지 확인하고, 없으면 생성합니다
   *
   * 이 디렉토리는 Google Drive 업로드 전에
   * 압축된 백업 파일을 임시로 저장하는 용도로 사용됩니다.
   *
   * 업로드 성공 시 파일은 삭제되고,
   * 실패 시 로컬에 보관되어 나중에 수동으로 업로드할 수 있습니다.
   *
   * @returns {string} 로컬 백업 디렉토리 절대 경로
   */
  ensureLocalBackupDir() {
    // 디렉토리 존재 여부 확인
    if (!fs.existsSync(this.localBackupDir)) {
      // 디렉토리 생성 (recursive: true는 중간 경로도 함께 생성)
      // 예: './backups/2024/10' 생성 시 'backups'와 '2024'도 자동 생성
      fs.mkdirSync(this.localBackupDir, { recursive: true });
    }

    // 디렉토리 경로 반환
    return this.localBackupDir;
  }
}

// ==========================================
// 모듈 내보내기 (싱글톤 패턴)
// ==========================================

/**
 * Config 클래스의 인스턴스를 생성하여 내보냅니다.
 *
 * 싱글톤 패턴을 사용하여 애플리케이션 전체에서
 * 동일한 Config 인스턴스를 공유합니다.
 *
 * 사용 예:
 * const config = require('./config');
 * config.loadConfig();
 * config.validateServiceAccount();
 */
module.exports = new Config();
