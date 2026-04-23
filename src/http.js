const http = require('http');
const https = require('https');

function getClientForUrl(url) {
  return url.protocol === 'https:' ? https : http;
}

function formatErrorBody(raw) {
  const body = String(raw || '').trim();
  if (!body) {
    return 'No response body returned.';
  }

  return body.length > 500 ? `${body.slice(0, 500)}...` : body;
}

function requestJson(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : null;
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const request = getClientForUrl(url).request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search || ''}`,
        method,
        headers,
        timeout: options.timeoutMs || 120000
      },
      response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          raw += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
            reject(new Error(`Request failed with ${response.statusCode}: ${formatErrorBody(raw)}`));
            return;
          }

          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(new Error(`Unable to parse JSON response: ${error.message}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('The request timed out.'));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

module.exports = {
  requestJson
};
