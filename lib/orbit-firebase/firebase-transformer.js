import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import { eq } from 'orbit/lib/eq';
import AddRecord from 'orbit-firebase/transformers/add-record';
import RemoveRecord from 'orbit-firebase/transformers/remove-record';
import ReplaceAttribute from 'orbit-firebase/transformers/replace-attribute';
import AddToHasMany from 'orbit-firebase/transformers/add-to-has-many';
import AddToHasOne from 'orbit-firebase/transformers/add-to-has-one';
import RemoveHasOne from 'orbit-firebase/transformers/remove-has-one';
import ReplaceHasMany from 'orbit-firebase/transformers/replace-has-many';
import RemoveFromHasMany from 'orbit-firebase/transformers/remove-from-has-many';
import UpdateMeta from 'orbit-firebase/transformers/update-meta';
import RelatedInverseLinksProcessor from 'orbit-firebase/related-inverse-links';
import OperationSerializer from 'orbit-firebase/operation-serializer';
import Evented from 'orbit/evented';

export default Class.extend({
	init: function(firebaseClient, schema, serializer, cache){
		Evented.extend(this);

		this._schema = schema;
		this._firebaseClient = firebaseClient;
		this._operationSerializer = new OperationSerializer(serializer);
		this._relatedInverseLinksProcessor = new RelatedInverseLinksProcessor(schema, cache);

		this._transformers = [
			new AddRecord(firebaseClient, schema, serializer),
			new RemoveRecord(firebaseClient),
			new ReplaceAttribute(firebaseClient, schema),
			new AddToHasMany(firebaseClient, schema),
			new AddToHasOne(firebaseClient, schema),
			new RemoveHasOne(firebaseClient, schema),
			new ReplaceHasMany(firebaseClient, schema),
			new RemoveFromHasMany(firebaseClient, schema),
			new UpdateMeta(cache)
		];

	},

	transform: function(primaryOperation){
		var _this = this;
		var result;

		var transformation = this._buildTransformation(primaryOperation);

		var pending = transformation.map(function(operation){
			var transformResult = _this._transformOperation(operation);
			
			if(eq(operation.serialize(), primaryOperation.serialize())) {
				result = transformResult;
			}
		});

		if(!result) throw new Error("Result from primaryOperation is missing");

		return Orbit.all(pending).then(function(){
			return result;
		});
	},

	_buildTransformation: function(operation){
		return this._relatedInverseLinksProcessor.process(operation);
	},

	_transformOperation: function(operation){
		var _this = this;
		var transformer = this._findTransformer(operation);

		this.emit('willTransform', operation);
		return transformer.transform(operation).then(function(result){
			return _this._logOperation(operation).then(function(){
				return result;
			});
		});		
		// todo handle failed transforms (remove from blocked)
	},

	_logOperation: function(operation){
		var serializedOperation = this._operationSerializer.serialize(operation);
		return this._firebaseClient.push('operation', serializedOperation);
	},

	_findTransformer: function(operation){
		for(var i = 0; i < this._transformers.length; i++){
			var transformer = this._transformers[i];

			if(transformer.handles(operation)) {
				return transformer;
			}
		}

		throw new Error("Couldn't find a transformer for: " + JSON.stringify(operation));
	}
});
