export const MessageType = {
  // actions
  JOIN: 'join',
  LEAVE: 'leave',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',

  // alerts
  READY: 'ready',
  JOINED: 'joined',
  LEFT: 'left',
  PARTICIPANTS_JOINED: 'participantsJoined',
  PARTICIPANTS_LEFT: 'participantsLeft',
  STREAMS_CREATED: 'streamsCreated',
  STREAMS_UPDATED: 'streamsUpdated',
  STREAMS_DESTROYED: 'streamsDestroyed',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
  ERROR: 'error',

  // two-way
  ICE_CANDIDATE: 'iceCandidate'
};

export const messageFactory = {
  join(participantId) {
    return { action: MessageType.JOIN, id: participantId };
  },
  leave() {
    return { action: MessageType.LEAVE };
  },
  publish(streamId, sdpOffer) {
    return { action: MessageType.PUBLISH, id: streamId, sdpOffer };
  },
  unpublish(streamId) {
    return { action: MessageType.UNPUBLISH, id: streamId };
  },
  subscribe(streamId, sinkId, sdpOffer) {
    return { action: MessageType.SUBSCRIBE, streamId, id: sinkId, sdpOffer };
  },
  sunubscribe(sinkId) {
    return { action: MessageType.UNSUBSCRIBE, id: sinkId };
  },
  iceCandidate(id, type, candidate) {
    return { action: MessageType.ICE_CANDIDATE, id, type, candidate };
  }
};
