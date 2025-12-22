/**
 * @file export.js
 * @description Export downloaded LeetCode problems with filtering
 * @author Houston Zhang
 * @date 2025-12-15
 */

const path = require('path');
const fs = require('fs-extra');

const workDir = process.cwd();

const LANGUAGE_EXT_MAP = {
    'cpp': 'cpp',
    'java': 'java',
    'python3': 'py',
    'python': 'py2',
    'javascript': 'js',
    'typescript': 'ts',
    'csharp': 'cs',
    'c': 'c',
    'golang': 'go',
    'kotlin': 'kt',
    'swift': 'swift',
    'rust': 'rs',
    'ruby': 'rb',
    'php': 'php',
    'dart': 'dart',
    'scala': 'scala',
    'elixir': 'ex',
    'erlang': 'erl',
    'racket': 'rkt',
    'mysql': 'sql',
    'mssql': 'mssql.sql',
    'postgresql': 'pgsql.sql',
    'oraclesql': 'oracle.sql',
    'pythondata': 'pandas.py',
    'bash': 'sh'
};

function parseExportArgs(startIndex = 2, customArgs = null) {
    const args = customArgs || process.argv.slice(startIndex);
    const config = {
        sourceDir: null,
        output: null,
        languages: null,
        format: 'md',
        includeOfficial: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            console.log(`
LeetCode Problems Exporter

Usage: leetcode-fetch export [options]

Options:
  --source-dir, -s <path>   Source data directory (default: data/downloads)
                            Example: -s data/leetcode-problems-251216
  --output, -o <path>       Destination folder (required)
  --languages, -l <langs>   Languages to export (comma-separated)
                            Example: python3,cpp,javascript
                            Default: all available languages
  --format, -f <format>     Description format: html, md, or raw
                            Default: md
  --official               Include official solutions
  --help, -h               Show this help message

Examples:
  leetcode-fetch export -o ./my-problems -l python3,cpp -f md --official
  leetcode-fetch export --output ./export --languages javascript --format html
  leetcode-fetch export -o ./export -l python3
  leetcode-fetch export -s data/my-dataset -o ./export
            `);
            process.exit(0);
        } else if (arg === '--source-dir' || arg === '-s') {
            config.sourceDir = args[++i];
        } else if (arg === '--output' || arg === '-o') {
            config.output = args[++i];
        } else if (arg === '--languages' || arg === '-l') {
            const langs = args[++i].split(',').map(l => l.trim().toLowerCase());
            config.languages = langs;
        } else if (arg === '--format' || arg === '-f') {
            config.format = args[++i].trim().toLowerCase();
        } else if (arg === '--official') {
            config.includeOfficial = true;
        }
    }

    return config;
}

async function validateExportConfig(config) {
    if (!config.output) {
        throw new Error('Output folder is required. Use -o or --output to specify destination.');
    }

    const sourceDir = config.sourceDir || 'data/downloads';
    const sourcePath = path.join(workDir, sourceDir);
    if (!await fs.pathExists(sourcePath)) {
        throw new Error(`Source directory not found: ${sourceDir}. Please check the path or run download first.`);
    }

    const validFormats = ['html', 'md', 'raw'];
    if (!validFormats.includes(config.format)) {
        throw new Error(`Invalid format: ${config.format}. Valid formats: ${validFormats.join(', ')}`);
    }

    if (config.languages) {
        const invalidLangs = config.languages.filter(lang => !LANGUAGE_EXT_MAP[lang]);
        if (invalidLangs.length > 0) {
            console.log(`\n\x1b[33m⚠\x1b[0m  Invalid language(s): ${invalidLangs.join(', ')}`);
            console.log('\x1b[2m  Available languages:\x1b[0m');
            const langs = Object.keys(LANGUAGE_EXT_MAP).sort();
            for (let i = 0; i < langs.length; i += 5) {
                console.log('    ' + langs.slice(i, i + 5).join(', '));
            }
            throw new Error('Invalid language codes provided');
        }
    }

    try {
        await fs.ensureDir(config.output);
    } catch (error) {
        throw new Error(`Cannot write to output folder: ${config.output}`);
    }
}

