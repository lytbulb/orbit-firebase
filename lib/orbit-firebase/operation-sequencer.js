import Evented from 'orbit/evented';
import { Class } from 'orbit/lib/objects';

export default Class.extend({
  init: function(cache, schema){
    window.operationSequencer = this;
    Evented.extend(this);
    this._cache = cache;
    this._schema = schema;
    this._dependents = {};
    this._dependencies = {};
  },

  process: function(operation){
    var recordPath = [operation.path[0], operation.path[1]].join("/");
    var record = this._cache.retrieve(recordPath);

    if(operation.op === 'remove'){
      this._processRecordOperation(operation);
    }
    else if(operation.path.length === 2){
      // don't add or replace existing records - they're already guaranteed to be up to date by subscriptions
      if(!record){
        this._processRecordOperation(operation);
      }
    }
    else if(operation.path.length === 3){
      if(record){
        this._emit(operation);
      }
      else {
        // don't apply attribute operations that arrive before record has been added
        // (add record operation already includes all the attributes)
      }
    }
    else if (this._isHasManyInitializationOp(operation)){
      if(!record){
        this._deferUntilRecordAdded(operation, recordPath);
      }
      else {
        this._emit(operation);
      }
    }
    else {
      var relatedRecordPath = this._getRelatedRecordPath(operation);
      var relatedRecord = this._cache.retrieve(relatedRecordPath);

      if(record && relatedRecord){
        this._emit(operation);
      }
      else {
        if(!record) this._deferUntilRecordAdded(operation, recordPath);
        if(!relatedRecord) this._deferUntilRecordAdded(operation, relatedRecordPath);
      }
    }
  },

  _isHasManyInitializationOp: function(operation){
    var path = operation.path;
    return path.length === 4 && this._schema.linkDefinition(path[0], path[3]).type === 'hasMany';
  },

  _processRecordOperation: function(operation){
    this._emit(operation);
    this._triggerDeferred(operation);
  },

  _getRelatedRecordPath: function(operation){
    var recordType = operation.path[0];
    var linkName = operation.path[3];
    var linkedType = this._schema.linkDefinition(recordType, linkName).model;
    var linkedId = operation.path.length === 5 ? operation.path[4] : operation.value;
    return [linkedType, linkedId].join("/");
  },

  _deferUntilRecordAdded: function(operation, recordPath){
    var operationPath = operation.path.join("/");
    this._dependents[recordPath] = this._dependents[recordPath] || [];
    this._dependencies[operationPath] = this._dependencies[operationPath] || {};
    this._dependents[recordPath].push(operation);
    this._dependencies[operationPath][recordPath] = true;
  },

  _triggerDeferred: function(operation){
    var _this = this;
    var recordPath = operation.path.join("/");
    var dependents = this._dependents[recordPath];

    if(!dependents) {
      return;
    }

    for(var i = 0; i < dependents.length; i++){
      var dependentOperation = dependents[i];
      var dependentOperationPath = dependentOperation.path.join("/");
      delete _this._dependencies[dependentOperationPath][recordPath];
      if(Object.keys(_this._dependencies[dependentOperationPath]).length === 0) {
        this._emit(dependentOperation);
      }
    }

    delete this._dependents[recordPath];
  },

  _emit: function(operation){
    this._cache.transform(operation);
  },

  _summary: function(operation){
    return [operation.op, operation.path.join("/"), operation.value].join(" ");
  }
});
