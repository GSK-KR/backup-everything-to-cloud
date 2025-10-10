const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { log, formatBytes } = require('./utils');

class GoogleDriveClient {
  constructor(serviceAccountPath) {
    this.auth = null;
    this.drive = null;
    this.serviceAccountPath = serviceAccountPath;
  }

  /**
   * Initialize Google Drive API client
   */
  async initialize() {
    if (!fs.existsSync(this.serviceAccountPath)) {
      throw new Error(`Service account file not found: ${this.serviceAccountPath}`);
    }

    const keyFile = require(this.serviceAccountPath);

    this.auth = new google.auth.GoogleAuth({
      keyFile: this.serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });

    log('Google Drive client initialized');
  }

  /**
   * Upload file to Google Drive
   * @param {string} filePath - Local file path to upload
   * @param {string} folderId - Google Drive folder ID
   * @param {string} fileName - Name for the file in Google Drive
   * @returns {Promise<Object>} Uploaded file metadata
   */
  async uploadFile(filePath, folderId, fileName) {
    if (!this.drive) {
      throw new Error('Google Drive client not initialized');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    log(`Uploading to Google Drive: ${fileName} (${formatBytes(fileSize)})`);

    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'application/gzip',
      body: fs.createReadStream(filePath)
    };

    try {
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, size, createdTime'
      });

      log(`Upload successful: ${response.data.name} (ID: ${response.data.id})`);

      return response.data;

    } catch (error) {
      throw new Error(`Google Drive upload failed: ${error.message}`);
    }
  }

  /**
   * List files in a Google Drive folder
   * @param {string} folderId - Google Drive folder ID
   * @returns {Promise<Array>} List of files
   */
  async listFiles(folderId) {
    if (!this.drive) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'createdTime desc'
      });

      return response.data.files || [];

    } catch (error) {
      throw new Error(`Failed to list Google Drive files: ${error.message}`);
    }
  }

  /**
   * Delete file from Google Drive
   * @param {string} fileId - Google Drive file ID
   */
  async deleteFile(fileId) {
    if (!this.drive) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      await this.drive.files.delete({ fileId });
      log(`Deleted file from Google Drive: ${fileId}`);

    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Clean up old backups based on retention policy
   * @param {string} folderId - Google Drive folder ID
   * @param {number} retentionDays - Number of days to keep backups
   */
  async cleanupOldBackups(folderId, retentionDays) {
    log(`Cleaning up backups older than ${retentionDays} days...`);

    const files = await this.listFiles(folderId);

    if (files.length === 0) {
      log('No files to clean up');
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const file of files) {
      const fileDate = new Date(file.createdTime);

      if (fileDate < cutoffDate) {
        log(`Deleting old backup: ${file.name} (created: ${fileDate.toISOString()})`);
        await this.deleteFile(file.id);
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
   * Test Google Drive connection
   */
  async testConnection() {
    if (!this.drive) {
      throw new Error('Google Drive client not initialized');
    }

    try {
      const response = await this.drive.about.get({ fields: 'user' });
      log(`Google Drive connection OK (user: ${response.data.user.emailAddress})`);
      return true;

    } catch (error) {
      throw new Error(`Google Drive connection test failed: ${error.message}`);
    }
  }
}

module.exports = GoogleDriveClient;
