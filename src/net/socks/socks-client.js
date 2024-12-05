import { netDnsLookup } from '../dns/net-dns-lookup.js';
import { timedPromise } from '../../time/timed-promise.js';
import net from 'net';
import dns from 'dns';
import { HTTPRequests } from '../http/http-requests.js';
import { parseUrl } from '../url/parse-url.js';

/**
 * 
 * @param {string} str 
 */
const stringToIP4 = (str) => {
    const ip4split = str.split('.');
    if (ip4split.length !== 4) return null;
    const ip4numbers = ip4split.map(n => Number.parseInt(n)).filter(n => (n >= 0) && (n < 256))
    if (ip4numbers.length !== 4) return null;
    return ip4numbers;
}

/**
 * 
 * @param {string} str 
 */
const stringToIP6 = (str) => {
    if (!str.startsWith('[') || !str.endsWith(']') || (str.split(':').length !== 8))
        return null;
    const ip6numbers = str.split('[')[1].split(']')[0].split(':').map(n => Number.parseInt(n, 16));
    if (ip6numbers.length !== 4) return null;
    return ip6numbers;
}

export class SOCKSClient {
    /** @type {boolean=} */
    #systemDns;
    /** @type {string} */
    #socksURL;
    /** @type {net.Socket=} */
    #socket;
    /** @type {SOCKSClient=} */
    #parent;
    /** @type {boolean} */
    #socksConnected = false;
    /** @type {boolean} */
    #hostConnected = false;
    /** @type {HTTPRequests=} */
    #httpRequests;

    /**
     * 
     * @param {string} url 
     * @param 
     *  {{ 
     *      systemDns?: boolean
     *  }} options 
     */
    constructor(url, options = {}) {
        this.#socksURL = url;
        this.#systemDns = options.systemDns;
    }

    /**
     * 
     * @param {string[]} urls 
     * @param 
     *  {{ 
     *      systemDns?: boolean
     *  }} options 
     * @returns {SOCKSClient}
     */
    static createChain(urls, options = {}) {
        let lastClient;
        let firstClient;
        for (let url of urls) {
            let nextClient = new SOCKSClient(url, options);
            if (!firstClient) firstClient = nextClient;
            if (lastClient) lastClient.setParent(nextClient);
            lastClient = nextClient;
        }
        if (!firstClient) throw 'Cannot create empty chain';
        return firstClient;
    }

    /**
     * Creates a new HTTPRequests object attached to this SOCKS client.
     */
    httpRequests() {
        if (!this.#httpRequests) {
            this.#httpRequests = new HTTPRequests(async options => {
                if (this.#hostConnected) throw 'Cannot use this SOCKS client for a new HTTP request.';
                if (!this.#socksConnected) await this.connectSOCKS();
                await this.connectHost(`http://${options.hostname}:${options.port}/`);
                const socket = this.getSocket();
                if (!socket) throw 'Could not get SOCKS socket while making HTTP request.';
                return socket;
            })
        }
        return this.#httpRequests;
    }

    /**
     * 
     * @param {net.Socket} socket 
     * @returns 
     */
    setSocket(socket) {
        if (this.#socket || this.#parent) return false;
        this.#socket = socket;
        return true;
    }

    /**
     * 
     * @param {SOCKSClient} parent
     */
    setParent(parent) {
        if (this.#socket || this.#parent) return false;
        this.#parent = parent;
        return true;
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    async connectSOCKS() {
        if (this.#socksConnected) return false;

        if (this.#parent) {
            await this.#parent.connectSOCKS();
            await this.#parent.connectHost(this.#socksURL);
            this.#socket = this.#parent.getSocket();
            if (!this.#socket) throw 'Could not get SOCKS socket from parent.';
        } else if (!this.#socket) {
            this.#socket = new net.Socket();
            const { host, port } = parseUrl(this.#socksURL);
            const socketOptions = {
                port,
                host,
                lookup: this.#systemDns ? dns.lookup : netDnsLookup
            };
            this.#socket.on('error', () => this.close());
            // @ts-ignore
            await timedPromise(resolve => this.#socket.connect(socketOptions, () => resolve(undefined)));
        }
        this.#socket.on('end', () => this.close());
        this.#socket.on('close', () => this.close());

        const helloBuffer = Buffer.alloc(3);
        helloBuffer.writeUInt8(5);      // version
        helloBuffer.writeUInt8(1, 1);   // num methods
        helloBuffer.writeUInt8(0, 2);   // methods

        this.#socket.write(helloBuffer);
        return await timedPromise((resolve, reject) => {
            // @ts-ignore
            this.#socket.once('data', data => {
                const ver = data.readUInt8();
                const method = data.readUInt8(1);
                if ((ver === 5) && (method === 0)) {
                    this.#socksConnected = true;
                    resolve(true);
                } else reject('Unsupported version or method');
            });
        });
    }

    /**
     * 
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    async connectHost(url) {
        if (this.#hostConnected || !this.#socksConnected || !this.#socket) return false;

        const { host, port } = parseUrl(url);
        if (!port) throw 'SOCKS client could not extract port from url.';

        const verCmdRsvBuffer = Buffer.from([5, 1, 0]);
        const portBuffer = Buffer.alloc(2);
        portBuffer.writeUint16BE(port);
        let addrBuffer;
        const ip4 = stringToIP4(host);
        const ip6 = stringToIP6(host);
        if (ip4) addrBuffer = Buffer.from([1, ...ip4]);
        else if (ip6) addrBuffer = Buffer.from([4, ...ip6]);
        else {
            addrBuffer = Buffer.alloc(host.length + 2);
            addrBuffer.writeUint8(3);
            addrBuffer.writeUint8(host.length, 1);
            addrBuffer.write(host, 2, 'utf-8');
        }

        const requestBuffer = Buffer.concat([verCmdRsvBuffer, addrBuffer, portBuffer]);
        this.#socket.write(requestBuffer);
        return await timedPromise((resolve, reject) => {
            // @ts-ignore
            this.#socket.once('data', data => {
                if (data.readUInt8(1) === 0) {
                    this.#hostConnected = true;
                    resolve(true);
                } else reject(`Connection to host (${url}) rejected by server`);
            });
        });
    }

    getSocket() { return this.#socket; }
    socksConnected() { return this.#socksConnected }
    hostConnected() { return this.#hostConnected }

    close() {
        if (this.#socket) this.#socket.destroy();
        this.#socket = undefined;
        this.#socksConnected = false;
        this.#hostConnected = false;
    }
}