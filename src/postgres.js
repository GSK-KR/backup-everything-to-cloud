const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { parsePostgresUrl, log, formatBytes } = require('./utils');

const execAsync = promisify(exec);

/**
 * Create PostgreSQL database dump using pg_dump
 * @param {string} connectionString - postgres://user:pass@host:port/database
 * @param {string} outputPath - Output dump file path
 * @returns {Promise<string>} Path to created dump file
 */
async function createDatabaseDump(connectionString, outputPath) {
  try {
    // Parse connection string
    const connInfo = parsePostgresUrl(connectionString);

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    log(`Starting PostgreSQL backup: ${connInfo.database}@${connInfo.host}`);

    // Build pg_dump command with custom format (-Fc)
    const pgDumpCmd = [
      'pg_dump',
      `-h ${connInfo.host}`,
      `-p ${connInfo.port}`,
      `-U ${connInfo.user}`,
      `-d ${connInfo.database}`,
      '-Fc',  // Custom format (compressed)
      `-f "${outputPath}"`
    ].join(' ');

    // Set PGPASSWORD environment variable
    const env = {
      ...process.env,
      PGPASSWORD: connInfo.password
    };

    // Execute pg_dump
    const { stdout, stderr } = await execAsync(pgDumpCmd, {
      env,
      maxBuffer: 1024 * 1024 * 100 // 100MB buffer
    });

    if (stderr && !stderr.includes('WARNING')) {
      log(`pg_dump stderr: ${stderr}`, 'warn');
    }

    // Verify dump file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Dump file was not created');
    }

    const stats = fs.statSync(outputPath);
    log(`PostgreSQL dump created: ${connInfo.database} → ${formatBytes(stats.size)}`);

    return outputPath;

  } catch (error) {
    throw new Error(`PostgreSQL backup failed: ${error.message}`);
  }
}

/**
 * Test PostgreSQL connection
 * @param {string} connectionString - postgres://user:pass@host:port/database
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection(connectionString) {
  try {
    const connInfo = parsePostgresUrl(connectionString);

    const testCmd = [
      'psql',
      `-h ${connInfo.host}`,
      `-p ${connInfo.port}`,
      `-U ${connInfo.user}`,
      `-d ${connInfo.database}`,
      '-c "SELECT 1"'
    ].join(' ');

    const env = {
      ...process.env,
      PGPASSWORD: connInfo.password
    };

    await execAsync(testCmd, { env });
    return true;

  } catch (error) {
    throw new Error(`PostgreSQL connection test failed: ${error.message}`);
  }
}

module.exports = {
  createDatabaseDump,
  testConnection
};
