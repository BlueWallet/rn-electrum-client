'use strict';
/**
 * expecting NET & TLS to be injected from outside:
 * for RN it should be in shim.js:
 *     global.net = require('react-native-tcp');
 *     global.tls = require('react-native-tcp/tls');
 *
 * for nodejs tests it should be provided before tests:
 *     global.net = require('net');
 *     global.tls = require('tls');
 * */
let net = global.net;
let tls = global.tls;
const TIMEOUT = 5000;

const EventEmitter = require('events').EventEmitter;
const util = require('./util');

class Client {
  constructor(port, host, protocol, options) {
    this.id = 0;
    this.port = port;
    this.host = host;
    this.callback_message_queue = {};
    this.subscribe = new EventEmitter();
    this.mp = new util.MessageParser((body, n) => {
      this.onMessage(body, n);
    });
    this._protocol = protocol; // saving defaults
    this._options = options;
    this.initSocket(protocol, options);
    this.socket = undefined;
  }

  setHost(host) {
    this.host = host;
  }

  initSocket(protocol, options) {
    protocol = protocol || this._protocol;
    options = options || this._options;
    switch (protocol) {
      case 'tcp':
        this.conection = new net.Socket();
        break;
      case 'tls':
      case 'ssl':
        if (!tls) {
          throw new Error('tls package could not be loaded');
        }
        this.conection = tls;
        break;
      default:
        throw new Error('unknown protocol');
    }

    this.status = 0;
  }

  connect() {
    if (this.status === 1) {
      return Promise.resolve();
    }

    this.status = 1;

    return new Promise((resolve, reject) => {
      this.socket = this.conection.connect(
        { port: this.port, host: this.host, rejectUnauthorized: true },
        () => {}
      );

      this.socket.setTimeout(TIMEOUT);
      this.socket.setEncoding('utf8');
      this.socket.setKeepAlive(true, 0);
      this.socket.setNoDelay(true);

      this.socket.on('connect', () => {
        this.socket.setTimeout(0);
        this.onConnect();
        resolve();
      });
      this.socket.on('error', (e) => {
        this.onError(e);
        reject(e);
      });
      this.socket.on('close', (e) => {
        this.onClose(e);
      });
      this.socket.on('data', (chunk) => {
        this.onRecv(chunk);
      });
    });
  }

  close() {
    if (this.status === 0) {
      return;
    }

    this.socket.end();
    this.socket.destroy();
    this.status = 0;
  }

  request(method, params) {
    if (this.status === 0) {
      return Promise.reject(
        new Error('Connection to server lost, please retry')
      );
    }
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const content = util.makeRequest(method, params, id);
      this.callback_message_queue[id] = util.createPromiseResult(
        resolve,
        reject
      );
      this.socket.write(content + '\n');
    });
  }

  requestBatch(method, params, secondParam) {
    if (this.status === 0) {
      return Promise.reject(
        new Error('Connection to server lost, please retry')
      );
    }
    return new Promise((resolve, reject) => {
      let arguments_far_calls = {};
      let contents = [];
      for (let param of params) {
        const id = ++this.id;
        if (secondParam !== undefined) {
          contents.push(util.makeRequest(method, [param, secondParam], id));
        } else {
          contents.push(util.makeRequest(method, [param], id));
        }
        arguments_far_calls[id] = param;
      }
      const content = '[' + contents.join(',') + ']';
      this.callback_message_queue[this.id] = util.createPromiseResultBatch(
        resolve,
        reject,
        arguments_far_calls
      );
      // callback will exist only for max id
      this.socket.write(content + '\n');
    });
  }

  response(msg) {
    let callback;
    if (!msg.id && msg[0] && msg[0].id) {
      // this is a response from batch request
      for (let m of msg) {
        if (m.id && this.callback_message_queue[m.id]) {
          callback = this.callback_message_queue[m.id];
          delete this.callback_message_queue[m.id];
        }
      }
    } else {
      callback = this.callback_message_queue[msg.id];
    }

    if (callback) {
      delete this.callback_message_queue[msg.id];
      if (msg.error) {
        callback(msg.error);
      } else {
        callback(null, msg.result || msg);
      }
    } else {
      console.log("Can't get callback");
    }
  }

  onMessage(body, n) {
    try {
      const msg = JSON.parse(body);
      if (msg instanceof Array) {
        this.response(msg);
      } else {
        if (msg.id !== void 0) {
          this.response(msg);
        } else {
          this.subscribe.emit(msg.method, msg.params);
        }
      }
    } catch (error) {
      this.socket.end();
      this.socket.destroy();
      this.onClose(error);
    }
  }

  onConnect() {}

  onClose(e) {
    this.status = 0;
    Object.keys(this.callback_message_queue).forEach((key) => {
      this.callback_message_queue[key](new Error('close connect'));
      delete this.callback_message_queue[key];
    });
  }

  onRecv(chunk) {
    this.mp.run(chunk);
  }

  onError(e) {
    console.log('OnError:' + e);
  }
}

module.exports = Client;
