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
			path = this.path,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1],
			attribute = splitPath[2];

		this.mergeOptions(options);

		console.log("subscribing to attribute", [type, recordId, attribute].join("/"));

		return listener._enableListener(path, "value", function(snapshot){
			console.log("attribute updated", snapshot.val());
			listener._emitDidTransform(new Operation({ op: 'replace', path: path, value: snapshot.val() }));
		});
	},

	mergeOptions: function(options){
		this.options = options;
	},

	update: function(options){
		return Orbit.resolve();
	}
});