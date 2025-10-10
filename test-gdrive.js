#!/usr/bin/env node

// Google Drive 연결 테스트 스크립트
const GoogleDriveClient = require('./src/gdrive');
require('dotenv').config();

async function testGoogleDrive() {
  const config = JSON.parse(require('fs').readFileSync('.config', 'utf-8'));

  console.log('Service Account:', process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
  console.log('Folder ID:', config.google_drive_folder_id);

  const gdrive = new GoogleDriveClient(process.env.GOOGLE_SERVICE_ACCOUNT_PATH);

  try {
    await gdrive.initialize();
    console.log('✅ Google Drive 초기화 성공');

    await gdrive.testConnection();
    console.log('✅ 연결 테스트 성공');

    // 폴더 파일 목록 조회 시도
    const files = await gdrive.listFiles(config.google_drive_folder_id);
    console.log(`✅ 폴더 접근 성공 (파일 ${files.length}개)`);

  } catch (error) {
    console.error('❌ 오류:', error.message);

    if (error.message.includes('File not found')) {
      console.error('\n해결 방법:');
      console.error('1. Google Drive에서 올바른 폴더 ID 확인');
      console.error('2. 폴더를 Service Account와 공유했는지 확인');
      console.error('   공유 대상:', 'lduo-google-drive-backup@snappy-stacker-474707-d9.iam.gserviceaccount.com');
    }
  }
}

testGoogleDrive();
