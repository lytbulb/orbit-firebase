import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';

export default Class.extend({
  enqueue: function(func){
    this._queue = this._queue || Orbit.resolve();
    this._queue = this._queue.then(func);
    return this._queue;
  }
});
