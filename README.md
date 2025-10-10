# Backup Everything to Google Drive

Node.js로 작성된 자동 백업 시스템입니다. 지정한 폴더와 PostgreSQL 데이터베이스를 tar.gz로 압축하여 Google Drive에 업로드하고, 오래된 백업을 자동으로 정리합니다.

## 주요 기능

- ✅ 여러 폴더를 tar.gz로 압축하여 백업
- ✅ PostgreSQL 데이터베이스 덤프 백업 (pg_dump -Fc)
- ✅ Google Drive 자동 업로드 (Service Account)
- ✅ 보관 기간 설정 (N일 이상 오래된 백업 자동 삭제)
- ✅ 업로드 실패 시 3회 재시도 (exponential backoff)
- ✅ 업로드 실패 시 로컬 백업 보관
- ✅ PM2 cron 스케줄링 지원

## 사전 요구사항

- Node.js >= 18.0.0
- PostgreSQL 클라이언트 도구 (pg_dump, psql)
- Google Cloud Service Account JSON 파일

## 설치

```bash
# 1. 저장소 클론
git clone <repository-url>
cd backup-everything-to-google-drive

# 2. 의존성 설치
npm install

# 3. 설정 파일 복사
cp .env.example .env
cp .backup.example .backup
cp .config.example .config

# 4. 환경변수 설정
nano .env
# GOOGLE_SERVICE_ACCOUNT_PATH를 실제 경로로 수정
```

## 설정

### 1. Google Cloud Service Account 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. Google Drive API 활성화
3. Service Account 생성 및 JSON 키 다운로드
4. 백업을 저장할 Google Drive 폴더를 Service Account 이메일과 공유

### 2. .env 파일 설정

```bash
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
LOCAL_BACKUP_DIR=./backups
```

### 3. .backup 파일 설정

백업할 폴더와 PostgreSQL 연결 정보를 한 줄에 하나씩 입력합니다.

```
# 폴더 경로 (절대 경로)
/home/user/important-data
/var/www/project1

# PostgreSQL 연결 문자열
postgres://username:password@localhost:5432/mydb
postgres://user2:pass2@192.168.1.10:5432/production_db
```

### 4. .config 파일 설정

```json
{
  "retention_days": 7,
  "schedule": "0 2 * * *",
  "google_drive_folder_id": "YOUR_FOLDER_ID_HERE"
}
```

- `retention_days`: 백업 보관 기간 (일)
- `schedule`: PM2 cron 스케줄 (cron 형식)
- `google_drive_folder_id`: Google Drive 폴더 ID

**Google Drive 폴더 ID 찾기:**
- Google Drive에서 폴더 열기
- URL에서 ID 복사: `https://drive.google.com/drive/folders/[THIS_IS_THE_FOLDER_ID]`

## 사용법

### 수동 실행

```bash
npm start
```

### PM2로 자동 실행 (권장)

```bash
# PM2 설치 (전역)
npm install -g pm2

# PM2에 등록 (cron 모드)
pm2 start src/backup.js --name backup-gdrive --cron-restart="0 2 * * *"

# PM2 자동 시작 설정 (부팅 시)
pm2 startup
pm2 save

# 상태 확인
pm2 list

# 로그 확인
pm2 logs backup-gdrive

# 수동 실행 트리거
pm2 restart backup-gdrive
```

**Cron 스케줄 예시:**
- `0 2 * * *` - 매일 오전 2시
- `0 */6 * * *` - 6시간마다
- `0 0 * * 0` - 매주 일요일 자정

## 프로젝트 구조

```
backup-everything-to-google-drive/
├── src/
│   ├── backup.js      # 메인 백업 로직
│   ├── compress.js    # 폴더/파일 압축
│   ├── postgres.js    # PostgreSQL 백업
│   ├── gdrive.js      # Google Drive 업로드/정리
│   ├── config.js      # 설정 로더
│   └── utils.js       # 유틸리티 함수
├── .backup            # 백업 대상 목록 (git ignore)
├── .config            # 앱 설정 (git ignore)
├── .env               # 환경 변수 (git ignore)
└── package.json
```

## 백업 파일 명명 규칙

- 폴더 백업: `folder-{폴더명}-{타임스탬프}.tar.gz`
- DB 백업: `db-{DB명}-{타임스탬프}.tar.gz`
- 타임스탬프 형식: `YYYYMMDD-HHmmss`

**예시:**
- `folder-myproject-20251010-020000.tar.gz`
- `db-production-20251010-020315.tar.gz`

## 동작 과정

1. **설정 로드**: `.backup`, `.config`, `.env` 파일 읽기
2. **Google Drive 인증**: Service Account로 API 클라이언트 초기화
3. **폴더 백업**: 각 폴더를 tar.gz로 압축
4. **DB 백업**: PostgreSQL 덤프 생성 후 압축
5. **업로드**: Google Drive에 모든 백업 업로드 (3회 재시도)
6. **정리**: N일 이상 오래된 백업 삭제
7. **로컬 정리**: 업로드 성공한 파일은 로컬에서 삭제

## 에러 처리

- **업로드 실패**: 3회 재시도 (지수 백오프), 실패 시 로컬 보관
- **폴더 없음**: 경고 로그 출력 후 계속 진행
- **DB 연결 실패**: 에러 로그 출력 후 다음 백업 진행
- **프로세스 실패**: 종료 코드 1로 종료 (PM2 알림 가능)

## 트러블슈팅

### PostgreSQL 인증 실패

```bash
# .pgpass 파일 사용 (선택)
echo "localhost:5432:mydb:username:password" >> ~/.pgpass
chmod 600 ~/.pgpass
```

### Google Drive API 403 에러

- Service Account에 폴더 공유 권한이 있는지 확인
- Google Drive API가 활성화되어 있는지 확인

### 디스크 공간 부족

- `LOCAL_BACKUP_DIR` 위치 확인
- 업로드 성공 후 로컬 파일이 삭제되는지 확인
- `retention_days` 설정 확인

## 보안 주의사항

- `.backup`, `.config`, `.env` 파일은 절대 버전 관리에 포함하지 마세요
- Service Account JSON 파일은 안전한 곳에 보관
- PostgreSQL 연결 문자열에 비밀번호 포함 시 파일 권한 설정: `chmod 600 .backup`
- 프로덕션 환경에서는 암호화된 저장소 사용 권장

## 복원 방법

```bash
# 1. Google Drive에서 백업 파일 다운로드
# 2. tar.gz 압축 해제
tar -xzf folder-myproject-20251010-020000.tar.gz

# 3. PostgreSQL 복원 (커스텀 포맷)
pg_restore -h localhost -U username -d mydb -Fc db-production-20251010-020315.tar.gz
```

## 라이센스

MIT

## 기여

이슈 및 Pull Request 환영합니다!
