class Dispatcher {
  constructor() {
    this.listeners = {};
  }

  on(type, listener) {
    if (!(type && listener)) return this;
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
    return this;
  }

  off(type, listener) {
    if (!type) {
      this.listeners = {};
      return this;
    }
    if (!listener) {
      delete this.listeners[type];
      return this;
    }
    if (!(type in this.listeners)) {
      return this;
    }
    const stack = this.listeners[type];
    const index = stack.indexOf(listener);
    if (index > -1) {
      stack.splice(index, 1);
    }
    return this;
  }

  emit(type, event) {
    process.nextTick(() => {
      if (!(type in this.listeners)) return;
      const stack = this.listeners[type];

      for (let i = 0; i < stack.length; i++) {
        stack[i].call(this, event);
      }
    });
    return this;
  }
}

module.exports = Dispatcher;
