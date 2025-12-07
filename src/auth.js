/**
 * @file auth.js
 * @description Authentication module for LeetCode login/logout
 * @author Houston Zhang
 * @date 2025-12-04
 */

const { spawn } = require('child_process');
const { startOAuthServer } = require('./oauth-server');
const { clearSession, getUser, isLoggedIn, saveSession } = require('./session');
const axios = require('axios');

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

    succeed(message) {
        this.stop(true);
        console.log(`\x1b[32m✓\x1b[0m ${message}`);
    }

    fail(message) {
        this.stop(true);
        console.log(`\x1b[31m✗\x1b[0m ${message}`);
    }

    info(message) {
        this.stop(true);
        console.log(`\x1b[36m›\x1b[0m ${message}`);
    }
}

function openBrowser(url) {
    const platform = process.platform;
    let command;

    if (platform === 'darwin') {
        command = 'open';
    } else if (platform === 'win32') {
        command = 'start';
    } else {
        command = 'xdg-open';
    }

    spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
}

async function verifyUserWithCookie(cookie) {
    const query = `
        query globalData {
            userStatus {
                isPremium
                isVerified
                username
                avatar
                isSignedIn
            }
        }
    `;

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            {
                query,
                variables: {}
            },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookie}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        if (response.data && response.data.data && response.data.data.userStatus) {
            const userStatus = response.data.data.userStatus;
            if (userStatus.isSignedIn && userStatus.username) {
                const setCookieHeader = response.headers['set-cookie'];
                let csrfToken = '';

                if (setCookieHeader) {
                    const csrfCookie = setCookieHeader.find(c => c.includes('csrftoken='));
                    if (csrfCookie) {
                        const match = csrfCookie.match(/csrftoken=([^;]+)/);
                        if (match) {
                            csrfToken = match[1];
                        }
                    }
                }

                return {
                    name: userStatus.username,
                    paid: userStatus.isPremium || false,
                    sessionId: cookie,
                    sessionCSRF: csrfToken
                };
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function login() {
    const spinner = new Spinner('Waiting for authentication');

    try {
        if (isLoggedIn()) {
            const user = getUser();
            console.log(`\n\x1b[32m✓\x1b[0m Already logged in as \x1b[36m${user.name}\x1b[0m`);
            console.log(`\x1b[2m  Use "leetcode-fetch logout" to switch accounts\x1b[0m\n`);
            return true;
        }

        const PORT = 8000;
        const authUrl = `https://leetcode.com/authorize-login/http/?path=localhost:${PORT}/callback`;

        console.log('\n\x1b[1mLeetCode Authentication\x1b[0m\n');
        console.log(`\x1b[36m›\x1b[0m Opening browser...`);

        openBrowser(authUrl);

        spinner.start();
        const cookie = await startOAuthServer(PORT);
        spinner.stop();

        const verifySpinner = new Spinner('Verifying credentials');
        verifySpinner.start();
        const userData = await verifyUserWithCookie(cookie);
        verifySpinner.stop();

        if (userData) {
            saveSession(userData);
            console.log(`\x1b[32m✓\x1b[0m \x1b[1mAuthentication successful\x1b[0m`);
            console.log(`\x1b[2m  Logged in as\x1b[0m \x1b[36m${userData.name}\x1b[0m`);
            console.log(`\x1b[2m  Account type:\x1b[0m ${userData.paid ? '\x1b[33mPremium\x1b[0m' : '\x1b[2mFree\x1b[0m'}\n`);
            return true;
        } else {
            console.log(`\x1b[31m✗\x1b[0m Authentication failed`);
            console.log(`\x1b[2m  Could not verify credentials\x1b[0m\n`);
            return false;
        }
    } catch (error) {
        spinner.stop();
        console.log(`\x1b[31m✗\x1b[0m Authentication error`);
        console.log(`\x1b[2m  ${error.message}\x1b[0m\n`);
        return false;
    }
}

async function logout() {
    try {
        if (!isLoggedIn()) {
            console.log('\n\x1b[2m✓ Not currently logged in\x1b[0m\n');
            return true;
        }

        const user = getUser();

        clearSession();

        console.log(`\n\x1b[32m✓\x1b[0m \x1b[1mLogged out successfully\x1b[0m`);
        console.log(`\x1b[2m  User: ${user.name}\x1b[0m\n`);
        return true;
    } catch (error) {
        console.error(`\n\x1b[31m✗\x1b[0m Logout error`);
        console.error(`\x1b[2m  ${error.message}\x1b[0m\n`);
        clearSession();
        return false;
    }
}

function status() {
    if (!isLoggedIn()) {
        console.log('\n\x1b[2m› Not logged in\x1b[0m');
        console.log('\x1b[2m  Run "leetcode-fetch login" to authenticate\x1b[0m\n');
        return false;
    }

    const user = getUser();
    console.log('\n\x1b[1mAuthentication Status\x1b[0m');
    console.log(`\x1b[2m  User:\x1b[0m \x1b[36m${user.name}\x1b[0m`);
    console.log(`\x1b[2m  Account:\x1b[0m ${user.paid ? '\x1b[33mPremium\x1b[0m' : '\x1b[2mFree\x1b[0m'}\n`);
    return true;
}

if (require.main === module) {
    const command = process.argv[2];

    (async () => {
        try {
            let success = false;
            switch (command) {
                case 'login':
                    success = await login();
                    break;
                case 'logout':
                    success = await logout();
                    break;
                case 'status':
                    success = status();
                    break;
                default:
                    console.error('Invalid command. Use: login, logout, or status');
                    process.exit(1);
            }
            process.exit(success ? 0 : 1);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    login,
    logout,
    status,
    isLoggedIn
};
