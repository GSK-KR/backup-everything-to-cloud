// ==========================================
// 유틸리티 함수 모음
// ==========================================

/**
 * 지정된 밀리초 동안 대기하는 함수
 *
 * 이 함수는 비동기 작업에서 일시 정지가 필요할 때 사용됩니다.
 * 주로 재시도 로직에서 지연(delay)을 구현하는 데 사용됩니다.
 *
 * 사용 예:
 * await sleep(1000);  // 1초 대기
 * await sleep(5000);  // 5초 대기
 *
 * @param {number} ms - 대기할 시간 (밀리초 단위)
 * @returns {Promise<void>} ms 밀리초 후에 resolve되는 Promise
 */
function sleep(ms) {
  // Promise를 반환하여 await과 함께 사용 가능
  // setTimeout의 콜백에서 resolve()를 호출하여 대기 시간 후 완료
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 실패 시 자동으로 재시도하는 함수 래퍼 (Exponential Backoff 적용)
 *
 * Exponential Backoff란?
 * - 재시도할 때마다 대기 시간을 2배씩 증가시키는 전략
 * - 예: 1초 → 2초 → 4초 → 8초 ...
 * - 네트워크 오류나 일시적 장애에 효과적
 *
 * 동작 방식:
 * 1. 함수 실행 시도
 * 2. 성공하면 결과 반환
 * 3. 실패하면 지정된 대기 시간 후 재시도
 * 4. 최대 재시도 횟수 초과 시 에러 throw
 *
 * 사용 예:
 * await retry(async () => {
 *   await uploadFile();
 * }, 3, 1000);  // 최대 3회 재시도, 초기 1초 대기
 *
 * @param {Function} fn - 재시도할 비동기 함수
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 3회)
 * @param {number} initialDelay - 초기 대기 시간 밀리초 (기본값: 1000ms = 1초)
 * @returns {Promise} 함수 실행 결과 또는 최종 에러
 * @throws {Error} 모든 재시도 실패 시 마지막 에러 throw
 */
async function retry(fn, maxRetries = 3, initialDelay = 1000) {
  // 마지막 발생한 에러를 저장할 변수
  let lastError;

  // maxRetries번 재시도 (attempt: 0부터 maxRetries까지)
  // 예: maxRetries=3이면 총 4번 시도 (0, 1, 2, 3)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 전달받은 함수 실행 시도
      return await fn();

    } catch (error) {
      // 에러 발생 시 저장
      lastError = error;

      // 아직 재시도 가능한 경우 (마지막 시도가 아닌 경우)
      if (attempt < maxRetries) {
        // Exponential Backoff 계산
        // 1초 → 2초 → 4초 → 8초 ...
        // delay = initialDelay * (2 ^ attempt)
        const delay = initialDelay * Math.pow(2, attempt);

        // 재시도 정보 로그 출력
        console.log(`Attempt ${attempt + 1} failed: ${error.message}`);
        console.log(`Retrying in ${delay}ms...`);

        // 계산된 시간만큼 대기
        await sleep(delay);
      }
      // 마지막 시도인 경우 루프 종료 후 에러 throw
    }
  }

  // 모든 재시도 실패 시 최종 에러 throw
  throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * 타임스탬프 기반 파일명 생성 함수
 *
 * 현재 시간을 기반으로 고유한 파일명을 생성합니다.
 * 파일명이 중복되지 않도록 초 단위까지 포함합니다.
 *
 * 파일명 형식: {prefix}-YYYYMMDD-HHmmss.{extension}
 * 예: backup-20251010-143025.tar.gz
 *
 * 사용 예:
 * generateTimestampFilename('folder-mydata');
 * // 결과: folder-mydata-20251010-143025.tar.gz
 *
 * generateTimestampFilename('db-mydb', 'sql.gz');
 * // 결과: db-mydb-20251010-143025.sql.gz
 *
 * @param {string} prefix - 파일명 접두사 (기본값: 'backup')
 * @param {string} extension - 파일 확장자 (기본값: 'tar.gz')
 * @returns {string} 타임스탬프가 포함된 파일명
 */
function generateTimestampFilename(prefix = 'backup', extension = 'tar.gz') {
  // 현재 시간 객체 생성
  const now = new Date();

  // ISO 8601 형식으로 변환 후 타임스탬프 생성
  // 예: 2025-10-10T14:30:25.123Z → 20251010-143025
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')       // 하이픈과 콜론 제거
    .replace(/\..+/, '')        // 밀리초 부분 제거 (.123Z)
    .replace('T', '-');         // T를 하이픈으로 변경 (날짜와 시간 구분)

  // 최종 파일명 조합
  // 예: backup-20251010-143025.tar.gz
  return `${prefix}-${timestamp}.${extension}`;
}

