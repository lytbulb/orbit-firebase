import Subscription from './subscription';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';

export default Subscription.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
	},

	activate: function(){
		var listener = this.listener;
		var path = this.path;
		var splitPath = this.path.split("/");
		var type = splitPath[0];
		var recordId = splitPath[1];
		var modelSchema = listener._schemaUtils.modelSchema(type);
		var options = this.options;

		return listener._enableListener(path, "value", function(snapshot){
			var value = snapshot.val();

			if(value){
				var deserializedRecord = listener._serializer.deserialize(type, recordId, snapshot.val());
				listener._emitDidTransform(new Operation({ op: 'add', path: path, value: deserializedRecord }) );
			} else {
				listener._emitDidTransform(new Operation({ op: 'remove', path: path }));
			}

			Object.keys(modelSchema.attributes).map(function(attribute){
				return listener._subscribeToAttribute(type, recordId, attribute);
			});

			options.currentIncludes().map(function(link){
				return listener.subscribeToLink(type, recordId, link, options.forLink(link));
			});

		});
	},

	update: function(){
		var listener = this.listener;
		var options = this.options;
		var splitPath = this.path.split("/");
		var type = splitPath[0];
		var recordId = splitPath[1];

		options.currentIncludes().map(function(link){
			return listener.subscribeToLink(type, recordId, link, options.forLink(link));
		});

		return Orbit.resolve();
	}
});
