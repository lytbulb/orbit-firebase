import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import { map } from 'orbit-firebase/lib/array-utils';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(path, listener){
		var splitPath = path.split('/');

		this._path = path;
		this._listener = listener;
		this._type = splitPath[0];
		this._recordId = splitPath[1];
		this._link = splitPath[2];
		this._linkType = listener._schemaUtils.modelTypeFor(this._type, this._link);
	},

	activate: function(){
		var listener = this._listener;
		var path = this._path;

		listener._enableListener(path, "child_added", this._recordAdded.bind(this));
		listener._enableListener(path, "child_removed", this._recordRemoved.bind(this));

		return this._addRecordListeners();
	},

	update: function(){
		return this._addRecordListeners();
	},

	_recordAdded: function(snapshot){
		var options = this.options;
		var type = this._type;
		var recordId = this._recordId;
		var link = this._link;
		var listener = this._listener;
		var linkType = this._linkType;
		var linkId = snapshot.key();

		listener.subscribeToRecord(linkType, linkId, options);

		listener._emitDidTransform(new Operation({
			op: 'add',
			path: [type, recordId, '__rel', link, linkId].join("/"),
			value: snapshot.val()
		}));
	},

	_recordRemoved: function(snapshot){
		var type = this._type;
		var	link = this._link;
		var recordId = this._recordId;
		var listener = this._listener;
		var	linkId = snapshot.key();

		listener._emitDidTransform(new Operation({
			op: 'remove',
			path: [type, recordId, '__rel', link, linkId].join("/")
		}));
	},

	_addRecordListeners: function(){
		var _this = this;
		var path = this._path;
		var listener = this._listener;
		var linkType = this._linkType;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			var recordIds = Object.keys(linkValue||{});

			var promises = map(recordIds, function(recordId){
				return listener.subscribeToRecord(linkType, recordId, _this.options);
			});

			return Orbit.all(promises);
		});
	},
});
