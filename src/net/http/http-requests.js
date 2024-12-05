import http from 'http';
import https from 'https';
import net from 'net';
import { CustomHTTPAgent, CustomHTTPSAgent } from './http-custom-agents.js';
import { parseUrl } from '../url/parse-url.js';
import { timedPromise } from '../../time/timed-promise.js';

class HTTPRequestBuilder {
    #requestSender;
    #url;
    #method = 'GET';
    /** @type {Buffer=} */
    #body;
    /** @type {import('../../types/iana-media-type.js').IANAMediaType=} */
    #contentType;

    /**
     * 
     * @param {HTTPRequests} requestSender 
     * @param {string} url 
     */
    constructor(requestSender, url) {
        this.#requestSender = requestSender;
        this.#url = url;
    }

    /**
     * 
     * @param {string} methodName 
     */
    method(methodName) {
        this.#method = methodName;
        return this;
    }

    /**
     * @param {string} text 
     */
    bodyText(text) {
        this.#body = Buffer.from(text, 'utf-8');
        if (!this.#contentType) this.#contentType = 'text/plain';
        return this;
    }

    /**
     * @param {import('../../types/serializable.js').SerializableValue} obj 
     */
    bodyJson(obj) {
        this.#body = Buffer.from(JSON.stringify(obj), 'utf-8');
        if (!this.#contentType) this.#contentType = 'application/json';
        return this;
    }

    /**
     * @param {Buffer} buffer 
     */
    bodyBuffer(buffer) {
        this.#body = buffer;
        if (!this.#contentType) this.#contentType = 'application/octet-stream';
        return this;
    }

    /**
     * 
     * @param {import('../../types/iana-media-type.js').IANAMediaType} type 
     */
    contentType(type) {
        this.#contentType = type;
        return this;
    }

    responseBuffer() {
        return this.#requestSender.sendBuffer(this.#url, this.#method, this.#body, this.#contentType);
    }

    async responseText() {
        const resBuffer = await this.#requestSender.sendBuffer(this.#url, this.#method, this.#body, this.#contentType);
        return resBuffer.toString('utf-8');
    }

    async responseJson() {
        const resBuffer = await this.#requestSender.sendBuffer(this.#url, this.#method, this.#body, this.#contentType);
        return JSON.parse(resBuffer.toString('utf-8'));
    }
}

/**
 *  @typedef {{
 *      ms?: number,
 *      httpOptions?: http.RequestOptions | https.RequestOptions
 *  }} AdditionalRequestOptions
 */

export class HTTPRequests {
    #socketProvider;

    /** @param {((requestOptions: http.RequestOptions | https.RequestOptions) => Promise<net.Socket>)=} socketProvider */
    constructor(socketProvider) {
        this.#socketProvider = socketProvider;
    }

    /**
     * @template {'http' | 'https'} P
     * @param {P} protocol Node http/https module.
     * @param {P extends typeof https ? https.RequestOptions : http.RequestOptions} options Request options
     * @returns {Promise<(P extends typeof https ? CustomHTTPSAgent : CustomHTTPAgent) | false>}
     */
    #getAgent = async (protocol, options) => {
        if (!this.#socketProvider) return false;
        const socket = await this.#socketProvider(options);
        if (!options.hostname || !options.port) throw 'Could not create agent';
        const host = options.hostname;
        const agent = protocol === 'https' ? new CustomHTTPSAgent(socket, host) : new CustomHTTPAgent(socket);
        // @ts-ignore
        return agent;
    }

    /**
     * Send HTTPS request asynchronously.
     * 
     * ```
     * const exampleOptions = {
            hostname: 'localhost',
            port: 80,
            path: '/myendpoint',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };
    
        sendRequest(https, exampleOptions, data);
     * ```
     * 
     * @template {'http' | 'https'} P
     * @param {P} protocol Node http/https module.
     * @param {P extends typeof https ? https.RequestOptions : http.RequestOptions} options Request options
     * @param {Buffer=} data (optional) String to send in the body.
     * @param {number=} ms
     * 
     * @returns {Promise<{
     *      statusCode: number | undefined, 
     *      headers: http.IncomingHttpHeaders, 
     *      data: Buffer
     *  }>}
     */
    async sendRequest(protocol, options, data, ms) {
        if (!['http', 'https'].includes(protocol))
            throw `Unsupported protocol for HTTP request '${protocol}'.`;

        const agent = await this.#getAgent(protocol, options);
        options.agent = agent;
        return await timedPromise((resolve, reject) => {
            const req = (protocol === 'https' ? https : http).request(options, res => {
                /** @type {Buffer[]} */
                const resBuffers = [];

                res.on('data', chunk => resBuffers.push(chunk));

                res.on('end', () => {
                    if (agent) agent.destroy();
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: Buffer.concat(resBuffers)
                    });
                });
            });

            req.on('error', err => {
                if (agent) agent.destroy();
                reject(err);
            });
            if (data) req.write(data);
            req.end();
        }, ms);
    }

    /**
     * Sends a request containing text in the body and in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {string} method - The HTTP method
     * @param {Buffer=} body 
     * @param {import('../../types/iana-media-type.js').IANAMediaType=} contentType 
     * @param {AdditionalRequestOptions=} additionalOptions 
     * 
     * @returns {Promise<Buffer>} Response text
     */
    async sendBuffer(url, method, body, contentType, additionalOptions) {
        const parsedUrl = parseUrl(url);
        const query = parsedUrl.query ? ('?' + parsedUrl.query) : '';

        /** @type {http.RequestOptions}  */
        const options = {
            ...additionalOptions?.httpOptions,
            hostname: parsedUrl.host,
            port: parsedUrl.port,
            path: parsedUrl.path + query,
            method
        };
        if (body) options.headers = {
            ...options.headers,
            'Content-Type': contentType ? contentType : 'application/octet-stream',
            'Content-Length': body.byteLength
        };

        const res = await this.sendRequest(
            parsedUrl.scheme === 'https' ? 'https' : 'http',
            options,
            body,
            additionalOptions?.ms
        );
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300)
            throw `HTTP request failed with code ${res.statusCode}: ${url}`;

        return res.data;
    }

