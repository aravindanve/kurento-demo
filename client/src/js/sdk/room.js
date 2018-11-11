const { StateMachine } = require('./stateMachine');
const { Dispatcher } = require('./dispatcher');
const { Connection } = require('./connection');
const { Participant } = require('./participant');
const { RemoteStream } = require('./remoteStream');
const { messageFactory, MessageType } = require('./message');
const { generateId }  =require('./utils');

export const RoomState = {
  READY: 'ready',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  JOINING: 'joining',
  JOINED: 'joined',
  LEAVING: 'leaving'
};

export const RoomEvent = {
  JOINED: 'joined',
  LEFT: 'left',
  PARTICIPANTS_JOINED: 'participantsJoined',
  PARTICIPANTS_LEFT: 'participantsLeft',
  STREAMS_CREATED: 'streamsCreated',
  STREAMS_UPDATED: 'streamsUpdated',
  STREAMS_DESTROYED: 'streamsDestroyed',
  STREAM_PUBLISHED: 'streamPublished',
  STREAM_UNPUBLISHED: 'streamUnpublished',
  STREAM_SUBSCRIBED: 'streamSubscribed',
  STREAM_UNSUBSCRIBED: 'streamUnSubscribed',
  ERROR: 'error'
};

// TODO: handle connection close and room leave properly

export class Room extends StateMachine {
  transitions = {
    [RoomState.READY]: {
      [RoomState.CONNECTING]: true
    },
    [RoomState.CONNECTING]: {
      [RoomState.CONNECTED]: true,
      [RoomState.READY]: true
    },
    [RoomState.CONNECTED]: {
      [RoomState.JOINING]: true,
      [RoomState.READY]: true
    },
    [RoomState.JOINING]: {
      [RoomState.JOINED]: true,
      [RoomState.READY]: true
    },
    [RoomState.JOINED]: {
      [RoomState.LEAVING]: true,
      [RoomState.READY]: true
    },
    [RoomState.LEAVING]: {
      [RoomState.READY]: true
    }
  };

  constructor({ id, connectionUrl }) {
    super();
    this.state = RoomState.READY;
    this.id = id;
    this.dispatcher = new Dispatcher();
    this.connection = new Connection({ url: connectionUrl });
    this.me = undefined;
    this.participants = new Map();
    this.localStreams = new Map();
    this.remoteStreams = new Map();
    this.joinCallback = undefined;
    this.leaveCallback = undefined;
    this.publishCallbacks = new Map();
    this.unpublishCallbacks = new Map();
    this.subscribeCallbacks = new Map();
    this.unsubscribeCallbacks = new Map();
  }

  on(type, listener) {
    this.dispatcher.on(type, listener);
  }

  off(type, listener) {
    this.dispatcher.off(type, listener);
  }

  join(cb) {
    this.state = RoomState.CONNECTING;
    this.joinCallback = cb;
    this.connection.onOpen = this._handleConnectionOpen;
    this.connection.onClose = this._handleConnectionClose;
    this.connection.onMessage = this._handleConnectionMessage;
    this.connection.onError = this._handleConnectionError;
    this.connection.open();
  }

  leave(cb) {
    this.state = RoomState.LEAVING;
    this.leaveCallback = cb;
    this.connection.close();
  }

  publish(localStream, cb) {
    if (this.state !== RoomState.JOINED) {
      throw new Error(`Room not joined`);
    }
    localStream.handlePublish(this, cb);
  }

  unpublish(localStream, cb) {
    if (this.state !== RoomState.JOINED) {
      throw new Error(`Room not joined`);
    }
    localStream.handleUnpublish(this, cb);
  }

  subscribe(remoteStream, element, cb) {
    if (this.state !== RoomState.JOINED) {
      throw new Error(`Room not joined`);
    }
    if (remoteStream.room !== this) {
      throw new Error('Wrong room');
    }
    remoteStream.handleSubscribe(element, cb);
  }

  unsubscribe(remoteStream, cb) {
    if (this.state !== RoomState.JOINED) {
      throw new Error(`Room not joined`);
    }
    if (remoteStream.room !== this) {
      throw new Error('Wrong room');
    }
    remoteStream.handleUnubscribe(cb);
  }

  sendMessage(msg) {
    if (this.state !== RoomState.JOINED) {
      throw new Error(`Room not joined`);
    }
    this.connection.sendMessage(msg);
  }

  _handleConnectionOpen = () => {
    this.state = RoomState.CONNECTED;
  };

  _handleConnectionClose = () => {
    const callback = this.leaveCallback;
    this.state = RoomState.READY;
    this.leaveCallback = undefined;
    this.connection.onOpen = undefined;
    this.connection.onClose = undefined;
    this.connection.onMessage = undefined;
    this.connection.onError = undefined;
    this.me = undefined;
    this.dispatcher.emit(RoomEvent.LEFT);
    callback && callback();
  };

