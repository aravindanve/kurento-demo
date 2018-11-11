const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const Room = require('./Room');
const Participant = require('./Participant');
const Message = require('./Message');
const config = require('./config');

const serverOptions = {
  key: fs.readFileSync(path.resolve(config.tlsKeyFile)),
  cert: fs.readFileSync(path.resolve(config.tlsCertFile))
};

const static = express.static(path.resolve(config.clientDir));
const app = express().use(static);
const server = new https.createServer(serverOptions, app);
const wss = new WebSocket.Server({ server, path: '/' });

const room = new Room();

setInterval(() => {
  if (room.state === Room.State.READY && !room.size) {
    console.log('No participants, releasing pipeline...');
    room.releasePipeline();
  }
}, 1000);

const broadcast = (alert, data) => {
  const { participantId, ...event } = data;
  const message = JSON.stringify({ alert, ...event });
  clientsLoop:
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      if (participantId && ws.id === participantId) {
        continue clientsLoop;
      }
      ws.send(message);
    }
  }
};

room.on(Room.Event.READY, e =>
  broadcast(Message.READY, e));

room.on(Room.Event.PARTICIPANT_CREATED, ({ participantId, ...e }) =>
  broadcast(Message.PARTICIPANTS_JOINED, { participantId, items: [e] }));

room.on(Room.Event.PARTICIPANT_DISPOSED, ({ participantId, ...e }) =>
  broadcast(Message.PARTICIPANTS_LEFT, { participantId, items: [e] }));

room.on(Room.Event.STREAM_CREATED, ({ participantId, ...e }) =>
  broadcast(Message.STREAMS_CREATED, { participantId, items: [e] }));

room.on(Room.Event.STREAM_DISPOSED, ({ participantId, ...e }) =>
  broadcast(Message.STREAMS_DESTROYED, { participantId, items: [e] }));

// TEMP: do not broadcast room errors
room.on(Room.Event.ERROR, e =>
  broadcast(Message.ERROR, e));

wss.on('connection', ws => {
  console.log('INFO WebSocket connection');
  let participantJoining = false;

  const emit = (alert, data) =>
    ws.send(JSON.stringify({ alert, ...data }));

  ws.on('error', e => {
    console.log('ERROR', e.message);
  });

  ws.on('close', () => {
    console.log('INFO WebSocket close', ws.id);
    ws.id && room.disposeParticipant(ws.id);
  });

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (!(data && data.action)) {
        throw new Error('No action specified');
      }
      if (participantJoining) {
        throw new Error('Participant is in joining state');
      }
      if (data.action === Message.JOIN && ws.id) {
        throw new Error('Participant already joined');
      }
      if (!ws.id && data.action !== Message.JOIN) {
        throw new Error('Participant not joined');
      }
      switch (data.action) {
        case Message.JOIN:
          participantJoining = true;
          ws.id = data.id;
          room.createParticipant(data.id, (err, participant) => {
            participantJoining = false;
            if (err) {
              ws.id = undefined;
              emit(Message.ERROR, { message: err.message });
              return;
            }
            participant.on(Participant.Event.CREATED, e => {
              emit(Message.JOINED, {
                type: e.type,
                id: e.id,
                participants: room.getParticipants(ws.id),
                streams: room.getStreams()
              });
            });
            participant.on(Participant.Event.DISPOSED, e =>
              emit(Message.LEFT, e));
            participant.on(Participant.Event.STREAM_CREATED, e =>
              emit(Message.PUBLISHED, e));
            participant.on(Participant.Event.STREAM_DISPOSED, e =>
              emit(Message.UNPUBLISHED, e));
            participant.on(Participant.Event.SINK_CREATED, e =>
              emit(Message.SUBSCRIBED, e));
            participant.on(Participant.Event.SINK_DISPOSED, e =>
              emit(Message.UNSUBSCRIBED, e));
            participant.on(Participant.Event.ICE_CANDIDATE, e =>
              emit(Message.ICE_CANDIDATE, e));
            participant.on(Participant.Event.ERROR, e =>
              emit(Message.ERROR, e));
          });
          break;
        case Message.LEAVE:
          room.disposeParticipant(ws.id);
          delete ws.id;
          break;
        case Message.PUBLISH:
          room.createStream(
            ws.id, data.id, data.sdpOffer);
          break;
        case Message.UNPUBLISH:
          room.disposeStream(
            ws.id, data.id);
          break;
        case Message.SUBSCRIBE:
          room.createSink(
            ws.id, data.streamId, data.id, data.sdpOffer);
          break;
        case Message.UNSUBSCRIBE:
          room.disposeSink(
            ws.id, data.id);
          break;
        case Message.ICE_CANDIDATE:
          room.receiveIceCandidate(
            ws.id, data.id, data.type, data.candidate);
          break;
        default:
          throw new Error('Invalid action');
      }

    } catch (err) {
      console.log('ERROR', err);
      emit(Message.ERROR, { message: err.message });
    }
  });

  if (room.state === Room.State.READY) {
    emit(Message.READY);

  } else if (room.state === Room.State.NEW) {
    console.log('First participant, creating pipeline...');
    room.createPipeline();
  }
});

server.listen(config.port, config.host, () =>
  console.log(`LISTENING on https://${config.host}:${config.port}`));
