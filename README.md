# Backup Everything to Cloud

[한국어 문서](README.ko.md)

Automated backup system built with Node.js that compresses specified folders and PostgreSQL databases into tar.gz archives and uploads them to cloud storage providers (Google Drive or AWS S3), with automatic cleanup of old backups.

## Key Features

- ✅ Compress multiple folders into tar.gz archives for backup
- ✅ PostgreSQL database dump backup (pg_dump -Fc)
- ✅ **Multi-uploader support**: Google Drive, AWS S3 (rclone or AWS SDK)
- ✅ **Selective upload**: Choose which storage provider(s) to use
- ✅ Personal Gmail account support (OAuth 2.0)
- ✅ Retention policy (automatically delete backups older than N days)
- ✅ 3 retries on upload failure (exponential backoff)
- ✅ Keep local backup on upload failure
- ✅ PM2 cron scheduling support

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL client tools (pg_dump, psql)
- **Uploader-specific requirements**:
  - Google Drive: rclone
  - S3 (rclone): rclone
  - S3 (SDK): AWS SDK (auto-installed)

## Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd backup-everything-to-cloud

# 2. Install dependencies
npm install

# 3. Install rclone (for Google Drive or S3 rclone method)
# macOS
brew install rclone

# Linux
curl https://rclone.org/install.sh | sudo bash

# 4. Copy configuration files
cp .backup.example .backup
cp .config.example .config
```

## Configuration

### 1. Uploader Setup

#### Option A: Google Drive (rclone)

```bash
rclone config
```

Setup process:
1. **n** (new remote)
2. **name**: Enter `gdrive`
3. **Storage**: Select `drive` (Google Drive)
4. **Client ID/Secret**: Press Enter (use defaults)
5. **Scope**: Select `1` (full access)
6. **Root folder**: Press Enter (default)
7. **Service Account**: `n`
8. **Auto config**: `y` → Browser opens → Google login → Grant permissions
9. **Team Drive**: `n`
10. **y** (confirm)
11. **q** (quit)

#### Option B: AWS S3 (rclone)

```bash
rclone config
```

Setup process:
1. **n** (new remote)
2. **name**: Enter `s3`
3. **Storage**: Select `s3` (Amazon S3)
4. **Provider**: Select `AWS`
5. **Credentials**: `1` (Enter AWS credentials) or `2` (use environment variables)
6. **Access Key ID**: Enter your key
7. **Secret Access Key**: Enter your secret
8. **Region**: Enter `us-east-1` or your desired region
9. **y** (confirm)
10. **q** (quit)

**Or use environment variables** (`.env` file):
```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

#### Option C: AWS S3 (AWS SDK)

AWS SDK can be used without rclone configuration.

**Authentication methods** (in priority order):
1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. `~/.aws/credentials` file
3. IAM Role (when running on EC2/ECS)

**AWS CLI setup** (for option 2):
```bash
aws configure
# Access Key ID: [enter]
# Secret Access Key: [enter]
# Region: us-east-1
# Output format: json
```

### 2. .backup File Configuration

Add folder paths and PostgreSQL connection strings, one per line.

```
# Folder paths (absolute paths)
/home/user/important-data
/var/www/project1

# PostgreSQL connection strings
postgres://username:password@localhost:5432/mydb
postgres://user2:pass2@192.168.1.10:5432/production_db
```

### 3. .config File Configuration

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

#### Uploader Types

| Type | Description | Pros | Cons |
|------|-------------|------|------|
| `gdrive` | Google Drive (rclone) | Personal Gmail support, 15GB free | Requires rclone setup |
| `s3-rclone` | AWS S3 (rclone) | Consistent interface | Requires rclone setup |
| `s3-sdk` | AWS S3 (AWS SDK) | No rclone needed, native | AWS dependency |

#### Uploader Configuration Fields

**Common fields:**
- `type`: Uploader type (required)
- `enabled`: Enable/disable (default: true)

