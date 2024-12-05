import { timedPromise } from "./timed-promise.js";

/**
 * Adds a timeout to a promise
 * 
 * @template T
 * @param {Promise<T>} promise The original promise
 * @param {number=} ms Number of milliseconds after which the promise will be rejected. (defaults to `30000`)
 * @returns {Promise<T>} A promise with timeout
 */
export const withTimeout = (promise, ms) => timedPromise((resolve, reject) => {
    promise.then(res => resolve(res));
    promise.catch(err => reject(err));
}, ms);