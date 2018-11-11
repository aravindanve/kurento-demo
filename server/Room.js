const Dispatcher = require('./Dispatcher');
const Participant = require('./Participant');
const Stream = require('./Stream');
const Sink = require('./Sink');
const getKurento = require('./getKurento');

const State = {
  NEW: 'new',
  CREATING: 'creating',
  READY: 'ready',
  PIPELINE_FAILED: 'pipelineFailed'
};

const Event = {
  READY: 'ready',
  RELEASED: 'released',
  PARTICIPANT_CREATED: 'participantCreated',
  PARTICIPANT_DISPOSED: 'participantDisposed',
  STREAM_CREATED: 'streamCreated',
  STREAM_DISPOSED: 'streamDisposed',
  SINK_CREATED: 'sinkCreated',
  SINK_DISPOSED: 'sinkDisposed',
  ERROR: 'error'
};

class Room {
  constructor() {
    this.state = State.NEW;
    this.participantsById = new Map();
    this.weakParticipantsByStream = new WeakMap(); // TODO: remove?
    this.weakParticipantsBySink = new WeakMap(); // TODO: remove?
    this.streamsById = new Map();
    this.weakStreamsBySink = new WeakMap(); // TODO: remove?
    this.sinksById = new Map();
    this.pipeline = undefined;
    this.dispatcher = new Dispatcher();
    this.dispatch = (type, event) =>
      this.dispatchRoomEvent(type, event);
  }

  static get resourceType() {
    return 'room';
  }

  get resourceType() {
    return this.constructor.resourceType;
  }

  get size() {
    return this.participantsById.size;
  }

  getParticipants(...exclude) {
    const participants = [];
    const excluded = exclude.reduce((acc, id) =>
      (acc[id] = 1, acc), {});
    for (const participant of this.participantsById.values()) {
      !excluded[participant.id] && participants.push({
        type: participant.resourceType,
        id: participant.id
      });
    }
    return participants;
  }

  getStreams(...exclude) {
    const streams = [];
    const excluded = exclude.reduce((acc, id) =>
      (acc[id] = 1, acc), {});
    for (const stream of this.streamsById.values()) {
      !excluded[stream.id] && streams.push({
        type: stream.resourceType,
        id: stream.id
      });
    }
    return streams;
  }

  on(type, event) {
    this.dispatcher.on(type, event);
  }

  off(type, event) {
    this.dispatcher.off(type, event);
  }

  createPipeline(cb) {
    if (this.state !== State.NEW) {
      const err = new Error('Room not new');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.state = State.CREATING;
    getKurento((err, kurento) => {
      if (err) {
        this.state = State.NEW;
        return cb ? cb(err) : this.dispatch(Event.ERROR, err);
      }
      kurento.create('MediaPipeline', (err, pipeline) => {
        if (err) {
          this.state = State.PIPELINE_FAILED;
          return cb ? cb(err) : this.dispatch(Event.ERROR, err);
        }
        this.pipeline = pipeline;
        this.state = State.READY;
        this.dispatch(Event.READY);
        cb && cb(undefined, this);
      });
    });
  }

  releasePipeline(cb) {
    // TODO: release creating pipeline
    this.state = State.NEW;
    this.pipeline && this.pipeline.release();
    this.pipeline = undefined;
    this.dispatch(Event.RELEASED);
    cb && cb(undefined, this);
  }

  createParticipant(participantId, cb) {
    if (this.state !== State.READY) {
      const err = new Error('Room not ready');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    if (this.participantsById.has(participantId)) {
      const err = new Error('Participant with id already exists');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const participant = Participant.Builder.build(this, participantId);
    participant.create(cb);
  }

  disposeParticipant(participantId, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    const participant = this.participantsById.get(participantId);
    participant.dispose(cb);
  }

  createStream(participantId, streamId, sdpOffer, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.participantsById
      .get(participantId)
      .createStream(streamId, sdpOffer, cb);
  }

  disposeStream(participantId, streamId, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.participantsById
      .get(participantId)
      .disposeStream(streamId, cb);
  }

  createSink(participantId, streamId, sinkId, sdpOffer, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.participantsById
      .get(participantId)
      .createSink(streamId, sinkId, sdpOffer, cb);
  }

  disposeSink(participantId, sinkId, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.participantsById
      .get(participantId)
      .disposeSink(sinkId, cb);
  }

  receiveIceCandidate(participantId, resourceId, resourceType, candidate, cb) {
    if (!this.participantsById.has(participantId)) {
      const err = new Error('Participant not found');
      return cb ? cb(err) : this.dispatch(Event.ERROR, err);
    }
    this.participantsById
      .get(participantId)
      .receiveIceCandidate(resourceId, resourceType, candidate, cb);
  }

  dispatchRoomEvent(type, event) {
    switch (type) {
      case Event.READY:
        this.dispatcher.emit(Event.READY, {
          type: this.resourceType
        });
        break;
      case Event.RELEASED:
        this.dispatcher.emit(Event.RELEASED, {
          type: this.resourceType
        });
        break;
      case Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          type: this.resourceType,
          message: event && event.message
        });
        break;
    }
  }

  dispatchParticipantEvent(participant, type, event) {
    switch (type) {
      case Participant.Event.CREATED:
        this.dispatcher.emit(Event.PARTICIPANT_CREATED, {
          participantId: participant.id,
          type: participant.resourceType,
          id: participant.id
        });
        break;
      case Participant.Event.DISPOSED:
        this.dispatcher.emit(Event.PARTICIPANT_DISPOSED, {
          participantId: participant.id,
          type: participant.resourceType,
          id: participant.id
        });
        break;
      case Participant.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          participantId: participant.id,
          type: participant.resourceType,
          id: participant.id,
          message: event && event.message
        });
        break;
    }
  }

  dispatchStreamEvent(stream, type, event) {
    switch (type) {
      case Stream.Event.CREATED:
        this.dispatcher.emit(Event.STREAM_CREATED, {
          participantId: stream.owner.id,
          type: stream.resourceType,
          id: stream.id
        });
        break;
      case Stream.Event.DISPOSED:
        this.dispatcher.emit(Event.STREAM_DISPOSED, {
          participantId: stream.owner.id,
          type: stream.resourceType,
          id: stream.id
        });
        break;
      case Stream.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          participantId: stream.owner.id,
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
          participantId: sink.owner.id,
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id
        });
        break;
      case Sink.Event.DISPOSED:
        this.dispatcher.emit(Event.SINK_DISPOSED, {
          participantId: sink.owner.id,
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id
        });
        break;
      case Sink.Event.ERROR:
        this.dispatcher.emit(Event.ERROR, {
          participantId: sink.owner.id,
          streamId: sink.stream.id,
          type: sink.resourceType,
          id: sink.id,
          message: event && event.message
        });
        break;
    }
  }
}

module.exports = Room;
module.exports.State = State;
module.exports.Event = Event;
