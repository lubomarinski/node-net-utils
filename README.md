# Node Network Utils 

A collection of network utils for node.js

Currently contains:

- A SOCKS client and server which allow to easily chain multiple nodes.
- A minimal HTTP/HTTPS request client integrated with the SOCKS client
- URL parser as described in RFC3986, Appendix-B
- Network DNS lookup function that avoids potential system-wide side effects of native OS DNS lookup tools 

Example usage:
```javascript
    const socksServer1 = new SOCKSServer(1111);
    await socksServer1.start();

    const socksServer2 = new SOCKSServer(2222);
    await socksServer2.start();

    const socksClient = SOCKSClient.createChain([
        'socks://localhost:1111', 
        'socks://localhost:2222'
    ]);
       
    const jsonRes = await socksClient.httpRequests().getJson('https://dummyjson.com/test');
```