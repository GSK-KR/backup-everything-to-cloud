#!/usr/bin/env node

// Node.js 기본 모듈 불러오기
const fs = require('fs');           // 파일 시스템 작업을 위한 모듈
const path = require('path');       // 경로 처리를 위한 모듈

// 프로젝트 내부 모듈 불러오기
const config = require('./config');                                      // 설정 파일 로더
const { compressFolder, compressDatabaseDump } = require('./compress');  // 압축 관련 함수들
const { createDatabaseDump } = require('./postgres');                    // PostgreSQL 백업 함수
const UploaderFactory = require('./uploaders/factory');                  // 업로더 팩토리
const { retry, generateTimestampFilename, log } = require('./utils');   // 유틸리티 함수들

/**
 * 메인 백업 오케스트레이션 함수
 *
 * 이 함수는 전체 백업 프로세스를 조율합니다:
 * 1. 설정 파일 로드 및 검증
 * 2. 업로더 초기화 (Google Drive, S3 등)
 * 3. 폴더 백업 및 압축
 * 4. PostgreSQL 데이터베이스 백업 및 압축
 * 5. 모든 활성화된 업로더에 업로드
 * 6. 오래된 백업 파일 정리
 * 7. 결과 요약 및 종료
 *
 * @returns {Promise<void>} 백업 완료 시 resolve
 * @throws {Error} 치명적인 오류 발생 시 프로세스 종료 (exit code 1)
 */
