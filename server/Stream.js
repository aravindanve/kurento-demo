const utils = require('./utils');

const State = {
  NEW: 'new',
  CREATING: 'creating',
  READY: 'ready',
  ENDPOINT_FAILED: 'endpointFailed',
  OFFER_FAILED: 'offerFailed',
  GATHER_FAILED: 'gatherFailed',
  DISPOSED: 'disposed'
};

const Event = {
  CREATED: 'created',
  DISPOSED: 'disposed',
  ICE_CANDIDATE: 'iceCandidate',
  ERROR: 'error'
};

class Stream {
  constructor(room, owner, id) {
    this.state = State.NEW;
    this.room = room;
    this.owner = owner;
    this.id = id;
    this.sinksByParticipant = new Map();
    this.endpoint = undefined;
    this.iceCandidateQueue = [];
    this.sdpAnswer = undefined;
    this.dispatch = (type, event) => {
      this.owner.dispatchStreamEvent(this, type, event);
      this.room.dispatchStreamEvent(this, type, event);
    };
  }

  static get resourceType() {
    return 'stream';
  }

  get resourceType() {
    return this.constructor.resourceType;
  }

  create(sdpOffer, cb) {
    if (this.state !== State.NEW) {
      const err = new Error('Stream not in new state');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.state = State.CREATING;
    this.room.pipeline.create('WebRtcEndpoint', (err, endpoint) => {
      if (err) {
        this.state = State.ENDPOINT_FAILED;
        this.dispose();
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      this.endpoint = endpoint;
      this.endpoint.on('OnIceCandidate', e => {
        const candidate = utils.getComplexTypeIceCandidate(e);
        this.dispatch(Event.ICE_CANDIDATE, candidate);
      });
      this.endpoint.processOffer(sdpOffer, (err, answer) => {
        if (err) {
          this.state = State.OFFER_FAILED;
          this.dispose();
          return cb ? cb(err) : this.dispatch(Event.ERROR, err);
        }
        this.state = State.READY;
        this.sdpAnswer = answer;
        this.endpoint.gatherCandidates(err => {
          if (err) {
            this.state = State.GATHER_FAILED;
            this.dispose();
            this.dispatch(Event.ERROR, err);
          }
        });
        this.dispatch(Event.CREATED);
        cb && cb(undefined, this);
      });
      const iceCandidateQueue = this.iceCandidateQueue;
      this.iceCandidateQueue = [];
      while (iceCandidateQueue.length) {
        this.addIceCandidate(iceCandidateQueue.shift());
      }
    });
  }

  addIceCandidate(candidate, cb) {
    if (!this.endpoint) {
      this.iceCandidateQueue.push(candidate);
      return cb && cb();
    }
    this.endpoint.addIceCandidate(candidate, err => {
      if (err) {
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      cb && cb();
    });
  }

  dispose(cb) {
    // TODO: dispose creating endpoint
    if ([State.NEW, State.CREATING, State.READY]
        .indexOf(this.state)) {
      this.state = State.DISPOSED;
    }
    for (const sink of this.sinksByParticipant.values()) {
      sink.dispose();
    }
    this.sinksByParticipant.clear();
    this.endpoint && this.endpoint.release();
    this.endpoint = undefined;
    this.iceCandidateQueue = [];
    this.sdpAnswer = undefined;
    Builder.disposeRefs(this);
    this.dispatch(Event.DISPOSED);
    cb && cb(undefined, this);
  }
}

const Builder = {
  build(room, owner, id) {
    const stream = new Stream(room, owner, id);
    room.streamsById.set(id, stream);
    room.weakParticipantsByStream.set(stream, owner);
    owner.streamsById.set(id, stream);
    return stream;
  },
  disposeRefs(stream) {
    const { room, owner, id } = stream;
    room.streamsById.delete(id);
    room.weakParticipantsByStream.delete(stream);
    owner.streamsById.delete(id);
  }
};

module.exports = Stream;
module.exports.State = State;
module.exports.Event = Event;
module.exports.Builder = Builder;
