/** @type {Object<string, number>} */
const SCHEME_PORT_MAP = {
    'ftp': 21,
    'ssh': 22,
    'telnet': 23,
    'smtp': 25,
    'whois': 43,
    'dns': 53,
    'http': 80,
    'ws': 80,
    'pop2': 109,
    'pop3': 110,
    'ntp': 123,
    'imap': 143,
    'https': 443,
    'wss': 443,
    'ftps': 990,
    'imaps': 993,
    'pop3s': 995,
    'socks': 1080,
    'socks4': 1080,
    'socks5': 1080
}

/**
 * 
 * @typedef {{
 *      scheme: string,
 *      userinfo: string,
 *      host: string,
 *      port: number,
 *      path: string,
 *      query: string,
 *      fragment: string
 *  }} ParsedURL
 */

/**
 * @param {string} url 
 * @returns {ParsedURL}
 */
export const parseUrl = (url) => {
    try {
        // https://www.rfc-editor.org/rfc/rfc3986#appendix-B
        const regex = RegExp(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/g);
        const regexRes = [...url.matchAll(regex)][0];
        const scheme = regexRes[2] ? regexRes[2] : '';
        let authority = regexRes[4];
        let path = regexRes[5] ? regexRes[5] : '/';
        const query = regexRes[7] ? regexRes[7] : '';
        const fragment = regexRes[9] ? regexRes[9] : '';

        const userinfo = authority.includes('@') ? authority.split('@')[0] : '';
        if (userinfo) authority = authority.substring(userinfo.length + 1);

        let host;
        if (authority.startsWith('[')) {
            host = authority.split('[')[1].split(']')[0];
            authority = authority.substring(host.length + 2);
        }
        const portSplit = authority.split(':');
        if (!host) host = portSplit[0];

        let port = portSplit[1] ? Number.parseInt(portSplit[1]) : undefined;
        if (!port) port = SCHEME_PORT_MAP[scheme.toLowerCase()];

        return {
            scheme,
            userinfo,
            host,
            port,
            path,
            query,
            fragment
        }
    } catch (err) {
        throw 'Could not parse URL:\n' + err;
    }
}

/**
 * 
 * @param {string} query 
 */
export const parseQuery = (query) => {
    const queryRegex = new RegExp(/([^=]*)=([^&]*)&?/g);
    /** @type {Object<string, string>} */
    const queryParams = {};
    for (const match of query.matchAll(queryRegex)) {
        const key = match[1];
        if (key) queryParams[key] = match[2];
    }
    return queryParams;
}