import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import { map } from 'orbit-firebase/lib/array-utils';

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
			link = splitPath[2];

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			var linkType = listener._schemaUtils.modelTypeFor(type, link);
			var subscribeToRecordPromises = map(Object.keys(linkValue||[]), function(id){
				return listener.subscribeToRecord(linkType, id);
			});

			console.log("adding has many listeners to", path);
			listener._enableListener(path, "child_added", function(snapshot){
				console.log("child_added to hasMany", snapshot.val());
				var linkId = snapshot.key();
				listener.subscribeToRecord(linkType, linkId);
				listener._emitDidTransform(new Operation({
					op: 'add',
					path: [type, recordId, '__rel', link, linkId].join("/"),
					value: snapshot.val()
				}));
			});

			listener._enableListener(path, "child_removed", function(snapshot){
				console.log("child_remove from hasMany", snapshot.val());
				var linkId = snapshot.key();
				listener._emitDidTransform(new Operation({
					op: 'remove',
					path: [type, recordId, '__rel', link, snapshot.key()].join("/")
				}));
			});

			return subscribeToRecordPromises;
		});
	}
});
