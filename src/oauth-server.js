/**
 * @file oauth-server.js
 * @description Local HTTP server for OAuth callback handling
 * @author Houston Zhang
 * @date 2025-12-04
 */

const http = require('http');
const url = require('url');

function startOAuthServer(port = 8000) {
    return new Promise((resolve, reject) => {
        let server;
        const connections = new Set();

        const timeout = setTimeout(() => {
            if (server) {
                connections.forEach(conn => conn.destroy());
                server.close();
            }
            reject(new Error('Authentication timeout after 5 minutes'));
        }, 5 * 60 * 1000);

        server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);

            if (parsedUrl.pathname === '/callback') {
                let cookie = parsedUrl.query.cookie;

                if (cookie && cookie.startsWith('LEETCODE_SESSION=')) {
                    cookie = cookie.substring('LEETCODE_SESSION='.length);
                }

                if (cookie) {
                    res.writeHead(302, {
                        'Location': 'https://leetcode.com',
                        'Content-Type': 'text/plain'
                    });
                    res.end('Redirecting...');

                    clearTimeout(timeout);
                    setTimeout(() => {
                        connections.forEach(conn => conn.destroy());
                        server.close(() => {
                            resolve(cookie);
                        });
                    }, 100);
                } else {
                    res.writeHead(302, {
                        'Location': 'https://leetcode.com',
                        'Content-Type': 'text/plain'
                    });
                    res.end('Redirecting...');

                    clearTimeout(timeout);
                    setTimeout(() => {
                        connections.forEach(conn => conn.destroy());
                        server.close(() => {
                            reject(new Error('No cookie received from LeetCode'));
                        });
                    }, 100);
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.on('connection', (conn) => {
            connections.add(conn);
            conn.on('close', () => {
                connections.delete(conn);
            });
        });

        server.on('error', (err) => {
            clearTimeout(timeout);
            if (err.code === 'EADDRINUSE') {
                reject(new Error(`Port ${port} is already in use. Please close other applications using this port.`));
            } else {
                reject(err);
            }
        });

        server.listen(port, '127.0.0.1', () => {
        });
    });
}

module.exports = { startOAuthServer };
