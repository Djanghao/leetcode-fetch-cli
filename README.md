# leetcode-fetch-cli

CLI tool to batch download LeetCode problems with solutions using leetcode's GraphQL endpoint. Languages are automatically detected for each problem.

## Features

- Download problem descriptions (HTML, Markdown, Raw)
- Auto-detect available languages for each problem
- Download code templates for all available languages
- Download community solutions (top voted, filtered by language)
- Download official solutions
- Automatic image downloading


## Installation

### Global Installation (Recommended)

```bash
npm install -g leetcode-fetch-cli
```

After installation, the `leetcode-fetch` command will be available globally.

### Using npx (No Installation Required)

```bash
npx leetcode-fetch-cli <command>
```

### Local Development

```bash
git clone https://github.com/Djanghao/leetcode-fetch-cli.git
cd leetcode-fetch-cli
npm install
npm link
```

## Usage

### 1. Login

```bash
leetcode-fetch login
```

The tool will automatically open your browser for LeetCode authentication:
1. Browser opens to LeetCode authorization page
2. Log in to your LeetCode account (if not already logged in)
3. Authorize the application
4. Session is automatically saved

### 2. Download Problems

#### Download All Problems

```bash
leetcode-fetch download
```

#### Download Specific Problem

```bash
leetcode-fetch download 1
```

#### Download with Custom Formats

```bash
leetcode-fetch download -f html,md
```

#### Download Without Templates or Solutions

```bash
leetcode-fetch download --no-templates
leetcode-fetch download --no-solutions --no-official
```

#### Download with Custom Concurrency

```bash
leetcode-fetch download -c 10
leetcode-fetch download --concurrency 20
```

#### Download Specific Problem with Options

```bash
leetcode-fetch download 1 -f md --no-templates
```

### 3. Check Status

```bash
leetcode-fetch status
```

### 4. Export Problems

Export downloaded problems with filtering options.

#### Export with Specific Language

```bash
leetcode-fetch export -o ./my-problems -l python3
```

#### Export Multiple Languages

```bash
leetcode-fetch export -o ./export -l python3,cpp,javascript
```

#### Export with HTML Format

```bash
leetcode-fetch export -o ./export -l python3 -f html
```

#### Export with Official Solutions

```bash
leetcode-fetch export -o ./my-problems -l python3,cpp -f md --official
```

#### Export All Languages (Default)

```bash
leetcode-fetch export -o ./export
```

### 5. Logout

```bash
leetcode-fetch logout
```

## Common Use Cases

### Download Everything (Default)

```bash
leetcode-fetch download
```

Downloads all problems with all available languages, all formats, templates, and solutions.

### Markdown Only (Save Space)

```bash
leetcode-fetch download -f md
```

Downloads only markdown descriptions, useful for saving disk space.

### Templates Only (For Practice)

```bash
leetcode-fetch download --no-solutions --no-official
```

Downloads only problem descriptions and code templates, ideal for practice.

## Output Structure

```
downloads/
├── .download-progress.json    # Resume progress tracking
├── array/                     # Organized by problem tags
│   ├── 0001_Easy_two-sum/
│   │   ├── description/
│   │   │   ├── problem.html
│   │   │   ├── problem.md
│   │   │   ├── problem.raw.txt
│   │   │   └── images/        # Description images
│   │   │       ├── 0.jpg
│   │   │       └── 1.jpg
│   │   ├── templates/         # All available languages for this problem
│   │   │   ├── solution.py
│   │   │   ├── solution.js
│   │   │   ├── solution.cpp
│   │   │   └── ...
│   │   └── solutions/
│   │       ├── official/
│   │       │   ├── solution.md
│   │       │   └── images/    # Official solution images
│   │       │       └── 0.png
│   │       └── community/     # Top voted solution per language
│   │           ├── python3/
│   │           │   ├── solution.md
│   │           │   └── images/
│   │           │       └── 0.jpeg
│   │           ├── javascript/
│   │           │   └── solution.md
│   │           └── ...
└── ...
├── database/                  # Database problems
│   ├── 1280_Easy_students-and-examinations/
│   │   ├── templates/
│   │   │   ├── solution.sql
│   │   │   ├── solution.mssql.sql
│   │   │   ├── solution.pgsql.sql
│   │   │   ├── solution.oracle.sql
│   │   │   └── solution.pandas.py
│   │   └── ...
└── ...
```

## Download Progress

The tool shows real-time progress and resumes interrupted downloads:

```
[1/3682] downloads/array/0001_Easy_two-sum  Description: 1/1, Templates: 19/19, Official: 1/1, Community: 19/19
[2/3682] downloads/database/1280_Easy_students-and-examinations  Description: 1/1, Templates: 5/5, Official: 1/1, Community: 5/5
```

If errors occur, they're logged to `downloads/error.log`. Progress is saved to `.download-progress.json` for resuming.

## Options Reference

### Commands

```
COMMANDS
  login             Authenticate with LeetCode
  logout            Clear authentication session
  status            Check authentication status
  download [id]     Download problems (optionally specify problem ID)
  export            Export downloaded problems with filtering
```

### Download Options

```
DOWNLOAD OPTIONS
  [id]              Download specific problem by ID (optional)
  -f, --formats     Comma-separated formats: html,md,raw (default: all)
  --no-templates    Skip downloading code templates
  --no-solutions    Skip downloading community solutions
  --no-official     Skip downloading official solutions
  -c, --concurrency Number of concurrent downloads (default: 5)
  -h, --help        Show help message
```

### Export Options

```
EXPORT OPTIONS
  -o, --output <path>       Destination folder (required)
  -l, --languages <langs>   Languages to export (comma-separated)
                            Example: python3,cpp,javascript
                            Default: all available languages
  -f, --format <format>     Description format: html, md, or raw
                            Default: md
  --official               Include official solutions
  -h, --help               Show help message
```

**Note**: Languages are automatically detected from each problem. Algorithm problems usually have 19 languages, database problems usually have 5 languages (SQL dialects + Pandas), and shell problems have Bash.

## Examples

### Download Examples

```bash
# Quick start
leetcode-fetch login
leetcode-fetch download

# Download specific problem
leetcode-fetch download 1

# Download all problems, markdown only
leetcode-fetch download -f md

# Download templates only (for practice)
leetcode-fetch download --no-solutions --no-official

# Download with 10 concurrent downloads
leetcode-fetch download -c 10

# Download specific problem with custom options
leetcode-fetch download 1 -f md --no-templates
```

### Export Examples

```bash
# Export Python problems with markdown format
leetcode-fetch export -o ./my-problems -l python3

# Export multiple languages with HTML
leetcode-fetch export -o ./export -l python3,cpp,javascript -f html

# Export with official solutions
leetcode-fetch export -o ./export -l python3,cpp -f md --official

# Export all languages (default)
leetcode-fetch export -o ./all-problems

# Export single language for practice
leetcode-fetch export -o ./python-only -l python3 -f md
```

### Other Examples

```bash
# Check authentication
leetcode-fetch status

# Logout
leetcode-fetch logout
```

## Requirements

- Node.js >= 14.0.0
- LeetCode account

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Repository

https://github.com/Djanghao/leetcode-fetch-cli

## Issues

https://github.com/Djanghao/leetcode-fetch-cli/issues

## NPM Package

https://www.npmjs.com/package/leetcode-fetch-cli