**gdrive specific:**
- `remote_name`: rclone remote name (default: `gdrive`)
- `folder_path`: Google Drive folder path (e.g., `backups`)

**s3-rclone specific:**
- `remote_name`: rclone remote name (default: `s3`)
- `bucket`: S3 bucket name (required)
- `prefix`: S3 object key prefix (e.g., `backups/`)
- `region`: AWS region (default: `us-east-1`)
- `storage_class`: Storage class (default: `STANDARD`)

**s3-sdk specific:**
- `bucket`: S3 bucket name (required)
- `prefix`: S3 object key prefix (e.g., `backups/`)
- `region`: AWS region (default: `us-east-1`)
- `storage_class`: Storage class (default: `STANDARD`)

#### S3 Storage Class Guide

| Class | Use Case | Cost | Retrieval Speed |
|-------|----------|------|-----------------|
| `STANDARD` | Frequently accessed data | High | Immediate |
| `STANDARD_IA` | <1x/month access | Medium | Immediate |
| `GLACIER` | Archive (1-2x/year) | Low | Minutes to hours |
| `INTELLIGENT_TIERING` | Auto-optimization | Auto | Immediate |

**Recommended for backups**: `STANDARD_IA` (cost-effective, fast recovery)

## Usage

### Manual Execution

```bash
npm start
```

### Automated with PM2 (Recommended)

```bash
# Install PM2 (globally)
npm install -g pm2

# Register with PM2 and start cron schedule
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Restart PM2
npm run pm2:restart

# Stop PM2
npm run pm2:stop

# Remove from PM2
npm run pm2:delete
```

## Usage Examples

### Example 1: Google Drive Only

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

### Example 2: S3 Only (AWS SDK)

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

### Example 3: Google Drive + S3 Simultaneous Upload

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

### Example 4: Multiple S3 (rclone + SDK)

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

## Project Structure

```
.
├── src/
│   ├── backup.js           # Main backup orchestration
│   ├── config.js           # Configuration management
│   ├── uploaders/          # Uploader modules
│   │   ├── base.js         # Common interface
│   │   ├── factory.js      # Uploader factory
│   │   ├── gdrive.js       # Google Drive uploader
│   │   ├── s3-rclone.js    # S3 rclone uploader
│   │   └── s3-sdk.js       # S3 SDK uploader
│   ├── postgres.js         # PostgreSQL backup module
│   ├── compress.js         # Compression utilities
│   └── utils.js            # Common utility functions
├── .backup                 # Backup targets definition (gitignored)
├── .config                 # App configuration (gitignored)
├── package.json            # NPM package definition
└── README.md               # This file
```

## How It Works

1. **Load Configuration**: Read `.backup` and `.config` files
2. **Initialize Uploaders**: Initialize all enabled uploaders and test connections
3. **Folder Backup**: Compress each folder into tar.gz
4. **Database Backup**: Create PostgreSQL dumps with pg_dump, then compress
5. **Upload**: Upload backup files to all enabled uploaders
6. **Cleanup Old Backups**: Delete backups older than retention_days from each storage
7. **Local Cleanup**: Delete local backup files after successful upload

## Troubleshooting

### rclone remote not configured

```bash
# Check rclone remotes
rclone listremotes

# If 'gdrive:' or 's3:' is missing, configure with rclone config
rclone config
```

### Google Drive Connection Test

```bash
# Check Google Drive capacity
rclone about gdrive:

# Check backup folder
rclone lsjson gdrive:backups
```

### S3 Connection Test

```bash
# rclone method
rclone lsd s3:my-bucket

# AWS CLI method
aws s3 ls s3://my-bucket/backups/
```

### PostgreSQL Version Mismatch

If pg_dump and PostgreSQL server versions differ, `--no-sync` option is automatically added.

### AWS Credentials Error

**Check environment variables**:
```bash
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
```

**Check AWS CLI credentials**:
```bash
cat ~/.aws/credentials
```

**Check IAM Role** (EC2):
```bash
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

## License

MIT

## Contributing

Issues and PRs are welcome!