async function runBackup() {
  // 백업 시작 시간 기록 (실행 시간 측정용)
  const startTime = Date.now();

  // 백업 시작 로그 출력
  log('========================================');
  log('Starting backup process...');
  log('========================================');

  try {
    // ==========================================
    // 1단계: 설정 로드 및 검증
    // ==========================================
    log('Loading configuration...');

    // .config 파일에서 앱 설정 로드 (보관 기간, 스케줄, Google Drive 폴더 경로 등)
    const appConfig = config.loadConfig();

    // .backup 파일에서 백업 대상 로드 (폴더 경로 및 데이터베이스 연결 문자열)
    const { folders, databases } = config.loadBackupTargets();

    // 로컬 백업 디렉토리 생성 (존재하지 않으면 생성)
    const localBackupDir = config.ensureLocalBackupDir();

    // 백업 대상 개수 로그 출력
    log(`Backup targets: ${folders.length} folder(s), ${databases.length} database(s)`);
    log(`Retention policy: ${appConfig.retention_days} days`);

    // ==========================================
    // 2단계: 업로더 초기화
    // ==========================================
    log('Initializing uploaders...');

    // 설정에서 활성화된 업로더들 생성
    const uploaders = UploaderFactory.createFromConfig(appConfig.uploaders);

    log(`Enabled uploaders: ${uploaders.map(u => u.getType()).join(', ')}`);

    // 모든 업로더 초기화 및 연결 테스트
    for (const uploader of uploaders) {
      await uploader.initialize();
      await uploader.testConnection();
    }

    // ==========================================
    // 3단계: 폴더 백업 및 압축
    // ==========================================
    // 백업 완료된 폴더 아카이브 정보를 저장할 배열
    const folderBackups = [];

    // 각 폴더를 순회하며 백업 수행
    for (let i = 0; i < folders.length; i++) {
      const folderPath = folders[i];
      log(`[${i + 1}/${folders.length}] Processing folder: ${folderPath}`);

      try {
        // 폴더 경로에서 폴더명만 추출 (예: /path/to/myFolder → myFolder)
        const folderName = path.basename(folderPath);

        // 타임스탬프를 포함한 아카이브 파일명 생성
        // 예: folder-myFolder-20251010-020000.tar.gz
        const archiveName = generateTimestampFilename(`folder-${folderName}`);

        // 로컬 백업 디렉토리에 저장될 전체 경로
        const archivePath = path.join(localBackupDir, archiveName);

        // 폴더를 tar.gz로 압축 (재시도 로직 포함)
        // 실패 시 최대 3회까지 재시도 (exponential backoff)
        await retry(async () => {
          await compressFolder(folderPath, archivePath);
        });

        // 성공적으로 생성된 백업 파일 정보를 배열에 추가
        folderBackups.push({ path: archivePath, name: archiveName });

      } catch (error) {
        // 특정 폴더 백업 실패 시 에러 로그 출력
        log(`Failed to backup folder ${folderPath}: ${error.message}`, 'error');
        // 실패해도 다른 폴더 백업은 계속 진행 (부분 실패 허용)
      }
    }

    // ==========================================
    // 4단계: PostgreSQL 데이터베이스 백업
    // ==========================================
    // 백업 완료된 데이터베이스 아카이브 정보를 저장할 배열
    const dbBackups = [];

    // 각 데이터베이스 연결 문자열을 순회하며 백업 수행
    for (let i = 0; i < databases.length; i++) {
      const dbConnectionString = databases[i];
      log(`[${i + 1}/${databases.length}] Processing database...`);

      try {
        // 연결 문자열에서 데이터베이스 이름 추출
        // 예: postgres://user:pass@host:5432/mydb?options → mydb
        const dbName = dbConnectionString.split('/').pop().split('?')[0];

        // 덤프 파일명 생성 (예: mydb.dump)
        const dumpFileName = `${dbName}.dump`;

        // 덤프 파일이 저장될 전체 경로
        const dumpPath = path.join(localBackupDir, dumpFileName);

        // pg_dump를 사용하여 데이터베이스 덤프 생성 (재시도 로직 포함)
        // pg_dump -Fc 옵션 사용 (커스텀 포맷, 압축됨)
        await retry(async () => {
          await createDatabaseDump(dbConnectionString, dumpPath);
        });

        // 타임스탬프를 포함한 아카이브 파일명 생성
        // 예: db-mydb-20251010-020000.tar.gz
        const archiveName = generateTimestampFilename(`db-${dbName}`);

        // 최종 tar.gz 아카이브 경로
        const archivePath = path.join(localBackupDir, archiveName);

        // 덤프 파일을 tar.gz로 재압축 (재시도 로직 포함)
        // 이미 -Fc로 압축되어 있지만, 통일된 형식(.tar.gz)으로 관리
        await retry(async () => {
          await compressDatabaseDump(dumpPath, archivePath);
        });

        // 압축 완료 후 원본 덤프 파일 삭제 (디스크 공간 절약)
        fs.unlinkSync(dumpPath);

        // 성공적으로 생성된 백업 파일 정보를 배열에 추가
        dbBackups.push({ path: archivePath, name: archiveName });

      } catch (error) {
        // 특정 데이터베이스 백업 실패 시 에러 로그 출력
        log(`Failed to backup database: ${error.message}`, 'error');
        // 실패해도 다른 데이터베이스 백업은 계속 진행 (부분 실패 허용)
      }
    }

    // ==========================================
    // 5단계: 모든 업로더에 백업 업로드
    // ==========================================

    // 폴더 백업과 데이터베이스 백업을 하나의 배열로 결합
    const allBackups = [...folderBackups, ...dbBackups];

    // 각 업로더에 대해 업로드 수행
    for (const uploader of uploaders) {
      log(`\nUploading to ${uploader.getType()}...`);

      // 업로드 성공/실패 카운터 초기화
      let uploadSuccessCount = 0;
      let uploadFailCount = 0;

      // 원격 경로 가져오기 (업로더 타입에 따라 다름)
      const remotePath = uploader.config?.folder_path || uploader.config?.prefix || '';

      // 모든 백업 파일을 순회하며 업로드
      for (let i = 0; i < allBackups.length; i++) {
        const backup = allBackups[i];
        log(`  [${i + 1}/${allBackups.length}] ${backup.name}`);

        try {
          // 파일 업로드 (재시도 로직 포함)
          await retry(async () => {
            await uploader.uploadFile(
              backup.path,     // 로컬 파일 경로
              remotePath,      // 원격 저장소 경로
              backup.name      // 파일명
            );
          });

          uploadSuccessCount++;

        } catch (error) {
          log(`  Failed to upload ${backup.name} to ${uploader.getType()}: ${error.message}`, 'error');
          uploadFailCount++;
        }
      }

      log(`${uploader.getType()} upload summary: ${uploadSuccessCount} succeeded, ${uploadFailCount} failed`);
    }

    // 모든 업로더에 업로드 성공 시에만 로컬 파일 삭제
    log('\nCleaning up local backup files...');
    for (const backup of allBackups) {
      try {
        fs.unlinkSync(backup.path);
        log(`Removed: ${backup.name}`);
      } catch (error) {
        log(`Failed to remove ${backup.name}: ${error.message}`, 'warn');
      }
    }

    // ==========================================
    // 6단계: 오래된 백업 파일 정리
    // ==========================================
    log('\nCleaning up old backups...');

    for (const uploader of uploaders) {
      try {
        log(`Cleaning ${uploader.getType()}...`);

        const remotePath = uploader.config?.folder_path || uploader.config?.prefix || '';
        const deletedCount = await uploader.cleanupOldBackups(remotePath, appConfig.retention_days);

        if (deletedCount > 0) {
          log(`  Deleted ${deletedCount} old backup(s) from ${uploader.getType()}`);
        } else {
          log(`  No old backups to delete from ${uploader.getType()}`);
        }
      } catch (error) {
        log(`  Cleanup failed for ${uploader.getType()}: ${error.message}`, 'error');
      }
    }

    // ==========================================
    // 7단계: 백업 결과 요약 및 종료
    // ==========================================

    // 전체 실행 시간 계산 (초 단위, 소수점 2자리)
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 최종 결과 로그 출력
    log('========================================');
    log('Backup process completed!');
    log(`Duration: ${duration}s`);
    log(`Successful uploads: ${uploadSuccessCount}`);
    log(`Failed uploads: ${uploadFailCount}`);
    log('========================================');

    // 업로드 실패가 있으면 종료 코드 1로 프로세스 종료
    // PM2에서 이를 감지하여 알림을 보낼 수 있음
    if (uploadFailCount > 0) {
      process.exit(1);
    }

  } catch (error) {
    // 치명적 오류 발생 시 에러 로그 출력
    log(`Backup process failed: ${error.message}`, 'error');
    log(error.stack, 'error');

    // 종료 코드 1로 프로세스 종료
    process.exit(1);
  }
}

// ==========================================
// 스크립트 실행부
// ==========================================

// 이 파일이 직접 실행된 경우 (node src/backup.js)
// require.main === module이 true가 됨
if (require.main === module) {
  // runBackup() 실행 및 예외 처리
  runBackup().catch((error) => {
    // 예상치 못한 오류 발생 시 로그 출력
    log(`Unhandled error: ${error.message}`, 'error');

    // 종료 코드 1로 프로세스 종료
    process.exit(1);
  });
}

// ==========================================
// 모듈 내보내기
// ==========================================

// 다른 파일에서 require('./backup')로 불러올 수 있도록 내보내기
// 예: const { runBackup } = require('./backup');
module.exports = { runBackup };