/**
 * PostgreSQL 연결 문자열 파싱 함수
 *
 * PostgreSQL 연결 문자열에서 개별 연결 정보를 추출합니다.
 * pg_dump, psql 같은 PostgreSQL 명령어에 개별 옵션으로 전달할 때 사용합니다.
 *
 * 연결 문자열 형식:
 * postgres://username:password@host:port/database
 *
 * 예: postgres://myuser:mypass@localhost:5432/mydb
 *
 * @param {string} connectionString - PostgreSQL 연결 문자열
 * @returns {Object} 파싱된 연결 정보 객체
 *   - user: 사용자명
 *   - password: 비밀번호
 *   - host: 호스트 주소
 *   - port: 포트 번호 (숫자)
 *   - database: 데이터베이스 이름
 *
 * @throws {Error} 연결 문자열 형식이 잘못된 경우
 */
function parsePostgresUrl(connectionString) {
  // 정규표현식으로 연결 문자열 파싱
  // postgres://([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)
  // 그룹 1: user (콜론 전까지)
  // 그룹 2: password (@ 전까지)
  // 그룹 3: host (콜론 전까지)
  // 그룹 4: port (숫자만)
  // 그룹 5: database (슬래시 이후)
  const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;

  // 정규표현식 매칭 수행
  const match = connectionString.match(regex);

  // 매칭 실패 시 에러 throw
  if (!match) {
    throw new Error(`Invalid PostgreSQL connection string: ${connectionString}`);
  }

  // 매칭된 그룹을 객체로 반환
  return {
    user: match[1],                   // 사용자명
    password: match[2],                // 비밀번호
    host: match[3],                    // 호스트
    port: parseInt(match[4], 10),      // 포트 (문자열을 숫자로 변환)
    database: match[5]                 // 데이터베이스명
  };
}

/**
 * 바이트를 사람이 읽기 쉬운 크기로 변환하는 함수
 *
 * 큰 파일 크기를 적절한 단위로 변환하여 표시합니다.
 * 로그 출력 시 파일 크기를 보기 좋게 표시하는 데 사용됩니다.
 *
 * 변환 예:
 * - 0 → "0 Bytes"
 * - 1024 → "1 KB"
 * - 1048576 → "1 MB"
 * - 1073741824 → "1 GB"
 *
 * @param {number} bytes - 바이트 단위 크기
 * @returns {string} 사람이 읽기 쉬운 형식의 크기 문자열
 */
function formatBytes(bytes) {
  // 0바이트인 경우 특수 처리
  if (bytes === 0) return '0 Bytes';

  // 1 킬로바이트 = 1024 바이트
  const k = 1024;

  // 크기 단위 배열 (Bytes → KB → MB → GB → TB)
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  // 적절한 단위 계산
  // log(bytes) / log(1024)를 하면 몇 번째 단위인지 계산됨
  // 예: 1048576 bytes → log(1048576)/log(1024) = 2 → MB
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // 해당 단위로 나눈 값을 소수점 2자리로 반올림
  // 예: 1536 KB → 1.5 MB
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 타임스탬프와 로그 레벨이 포함된 로그 출력 함수
 *
 * 표준 console.log 대신 이 함수를 사용하여
 * 일관된 형식으로 로그를 출력합니다.
 *
 * 로그 형식:
 * [2025-10-10T14:30:25.123Z] [LEVEL] message
 *
 * 로그 레벨에 따른 출력 함수:
 * - info: console.log (일반 정보)
 * - warn: console.warn (경고, 노란색)
 * - error: console.error (오류, 빨간색)
 *
 * 사용 예:
 * log('Starting backup...');                     // [INFO]
 * log('Folder not found', 'warn');              // [WARN]
 * log('Backup failed', 'error');                // [ERROR]
 *
 * @param {string} message - 출력할 로그 메시지
 * @param {string} level - 로그 레벨 ('info', 'warn', 'error') (기본값: 'info')
 */
function log(message, level = 'info') {
  // 현재 시간을 ISO 8601 형식으로 가져오기
  // 예: 2025-10-10T14:30:25.123Z
  const timestamp = new Date().toISOString();

  // 로그 접두사 생성
  // 예: [2025-10-10T14:30:25.123Z] [INFO]
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  // 로그 레벨에 따라 적절한 console 함수 사용
  if (level === 'error') {
    // 에러 로그 (빨간색으로 출력)
    console.error(`${prefix} ${message}`);
  } else if (level === 'warn') {
    // 경고 로그 (노란색으로 출력)
    console.warn(`${prefix} ${message}`);
  } else {
    // 일반 정보 로그
    console.log(`${prefix} ${message}`);
  }
}

// ==========================================
// 모듈 내보내기
// ==========================================

/**
 * 모든 유틸리티 함수를 객체로 내보냅니다.
 *
 * 사용 예:
 * const { retry, log } = require('./utils');
 * await retry(async () => { ... });
 * log('Message');
 */
module.exports = {
  sleep,                      // 대기 함수
  retry,                      // 재시도 함수
  generateTimestampFilename,  // 타임스탬프 파일명 생성
  parsePostgresUrl,           // PostgreSQL 연결 문자열 파싱
  formatBytes,                // 바이트 크기 포맷팅
  log                         // 로그 출력 함수
};
