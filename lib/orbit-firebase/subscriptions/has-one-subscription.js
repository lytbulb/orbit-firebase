import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';

export default Class.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
		this.options = {};
	},

	activate: function(options){
		var listener = this.listener,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1],
			link = splitPath[2];
			console.log("activating", this.path);

		this.mergeOptions(options);

		return listener._enableListener(this.path, "value", function(snapshot){
			console.log("change hasOne value received", snapshot.key());
			var linkType = listener._schemaUtils.modelTypeFor(type, link);
			var linkValue = snapshot.val();

			if(linkValue){
				listener.subscribeToRecord(linkType, linkValue);
				listener._emitDidTransform(new Operation({
					op: 'replace',
					path: [type, recordId, '__rel', link].join("/"),
					value: linkValue
				}));

			} else {
				listener._emitDidTransform(new Operation({
					op: 'remove',
					path: [type, recordId, '__rel', link].join("/")
				}));

			}
		});
	},

	mergeOptions: function(options){
		this.options = options;
	},

	update: function(options){
		return Orbit.resolve();
	}
});
