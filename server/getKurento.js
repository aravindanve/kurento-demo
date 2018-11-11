const kurentoClient = require('kurento-client');
const config = require('./config');
let kurento;

function getKurento(cb) {
  !kurento && (kurento = new Promise((resolve, reject) =>
    kurentoClient(config.kurentoWsUrl, (err, result) => {
      if (err) {
        kurento = undefined;
        return reject(err);
      }
      kurento = result;
      resolve(result);
    })));
  return Promise.resolve(kurento)
    .then(result => cb && cb(undefined, result))
    .catch(err => cb && cb(err));
}

module.exports = getKurento;
