const kurentoUtils = require('kurento-utils');
const { StateMachine } = require('./stateMachine');
const { messageFactory } = require('./message');
const { generateId } = require('./utils');

export const RemoteStreamState = {
  READY: 'ready',
  SUBSCRIBING: 'subscribing',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBING: 'unsubscribing'
};

export const RemoteStreamEvent = {
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed'
};

export class RemoteStream extends StateMachine {
  transitions = {
    [RemoteStreamState.READY]: {
      [RemoteStreamState.SUBSCRIBING]: true
    },
    [RemoteStreamState.SUBSCRIBING]: {
      [RemoteStreamState.SUBSCRIBED]: true,
      [RemoteStreamState.READY]: true
    },
    [RemoteStreamState.SUBSCRIBED]: {
      [RemoteStreamState.UNSUBSCRIBING]: true,
      [RemoteStreamState.READY]: true
    },
    [RemoteStreamState.UNSUBSCRIBING]: {
      [RemoteStreamState.READY]: true
    }
  };

  constructor(room, { id }) {
    super();
    this.state = RemoteStreamState.READY;
    this.room = room;
    this.id = id;
    this.element = undefined;
    this.sinkId = undefined;
    this.mediaStream = undefined;
    this.rtcPeer = undefined;
    this.subscribeCallback = undefined;
    this.unsubscribeCallback = undefined;
  }

  // TEMP: improve
  get stream() {
    return this.rtcPeer && this.rtcPeer.getRemoteStream();
  }

  subscribe(element, cb) {
    this.room.subscribe(this, element, cb);
  }

  unsubscribe(cb) {
    this.room.unsubscribe(this, cb);
  }

  handleSubscribe(element, cb) {
    this.state = RemoteStreamState.SUBSCRIBING;
    this.subscribeCallback = cb;
    this.element = element;
    this.sinkId = generateId();
    this.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly({
      onstreamended: e => console.log('Stream ended', this, e),
      onicecandidate: this._handleLocalIceCandidate,
      remoteVideo: this.element
      // configuration: {
      //   iceServers: [{ urls: 'stun:34.205.69.230:5349' }]
      // }

    }, err => {
      if (err) {
        const callback = this.subscribeCallback;
        this.state = RemoteStreamState.READY;
        this.subscribeCallback = undefined;
        this.element = undefined;
        this.sinkId = undefined;
        this.rtcPeer.dispose();
        this.rtcPeer = undefined;
        return callback && callback(err);
      }
      this.rtcPeer.generateOffer((err, sdpOffer) => {
        if (err) {
          const callback = this.subscribeCallback;
          this.state = RemoteStreamState.READY;
          this.subscribeCallback = undefined;
          this.element = undefined;
          this.sinkId = undefined;
          this.rtcPeer.dispose();
          this.rtcPeer = undefined;
          return callback && callback(err);
        }
        this.room.sendMessage(messageFactory.subscribe(
          this.id, this.sinkId, sdpOffer));
      });
    });
  }

  handleSubscribed(sinkId, sdpAnswer) {
    if (sinkId !== this.sinkId) {
      throw new Error('Wrong sink id', sinkId);
    }
    this.state = RemoteStreamState.SUBSCRIBED;
    this.rtcPeer.processAnswer(sdpAnswer, err => {
      if (err) {
        console.error('Sdp Answer Processing failed', err);
      }
    });
  }
  handleUnsubscribe(cb) {
    this.state = RemoteStreamState.UNSUBSCRIBING;
  }

  handleUnsubscribed() {
    // TODO: improve
    this.state = RemoteStreamState.READY;
  }

  dispose() {
    //TODO: dispose remote stream
  }

  handleRemoteIceCandidate(sinkId, candidate) {
    if (sinkId !== this.sinkId) {
      throw new Error('Wrong sink id', sinkId);
    }
    this.rtcPeer.addIceCandidate(candidate);
  }

  _handleLocalIceCandidate = candidate => {
    this.room.sendMessage(messageFactory.iceCandidate(
      this.sinkId, 'sink', candidate));
  };
}
