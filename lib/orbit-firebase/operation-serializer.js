import { Class } from 'orbit/lib/objects';

export default Class.extend({
  init: function(firebaseSerializer){
    this._firebaseSerializer = firebaseSerializer;
  },

  serialize: function(operation){
    var serializedOperation = operation.serialize();

    if(operation.op === 'add' && operation.path.length === 2){
      var type = operation.path[0];
      serializedOperation.value = this._firebaseSerializer.serialize(type, serializedOperation.value);
    }

    return serializedOperation;
  }
});
