const Dispatcher = require('./Dispatcher');
const Stream = require('./Stream');
const Sink = require('./Sink');

const State = {
  READY: 'ready',
  DISPOSED: 'disposed'
};

const Event = {
  CREATED: 'created',
  DISPOSED: 'disposed',
  STREAM_CREATED: 'streamCreated',
  STREAM_DISPOSED: 'streamDisposed',
  SINK_CREATED: 'sinkCreated',
  SINK_DISPOSED: 'sinkDisposed',
  ICE_CANDIDATE: 'iceCandidate',
  ERROR: 'error'
};

class Participant {
  constructor(room, id) {
    this.state = State.READY;
    this.room = room;
    this.id = id;
    this.streamsById = new Map();
    this.sinksByStream = new Map();
    this.dispatcher = new Dispatcher();
    this.dispatch = (type, event) => {
      this.dispatchParticipantEvent(type, event);
      this.room.dispatchParticipantEvent(this, type, event);
    };
  }

  static get resourceType() {
    return 'participant';
  }

  get resourceType() {
    return this.constructor.resourceType;
  }

  on(type, event) {
    this.dispatcher.on(type, event);
  }

  off(type, event) {
    this.dispatcher.off(type, event);
  }

  create(cb) {
    this.dispatch(Event.CREATED);
    cb && cb(undefined, this);
  }

  createStream(streamId, sdpOffer, cb) {
    if (this.room.streamsById.has(streamId)) {
      const err = new Error('Stream with id already exists');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const stream = Stream.Builder.build(this.room, this, streamId);
    stream.create(sdpOffer, cb);
  }

  disposeStream(streamId, cb) {
    if (!this.room.streamsById.has(streamId)) {
      const err = new Error('Stream not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const stream = this.room.streamsById.get(streamId);
    if (stream.owner !== this) {
      const err = new Error('Not stream owner');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    stream.dispose(cb);
  }

  createSink(streamId, sinkId, sdpOffer, cb) {
    if (!this.room.streamsById.has(streamId)) {
      const err = new Error('Stream not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const stream = this.room.streamsById.get(streamId);
    if (this.room.sinksById.has(sinkId)) {
      const err = new Error('Sink with id already exists');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    // dispose sink for stream if exists
    if (this.sinksByStream.has(stream)) {
      this.sinksByStream.get(stream).dispose();
    }
    const sink = Sink.Builder.build(this.room, this, stream, sinkId);
    sink.create(sdpOffer, cb);
  }

  disposeSink(sinkId, cb) {
    if (!this.room.sinksById.has(sinkId)) {
      const err = new Error('Sink not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const sink = this.room.sinksById.get(sinkId);
    if (sink.owner !== this) {
      const err = new Error('Not sink owner');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    sink.dispose(cb);
  }

  dispose(cb) {
    this.state = State.DISPOSED;
    this.off();
    for (const stream of this.streamsById.values()) {
      stream.dispose();
    }
    this.streamsById.clear();
    for (const sink of this.sinksByStream.values()) {
      sink.dispose();
    }
    this.sinksByStream.clear();
    Builder.disposeRefs(this);
    this.dispatch(Event.DISPOSED);
    cb && cb(undefined, this);
  }

  receiveIceCandidate(resourceId, resourceType, candidate, cb) {
    let resource;
    if (resourceType === Stream.resourceType) {
      if (!this.room.streamsById.has(resourceId)) {
        const err = new Error('Stream not found');
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      const stream = this.room.streamsById.get(resourceId);
      if (stream.owner !== this) {
        const err = new Error('Not stream owner');
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      resource = stream;

    } else if (resourceType === Sink.resourceType) {
      if (!this.room.sinksById.has(resourceId)) {
        const err = new Error('Sink not found');
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      const sink = this.room.sinksById.get(resourceId);
      if (sink.owner !== this) {
        const err = new Error('Not sink owner');
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      resource = sink;

    } else {
      const err = new Error('Invalid resource type');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    resource.addIceCandidate(candidate, cb);
    cb && cb(undefined, this);
  }

  dispatchParticipantEvent(type, event) {
    switch (type) {
      case Participant.Event.CREATED:
        this.dispatcher.emit(Event.CREATED, {
          type: this.resourceType,
          id: this.id
        });
        break;
      case Participant.Event.DISPOSED:
        this.dispatcher.emit(Event.DISPOSED, {
          type: this.resourceType,
          id: this.id
        });
        break;
      case Participant.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          type: this.resourceType,
          id: this.id,
          message: event && event.message
        });
        break;
    }
  }

  dispatchStreamEvent(stream, type, event) {
    switch (type) {
      case Stream.Event.CREATED:
        this.dispatcher.emit(Event.STREAM_CREATED, {
          type: stream.resourceType,
          id: stream.id,
          sdpAnswer: stream.sdpAnswer
        });
        break;
      case Stream.Event.DISPOSED:
        this.dispatcher.emit(Event.STREAM_DISPOSED, {
          type: stream.resourceType,
          id: stream.id
        });
        break;
      case Stream.Event.ICE_CANDIDATE:
        this.dispatcher.emit(Event.ICE_CANDIDATE, {
          type: stream.resourceType,
          id: stream.id,
          candidate: event
        });
        break;
      case Stream.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          type: stream.resourceType,
          id: stream.id,
          message: event && event.message
        });
        break;
    }
  }

  dispatchSinkEvent(sink, type, event) {
    switch (type) {
      case Sink.Event.CREATED:
        this.dispatcher.emit(Event.SINK_CREATED, {
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id,
          sdpAnswer: sink.sdpAnswer
        });
        break;
      case Sink.Event.DISPOSED:
        this.dispatcher.emit(Event.SINK_DISPOSED, {
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id
        });
        break;
      case Sink.Event.ICE_CANDIDATE:
        this.dispatcher.emit(Event.ICE_CANDIDATE, {
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id,
          candidate: event
        });
        break;
      case Sink.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id,
          message: event && event.message
        });
        break;
    }
  }
}

const Builder = {
  build(room, id) {
    const participant = new Participant(room, id);
    room.participantsById.set(id, participant);
    return participant;
  },
  disposeRefs(participant) {
    const { room, id } = participant;
    room.participantsById.delete(id);
  }
};

module.exports = Participant;
module.exports.State = State;
module.exports.Event = Event;
module.exports.Builder = Builder;
