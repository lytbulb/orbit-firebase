import { eq } from 'orbit/lib/eq';
import { Class } from 'orbit/lib/objects';

var OperationFilter = Class.extend({
  init: function(){
    this._blockedOperations = {};
  },

  blockNext: function(operation){
    var path = operation.path.join('/');
    if(!this._blockedOperations[path]) this._blockedOperations[path] = [];
    this._blockedOperations[path].push(operation);
  },

  blocksNext: function(operation){
    if(this.isBlocked(operation)){
      this.unblock(operation);
      console.log("blocked", operation.serialize());
      return true;
    }
    return false;
  },

  isBlocked: function(operation){
    var path = operation.path.join('/');
    return this._blockedOperations[path] && this._operationIndex(this._blockedOperations[path], operation) !== -1;
  },

  unblock: function(operation){
    var path = operation.path.join('/');
    var index = this._operationIndex(this._blockedOperations[path], operation);
    this._blockedOperations[path].splice(index, 1);
  },

  _operationIndex: function(collection, operation){
    var candidate;
    var i;

    for(i = 0; i < collection.length; i++){
      candidate = collection[i];
      if(eq(candidate.value, operation.value) && eq(candidate.op, operation.op)){
        return i;
      }
    }

    return -1;
  }
});

export default OperationFilter;
