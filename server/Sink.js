const utils = require('./utils');

const State = {
  NEW: 'new',
  CREATING: 'creating',
  READY: 'ready',
  ENDPOINT_FAILED: 'endpointFailed',
  OFFER_FAILED: 'offerFailed',
  CONNECT_FAILED: 'connectFailed',
  GATHER_FAILED: 'gatherFailed',
  STREAM_NOT_FOUND: 'streamNotFound',
  DISPOSED: 'disposed'
};

const Event = {
  CREATED: 'created',
  DISPOSED: 'disposed',
  ICE_CANDIDATE: 'iceCandidate',
  ERROR: 'error'
};

class Sink {
  constructor(room, owner, stream, id) {
    this.state = State.NEW;
    this.room = room;
    this.owner = owner;
    this.stream = stream;
    this.id = id;
    this.endpoint = undefined;
    this.iceCandidateQueue = [];
    this.sdpAnswer = undefined;
    this.dispatch = (type, event) => {
      this.owner.dispatchSinkEvent(this, type, event);
      this.room.dispatchSinkEvent(this, type, event);
    };
  }

  static get resourceType() {
    return 'sink';
  }

  get resourceType() {
    return this.constructor.resourceType;
  }

  create(sdpOffer, cb) {
    if (this.state !== State.NEW) {
      const err = new Error('Sink not in new state');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const StreamState = this.stream.constructor.State;
    if (this.stream.state !== StreamState.READY) {
      const err = new Error('Stream not ready');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.state = State.CREATING;
    this.room.pipeline.create('WebRtcEndpoint', (err, endpoint) => {
      if (err) {
        this.state = State.ENDPOINT_FAILED;
        this.dispose();
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      if (this.stream.state !== StreamState.READY) {
        err = new Error('Stream not found');
        this.state = State.STREAM_NOT_FOUND;
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
        if (this.stream.state !== StreamState.READY) {
          err = new Error('Stream not found');
          this.state = State.STREAM_NOT_FOUND;
          this.dispose();
          return cb ? cb(err) : this.dispatch(Event.ERROR, err);
        }
        this.stream.endpoint.connect(this.endpoint, err => {
          if (err) {
            this.state = State.CONNECT_FAILED;
            this.dispose();
            return cb ? cb(err) : this.dispatch(Event.ERROR, err);
          }
          if (this.stream.state !== StreamState.READY) {
            err = new Error('Stream not found');
            this.state = State.STREAM_NOT_FOUND;
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
  build(room, owner, stream, id) {
    const sink = new Sink(room, owner, stream, id);
    room.sinksById.set(id, sink);
    room.weakStreamsBySink.set(sink, stream);
    room.weakParticipantsBySink.set(sink, owner);
    owner.sinksByStream.set(stream, sink);
    stream.sinksByParticipant.set(owner, sink);
    return sink;
  },
  disposeRefs(sink) {
    const { room, owner, stream, id } = sink;
    room.sinksById.delete(id);
    room.weakStreamsBySink.delete(this);
    room.weakParticipantsBySink.delete(this);
    owner.sinksByStream.delete(stream);
    stream.sinksByParticipant.delete(owner);
  }
};

module.exports = Sink;
module.exports.State = State;
module.exports.Event = Event;
module.exports.Builder = Builder;
