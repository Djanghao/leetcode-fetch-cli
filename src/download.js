/**
 * @file download.js
 * @description Core download logic for LeetCode problems
 * @author Houston Zhang
 * @date 2025-12-04
 */

const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const { getSessionCookies, getUser, verifySession } = require('./session');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryAsync(fn, retries = MAX_RETRIES, delay = RETRY_DELAY) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(delay * (i + 1));
        }
    }
}

class Spinner {
    constructor(message = 'Loading') {
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.currentFrame = 0;
        this.message = message;
        this.interval = null;
    }

    start() {
        this.interval = setInterval(() => {
            process.stdout.write(`\r\x1b[2m${this.frames[this.currentFrame]} ${this.message}...\x1b[0m`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }

    stop(clearLine = true) {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            if (clearLine) {
                process.stdout.write('\r\x1b[K');
            }
        }
    }

    update(message) {
        this.message = message;
    }
}


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

function parseArgs(startIndex = 2, customArgs = null) {
    const args = customArgs || process.argv.slice(startIndex);
    const config = {
        problemId: null,
        formats: ['html', 'md', 'raw'],
        fetchTemplates: true,
        fetchSolutions: true,
        fetchOfficialSolution: true,
        concurrency: 5
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            console.log(`
LeetCode Problem Downloader

Usage: leetcode-fetch download [problemId] [options]

Arguments:
  problemId                 Download specific problem by ID (optional, default: download all)

Options:
  --formats, -f <formats>   Comma-separated list of formats to save
                            Available: html, md, raw
                            Default: all formats
                            Example: -f html,md

  --no-templates           Don't download code templates
  --no-solutions           Don't download community solutions
  --no-official            Don't download official solutions

  --concurrency, -c <num>  Number of concurrent downloads (default: 5)
                           Example: -c 10

  --help, -h               Show this help message

Note:
  Languages are automatically detected from each problem's available code snippets.
  Algorithm problems: C++, Java, Python3, JavaScript, etc.
  Database problems: MySQL, PostgreSQL, Oracle, Pandas, etc.
  Shell problems: Bash

Examples:
  leetcode-fetch download 1                            # Download problem #1 with all formats
  leetcode-fetch download -f md                        # Download all problems, markdown only
  leetcode-fetch download 1 -f md --no-templates       # Download #1, markdown only, no templates
  leetcode-fetch download --no-solutions --no-official # Download all problems, templates only
            `);
            process.exit(0);
        } else if (arg === '--formats' || arg === '-f') {
            const formats = args[++i].split(',').map(f => f.trim().toLowerCase());
            config.formats = formats;
        } else if (arg === '--no-templates') {
            config.fetchTemplates = false;
        } else if (arg === '--no-solutions') {
            config.fetchSolutions = false;
        } else if (arg === '--no-official') {
            config.fetchOfficialSolution = false;
        } else if (arg === '--concurrency' || arg === '-c') {
            const concurrency = parseInt(args[++i], 10);
            if (concurrency > 0) {
                config.concurrency = concurrency;
            }
        } else if (!arg.startsWith('-')) {
            config.problemId = arg;
        }
    }

    return config;
}

async function fetchFromLeetCodeAPI(query, variables = {}) {
    const cookies = getSessionCookies();
    if (!cookies) {
        throw new Error('No session cookies found. Please login first.');
    }

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            { query, variables },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookies.session};csrftoken=${cookies.csrf};`,
                    'X-CSRFToken': cookies.csrf,
                    'Content-Type': 'application/json',
                    'Origin': 'https://leetcode.com',
                    'Referer': 'https://leetcode.com/problemset/'
                }
            }
        );
        return response.data;
    } catch (error) {
        throw new Error(`LeetCode API request failed: ${error.message}`);
    }
}

async function listProblems() {
    console.log('Fetching problems list from LeetCode API...');

    const query = `
        query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
            problemsetQuestionList: questionList(
                categorySlug: $categorySlug
                limit: $limit
                skip: $skip
                filters: $filters
            ) {
                total: totalNum
                questions: data {
                    questionId
                    questionFrontendId
                    title
                    titleSlug
                    difficulty
                    isPaidOnly
                    topicTags {
                        name
                        slug
                    }
                    companyTags {
                        name
                        slug
                    }
                }
            }
        }
    `;

    const problems = [];
    const limit = 100;
    let skip = 0;
    let total = 0;

    do {
        const data = await fetchFromLeetCodeAPI(query, {
            categorySlug: '',
            limit,
            skip,
            filters: {}
        });

        if (!data.data || !data.data.problemsetQuestionList) {
            throw new Error('Failed to fetch problems list');
        }

        const result = data.data.problemsetQuestionList;
        total = result.total;

        for (const q of result.questions) {
            problems.push({
                id: q.questionFrontendId,
                name: q.title,
                slug: q.titleSlug,
                difficulty: q.difficulty,
                locked: q.isPaidOnly,
                tags: q.topicTags.map(t => t.slug),
                companies: q.companyTags ? q.companyTags.map(c => c.slug) : []
            });
        }

        skip += limit;
    } while (skip < total);

    return problems;
}

async function getProblemDescription(problemSlug) {
    const query = `
        query questionContent($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionId
                questionFrontendId
                title
                titleSlug
                content
                difficulty
                likes
                dislikes
                categoryTitle
                topicTags {
                    name
                    slug
                }
                companyTags {
                    name
                    slug
                }
                codeSnippets {
                    lang
                    langSlug
                    code
                }
            }
        }
    `;

    const data = await fetchFromLeetCodeAPI(query, { titleSlug: problemSlug });

    if (!data.data || !data.data.question) {
        throw new Error(`Failed to fetch problem: ${problemSlug}`);
    }

    return data.data.question;
}

async function getCodeTemplate(problemSlug, language) {
    if (!problemSlug) return null;

    const cookies = getSessionCookies();
    if (!cookies) return null;

    const query = `
        query questionEditorData($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                codeSnippets {
                    lang
                    langSlug
                    code
                }
            }
        }
    `;

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            {
                query,
                variables: { titleSlug: problemSlug },
                operationName: 'questionEditorData'
            },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookies.session};csrftoken=${cookies.csrf};`,
                    'X-CSRFToken': cookies.csrf,
                    'Content-Type': 'application/json',
                    'Origin': 'https://leetcode.com',
                    'Referer': `https://leetcode.com/problems/${problemSlug}/`
                }
            }
        );

        if (response.data && response.data.data && response.data.data.question) {
            const codeSnippets = response.data.data.question.codeSnippets;
            if (codeSnippets && Array.isArray(codeSnippets)) {
                const snippet = codeSnippets.find(s => s.langSlug === language);
                if (snippet && snippet.code) {
                    return snippet.code;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}


async function getDiscussSolution(problemId, problemSlug, language, problemPath) {
    if (!problemSlug) return { status: 'no_solution' };

    const cookies = getSessionCookies();
    if (!cookies) return { status: 'error' };

    const query = `
        query communitySolutions($questionSlug: String!, $skip: Int!, $first: Int!, $query: String, $orderBy: TopicSortingOption, $languageTags: [String!], $topicTags: [String!]) {
            questionSolutions(
                filters: {
                    questionSlug: $questionSlug
                    skip: $skip
                    first: $first
                    query: $query
                    orderBy: $orderBy
                    languageTags: $languageTags
                    topicTags: $topicTags
                }
            ) {
                solutions {
                    id
                    title
                    post {
                        id
                        content
                        voteCount
                        author {
                            username
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            {
                query,
                variables: {
                    questionSlug: problemSlug,
                    skip: 0,
                    first: 1,
                    orderBy: 'most_votes',
                    query: '',
                    languageTags: [language],
                    topicTags: []
                },
                operationName: 'communitySolutions'
            },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookies.session};csrftoken=${cookies.csrf};`,
                    'X-CSRFToken': cookies.csrf,
                    'Content-Type': 'application/json',
                    'Origin': 'https://leetcode.com',
                    'Referer': `https://leetcode.com/problems/${problemSlug}/solutions/`
                }
            }
        );

        if (response.data && response.data.data && response.data.data.questionSolutions) {
            const solutions = response.data.data.questionSolutions.solutions;
            if (solutions && solutions.length > 0) {
                const solution = solutions[0];
                const content = solution.post.content
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\'/g, "'")
                    .replace(/\\"/g, '"');
                const solutionUrl = `https://leetcode.com/problems/${problemSlug}/solutions/${solution.id}/`;
                const markdown = `# ${solution.title}\n\n**Author:** ${solution.post.author.username}\n**Votes:** ${solution.post.voteCount}\n**Link:** [${solutionUrl}](${solutionUrl})\n\n---\n\n${content}`;
                const communityImageDir = path.join(problemPath, 'solutions', 'community', language, 'images');
                const result = await downloadImageFromMarkdown(markdown, communityImageDir, './images');
                return { status: 'success', markdown: result.markdown };
            } else {
                return { status: 'no_solution' };
            }
        }
        return { status: 'no_solution' };
    } catch (error) {
        return { status: 'error' };
    }
}

