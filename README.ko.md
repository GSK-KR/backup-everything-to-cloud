# Backup Everything to Google Drive & AWS S3

Node.js로 작성된 자동 백업 시스템입니다. 지정한 폴더와 PostgreSQL 데이터베이스를 tar.gz로 압축하여 Google Drive 또는 AWS S3에 업로드하고, 오래된 백업을 자동으로 정리합니다.

## 주요 기능

- ✅ 여러 폴더를 tar.gz로 압축하여 백업
- ✅ PostgreSQL 데이터베이스 덤프 백업 (pg_dump -Fc)
- ✅ **다중 업로더 지원**: Google Drive, AWS S3 (rclone 또는 AWS SDK)
- ✅ **선택적 업로드**: 원하는 저장소만 선택하여 업로드 가능
- ✅ 개인 Gmail 계정 지원 (OAuth 2.0)
- ✅ 보관 기간 설정 (N일 이상 오래된 백업 자동 삭제)
- ✅ 업로드 실패 시 3회 재시도 (exponential backoff)
- ✅ 업로드 실패 시 로컬 백업 보관
- ✅ PM2 cron 스케줄링 지원

## 사전 요구사항

- Node.js >= 18.0.0
- PostgreSQL 클라이언트 도구 (pg_dump, psql)
- **업로더별 요구사항**:
  - Google Drive: rclone
  - S3 (rclone): rclone
  - S3 (SDK): AWS SDK (자동 설치됨)

## 설치

```bash
# 1. 저장소 클론
git clone <repository-url>
cd backup-everything-to-google-drive

# 2. 의존성 설치
npm install

# 3. rclone 설치 (Google Drive 또는 S3 rclone 방식 사용 시)
# macOS
brew install rclone

# Linux
curl https://rclone.org/install.sh | sudo bash

# 4. 설정 파일 복사
cp .backup.example .backup
cp .config.example .config
```

## 설정

### 1. 업로더 설정

#### 옵션 A: Google Drive (rclone)

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

#### 옵션 B: AWS S3 (rclone)

```bash
rclone config
```

설정 과정:
1. **n** (new remote)
2. **name**: `s3` 입력
3. **Storage**: `s3` (Amazon S3) 선택
4. **Provider**: `AWS` 선택
5. **Credentials**: `1` (Enter AWS credentials) 또는 `2` (환경변수 사용)
6. **Access Key ID**: 입력
7. **Secret Access Key**: 입력
8. **Region**: `us-east-1` 또는 원하는 리전 입력
9. **y** (확인)
10. **q** (종료)

**또는 환경변수 사용** (`.env` 파일):
```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

#### 옵션 C: AWS S3 (AWS SDK)

AWS SDK는 별도 rclone 설정 없이 사용 가능합니다.

**인증 방식** (우선순위 순):
1. 환경변수 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. `~/.aws/credentials` 파일
3. IAM Role (EC2/ECS에서 실행 시)

**AWS CLI 설정** (옵션 2번 방식):
```bash
aws configure
# Access Key ID: [입력]
# Secret Access Key: [입력]
# Region: us-east-1
# Output format: json
```

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
  "uploaders": [
    {
      "type": "gdrive",
      "enabled": true,
      "folder_path": "backups"
    },
    {
      "type": "s3-sdk",
      "enabled": true,
      "bucket": "my-backup-bucket",
      "prefix": "backups/",
      "region": "us-east-1",
      "storage_class": "STANDARD_IA"
    }
  ]
}
```

#### 업로더 타입 설명

| 타입 | 설명 | 장점 | 단점 |
|------|------|------|------|
| `gdrive` | Google Drive (rclone) | 개인 Gmail 계정 지원, 무료 15GB | rclone 설정 필요 |
| `s3-rclone` | AWS S3 (rclone) | 일관된 인터페이스 | rclone 설정 필요 |
| `s3-sdk` | AWS S3 (AWS SDK) | rclone 불필요, 네이티브 | AWS 의존성 추가 |

#### 업로더 설정 필드

**공통 필드:**
- `type`: 업로더 타입 (필수)
- `enabled`: 활성화 여부 (기본값: true)

**gdrive 전용:**
- `remote_name`: rclone 리모트 이름 (기본값: `gdrive`)
- `folder_path`: Google Drive 폴더 경로 (예: `backups`)

**s3-rclone 전용:**
- `remote_name`: rclone 리모트 이름 (기본값: `s3`)
- `bucket`: S3 버킷 이름 (필수)
- `prefix`: S3 객체 키 프리픽스 (예: `backups/`)
- `region`: AWS 리전 (기본값: `us-east-1`)
- `storage_class`: 스토리지 클래스 (기본값: `STANDARD`)

**s3-sdk 전용:**
- `bucket`: S3 버킷 이름 (필수)
- `prefix`: S3 객체 키 프리픽스 (예: `backups/`)
- `region`: AWS 리전 (기본값: `us-east-1`)
- `storage_class`: 스토리지 클래스 (기본값: `STANDARD`)

#### S3 Storage Class 선택 가이드

