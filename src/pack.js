/**
 * @file pack.js
 * @description Pack LeetCode problems for Google Drive upload
 * @author Houston Zhang
 * @date 2025-12-16
 */

const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const workDir = process.cwd();

function getDateString() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function parsePackArgs(startIndex = 2, customArgs = null) {
    const args = customArgs || process.argv.slice(startIndex);
    const config = {
        sourceDir: null,
        output: null
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            console.log(`
LeetCode Problems Packer

Usage: leetcode-fetch pack [options]

Options:
  --source-dir, -s <path>  Source data directory (default: data/downloads)
                           Example: -s data/leetcode-problems-251216
  --output, -o <filename>  Output filename (default: leetcode-problems-backup-YYMMDD.zip)
                           Example: -o my-backup.zip
  --help, -h               Show this help message

Examples:
  leetcode-fetch pack
  leetcode-fetch pack -s data/downloads
  leetcode-fetch pack -s data/my-dataset -o my-backup.zip

Note:
  The zip file will be created in the current directory.
  You can then manually upload it to Google Drive.
            `);
            process.exit(0);
        } else if (arg === '--source-dir' || arg === '-s') {
            config.sourceDir = args[++i];
        } else if (arg === '--output' || arg === '-o') {
            config.output = args[++i];
        }
    }

    return config;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function getDirectorySize(dirPath) {
    let totalSize = 0;

    async function walk(dir) {
        const files = await fs.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory()) {
                await walk(filePath);
            } else {
                totalSize += stat.size;
            }
        }
    }

    await walk(dirPath);
    return totalSize;
}

async function createArchive(sourceDir, outputFile) {
    console.log('\x1b[36m›\x1b[0m Creating zip archive...');

    const sourceDirName = path.basename(sourceDir);
    const parentDir = path.dirname(sourceDir);

    try {
        const { stdout, stderr } = await execAsync(
            `cd "${parentDir}" && zip -r -q "${path.resolve(outputFile)}" "${sourceDirName}"`,
            {
                maxBuffer: 1024 * 1024 * 10
            }
        );

        if (stderr) {
            console.log(`\x1b[33m⚠\x1b[0m  ${stderr}`);
        }

        return true;
    } catch (error) {
        throw new Error(`Failed to create archive: ${error.message}`);
    }
}

async function main(startIndex = 2, customArgs = null) {
    const config = parsePackArgs(startIndex, customArgs);

    const sourceDir = config.sourceDir || 'data/downloads';
    const sourceDirPath = path.join(workDir, sourceDir);

    if (!await fs.pathExists(sourceDirPath)) {
        console.log(`\n\x1b[31m✗\x1b[0m Source directory not found: ${sourceDir}`);
        console.log('\x1b[2m  Please check the path or run download first\x1b[0m\n');
        process.exit(1);
    }

    const defaultOutputName = `leetcode-problems-backup-${getDateString()}.zip`;
    const outputFile = path.join(workDir, config.output || defaultOutputName);

    if (await fs.pathExists(outputFile)) {
        console.log('\n\x1b[33m⚠\x1b[0m  Output file already exists');
        console.log(`\x1b[2m  ${outputFile}\x1b[0m`);
        console.log('\x1b[2m  It will be overwritten\x1b[0m\n');
        await fs.remove(outputFile);
    }

    console.log('\n\x1b[1mPack Configuration\x1b[0m');
    console.log(`\x1b[2m  Source:\x1b[0m ${sourceDirPath}`);
    console.log(`\x1b[2m  Output:\x1b[0m ${outputFile}`);
    console.log('');

    try {
        console.log('\x1b[36m›\x1b[0m Calculating source size...');
        const sourceSize = await getDirectorySize(sourceDirPath);
        console.log(`  Source size: ${formatBytes(sourceSize)}`);
        console.log('');

        await createArchive(sourceDirPath, outputFile);

        const archiveStats = await fs.stat(outputFile);
        const archiveSize = formatBytes(archiveStats.size);
        const compressionRatio = ((1 - archiveStats.size / sourceSize) * 100).toFixed(1);

        console.log('\n\x1b[32m✓\x1b[0m Archive created successfully');
        console.log(`\x1b[2m  File:\x1b[0m ${outputFile}`);
        console.log(`\x1b[2m  Size:\x1b[0m ${archiveSize}`);
        console.log(`\x1b[2m  Compression:\x1b[0m ${compressionRatio}%`);
        console.log('\n\x1b[2m  You can now upload this file to Google Drive\x1b[0m\n');

    } catch (error) {
        console.log(`\n\x1b[31m✗\x1b[0m Pack failed`);
        console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);

        if (await fs.pathExists(outputFile)) {
            await fs.remove(outputFile);
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
            console.log(`\n\x1b[31m✗\x1b[0m Pack error`);
            console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
            process.exit(1);
        }
    })();
}

module.exports = {
    main
};