async function downloadImageFromMarkdown(markdown, imageDir, relativeImagePath = './images') {
    const imgRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    const imageMap = new Map();
    let imageIndex = 0;
    let hasImages = false;

    while ((match = imgRegex.exec(markdown)) !== null) {
        const imgUrl = match[1];

        try {
            if (!hasImages) {
                await fs.ensureDir(imageDir);
                hasImages = true;
            }

            const urlParts = imgUrl.split('/');
            const urlFileName = urlParts[urlParts.length - 1];
            const ext = urlFileName.includes('.') ? urlFileName.substring(urlFileName.lastIndexOf('.')) : '.png';
            const imageName = `${imageIndex}${ext}`;
            const imagePath = path.join(imageDir, imageName);

            await retryAsync(async () => {
                const response = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
                await fs.writeFile(imagePath, response.data);
            });

            imageMap.set(imgUrl, `${relativeImagePath}/${imageName}`);
            imageIndex++;
        } catch (error) {
            imageMap.set(imgUrl, imgUrl);
        }
    }

    let processedMarkdown = markdown;
    imageMap.forEach((localPath, originalUrl) => {
        processedMarkdown = processedMarkdown.replace(
            new RegExp(`!\\[([^\\]]*)\\]\\(${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
            `![$1](${localPath})`
        );
    });

    return { markdown: processedMarkdown };
}

async function getOfficialSolution(problemSlug, problemPath) {
    if (!problemSlug) return null;

    const cookies = getSessionCookies();
    if (!cookies) return null;

    const query = `
        query questionSolution($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                solution {
                    id
                    content
                    contentTypeId
                    canSeeDetail
                    paidOnly
                    hasVideoSolution
                    paidOnlyVideo
                    rating {
                        id
                        count
                        average
                        userRating {
                            score
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            {
                query,
                variables: { titleSlug: problemSlug },
                operationName: 'questionSolution'
            },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookies.session};csrftoken=${cookies.csrf};`,
                    'X-CSRFToken': cookies.csrf,
                    'Content-Type': 'application/json',
                    'Origin': 'https://leetcode.com',
                    'Referer': `https://leetcode.com/problems/${problemSlug}/`
                }
            }
        );

        if (response.data && response.data.data && response.data.data.question && response.data.data.question.solution) {
            const content = response.data.data.question.solution.content;
            const solutionUrl = `https://leetcode.com/problems/${problemSlug}/solution/`;
            const header = `# Official Solution\n\n**Link:** [${solutionUrl}](${solutionUrl})\n\n---\n\n`;
            const fullContent = header + content;
            const officialImageDir = path.join(problemPath, 'solutions', 'official', 'images');
            const result = await downloadImageFromMarkdown(fullContent, officialImageDir, './images');
            return { markdown: result.markdown };
        }
        return null;
    } catch (error) {
        console.error(`  Warning: Failed to fetch official solution: ${error.message}`);
        return null;
    }
}

function sanitizeFolderName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getTagLink(tag) {
    return `https://leetcode.com/tag/${sanitizeFolderName(tag).toLowerCase()}`;
}

function getSubmissionLink(url) {
    return url.replace('/description/', '/submissions/');
}

function getSolutionLink(url) {
    return url.replace('/description/', '/solutions/');
}

function displayDownloadStatus(problem, status, progress = '1/1') {
    const tag = problem.tags && problem.tags.length > 0 ? problem.tags[0] : 'uncategorized';
    const tagFolder = sanitizeFolderName(tag);
    const problemName = sanitizeFolderName(problem.name).toLowerCase();
    const problemFolder = `${('0000' + problem.id).slice(-4)}_${problem.difficulty}_${problemName}`;
    const relativePath = path.join('downloads', tagFolder, problemFolder);

    const descSuccess = status.description.success;
    const templatesSuccess = status.templates.count === status.templates.total;
    const officialSuccess = status.officialSolution.count === status.officialSolution.total;
    const communitySuccess = status.communitySolutions.count === status.communitySolutions.total;

    const descInfo = descSuccess
        ? `Description: \x1b[32m1/1\x1b[0m`
        : `Description: \x1b[31m0/1\x1b[0m`;
    const templatesInfo = `Templates: ${templatesSuccess ? '\x1b[32m' : '\x1b[31m'}${status.templates.count}/${status.templates.total}\x1b[0m`;
    const officialInfo = `Official: ${officialSuccess ? '\x1b[32m' : '\x1b[31m'}${status.officialSolution.count}/${status.officialSolution.total}\x1b[0m`;
    const communityInfo = `Community: ${communitySuccess ? '\x1b[32m' : '\x1b[31m'}${status.communitySolutions.count}/${status.communitySolutions.total}\x1b[0m`;

    const allSuccess = descSuccess && templatesSuccess && officialSuccess && communitySuccess;
    const statusIcon = allSuccess ? '\x1b[32m✓\x1b[0m' : '\x1b[33m⚠\x1b[0m';
    const premiumTag = problem.locked ? '\x1b[33m[Premium]\x1b[0m' : '\x1b[90m[Free]\x1b[0m';

    console.log(`${statusIcon} \x1b[90m[\x1b[0m\x1b[36m${progress}\x1b[0m\x1b[90m]\x1b[0m ${premiumTag} ${relativePath}  ${descInfo}, ${templatesInfo}, ${officialInfo}, ${communityInfo}`);
}

async function downloadProblem(problem, outputFolder, CONFIG) {
    const downloadStatus = {
        problemId: problem.id,
        problemName: problem.name,
        description: { success: false, formats: [] },
        templates: { success: false, count: 0, total: 0, languages: [] },
        officialSolution: { success: false, count: 0, total: 0 },
        communitySolutions: { success: false, count: 0, total: 0, languages: [] },
        errors: []
    };

    const tag = problem.tags[0] || 'uncategorized';
    const tagFolder = sanitizeFolderName(tag);
    const problemName = sanitizeFolderName(problem.name).toLowerCase();
    const problemFolder = `${('0000' + problem.id).slice(-4)}_${problem.difficulty}_${problemName}`;
    const problemPath = path.join(outputFolder, tagFolder, problemFolder);

    await fs.ensureDir(problemPath);

    const relativeProblemPath = path.relative(workDir, problemPath);
    await fs.ensureDir(path.join(problemPath, 'description'));
    await fs.ensureDir(path.join(problemPath, 'templates'));
    await fs.ensureDir(path.join(problemPath, 'solutions'));

    const questionData = await retryAsync(() => getProblemDescription(problem.slug));

    if (!questionData.content) {
        const user = getUser();
        const isPremiumUser = user && user.paid;

        if (problem.locked && isPremiumUser) {
            throw new Error('SESSION_EXPIRED: Download premium content failed. Please re-login: leetcode-fetch logout && leetcode-fetch login');
        } else if (problem.locked) {
            throw new Error('Premium problem requires premium account');
        } else {
            throw new Error('SESSION_EXPIRED: Download failed. Session may have expired. Please re-login: leetcode-fetch logout && leetcode-fetch login');
        }
    }

    const url = `https://leetcode.com/problems/${problem.slug}/`;
    const category = questionData.categoryTitle || 'algorithms';
    const difficulty = questionData.difficulty;
    const likes = questionData.likes || 0;
    const dislikes = questionData.dislikes || 0;
    const bodyHtml = questionData.content;

    const availableLanguages = questionData.codeSnippets || [];
    const languageSlugs = new Set(availableLanguages.map(s => s.langSlug));

    const filteredLanguages = availableLanguages.map(snippet => ({
        name: snippet.langSlug,
        ext: LANGUAGE_EXT_MAP[snippet.langSlug] || snippet.langSlug
    }));

    if (CONFIG.formats.includes('raw')) {
        await fs.writeFile(path.join(problemPath, 'description', 'problem.raw.txt'), bodyHtml, 'utf8');
    }

    const { html: processedHtml, imageMap } = await processHtmlBody(bodyHtml, problemPath);
    const markdownBody = await convertHtmlToMarkdown(bodyHtml, imageMap);

    if (CONFIG.formats.includes('html')) {
        await saveProblemHtml({
            id: problem.id,
            name: problem.name,
            url: url,
            category,
            difficulty,
            likes,
            dislikes,
            tags: problem.tags,
            companies: problem.companies,
            body: processedHtml
        }, problemPath);
    }

    if (CONFIG.formats.includes('md')) {
        await saveProblemMarkdown({
            id: problem.id,
            name: problem.name,
            url: url,
            category,
            difficulty,
            likes,
            dislikes,
            tags: problem.tags,
            companies: problem.companies,
            body: markdownBody
        }, problemPath);
    }

    const problemSlug = problem.slug;

    if (CONFIG.fetchOfficialSolution && problemSlug) {
        downloadStatus.officialSolution.total = 1;
        const officialSolutionResult = await retryAsync(() => getOfficialSolution(problemSlug, problemPath));
        if (officialSolutionResult) {
            const officialDir = path.join(problemPath, 'solutions', 'official');
            await fs.ensureDir(officialDir);
            await fs.writeFile(
                path.join(officialDir, 'solution.md'),
                officialSolutionResult.markdown,
                'utf8'
            );
            downloadStatus.officialSolution.success = true;
            downloadStatus.officialSolution.count = 1;
        } else {
            downloadStatus.officialSolution.total = 0;
        }
    }

    downloadStatus.templates.total = filteredLanguages.length;
    downloadStatus.communitySolutions.total = filteredLanguages.length;

    if (filteredLanguages.length === 0) {
        console.log(`  No languages available for this problem`);
    } else {
        for (const lang of filteredLanguages) {
            if (CONFIG.fetchTemplates) {
                const snippet = availableLanguages.find(s => s.langSlug === lang.name);
                if (snippet && snippet.code) {
                    await fs.writeFile(
                        path.join(problemPath, 'templates', `solution.${lang.ext}`),
                        snippet.code,
                        'utf8'
                    );
                    downloadStatus.templates.count++;
                    downloadStatus.templates.languages.push(lang.name);
                }
            }

            if (CONFIG.fetchSolutions && problemSlug) {
                const solutionResult = await retryAsync(() => getDiscussSolution(problem.id, problemSlug, lang.name, problemPath));
                if (solutionResult.status === 'success') {
                    const communityLangDir = path.join(problemPath, 'solutions', 'community', lang.name);
                    await fs.ensureDir(communityLangDir);
                    await fs.writeFile(
                        path.join(communityLangDir, 'solution.md'),
                        solutionResult.markdown,
                        'utf8'
                    );
                    downloadStatus.communitySolutions.count++;
                    downloadStatus.communitySolutions.languages.push(lang.name);
                } else if (solutionResult.status === 'no_solution') {
                    downloadStatus.communitySolutions.total--;
                }
            }
        }
    }

    downloadStatus.description.success = true;
    downloadStatus.description.formats = CONFIG.formats;
    if (downloadStatus.templates.count > 0) downloadStatus.templates.success = true;
    if (downloadStatus.communitySolutions.count > 0) downloadStatus.communitySolutions.success = true;

    return downloadStatus;
}

async function processHtmlBody(html, problemPath) {
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    let match;
    const imageMap = new Map();
    let imageIndex = 0;
    let hasImages = false;
    const descriptionImageDir = path.join(problemPath, 'description', 'images');

    while ((match = imgRegex.exec(html)) !== null) {
        const imgUrl = match[1];
        let fullUrl = imgUrl;

        if (imgUrl.startsWith('/')) {
            fullUrl = `https://leetcode.com${imgUrl}`;
        }

        try {
            if (!hasImages) {
                await fs.ensureDir(descriptionImageDir);
                hasImages = true;
            }

            const urlParts = fullUrl.split('/');
            const urlFileName = urlParts[urlParts.length - 1];
            const ext = urlFileName.includes('.') ? urlFileName.substring(urlFileName.lastIndexOf('.')) : '.png';
            const imageName = `${imageIndex}${ext}`;
            const imagePath = path.join(descriptionImageDir, imageName);

            await retryAsync(async () => {
                const response = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 10000 });
                await fs.writeFile(imagePath, response.data);
            });

            imageMap.set(imgUrl, `./images/${imageName}`);
            imageIndex++;
        } catch (error) {
            imageMap.set(imgUrl, fullUrl);
        }
    }

    let processedHtml = html
        .replace(/<img[^>]+src="([^"]+)"[^>]*>/g, (_, src) => {
            const localPath = imageMap.get(src) || src;
            return `<img src="${localPath}">`;
        })
        .replace(/<pre>[\r\n]*([^]+?)[\r\n]*<\/pre>/g, '<pre><code>$1</code></pre>');

    return { html: processedHtml, imageMap };
}

