import dns from 'dns';

/**
 * @type {import('net').LookupFunction}
 */
export const netDnsLookup = (hostname, options, cb) => {
    /** @type {{address: string, family: number}[]} */
    const addresses = [];
    dns.resolve4(hostname, (err4, addresses4) => {
        if (addresses4) addresses.push(...addresses4.map(a => ({ address: a, family: 4 })));
        dns.resolve6(hostname, (err6, addresses6) => {
            if (addresses6) addresses.push(...addresses6.map(a => ({ address: a, family: 6 })));
            const err = (err4 && err6) ? err4 : null;
            if (addresses.length === 0) cb(err, []);
            else if (options.all) cb(err, addresses);
            else addresses[0] ? cb(err, addresses[0].address, addresses[0].family) : cb(err, []);
        });
    });
}