const kurentoClient = require('kurento-client');

function getComplexTypeIceCandidate(event) {
  return kurentoClient.getComplexType('IceCandidate')(event.candidate);
}

module.exports = {
  getComplexTypeIceCandidate
};
