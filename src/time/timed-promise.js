/**
 * Creates a new timed Promise.
 * 
 * @template T
 * @param {(resolve: ((value: T) => void), reject: ((reason: any) => void)) => void} executor
 * A callback used to initialize the promise. This callback is passed two arguments:
 * a resolve callback used to resolve the promise with a value or the result of another promise,
 * and a reject callback used to reject the promise with a provided reason or error.
 * @param {number=} ms Number of milliseconds after which the promise will be rejected. (defaults to `30000`)
 * @returns {Promise<T>}
 */
export const timedPromise = (executor, ms = 30000) => {
    /** @type {(resolve: ((value:any) => void), reject: ((reason:any) => void)) => void} */
    const timedExecutor = (resolve, reject) => {
        if (ms <= 0) executor(resolve, reject);
        else {
            const timeout = setTimeout(() => reject(`Promise timed out after ${ms} milliseconds.`), ms);
            /** @type {(value: any) => void} */
            const timedResolve = (value) => {
                clearTimeout(timeout);
                resolve(value);
            }
            /** @type {(reason: any) => void} */
            const timedReject = (reason) => {
                clearTimeout(timeout);
                reject(reason);
            }
            executor(timedResolve, timedReject);
        }

    };
    return new Promise(timedExecutor);
}