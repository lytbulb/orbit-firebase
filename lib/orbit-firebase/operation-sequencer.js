import Evented from 'orbit/evented';
import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';

export default Class.extend({
  init: function(cache, schema){
    window.operationSequencer = this;
    Evented.extend(this);
    this._cache = cache;
    this._schema = schema;
    this._schemaUtils = new SchemaUtils(schema);
    this._dependents = {};
    this._dependencies = {};
  },

  process: function(operation){
    if(this._isRedundent(operation)) return;

    var requiredPaths = this._requiredPathsFor(operation);
    var missingPaths = this._withoutExistingPaths(requiredPaths);

    if(missingPaths.length > 0){
      this._deferOperation(operation, missingPaths);
    }
    else {
      this._emit(operation);
    }
  },

  _emit: function(operation){
    this.emit('didTransform', operation);
    this._triggerOperationsDependentOn(operation);
  },

  _isRedundent: function(operation){
    var recordPath = [operation.path[0], operation.path[1]].join("/");
    var record = this._cache.retrieve(recordPath);

    if(record && operation.path.length === 2 && operation.op !== 'remove') return true;
    if(!record && operation.path.length === 3) return true;
    return false;
  },

  _requiredPathsFor: function(operation){
    if (this._isRecordOp(operation)) return [];

    var recordPath = this._getRecordPath(operation);
    if (this._isModifyAttributeOp(operation)) return [recordPath];
    if (this._isModifyHasOneOp(operation)) return [recordPath];
    if (this._isInitializeHasManyOp(operation)) return [recordPath];

    var relatedRecordPath = this._getRelatedRecordPath(operation);
    var linkPath = this._getLinkPath(operation);
    if (this._isModifyHasManyOp(operation)) return [recordPath, relatedRecordPath, linkPath];

    return [];
  },

  _withoutExistingPaths: function(paths){
    var cache = this._cache;

    return paths.filter(function(path){

      var pathValue = cache.retrieve(path);
      return !pathValue || pathValue === Orbit.LINK_NOT_INITIALIZED;

    });
  },

  _deferOperation: function(operation, paths){
    var _this = this;

    paths.forEach(function(path){
      _this._addPathDependency(operation, path);
    });
  },

  _addPathDependency: function(operation, path){
    var operationPath = operation.path.join("/");
    this._dependents[path] = this._dependents[path] || [];
    this._dependencies[operationPath] = this._dependencies[operationPath] || {};
    this._dependents[path].push(operation);
    this._dependencies[operationPath][path] = true;
  },

  _triggerOperationsDependentOn: function(operation){
    var _this = this;
    var path = operation.path.join("/");
    var dependents = this._dependents[path];

    if(!dependents) {
      return;
    }

    for(var i = 0; i < dependents.length; i++){
      var dependentOperation = dependents[i];
      var dependentOperationPath = dependentOperation.path.join("/");

      delete _this._dependencies[dependentOperationPath][path];

      if(Object.keys(_this._dependencies[dependentOperationPath]).length === 0) {
        this._emit(dependentOperation);
      }
    }

    delete this._dependents[path];
  },

  _isRecordOp: function(operation){
    return operation.path.length === 2;
  },

  _isInitializeHasManyOp: function(operation){
    var path = operation.path;
    return path.length === 4 && this._schema.linkDefinition(path[0], path[3]).type === 'hasMany';
  },

   _isModifyHasOneOp: function(operation){
    var path = operation.path;
    return this._schema.linkDefinition(path[0], path[3]).type === 'hasOne' && path.length === 4;
  },

  _isModifyAttributeOp: function(operation){
    return operation.path.length === 3;
  },

  _isModifyHasManyOp: function(operation){
    var path = operation.path;
    return this._schema.linkDefinition(path[0], path[3]).type === 'hasMany' && path.length > 4;
  },

  _getRecordPath: function(operation){
    return [operation.path[0], operation.path[1]].join("/");
  },

  _getRelatedRecordPath: function(operation){
    var recordType = operation.path[0];
    var linkName = operation.path[3];
    var linkedType = this._schema.linkDefinition(recordType, linkName).model;
    var linkedId = operation.path.length === 5 ? operation.path[4] : operation.value;
    return [linkedType, linkedId].join("/");
  },

  _getLinkPath: function(operation){
    return operation.path.slice(0, 4).join("/");
  }
});
