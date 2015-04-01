import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';

export default Class.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
	},

	activate: function(){
		var listener = this.listener,
			path = this.path,
			splitPath = this.path.split("/"),
			type = splitPath[0],
			recordId = splitPath[1],
			attribute = splitPath[2];

		console.log("subscribing to attribute", [type, recordId, attribute].join("/"));

		return listener._enableListener(path, "value", function(snapshot){
			console.log("attribute updated", snapshot.val());
			listener._emitDidTransform(new Operation({ op: 'replace', path: path, value: snapshot.val() }));
		});
	}
});
