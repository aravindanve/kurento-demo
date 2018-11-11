const sdk = require('./sdk');

const localVideoElement = document.createElement('video');

const room = sdk.createRoom('default', 'wss://localhost:8443');
const localStream = sdk.createLocalStream(localVideoElement, {
  audio: true,
  video: { width: 1280, height: 720 }
});

const mainPanel = document.createElement('div');
const rightPanel = document.createElement('div');
const roomPanel = document.createElement('div');
const participantsPanel = document.createElement('div');
const streamsPanel = document.createElement('div');
const startButton = document.createElement('button');
const stopButton = document.createElement('button');
const joinButton = document.createElement('button');
const leaveButton = document.createElement('button');
const publishButton = document.createElement('button');
const unpublishButton = document.createElement('button');

document.body.style.color = '#00f';
document.body.style.fontFamily = 'monospace';
document.body.style.fontWeight = 'bold';
document.body.style.fontSize = '10px';

mainPanel.style.position = 'relative';

rightPanel.style.position = 'absolute';
rightPanel.style.top = '0';
rightPanel.style.right = '0';
rightPanel.style.bottom = '0';
rightPanel.style.width = '30vw';
rightPanel.style.padding = '15px';
rightPanel.style.textAlign = 'right';

localVideoElement.muted = true;
localVideoElement.autoplay = true;
localVideoElement.style.height = '240px';
localVideoElement.style.borderRadius = '5px';
localVideoElement.style.backgroundColor = '#eee';
localVideoElement.style.border = '#f30 solid 2px';
localVideoElement.style.boxSizing = 'border-box';

startButton.innerText = 'Start';
startButton.onclick = () => {
  localStream.start(err => err
    ? console.error(err)
    : console.log('LocalStream started'));
};

stopButton.innerText = 'Stop';
stopButton.onclick = () => {
  localStream.stop(err => err
    ? console.error(err)
    : console.log('LocalStream stopped'));
};

joinButton.innerText = 'Join';
joinButton.onclick = () => {
  room.join(err => err
    ? console.error(err)
    : console.log('Room joined'));
};

leaveButton.innerText = 'Leave';
leaveButton.onclick = () => {
  room.leave(err => err
    ? console.error(err)
    : console.log('Room left'));
};

publishButton.innerText = 'Publish';
publishButton.onclick = () => {
  room.publish(localStream, err => err
    ? console.error(err)
    : console.log('Published stream'));
};

unpublishButton.innerText = 'Unpublish';
unpublishButton.onclick = () => {
  room.unpublish(localStream, err => err
    ? console.error(err)
    : console.log('Unpublished stream'));
};

rightPanel.appendChild(startButton);
rightPanel.appendChild(stopButton);
rightPanel.appendChild(document.createElement('br'));
rightPanel.appendChild(joinButton);
rightPanel.appendChild(leaveButton);
rightPanel.appendChild(document.createElement('br'));
rightPanel.appendChild(publishButton);
rightPanel.appendChild(unpublishButton);
rightPanel.appendChild(document.createElement('br'));
rightPanel.appendChild(roomPanel);
rightPanel.appendChild(document.createElement('br'));
rightPanel.appendChild(participantsPanel);
rightPanel.appendChild(document.createElement('br'));
rightPanel.appendChild(streamsPanel);

mainPanel.appendChild(localVideoElement);
rightPanel.appendChild(document.createElement('br'));

document.body.appendChild(mainPanel);
document.body.appendChild(rightPanel);

