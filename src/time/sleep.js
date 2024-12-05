/**
 * Creates a new promise which will resolve after a period of time.
 * 
 * @param {number=} ms The number of milliseconds after which the Promise will resolve (defaults to `30000`)
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms ? ms : 30000));