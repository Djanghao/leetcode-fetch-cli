/**
 * @file sync.js
 * @description Sync LeetCode problems from Google Drive
 * @author Houston Zhang
 * @date 2025-12-16
 */

const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const workDir = process.cwd();

function parseSyncArgs(startIndex = 2, customArgs = null) {
    const args = customArgs || process.argv.slice(startIndex);
    const config = {
        dataDir: null,
        url: null,
        skipVerify: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            console.log(`
LeetCode Problems Sync

Usage: leetcode-fetch sync [options]

Options:
  --data-dir, -d <path>    Destination directory (default: data/)
                           The zip will be extracted to this location
                           Example: -d data/
  --url, -u <url>          Google Drive URL (required)
                           Example: -u https://drive.google.com/uc?id=FILE_ID
  --skip-verify            Skip integrity verification
  --help, -h               Show this help message

Examples:
  leetcode-fetch sync -u https://drive.google.com/uc?id=FILE_ID
  leetcode-fetch sync -d data/ -u https://drive.google.com/uc?id=FILE_ID
  leetcode-fetch sync -d custom-folder/ -u <url> --skip-verify

Note:
  This command requires gdown to be installed:
    pip install gdown
            `);
            process.exit(0);
        } else if (arg === '--data-dir' || arg === '-d') {
            config.dataDir = args[++i];
        } else if (arg === '--url' || arg === '-u') {
            config.url = args[++i];
        } else if (arg === '--skip-verify') {
            config.skipVerify = true;
        }
    }

    return config;
}

async function checkGdownInstalled() {
    try {
        await execAsync('gdown --version');
        return true;
    } catch (error) {
        return false;
    }
}

async function downloadFromGoogleDrive(url, outputFile) {
    console.log('\x1b[36m›\x1b[0m Downloading from Google Drive...');

    try {
        const { stdout, stderr } = await execAsync(`gdown "${url}" -O "${outputFile}"`, {
            maxBuffer: 1024 * 1024 * 10
        });

        if (stderr && !stderr.includes('Downloading')) {
            console.log(`\x1b[33m⚠\x1b[0m  ${stderr}`);
        }

        return true;
    } catch (error) {
        throw new Error(`Failed to download from Google Drive: ${error.message}`);
    }
}

async function extractArchive(archiveFile, destDir) {
    console.log('\x1b[36m›\x1b[0m Extracting zip archive...');

    try {
        await execAsync(`unzip -q "${archiveFile}" -d "${destDir}"`);
        return true;
    } catch (error) {
        throw new Error(`Failed to extract archive: ${error.message}`);
    }
}

async function verifyDataIntegrity(dataDir) {
    console.log('\x1b[36m›\x1b[0m Verifying data integrity...');

    try {
        const items = await fs.readdir(dataDir);
        let foundProgressFile = false;

        for (const item of items) {
            const itemPath = path.join(dataDir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                const progressFile = path.join(itemPath, '.download-progress.json');
                if (await fs.pathExists(progressFile)) {
                    foundProgressFile = true;
                    const progressData = await fs.readJson(progressFile);
                    const completedCount = progressData.completed ? progressData.completed.length : 0;
                    const failedCount = progressData.failed ? Object.keys(progressData.failed).length : 0;

                    console.log(`  Found dataset: ${item}`);
                    console.log(`  \x1b[32m${completedCount}\x1b[0m completed problems`);
                    if (failedCount > 0) {
                        console.log(`  \x1b[33m${failedCount}\x1b[0m failed problems`);
                    }
                }
            }
        }

        if (!foundProgressFile) {
            console.log('\x1b[33m⚠\x1b[0m  No progress file found, skipping verification');
        }

        return true;
    } catch (error) {
        console.log(`\x1b[33m⚠\x1b[0m  Could not verify integrity: ${error.message}`);
        return false;
    }
}

async function main(startIndex = 2, customArgs = null) {
    const config = parseSyncArgs(startIndex, customArgs);

    if (!config.url) {
        console.log('\n\x1b[31m✗\x1b[0m Google Drive URL is required');
        console.log('\x1b[2m  Use -u or --url to specify the URL\x1b[0m');
        console.log('\x1b[2m  Run leetcode-fetch sync --help for more information\x1b[0m\n');
        process.exit(1);
    }

    const gdownInstalled = await checkGdownInstalled();
    if (!gdownInstalled) {
        console.log('\n\x1b[31m✗\x1b[0m gdown is not installed');
        console.log('\x1b[2m  Please install it using: pip install gdown\x1b[0m\n');
        process.exit(1);
    }

    const dataDir = config.dataDir || 'data';
    const dataDirPath = path.join(workDir, dataDir);
    const tempDir = path.join(workDir, 'tmp');
    const archiveFile = path.join(tempDir, 'leetcode-data.zip');

    console.log('\n\x1b[1mSync Configuration\x1b[0m');
    console.log(`\x1b[2m  Destination:\x1b[0m ${dataDirPath}`);
    console.log(`\x1b[2m  Source URL:\x1b[0m ${config.url}`);
    console.log('');

    try {
        await fs.ensureDir(tempDir);
        await fs.ensureDir(dataDirPath);

        await downloadFromGoogleDrive(config.url, archiveFile);

        const archiveStats = await fs.stat(archiveFile);
        const sizeMB = (archiveStats.size / (1024 * 1024)).toFixed(2);
        console.log(`\x1b[32m✓\x1b[0m Downloaded ${sizeMB} MB`);

        await extractArchive(archiveFile, dataDirPath);
        console.log('\x1b[32m✓\x1b[0m Extracted successfully');

        await fs.remove(archiveFile);

        if (!config.skipVerify) {
            await verifyDataIntegrity(dataDirPath);
        }

        console.log('\n\x1b[32m✓\x1b[0m Sync completed successfully');
        console.log(`\x1b[2m  Data synced to:\x1b[0m ${dataDirPath}\n`);

    } catch (error) {
        console.log(`\n\x1b[31m✗\x1b[0m Sync failed`);
        console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);

        if (await fs.pathExists(archiveFile)) {
            await fs.remove(archiveFile);
        }

        process.exit(1);
    }
}

if (require.main === module) {
    (async () => {
        try {
            await main();
            process.exit(0);
        } catch (error) {
            console.log(`\n\x1b[31m✗\x1b[0m Sync error`);
            console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
            process.exit(1);
        }
    })();
}

module.exports = {
    main
};
