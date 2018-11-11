const kurentoUtils = require('kurento-utils');
const { StateMachine } = require('./stateMachine');
const { messageFactory } = require('./message');
const { getUserMedia, generateId } = require('./utils');

export const LocalStreamState = {
  READY: 'ready',
  STARTING: 'starting',
  STARTED: 'started',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  UNPUBLISHING: 'unpublishing',
  STOPPING: 'stopping'
};

export const LocalStreamEvent = {
  STARTED: 'started',
  STOPPED: 'stopped',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished'
};

export class LocalStream extends StateMachine {
  transitions = {
    [LocalStreamState.READY]: {
      [LocalStreamState.STARTING]: true
    },
    [LocalStreamState.STARTING]: {
      [LocalStreamState.STARTED]: true,
      [LocalStreamState.READY]: true
    },
    [LocalStreamState.STARTED]: {
      [LocalStreamState.PUBLISHING]: true,
      [LocalStreamState.STOPPING]: true
    },
    [LocalStreamState.PUBLISHING]: {
      [LocalStreamState.PUBLISHED]: true,
      [LocalStreamState.STARTED]: true
    },
    [LocalStreamState.PUBLISHED]: {
      [LocalStreamState.UNPUBLISHING]: true
    },
    [LocalStreamState.UNPUBLISHING]: {
      [LocalStreamState.STARTED]: true
    },
    [LocalStreamState.STOPPING]: {
      [LocalStreamState.READY]: true
    }
  };

  constructor({ element, constraints }) {
    super();
    this.state = LocalStreamState.READY;
    this.room = undefined;
    this.id = generateId();
    this.element = element;
    this.constraints = constraints;
    this.mediaStream = undefined;
    this.rtcPeer = undefined;
    this.publishCallback = undefined;
    this.unpublishCallback = undefined;
  }

  start(cb) {
    this.state = LocalStreamState.STARTING;
    getUserMedia(this.constraints)
      .then(mediaStream => {
        this.mediaStream = mediaStream;
        this.element.srcObject = mediaStream;
        this.state = LocalStreamState.STARTED;
        // emit(LocalStreamEvent.STARTED);
        cb && cb(undefined, this);
      })
      .catch(err => {
        this.state = LocalStreamState.READY;
        cb && cb(err);
      });
  }

  stop(cb) {
    this.state = LocalStreamState.STOPPING;
    for (const track of this.mediaStream.getTracks()) {
      track.stop();
    }
    this.mediaStream = undefined;
    this.element.srcObject = undefined;
    this.state = LocalStreamState.READY;
    // emit(LocalStreamEvent.STOPPED);
    cb && cb(undefined);
  }

  publish(room, cb) {
    room.publish(this, cb);
  }

  unpublish(room, cb) {
    room.unpublish(this, cb);
  }

  handlePublish(room, cb) {
    if (this.state === LocalStreamState.READY) {
      this.start(err => {
        if (err) {
          return cb && cb(err);
        }
        this.handlePublish(room, cb);
      });
      return;
    }
    this.state = LocalStreamState.PUBLISHING;
    this.publishCallback = cb;
    this.room = room;
    room.localStreams.set(this.id, this);
    this.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly({
      videoStream: this.mediaStream,
      // audioStream: this.mediaStream,
      onstreamended: e => console.log('Stream ended', this, e),
      onicecandidate: this._handleLocalIceCandidate,
      // configuration: {
      //   iceServers: [{ urls: 'stun:34.205.69.230:5349' }]
      // }

    }, err => {
      if (err) {
        const callback = this.publishCallback;
        this.state = LocalStreamState.STARTED;
        this.publishCallback = undefined;
        this.room = undefined;
        room.localStreams.clear(this.id);
        this.rtcPeer.dispose();
        this.rtcPeer = undefined;
        return callback && callback(err);
      }
      this.rtcPeer.generateOffer((err, sdpOffer) => {
        if (err) {
          const callback = this.publishCallback;
          this.state = LocalStreamState.STARTED;
          this.publishCallback = undefined;
          this.room = undefined;
          room.localStreams.clear(this.id);
          this.rtcPeer.dispose();
          this.rtcPeer = undefined;
          return callback && callback(err);
        }
        room.sendMessage(messageFactory.publish(
          this.id, sdpOffer));
      });
    })
  }

  handlePublished(sdpAnswer) {
    this.state = LocalStreamState.PUBLISHED;
    this.rtcPeer.processAnswer(sdpAnswer, err => {
      if (err) {
        console.error('Sdp Answer Processing failed', err);
      }
    });
  }

  handleUnpublish(room, cb) {
    this.state = LocalStreamState.UNPUBLISHING;
  }

  handleUnpublished() {
    // TODO: improve
    this.state = LocalStreamState.STARTED;
  }

  handleRemoteIceCandidate(candidate) {
    this.rtcPeer.addIceCandidate(candidate);
  }

  _handleLocalIceCandidate = candidate => {
    this.room.sendMessage(messageFactory.iceCandidate(
      this.id, 'stream', candidate));
  };
}
