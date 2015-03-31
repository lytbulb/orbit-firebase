import { Class, expose, isArray, isObject, isNone } from 'orbit/lib/objects';
import Evented from 'orbit/evented';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';
import Operation from 'orbit/operation';
import FirebaseClient from 'orbit-firebase/firebase-client';
import Orbit from 'orbit/main';
import { map } from 'orbit-firebase/lib/array-utils';

export default Class.extend({
	init: function(firebaseRef, schema, serializer){
		Evented.extend(this);

		this._firebaseRef = firebaseRef;
		this._firebaseClient = new FirebaseClient(this._firebaseRef);
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this._serializer = serializer;

		this._subscriptions = {};
	},

	subscribeToType: function(type){
		console.log("subscribing to type", type);
		var _this = this;
		var typeRef = this._firebaseRef.child('type');
		this._enableListener(type, 'child_added', function(snapshot){
			var record = snapshot.val();
			console.log("record added", record);
			_this.subscribeToRecord(type, record.id);
		});
	},

	subscribeToRecords: function(type, ids){
		var _this = this;
		ids.forEach(function(id){
			_this.subscribeToRecord(type, id);
		});
	},

	subscribeToRecord: function(type, id, options){
		console.log("subscribing to record", [type, id]);
		var _this = this;
		var modelSchema = this._schemaUtils.modelSchema(type);
		var path = [type, id].join("/");
		options = options || {};

		var recordPromise = this._enableListener(path, "value", function(snapshot){
			var value = snapshot.val();

			if(value){
				var deserializedRecord = _this._serializer.deserialize(type, id, snapshot.val());
				console.log("adding record", [type, id]);
				_this._emitDidTransform(new Operation({ op: 'add', path: path, value: deserializedRecord }) );
			} else {
				_this._emitDidTransform(new Operation({ op: 'remove', path: path }));
			}

		});

		var attributePromises = Object.keys(modelSchema.attributes).map(function(attribute){
			return _this._subscribeToAttribute(type, id, attribute);
		});

		var linkSubscriptionPromises = (options.include||[]).map(function(link){
			return _this._subscribeToLink(type, id, link);
		});

		return Orbit.all([
			recordPromise,
			Orbit.all(attributePromises),
			Orbit.all(linkSubscriptionPromises)
		]);
	},

	subscriptions: function(){
		return Object.keys(this._subscriptions);
	},

	unsubscribeAll: function(){
		var _this = this;
		Object.keys(this._subscriptions).forEach(function(listenerKey){
			var path = listenerKey.split(":")[0];
			var eventType = listenerKey.split(":")[1];
			var callback = _this._subscriptions[listenerKey];

			_this._disableListener(path, eventType, callback);
		});
	},

	_subscribeToAttribute: function(type, id, attribute){
		console.log("subscribing to attribute", [type, id, attribute].join("/"));
		var _this = this,
		path = [type, id, attribute].join("/");

		return this._enableListener(path, "value", function(snapshot){
			console.log("attribute updated", snapshot.val());
			_this._emitDidTransform(new Operation({ op: 'replace', path: path, value: snapshot.val() }));
		});
	},

	_subscribeToLink: function(type, id, link){
		console.log("subscribing to link", [type, id, link].join("/"));
		var _this = this;
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;

		if(linkType === 'hasOne'){
			return this._subscribeToHasOne(type, id, link);

		} else if (linkType === 'hasMany'){
			return this._subscribeToHasMany(type, id, link);

		} else {
			throw new Error("Unsupported link type: " + linkType);
		}
		
	},

	_subscribeToHasOne: function(type, id, link){
		var _this = this;
		var path = [type, id, link].join("/");

		this._firebaseClient.valueAt(path).then(function(linkValue){
			var linkType = _this._schemaUtils.modelTypeFor(type, link);
			_this.subscribeToRecord(linkType, linkValue);

			_this._enableListener(path, "value", function(snapshot){
				console.log("from hasOne", snapshot.val());

				var key = snapshot.key(),
					value = snapshot.val();

				if(value){
					_this._emitDidTransform(new Operation({ 
						op: 'replace', 
						path: [type, id, '__rel', link].join("/"), 
						value: value 
					}));
					
				} else {
					_this._emitDidTransform(new Operation({ 
						op: 'remove', 
						path: [type, id, '__rel', link].join("/")
					}));

				}
			});
		});
	},

	_subscribeToHasMany: function(type, id, link){
		var _this = this;
		var path = [type, id, link].join("/");

		return this._firebaseClient.valueAt(path).then(function(linkValue){
			var linkType = _this._schemaUtils.modelTypeFor(type, link);
			var subscribeToRecordPromises = map(Object.keys(linkValue||[]), function(id){
				return _this.subscribeToRecord(linkType, id);
			});

			_this._enableListener(path, "child_added", function(snapshot){
				console.log("child_added to hasMany", snapshot.val());
				var id = snapshot.key();
				_this.subscribeToRecord(linkType, id);
				_this._emitDidTransform(new Operation({ 
					op: 'add', 
					path: [type, id, '__rel', link, snapshot.key()].join("/"), 
					value: snapshot.val() 
				}));
			});

			_this._enableListener(path, "child_removed", function(snapshot){
				console.log("child_remove from hasMany", snapshot.val());
				_this._emitDidTransform(new Operation({
					op: 'remove',
					path: [type, id, '__rel', link, snapshot.key()].join("/")
				}));
			});

			return subscribeToRecordPromises;
		});

	},

	_emitDidTransform: function(operation){
		console.log("emitting", operation.serialize());
		this.emit("didTransform", operation);
	},

	_enableListener: function(path, eventType, callback){
		var _this = this;
		path = (typeof path === 'string') ? path : path.join('/');
		var key = this._buildListenerKey(path, eventType);
		console.log("enabling listener", key);

		if(this._listenerExists(key)) return;

		this._subscriptions[key] = callback;

		return new Orbit.Promise(function(resolve, reject){
			_this._firebaseRef.child(path).on(eventType, function(){
				callback.apply(_this, arguments);
				resolve();
			});
		});
	},

	_disableListener: function(path, eventType, callback){
		this._firebaseRef.child(path).off(eventType, callback);
	},

	_listenerExists: function(key){
		return this._subscriptions[key];
	},

	_buildListenerKey: function(path, eventType){
		return [path, eventType].join(":");
	},

	_normalizePath: function(path) {
		return (typeof path === 'string') ? path.split("/") : path;
	}
});
