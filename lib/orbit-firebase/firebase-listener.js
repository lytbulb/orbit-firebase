import { Class, expose, isArray, isObject, isNone } from 'orbit/lib/objects';
import Evented from 'orbit/evented';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';
import Operation from 'orbit/operation';
import FirebaseClient from 'orbit-firebase/firebase-client';
import Orbit from 'orbit/main';
import { map } from 'orbit-firebase/lib/array-utils';
import RecordSubscription from './subscriptions/record-subscription';
import AttributeSubscription from './subscriptions/attribute-subscription';
import HasManySubscription from './subscriptions/has-many-subscription';
import HasOneSubscription from './subscriptions/has-one-subscription';

export default Class.extend({
	init: function(firebaseRef, schema, serializer){
		Evented.extend(this);

		this._firebaseRef = firebaseRef;
		this._firebaseClient = new FirebaseClient(this._firebaseRef);
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this._serializer = serializer;

		this._listeners = {};
		this._subscriptions = {};
	},

	subscribeToType: function(type, options){
		console.log("subscribing to type", type);
		var _this = this;
		var typeRef = this._firebaseRef.child('type');
		options = options || {};

		this._enableListener(type, 'child_added', function(snapshot){
			var record = snapshot.val();
			console.log("record added", record);
			_this.subscribeToRecord(type, record.id, options);
		});
	},

	subscribeToRecords: function(type, ids, options){
		var _this = this;
		var promises = map(ids, function(id){
			return _this.subscribeToRecord(type, id, options);
		});

		return Orbit.all(promises);
	},

	subscribeToRecord: function(type, id, options){
		var path = [type, id].join("/");
		var subscription = this._findSubscription(path);

		if(subscription){
			return Promise.resolve();
		}
		else {
			subscription = new RecordSubscription(path, this);
			this._addSubscription(subscription);
			return subscription.activate(options).then(function(){
				console.log("returned subscription", path);
			});
		}
	},

	subscriptions: function(){
		return Object.keys(this._listeners);
	},

	unsubscribeAll: function(){
		var _this = this;
		Object.keys(this._listeners).forEach(function(listenerKey){
			var path = listenerKey.split(":")[0];
			var eventType = listenerKey.split(":")[1];
			var callback = _this._listeners[listenerKey];

			_this._disableListener(path, eventType, callback);
		});
	},

	_subscribeToAttribute: function(type, id, attribute){
		var path = [type, id, attribute].join("/");
		var subscription = this._findSubscription(path);

		if(subscription){
			return Promise.resolve();
		}
		else {
			subscription = new AttributeSubscription(path, this);
			this._addSubscription(subscription);
			return subscription.activate();
		}
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
		console.log("subscribing to hasOne", arguments);
		var _this = this;
		var path = [type, id, link].join("/");

		var subscription = this._findSubscription(path);

		if(subscription){
			return Promise.resolve();
		}
		else {
			subscription = new HasOneSubscription(path, _this);
			_this._addSubscription(subscription);
			return subscription.activate();
		}
	},

	_addSubscription: function(path, subscription){
		this._subscriptions[path] = subscription;
	},

	_findSubscription: function(path){
		return this._subscriptions[path];
	},

	_subscribeToHasMany: function(type, id, link){
		var _this = this;
		var path = [type, id, link].join("/");

		var subscription = this._findSubscription(path);

		if(subscription){
			return Promise.resolve();
		}
		else {
			subscription = new HasManySubscription(path, _this);
			_this._addSubscription(subscription);
			return subscription.activate();
		}
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

		if(this._listenerExists(key)) return Orbit.resolve();

		return new Orbit.Promise(function(resolve, reject){
			var wrappedCallback = function(){
				callback.apply(_this, arguments);
				resolve();
			};

			_this._listeners[key] = wrappedCallback;
			_this._firebaseRef.child(path).on(eventType, wrappedCallback);
		});
	},

	_disableListener: function(path, eventType, callback){
		this._firebaseRef.child(path).off(eventType, callback);
	},

	_listenerExists: function(key){
		return this._listeners[key];
	},

	_buildListenerKey: function(path, eventType){
		return [path, eventType].join(":");
	},

	_normalizePath: function(path) {
		return (typeof path === 'string') ? path.split("/") : path;
	}
});
