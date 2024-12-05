import { netDnsLookup } from "../dns/net-dns-lookup.js";
import { timedPromise } from '../../time/timed-promise.js';
import net from 'net';
import dns from 'dns';
import { SOCKSClient } from "./socks-client.js";
import EventEmitter from "events";

/**
 * A SOCKS 5 server as described in [RFC1928](https://datatracker.ietf.org/doc/html/rfc1928)
 * 
 * Currently supports only **SOCKS 5** with **no authentication required.**
 */
export class SOCKSServer extends EventEmitter {
    #port = 1080;
    /** @type {net.Server=} */
    #socketServer;
    /** @type {boolean=} */
    #systemDns;
    /** @type {string[]?} */
    #forwardChain;

    /**
     * 
     * @param {number} port 
     * @param 
     *  {{ 
     *      systemDns?: boolean,
     *      forwardChain?: string[]
     *  }} options 
     */
    constructor(port = 1080, options = {}) {
        super();
        this.#port = port;
        this.#systemDns = options.systemDns;
        this.#forwardChain = options.forwardChain ? options.forwardChain : null;
    }

    /**
     * 
     * @param {string[]?} forwardChain 
     */
    setForwardChain(forwardChain) {
        this.#forwardChain = JSON.parse(JSON.stringify(forwardChain));
    }

    /**
     * 
     * @param {net.Socket} clientSocket 
     * @param {Buffer} data
     */
    #handleClientHello(clientSocket, data) {
        const ver = data.readUInt8();
        const nMethods = data.readUInt8(1);
        const methods = data.readUInt8(2);

        if (ver !== 5) throw 'Unsupported SOCKS version';
        if (nMethods !== 1) throw 'Unsupported number of methods';
        if (methods !== 0) throw 'Unsupported methods';

        const handshakeResBuffer = Buffer.alloc(2);
        handshakeResBuffer.writeInt8(5);
        handshakeResBuffer.writeInt8(0, 1);

        clientSocket.write(handshakeResBuffer);
    }

    /**
     * 
     * @param {net.Socket} clientSocket 
     * @param {Buffer} data
     */
    #handleClientRequest(clientSocket, data) {
        const resBuffer = Buffer.from(data);

        //const ver = data.readUInt8();
        const cmd = data.readUInt8(1);
        if (cmd !== 1) {
            resBuffer.writeUint8(7, 1); // Command not supported
            clientSocket.write(resBuffer);
            clientSocket.end();
            return;
        }
        // 1 reserved after CMD
        const addressType = data.readUInt8(3);
        let dstAddress;
        if (addressType === 1) dstAddress = (new Array(4)).fill(0).map((_, i) => data.readUInt8(4 + i)).join('.');
        else if (addressType === 3) dstAddress = data.toString('utf-8', 5, data.length - 2);
        else if (addressType === 4) dstAddress = (new Array(16)).fill(0).map((_, i) => data.readUInt8(4 + i)).join(':');
        else {
            resBuffer.writeUint8(8, 1); // Address type not supported
            clientSocket.write(resBuffer);
            clientSocket.end();
            return;
        }
        const dstPort = data.readUint16BE(data.length - 2);

        this.emit('request', clientSocket, dstAddress, dstPort);

        let socketPromise;
        if (this.#forwardChain) socketPromise = this.#chainSocketProvider(dstAddress, dstPort, this.#forwardChain);
        else socketPromise = this.#defaultSocketProvider(dstAddress, dstPort);

        socketPromise.then(serverSocket => {
            serverSocket.on('error', () => clientSocket.destroy());
            serverSocket.on('close', () => {
                clientSocket.end();
                clientSocket.destroy()}
            );
            serverSocket.on('end', () => {
                clientSocket.end();
                clientSocket.destroy()}
            );
            clientSocket.on('error', () => serverSocket.destroy());
            clientSocket.on('close', () => {
                serverSocket.end();
                serverSocket.destroy()}
            );
            clientSocket.on('end', () => {
                serverSocket.end();
                serverSocket.destroy()}
            );

            resBuffer.writeUint8(0, 1); // succeeded
            clientSocket.write(resBuffer);
            serverSocket.pipe(clientSocket, { end: true });
            clientSocket.pipe(serverSocket, { end: true });
        }).catch(err => {
            resBuffer.writeUint8(1, 1); // General SOCKS server failure
            clientSocket.write(resBuffer);
            clientSocket.end();
            clientSocket.destroy();
        });
    }

    /**
     * 
     * @param {string} host 
     * @param {number} port 
     * @returns {Promise<net.Socket>}
     */
    #defaultSocketProvider(host, port) {
        return timedPromise((resolve, reject) => {
            const socket = new net.Socket();
            socket.on('error', err => {
                socket.destroy();
                reject(err);
            });
            const socketOptions = {
                port,
                host,
                lookup: this.#systemDns ? dns.lookup : netDnsLookup
            };
            socket.connect(socketOptions, () => resolve(socket));
        });
    }

    /**
     * 
     * @param {string} host 
     * @param {number} port 
     * @param {string[]} forwardChain 
     * @returns {Promise<net.Socket>}
     */
    async #chainSocketProvider(host, port, forwardChain) {
        const forwardClient = SOCKSClient.createChain(forwardChain);
        await forwardClient.connectSOCKS();
        await forwardClient.connectHost(`http://${host}:${port}`);
        const chainSocket = forwardClient.getSocket();
        if (!chainSocket) throw 'Failed to initialize SOCKS chain.';
        return chainSocket;
    }

    start() {
        this.#socketServer = net.createServer(async clientSocket => {
            clientSocket.on('error', () => clientSocket.destroy());
            try {
                this.emit('connection', clientSocket);
                let helloData = await timedPromise(resolve => clientSocket.once('data', resolve));
                this.#handleClientHello(clientSocket, helloData);
                let requestData = await timedPromise(resolve => clientSocket.once('data', resolve));
                this.#handleClientRequest(clientSocket, requestData);
                this.emit('connected', clientSocket);
            } catch (err) {
                clientSocket.destroy();
                this.emit('connect-error', err);
            }

        });
        return new Promise((resolve, reject) => {
            this.#socketServer?.once('error', reject);
            this.#socketServer?.once('listening', resolve);
            this.#socketServer?.listen(this.#port);
        });
    }

    stop() {
        this.#socketServer?.close();
    }
}