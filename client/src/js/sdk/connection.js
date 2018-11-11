const { StateMachine } = require('./stateMachine');

export const ConnectionState = {
  READY: 'ready',
  OPENING: 'opening',
  OPEN: 'open',
  CLOSING: 'closing'
};

export class Connection extends StateMachine {
  transitions = {
    [ConnectionState.READY]: {
      [ConnectionState.OPENING]: true
    },
    [ConnectionState.OPENING]: {
      [ConnectionState.OPEN]: true,
      [ConnectionState.READY]: true
    },
    [ConnectionState.OPEN]: {
      [ConnectionState.CLOSING]: true,
      [ConnectionState.READY]: true
    },
    [ConnectionState.CLOSING]: {
      [ConnectionState.READY]: true
    }
  };

  constructor({ url }) {
    super();
    this.state = ConnectionState.READY;
    this.url = url;
    this.ws = undefined;
    this.onOpen = undefined;
    this.onClose = undefined;
    this.onMessage = undefined;
    this.onError = undefined;
  }

  open() {
    this.state = ConnectionState.OPENING;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = this._handleWsOpen;
    this.ws.onclose = this._handleWsClose;
    this.ws.onmessage = this._handleWsMessage;
    this.ws.onerror = this._handleWsError;
  }

  close() {
    this.state = ConnectionState.CLOSING;
    this.ws.close();
  }

  sendMessage(msg) {
    if (this.state !== ConnectionState.OPEN) {
      throw new Error(`Connection not open`);
    }
    this.ws.send(JSON.stringify(msg));
  }

  _handleWsOpen = () => {
    this.state = ConnectionState.OPEN;
    this.onOpen && this.onOpen();
  };

  _handleWsClose = () => {
    this.state = ConnectionState.READY;
    this.ws.onopen = undefined;
    this.ws.onclose = undefined;
    this.ws.onmessage = undefined;
    this.ws.onerror = undefined;
    this.ws = undefined;
    this.onClose && this.onClose();
  };

  _handleWsMessage = e => {
    this.onMessage && this.onMessage(JSON.parse(e.data));
  };

  _handleWsError = e => {
    this.onError && this.onError(new Error(e.message));
  };
}
