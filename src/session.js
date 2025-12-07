/**
 * @file session.js
 * @description Session management for LeetCode authentication
 * @author Houston Zhang
 * @date 2025-12-04
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const SESSION_FILE = path.join(os.homedir(), '.lc', 'leetcode', 'user.json');

function getSessionCookies() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return null;
        }

        const userData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

        if (!userData.sessionId || !userData.sessionCSRF) {
            return null;
        }

        return {
            session: userData.sessionId,
            csrf: userData.sessionCSRF
        };
    } catch (error) {
        console.error('Warning: Could not read session cookies:', error.message);
        return null;
    }
}

function saveSession(data) {
    try {
        const sessionDir = path.dirname(SESSION_FILE);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving session:', error.message);
        return false;
    }
}

function clearSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
        }
        return true;
    } catch (error) {
        console.error('Error clearing session:', error.message);
        return false;
    }
}

function getUser() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return null;
        }

        const userData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        return {
            name: userData.name || 'Unknown',
            paid: userData.paid || false
        };
    } catch (error) {
        console.error('Error reading user data:', error.message);
        return null;
    }
}

function isLoggedIn() {
    return fs.existsSync(SESSION_FILE) && getSessionCookies() !== null;
}

async function verifySession() {
    const cookies = getSessionCookies();
    if (!cookies) {
        return false;
    }

    const query = `
        query globalData {
            userStatus {
                isSignedIn
                username
            }
        }
    `;

    try {
        const response = await axios.post(
            'https://leetcode.com/graphql',
            { query, variables: {} },
            {
                headers: {
                    'Cookie': `LEETCODE_SESSION=${cookies.session};csrftoken=${cookies.csrf};`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000
            }
        );

        if (response.data && response.data.data && response.data.data.userStatus) {
            return response.data.data.userStatus.isSignedIn === true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

module.exports = {
    getSessionCookies,
    saveSession,
    clearSession,
    getUser,
    isLoggedIn,
    verifySession
};
