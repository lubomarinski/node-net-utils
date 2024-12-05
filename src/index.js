// Net / HTTP
import { requests } from './net/http/http-requests.js';
const HTTP = {
    requests
};
// Net / DNS
import { netDnsLookup } from './net/dns/net-dns-lookup.js';
const DNS = {
    netDnsLookup
};
// Net / SOCKS
import { SOCKSServer } from './net/socks/socks-server.js';
import { SOCKSClient } from './net/socks/socks-client.js';
const SOCKS = {
    SOCKSClient,
    SOCKSServer
};
// Net / URL
import { parseUrl, parseQuery } from './net/url/parse-url.js';
const URL = {
    parseUrl,
    parseQuery
};

export default {
    HTTP,
    DNS,
    SOCKS,
    URL
};