  _handleConnectionMessage = (msg) => {
    switch (msg.alert) {
      case MessageType.READY:
        this._handleReadyMessage(msg);
        break;
      case MessageType.JOINED:
        this._handleJoinedMessage(msg);
        break;
      case MessageType.LEFT:
        this._handleLeftMessage(msg);
        break;
      case MessageType.PARTICIPANTS_JOINED:
        this._handleParticipantsJoinedMessage(msg);
        break;
      case MessageType.PARTICIPANTS_LEFT:
        this._handleParticipantsLeftMessage(msg);
        break;
      case MessageType.STREAMS_CREATED:
        this._handleStreamsCreatedMessage(msg);
        break;
      case MessageType.STREAMS_UPDATED:
        this._handleStreamsUpdatedMessage(msg);
        break;
      case MessageType.STREAMS_DESTROYED:
        this._handleStreamsDestroyedMessage(msg);
        break;
      case MessageType.PUBLISHED:
        this._handlePublishedMessage(msg);
        break;
      case MessageType.UNPUBLISHED:
        this._handleUnpublishedMessage(msg);
        break;
      case MessageType.SUBSCRIBED:
        this._handleSubscribedMessage(msg);
        break;
      case MessageType.UNSUBSCRIBED:
        this._handleUnsubscribedMessage(msg);
        break;
      case MessageType.ICE_CANDIDATE:
        this._handleRemoteIceCandidateMessage(msg);
        break;
      case MessageType.ERROR:
        this._handleError(new Error(msg.message));
        break;
      default:
        this._handleError(new Error(
          'Unrecognized message type', msg.type));
        break;
    }
  };

  _handleConnectionError = err => {
    this._handleError(err);
  };

  _handleReadyMessage = () => {
    this.state = RoomState.JOINING;
    this.connection.sendMessage(
      messageFactory.join(generateId()));
  };

  _handleJoinedMessage = msg => {
    const callback = this.joinCallback;
    this.state = RoomState.JOINED;
    this.joinCallback = undefined;
    this.me = new Participant(this, msg.id);
    const participants = [];
    for (const item of msg.participants) {
      const participant = new Participant(this, item.id);
      this.participants.set(item.id, participant);
      participants.push(participant);
    }
    const remoteStreams = [];
    for (const item of msg.streams) {
      const remoteStream = new RemoteStream(this, item);
      this.remoteStreams.set(item.id, remoteStream);
      remoteStreams.push(remoteStream);
    }
    this.dispatcher.emit(RoomEvent.JOINED, this.me);
    this.dispatcher.emit(RoomEvent.PARTICIPANTS_JOINED, participants);
    this.dispatcher.emit(RoomEvent.STREAMS_CREATED, remoteStreams);
    callback && callback();
  };

  _handleLeftMessage = msg => {
    if (this.state === RoomState.JOINED) {
      this.leave();
    }
  };

  _handleParticipantsJoinedMessage = msg => {
    const participants = [];
    for (const item of msg.items) {
      const participant = new Participant(this, item.id);
      this.participants.set(item.id, participant);
      participants.push(participant);
    }
    this.dispatcher.emit(RoomEvent.PARTICIPANTS_JOINED, participants);
  };

  _handleParticipantsLeftMessage = msg => {
    const participants = [];
    for (const item of msg.items) {
      const participant = this.participants.get(item.id);
      this.participants.delete(item.id);
      participants.push(participant);
    }
    this.dispatcher.emit(RoomEvent.PARTICIPANTS_LEFT, participants);
  };

  _handleStreamsCreatedMessage = msg => {
    const remoteStreams = [];
    for (const item of msg.items) {
      const remoteStream = new RemoteStream(this, item);
      this.remoteStreams.set(item.id, remoteStream);
      remoteStreams.push(remoteStream);
    }
    this.dispatcher.emit(RoomEvent.STREAMS_CREATED, remoteStreams);
  };

  _handleStreamsUpdatedMessage = msg => {
    const remoteStreams = [];
    for (const item of msg.items) {
      const remoteStream = this.remoteStreams.get(item.id);
      remoteStream.update(item);
      remoteStreams.push(remoteStream);
    }
    this.dispatcher.emit(RoomEvent.STREAMS_UPDATED, remoteStreams);
  };

  _handleStreamsDestroyedMessage = msg => {
    const remoteStreams = [];
    for (const item of msg.items) {
      const remoteStream = this.remoteStreams.get(item.id);
      this.remoteStreams.delete(item.id);
      remoteStream.dispose();
      remoteStreams.push(remoteStream);
    }
    this.dispatcher.emit(RoomEvent.STREAMS_DESTROYED, remoteStreams);
  };

  _handlePublishedMessage = msg => {
    const localStream = this.localStreams.get(msg.id);
    localStream.handlePublished(msg.sdpAnswer);
    this.dispatcher.emit(RoomEvent.STREAM_PUBLISHED, localStream);
  };

  _handleUnpublishedMessage = msg => {
    const localStream = this.localStreams.get(msg.id);
    localStream.handleUnpublished();
    this.dispatcher.emit(RoomEvent.STREAM_UNPUBLISHED, localStream);
  };

  _handleSubscribedMessage = msg => {
    console.log('_handleSubscribedMessage', msg);
    const remoteStream = this.remoteStreams.get(msg.streamId);
    remoteStream.handleSubscribed(msg.id, msg.sdpAnswer);
    this.dispatcher.emit(RoomEvent.STREAM_SUBSCRIBED, remoteStream);
  };

  _handleUnsubscribedMessage = msg => {
    const remoteStream = this.remoteStreams.get(msg.id);
    remoteStream.handleUnsubscribed();
    this.dispatcher.emit(RoomEvent.STREAM_UNSUBSCRIBED, remoteStream);
  };

  _handleRemoteIceCandidateMessage = msg => {
    if (msg.type === 'stream') {
      const localStream = this.localStreams.get(msg.id);
      localStream.handleRemoteIceCandidate(msg.candidate);

    } else if (msg.type === 'sink') {
      const remoteStream = this.remoteStreams.get(msg.streamId);
      remoteStream.handleRemoteIceCandidate(msg.id, msg.candidate);

    } else {
      throw new Error('Invalid ice candidate message', msg);
    }
  };

  _handleError = (err) => {
    this.dispatcher.emit(RoomEvent.ERROR, err);
  };
}
