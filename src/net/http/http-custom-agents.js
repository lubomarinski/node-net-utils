import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';

export class CustomHTTPAgent extends http.Agent {
    #customSocket;
    /** 
     * @param {net.Socket} customSocket 
     * @param {http.AgentOptions=} options
     */
    constructor(customSocket, options) {
        super(options);
        this.#customSocket = customSocket;
    }

    destroy() {
        this.#customSocket.end();
        this.#customSocket.destroy();
        super.destroy();
    }
    /** @type {net.createConnection} */
    createConnection() { return this.#customSocket };
}

export class CustomHTTPSAgent extends https.Agent {
    #customSocket;
    #customHost;
    /** 
     * @param {net.Socket} customSocket
     * @param {string} host 
     * @param {https.AgentOptions=} options
     */
    constructor(customSocket, host, options) {
        super(options);
        this.#customSocket = customSocket;
        this.#customHost = host;
    }

    destroy() {
        this.#customSocket.end();
        this.#customSocket.destroy();
        super.destroy();
    }
    /** @type {net.createConnection} */
    createConnection = () => {
        const tlsSocket = tls.connect({
            socket: this.#customSocket,
            host: this.#customHost,
            servername: this.#customHost
        });
        return tlsSocket;
    }
}