async function scanDownloads(sourceDir = 'data/downloads') {
    const downloadsPath = path.join(workDir, sourceDir);
    const categories = await fs.readdir(downloadsPath);
    const problems = [];

    for (const category of categories) {
        const categoryPath = path.join(downloadsPath, category);
        const stat = await fs.stat(categoryPath);

        if (!stat.isDirectory() || category.startsWith('.')) {
            continue;
        }

        const problemDirs = await fs.readdir(categoryPath);

        for (const problemDir of problemDirs) {
            const match = problemDir.match(/^(\d+)_(\w+)_(.+)$/);
            if (!match) continue;

            const [, id, difficulty, slug] = match;
            const problemPath = path.join(categoryPath, problemDir);

            const templatesPath = path.join(problemPath, 'templates');
            let availableLanguages = [];

            if (await fs.pathExists(templatesPath)) {
                const files = await fs.readdir(templatesPath);
                availableLanguages = files
                    .filter(f => f.startsWith('solution.'))
                    .map(f => {
                        const ext = f.replace('solution.', '');
                        return Object.keys(LANGUAGE_EXT_MAP).find(lang => LANGUAGE_EXT_MAP[lang] === ext);
                    })
                    .filter(Boolean);
            }

            problems.push({
                id,
                difficulty,
                slug,
                category,
                path: problemPath,
                folder: problemDir,
                availableLanguages
            });
        }
    }

    return problems;
}

async function exportProblem(problem, config, destFolder) {
    const stats = {
        files: 0,
        bytes: 0
    };

    const destPath = path.join(destFolder, problem.category, problem.folder);
    await fs.ensureDir(destPath);

    const formatMap = {
        'html': 'problem.html',
        'md': 'problem.md',
        'raw': 'problem.raw.txt'
    };

    const descFile = formatMap[config.format];
    const descSrc = path.join(problem.path, 'description', descFile);

    if (await fs.pathExists(descSrc)) {
        const descDest = path.join(destPath, 'description', descFile);
        await fs.ensureDir(path.dirname(descDest));
        await fs.copy(descSrc, descDest);
        const stat = await fs.stat(descSrc);
        stats.files++;
        stats.bytes += stat.size;
    }

    const descImagesPath = path.join(problem.path, 'description', 'images');
    if (await fs.pathExists(descImagesPath)) {
        const descImagesDest = path.join(destPath, 'description', 'images');
        await fs.copy(descImagesPath, descImagesDest);
        const files = await fs.readdir(descImagesPath);
        for (const file of files) {
            const stat = await fs.stat(path.join(descImagesPath, file));
            stats.files++;
            stats.bytes += stat.size;
        }
    }

    const languagesToExport = config.languages || problem.availableLanguages;

    for (const lang of languagesToExport) {
        if (!problem.availableLanguages.includes(lang)) {
            continue;
        }

        const ext = LANGUAGE_EXT_MAP[lang];
        const templateSrc = path.join(problem.path, 'templates', `solution.${ext}`);

        if (await fs.pathExists(templateSrc)) {
            const templateDest = path.join(destPath, 'templates', `solution.${ext}`);
            await fs.ensureDir(path.dirname(templateDest));
            await fs.copy(templateSrc, templateDest);
            const stat = await fs.stat(templateSrc);
            stats.files++;
            stats.bytes += stat.size;
        }

        const communitySrc = path.join(problem.path, 'solutions', 'community', lang);
        if (await fs.pathExists(communitySrc)) {
            const communityDest = path.join(destPath, 'solutions', 'community', lang);
            await fs.copy(communitySrc, communityDest);

            const solutionFile = path.join(communitySrc, 'solution.md');
            if (await fs.pathExists(solutionFile)) {
                const stat = await fs.stat(solutionFile);
                stats.files++;
                stats.bytes += stat.size;
            }

            const imagesPath = path.join(communitySrc, 'images');
            if (await fs.pathExists(imagesPath)) {
                const files = await fs.readdir(imagesPath);
                for (const file of files) {
                    const stat = await fs.stat(path.join(imagesPath, file));
                    stats.files++;
                    stats.bytes += stat.size;
                }
            }
        }
    }

    if (config.includeOfficial) {
        const officialSrc = path.join(problem.path, 'solutions', 'official');
        if (await fs.pathExists(officialSrc)) {
            const officialDest = path.join(destPath, 'solutions', 'official');
            await fs.copy(officialSrc, officialDest);

            const solutionFile = path.join(officialSrc, 'solution.md');
            if (await fs.pathExists(solutionFile)) {
                const stat = await fs.stat(solutionFile);
                stats.files++;
                stats.bytes += stat.size;
            }

            const imagesPath = path.join(officialSrc, 'images');
            if (await fs.pathExists(imagesPath)) {
                const files = await fs.readdir(imagesPath);
                for (const file of files) {
                    const stat = await fs.stat(path.join(imagesPath, file));
                    stats.files++;
                    stats.bytes += stat.size;
                }
            }
        }
    }

    return stats;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function displayExportSummary(stats, config) {
    console.log('\n\x1b[1mExport Summary\x1b[0m');
    console.log(`\x1b[2m  Total problems:\x1b[0m ${stats.totalProblems}`);
    console.log(`\x1b[2m  Total files:\x1b[0m ${stats.totalFiles}`);
    console.log(`\x1b[2m  Total size:\x1b[0m ${formatBytes(stats.totalBytes)}`);
    console.log(`\x1b[2m  Exported to:\x1b[0m ${path.resolve(config.output)}\n`);

    if (Object.keys(stats.categories).length > 0) {
        console.log('\x1b[2m  Categories:\x1b[0m');
        const categories = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);
        for (const [category, count] of categories.slice(0, 10)) {
            console.log(`    ${category}: ${count}`);
        }
        if (categories.length > 10) {
            console.log(`    ... and ${categories.length - 10} more`);
        }
    }
    console.log('');
}

