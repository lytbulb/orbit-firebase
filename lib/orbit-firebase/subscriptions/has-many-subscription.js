import Subscription from './subscription';
import Operation from 'orbit/operation';
import { map, pluck, arrayToHash } from 'orbit-firebase/lib/array-utils';
import Orbit from 'orbit/main';

export default Subscription.extend({
	init: function(path, listener){
		var splitPath = path.split('/');

		this.path = path;
		this._listener = listener;
		this._type = splitPath[0];
		this._recordId = splitPath[1];
		this._link = splitPath[2];
		this._inverseLink = listener._schemaUtils.inverseLinkFor(this._type, this._link);
		this._linkType = listener._schemaUtils.modelTypeFor(this._type, this._link);
	},

	activate: function(){
		var _this = this;
		var listener = this._listener;
		var path = this.path;
		var type = this._type;
		var recordId = this._recordId;
		var link = this._link;
		var splitPath = path.split("/");
		var orbitPath = [splitPath[0], splitPath[1], '__rel', splitPath[2]].join("/");

		return this._addRecordListeners().then(function(allowedRecordIds){
			listener._emitDidTransform(new Operation({
				op: 'add',
				path: orbitPath,
				value: arrayToHash(allowedRecordIds, true)
			}));
		}).then(function(){
			listener._enableListener(path, "child_added", _this._recordAdded.bind(_this));
			listener._enableListener(path, "child_removed", _this._recordRemoved.bind(_this));
		});
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

		listener.subscribeToRecord(linkType, linkId, options).then(function(){
			listener._emitDidTransform(new Operation({
				op: 'add',
				path: [type, recordId, '__rel', link, linkId].join("/"),
				value: true
			}));
		});
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
		var path = this.path;
		var listener = this._listener;
		var linkType = this._linkType;
		var options = this._inverseLink ? this.options.addInclude(this._inverseLink) : this.options;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			var recordIds = Object.keys(linkValue||{});

			return listener.subscribeToRecords(linkType, recordIds, options).then(function(){
				return recordIds.filter(function(recordId){
					return listener.hasActiveSubscription([linkType, recordId].join("/"));
				});
			});
		});
	}
});
