import Subscription from './subscription';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';
import { lookupTransformation } from 'orbit-firebase/transformations';

export default Subscription.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
		this.schema = listener._schema;
	},

	activate: function(){
		var _this = this,
			listener = this.listener,
			path = this.path,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1],
			attribute = splitPath[2];

		return listener._enableListener(path, "value", function(snapshot){
			var splitPath = path.split('/');
			var model = splitPath[0];
			var attribute = splitPath[2];
			var attrType = _this.schema.models[model].attributes[attribute].type;
			var transformation = lookupTransformation(attrType);
			var serialized = snapshot.val();
			var deserialized = transformation.deserialize(serialized);

			listener._emitDidTransform(new Operation({ op: 'replace', path: path, value: deserialized }));
		});
	},

	update: function(){
		return Orbit.resolve();
	}
});
