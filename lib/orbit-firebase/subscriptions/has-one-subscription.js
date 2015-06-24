import Subscription from './subscription';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';

export default Subscription.extend({
	init: function(path, listener){
		var splitPath = path.split("/");

		this.path = path;
		this._type = splitPath[0];
		this._recordId = splitPath[1];
		this._link = splitPath[2];
		// this._inverseLink = listener._schemaUtils.inverseLinkFor(this._type, this._link);
		this._listener = listener;
		this._linkType = listener._schemaUtils.modelTypeFor(this._type, this._link);
	},

	activate: function(){
		var _this = this;
		var listener = this._listener;
		var type = this._type;
		var recordId = this._recordId;
		var link = this._link;
		var options = this.options;
		var linkType = this._linkType;

		return listener._enableListener(this.path, "value", function(snapshot){
			var linkId = snapshot.val();

			return linkId ? _this._replaceLink(linkId) : _this._removeLink();
		});
	},

	update: function(){
		var _this = this;
		var listener = this._listener;
		var path = this.path;
		var linkType = this._linkType;

		return listener._firebaseClient.valueAt(path).then(function(linkValue){
			return listener.subscribeToRecord(linkType, linkValue, _this.options);
		});
	},

	_replaceLink: function(linkId){
		var _this = this;
		var listener = this._listener;
		var linkType = this._linkType;
		var options = this.options;
		var type = this._type;
		var link = this._link;
		var path = this.path;
		var recordId = this._recordId;
		var orbitPath = [type, recordId, '__rel', link].join("/");

		return listener.subscribeToRecord(linkType, linkId, options).then(function(subscription){
			if(subscription.status === "permission_denied") return;
			_this._emitOperation(orbitPath, linkId);
		});
	},

	_removeLink: function(){
		var listener = this._listener;
		var type = this._type;
		var recordId = this._recordId;
		var link = this._link;
		var orbitPath = [type, recordId, '__rel', link].join("/");

		this._emitOperation(orbitPath, null);
	},

	_emitOperation: function(path, value){
		var op = this.linkInitialized ? 'replace' : 'add';
		this.linkInitialized = true;
		this._listener._emitDidTransform(new Operation({op: op, path: path, value: value||null}));
	}
});