| 클래스 | 용도 | 비용 | 검색 속도 |
|--------|------|------|-----------|
| `STANDARD` | 자주 접근하는 데이터 | 높음 | 즉시 |
| `STANDARD_IA` | 월 1회 미만 접근 | 중간 | 즉시 |
| `GLACIER` | 아카이브 (연 1-2회) | 낮음 | 분~시간 |
| `INTELLIGENT_TIERING` | 자동 최적화 | 자동 | 즉시 |

**백업 추천**: `STANDARD_IA` (비용 효율적, 빠른 복구)

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

## 사용 예시

### 예시 1: Google Drive만 사용

```json
{
  "retention_days": 7,
  "schedule": "0 2 * * *",
  "uploaders": [
    {
      "type": "gdrive",
      "enabled": true,
      "folder_path": "backups"
    }
  ]
}
```

### 예시 2: S3만 사용 (AWS SDK)

```json
{
  "retention_days": 30,
  "schedule": "0 3 * * *",
  "uploaders": [
    {
      "type": "s3-sdk",
      "enabled": true,
      "bucket": "my-company-backups",
      "prefix": "daily/",
      "region": "ap-northeast-2",
      "storage_class": "STANDARD_IA"
    }
  ]
}
```

### 예시 3: Google Drive + S3 동시 업로드

```json
{
  "retention_days": 7,
  "schedule": "0 2 * * *",
  "uploaders": [
    {
      "type": "gdrive",
      "enabled": true,
      "folder_path": "backups"
    },
    {
      "type": "s3-sdk",
      "enabled": true,
      "bucket": "my-backup-bucket",
      "prefix": "backups/",
      "region": "us-east-1",
      "storage_class": "GLACIER"
    }
  ]
}
```

### 예시 4: S3 rclone과 SDK 동시 사용

```json
{
  "retention_days": 14,
  "schedule": "0 1 * * *",
  "uploaders": [
    {
      "type": "s3-rclone",
      "enabled": true,
      "bucket": "primary-backups",
      "prefix": "main/",
      "region": "us-east-1",
      "storage_class": "STANDARD_IA"
    },
    {
      "type": "s3-sdk",
      "enabled": true,
      "bucket": "secondary-backups",
      "prefix": "redundant/",
      "region": "eu-west-1",
      "storage_class": "GLACIER"
    }
  ]
}
```

## 프로젝트 구조

```
.
├── src/
│   ├── backup.js           # 메인 백업 오케스트레이션
│   ├── config.js           # 설정 관리 클래스
│   ├── uploaders/          # 업로더 모듈
│   │   ├── base.js         # 공통 인터페이스
│   │   ├── factory.js      # 업로더 팩토리
│   │   ├── gdrive.js       # Google Drive 업로더
│   │   ├── s3-rclone.js    # S3 rclone 업로더
│   │   └── s3-sdk.js       # S3 SDK 업로더
│   ├── postgres.js         # PostgreSQL 백업 모듈
│   ├── compress.js         # 압축 유틸리티
│   └── utils.js            # 공통 유틸리티 함수
├── .backup                 # 백업 대상 정의 파일 (gitignore)
├── .config                 # 앱 설정 파일 (gitignore)
├── package.json            # NPM 패키지 정의 및 스크립트
└── README.md               # 이 파일
```

## 작동 방식

1. **설정 로드**: `.backup`, `.config` 파일 읽기
2. **업로더 초기화**: 활성화된 모든 업로더 초기화 및 연결 테스트
3. **폴더 백업**: 각 폴더를 tar.gz로 압축
4. **데이터베이스 백업**: pg_dump로 PostgreSQL 덤프 생성 후 압축
5. **업로드**: 모든 활성화된 업로더에 백업 파일 업로드
6. **오래된 백업 정리**: retention_days 기준으로 각 저장소에서 오래된 파일 삭제
7. **로컬 파일 정리**: 업로드 성공 시 로컬 백업 파일 삭제

## 트러블슈팅

### rclone 리모트가 설정되지 않았습니다

```bash
# rclone 리모트 목록 확인
rclone listremotes

# 'gdrive:' 또는 's3:'가 없으면 rclone config로 설정
rclone config
```

### Google Drive 연결 테스트

```bash
# Google Drive 용량 확인
rclone about gdrive:

# 백업 폴더 확인
rclone lsjson gdrive:backups
```

### S3 연결 테스트

```bash
# rclone 방식
rclone lsd s3:my-bucket

# AWS CLI 방식
aws s3 ls s3://my-bucket/backups/
```

### PostgreSQL 버전 불일치 오류

pg_dump와 PostgreSQL 서버 버전이 다를 경우, `--no-sync` 옵션이 자동으로 추가됩니다.

### AWS credentials 오류

**환경변수 확인**:
```bash
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
```

**AWS CLI credentials 확인**:
```bash
cat ~/.aws/credentials
```

**IAM Role 확인** (EC2):
```bash
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

## 라이선스

MIT

## 기여

이슈 및 PR을 환영합니다!
