const { Room, RoomEvent } = require('./room');
const { LocalStream } = require('./localStream');

export {
  RoomEvent
}

export function createRoom(id, connectionUrl) {
  return new Room({ id, connectionUrl });
}

export function createLocalStream(element, constraints) {
  return new LocalStream({ element, constraints });
}
