'use strict';
/**
 * NET & TLS dependencies should be injected via constructor
 * for RN you can use react-native-tcp-socket
 *
 * for nodejs it should be regular node's net & tls:
 *     const net = require('net');
 *     const tls = require('tls');
 * */
const TIMEOUT = 5000;

const EventEmitter = require('events').EventEmitter;
const util = require('./util');

class Client {
  constructor(net, tls, port, host, protocol, options) {
    this.net = net;
    this.tls = tls;
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
  }

  initSocket(protocol, options) {
    protocol = protocol || this._protocol;
    options = options || this._options;
    switch (protocol) {
      case 'tcp':
        this.conn = new this.net.Socket();
        break;
      case 'tls':
      case 'ssl':
        if (!this.tls) {
          throw new Error('tls package could not be loaded');
        }
        this.connUnsecure = new this.net.Socket();
        this.conn = new this.tls.TLSSocket(this.connUnsecure, { rejectUnauthorized: false });
        break;
      default:
        throw new Error('unknown protocol');
    }

    this.conn.setTimeout(TIMEOUT);
    this.conn.setEncoding('utf8');
    this.conn.setKeepAlive(true, 0);
    this.conn.setNoDelay(true);
    this.conn.on('connect', () => {
      this.conn.setTimeout(0);
      this.onConnect();
    });
    this.conn.on('close', e => {
      this.onClose(e);
    });
    this.conn.on('data', chunk => {
      this.conn.setTimeout(0);
      this.onRecv(chunk);
    });
    this.conn.on('error', e => {
      this.onError(e);
    });
    this.status = 0;
  }

  connect() {
    if (this.status === 1) {
      return Promise.resolve();
    }
    this.status = 1;
    return this.connectSocket(this.connUnsecure || this.conn, this.port, this.host);
  }

  connectSocket(conn, port, host) {
    port = +port;
    return new Promise((resolve, reject) => {
      const errorHandler = e => reject(e);
      conn.connect({port, host}, () => {
        conn.removeListener('error', errorHandler);
        resolve();
      });
      conn.on('error', errorHandler);
    });
  }

  close() {
    if (this.status === 0) {
      return;
    }
    this.conn.end();
    this.conn.destroy();
    this.status = 0;
  }

  request(method, params) {
    if (this.status === 0) {
      return Promise.reject(new Error('Connection to server lost, please retry'));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const content = util.makeRequest(method, params, id);
      this.callback_message_queue[id] = util.createPromiseResult(resolve, reject);
      this.conn.write(content + '\n');
    });
  }

  requestBatch(method, params, secondParam) {
    if (this.status === 0) {
      return Promise.reject(new Error('Connection to server lost, please retry'));
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
      this.callback_message_queue[this.id] = util.createPromiseResultBatch(resolve, reject, arguments_far_calls);
      // callback will exist only for max id
      this.conn.write(content + '\n');
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
      console.log("Electrum: can't get callback. Msg = " + JSON.stringify(msg));
      if (JSON.stringify(msg).includes("Batch limit exceeded")) {
        // since we dont know which batch failed (id is not provided), we cancel all requests.
        // this is better than hanging indefinitely
        Object.keys(this.callback_message_queue).forEach(key => {
          this.callback_message_queue[key](new Error('Batch limit exceeded'));
          delete this.callback_message_queue[key];
        });
      }
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
      this.conn.end();
      this.conn.destroy();
      this.onClose(error);
    }
  }

  onConnect() {}

  onClose(e) {
    this.status = 0;
    Object.keys(this.callback_message_queue).forEach(key => {
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
