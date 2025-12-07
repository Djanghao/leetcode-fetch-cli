#!/usr/bin/env node

/**
 * @file leetcode-fetch.js
 * @description CLI entry point for leetcode-fetch
 * @author Houston Zhang
 * @date 2025-12-07
 */

const path = require('path');

const COMMANDS = {
    login: {
        description: 'Authenticate with LeetCode',
        handler: () => require('../src/auth').login()
    },
    logout: {
        description: 'Clear authentication session',
        handler: () => require('../src/auth').logout()
    },
    status: {
        description: 'Check authentication status',
        handler: () => require('../src/auth').status()
    },
    download: {
        description: 'Download LeetCode problems',
        handler: (args) => {
            const downloadModule = require('../src/download');
            const parsedArgs = parseDownloadArgs(args);

            const downloadArgs = [];
            if (parsedArgs.problemId) {
                downloadArgs.push(parsedArgs.problemId.toString());
            }
            if (parsedArgs.formats) {
                downloadArgs.push('-f', parsedArgs.formats);
            }
            if (parsedArgs.concurrency) {
                downloadArgs.push('-c', parsedArgs.concurrency.toString());
            }
            if (parsedArgs.skipTemplates) {
                downloadArgs.push('--no-templates');
            }
            if (parsedArgs.skipSolutions) {
                downloadArgs.push('--no-solutions');
            }
            if (parsedArgs.skipOfficial) {
                downloadArgs.push('--no-official');
            }

            if (downloadModule.main) {
                downloadModule.main(0, downloadArgs);
            } else {
                console.error('Download module not properly exported');
                process.exit(1);
            }
        }
    }
};

function parseDownloadArgs(args) {
    const result = {
        problemId: null,
        formats: null,
        skipTemplates: false,
        skipSolutions: false,
        skipOfficial: false,
        concurrency: null
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            showDownloadHelp();
            process.exit(0);
        }

        if (arg === '--formats' || arg === '-f') {
            result.formats = args[++i];
        } else if (arg === '--concurrency' || arg === '-c') {
            result.concurrency = parseInt(args[++i], 10);
        } else if (arg === '--no-templates') {
            result.skipTemplates = true;
        } else if (arg === '--no-solutions') {
            result.skipSolutions = true;
        } else if (arg === '--no-official') {
            result.skipOfficial = true;
        } else if (!arg.startsWith('-')) {
            result.problemId = parseInt(arg, 10);
        }
    }

    return result;
}

function showHelp() {
    console.log(`
\x1b[1mleetcode-fetch\x1b[0m - Download LeetCode problems with solutions

\x1b[1mUSAGE\x1b[0m
  leetcode-fetch <command> [options]

\x1b[1mCOMMANDS\x1b[0m
  login             Authenticate with LeetCode
  logout            Clear authentication session
  status            Check authentication status
  download [id]     Download problems (optionally specify problem ID)

\x1b[1mDOWNLOAD OPTIONS\x1b[0m
  [id]              Download specific problem by ID (optional)
  -f, --formats     Comma-separated formats: html,md,raw (default: all)
  --no-templates    Skip downloading code templates
  --no-solutions    Skip downloading community solutions
  --no-official     Skip downloading official solutions
  -c, --concurrency Number of concurrent downloads (default: 5)
  -h, --help        Show this help message

\x1b[1mEXAMPLES\x1b[0m
  leetcode-fetch login
  leetcode-fetch download
  leetcode-fetch download 1
  leetcode-fetch download -f md
  leetcode-fetch download --no-templates --no-solutions

\x1b[1mMORE INFO\x1b[0m
  https://github.com/Djanghao/leetcode-fetch
`);
}

function showDownloadHelp() {
    console.log(`
\x1b[1mDOWNLOAD COMMAND\x1b[0m

\x1b[1mUSAGE\x1b[0m
  leetcode-fetch download [id] [options]

\x1b[1mOPTIONS\x1b[0m
  [id]              Download specific problem by ID (optional)
  -f, --formats     Comma-separated formats: html,md,raw (default: all)
  --no-templates    Skip downloading code templates
  --no-solutions    Skip downloading community solutions
  --no-official     Skip downloading official solutions
  -c, --concurrency Number of concurrent downloads (default: 5)

\x1b[1mEXAMPLES\x1b[0m
  leetcode-fetch download
  leetcode-fetch download 1
  leetcode-fetch download -f md
  leetcode-fetch download -c 10
  leetcode-fetch download --no-templates
  leetcode-fetch download 1 -f md --no-solutions
`);
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showHelp();
        return;
    }

    if (args[0] === '--version' || args[0] === '-v') {
        const pkg = require('../package.json');
        console.log(pkg.version);
        return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    if (COMMANDS[command]) {
        COMMANDS[command].handler(commandArgs);
    } else {
        console.error(`\x1b[31mError:\x1b[0m Unknown command "${command}"\n`);
        console.log('Run \x1b[36mleetcode-fetch --help\x1b[0m for usage information');
        process.exit(1);
    }
}

main();
