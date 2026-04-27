'use strict';

const makeRequest = (exports.makeRequest = (method, params, id) => {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: method,
    params: params,
    id: id,
  });
});

const createPromiseResult = (exports.createPromiseResult = (resolve, reject) => {
  return (err, result) => {
    if (err) reject(err);
    else resolve(result);
  };
});

const createPromiseResultBatch = (exports.createPromiseResultBatch = (resolve, reject, argz) => {
  return (err, result) => {
    if (result && result[0] && result[0].id) {
      // this is a batch request response
      for (let r of result) {
        r.param = argz[r.id];
      }
    }
    if (err) reject(err);
    else resolve(result);
  };
});

class MessageParser {
  constructor(callback) {
    this.parts = [];
    this.partsLen = 0;
    this.callback = callback;
  }
  run(chunk) {
    let s = chunk;
    if (this.partsLen > 0) {
      this.parts.push(chunk);
      s = this.parts.join('');
      this.parts = [];
      this.partsLen = 0;
    }
    let start = 0;
    let n = 0;
    while (true) {
      const idx = s.indexOf('\n', start);
      if (idx === -1) break;
      this.callback(s.slice(start, idx), n++);
      start = idx + 1;
    }
    if (start < s.length) {
      const tail = start === 0 ? s : s.slice(start);
      this.parts.push(tail);
      this.partsLen += tail.length;
    }
  }
}
exports.MessageParser = MessageParser;