async function main(startIndex = 2, customArgs = null) {
    const config = parseExportArgs(startIndex, customArgs);

    try {
        await validateExportConfig(config);
    } catch (error) {
        console.log(`\n\x1b[31m✗\x1b[0m ${error.message}\n`);
        process.exit(1);
    }

    const sourceDir = config.sourceDir || 'data/downloads';

    console.log('\n\x1b[1mExport Configuration\x1b[0m');
    console.log(`\x1b[2m  Source:\x1b[0m ${path.resolve(sourceDir)}`);
    console.log(`\x1b[2m  Output:\x1b[0m ${path.resolve(config.output)}`);
    console.log(`\x1b[2m  Languages:\x1b[0m ${config.languages ? config.languages.join(', ') : 'all'}`);
    console.log(`\x1b[2m  Format:\x1b[0m ${config.format}`);
    console.log(`\x1b[2m  Official solutions:\x1b[0m ${config.includeOfficial ? '\x1b[32mYes\x1b[0m' : '\x1b[2mNo\x1b[0m'}`);
    console.log('');

    console.log('Scanning source directory...');
    const problems = await scanDownloads(sourceDir);

    if (problems.length === 0) {
        console.log('\n\x1b[33m⚠\x1b[0m  No problems found in downloads folder\n');
        return;
    }

    console.log(`Found ${problems.length} problems\n`);
    console.log('Exporting...');

    const stats = {
        totalProblems: 0,
        totalFiles: 0,
        totalBytes: 0,
        categories: {}
    };

    for (let i = 0; i < problems.length; i++) {
        const problem = problems[i];

        try {
            const problemStats = await exportProblem(problem, config, config.output);

            stats.totalProblems++;
            stats.totalFiles += problemStats.files;
            stats.totalBytes += problemStats.bytes;
            stats.categories[problem.category] = (stats.categories[problem.category] || 0) + 1;

            if ((i + 1) % 100 === 0) {
                process.stdout.write(`\r\x1b[2m  Exported ${i + 1}/${problems.length} problems...\x1b[0m`);
            }
        } catch (error) {
            console.log(`\n\x1b[33m⚠\x1b[0m  Failed to export ${problem.folder}: ${error.message}`);
        }
    }

    process.stdout.write('\r\x1b[K');
    displayExportSummary(stats, config);
}

if (require.main === module) {
    (async () => {
        try {
            await main();
            process.exit(0);
        } catch (error) {
            console.log(`\n\x1b[31m✗\x1b[0m Export error`);
            console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
            process.exit(1);
        }
    })();
}

module.exports = {
    main
};
