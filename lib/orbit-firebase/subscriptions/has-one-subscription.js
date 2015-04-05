import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
	},

	activate: function(){
		var listener = this.listener,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1],
			link = splitPath[2],
			options = this.options;
			console.log("activating", this.path);

		return listener._enableListener(this.path, "value", function(snapshot){
			console.log("change hasOne value received", snapshot.key());
			var linkType = listener._schemaUtils.modelTypeFor(type, link);
			var linkValue = snapshot.val();

			if(linkValue){
				var promise = listener.subscribeToRecord(linkType, linkValue, options);

				listener._emitDidTransform(new Operation({
					op: 'replace',
					path: [type, recordId, '__rel', link].join("/"),
					value: linkValue
				}));

				return promise;

			} else {
				listener._emitDidTransform(new Operation({
					op: 'remove',
					path: [type, recordId, '__rel', link].join("/")
				}));

			}
		});
	},

	update: function(){
		return Orbit.resolve();
	}
});
