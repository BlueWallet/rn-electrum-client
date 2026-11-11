# rn-electrum-client

Electrum Protocol Client for React Native

# based on

* https://github.com/you21979/node-electrum-client
* https://github.com/7kharov/node-electrum-client

# features

* persistence (ping strategy and reconnection)
* batch requests
* works in RN and nodejs
* both clearnet TCP and TLS
* zero dependencies

## protocol spec

* https://electrumx-spesmilo.readthedocs.io/en/latest/protocol.html

## usage

For Nodejs you can just provide standard modules `net` & `tls` to constructor explicitly, this
library won't do `require('net')`.

```javascript
  const net = require('net');
```

and then

```javascript
  const client = new ElectrumClient(net, false, 50001, 'electrum1.bluewallet.io', 'tcp');
  const ver = await client.initElectrum({ client: 'bluewallet', version: '1.4' });
  const balance = await client.blockchainScripthash_getBalance('716decbe1660861c3d93906cb1d98ee68b154fd4d23aed9783859c1271b52a9c');
```

TLS certificate of the server is not validated by default. Options for `tls.TLSSocket` can be passed as the last
argument. With `rejectUnauthorized: true` certificate must be trusted and issued for the host we connect to:
(on Android `react-native-tcp-socket` 6.4.3 checks only that certificate is trusted, not who it was issued for)

```javascript
  const client = new ElectrumClient(net, tls, 50002, 'electrum.acinq.co', 'tls', { rejectUnauthorized: true });
```

For React Native luckily we have `react-native-tcp-socket` which mimics `net` & `tls` pretty closely,
one of the ways to shim it is via `package.json`:

```json
    "react-native": {
      "net": "react-native-tcp-socket",
      "tls": "react-native-tcp-socket"
    }
```

# license

MIT
