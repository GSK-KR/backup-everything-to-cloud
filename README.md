# Backup Everything to Google Drive

Node.js로 작성된 자동 백업 시스템입니다. 지정한 폴더와 PostgreSQL 데이터베이스를 tar.gz로 압축하여 Google Drive에 업로드하고, 오래된 백업을 자동으로 정리합니다.

## 주요 기능

- ✅ 여러 폴더를 tar.gz로 압축하여 백업
- ✅ PostgreSQL 데이터베이스 덤프 백업 (pg_dump -Fc)
- ✅ Google Drive 자동 업로드 (rclone 사용)
- ✅ 개인 Gmail 계정 지원 (OAuth 2.0)
- ✅ 보관 기간 설정 (N일 이상 오래된 백업 자동 삭제)
- ✅ 업로드 실패 시 3회 재시도 (exponential backoff)
- ✅ 업로드 실패 시 로컬 백업 보관
- ✅ PM2 cron 스케줄링 지원

## 사전 요구사항

- Node.js >= 18.0.0
- PostgreSQL 클라이언트 도구 (pg_dump, psql)
- rclone (Google Drive 업로드)

## 설치

```bash
# 1. 저장소 클론
git clone <repository-url>
cd backup-everything-to-google-drive

# 2. 의존성 설치
npm install

# 3. rclone 설치
# macOS
brew install rclone

# Linux
curl https://rclone.org/install.sh | sudo bash

# 4. 설정 파일 복사
cp .backup.example .backup
cp .config.example .config
```

## 설정

### 1. rclone Google Drive 연결 설정

```bash
rclone config
```

설정 과정:
1. **n** (new remote)
2. **name**: `gdrive` 입력
3. **Storage**: `drive` (Google Drive) 선택
4. **Client ID/Secret**: 엔터 (기본값 사용)
5. **Scope**: `1` (full access) 선택
6. **Root folder**: 엔터 (기본값)
7. **Service Account**: `n`
8. **Auto config**: `y` → 브라우저 열림 → Google 로그인 → 권한 승인
9. **Team Drive**: `n`
10. **y** (확인)
11. **q** (종료)

### 2. .backup 파일 설정

백업할 폴더와 PostgreSQL 연결 정보를 한 줄에 하나씩 입력합니다.

```
# 폴더 경로 (절대 경로)
/home/user/important-data
/var/www/project1

# PostgreSQL 연결 문자열
postgres://username:password@localhost:5432/mydb
postgres://user2:pass2@192.168.1.10:5432/production_db
```

### 3. .config 파일 설정

```json
{
  "retention_days": 7,
  "schedule": "0 2 * * *",
  "google_drive_folder_path": "backups"
}
```

- `retention_days`: 백업 보관 기간 (일)
- `schedule`: PM2 cron 스케줄 (cron 형식)
- `google_drive_folder_path`: Google Drive 폴더 경로
  - 예: `"backups"` → Google Drive 루트의 'backups' 폴더
  - 예: `"my-folder/backups"` → 'my-folder' 안의 'backups' 폴더

## 사용법

### 수동 실행

```bash
npm start
```

### PM2로 자동 실행 (권장)

```bash
# PM2 설치 (전역)
npm install -g pm2

# PM2에 등록 및 cron 스케줄 시작
npm run pm2:start

# 상태 확인
npm run pm2:status

# 로그 확인
npm run pm2:logs

# PM2 재시작
npm run pm2:restart

# PM2 중지
npm run pm2:stop

# PM2에서 제거
npm run pm2:delete
```

### PM2 스크립트 설명

- `pm2:start`: .config 파일의 schedule에 따라 PM2 cron 등록
- `pm2:stop`: 백업 프로세스 중지
- `pm2:restart`: 백업 프로세스 재시작
- `pm2:delete`: PM2에서 완전히 제거
- `pm2:logs`: 실시간 로그 확인
- `pm2:status`: PM2 프로세스 목록 확인

## 프로젝트 구조

```
.
├── src/
│   ├── backup.js       # 메인 백업 오케스트레이션
│   ├── config.js       # 설정 관리 클래스
│   ├── gdrive.js       # Google Drive 클라이언트 (rclone 기반)
│   ├── postgres.js     # PostgreSQL 백업 모듈
│   ├── compress.js     # 압축 유틸리티
│   └── utils.js        # 공통 유틸리티 함수
├── .backup             # 백업 대상 정의 파일 (gitignore)
├── .config             # 앱 설정 파일 (gitignore)
├── package.json        # NPM 패키지 정의 및 스크립트
└── README.md           # 이 파일
```

## 작동 방식

1. **설정 로드**: `.backup`, `.config` 파일 읽기
2. **Google Drive 초기화**: rclone 클라이언트 설정 확인
3. **폴더 백업**: 각 폴더를 tar.gz로 압축
4. **데이터베이스 백업**: pg_dump로 PostgreSQL 덤프 생성 후 압축
5. **Google Drive 업로드**: rclone을 사용하여 모든 백업 업로드
6. **오래된 백업 정리**: retention_days 기준으로 오래된 파일 삭제
7. **로컬 파일 정리**: 업로드 성공 시 로컬 백업 파일 삭제

## 트러블슈팅

### rclone 리모트가 설정되지 않았습니다

```bash
# rclone 리모트 목록 확인
rclone listremotes

# 'gdrive:' 가 없으면 rclone config로 설정
rclone config
```

### Google Drive 연결 테스트

```bash
# Google Drive 용량 확인
rclone about gdrive:

# 백업 폴더 확인
rclone lsjson gdrive:backups
```

### PostgreSQL 버전 불일치 오류

pg_dump와 PostgreSQL 서버 버전이 다를 경우, `--no-sync` 옵션이 자동으로 추가됩니다.

## 라이선스

MIT

## 기여

이슈 및 PR을 환영합니다!
