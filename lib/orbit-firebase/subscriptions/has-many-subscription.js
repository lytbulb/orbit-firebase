import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import { map } from 'orbit-firebase/lib/array-utils';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(path, listener){
		var splitPath = path.split('/');

		this.path = path;
		this.listener = listener;
		this.type = splitPath[0];
		this.recordId = splitPath[1];
		this.link = splitPath[2];
		this.linkType = listener._schemaUtils.modelTypeFor(this.type, this.link);
	},

	activate: function(){
		var _this = this;
		var listener = this.listener;
		var path = this.path;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){

			listener._enableListener(path, "child_added", _this._recordAdded.bind(_this));
			listener._enableListener(path, "child_removed", _this._recordRemoved.bind(_this));

			return _this._addRecordListeners();
		});
	},

	update: function(){
		return this._addRecordListeners();
	},

	_recordAdded: function(snapshot){
		var options = this.options;
		var type = this.type;
		var recordId = this.recordId;
		var link = this.link;
		var listener = this.listener;
		var linkType = this.linkType;
		var linkId = snapshot.key();

		listener.subscribeToRecord(linkType, linkId, options);

		listener._emitDidTransform(new Operation({
			op: 'add',
			path: [type, recordId, '__rel', link, linkId].join("/"),
			value: snapshot.val()
		}));
	},

	_recordRemoved: function(snapshot){
		var type = this.type;
		var	link = this.link;
		var recordId = this.recordId;
		var listener = this.listener;
		var	linkId = snapshot.key();

		listener._emitDidTransform(new Operation({
			op: 'remove',
			path: [type, recordId, '__rel', link, linkId].join("/")
		}));
	},

	_addRecordListeners: function(){
		var _this = this;
		var path = this.path;
		var listener = this.listener;
		var linkType = this.linkType;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			var promises = map(Object.keys(linkValue||[]), function(id){
				return listener.subscribeToRecord(linkType, id, _this.options).then(function(){
					console.log("subscription:subscribeToRecord", [linkType, id].join("/"));
				});
			});

			return Orbit.all(promises);
		});
	},
});