async function saveProblemHtml(problem, problemPath) {
    const tagsHtml = problem.tags.length > 0
        ? problem.tags.map(t => `<a href="${getTagLink(t)}"><code>${t}</code></a>`).join(' | ')
        : '';

    const companiesHtml = problem.companies.length > 0
        ? problem.companies.map(c => `<code>${c}</code>`).join(' | ')
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${problem.id}. ${problem.name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h1 a { color: #333; text-decoration: none; }
        h1 a:hover { color: #0066cc; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { padding: 8px 12px; text-align: center; border: 1px solid #ddd; }
        th { background-color: #f6f8fa; font-weight: 600; }
        code { background-color: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.9em; }
        pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        pre code { background-color: transparent; padding: 0; white-space: pre-wrap; }
        details { margin: 10px 0; }
        summary { cursor: pointer; font-weight: 600; padding: 8px; background-color: #f6f8fa; border-radius: 3px; }
        summary:hover { background-color: #e1e4e8; }
        hr { border: none; border-top: 1px solid #eee; margin: 30px 0; }
        .links { margin-top: 20px; }
        .links a { margin-right: 20px; color: #0066cc; text-decoration: none; }
        .links a:hover { text-decoration: underline; }
        img { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <h1><a href="${problem.url}">${problem.id}. ${problem.name}</a></h1>

    <table>
        <tr>
            <th>Category</th>
            <th>Difficulty</th>
            <th>Likes</th>
            <th>Dislikes</th>
        </tr>
        <tr>
            <td>${problem.category}</td>
            <td>${problem.difficulty}</td>
            <td>${problem.likes}</td>
            <td>${problem.dislikes}</td>
        </tr>
    </table>

    ${tagsHtml ? `<details>
        <summary><strong>Tags</strong></summary>
        <p>${tagsHtml}</p>
    </details>` : ''}

    ${companiesHtml ? `<details>
        <summary><strong>Companies</strong></summary>
        <p>${companiesHtml}</p>
    </details>` : ''}

    ${problem.body}

    <hr>

    <div class="links">
        <a href="${getSubmissionLink(problem.url)}">Submissions</a>
        <a href="${getSolutionLink(problem.url)}">Solutions</a>
    </div>
</body>
</html>`;

    await fs.writeFile(path.join(problemPath, 'description', 'problem.html'), html, 'utf8');
}

async function convertHtmlToMarkdown(html, imageMap = new Map()) {
    const preBlocks = [];
    let preIndex = 0;

    let htmlWithPlaceholders = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>|<pre>([\s\S]*?)<\/pre>/g, (match, codeContent, preContent) => {
        const content = codeContent || preContent;
        const cleanContent = content
            .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '$1')
            .replace(/<em>([\s\S]*?)<\/em>/g, '$1')
            .replace(/<[^>]+>/g, '');
        const placeholder = `___PRE_BLOCK_${preIndex}___`;
        preBlocks.push('```\n' + cleanContent + '\n```');
        preIndex++;
        return placeholder;
    });

    let markdown = htmlWithPlaceholders
        .replace(/<img[^>]+src="([^"]+)"[^>]*>/g, (_, src) => {
            const localPath = imageMap.get(src) || src;
            return `![image](${localPath})`;
        })
        .replace(/<code>([\s\S]*?)<\/code>/g, (_, code) => {
            const processed = code
                .replace(/<sup>([\s\S]*?)<\/sup>/g, '^$1')
                .replace(/<sub>([\s\S]*?)<\/sub>/g, '_$1')
                .replace(/<[^>]+>/g, '');
            return '`' + processed + '`';
        })
        .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
        .replace(/<em>([\s\S]*?)<\/em>/g, '*$1*')
        .replace(/<ul[^>]*>/g, '')
        .replace(/<\/ul>/g, '')
        .replace(/<ol[^>]*>/g, '')
        .replace(/<\/ol>/g, '')
        .replace(/<li>([\s\S]*?)<\/li>/g, '- $1\n')
        .replace(/<p[^>]*>/g, '\n')
        .replace(/<\/p>/g, '\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '# $1\n')
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '## $1\n')
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '### $1\n')
        .replace(/<div[^>]*>/g, '')
        .replace(/<\/div>/g, '')
        .replace(/<span[^>]*>/g, '')
        .replace(/<\/span>/g, '')
        .replace(/<font[^>]*>/g, '')
        .replace(/<\/font>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&le;/g, '<=')
        .replace(/&ge;/g, '>=')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&times;/g, '×')
        .replace(/&divide;/g, '÷')
        .replace(/&#x([\dA-Fa-f]+);/g, (match, hex) => {
            const code = parseInt(hex, 16);
            return String.fromCharCode(code);
        })
        .replace(/&#(\d+);/g, (match, dec) => {
            const code = parseInt(dec, 10);
            return String.fromCharCode(code);
        })
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    for (let i = 0; i < preBlocks.length; i++) {
        markdown = markdown.replace(`___PRE_BLOCK_${i}___`, preBlocks[i]);
    }

    return markdown;
}

async function saveProblemMarkdown(problem, problemPath) {
    const tagsSection = problem.tags.length > 0
        ? `**Tags:** ${problem.tags.map(t => `[\`${t}\`](${getTagLink(t)})`).join(', ')}`
        : '';

    const companiesSection = problem.companies.length > 0
        ? `**Companies:** ${problem.companies.map(c => `\`${c}\``).join(', ')}`
        : '';

    const markdown = [
        `# [${problem.id}. ${problem.name}](${problem.url})`,
        '',
        `| Category | Difficulty | Likes | Dislikes |`,
        `| :------: | :--------: | :---: | :------: |`,
        `| ${problem.category} | ${problem.difficulty} | ${problem.likes} | ${problem.dislikes} |`,
        '',
        tagsSection,
        companiesSection ? '\n' + companiesSection : '',
        '',
        '## Description',
        '',
        problem.body,
        '',
        '---',
        '',
        `**Links:** [Submissions](${getSubmissionLink(problem.url)}) | [Solutions](${getSolutionLink(problem.url)})`,
        ''
    ].join('\n');

    await fs.writeFile(path.join(problemPath, 'description', 'problem.md'), markdown, 'utf8');
}

async function main(startIndex = 2, customArgs = null) {
    const CONFIG = customArgs ? parseArgs(0, customArgs) : parseArgs(startIndex);

    const sessionValid = await verifySession();
    if (!sessionValid) {
        console.log('\n\x1b[31m✗\x1b[0m Session expired or invalid');
        console.log('\x1b[2m  Please login again: leetcode-fetch logout && leetcode-fetch login\x1b[0m\n');
        process.exit(1);
    }

    console.log('\n\x1b[1mDownload Configuration\x1b[0m');
    console.log(`\x1b[2m  Languages:\x1b[0m Auto-detected from each problem`);
    console.log(`\x1b[2m  Formats:\x1b[0m ${CONFIG.formats.join(', ')}`);
    console.log(`\x1b[2m  Templates:\x1b[0m ${CONFIG.fetchTemplates ? '\x1b[32mYes\x1b[0m' : '\x1b[2mNo\x1b[0m'}`);
    console.log(`\x1b[2m  Solutions:\x1b[0m ${CONFIG.fetchSolutions ? '\x1b[32mYes\x1b[0m' : '\x1b[2mNo\x1b[0m'}`);
    console.log(`\x1b[2m  Official solutions:\x1b[0m ${CONFIG.fetchOfficialSolution ? '\x1b[32mYes\x1b[0m' : '\x1b[2mNo\x1b[0m'}`);
    if (!CONFIG.problemId) {
        console.log(`\x1b[2m  Concurrency:\x1b[0m ${CONFIG.concurrency}`);
    }
    console.log('');

    if (CONFIG.problemId) {
        const outputFolder = path.join(workDir, 'downloads');
        await fs.ensureDir(outputFolder);

        console.log(`\x1b[2m  Output folder:\x1b[0m ${outputFolder}\n`);

        console.log(`Fetching problem ${CONFIG.problemId}...`);

        try {
            const query = `
                query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
                    problemsetQuestionList: questionList(
                        categorySlug: $categorySlug
                        limit: $limit
                        skip: $skip
                        filters: $filters
                    ) {
                        questions: data {
                            questionFrontendId
                            title
                            titleSlug
                            difficulty
                            isPaidOnly
                            topicTags {
                                name
                                slug
                            }
                            companyTags {
                                name
                                slug
                            }
                        }
                    }
                }
            `;

            const data = await fetchFromLeetCodeAPI(query, {
                categorySlug: '',
                limit: 1,
                skip: 0,
                filters: { searchKeywords: CONFIG.problemId }
            });

            if (!data.data || !data.data.problemsetQuestionList || data.data.problemsetQuestionList.questions.length === 0) {
                console.log(`\x1b[31m✗\x1b[0m Problem ${CONFIG.problemId} not found\n`);
                return;
            }

            const q = data.data.problemsetQuestionList.questions[0];
            const problem = {
                id: q.questionFrontendId,
                name: q.title,
                slug: q.titleSlug,
                difficulty: q.difficulty,
                locked: q.isPaidOnly,
                tags: q.topicTags.map(t => t.slug),
                companies: q.companyTags ? q.companyTags.map(c => c.slug) : []
            };

            const user = getUser();
            const isPremiumUser = user && user.paid;

            if (problem.locked && !isPremiumUser) {
                console.log(`\x1b[33m⚠\x1b[0m  Problem is locked (premium only)`);
                console.log(`\x1b[31m✗\x1b[0m  Skipped (requires premium account)\n`);
                return;
            }

            const status = await downloadProblem(problem, outputFolder, CONFIG);
            console.log('');
            displayDownloadStatus(problem, status, '1/1');
            console.log('');
        } catch (error) {
            console.log(`\n\x1b[31m✗\x1b[0m Download failed`);
            console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
        }
        return;
    }

    const outputFolder = path.join(workDir, 'downloads');

    await fs.ensureDir(outputFolder);

    console.log(`\x1b[2m  Output folder:\x1b[0m ${outputFolder}\n`);

    const listSpinner = new Spinner('Fetching problems list');
    listSpinner.start();
    const problems = await listProblems();
    listSpinner.stop();

    const progressFilePath = path.join(outputFolder, '.download-progress.json');
    let completedProblems = new Set();
    let failedProblems = {};

    if (await fs.pathExists(progressFilePath)) {
        try {
            const progressData = await fs.readJson(progressFilePath);
            completedProblems = new Set(progressData.completed || []);
            failedProblems = progressData.failed || {};
            const failedCount = Object.keys(failedProblems).length;
            console.log(`\x1b[36m›\x1b[0m Found existing progress:`);
            console.log(`  \x1b[32m${completedProblems.size}\x1b[0m completed (will skip)`);
            if (failedCount > 0) {
                console.log(`  \x1b[33m${failedCount}\x1b[0m failed (will retry)`);
            }
            console.log('');
        } catch (error) {
            console.log(`\x1b[33m⚠\x1b[0m  Could not read progress file, starting fresh\n`);
        }
    }

    console.log(`\x1b[36m›\x1b[0m Found \x1b[1m${problems.length}\x1b[0m problems\n`);

    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let alreadyDownloaded = 0;
    let processedCount = 0;
    let shouldStop = false;

    const totalProblems = problems.length;
    const user = getUser();
    const isPremiumUser = user && user.paid;

    const problemsToDownload = [];
    for (let i = 0; i < problems.length; i++) {
        const problem = problems[i];

        if (problem.locked && !isPremiumUser) {
            const tag = problem.tags && problem.tags.length > 0 ? problem.tags[0] : 'uncategorized';
            const tagFolder = sanitizeFolderName(tag);
            const problemName = sanitizeFolderName(problem.name).toLowerCase();
            const problemFolder = `${('0000' + problem.id).slice(-4)}_${problem.difficulty}_${problemName}`;
            const relativePath = path.join('downloads', tagFolder, problemFolder);
            console.log(`\x1b[90m⊘\x1b[0m \x1b[90m[\x1b[0m\x1b[36m${i + 1}/${totalProblems}\x1b[0m\x1b[90m]\x1b[0m \x1b[33m[Premium]\x1b[0m ${relativePath}  \x1b[90mSkipped (requires premium account)\x1b[0m`);
            skipped++;
            continue;
        }

        if (completedProblems.has(problem.id)) {
            alreadyDownloaded++;
            continue;
        }

        problemsToDownload.push({ problem, index: i });
    }

    const downloadWorker = async ({ problem, index }) => {
        if (shouldStop) return;

        const progress = `${index + 1}/${totalProblems}`;

        try {
            const status = await downloadProblem(problem, outputFolder, CONFIG);

            displayDownloadStatus(problem, status, progress);

            const isFullyComplete = status.description.success &&
                (!CONFIG.fetchTemplates || status.templates.count === status.templates.total) &&
                (!CONFIG.fetchOfficialSolution || status.officialSolution.count === status.officialSolution.total) &&
                (!CONFIG.fetchSolutions || status.communitySolutions.count === status.communitySolutions.total);

            if (isFullyComplete) {
                completed++;
                completedProblems.add(problem.id);
                if (failedProblems[problem.id]) {
                    delete failedProblems[problem.id];
                }
            } else {
                failed++;
                const failureReasons = [];

                if (!status.description.success) {
                    failureReasons.push('Description download failed');
                }
                if (CONFIG.fetchTemplates && status.templates.count < status.templates.total) {
                    failureReasons.push(`Templates incomplete: ${status.templates.count}/${status.templates.total}`);
                }
                if (CONFIG.fetchOfficialSolution && status.officialSolution.count < status.officialSolution.total) {
                    failureReasons.push(`Official solution incomplete: ${status.officialSolution.count}/${status.officialSolution.total}`);
                }
                if (CONFIG.fetchSolutions && status.communitySolutions.count < status.communitySolutions.total) {
                    failureReasons.push(`Community solutions incomplete: ${status.communitySolutions.count}/${status.communitySolutions.total}`);
                }

                failedProblems[problem.id] = {
                    name: problem.name,
                    slug: problem.slug,
                    reasons: failureReasons,
                    lastAttempt: new Date().toISOString(),
                    status: {
                        description: `${status.description.success ? 1 : 0}/1`,
                        templates: `${status.templates.count}/${status.templates.total}`,
                        official: `${status.officialSolution.count}/${status.officialSolution.total}`,
                        community: `${status.communitySolutions.count}/${status.communitySolutions.total}`
                    }
                };
            }

            await fs.writeJson(progressFilePath, {
                completed: Array.from(completedProblems),
                failed: failedProblems,
                lastUpdated: new Date().toISOString()
            }, { spaces: 2 });

        } catch (error) {
            if (error.message.startsWith('SESSION_EXPIRED:')) {
                shouldStop = true;
                console.log(`\n\x1b[31m✗\x1b[0m ${error.message.replace('SESSION_EXPIRED: ', '')}`);
                console.log(`\x1b[2m  Download stopped. Progress saved. Run download again after re-login to continue.\x1b[0m\n`);

                await fs.writeJson(progressFilePath, {
                    completed: Array.from(completedProblems),
                    failed: failedProblems,
                    lastUpdated: new Date().toISOString()
                }, { spaces: 2 });

                process.exit(1);
            }

            failed++;
            failedProblems[problem.id] = {
                name: problem.name,
                slug: problem.slug,
                reasons: ['Exception: ' + error.message],
                lastAttempt: new Date().toISOString(),
                stack: error.stack
            };

            await fs.writeJson(progressFilePath, {
                completed: Array.from(completedProblems),
                failed: failedProblems,
                lastUpdated: new Date().toISOString()
            }, { spaces: 2 });
        }
    };

    for (let i = 0; i < problemsToDownload.length; i += CONFIG.concurrency) {
        const batch = problemsToDownload.slice(i, i + CONFIG.concurrency);
        await Promise.all(batch.map(downloadWorker));
        if (shouldStop) break;
    }

    console.log('\n\x1b[1mDownload Summary\x1b[0m');
    console.log(`\x1b[2m  Total:\x1b[0m ${problems.length}`);
    console.log(`\x1b[2m  Succeeded:\x1b[0m \x1b[32m${completed}\x1b[0m`);
    if (alreadyDownloaded > 0) {
        console.log(`\x1b[2m  Already downloaded:\x1b[0m \x1b[36m${alreadyDownloaded}\x1b[0m`);
    }
    if (failed > 0) {
        console.log(`\x1b[2m  Failed:\x1b[0m \x1b[31m${failed}\x1b[0m`);
        console.log(`\x1b[2m  Failed details saved in:\x1b[0m ${progressFilePath}`);
    }
    if (skipped > 0) {
        console.log(`\x1b[2m  Skipped (locked):\x1b[0m \x1b[33m${skipped}\x1b[0m`);
    }
    console.log(`\x1b[2m  Saved to:\x1b[0m ${outputFolder}\n`);
}

if (require.main === module) {
    (async () => {
        try {
            await main();
            process.exit(0);
        } catch (error) {
            console.log(`\n\x1b[31m✗\x1b[0m Download error`);
            console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
            process.exit(1);
        }
    })();
}

module.exports = {
    main
};
