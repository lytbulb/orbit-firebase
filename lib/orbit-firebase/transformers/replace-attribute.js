import { Class } from 'orbit/lib/objects';
import { lookupTransformation } from 'orbit-firebase/transformations';

export default Class.extend({
	init: function(firebaseClient, schema){
		this._firebaseClient = firebaseClient;
    this._schema = schema;
	},

	handles: function(operation){
		return ["replace", "add"].indexOf(operation.op) !== -1 && operation.path.length === 3 && !operation.path[2].match(/^__/);
	},

	transform: function(operation){
    var model = operation.path[0];
    var attr = operation.path[2];
    var value = operation.value;
    var attrType = this._schema.models[model].attributes[attr].type;
    var transformation = lookupTransformation(attrType);
    var serialized = transformation.serialize(value);

		return this._firebaseClient.set(operation.path, serialized);
	}
});
