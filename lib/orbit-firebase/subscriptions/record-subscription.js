import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
		this.options = {};
	},

	activate: function(options){
		var listener = this.listener,
			path = this.path,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1];
		console.log("subscribing to record", [type, recordId]);

		this.mergeOptions(options);

		var modelSchema = listener._schemaUtils.modelSchema(type);
		options = options || {};

		var recordPromise = listener._enableListener(path, "value", function(snapshot){
			var value = snapshot.val();

			if(value){
				var deserializedRecord = listener._serializer.deserialize(type, recordId, snapshot.val());
				listener._emitDidTransform(new Operation({ op: 'add', path: path, value: deserializedRecord }) );
			} else {
				listener._emitDidTransform(new Operation({ op: 'remove', path: path }));
			}

		});

		var attributePromises = Object.keys(modelSchema.attributes).map(function(attribute){
			return listener._subscribeToAttribute(type, recordId, attribute);
		});

		var linkSubscriptionPromises = (options.include||[]).map(function(link){
			return listener._subscribeToLink(type, recordId, link);
		});

		return Orbit.all([
			recordPromise,
			Orbit.all(attributePromises),
			Orbit.all(linkSubscriptionPromises)
		]);
	},

	mergeOptions: function(options){
		this.options = options;
	},

	update: function(options){
		return Orbit.resolve();
	}
});
