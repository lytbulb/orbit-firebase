import { Class } from 'orbit/lib/objects';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(path, listener){
		var splitPath = path.split("/");

		this.path = path;
		this.type = splitPath[0];
		this.recordId = splitPath[1];
		this.link = splitPath[2];
		this.listener = listener;
		this.linkType = listener._schemaUtils.modelTypeFor(this.type, this.link);
	},

	activate: function(){
		var _this = this;
		var listener = this.listener;
		var type = this.type;
		var recordId = this.recordId;
		var link = this.link;
		var options = this.options;
		var linkType = this.linkType;

		return listener._enableListener(this.path, "value", function(snapshot){
			var linkId = snapshot.val();

			return linkId ? _this._replaceLink(linkId) : _this._removeLink();
		});
	},

	_replaceLink: function(linkId){
		var listener = this.listener;
		var linkType = this.linkType;
		var options = this.options;
		var type = this.type;
		var link = this.link;
		var path = this.path;
		var recordId = this.recordId;
		var orbitPath = [type, recordId, '__rel', link].join("/");
		var replaceLinkOperation = new Operation({op: 'replace', path: orbitPath, value: linkId});

		return listener.subscribeToRecord(linkType, linkId, options).then(function(){
			listener._emitDidTransform(replaceLinkOperation);
		});
	},

	_removeLink: function(){
		var listener = this.listener;
		var type = this.type;
		var recordId = this.recordId;
		var link = this.link;
		var orbitPath = [type, recordId, '__rel', link].join("/");
		var removeLinkOperation = new Operation({op: 'remove', path: orbitPath});

		listener._emitDidTransform(removeLinkOperation);
	},

	update: function(){
		var _this = this;
		var listener = this.listener;
		var path = this.path;
		var linkType = this.linkType;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			return listener.subscribeToRecord(linkType, linkValue, _this.options);
		});
	}
});
