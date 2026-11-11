const net = require('net');
const tls = require('tls');
const assert = require('assert');

const ElectrumClient = require("./index");

// self-signed, for `localhost`, valid till 2126. made with:
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 36500 -subj /CN=localhost -addext subjectAltName=DNS:localhost
const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgoPX54kJmqW+/qH94
jwQ4tOl1+Ok3pjnM/2rxFWU1u/qhRANCAAR6xdSngVNBzrKvAfAH+G2a4doAPp6L
ks9CQ788hki+OCXw6EvZOxyOj5pbVkSV9rP+jKSWVVRsKc/Hvv2bPlpS
-----END PRIVATE KEY-----`;
const cert = `-----BEGIN CERTIFICATE-----
MIIBczCCARqgAwIBAgIUWJCwU/biYw5dF3EJmeOCQqNfvOwwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTExMTEzMzQ0N1oYDzIxMjYxMDE4
MTMzNDQ3WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAAR6xdSngVNBzrKvAfAH+G2a4doAPp6Lks9CQ788hki+OCXw6EvZOxyO
j5pbVkSV9rP+jKSWVVRsKc/Hvv2bPlpSo0gwRjAdBgNVHQ4EFgQUPCKGLV5bIdka
8zqBkyQn/FHVR8owDwYDVR0TAQH/BAUwAwEB/zAUBgNVHREEDTALgglsb2NhbGhv
c3QwCgYIKoZIzj0EAwIDRwAwRAIgMjvJgFAZ8dHnUrvpj3mMqoJW+45C5OVEMN3F
E/w+V7cCIFaT0rRZ/Lc8p6W9fPhbRq87Gh5WAKiNkGeAIu55vB3q
-----END CERTIFICATE-----`;

// certificate validation, against a local server
async function testCertificateValidation() {
    let served = 0;
    const server = tls.createServer({ key, cert }, socket => {
        socket.on('error', () => {});
        socket.on('data', data => {
            served++;
            socket.write(JSON.stringify({ jsonrpc: '2.0', result: ['ElectrumX', '1.4'], id: JSON.parse(data).id }) + '\n');
        });
    });
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    const version = async (host, options) => {
        const client = new ElectrumClient(net, tls, port, host, 'tls', options);
        client.onError = () => {};
        try {
            await client.connect();
            return await client.server_version('test', '1.4');
        } finally {
            client.close();
        }
    };

    // not validated by default
    assert.ok(await version('localhost'));
    assert.ok(await version('localhost', { rejectUnauthorized: false }));

    // trusted and issued for the host
    assert.ok(await version('localhost', { rejectUnauthorized: true, ca: cert }));
    assert.ok(await version('127.0.0.1', { rejectUnauthorized: true, ca: cert, checkServerIdentity: () => undefined }));

    // nothing is sent to the server that did not pass
    served = 0;
    await assert.rejects(version('localhost', { rejectUnauthorized: true })); // not trusted
    await assert.rejects(version('127.0.0.1', { rejectUnauthorized: true, ca: cert })); // issued for another host
    assert.strictEqual(served, 0);

    server.close();
}

(async () => {
    await testCertificateValidation();

    let client = new ElectrumClient(net, false, 50001, 'mainnet-0.foundation.xyz', 'tcp');
    let ver = await client.initElectrum({ client: 'bluewallet', version: '1.4' });
    let balance = await client.blockchainScripthash_getBalance('716decbe1660861c3d93906cb1d98ee68b154fd4d23aed9783859c1271b52a9c');
    assert.ok(balance)
    assert.ok(ver[0].toLowerCase().includes('fulcrum'));
    assert.strictEqual(balance.confirmed, 51432);

    client = new ElectrumClient(net, tls, 443, 'electrum1.bluewallet.io', 'ssl');
    ver = await client.initElectrum({ client: 'bluewallet', version: '1.4' });
    balance = await client.blockchainScripthash_getBalance('716decbe1660861c3d93906cb1d98ee68b154fd4d23aed9783859c1271b52a9c');
    assert.ok(balance)
    assert.ok(ver[0].toLowerCase().includes('electrum'));
    assert.strictEqual(balance.confirmed, 51432);

    process.exit(0);
})();
