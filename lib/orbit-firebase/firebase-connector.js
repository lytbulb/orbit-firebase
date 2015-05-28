import OC from 'orbit-common/main';
import TransformConnector from 'orbit/transform-connector';
import OperationEncoder from 'orbit-common/operation-encoder';
import { eq } from 'orbit/lib/eq';

export default TransformConnector.extend({
  init: function(source, target, schema, options){
    this._super(source, target, options);
    this._operationEncoder = new OperationEncoder(schema);
  },

  transform: function(operation) {
    // console.log('****', ' transform from ', this.source.id, ' to ', this.target.id, operation);

    var _this = this;

    // If the target is currently processing a transformation and this
    // operation does not belong to that transformation, then wait for the
    // transformation to complete before applying this operation.
    //
    // This will be called recursively to process multiple transformations if
    // necessary.
    var currentTransformation = this.target.currentTransformation();
    if (currentTransformation && !currentTransformation.verifyOperation(operation)) {
      // console.log('>>>> TransformConnector#transform - waiting', this.source.id, this.target.id, operation);
      return currentTransformation.process().then(function() {
        // console.log('<<<< TransformConnector#transform - done waiting', _this.source.id, _this.target.id, operation);
        return _this.transform(operation);
      });
    }

    var operations = this.buildTransformation(operation);
    return this.target.transform(operations);
  },

  buildTransformation: function(operation){
    var operationType = this._operationEncoder.identify(operation);
    console.log("operationType", operationType);

    var record = this.target.retrieve(operation.path[0], operation.path[1]);
    var currentValue = this.target.retrieve(operation.path);
    if (eq(currentValue, operation.value)) return [];

    switch(operationType){
      case 'replaceRecord': return [operation];
      case 'addHasMany': return this._modifyLinkValue(operation, record, currentValue);
      case 'replaceHasMany': return this._replaceLinkValue(operation, record);
      case 'removeHasMany': return this._modifyLinkValue(operation, record, currentValue);
      case 'addHasOne': return this._modifyLinkValue(operation, record, currentValue);
      case 'replaceHasOne': return this._replaceLinkValue(operation, record);
      case 'removeHasOne': return this._modifyLinkValue(operation, record, currentValue);
      case 'addToHasMany': return this._modifyHasManyContents(operation, record);
      case 'removeFromHasMany': return this._modifyHasManyContents(operation, record);
      default: return [operation];
    }
  },

  _replaceLinkValue: function(operation, record){
    return record ? [operation] : [];
  },

  _modifyLinkValue: function(operation, record, currentValue){
    return record && currentValue === OC.LINK_NOT_INITIALIZED ? [operation] : [];
  },

  _modifyHasManyContents: function(operation, record){
    var linkPath = operation.path.slice(0,4);
    var linkValue = this.target.retrieve(linkPath);
    if(linkValue === OC.LINK_NOT_INITIALIZED) throw new Error("Can not add to a hasMany that hasn't been initialized");
    return record ? [operation] : [];
  }
});