    /**
     * 
     * @param {string} url 
     */
    create(url) {
        return new HTTPRequestBuilder(this, url);
    }

    /**
     * Sends a request containing text in the body and in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {string} method - The HTTP method
     * @param {string=} text - The text to send in the body
     * @param {import('../../types/iana-media-type.js').IANAMediaType=} contentType 
     * @param {AdditionalRequestOptions=} additionalOptions
     * 
     * @returns {Promise<string>} Response text
     */
    async sendText(url, method, text, contentType, additionalOptions) {
        const res = await this.sendBuffer(
            url,
            method,
            text ? Buffer.from(text, 'utf-8') : undefined,
            contentType,
            additionalOptions);
        return res.toString('utf-8');
    }


    /**
     * Sends a POST request containing Buffer in the body and in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {Buffer=} body 
     * @param {import('../../types/iana-media-type.js').IANAMediaType=} contentType 
     * @param {AdditionalRequestOptions=} additionalOptions 
     * 
     * @returns {Promise<Buffer>} Response Buffer
     */
    postBuffer(url, body, contentType, additionalOptions) {
        return this.sendBuffer(url, 'POST', body, contentType, additionalOptions);
    }

    /**
     * Sends a GET request containing Bufferin the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {AdditionalRequestOptions=} additionalOptions 
     * 
     * @returns {Promise<Buffer>} Response Buffer
     */
    getBuffer(url, additionalOptions) {
        return this.sendBuffer(url, 'GET', undefined, undefined, additionalOptions);
    }

    /**
     * Sends a POST request containing text in the body and in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {string=} text - The text to send in the body
     * @param {AdditionalRequestOptions=} additionalOptions
     * 
     * @returns {Promise<string>} Response text
     */
    postText(url, text, additionalOptions) {
        return this.sendText(url, 'POST', text, 'text/plain', additionalOptions);
    }

    /**
     * Sends a GET request containing text in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {AdditionalRequestOptions=} additionalOptions
     * 
     * @returns {Promise<string>} Response text
     */
    getText(url, additionalOptions) {
        return this.sendText(url, 'GET', undefined, undefined, additionalOptions);
    }
    /**
     * Sends a POST request containing JSON in the body and in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {*=} obj - The object to serialize and send in the body
     * @param {AdditionalRequestOptions=} additionalOptions
     * 
     * @returns {Promise<any>} Parsed JSON response
     */
    async postJson(url, obj, additionalOptions) {
        const jsonData = obj ? JSON.stringify(obj) : undefined;
        const textRes = await this.sendText(url, 'POST', jsonData, 'application/json', additionalOptions);
        try {
            return JSON.parse(textRes);
        } catch (err) {
            return textRes;
        }
    }

    /**
     * Sends a GET request containing JSON in the response.
     * 
     * @param {string} url - A string containing the URL
     * @param {AdditionalRequestOptions=} additionalOptions
     * 
     * @returns Parsed JSON response
     */
    async getJson(url, additionalOptions) {
        return JSON.parse(await this.sendText(url, 'GET', undefined, undefined, additionalOptions));
    }
}

export const requests = new HTTPRequests();