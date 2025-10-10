const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { log, formatBytes } = require('./utils');

/**
 * Compress a folder to tar.gz
 * @param {string} sourcePath - Absolute path to folder
 * @param {string} outputPath - Output tar.gz file path
 * @returns {Promise<string>} Path to created archive
 */
async function compressFolder(sourcePath, outputPath) {
  return new Promise((resolve, reject) => {
    // Validate source path
    if (!fs.existsSync(sourcePath)) {
      return reject(new Error(`Source path does not exist: ${sourcePath}`));
    }

    const stat = fs.statSync(sourcePath);
    if (!stat.isDirectory()) {
      return reject(new Error(`Source path is not a directory: ${sourcePath}`));
    }

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create write stream
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 6 }
    });

    // Track progress
    let totalBytes = 0;

    output.on('close', () => {
      const size = formatBytes(archive.pointer());
      log(`Compressed: ${path.basename(sourcePath)} → ${size}`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.on('progress', (progress) => {
      totalBytes = progress.fs.processedBytes;
    });

    // Pipe archive to output
    archive.pipe(output);

    // Add directory to archive
    const folderName = path.basename(sourcePath);
    archive.directory(sourcePath, folderName);

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Compress database dump file to tar.gz
 * @param {string} dumpFilePath - Path to database dump file
 * @param {string} outputPath - Output tar.gz file path
 * @returns {Promise<string>} Path to created archive
 */
async function compressDatabaseDump(dumpFilePath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dumpFilePath)) {
      return reject(new Error(`Dump file does not exist: ${dumpFilePath}`));
    }

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 6 }
    });

    output.on('close', () => {
      const size = formatBytes(archive.pointer());
      log(`Compressed DB dump: ${path.basename(dumpFilePath)} → ${size}`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add dump file to archive
    archive.file(dumpFilePath, { name: path.basename(dumpFilePath) });

    archive.finalize();
  });
}

module.exports = {
  compressFolder,
  compressDatabaseDump
};
