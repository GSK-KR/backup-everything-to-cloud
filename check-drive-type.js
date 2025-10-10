#!/usr/bin/env node

// Google Drive 폴더 타입 확인 스크립트
const GoogleDriveClient = require('./src/gdrive');
require('dotenv').config();

async function checkDriveType() {
  const config = JSON.parse(require('fs').readFileSync('.config', 'utf-8'));
  const folderId = config.google_drive_folder_id;

  console.log('='.repeat(50));
  console.log('Google Drive 폴더 타입 확인');
  console.log('='.repeat(50));
  console.log(`폴더 ID: ${folderId}`);

  const gdrive = new GoogleDriveClient(process.env.GOOGLE_SERVICE_ACCOUNT_PATH);

  try {
    await gdrive.initialize();

    // 폴더 정보 가져오기
    const response = await gdrive.drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, driveId, capabilities',
      supportsAllDrives: true
    });

    const file = response.data;

    console.log('\n📁 폴더 정보:');
    console.log(`  이름: ${file.name}`);
    console.log(`  ID: ${file.id}`);
    console.log(`  타입: ${file.mimeType}`);
    console.log(`  Drive ID: ${file.driveId || '없음 (일반 My Drive 폴더)'}`);

    if (file.driveId) {
      console.log('\n✅ 공유 드라이브 폴더입니다!');
      console.log('   Service Account로 업로드 가능합니다.');
    } else {
      console.log('\n❌ 일반 My Drive 폴더입니다!');
      console.log('   Service Account는 My Drive에 업로드할 수 없습니다.');
      console.log('\n해결 방법:');
      console.log('1. 공유 드라이브를 생성하세요');
      console.log('2. 공유 드라이브 루트 또는 그 안의 폴더 ID를 사용하세요');
      console.log('3. 공유 드라이브에 Service Account를 "콘텐츠 관리자" 권한으로 추가하세요');
    }

  } catch (error) {
    console.error('\n❌ 오류:', error.message);

    if (error.message.includes('File not found')) {
      console.log('\n해결 방법:');
      console.log('1. 폴더 ID가 올바른지 확인하세요');
      console.log('2. Service Account에게 폴더 접근 권한이 있는지 확인하세요');
      console.log('   공유 대상:', 'lduo-google-drive-backup@snappy-stacker-474707-d9.iam.gserviceaccount.com');
    }
  }

  console.log('\n' + '='.repeat(50));
}

checkDriveType();
