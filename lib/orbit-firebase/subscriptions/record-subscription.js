import Subscription from './subscription';
import Operation from 'orbit/operation';
import Orbit from 'orbit/main';
import { lookupTransformation } from 'orbit-firebase/transformations';

export default Subscription.extend({
	init: function(path, listener){
		this.path = path;
		this.listener = listener;
		var splitPath = this.path.split("/");
		this.type = splitPath[0];
		this.recordId = splitPath[1];
		this.modelSchema = listener._schemaUtils.modelSchema(this.type);
	},

	activate: function(){
		var _this = this;
		var listener = this.listener;
		var path = this.path;
		var type = this.type;
		var recordId = this.recordId;
		var modelSchema = this.modelSchema;
		var options = this.options;

		return listener._loadRecord(type, recordId).then(function(record){
			_this.subscribeToAttributes();
			_this.subscribeToLinks();
			_this.subscribeToRecordRemoved();
		});
	},

	subscribeToRecordRemoved: function(){
		var _this = this;
		var idPath = this.path + "/id";
		var listener = this.listener;

		listener._enableListener(idPath, "value", function(snapshot){
			if(!snapshot.val()){
				listener._emitDidTransform(new Operation({ op: 'remove', path: _this.path }));
			}
		});
	},

	subscribeToLinks: function(){
		var _this = this;

		this.options.currentIncludes().map(function(link){
			return _this.listener.subscribeToLink(_this.type, _this.recordId, link, _this.options.forLink(link));
		});
	},

	subscribeToAttributes: function(){
		var _this = this;
		var listener = this.listener;

		listener._enableListener(this.path, "child_changed", function(snapshot){
			var key = snapshot.key();
			var value = snapshot.val();

			if(_this._isAttribute(key)){
				_this._updateAttribute(key, value);
			}
		});
	},

	_removeRecord: function(){
		this.listener._emitDidTransform(new Operation({ op: 'remove', path: this.path }));
	},

	_updateAttribute: function(attribute, serialized){
		var model = this.type;
		var attrType = this.modelSchema.attributes[attribute].type;
		var transformation = lookupTransformation(attrType);
		var deserialized = transformation.deserialize(serialized);
		var attributePath = this.path + "/" + attribute;

		this.listener._emitDidTransform(new Operation({ op: 'replace', path: attributePath, value: deserialized }));
	},

	_isAttribute: function(key){
		return Object.keys(this.modelSchema.attributes).indexOf(key) !== -1;
	},

	update: function(){
		var listener = this.listener;
		var options = this.options;
		var splitPath = this.path.split("/");
		var type = splitPath[0];
		var recordId = splitPath[1];

		options.currentIncludes().map(function(link){
			return listener.subscribeToLink(type, recordId, link, options.forLink(link));
		});

		return Orbit.resolve();
	}
});
