const uuid = require('uuid');

export function generateId() {
  return uuid.v4();
}

export function getUserMedia(constraints) {
  return navigator.mediaDevices.getUserMedia(constraints);
}