room.on(sdk.RoomEvent.JOINED, me => {
  console.log('RoomEvent joined', me);
  const status = document.createElement('p');
  const participantInfo = document.createElement('p');
  status.innerText = 'status: joined';
  participantInfo.innerText = `me_${me.id}`;
  roomPanel.innerHTML = '';
  roomPanel.appendChild(status);
  roomPanel.appendChild(participantInfo);
});
room.on(sdk.RoomEvent.LEFT, () => {
  console.log('RoomEvent left');
  const status = document.createElement('p');
  status.innerText = 'status: left';
  roomPanel.innerHTML = '';
  roomPanel.appendChild(status);
  participantsPanel.innerHTML = '';
  streamsPanel.innerHTML = '';
});
room.on(sdk.RoomEvent.PARTICIPANTS_JOINED, e => {
  console.log('RoomEvent participants joined', e);
  for (const item of e) {
    const elem = document.createElement('p');
    const data = `peer_${item.id}`;
    elem.id = data;
    elem.innerText = data;
    participantsPanel.append(elem);
  }
});
room.on(sdk.RoomEvent.PARTICIPANTS_LEFT, e => {
  console.log('RoomEvent participants left', e);
  for (const item of e) {
    const data = `peer_${item.id}`;
    const elem = document.getElementById(data);
    if (elem) {
      elem.remove();
    }
  }
});
room.on(sdk.RoomEvent.STREAMS_CREATED, e => {
  console.log('RoomEvent streams created', e);
  for (const item of e) {
    const elem = document.createElement('p');
    const data = `stream_${item.id}`;
    const dataElem = document.createElement('span');
    const subscribeButton = document.createElement('button');
    const unsubscribeButton = document.createElement('button');
    dataElem.innerText = data;

    subscribeButton.innerText = 'Subscribe';
    subscribeButton.onclick = () => {
      const data = `remote_${item.id}`;
      const wrapper = document.createElement('div');
      wrapper.id = data;
      wrapper.style.position = 'relative';
      const tag = document.createElement('div');
      tag.style.position = 'absolute';
      tag.style.top = '5px';
      tag.style.left = '5px';
      tag.style.color = '#f30';
      tag.innerText = data;
      const remoteVideoElement = document.createElement('video');
      remoteVideoElement.autoplay = true;
      remoteVideoElement.style.height = '240px';
      remoteVideoElement.style.borderRadius = '5px';
      remoteVideoElement.style.backgroundColor = '#eee';
      remoteVideoElement.srcObject = e.mediaStream;
      wrapper.appendChild(remoteVideoElement);
      wrapper.appendChild(tag);
      mainPanel.appendChild(wrapper);
      room.subscribe(item, remoteVideoElement, err => err
        ? console.error(err)
        : console.log('Subscribed to stream', item));
    };

    unsubscribeButton.innerText = 'Unsubscribe';
    unsubscribeButton.onclick = () => {
      room.unsubscribe(item, err => err
        ? console.error(err)
        : console.log('Unsubscribed from stream', item));
    };

    elem.id = data;
    elem.appendChild(dataElem);
    elem.appendChild(subscribeButton);
    elem.appendChild(unsubscribeButton);
    streamsPanel.append(elem);
  }
});
room.on(sdk.RoomEvent.STREAMS_DESTROYED, e => {
  console.log('RoomEvent streams destroyed', e);
  for (const item of e) {
    const data = `stream_${item.id}`;
    const elem = document.getElementById(data);
    if (elem) {
      elem.remove();
    }
  }
});
room.on(sdk.RoomEvent.STREAM_PUBLISHED, e => console.log('RoomEvent stream published', e));
room.on(sdk.RoomEvent.STREAM_UNPUBLISHED, e => console.log('RoomEvent stream unpublished', e));
room.on(sdk.RoomEvent.STREAM_SUBSCRIBED, e => {
  console.log('RoomEvent stream subscribed', e);
  // const data = `remote_${e.id}`;
  // const wrapper = document.createElement('div');
  // wrapper.id = data;
  // wrapper.style.position = 'relative';
  // const tag = document.createElement('div');
  // tag.style.position = 'absolute';
  // tag.style.top = '5px';
  // tag.style.left = '5px';
  // tag.style.color = '#f30';
  // tag.innerText = data;
  // const remoteVideoElement = document.createElement('video');
  // remoteVideoElement.autoplay = true;
  // remoteVideoElement.style.height = '240px';
  // remoteVideoElement.style.borderRadius = '5px';
  // remoteVideoElement.style.backgroundColor = '#eee';
  // remoteVideoElement.srcObject = e.mediaStream;
  // wrapper.appendChild(remoteVideoElement);
  // wrapper.appendChild(tag);
  // mainPanel.appendChild(wrapper);
});
room.on(sdk.RoomEvent.STREAM_UNSUBSCRIBED, e => {
  console.log('RoomEvent stream unsubscribed', e);
  const data = `remote_${e.id}`;
  const elem = document.getElementById(data);
  if (elem) {
    elem.remove();
  }
});
room.on(sdk.RoomEvent.ERROR, err => console.warn('RoomEvent error', err));
