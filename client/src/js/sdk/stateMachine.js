export class StateMachine {
  transitions = {};

  constructor() {
    this._state = undefined;
  }

  get state() {
    return this._state;
  }

  set state(targetState) {
    const sourceState = this._state;
    const transitions = this.transitions[sourceState] || {};
    if (sourceState && !transitions[targetState]) {
      throw new Error(
        `Illegal transition from ${sourceState} to ${targetState}`);
    }
    this._state = targetState;
  }
}
