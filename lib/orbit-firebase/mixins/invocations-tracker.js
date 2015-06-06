import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { extend } from 'orbit/lib/objects';
import Evented from 'orbit/evented';

var InvocationsTracker = {

  extend: function(object) {
    Evented.extend(object);

    if (object._invocationsTracker === undefined) {
      extend(object, this.interface);
      object._invocations = [];
    }
    return object;
  },

  interface: {
    _invocationsTracker: true,

    _trackInvocations: function(callback){
      var invocations = this._invocations;
      var _this = this;

      return function(){
        var args = arguments;
        var promise = callback.apply(_this, args);
        invocations.push(promise);

        var startTime = new Date().getTime();

        return promise.finally(function(){
          var index = invocations.indexOf(promise);

          if (index > -1) {
            invocations.splice(index, 1);
          }

          if(invocations.length === 0){
            _this.emit("_clearedInvocations");
          }

          var invocationTime = Math.round((new Date().getTime() - startTime)/1000);

          if(invocationTime > 3) {
            console.log("time: ", invocationTime, args);
          }
        });
      };
    },

    then: function(callback){
      var _this = this;

      return new Promise(function(resolve, reject){
        if(_this._invocations.length === 0) resolve(callback());
        else _this.one("_clearedInvocations", function(){
          resolve(callback());
        });
      });
    }
  }
};

export default InvocationsTracker;
